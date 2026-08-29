// mappers/compras.mapper.ts - DTOs de Compras -> ViewModels de UI

import type {
  InsumoDto,
  InsumoVM,
  MovimientoInsumoDto,
  MovimientoInsumoTipo,
  MovimientoInsumoVM,
  OrdenCompraDto,
  OrdenCompraEstado,
  OrdenCompraItemDto,
  OrdenCompraItemVM,
  OrdenCompraVM,
  ProveedorDto,
  ProveedorVM,
} from '../types/compras.types';

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

const ESTADO_LABEL: Record<OrdenCompraEstado, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  PARCIAL: 'Recepción parcial',
  RECIBIDA: 'Recibida',
  ANULADA: 'Anulada',
};

const ESTADO_CLASS: Record<OrdenCompraEstado, string> = {
  BORRADOR: 'badge-muted',
  ENVIADA: 'badge-info',
  PARCIAL: 'badge-warn',
  RECIBIDA: 'badge-ok',
  ANULADA: 'badge-danger',
};

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function mapProveedor(dto: ProveedorDto): ProveedorVM {
  return { ...dto, iniciales: iniciales(dto.nombre) };
}

export function mapProveedores(dtos: ProveedorDto[]): ProveedorVM[] {
  return dtos.map(mapProveedor);
}

export function mapInsumo(dto: InsumoDto): InsumoVM {
  return { ...dto, bajoMinimo: dto.stockActual <= dto.stockMinimo };
}

export function mapInsumos(dtos: InsumoDto[]): InsumoVM[] {
  return dtos.map(mapInsumo);
}

function mapOrdenItem(dto: OrdenCompraItemDto): OrdenCompraItemVM {
  return {
    ...dto,
    pendiente: Math.max(0, dto.cantidadPedida - dto.cantidadRecibida),
    subtotal: dto.cantidadPedida * dto.costoUnitario,
  };
}

const FECHA_FMT = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' });

function fechaLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : FECHA_FMT.format(d);
}

export function mapOrden(dto: OrdenCompraDto): OrdenCompraVM {
  return {
    ...dto,
    items: dto.items.map(mapOrdenItem),
    estadoLabel: ESTADO_LABEL[dto.estado] ?? dto.estado,
    estadoClass: ESTADO_CLASS[dto.estado] ?? 'badge-muted',
    fechaEmisionLabel: fechaLabel(dto.fechaEmision),
    fechaEntregaLabel: fechaLabel(dto.fechaEntregaEsperada),
    puedeEditar: dto.estado === 'BORRADOR',
    puedeEnviar: dto.estado === 'BORRADOR',
    puedeRecibir: dto.estado === 'ENVIADA' || dto.estado === 'PARCIAL',
    puedeCerrar: dto.estado === 'ENVIADA' || dto.estado === 'PARCIAL',
    puedeAnular: dto.estado === 'BORRADOR' || dto.estado === 'ENVIADA' || dto.estado === 'PARCIAL',
  };
}

export function mapOrdenes(dtos: OrdenCompraDto[]): OrdenCompraVM[] {
  return dtos.map(mapOrden);
}

// ── Movimientos de insumo / kardex del almacén (T-50) ────────────

const MOVIMIENTO_LABEL: Record<MovimientoInsumoTipo, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_MANUAL: 'Ingreso manual',
  ENTRADA_DEVOLUCION: 'Devolución al almacén',
  SALIDA_CONSUMO: 'Consumo de cocina',
  SALIDA_MERMA: 'Merma',
  AJUSTE_CONTEO: 'Ajuste por conteo',
};

const MOVIMIENTO_CLASS: Record<MovimientoInsumoTipo, string> = {
  ENTRADA_COMPRA: 'badge-ok',
  ENTRADA_MANUAL: 'badge-ok',
  ENTRADA_DEVOLUCION: 'badge-ok',
  SALIDA_CONSUMO: 'badge-info',
  SALIDA_MERMA: 'badge-danger',
  AJUSTE_CONTEO: 'badge-warn',
};

const FECHA_HORA_FMT = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function mapMovimientoInsumo(dto: MovimientoInsumoDto): MovimientoInsumoVM {
  const fecha = new Date(dto.createdAt);
  // U+2212 (menos real), no un guion: alineado con el resto de cifras de la app.
  const signo = dto.delta < 0 ? '−' : '+';
  return {
    ...dto,
    tipoLabel: MOVIMIENTO_LABEL[dto.tipo] ?? dto.tipo,
    tipoClass: MOVIMIENTO_CLASS[dto.tipo] ?? 'badge-muted',
    deltaLabel: `${signo}${Math.abs(dto.delta)} ${dto.unidad}`,
    esSalida: dto.delta < 0,
    costoTotalLabel: dto.costoTotal == null ? '—' : formatMoney(dto.costoTotal),
    fechaLabel: Number.isNaN(fecha.getTime()) ? '—' : FECHA_HORA_FMT.format(fecha),
  };
}

export function mapMovimientosInsumo(dtos: MovimientoInsumoDto[]): MovimientoInsumoVM[] {
  return dtos.map(mapMovimientoInsumo);
}
