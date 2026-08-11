import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  PedidoDto,
  ActualizarEstadoPedidoCommand,
  ActualizarEstadoItemCommand,
  PedidoEstado,
  EstadoItem,
  ItemArea,
  RoutingKeys,
  StockInsuficientePayload,
  PedidoItemAnuladoPayload,
} from '@org/contracts';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { mapPedidoToDto } from './pedido.mapper';
import { Prisma } from '../generated/prisma';


/**
 * T-40: transiciones de estado del pedido y compensación de la saga de stock,
 * extraídas del god-service. AppService queda como orquestador de creación,
 * listados y proyecciones locales.
 */
@Injectable()
export class PedidosSagaService {
  private readonly logger = new Logger(PedidosSagaService.name);
  private readonly pedidosRechazadosCounter = getOrCreateCounter(
    'pedidos_rechazados_sin_stock_total', 'Ítems/pedidos rechazados por falta de stock',
  );

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Transiciones permitidas del estado *del pedido* vía el endpoint de pedido.
   * "Cocina manda": el tramo de producción (PENDIENTE → EN_PREPARACION → LISTO)
   * se deriva de los ítems (ver `derivarEstadoPedido`), por eso este endpoint
   * existe principalmente para el tramo comercial (LISTO → ENTREGADO → PAGADO) y
   * cancelaciones. Las transiciones de producción quedan disponibles como
   * override manual, pero la UI por defecto no las expone.
   */
  private static readonly TRANSICIONES: Record<PedidoEstado, PedidoEstado[]> = {
    [PedidoEstado.Pendiente]: [PedidoEstado.EnPreparacion, PedidoEstado.Listo, PedidoEstado.Cancelado],
    [PedidoEstado.EnPreparacion]: [PedidoEstado.Pendiente, PedidoEstado.Listo, PedidoEstado.Cancelado],
    [PedidoEstado.Listo]: [PedidoEstado.EnPreparacion, PedidoEstado.Entregado, PedidoEstado.Cancelado],
    [PedidoEstado.Entregado]: [PedidoEstado.Pagado, PedidoEstado.Cancelado],
    [PedidoEstado.Pagado]: [],
    [PedidoEstado.Cancelado]: [],
    // Estado terminal puesto por la compensación de saga; no es destino de
    // ninguna transición manual vía el endpoint de estado.
    [PedidoEstado.RechazadoSinStock]: [],
  };

  private validarTransicion(actual: PedidoEstado, siguiente: PedidoEstado): void {
    if (actual === siguiente) return;
    const permitidas = PedidosSagaService.TRANSICIONES[actual] ?? [];
    if (!permitidas.includes(siguiente)) {
      throw new BadRequestException(
        `Transición de estado inválida: ${actual} → ${siguiente}`,
      );
    }
  }

  /**
   * Deriva el estado de producción del pedido a partir de sus ítems.
   * Fuente de verdad de PENDIENTE / EN_PREPARACION / LISTO ("cocina manda").
   * No decide ENTREGADO/PAGADO/CANCELADO: esos son comerciales.
   */
  private derivarEstadoPedido(
    estadosRaw: string[],
  ): PedidoEstado | null {
    // Los ítems rechazados por falta de stock o anulados no participan en la
    // derivación de producción ("cocina manda"): ni un ítem fantasma ni uno
    // anulado deben impedir que el resto del pedido avance a LISTO.
    const estados = estadosRaw.filter(
      (e) => e !== EstadoItem.RechazadoSinStock && e !== EstadoItem.Cancelado,
    );
    if (estados.length === 0) return null;
    const todosListos = estados.every(
      (e) => e === EstadoItem.Listo || e === EstadoItem.Entregado,
    );
    if (todosListos) return PedidoEstado.Listo;
    const algunoEnMarcha = estados.some(
      (e) => e === EstadoItem.EnPreparacion || e === EstadoItem.Listo || e === EstadoItem.Entregado,
    );
    if (algunoEnMarcha) return PedidoEstado.EnPreparacion;
    return PedidoEstado.Pendiente;
  }

  private recalcularTotalCobrable(
    items: Array<{ estado: string; precioUnitario: number | { toNumber(): number }; cantidad: number }>,
  ): number {
    return items
      .filter((item) => item.estado !== EstadoItem.RechazadoSinStock && item.estado !== EstadoItem.Cancelado)
      .reduce((total, item) => {
        const precio = typeof item.precioUnitario === 'number'
          ? item.precioUnitario
          : item.precioUnitario.toNumber();
        return total + precio * item.cantidad;
      }, 0);
  }

