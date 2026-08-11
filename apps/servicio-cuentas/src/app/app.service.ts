import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import {
  CuentaDto,
  TicketDto,
  AbrirCuentaCommand,
  CerrarCuentaCommand,
  DividirCuentaCommand,
  CuentaEstado,
  RoutingKeys,
  CuentaCerradaPayload,
  TicketGeneradoPayload,
  PedidoActualizadoPayload,
  PedidoCreadoPayload,
  PagoRegistradoPayload,
  PedidoSnapshot,
  PedidoSnapshotItem,
  PedidoEstado,
} from '@org/contracts';
import { Prisma } from '../generated/prisma';
import { resolveSedeId, SEDE_PRINCIPAL_ID } from '@org/shared-auth';
import { v4 as uuidv4 } from 'uuid';

const ESTADOS_NO_COBRABLES = new Set<PedidoEstado>([
  PedidoEstado.Cancelado,
  PedidoEstado.RechazadoSinStock,
]);

type CuentaRecord = {
  id: string;
  mesaId: string;
  sedeId: string;
  pedidos: unknown;
  total: Prisma.Decimal | number | string;
  estado: CuentaEstado;
  ticket?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DivisionCuentaResult =
  | { metodo: 'IGUALES'; partes: { parte: number; monto: number }[] }
  | { metodo: 'POR_ITEMS'; partes: { comensal: number; monto: number }[] };

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async listarCuentas(): Promise<{ cuentas: CuentaDto[] }> {
    const cuentas = await this.prisma.cuenta.findMany({
      orderBy: { createdAt: 'desc' },
      // Tope de seguridad (hallazgo pruebas de carga 2026-07-13): listado sin
      // límite + snapshots JSON de pedidos por fila = respuestas multi-MB bajo
      // carga. 200 cubre de sobra las cuentas activas de un restobar real.
      // ponytail: cap fijo; paginación cursor+limit real pendiente (task chip).
      take: 200,
    });
    return {
      cuentas: cuentas.map(c => ({
        id: c.id,
        mesaId: c.mesaId,
        sedeId: c.sedeId,
        pedidos: this.parsePedidosSnapshot(c.pedidos),
        total: Number(c.total),
        estado: c.estado,
        ticket: c.ticket,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }))
    };
  }

  async abrirCuenta(
    command: AbrirCuentaCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    origen: 'manual' | 'fallback' = 'manual',
  ): Promise<{ message: string; cuenta: CuentaDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const cuenta = await this.prisma.$transaction(async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${command.mesaId}), 1, 8))::bit(32)::int)`;
      const cuentaExistente = await prisma.cuenta.findFirst({
        where: { mesaId: command.mesaId, estado: CuentaEstado.Abierta }
      });

      if (cuentaExistente) {
        if (origen === 'fallback') return cuentaExistente;
        throw new BadRequestException('La mesa ya tiene una cuenta abierta.');
      }

      const c = await prisma.cuenta.create({
        data: {
          mesaId: command.mesaId,
          sedeId,
          estado: CuentaEstado.Abierta,
          pedidos: [],
          total: 0
        }
      });

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.CuentaAbierta,
          payload: JSON.stringify({
            cuentaId: c.id,
            mesaId: c.mesaId,
            sedeId: c.sedeId,
            origen,
          }),
          status: 'PENDING',
        }
      });

      return c;
    });

    this.logger.log({
      operation: 'abrirCuenta',
      aggregateId: cuenta.id,
      message: `Cuenta abierta para la mesa ${command.mesaId} (origen: ${origen}).`,
    } satisfies OperableLog);
    return { message: 'Cuenta abierta exitosamente', cuenta: this.mapToDto(cuenta) };
  }

  // A2+M5: idempotencia + advisory lock + recompute Decimal
  async procesarPedidoCreado(payload: PedidoCreadoPayload): Promise<void> {
    const pedidoDto = payload.pedido;
    if (!pedidoDto?.mesaId || !pedidoDto.id) {
      this.logger.warn({
        operation: 'procesarPedidoCreado',
        errorCode: 'PAYLOAD_INVALIDO',
        message: 'Evento PedidoCreado sin mesaId/id — ignorado.',
      } satisfies OperableLog);
      return;
    }

    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: `pedido.creado:${pedidoDto.id}` } });
      // M5: advisory lock por mesa (serializa pedidos concurrentes a la misma cuenta)
      // classid 1234 compartido entre servicios A PROPOSITO: cada servicio tiene su propia BD (database-per-service), el espacio de locks no se cruza.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${pedidoDto.mesaId}), 1, 8))::bit(32)::int)`;

      let cuenta = await prisma.cuenta.findFirst({
        where: { mesaId: pedidoDto.mesaId, estado: CuentaEstado.Abierta },
      });

      const origenCuentaAbierta = cuenta ? 'reconciliacion-pedido' : 'fallback';

      if (cuenta && pedidoDto.sedeId && cuenta.sedeId !== pedidoDto.sedeId) {
        this.logger.warn({
          operation: 'procesarPedidoCreado',
          aggregateId: cuenta.id,
          errorCode: 'SEDE_INCONSISTENTE',
          message: `La cuenta ${cuenta.id} (sede ${cuenta.sedeId}) recibió un pedido de la sede ${pedidoDto.sedeId}.`,
        } satisfies OperableLog);
      }

      // Fallback INLINE (misma tx): crea cuenta + reemite CuentaAbierta.
      // T-23 Fase 2: sedeId viene del pedido (evento) — sin contexto de
      // usuario aquí. Un pedido de un productor pre-multi-sede (sin sedeId
      // en el payload) cae a Sede Principal.
      if (!cuenta) {
        const sedeId = pedidoDto.sedeId ?? SEDE_PRINCIPAL_ID;
        if (!pedidoDto.sedeId) {
          this.logger.warn({
            operation: 'procesarPedidoCreado',
            aggregateId: pedidoDto.id,
            errorCode: 'EVENTO_SIN_SEDE',
            message: 'Evento PedidoCreado sin sedeId; se asigna Sede Principal.',
          } satisfies OperableLog);
        }
        cuenta = await prisma.cuenta.create({
          data: { mesaId: pedidoDto.mesaId, sedeId, estado: CuentaEstado.Abierta, pedidos: [], total: 0 },
        });
      }

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.CuentaAbierta,
          payload: JSON.stringify({
            cuentaId: cuenta.id,
            mesaId: cuenta.mesaId,
            sedeId: cuenta.sedeId,
            origen: origenCuentaAbierta,
          }),
          status: 'PENDING',
        },
      });

      const snapshot = this.parsePedidosSnapshot(cuenta.pedidos);

      // A2: dedup por pedido.id — una reentrega no duplica el cobro
      if (snapshot.some((p) => p.id === pedidoDto.id)) {
        this.logger.warn({
          operation: 'procesarPedidoCreado',
          aggregateId: cuenta.id,
          idempotencyKey: pedidoDto.id,
          message: 'Pedido ya está en la cuenta — reentrega ignorada (idempotente).',
        } satisfies OperableLog);
        return;
      }

      snapshot.push(pedidoDto);

      // A3: recompute del total desde el array, con Decimal (no increment ciego)
      const total = snapshot
        .filter((p) => !ESTADOS_NO_COBRABLES.has(p.estado))
        .reduce(
        (acc: Prisma.Decimal, p) => acc.plus(new Prisma.Decimal(p.total ?? 0)),
        new Prisma.Decimal(0),
      );

      await prisma.cuenta.update({
        where: { id: cuenta.id },
        data: { total, pedidos: snapshot },
      });
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarPedidoCreado',
          aggregateId: pedidoDto.id,
          message: 'Evento PedidoCreado ya procesado — idempotente.',
        } satisfies OperableLog);
        return;
      }
      throw e;
    }

    this.logger.log({
      operation: 'procesarPedidoCreado',
      aggregateId: pedidoDto.id,
      message: `Pedido consolidado en cuenta de mesa ${pedidoDto.mesaId}.`,
    } satisfies OperableLog);
  }

  // A2+M5: idempotencia + advisory lock + recompute Decimal para actualizaciones
  async procesarPedidoActualizado(payload: PedidoActualizadoPayload): Promise<void> {
    const pedidoDto = payload.pedido;
    if (!pedidoDto?.mesaId) return;

    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: `pedido.actualizado:${pedidoDto.id}:${pedidoDto.estado}` } });
        // M5: advisory lock por mesa
      // classid 1234 compartido entre servicios A PROPOSITO: cada servicio tiene su propia BD (database-per-service), el espacio de locks no se cruza.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${pedidoDto.mesaId}), 1, 8))::bit(32)::int)`;

      const cuenta = await prisma.cuenta.findFirst({
        where: { mesaId: pedidoDto.mesaId, estado: CuentaEstado.Abierta },
      });
      if (!cuenta) return;

      const snapshot = this.parsePedidosSnapshot(cuenta.pedidos);
      const index = snapshot.findIndex((p) => p.id === pedidoDto.id);

      if (index >= 0) {
        snapshot[index] = pedidoDto;
      } else {
        snapshot.push(pedidoDto);
      }

      // A3: recompute total con Decimal desde el snapshot actualizado
      const total = snapshot
        .filter((p) => !ESTADOS_NO_COBRABLES.has(p.estado))
        .reduce(
        (acc: Prisma.Decimal, p) => acc.plus(new Prisma.Decimal(p.total ?? 0)),
        new Prisma.Decimal(0),
      );

      await prisma.cuenta.update({
        where: { id: cuenta.id },
        data: { total, pedidos: snapshot },
      });
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarPedidoActualizado',
          aggregateId: pedidoDto.id,
          message: 'Evento PedidoActualizado ya procesado — idempotente.',
        } satisfies OperableLog);
        return;
      }
      throw e;
    }

    this.logger.log({
      operation: 'procesarPedidoActualizado',
      aggregateId: pedidoDto.id,
      resultingState: pedidoDto.estado,
      message: `Snapshot de pedido actualizado en cuenta de mesa ${pedidoDto.mesaId}.`,
    } satisfies OperableLog);
  }

  async procesarPagoRegistrado(payload: PagoRegistradoPayload): Promise<void> {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: { id: payload.cuentaId },
    });

    if (!cuenta) {
      this.logger.warn({
        operation: 'procesarPagoRegistrado',
        aggregateId: payload.cuentaId,
        errorCode: 'CUENTA_NO_ENCONTRADA',
        message: 'Cuenta no encontrada — evento PagoRegistrado ignorado.',
      } satisfies OperableLog);
      return;
    }

    if (cuenta.estado !== CuentaEstado.Abierta) {
      this.logger.warn({
        operation: 'procesarPagoRegistrado',
        aggregateId: payload.cuentaId,
        resultingState: cuenta.estado,
        message: `Cuenta ya está ${cuenta.estado} — evento PagoRegistrado ignorado.`,
      } satisfies OperableLog);
      return;
    }

    // T-16 (pagos divididos): un pago parcial no cierra la cuenta — solo el
    // pago que la deja en 0 pendiente dispara el cierre automático aquí.
    if (payload.pendiente > 0.01) {
      this.logger.log({
        operation: 'procesarPagoRegistrado',
        aggregateId: payload.cuentaId,
        resultingState: 'ABIERTA',
        message: `Pago parcial registrado (transacción ${payload.transaccionId}); cuenta sigue abierta, pendiente ${payload.pendiente}.`,
      } satisfies OperableLog);
      return;
    }

    await this.cerrarCuenta(cuenta.id, {});
    this.logger.log({
      operation: 'procesarPagoRegistrado',
      aggregateId: cuenta.id,
      resultingState: 'CERRADA',
      message: 'Cuenta cerrada automáticamente por evento PagoRegistrado.',
    } satisfies OperableLog);
  }

  async obtenerCuenta(id: string): Promise<CuentaDto> {
    const cuenta = await this.prisma.cuenta.findUnique({ where: { id } });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
    }

    return this.mapToDto(cuenta);
  }

  async obtenerCuentaPorMesa(mesaId: string): Promise<CuentaDto> {
    const cuenta = await this.prisma.cuenta.findFirst({
      where: { mesaId, estado: CuentaEstado.Abierta }
    });
    if (!cuenta) {
      throw new NotFoundException(`No hay cuenta abierta para la mesa ${mesaId}`);
    }
    return this.obtenerCuenta(cuenta.id);
  }

  async cerrarCuenta(id: string, command: CerrarCuentaCommand): Promise<{ message: string; ticket: TicketDto }> {
    const cierre = await this.prisma.$transaction(async (prisma) => {
      const cuentaBase = await prisma.cuenta.findUnique({ where: { id } });
      if (!cuentaBase) throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${cuentaBase.mesaId}), 1, 8))::bit(32)::int)`;
      
      const cuenta = await prisma.cuenta.findUnique({ where: { id } });
      if (!cuenta) {
        throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
      }

      if (cuenta.estado !== CuentaEstado.Abierta) {
        throw new BadRequestException(`La cuenta no está abierta. Estado actual: ${cuenta.estado}`);
      }

      const pedidos = this.parsePedidosSnapshot(cuenta.pedidos);

      if (pedidos.length === 0) {
        throw new BadRequestException('La cuenta no tiene pedidos.');
      }

      // A3: aritmética Decimal para el cierre
      const subtotal = new Prisma.Decimal(cuenta.total);
      const descuento = new Prisma.Decimal(command.descuento ?? 0);
      const total = Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.minus(descuento));
      const ticketId = uuidv4();

      const cuentaActualizada = await prisma.cuenta.updateMany({
        where: { id, estado: CuentaEstado.Abierta },
        data: {
          estado: CuentaEstado.Cerrada,
          total,
          ticket: ticketId,
        }
      });

      if (cuentaActualizada.count !== 1) {
        throw new BadRequestException('La cuenta ya fue cerrada por otra operación concurrente.');
      }

      const allItems = pedidos.flatMap((p) => p.items || []);
      const mappedItems = allItems.map((item) => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitario: Number(item.precioUnitario || 0)
      }));
      const meseroCuenta = this.obtenerMeseroCuenta(pedidos);

      const cuentaCerradaPayload: CuentaCerradaPayload = {
        cuentaId: id,
        mesaId: cuenta.mesaId,
        sedeId: cuenta.sedeId,
        total: total.toNumber(),
        items: mappedItems,
        ...meseroCuenta,
      };

      const ticketGeneradoPayload: TicketGeneradoPayload = {
        ticketId,
        cuentaId: id,
      };

      await prisma.outboxEvent.createMany({
        data: [
          {
            routingKey: RoutingKeys.CuentaCerrada,
            payload: JSON.stringify(cuentaCerradaPayload),
            status: 'PENDING',
          },
          {
            routingKey: RoutingKeys.TicketGenerado,
            payload: JSON.stringify(ticketGeneradoPayload),
            status: 'PENDING',
          }
        ]
      });

      return { cuenta, pedidos, subtotal, descuento, total, ticketId };
    });

    const ticket: TicketDto = {
      id: cierre.ticketId,
      cuentaId: id,
      mesaId: cierre.cuenta.mesaId,
      items: cierre.pedidos.flatMap((p) => p.items || []),
      subtotal: cierre.subtotal.toNumber(),
      descuento: cierre.descuento.toNumber(),
      total: cierre.total.toNumber(),
      fecha: new Date().toISOString()
    };

    this.logger.log({
      operation: 'cerrarCuenta',
      aggregateId: id,
      resultingState: 'CERRADA',
      message: `Cuenta cerrada. Ticket ${cierre.ticketId} generado. Total: S/ ${cierre.total.toNumber()}.`,
    } satisfies OperableLog);

    return { message: 'Cuenta cerrada exitosamente', ticket };
  }

  async dividirCuenta(id: string, command: DividirCuentaCommand): Promise<DivisionCuentaResult> {
    const cuenta = await this.obtenerCuenta(id);
    const pedidos = cuenta.pedidos;

    if (!pedidos || pedidos.length === 0) {
      throw new BadRequestException('La cuenta no tiene pedidos para dividir.');
    }

    if (command.metodo === 'IGUALES') {
      const numPartes = command.numPartes || 1;
      // A3: aritmética Decimal para la división
      const montoPorParte = new Prisma.Decimal(cuenta.total).dividedBy(numPartes).toNumber();
      return {
        metodo: 'IGUALES',
        partes: new Array(numPartes).fill(0).map((_, i) => ({
          parte: i + 1,
          monto: montoPorParte
        }))
      };
    }

    if (command.metodo === 'POR_ITEMS') {
      const partes: Record<number, number> = {};
      const allItems = pedidos.flatMap((p) => p.items || []);
      allItems.forEach((item) => {
        const comensal = item.comensal ?? item.identificadorComensal ?? 1;
        // A3: aritmética Decimal por ítem
        const subtotal = new Prisma.Decimal(item.precioUnitario).times(item.cantidad);
        partes[comensal] = new Prisma.Decimal(partes[comensal] ?? 0).plus(subtotal).toNumber();
      });

      return {
        metodo: 'POR_ITEMS',
        partes: Object.entries(partes).map(([comensal, monto]) => ({
          comensal: Number(comensal),
          monto
        }))
      };
    }

    throw new BadRequestException('Método de división no soportado');
  }

  private mapToDto(c: CuentaRecord): CuentaDto {
    const pedidos = this.parsePedidosSnapshot(c.pedidos);
    return {
      id: c.id,
      mesaId: c.mesaId,
      sedeId: c.sedeId,
      pedidos,
      total: Number(c.total),
      estado: c.estado,
      ticket: c.ticket,
      createdAt: this.requireDate(c.createdAt, 'createdAt', c.id).toISOString(),
      updatedAt: this.requireDate(c.updatedAt, 'updatedAt', c.id).toISOString(),
      // Para auditoría de caja (quién atendió la venta, no solo quién cobró):
      // caja lee esto de fetchCuenta() y lo denormaliza en la Transaccion.
      ...this.obtenerMeseroCuenta(pedidos),
    };
  }

  private obtenerMeseroCuenta(pedidos: PedidoSnapshot[]): { meseroId?: string; meseroNombre?: string } {
    const porMesero = new Map<string, { meseroNombre?: string; total: number; pedidos: number }>();

    for (const pedido of pedidos) {
      const meseroId = typeof pedido?.meseroId === 'string' ? pedido.meseroId.trim() : '';
      if (!meseroId) continue;

      const actual = porMesero.get(meseroId) ?? { total: 0, pedidos: 0 };
      actual.total += Number(pedido.total ?? 0);
      actual.pedidos += 1;
      actual.meseroNombre = actual.meseroNombre ?? pedido.meseroNombre ?? meseroId;
      porMesero.set(meseroId, actual);
    }

    const ganador = Array.from(porMesero.entries()).sort(([, a], [, b]) => {
      const porTotal = b.total - a.total;
      return porTotal === 0 ? b.pedidos - a.pedidos : porTotal;
    })[0];

    if (!ganador) return {};
    const [meseroId, data] = ganador;
    return { meseroId, meseroNombre: data.meseroNombre ?? meseroId };
  }

  private parsePedidosSnapshot(value: unknown): PedidoSnapshot[] {
    const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    if (!Array.isArray(parsed)) return [];

    return parsed.map((pedido, index) => {
      if (!this.isPedidoSnapshot(pedido)) {
        throw new BadRequestException(`Snapshot de pedido invalido en posicion ${index}`);
      }
      return pedido;
    });
  }

  private isPedidoSnapshot(value: unknown): value is PedidoSnapshot {
    if (!value || typeof value !== 'object') return false;
    const pedido = value as Record<string, unknown>;
    return (
      typeof pedido.id === 'string' &&
      typeof pedido.mesaId === 'string' &&
      Array.isArray(pedido.items) &&
      pedido.items.every((item) => this.isPedidoSnapshotItem(item)) &&
      typeof pedido.total === 'number' &&
      typeof pedido.estado === 'string'
    );
  }

  private isPedidoSnapshotItem(value: unknown): value is PedidoSnapshotItem {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    return (
      typeof item.productoId === 'string' &&
      typeof item.cantidad === 'number' &&
      typeof item.precioUnitario === 'number' &&
      (item.nombre == null || typeof item.nombre === 'string')
    );
  }

  private requireDate(value: unknown, field: 'createdAt' | 'updatedAt', cuentaId: string): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    this.logger.error({
      operation: 'requireDate',
      aggregateId: cuentaId,
      errorCode: 'FECHA_INVALIDA',
      message: `Cuenta con campo ${field} inválido o ausente.`,
    } satisfies OperableLog);
    throw new BadRequestException(`Cuenta ${cuentaId} tiene ${field} invalido`);
  }
}
