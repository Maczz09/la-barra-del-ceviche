import { describe, expect, it } from 'vitest';
import type { ProductoDto } from '../../types/inventario.types';
import { agruparPorTamano } from './agruparPorTamano';

describe('evaluación de integridad de precios de carta digital', () => {
  // Matriz determinista: distinto orden de respuesta, tamaños personalizados,
  // categorías homónimas, tamaños ausentes, duplicados y disponibilidad.
  const tamanos = [
    { id: 'familiar', nombre: 'Familiar', orden: 40, activo: true },
    { id: 'personal', nombre: 'Personal', orden: 10, activo: true },
    { id: 'para-dos', nombre: 'Para dos', orden: 15, activo: true },
    { id: 'grande', nombre: 'Grande', orden: 30, activo: true },
  ];

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('conserva cada ID y precio disponible y ordena tamaños: variante %i', (variante) => {
    const productos: ProductoDto[] = Array.from({ length: 36 }, (_, i) => {
      const tamano = i % 5 === 0 ? null : tamanos[(i + variante) % tamanos.length];
      return {
        id: `producto-${i}`,
        nombre: i % 3 === 0 ? 'Especial' : 'Ceviche',
        categoriaId: i % 2 === 0 ? 'categoria-1' : 'categoria-2',
        tamanoId: tamano?.id ?? null,
        tamano,
        precio: 10 + i / 4,
        descripcion: null,
        disponible: i % 7 !== 0,
        stockActual: null,
      };
    });
    if (variante % 2) productos.reverse();

    const grupos = agruparPorTamano(productos);
    const preciosRenderizados = grupos.flatMap((grupo) => {
      if (!grupo.variantes) return [[grupo.key.slice(2), grupo.precioUnico] as const];
      expect(grupo.variantes.map((v) => v.orden)).toEqual(grupo.variantes.map((v) => v.orden).sort((a, b) => a - b));
      for (const presentacion of grupo.variantes) {
        expect(productos.find((p) => p.id === presentacion.productoId)?.categoriaId).toBe(grupo.categoriaId);
      }
      return grupo.variantes.map((v) => [v.productoId, v.precio] as const);
    });

    const esperados = productos.filter((p) => p.disponible).map((p) => [p.id, p.precio] as const);
    expect(preciosRenderizados.sort(([a], [b]) => a.localeCompare(b))).toEqual(esperados.sort(([a], [b]) => a.localeCompare(b)));
  });
});
