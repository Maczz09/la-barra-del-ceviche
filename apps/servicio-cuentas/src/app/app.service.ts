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
  CuentaAsociadaPayload,
  CuentaCanceladaPayload,
  TicketGeneradoPayload,
  PedidoActualizadoPayload,
  PedidoCreadoPayload,
  PagoRegistradoPayload,
  MesaActualizadaPayload,
  PedidoSnapshot,
  PedidoSnapshotItem,
  PedidoEstado,
  EstadoItem,
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
  correlativo?: string | null;
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

  /**
   * Cuentas ABIERTA de una sede, sin paginar (uso interno: servicio-caja lo
   * llama antes de permitir el cierre de un turno — bloquea el cierre si
   * queda algo por cobrar). No expone `pedidos` completo, solo lo necesario
   * para nombrar la mesa en el mensaje de bloqueo.
   */
  async listarCuentasAbiertasPorSede(sedeId: string): Promise<{ cuentas: Array<{ id: string; mesaId: string; numeroMesa?: number; total: number }> }> {
    const cuentas = await this.prisma.cuenta.findMany({
      where: { sedeId, estado: CuentaEstado.Abierta },
      orderBy: { createdAt: 'asc' },
    });
    return {
      cuentas: cuentas.map((c) => {
        const pedidos = this.parsePedidosSnapshot(c.pedidos);
        return {
          id: c.id,
          mesaId: c.mesaId,
          numeroMesa: pedidos[0]?.numeroMesa,
          total: Number(c.total),
        };
      }),
    };
  }

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

  private async siguienteCorrelativo(prisma: Prisma.TransactionClient, sedeId: string): Promise<string> {
    const secuencia = await prisma.secuenciaCuenta.upsert({
      where: { sedeId },
      create: { sedeId, ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    return `A${String(secuencia.ultimo).padStart(7, '0')}`;
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

      const correlativo = await this.siguienteCorrelativo(prisma, sedeId);
      const c = await prisma.cuenta.create({
        data: {
          mesaId: command.mesaId,
          sedeId,
          estado: CuentaEstado.Abierta,
          pedidos: [],
          total: 0,
          correlativo,
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

      // Mismo caso que procesarPedidoActualizado: un PedidoCreado reentregado
      // muy tarde (redelivery/backlog) de una atención vieja de esta mesa,
      // llegando después de que se abrió una cuenta nueva, se descarta en
      // vez de colarse en la cuenta nueva. Solo aplica cuando YA existía una
      // cuenta abierta encontrada acá arriba — no toca el flujo normal de
      // "primer pedido de una mesa nueva" (rama de creación de cuenta más
      // abajo), donde este chequeo no tiene sentido.
      if (cuenta && new Date(pedidoDto.createdAt).getTime() < cuenta.createdAt.getTime()) {
        this.logger.warn({
          operation: 'procesarPedidoCreado',
          aggregateId: cuenta.id,
          errorCode: 'PEDIDO_HUERFANO_DE_ATENCION_ANTERIOR',
          message: `Pedido ${pedidoDto.id} (creado ${pedidoDto.createdAt}) es anterior a la cuenta ${cuenta.id} (abierta ${cuenta.createdAt.toISOString()}) — evento descartado, no pertenece a esta atención.`,
        } satisfies OperableLog);
        return;
      }

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
        // Este es el camino real de la mayoría de cuentas (mesero crea el
        // primer pedido de la mesa → esto reacciona), no abrirCuenta —
        // por eso el correlativo se asigna también aquí, no solo ahí.
        const correlativo = await this.siguienteCorrelativo(prisma, sedeId);
        cuenta = await prisma.cuenta.create({
          data: { mesaId: pedidoDto.mesaId, sedeId, estado: CuentaEstado.Abierta, pedidos: [], total: 0, correlativo },
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

      // Backfill del correlativo de la atención hacia el pedido — ver
      // CuentaAsociadaPayload. Se reemite en cada reentrega (idempotente:
      // el handler del otro lado solo sobreescribe con el mismo valor).
      const cuentaAsociadaPayload: CuentaAsociadaPayload = {
        pedidoId: pedidoDto.id,
        cuentaId: cuenta.id,
        sedeId: cuenta.sedeId,
        correlativo: cuenta.correlativo ?? undefined,
      };
      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.CuentaAsociada,
          payload: JSON.stringify(cuentaAsociadaPayload),
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
        // Bug: dedupear solo por (id, estado del pedido) hace que dos updates
        // REALES y distintos (p. ej. anular un ítem puntual, que no cambia el
        // estado del PEDIDO) colisionen en la misma key — el segundo evento se
        // descarta como "ya procesado" y el snapshot queda desactualizado
        // (el ítem anulado nunca se refleja en cuenta actual/boleta). La huella
        // de items hace que cada estado real del pedido tenga su propia key.
        const huellaItems = (pedidoDto.items ?? []).map((it) => `${it.id ?? ''}=${it.estado ?? ''}`).join(',');
        await prisma.idempotencyKey.create({
          data: { key: `pedido.actualizado:${pedidoDto.id}:${pedidoDto.estado}:${pedidoDto.total}:${huellaItems}` },
        });
        // M5: advisory lock por mesa
      // classid 1234 compartido entre servicios A PROPOSITO: cada servicio tiene su propia BD (database-per-service), el espacio de locks no se cruza.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${pedidoDto.mesaId}), 1, 8))::bit(32)::int)`;

      const cuenta = await prisma.cuenta.findFirst({
        where: { mesaId: pedidoDto.mesaId, estado: CuentaEstado.Abierta },
      });
      if (!cuenta) return;

      const snapshot = this.parsePedidosSnapshot(cuenta.pedidos);
      const index = snapshot.findIndex((p) => p.id === pedidoDto.id);

      // Bug: este handler resuelve la cuenta destino solo por mesaId+ABIERTA,
      // sin verificar que el pedido pertenezca a ESTA atención. Un evento
      // reentregado tarde (redelivery de RabbitMQ, backlog del outbox
      // worker) de un pedido de una atención VIEJA de la misma mesa, que
      // llega después de que la mesa se cerró y se reabrió con una cuenta
      // nueva, encontraba la única cuenta ABIERTA para esa mesa (la nueva),
      // no encontraba el pedido en su snapshot, y lo insertaba igual —
      // "resucitando" una anulación/ítem de una cuenta anterior dentro de
      // la cuenta nueva (bug reportado: item anulado de una atención vieja
      // apareciendo en la cuenta actual de una mesa recién reutilizada).
      // Si el pedido es anterior a la apertura de esta cuenta y todavía no
      // estaba en su snapshot, es huérfano de una atención anterior — se
      // descarta en vez de insertarlo.
      if (index < 0 && new Date(pedidoDto.createdAt).getTime() < cuenta.createdAt.getTime()) {
        this.logger.warn({
          operation: 'procesarPedidoActualizado',
          aggregateId: cuenta.id,
          errorCode: 'PEDIDO_HUERFANO_DE_ATENCION_ANTERIOR',
          message: `Pedido ${pedidoDto.id} (creado ${pedidoDto.createdAt}) es anterior a la cuenta ${cuenta.id} (abierta ${cuenta.createdAt.toISOString()}) y no estaba en su snapshot — evento descartado, no pertenece a esta atención.`,
        } satisfies OperableLog);
        return;
      }

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

      const allItems = this.itemsCobrables(pedidos);
      const mappedItems = allItems.map((item) => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitario: Number(item.precioUnitario || 0),
        // Bug: sin esto, reportes no puede distinguir plato de Carta/Menú
        // (COCINA/BAR) de producto de Inventario (DIRECTO) — todo caía en
        // "Top platos" y "Top productos" quedaba vacío para siempre.
        area: item.area,
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
      items: this.itemsCobrables(cierre.pedidos),
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

  /**
   * Cascada automática desde servicio-pedidos: todos los ítems de la
   * atención quedaron anulados (uno por uno, o vía "Anular atención de
   * mesa") sin que nada se cobrara. A diferencia de cerrarCuenta, no genera
   * ticket ni exige que la cuenta tenga pedidos — puede llegar con total 0.
   * Idempotente: si ya está CANCELADA (dos cancelaciones concurrentes desde
   * servicio-pedidos, ej. el último ítem de dos pedidos distintos anulado
   * casi al mismo tiempo) no falla, solo no repite el evento.
   */
  async cancelarCuenta(id: string): Promise<{ message: string }> {
    const cuenta = await this.prisma.$transaction(async (prisma) => {
      const cuentaBase = await prisma.cuenta.findUnique({ where: { id } });
      if (!cuentaBase) throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${cuentaBase.mesaId}), 1, 8))::bit(32)::int)`;

      const actual = await prisma.cuenta.findUnique({ where: { id } });
      if (!actual) throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
      if (actual.estado === CuentaEstado.Cancelada) return null;
      if (actual.estado !== CuentaEstado.Abierta) {
        throw new BadRequestException(`La cuenta no está abierta. Estado actual: ${actual.estado}`);
      }

      const actualizada = await prisma.cuenta.updateMany({
        where: { id, estado: CuentaEstado.Abierta },
        data: { estado: CuentaEstado.Cancelada },
      });
      if (actualizada.count !== 1) return null;

      const payload: CuentaCanceladaPayload = { cuentaId: id, mesaId: actual.mesaId, sedeId: actual.sedeId };
      await prisma.outboxEvent.create({
        data: { routingKey: RoutingKeys.CuentaCancelada, payload: JSON.stringify(payload), status: 'PENDING' },
      });

      return actual;
    });

    if (!cuenta) {
      return { message: 'La cuenta ya estaba cancelada.' };
    }

    this.logger.log({
      operation: 'cancelarCuenta',
      aggregateId: id,
      resultingState: 'CANCELADA',
      message: `Cuenta cancelada — todos sus ítems fueron anulados sin cobro.`,
    } satisfies OperableLog);

    return { message: 'Cuenta cancelada exitosamente' };
  }

  /**
   * Reconciliación event-driven (solución definitiva al bug de cuentas
   * huérfanas — ej. carrera de despliegue: una versión vieja del código
   * procesó un evento y dejó una cuenta ABIERTA sin engancharse a la
   * cascada de cancelación). servicio-mesas es la fuente de verdad de qué
   * cuenta está realmente asociada a una mesa; cada vez que una mesa
   * cambia (se libera, se reasigna, etc.) reemite MesaActualizada. Si acá
   * encontramos una cuenta ABIERTA para esa mesa que la mesa ya no
   * referencia como su `cuentaAsociada`, quedó huérfana — se cancela.
   * Se dispara en CADA actualización de mesa (no solo al liberar) a
   * propósito: así también se autocorrige cualquier drift futuro,
   * cualquiera sea la causa, sin depender de un camino de código
   * específico. findMany (no findFirst) por si alguna vez hay más de una
   * cuenta ABIERTA huérfana para la misma mesa.
   */
  async procesarMesaActualizada(payload: MesaActualizadaPayload): Promise<void> {
    const mesa = payload?.mesa;
    if (!mesa?.id) return;

    const cuentasAbiertas = await this.prisma.cuenta.findMany({
      where: { mesaId: mesa.id, estado: CuentaEstado.Abierta },
    });

    for (const cuenta of cuentasAbiertas) {
      if (mesa.cuentaAsociada === cuenta.id) continue;

      this.logger.warn({
        operation: 'procesarMesaActualizada',
        aggregateId: cuenta.id,
        errorCode: 'CUENTA_HUERFANA',
        message: `Mesa ${mesa.id} ya no referencia la cuenta ${cuenta.id} (cuentaAsociada actual: ${mesa.cuentaAsociada ?? 'null'}) — se cancela por reconciliación.`,
      } satisfies OperableLog);

      await this.cancelarCuenta(cuenta.id).catch((e: unknown) => {
        this.logger.error({
          operation: 'procesarMesaActualizada',
          aggregateId: cuenta.id,
          errorCode: 'RECONCILIACION_FALLIDA',
          message: `No se pudo cancelar la cuenta huérfana ${cuenta.id}: ${(e as Error)?.message}`,
        } satisfies OperableLog);
      });
    }
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
      const allItems = this.itemsCobrables(pedidos);
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

  /**
   * Ítems efectivamente cobrables de un snapshot: excluye pedidos enteros no
   * cobrables (CANCELADO/RECHAZADO_SIN_STOCK) y, dentro de pedidos vigentes,
   * los ítems anulados puntualmente (CU-01/CU-02). Usado para boleta/ticket
   * y división de cuenta — la vista "Cuenta actual" sí debe seguir mostrando
   * los ítems anulados (con su estado), así que no se usa para el mapeo a DTO.
   */
  private itemsCobrables(pedidos: PedidoSnapshot[]): PedidoSnapshotItem[] {
    return pedidos
      .filter((p) => !ESTADOS_NO_COBRABLES.has(p.estado))
      .flatMap((p) => (p.items || []).filter((item) => item.estado !== EstadoItem.Cancelado));
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
      correlativo: c.correlativo ?? undefined,
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
