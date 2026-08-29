// mappers/inventario.mapper.ts - ProductoDto -> ProductoVM

import type { CategoriaDto, MenuDiarioItemDto, MenuDiarioItemVM, MermaDto, MermaOrigen, MermaVM, ProductoDto, ProductoVM } from '../types/inventario.types';

const ORIGEN_LABEL: Record<MermaOrigen, string> = {
  DESCARTE_MANUAL_INVENTARIO: 'Descarte manual',
  ANULACION_COMANDA_NO_COBRADA: 'Anulación (no cobrada)',
  ANULACION_COMANDA_COBRADA: 'Anulación (cobrada)',
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(value);
}

function stockClass(stock: number | null): string {
  if (stock === null) return 'badge-muted';
  if (stock <= 0) return 'badge-danger';
  if (stock <= 5) return 'badge-warn';
  return 'badge-ok';
}

export function mapProducto(dto: ProductoDto, categorias: CategoriaDto[] = []): ProductoVM {
  const categoria = dto.categoria ?? categorias.find((item) => item.id === dto.categoriaId) ?? null;
  const stockActual = dto.stockActual ?? null;

  return {
    id: dto.id,
    categoriaId: dto.categoriaId,
    categoriaNombre: categoria?.nombre ?? null,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? null,
    precio: Number(dto.precio),
    precioLabel: formatMoney(Number(dto.precio)),

    disponible: dto.disponible,
    stockActual,
    stockLabel: stockActual === null ? 'Sin control' : String(stockActual),
    stockClass: stockClass(stockActual),
  };
}

export function mapProductos(dtos: ProductoDto[], categorias: CategoriaDto[] = []): ProductoVM[] {
  return dtos.map((dto) => mapProducto(dto, categorias));
}

export function mapMenuDiarioItem(dto: MenuDiarioItemDto): MenuDiarioItemVM | null {
  if (!dto.producto) return null;
  return {
    id: dto.id,
    disponible: dto.disponible,
    producto: mapProducto(dto.producto),
  };
}

export function mapMenuDiario(dtos: MenuDiarioItemDto[]): MenuDiarioItemVM[] {
  return dtos.map(mapMenuDiarioItem).filter((item): item is MenuDiarioItemVM => item !== null);
}

export function mapMerma(dto: MermaDto): MermaVM {
  const costoTotal = dto.costoTotal ?? null;
  return {
    id: dto.id,
    productoId: dto.productoId,
    productoNombre: dto.producto?.nombre ?? 'Producto',
    cantidad: dto.cantidad,
    motivo: dto.motivo,
    observacion: dto.observacion ?? null,
    origen: dto.origen,
    origenLabel: ORIGEN_LABEL[dto.origen] ?? dto.origen,
    costoUnitario: dto.costoUnitario ?? null,
    costoTotal,
    costoTotalLabel: costoTotal === null ? '—' : formatMoney(costoTotal),
    usuarioNombre: dto.usuarioNombre ?? null,
    fechaLabel: new Date(dto.createdAt).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
    cuentaCorrelativo: dto.cuentaCorrelativo ?? null,
  };
}

export function mapMermas(dtos: MermaDto[]): MermaVM[] {
  return dtos.map(mapMerma);
}
