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

  // Cuentas
  CuentaAbierta: 'cuenta.abierta',
  CuentaCerrada: 'cuenta.cerrada',
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

  // Compras
  CompraRecibida: 'compra.recibida',
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