  async actualizarEstado(id: string, command: ActualizarEstadoPedidoCommand): Promise<{ message: string; pedido: PedidoDto }> {
    const pedido = await this.prisma.$transaction(async (prisma) => {
      const actual = await prisma.pedido.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException(`Pedido ${id} no encontrado`);
      }
      this.validarTransicion(actual.estado, command.estado);

      const updateResult = await prisma.pedido.updateMany({
        where: { id, estado: actual.estado },
        data: { estado: command.estado }
      });

      if (updateResult.count === 0) {
        throw new BadRequestException('El estado del pedido cambió concurrentemente.');
      }

      const p = await prisma.pedido.findUnique({
        where: { id },
        include: { items: true }
      });
      if (!p) throw new NotFoundException('Pedido no encontrado tras actualización');

      const pedidoDto = mapPedidoToDto(p);
      const outboxData: Array<{ routingKey: string; payload: string; status: string }> = [];

      if (command.estado === PedidoEstado.Listo) {
        outboxData.push({
          routingKey: RoutingKeys.PedidoListo,
          payload: JSON.stringify({
            pedidoId: p.id,
            mesaId: p.mesaId,
          }),
          status: 'PENDING',
        });
      }

      outboxData.push({
        routingKey: RoutingKeys.PedidoActualizado,
        payload: JSON.stringify({ pedido: pedidoDto }),
        status: 'PENDING',
      });

      await prisma.outboxEvent.createMany({ data: outboxData });

      return p;
    });

