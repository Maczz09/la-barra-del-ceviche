import {
  CategoriaInsumoDto,
  ComprobanteCompraDto,
  InsumoDto,
  MovimientoInsumoDto,
  OrdenCompraDto,
  OrdenCompraItemDto,
  ProveedorDto,
  RecepcionCompraDto,
  RecepcionCompraItemDto,
} from '@org/contracts';
import {
  CategoriaInsumo,
  ComprobanteCompra,
  Insumo,
  MovimientoInsumo,
  OrdenCompra,
  OrdenCompraItem,
  Proveedor,
  RecepcionCompra,
  RecepcionCompraItem,
} from '../generated/prisma';

export function toProveedorDto(p: Proveedor): ProveedorDto {
  return {
    id: p.id,
    sedeId: p.sedeId,
    nombre: p.nombre,
    ruc: p.ruc,
    categoria: p.categoria,
    contacto: p.contacto,
    telefono: p.telefono,
    diasEntrega: p.diasEntrega,
    condicionPago: p.condicionPago,
    activo: p.activo,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toCategoriaInsumoDto(
  c: CategoriaInsumo & { _count?: { insumos: number } },
): CategoriaInsumoDto {
  return {
    id: c.id,
    sedeId: c.sedeId,
    nombre: c.nombre,
    descripcion: c.descripcion,
    activo: c.activo,
    insumosCount: c._count?.insumos ?? 0,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toInsumoDto(
  i: Insumo & { proveedor?: Proveedor | null; categoria?: CategoriaInsumo | null },
): InsumoDto {
  return {
    id: i.id,
    sedeId: i.sedeId,
    nombre: i.nombre,
    unidad: i.unidad,
    stockActual: i.stockActual.toNumber(),
    stockMinimo: i.stockMinimo.toNumber(),
    costoUnitario: i.costoUnitario.toNumber(),
    proveedorId: i.proveedorId,
    proveedorNombre: i.proveedor?.nombre ?? null,
    categoriaId: i.categoriaId,
    categoriaNombre: i.categoria?.nombre ?? null,
    productoId: i.productoId,
    factorConversion: i.factorConversion.toNumber(),
    activo: i.activo,
    createdAt: i.createdAt.toISOString(),
  };
}

function toOrdenCompraItemDto(item: OrdenCompraItem): OrdenCompraItemDto {
  return {
    id: item.id,
    insumoId: item.insumoId,
    insumoNombre: item.insumoNombre,
    unidad: item.unidad,
    cantidadPedida: item.cantidadPedida.toNumber(),
    cantidadRecibida: item.cantidadRecibida.toNumber(),
    costoUnitario: item.costoUnitario.toNumber(),
  };
}

export function toOrdenCompraDto(
  o: OrdenCompra & { items: OrdenCompraItem[]; _count?: { comprobantes: number } },
): OrdenCompraDto {
  return {
    id: o.id,
    sedeId: o.sedeId,
    codigo: o.codigo,
    proveedorId: o.proveedorId,
    proveedorNombre: o.proveedorNombre,
    estado: o.estado as OrdenCompraDto['estado'],
    fechaEmision: o.fechaEmision.toISOString(),
    fechaEnvio: o.fechaEnvio ? o.fechaEnvio.toISOString() : null,
    fechaEntregaEsperada: o.fechaEntregaEsperada ? o.fechaEntregaEsperada.toISOString().slice(0, 10) : null,
    fechaCierre: o.fechaCierre ? o.fechaCierre.toISOString() : null,
    moneda: o.moneda,
    total: o.total.toNumber(),
    notas: o.notas,
    usuarioId: o.usuarioId,
    usuarioNombre: o.usuarioNombre,
    items: o.items.map(toOrdenCompraItemDto),
    createdAt: o.createdAt.toISOString(),
    // No siempre viene cargado (crear/enviar/cerrar/anular no lo piden porque
    // no lo muestran) — 0 es un default seguro, no un conteo real todavía.
    comprobantesCount: o._count?.comprobantes ?? 0,
  };
}

function toRecepcionCompraItemDto(item: RecepcionCompraItem): RecepcionCompraItemDto {
  return {
    id: item.id,
    ordenItemId: item.ordenItemId,
    cantidadRecibida: item.cantidadRecibida.toNumber(),
    costoUnitario: item.costoUnitario.toNumber(),
  };
}

export function toRecepcionCompraDto(r: RecepcionCompra & { items: RecepcionCompraItem[] }): RecepcionCompraDto {
  return {
    id: r.id,
    sedeId: r.sedeId,
    ordenId: r.ordenId,
    fecha: r.fecha.toISOString(),
    observaciones: r.observaciones,
    usuarioId: r.usuarioId,
    usuarioNombre: r.usuarioNombre,
    items: r.items.map(toRecepcionCompraItemDto),
    createdAt: r.createdAt.toISOString(),
  };
}

export function toComprobanteCompraDto(c: ComprobanteCompra): ComprobanteCompraDto {
  return {
    id: c.id,
    sedeId: c.sedeId,
    ordenId: c.ordenId,
    recepcionId: c.recepcionId,
    tipo: c.tipo,
    serie: c.serie,
    numero: c.numero,
    fechaEmision: c.fechaEmision ? c.fechaEmision.toISOString().slice(0, 10) : null,
    montoTotal: c.montoTotal ? c.montoTotal.toNumber() : null,
    mimeType: c.mimeType,
    bytes: c.bytes,
    ancho: c.ancho,
    alto: c.alto,
    sha256: c.sha256,
    nombreOriginal: c.nombreOriginal,
    usuarioId: c.usuarioId,
    usuarioNombre: c.usuarioNombre,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toMovimientoInsumoDto(m: MovimientoInsumo & { insumo: Insumo }): MovimientoInsumoDto {
  const delta = m.delta.toNumber();
  const costoUnitario = m.costoUnitario ? m.costoUnitario.toNumber() : null;
  return {
    id: m.id,
    sedeId: m.sedeId,
    insumoId: m.insumoId,
    insumoNombre: m.insumo.nombre,
    unidad: m.insumo.unidad,
    tipo: m.tipo,
    delta,
    stockAntes: m.stockAntes.toNumber(),
    stockDespues: m.stockDespues.toNumber(),
    costoUnitario,
    // Valor absoluto: el costo de un movimiento es lo que vale lo que se movió,
    // el sentido ya lo dice `delta`.
    costoTotal: costoUnitario === null ? null : Math.abs(delta) * costoUnitario,
    motivo: m.motivo,
    observacion: m.observacion,
    recepcionId: m.recepcionId,
    usuarioId: m.usuarioId,
    usuarioNombre: m.usuarioNombre,
    createdAt: m.createdAt.toISOString(),
  };
}
