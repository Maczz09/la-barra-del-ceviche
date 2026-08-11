/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { NotificacionDto, NotificacionVM, SocketNotificationPayload } from '../types/notificacion.types';

type UnknownRecord = Record<string, unknown>;

interface NotificationCopy {
  titulo: string;
  contenido: string;
}

const TITULOS_POR_EVENTO: Record<string, string> = {
  'mesa.creada': 'Nueva mesa',
  'mesa.actualizada': 'Mesa actualizada',
  'mesa.asignada': 'Mesa asignada',
  'mesa.liberada': 'Mesa liberada',
  'pedido.creado': 'Nuevo pedido',
  'pedido.listo': 'Pedido listo',
  'pedido.actualizado': 'Pedido actualizado',
  'pedido.item_anulado': 'Ítem anulado',
  'cuenta.abierta': 'Cuenta abierta',
  'cuenta.cerrada': 'Cuenta cerrada',
  'pago.registrado': 'Pago registrado',
  'reserva.creada': 'Nueva reserva',
  'reserva.cancelada': 'Reserva cancelada',
  'reserva.confirmada': 'Reserva confirmada',
  'stock.bajo': 'Stock bajo',
  'stock.insuficiente': 'Stock insuficiente',
  'stock.descontado': 'Stock actualizado',
  'producto.creado': 'Nuevo producto',
  'producto.actualizado': 'Producto actualizado',
};

const ESTADO_MESA_LABEL: Record<string, string> = {
  LIBRE: 'libre',
  OCUPADA: 'ocupada',
  RESERVADA: 'reservada',
};

const ESTADO_PEDIDO_LABEL: Record<string, string> = {
  RECIBIDO: 'recibido',
  EN_PREPARACION: 'en preparación',
  LISTO: 'listo para servir',
  ENTREGADO: 'entregado',
  PAGADO: 'pagado',
  CANCELADO: 'cancelado',
  RECHAZADO_SIN_STOCK: 'rechazado por falta de stock',
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function compact(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' · ');
}

function numberLabel(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value;
  if (typeof value === 'number') return String(value);
  return null;
}

/** Texto plano de un campo del payload; objetos/arrays devuelven ''. */
function textLabel(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function moneyLabel(value: unknown): string | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return `S/ ${amount.toFixed(2)}`;
}

