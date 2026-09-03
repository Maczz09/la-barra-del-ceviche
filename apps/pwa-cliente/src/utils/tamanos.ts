import type { TamanoPlatoDto } from '../types/inventario.types';

export const SIN_TAMANO = 'SIN_TAMANO';
type ProductoConTamano = { id: string; nombre: string; tamanoId?: string | null; tamano?: TamanoPlatoDto | null };

/** El tamaño explícito es la fuente de verdad; no se interpreta el nombre. */
export function nombreProductoConTamano(producto: Pick<ProductoConTamano, 'nombre' | 'tamano'>): string {
  return producto.tamano ? `${producto.nombre} · ${producto.tamano.nombre}` : producto.nombre;
}

export function compararProductosPorTamano(a: ProductoConTamano, b: ProductoConTamano): number {
  const orden = (a.tamano?.orden ?? Number.MAX_SAFE_INTEGER) - (b.tamano?.orden ?? Number.MAX_SAFE_INTEGER);
  return orden || (a.tamano?.nombre ?? '').localeCompare(b.tamano?.nombre ?? '', 'es')
    || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id);
}

/** Incluye tamaños inactivos aún usados: desactivar no oculta platos existentes. */
export function tamanosDeProductos(productos: Pick<ProductoConTamano, 'tamano'>[]): TamanoPlatoDto[] {
  const unicos = new Map<string, TamanoPlatoDto>();
  for (const producto of productos) if (producto.tamano) unicos.set(producto.tamano.id, producto.tamano);
  return [...unicos.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id));
}

export function coincideTamano(producto: Pick<ProductoConTamano, 'tamanoId' | 'tamano'>, filtro: string): boolean {
  const id = producto.tamanoId ?? producto.tamano?.id;
  return !filtro || (filtro === SIN_TAMANO ? !id : id === filtro);
}
