// mappers/pedido.mapper.ts — PedidoDto → PedidoVM

import type { AnulacionAuditoriaDto, AnulacionAuditoriaVM, EstadoPlatoAnulacion, PedidoDto, PedidoVM, PedidoItemDto, PedidoItemVM, EstadoPedido, EstadoItem, TipoAnulacion } from '../types/pedido.types';
import { canalFromModalidad } from '../domain/pedido.flow';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

const ESTADO_CSS: Record<EstadoPedido, string> = {
  PENDIENTE: 'badge-warn',
  EN_PREPARACION: 'badge-info',
  LISTO: 'badge-ok',
  ENTREGADO: 'badge-accent',
  PAGADO: 'badge-muted',
  CANCELADO: 'badge-danger',
  RECHAZADO_SIN_STOCK: 'badge-danger',
};

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  ENTREGADO: 'Entregado',
  PAGADO: 'Pagado',
  CANCELADO: 'Cancelado',
  RECHAZADO_SIN_STOCK: 'Sin stock',
};

/** Clase CSS del badge para un estado de pedido/ítem. */
export function estadoClassOf(estado: EstadoPedido | EstadoItem): string {
  return ESTADO_CSS[estado] ?? 'badge-muted';
}

/** Etiqueta legible para un estado de pedido/ítem. */
export function estadoLabelOf(estado: EstadoPedido | EstadoItem): string {
  return ESTADO_LABEL[estado] ?? estado;
}

function mapItem(dto: PedidoItemDto, pedidoId: string): PedidoItemVM {
  if (!dto.id) {
    throw new Error(
      `Pedido ${pedidoId} contiene un item sin id real del backend`,
    );
  }

  const estado = dto.estado ?? 'PENDIENTE';
  return {
    id: dto.id,
    productoId: dto.productoId,
    nombre: dto.nombre,
    cantidad: dto.cantidad,
    precioUnitario: dto.precioUnitario,
    subtotal: dto.cantidad * dto.precioUnitario,
    area: dto.area ?? 'COCINA',
    notas: dto.notas ?? '',
    estado,
    estadoClass: estadoClassOf(estado),
    estadoLabel: estadoLabelOf(estado),
  };
}

export function mapPedido(dto: PedidoDto): PedidoVM {
  const items = Array.isArray(dto.items)
    ? dto.items.map((item) => mapItem(item, dto.id))
    : [];
  return {
    id: dto.id,
    mesaId: dto.mesaId,
    mesaNumero: dto.numeroMesa == null ? '??' : String(dto.numeroMesa).padStart(2, '0'),
    items,
    total: dto.total,
    estado: dto.estado,
    estadoClass: ESTADO_CSS[dto.estado] ?? 'badge-muted',
    estadoLabel: ESTADO_LABEL[dto.estado] ?? dto.estado,
    createdAt: dto.createdAt,
    meseroId: dto.meseroId ?? undefined,
    meseroNombre: dto.meseroNombre ?? undefined,
    cliente: dto.cliente ?? undefined,
    telefono: dto.telefono ?? undefined,
    direccion: dto.direccion ?? undefined,
    proveedor: dto.proveedor ?? undefined,
    modalidad: dto.modalidad ?? undefined,
    canal: canalFromModalidad(dto.modalidad ?? undefined),
    cantidadItems: items.reduce((sum, it) => sum + it.cantidad, 0),
    cuentaCorrelativo: dto.cuentaCorrelativo ?? undefined,
  };
}

export function mapPedidos(dtos: PedidoDto[]): PedidoVM[] {
  return dtos.map(mapPedido);
}

// ─── CU-05: Auditoría de Anulaciones ─────────────────────────────

const TIPO_ANULACION_LABEL: Record<TipoAnulacion, string> = {
  ITEM: 'Ítem',
  MESA: 'Mesa completa',
};

const ESTADO_PLATO_LABEL: Record<EstadoPlatoAnulacion, string> = {
  SIN_PREPARAR: 'Sin preparar',
  PREPARADO: 'Ya preparado',
};

export function mapAnulacionAuditoria(dto: AnulacionAuditoriaDto): AnulacionAuditoriaVM {
  return {
    id: dto.id,
    correlativo: dto.correlativo ?? null,
    fechaLabel: new Date(dto.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
    mesaNumero: dto.mesaNumero ?? null,
    pedidoId: dto.pedidoId,
    cuentaCorrelativo: dto.cuentaCorrelativo ?? null,
    tipo: dto.tipo,
    tipoLabel: TIPO_ANULACION_LABEL[dto.tipo] ?? dto.tipo,
    productoNombre: dto.productoNombre ?? null,
    cantidad: dto.cantidad ?? null,
    estadoPlato: dto.estadoPlato,
    cobrado: dto.cobrado,
    montoAnulado: dto.montoAnulado,
    montoLabel: formatMoney(dto.montoAnulado),
    motivo: dto.motivo,
    observacion: dto.observacion ?? null,
    usuarioNombre: dto.usuarioNombre ?? null,
    clienteNombre: dto.clienteNombre ?? null,
    invalidada: dto.invalidada,
    invalidadaMotivo: dto.invalidadaMotivo ?? null,
    invalidadaPorNombre: dto.invalidadaPorNombre ?? null,
  };
}

export function mapAnulacionesAuditoria(dtos: AnulacionAuditoriaDto[]): AnulacionAuditoriaVM[] {
  return dtos.map(mapAnulacionAuditoria);
}

// ESTADO_PLATO_LABEL usado por la pantalla de Auditoría de Anulaciones.
export { ESTADO_PLATO_LABEL };
