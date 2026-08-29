/**
 * Routing keys AMQP (topic). Convención: dominio.accion en minúsculas.
 * Nombres de evento de negocio (APF2) en PascalCase viven en tipos/payloads.
 */
export const RoutingKeys = {
  // Reservas
  ReservaCreada: 'reserva.creada',
  ReservaCancelada: 'reserva.cancelada',

  // Mesas
  MesaCreada: 'mesa.creada',
  MesaActualizada: 'mesa.actualizada',

  // Pedidos
  PedidoCreado: 'pedido.creado',
  PedidoListo: 'pedido.listo',
  PedidoActualizado: 'pedido.actualizado',
  PedidoItemAnulado: 'pedido.item_anulado',
  // CU-01/CU-02: ítem ya preparado/servido que se anula — la pérdida física
  // es real haya cobro o no, así que siempre genera merma en Inventario.
  PedidoItemAnuladoConMerma: 'pedido.item_anulado_con_merma',

  // Cuentas
  CuentaAbierta: 'cuenta.abierta',
  CuentaCerrada: 'cuenta.cerrada',
  // Todos los ítems de la atención se anularon uno por uno (o "Anular
  // atención de mesa") sin que nada se cobrara — ver AppService.cancelarCuenta.
  CuentaCancelada: 'cuenta.cancelada',
  // Backfill del correlativo de la atención ("A0000001") hacia el pedido que
  // la originó/se le sumó — ver PedidosSagaService / events.controller.
  CuentaAsociada: 'cuenta.asociada',
  TicketGenerado: 'ticket.generado',

  // Caja
  PagoRegistrado: 'pago.registrado',
  TurnoCajaAbierto: 'turno.abierto',
  TurnoCajaCerrado: 'turno.cerrado',

  // Facturación electrónica (SUNAT)
  ComprobanteEmitido: 'comprobante.emitido',

  // Inventario
  StockInsuficiente: 'stock.insuficiente',
  ProductoCreado: 'producto.creado',
  ProductoActualizado: 'producto.actualizado',
  // CU-02: un ítem de Inventario se reservó al crear el pedido pero la mesa
  // se anuló sin haberlo consumido — se le devuelve el stock.
  StockRestaurado: 'stock.restaurado',

  // Compras
  CompraRecibida: 'compra.recibida',
  // T-50: un movimiento del almacén de cocina dejó al insumo en/por debajo de
  // su mínimo. Solo en el CRUCE hacia abajo, no en cada salida posterior.
  InsumoStockBajo: 'insumo.stock_bajo',
} as const;

export type RoutingKey = (typeof RoutingKeys)[keyof typeof RoutingKeys];

/** Conjunto de todas las routing keys conocidas (para validación en runtime). */
export const ROUTING_KEY_VALUES: ReadonlySet<RoutingKey> = new Set(
  Object.values(RoutingKeys),
);

/** Type guard: ¿el string es una routing key del catálogo? (T-18) */
export function isRoutingKey(value: string): value is RoutingKey {
  return ROUTING_KEY_VALUES.has(value as RoutingKey);
}

/** Binding de cola consumidor amplio (desarrollo / notificaciones). */
export const CONSUMER_BINDING_ALL_DOMAIN_EVENTS = '*.*' as const;
