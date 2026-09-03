import type { ProductoDto } from '../../types/inventario.types';

export interface VariantePlato {
  productoId: string;
  tamanoId: string;
  nombre: string;
  orden: number;
  precio: number;
  descripcion: string | null;
}

export interface PlatoAgrupado {
  key: string;
  nombre: string;
  descripcion: string | null;
  categoriaId: string;
  /** Sin tamaño asignado: se conserva cada producto por separado. */
  precioUnico?: number;
  /** Una entrada por producto, incluso si dos comparten tamaño y nombre. */
  variantes?: VariantePlato[];
}

// Compatibilidad con servidores anteriores durante una actualización.
// null explícito significa "sin tamaño": nunca se vuelve a inferir del nombre.
const TAMANO_LEGADO = /^(.*?)\s*(?:·\s*(Personal|Mediano|Mediana|Grande|Familiar)|\((Personal|Mediano|Mediana|Grande|Familiar)\))$/i;
const ORDEN_LEGADO: Record<string, number> = { personal: 10, mediano: 20, mediana: 20, grande: 30, familiar: 40 };

function presentacion(producto: ProductoDto) {
  if (producto.tamano) return { nombre: producto.nombre, tamano: producto.tamano };
  if (producto.tamano !== undefined || producto.tamanoId !== undefined) return null;
  const match = TAMANO_LEGADO.exec(producto.nombre.trim());
  if (!match || !match[1]) return null;
  const nombre = (match[2] || match[3]).toLowerCase();
  return {
    nombre: match[1].trim(),
    tamano: {
      id: `legado:${nombre}`,
      nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1),
      orden: ORDEN_LEGADO[nombre],
    },
  };
}

export function agruparPorTamano(productos: ProductoDto[]): PlatoAgrupado[] {
  const grupos = new Map<string, PlatoAgrupado>();
  for (const producto of productos) {
    if (!producto.disponible) continue;
    const datos = presentacion(producto);
    if (!datos) {
      const key = `u:${producto.id}`;
      grupos.set(key, {
        key,
        nombre: producto.nombre,
        descripcion: producto.descripcion ?? null,
        categoriaId: producto.categoriaId,
        precioUnico: producto.precio,
      });
      continue;
    }

    const key = JSON.stringify(['g', producto.categoriaId, datos.nombre]);
    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = {
        key,
        nombre: datos.nombre,
        descripcion: producto.descripcion ?? null,
        categoriaId: producto.categoriaId,
        variantes: [],
      };
      grupos.set(key, grupo);
    }
    grupo.variantes!.push({
      productoId: producto.id,
      tamanoId: datos.tamano.id,
      nombre: datos.tamano.nombre,
      orden: datos.tamano.orden,
      precio: producto.precio,
      descripcion: producto.descripcion ?? null,
    });
  }

  for (const grupo of grupos.values()) {
    grupo.variantes?.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es') || a.productoId.localeCompare(b.productoId));
  }
  return [...grupos.values()];
}
