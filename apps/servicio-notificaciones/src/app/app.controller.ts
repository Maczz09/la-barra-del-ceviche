import { Controller, Get, Logger, UseInterceptors } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  PedidoCreadoPayload,
  PedidoActualizadoPayload,
  PedidoListoPayload,
  PedidoItemAnuladoPayload,
  TicketGeneradoPayload,
  CuentaAbiertaPayload,
  CuentaCerradaPayload,
  MesaActualizadaPayload,
  ReservaCanceladaPayload,
  ReservaCreadaPayload,
  ProductoActualizadoPayload,
  RoutingKeys,
} from '@org/contracts';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { OperableLog } from '@org/observabilidad';
import { AppService } from './app.service';
import { NotificationsGateway } from './notifications.gateway';
import { CartaGateway } from './carta.gateway';

@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly gateway: NotificationsGateway,
    private readonly cartaGateway: CartaGateway,
  ) {}

  @Get()
  async obtenerNotificaciones() {
    return this.appService.obtenerNotificaciones();
  }

  @EventPattern(RoutingKeys.PedidoCreado)
  async handlePedidoCreado(
    @Payload() payload: PedidoCreadoPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.PedidoCreado, payload, ctx);
  }

  @EventPattern(RoutingKeys.PedidoActualizado)
  async handlePedidoActualizado(
    @Payload() payload: PedidoActualizadoPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.PedidoActualizado, payload, ctx);
  }

  @EventPattern(RoutingKeys.PedidoListo)
  async handlePedidoListo(
    @Payload() payload: PedidoListoPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.PedidoListo, payload, ctx);
  }

  @EventPattern(RoutingKeys.PedidoItemAnulado)
  async handlePedidoItemAnulado(
    @Payload() payload: PedidoItemAnuladoPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.PedidoItemAnulado, payload, ctx);
  }

  @EventPattern(RoutingKeys.TicketGenerado)
  async handleTicketGenerado(
    @Payload() payload: TicketGeneradoPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.TicketGenerado, payload, ctx);
  }

  @EventPattern(RoutingKeys.CuentaAbierta)
  async handleCuentaAbierta(
    @Payload() payload: CuentaAbiertaPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.CuentaAbierta, payload, ctx);
  }

  @EventPattern(RoutingKeys.CuentaCerrada)
  async handleCuentaCerrada(
    @Payload() payload: CuentaCerradaPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.CuentaCerrada, payload, ctx);
  }

  @EventPattern(RoutingKeys.MesaActualizada)
  async handleMesaActualizada(
    @Payload() payload: MesaActualizadaPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.MesaActualizada, payload, ctx);
  }

  @EventPattern(RoutingKeys.ReservaCreada)
  async handleReservaCreada(
    @Payload() payload: ReservaCreadaPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.ReservaCreada, payload, ctx);
  }

  @EventPattern(RoutingKeys.ReservaCancelada)
  async handleReservaCancelada(
    @Payload() payload: ReservaCanceladaPayload,
    @Ctx() ctx: RmqContext,
  ) {
    await this.handleEvent(RoutingKeys.ReservaCancelada, payload, ctx);
  }

  // Carta pública/QR (T-XX): a diferencia de handleEvent (arriba), esto NO
  // pasa por registrarNotificacion — no es una notificación para la campana
  // del staff, es un ping de disponibilidad para clientes anónimos. No se
  // persiste en BD por cada toggle, solo se retransmite.
  @EventPattern(RoutingKeys.ProductoActualizado)
  handleProductoActualizadoParaCartaPublica(
    @Payload() payload: ProductoActualizadoPayload,
  ) {
    this.cartaGateway.emitDisponibilidadCambiada(payload.sedeId, {
      productoId: payload.id,
      disponible: payload.disponible,
    });
  }

  /**
   * Extrae un id de negocio reconocible sin asumir la forma exacta del
   * payload (cada RoutingKey trae una distinta). Deliberadamente NO se loguea
   * el payload completo (sesión 29: "los logs guardan todo el payload" es el
   * anti-patrón a evitar) — solo el id necesario para buscar el caso.
   */
  private extractAggregateId(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const d = data as Record<string, unknown>;
    const pedido = d['pedido'] as Record<string, unknown> | undefined;
    const mesa = d['mesa'] as Record<string, unknown> | undefined;
    const candidato =
      pedido?.['id'] ?? d['cuentaId'] ?? d['mesaId'] ?? mesa?.['id'] ?? d['ticketId'] ?? d['reservaId'];
    return typeof candidato === 'string' ? candidato : undefined;
  }

  /** Identidad estable del mensaje (x-event-id) para deduplicar at-least-once. */
  private extractEventId(ctx: RmqContext): string | undefined {
    const headers = (ctx?.getMessage?.() as { properties?: { headers?: Record<string, unknown> } } | undefined)
      ?.properties?.headers;
    const id = headers?.['x-event-id'];
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }

  private async handleEvent(
    pattern: string,
    data: unknown,
    ctx: RmqContext,
  ): Promise<void> {
    this.logger.log({
      operation: pattern,
      aggregateId: this.extractAggregateId(data),
      message: 'Evento de negocio recibido; se registra y notifica en tiempo real.',
    } satisfies OperableLog);

    // Guardar en la BD de forma idempotente (dedup por x-event-id). Si falla la
    // persistencia, registrarNotificacion RELANZA → el interceptor reintenta/DLQ.
    const notif = await this.appService.registrarNotificacion(pattern, data, this.extractEventId(ctx));

    // notif === null ⇒ evento duplicado ya notificado: no se re-emite por WS
    // (evita el KDS recibiendo el mismo update dos veces en una redelivery).
    if (!notif) return;

    this.gateway.emitPedidoUpdate({
      pattern,
      data: {
        ...(typeof data === 'object' ? data : {}),
        notificacionId: notif.id,
        contenido: notif.contenido,
      },
    });
  }
}