    return { message: 'Estado del pedido actualizado', pedido: mapPedidoToDto(pedido) };
  }

  async actualizarEstadoItem(itemId: string, command: ActualizarEstadoItemCommand): Promise<{ message: string }> {
    return this.prisma.$transaction(async (prisma) => {
      const item = await prisma.pedidoItem.update({
        where: { id: itemId },
        data: { estado: command.estado }
      });

      const pedidoId = item.pedidoId;

      // Adquirimos un advisory lock por pedidoId para secuenciar transacciones simultáneas del mismo pedido
      await prisma.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${pedidoId}))`
      );

      const pedidoActual = await prisma.pedido.findUnique({
        where: { id: pedidoId },
        include: { items: true },
      });
      if (!pedidoActual) {
        return { message: 'Estado del ítem actualizado exitosamente' };
      }


      // "Cocina manda": derivamos el estado de producción del pedido desde sus
      // ítems. Solo lo aplicamos si el pedido sigue en fase de producción; nunca
      // pisamos un estado comercial (ENTREGADO/PAGADO/CANCELADO).
      const estadoActual = pedidoActual.estado;
      const enProduccion =
        estadoActual === PedidoEstado.Pendiente ||
        estadoActual === PedidoEstado.EnPreparacion ||
        estadoActual === PedidoEstado.Listo;
      const derivado = this.derivarEstadoPedido(pedidoActual.items.map((i) => i.estado));

      let pedidoFinal = pedidoActual;
      const cambiaAListo =
        enProduccion && derivado === PedidoEstado.Listo && estadoActual !== PedidoEstado.Listo;

      // Un ítem anulado ya no debe cobrarse — recalculamos el total cobrable
      // del pedido en el mismo movimiento (mismo criterio que la compensación
      // de stock insuficiente).
      const seAnuloItem = command.estado === EstadoItem.Cancelado;
      const nuevoTotal = seAnuloItem ? this.recalcularTotalCobrable(pedidoActual.items) : null;

      const dataUpdate: { estado?: PedidoEstado; total?: number } = {};
      if (enProduccion && derivado && derivado !== estadoActual) dataUpdate.estado = derivado;
      if (nuevoTotal !== null) dataUpdate.total = nuevoTotal;

      if (Object.keys(dataUpdate).length > 0) {
          pedidoFinal =
          (await prisma.pedido.update({
            where: { id: pedidoId },
            data: dataUpdate,
            include: { items: true },
          })) ?? pedidoActual;
      }

      const outboxData: Array<{ routingKey: string; payload: string; status: string }> = [];
      if (cambiaAListo) {
        outboxData.push({
          routingKey: RoutingKeys.PedidoListo,
          payload: JSON.stringify({ pedidoId, mesaId: pedidoFinal.mesaId }),
          status: 'PENDING',
        });
      }
      // Aviso a cocina (KDS): solo si el ítem anulado era de área COCINA (un
      // plato, no una bebida de barra) — para que no sigan preparándolo.
      if (seAnuloItem && item.area === ItemArea.Cocina) {
        const payload: PedidoItemAnuladoPayload = {
          pedidoId,
          itemId: item.id,
          productoNombre: item.nombre,
          mesaId: pedidoFinal.mesaId,
        };
        outboxData.push({
          routingKey: RoutingKeys.PedidoItemAnulado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        });
      }
      outboxData.push({
        routingKey: RoutingKeys.PedidoActualizado,
        payload: JSON.stringify({ pedido: mapPedidoToDto(pedidoFinal) }),
        status: 'PENDING',
      });
      await prisma.outboxEvent.createMany({ data: outboxData });

      return { message: 'Estado del ítem actualizado exitosamente' };
    });
  }

  /**
   * Compensación de la saga de stock. Inventario no pudo descontar el stock real
   * de un producto (la proyección local iba por delante), así que marcamos el/los
   * ítem(s) afectados como RECHAZADO_SIN_STOCK y, si el pedido entero quedó sin
   * stock, el pedido completo. Emite PedidoActualizado para que la UI y demás
   * proyecciones reflejen el rechazo. Idempotente por (pedidoId, productoId).
   */
  async procesarStockInsuficiente(payload: StockInsuficientePayload): Promise<void> {
    const { pedidoId, productoId } = payload;
    if (!pedidoId || !productoId) {
      this.logger.warn({
        operation: 'procesarStockInsuficiente',
        errorCode: 'PAYLOAD_INVALIDO',
        message: 'Evento StockInsuficiente sin pedidoId/productoId — ignorado.',
      } satisfies OperableLog);
      return;
    }
    const idempotencyKey = `${RoutingKeys.StockInsuficiente}:${pedidoId}:${productoId}`;
    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: idempotencyKey } });

        const rechazados = await prisma.pedidoItem.updateMany({
          where: { pedidoId, productoId, estado: { not: EstadoItem.RechazadoSinStock } },
          data: { estado: EstadoItem.RechazadoSinStock },
        });

        const pedido = await prisma.pedido.findUnique({
          where: { id: pedidoId },
          include: { items: true },
        });
        if (!pedido) {
          this.logger.warn({
            operation: 'procesarStockInsuficiente',
            aggregateId: pedidoId,
            errorCode: 'PEDIDO_NO_ENCONTRADO',
            message: 'Pedido no encontrado al procesar StockInsuficiente.',
          } satisfies OperableLog);
          return;
        }

        // Si TODOS los ítems quedaron rechazados, el pedido entero pasa a
        // RECHAZADO_SIN_STOCK (salvo que ya sea terminal comercial).
        const terminalComercial =
          pedido.estado === PedidoEstado.Pagado || pedido.estado === PedidoEstado.Cancelado;
        const todosRechazados =
          pedido.items.length > 0 &&
          pedido.items.every((i) => i.estado === EstadoItem.RechazadoSinStock);

        const nuevoTotal = this.recalcularTotalCobrable(pedido.items);
        let pedidoFinal;
        if (todosRechazados && !terminalComercial && pedido.estado !== PedidoEstado.RechazadoSinStock) {
          pedidoFinal = await prisma.pedido.update({
            where: { id: pedidoId },
            data: { estado: PedidoEstado.RechazadoSinStock, total: nuevoTotal },
            include: { items: true },
          });
        } else {
          pedidoFinal = await prisma.pedido.update({
            where: { id: pedidoId },
            data: { total: nuevoTotal },
            include: { items: true },
          });
        }

        this.logger.warn({
          operation: 'procesarStockInsuficiente',
          aggregateId: pedidoId,
          dependency: 'inventario',
          errorCode: 'STOCK_VALIDATION_FAILED',
          resultingState: 'RECHAZADO_SIN_STOCK',
          message: `Validación de stock falló para el producto ${productoId}; ítems del pedido marcados como rechazados.`,
        } satisfies OperableLog);
        if (rechazados.count > 0) this.pedidosRechazadosCounter.inc(rechazados.count);

        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.PedidoActualizado,
            payload: JSON.stringify({ pedido: mapPedidoToDto(pedidoFinal) }),
            status: 'PENDING',
          },
        });
      });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarStockInsuficiente',
          aggregateId: pedidoId,
          idempotencyKey,
          message: 'Evento StockInsuficiente ya procesado — sin cambios (idempotente).',
        } satisfies OperableLog);
        return;
      }
      throw error;
    }
  }
}
