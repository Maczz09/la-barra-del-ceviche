// screens/carta-publica/agruparPorTamano.ts — agrupa productos con variantes
// de tamaño ("Arroz con Conchas (Personal)", "(Mediana)", "(Familiar)") en
// una sola fila con 3 precios, para mostrarlos como tabla igual que la carta
// impresa. Es una convención de NOMBRE, no un campo de BD (no existe un
// campo de variante en Producto). Los cargadores de carta deben conservar
// esta forma si quieren que la carta pública agrupe los precios por tamaño.

import type { ProductoDto } from '../../types/inventario.types';

const TALLA_RE = /^(.*)\s\((Personal|Mediana|Familiar)\)$/;
type Talla = 'personal' | 'mediana' | 'familiar';

export interface PlatoAgrupado {
  key: string;
  nombre: string;
  descripcion: string | null;
  categoriaId: string;
  /** Sin variantes de tamaño: precio único. */
  precioUnico?: number;
  /** Con variantes: uno o más de los tres tamaños (los 86'd simplemente no aparecen). */
  precios?: Partial<Record<Talla, number>>;
}

function tallaCampo(talla: string): Talla {
  if (talla === 'Personal') return 'personal';
  if (talla === 'Mediana') return 'mediana';
  return 'familiar';
}

export function agruparPorTamano(productos: ProductoDto[]): PlatoAgrupado[] {
  const grupos = new Map<string, PlatoAgrupado>();
  const orden: string[] = [];

  for (const producto of productos) {
    const match = TALLA_RE.exec(producto.nombre.trim());

    if (!match) {
      const key = `u:${producto.id}`;
      grupos.set(key, {
        key,
        nombre: producto.nombre,
        descripcion: producto.descripcion ?? null,
        categoriaId: producto.categoriaId,
        precioUnico: producto.precio,
      });
      orden.push(key);
      continue;
    }

    const [, base, talla] = match;
    // categoriaId en la key: evita fusionar dos platos con el mismo nombre
    // base filados bajo categorías distintas.
    const key = `g:${producto.categoriaId}:${base}`;
    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = {
        key,
        nombre: base,
        descripcion: producto.descripcion ?? null,
        categoriaId: producto.categoriaId,
        precios: {},
      };
      grupos.set(key, grupo);
      orden.push(key);
    }
    grupo.precios![tallaCampo(talla)] = producto.precio;
  }

  return orden.map((key) => grupos.get(key)!);
}
