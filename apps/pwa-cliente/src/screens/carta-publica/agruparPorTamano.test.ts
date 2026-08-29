import { describe, it, expect } from 'vitest';
import { agruparPorTamano } from './agruparPorTamano';
import type { ProductoDto } from '../../types/inventario.types';

function producto(overrides: Partial<ProductoDto>): ProductoDto {
  return {
    id: 'p1',
    categoriaId: 'cat-1',
    nombre: 'Producto',
    descripcion: null,
    precio: 10,
    disponible: true,
    stockActual: null,
    ...overrides,
  };
}

describe('agruparPorTamano', () => {
  it('agrupa las 3 variantes de tamaño en un solo plato con 3 precios', () => {
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Arroz con Conchas (Personal)', precio: 30 }),
      producto({ id: 'p2', nombre: 'Arroz con Conchas (Mediana)', precio: 35 }),
      producto({ id: 'p3', nombre: 'Arroz con Conchas (Familiar)', precio: 40 }),
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('Arroz con Conchas');
    expect(resultado[0].precios).toEqual({ personal: 30, mediana: 35, familiar: 40 });
    expect(resultado[0].precioUnico).toBeUndefined();
  });

  it('degrada a precio único un plato sin sufijo de tamaño', () => {
    const resultado = agruparPorTamano([producto({ id: 'p1', nombre: 'Chicha Morada', precio: 8 })]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('Chicha Morada');
    expect(resultado[0].precioUnico).toBe(8);
    expect(resultado[0].precios).toBeUndefined();
  });

  it('un plato con solo 2 de 3 tamaños disponibles muestra solo esos 2 (el 86\'d no aparece)', () => {
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Ceviche de Filete (Personal)', precio: 30 }),
      producto({ id: 'p2', nombre: 'Ceviche de Filete (Familiar)', precio: 40 }),
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].precios).toEqual({ personal: 30, familiar: 40 });
    expect(resultado[0].precios?.mediana).toBeUndefined();
  });

  it('no fusiona el mismo nombre base si están en categorías distintas', () => {
    const resultado = agruparPorTamano([
      producto({ id: 'p1', categoriaId: 'cat-a', nombre: 'Especial (Personal)', precio: 20 }),
      producto({ id: 'p2', categoriaId: 'cat-b', nombre: 'Especial (Personal)', precio: 25 }),
    ]);

    expect(resultado).toHaveLength(2);
  });

  it('mantiene el orden de primera aparición', () => {
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Chicha Morada', precio: 8 }),
      producto({ id: 'p2', nombre: 'Arroz con Conchas (Personal)', precio: 30 }),
      producto({ id: 'p3', nombre: 'Limonada', precio: 6 }),
    ]);

    expect(resultado.map((p) => p.nombre)).toEqual(['Chicha Morada', 'Arroz con Conchas', 'Limonada']);
  });

  it('lista vacía devuelve arreglo vacío', () => {
    expect(agruparPorTamano([])).toEqual([]);
  });
});