function titleFromPattern(pattern: string): string {
  return TITULOS_POR_EVENTO[pattern] ?? pattern
    .split('.')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function contentSource(data: UnknownRecord | null): UnknownRecord | null {
  if (!data) return null;
  const contenidoJson = parseJsonRecord(data.contenido);
  return contenidoJson ?? data;
}

function nestedRecord(data: UnknownRecord | null, key: string): UnknownRecord | null {
  const value = data?.[key];
  return isRecord(value) ? value : null;
}

function mesaNumero(data: UnknownRecord | null): string | null {
  const mesa = nestedRecord(data, 'mesa');
  return numberLabel(mesa?.numero ?? data?.numeroMesa ?? data?.mesaNumero);
}

function pedidoRecord(data: UnknownRecord | null): UnknownRecord | null {
  return nestedRecord(data, 'pedido') ?? data;
}

function buildMesaCopy(pattern: string, data: UnknownRecord | null): NotificationCopy | null {
  const mesa = nestedRecord(data, 'mesa') ?? data;
  const numero = numberLabel(mesa?.numero ?? data?.numeroMesa ?? data?.mesaNumero);
  const estado = textLabel(mesa?.estado ?? data?.estado).toUpperCase();
  const estadoLabel = ESTADO_MESA_LABEL[estado] ?? estado.toLowerCase();
  const ubicacion = numberLabel(mesa?.ubicacion ?? data?.ubicacion);
  const capacidad = numberLabel(mesa?.capacidad ?? data?.capacidad);

  if (pattern === 'mesa.actualizada' && numero) {
    return {
      titulo: 'Mesa actualizada',
      contenido: compact([
        `Mesa ${numero} ahora está ${estadoLabel || 'actualizada'}.`,
        ubicacion,
        capacidad && `${capacidad} personas`,
      ]),
    };
  }

  if (pattern === 'mesa.creada' && numero) {
    return {
      titulo: 'Nueva mesa',
      contenido: compact([`Mesa ${numero} creada.`, ubicacion, capacidad && `${capacidad} personas`]),
    };
  }

  if (pattern === 'mesa.liberada') {
    return {
      titulo: 'Mesa liberada',
      contenido: numero ? `Mesa ${numero} disponible para nuevos clientes.` : 'Una mesa quedó disponible.',
    };
  }

  if (pattern === 'mesa.asignada') {
    return {
      titulo: 'Mesa asignada',
      contenido: numero ? `Mesa ${numero} asignada a una cuenta.` : 'Una mesa fue asignada a una cuenta.',
    };
  }

  return null;
}

function buildPedidoCopy(pattern: string, data: UnknownRecord | null): NotificationCopy | null {
  const pedido = pedidoRecord(data);
  const numero = mesaNumero(pedido) ?? mesaNumero(data);
  const total = moneyLabel(pedido?.total ?? data?.total);
  const estado = textLabel(pedido?.estado ?? data?.estado).toUpperCase();
  const estadoLabel = ESTADO_PEDIDO_LABEL[estado] ?? estado.replaceAll('_', ' ').toLowerCase();
  const destino = numero ? `Mesa ${numero}` : numberLabel(pedido?.cliente ?? data?.cliente) ?? 'cliente';

  if (pattern === 'pedido.creado') {
    return {
      titulo: 'Nuevo pedido',
      contenido: compact([`Nuevo pedido para ${destino}.`, total]),
    };
  }

  if (pattern === 'pedido.listo') {
    return {
      titulo: 'Pedido listo',
      contenido: numero ? `El pedido de Mesa ${numero} está listo para servir.` : 'Un pedido está listo para servir.',
    };
  }

  if (pattern === 'pedido.actualizado') {
    return {
      titulo: 'Pedido actualizado',
      contenido: estadoLabel
        ? `El pedido de ${destino} cambió a ${estadoLabel}.`
        : `El pedido de ${destino} fue actualizado.`,
    };
  }

  if (pattern === 'pedido.item_anulado') {
    const producto = numberLabel(data?.productoNombre) ?? 'un plato';
    return {
      titulo: 'Ítem anulado',
      contenido: numero ? `Mesero anuló "${producto}" (Mesa ${numero}).` : `Mesero anuló "${producto}".`,
    };
  }

  return null;
}

function buildCuentaCopy(pattern: string, data: UnknownRecord | null): NotificationCopy | null {
  const numero = mesaNumero(data);
  const mesa = numero ? `Mesa ${numero}` : 'una mesa';
  const total = moneyLabel(data?.total);

  if (pattern === 'cuenta.abierta') {
    return {
      titulo: 'Cuenta abierta',
      contenido: `Se abrió una cuenta para ${mesa}.`,
    };
  }

  if (pattern === 'cuenta.cerrada') {
    return {
      titulo: 'Cuenta cerrada',
      contenido: compact([`Se cerró la cuenta de ${mesa}.`, total]),
    };
  }

  if (pattern === 'pago.registrado') {
    return {
      titulo: 'Pago registrado',
      contenido: compact([numero ? `Pago registrado para Mesa ${numero}.` : 'Pago registrado.', total]),
    };
  }

  return null;
}

function buildReservaCopy(pattern: string, data: UnknownRecord | null): NotificationCopy | null {
  const reserva = nestedRecord(data, 'reserva') ?? data;
  const cliente = numberLabel(reserva?.clienteNombre ?? reserva?.cliente ?? data?.clienteNombre) ?? 'Cliente';
  const fecha = numberLabel(reserva?.fecha ?? data?.fecha);
  const hora = numberLabel(reserva?.hora ?? data?.hora);

  if (pattern === 'reserva.creada') {
    return {
      titulo: 'Nueva reserva',
      contenido: compact([`Reserva registrada para ${cliente}.`, fecha, hora]),
    };
  }

  if (pattern === 'reserva.cancelada') {
    return {
      titulo: 'Reserva cancelada',
      contenido: `La reserva de ${cliente} fue cancelada.`,
    };
  }

  if (pattern === 'reserva.confirmada') {
    return {
      titulo: 'Reserva confirmada',
      contenido: `La reserva de ${cliente} fue confirmada.`,
    };
  }

  return null;
}

function buildInventarioCopy(pattern: string, data: UnknownRecord | null): NotificationCopy | null {
  const nombre = numberLabel(data?.nombre) ?? numberLabel(data?.productoNombre) ?? 'Producto';
  const stockActual = numberLabel(data?.stockActual ?? data?.disponible);
  const stockMinimo = numberLabel(data?.stockMinimo);

  if (pattern === 'stock.bajo') {
    return {
      titulo: 'Stock bajo',
      contenido: compact([`${nombre} está por debajo del mínimo.`, stockActual && `Stock: ${stockActual}`, stockMinimo && `Mínimo: ${stockMinimo}`]),
    };
  }

  if (pattern === 'stock.insuficiente') {
    const solicitado = numberLabel(data?.solicitado);
    return {
      titulo: 'Stock insuficiente',
      contenido: compact([`${nombre} no tiene stock suficiente.`, solicitado && `Solicitado: ${solicitado}`, stockActual && `Disponible: ${stockActual}`]),
    };
  }

  if (pattern === 'producto.creado') {
    return {
      titulo: 'Nuevo producto',
      contenido: `${nombre} fue agregado al inventario.`,
    };
  }

  if (pattern === 'producto.actualizado' || pattern === 'stock.descontado') {
    return {
      titulo: titleFromPattern(pattern),
      contenido: `${nombre} fue actualizado en inventario.`,
    };
  }

  return null;
}

function fallbackContent(data: UnknownRecord | null): string {
  const explicit = data?.contenido;
  if (typeof explicit === 'string' && !parseJsonRecord(explicit)) return explicit;
  return 'Actualización recibida en tiempo real.';
}

function buildNotificationCopy(pattern: string, rawData: UnknownRecord | null): NotificationCopy {
  const data = contentSource(rawData);
  const builders = [
    buildMesaCopy,
    buildPedidoCopy,
    buildCuentaCopy,
    buildReservaCopy,
    buildInventarioCopy,
  ];

  for (const builder of builders) {
    const copy = builder(pattern, data);
    if (copy) return copy;
  }

  return {
    titulo: titleFromPattern(pattern),
    contenido: fallbackContent(rawData),
  };
}

export function mapNotificacion(dto: NotificacionDto): NotificacionVM {
  const contenidoJson = parseJsonRecord(dto.contenido);
  const copy = contenidoJson
    ? buildNotificationCopy(dto.eventoOrigen, contenidoJson)
    : {
        titulo: titleFromPattern(dto.eventoOrigen),
        contenido: dto.contenido,
      };

  return {
    id: dto.id,
    titulo: copy.titulo,
    contenido: copy.contenido,
    canal: dto.canal,
    estado: dto.estado,
    unread: dto.leida === false || dto.estado === 'PENDIENTE',
    timestamp: dto.timestamp,
    timestampLabel: new Date(dto.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export function mapNotificaciones(dtos: NotificacionDto[]): NotificacionVM[] {
  return dtos.map(mapNotificacion);
}

export function mapSocketNotification(evento: SocketNotificationPayload): NotificacionVM {
  const pattern = evento.pattern ?? 'evento';
  const dataObj = isRecord(evento.data) ? evento.data : null;
  const copy = buildNotificationCopy(pattern, dataObj);

  return {
    id: textLabel(dataObj?.notificacionId) || `${pattern}-${Date.now()}`,
    titulo: copy.titulo,
    contenido: copy.contenido,
    canal: 'UI',
    estado: 'PENDIENTE',
    unread: true,
    timestamp: new Date().toISOString(),
    timestampLabel: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

