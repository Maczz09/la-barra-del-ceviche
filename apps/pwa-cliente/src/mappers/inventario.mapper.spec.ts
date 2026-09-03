// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { mapProducto, mapProductos } from './inventario.mapper';

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'prod-1',
    categoriaId: 'cat-1',
    categoria: null,
    nombre: 'Nachos',
    descripcion: 'Nachos con queso',
    precio: '25.50',
    disponible: true,
    stockActual: 10,
    ...overrides,
  };
}

describe('mapProducto', () => {
  it('conserva tamaño explícito y nombre base para las vistas de carta', () => {
    const tamano = { id: 't1', nombre: 'Personal', orden: 10, activo: true };
    const vm = mapProducto(dto({ nombre: 'Ceviche', tamanoId: 't1', tamano }));
    expect(vm.nombre).toBe('Ceviche');
    expect(vm.tamanoId).toBe('t1');
    expect(vm.tamano).toEqual(tamano);
  });
  it('mapea los campos básicos', () => {
    const vm = mapProducto(dto());
    expect(vm.id).toBe('prod-1');
    expect(vm.nombre).toBe('Nachos');
    expect(vm.descripcion).toBe('Nachos con queso');
    expect(vm.disponible).toBe(true);
  });

  it('convierte precio string a número', () => {
    const vm = mapProducto(dto({ precio: '25.50' }));
    expect(vm.precio).toBe(25.5);
  });

  it('genera precioLabel en formato PEN', () => {
    const vm = mapProducto(dto({ precio: '10.00' }));
    expect(vm.precioLabel).toContain('10');
    expect(typeof vm.precioLabel).toBe('string');
  });

  it('stockClass badge-ok cuando stock > 5', () => {
    expect(mapProducto(dto({ stockActual: 10 })).stockClass).toBe('badge-ok');
  });

  it('stockClass badge-warn cuando stock <= 5 y > 0', () => {
    expect(mapProducto(dto({ stockActual: 5 })).stockClass).toBe('badge-warn');
    expect(mapProducto(dto({ stockActual: 1 })).stockClass).toBe('badge-warn');
  });

  it('stockClass badge-danger cuando stock es 0', () => {
    expect(mapProducto(dto({ stockActual: 0 })).stockClass).toBe('badge-danger');
  });

  it('stockClass badge-muted cuando stockActual es null (sin control)', () => {
    expect(mapProducto(dto({ stockActual: null })).stockClass).toBe('badge-muted');
  });

  it('stockLabel "Sin control" cuando stockActual es null', () => {
    expect(mapProducto(dto({ stockActual: null })).stockLabel).toBe('Sin control');
  });

  it('stockLabel es el número como string cuando hay stock', () => {
    expect(mapProducto(dto({ stockActual: 7 })).stockLabel).toBe('7');
  });

  it('toma categoriaNombre desde dto.categoria si existe', () => {
    const vm = mapProducto(dto({ categoria: { id: 'cat-1', nombre: 'Bebidas' } }));
    expect(vm.categoriaNombre).toBe('Bebidas');
  });

  it('busca categoria en la lista si dto.categoria es null', () => {
    const categorias = [{ id: 'cat-1', nombre: 'Comida' }];
    const vm = mapProducto(dto({ categoriaId: 'cat-1', categoria: null }), categorias);
    expect(vm.categoriaNombre).toBe('Comida');
  });

  it('categoriaNombre es null si no se encuentra en ningún lado', () => {
    const vm = mapProducto(dto({ categoriaId: 'cat-x', categoria: null }), []);
    expect(vm.categoriaNombre).toBeNull();
  });

  it('descripcion null se propaga', () => {
    const vm = mapProducto(dto({ descripcion: null }));
    expect(vm.descripcion).toBeNull();
  });
});

describe('mapProductos', () => {
  it('mapea todos los DTOs', () => {
    const result = mapProductos([dto({ id: 'a' }), dto({ id: 'b' })]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });

  it('devuelve array vacío para entrada vacía', () => {
    expect(mapProductos([])).toHaveLength(0);
  });
});

