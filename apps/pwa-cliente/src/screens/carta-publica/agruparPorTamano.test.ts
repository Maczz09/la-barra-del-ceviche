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
  it('agrupa tamaños legados mientras el servidor aún no envía los campos de tamaño', () => {
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Arroz con Conchas (Personal)', precio: 30 }),
      producto({ id: 'p2', nombre: 'Arroz con Conchas (Mediana)', precio: 35 }),
      producto({ id: 'p3', nombre: 'Arroz con Conchas (Familiar)', precio: 40 }),
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('Arroz con Conchas');
    expect(resultado[0].variantes?.map((v) => [v.nombre, v.precio])).toEqual([['Personal', 30], ['Mediana', 35], ['Familiar', 40]]);
    expect(resultado[0].precioUnico).toBeUndefined();
  });

  it('degrada a precio único un plato sin sufijo de tamaño', () => {
    const resultado = agruparPorTamano([producto({ id: 'p1', nombre: 'Chicha Morada', precio: 8 })]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('Chicha Morada');
    expect(resultado[0].precioUnico).toBe(8);
    expect(resultado[0].variantes).toBeUndefined();
  });

  it('un plato con solo 2 de 3 tamaños disponibles muestra solo esos 2 (el 86\'d no aparece)', () => {
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Ceviche de Filete (Personal)', precio: 30 }),
      producto({ id: 'p2', nombre: 'Ceviche de Filete (Familiar)', precio: 40 }),
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].variantes?.map((v) => [v.nombre, v.precio])).toEqual([['Personal', 30], ['Familiar', 40]]);
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

  it('usa el nombre base y los tamaños de BD en el orden configurado, incluidos tamaños propios', () => {
    const tamanos = [
      { id: 'familia', nombre: 'Familiar', orden: 40, activo: true },
      { id: 'degusta', nombre: 'Degustación', orden: 0, activo: true },
      { id: 'personal', nombre: 'Personal', orden: 10, activo: true },
      { id: 'mediano', nombre: 'Mediano', orden: 20, activo: true },
      { id: 'grande', nombre: 'Grande', orden: 30, activo: true },
    ];
    const resultado = agruparPorTamano(tamanos.map((tamano, i) => producto({
      id: `p${i}`, nombre: 'Arroz con mariscos', tamanoId: tamano.id, tamano, precio: 12.5 + i,
    })));

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('Arroz con mariscos');
    expect(resultado[0].variantes?.map((v) => v.nombre)).toEqual(['Degustación', 'Personal', 'Mediano', 'Grande', 'Familiar']);
    expect(resultado[0].variantes?.map((v) => v.precio)).toEqual([13.5, 14.5, 15.5, 16.5, 12.5]);
  });

  it('no borra precios de productos duplicados con el mismo nombre y tamaño', () => {
    const tamano = { id: 'personal', nombre: 'Personal', orden: 10, activo: true };
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Especial', tamano, precio: 20 }),
      producto({ id: 'p2', nombre: 'Especial', tamano, precio: 25 }),
      producto({ id: 'p3', nombre: 'Especial', tamano: null, tamanoId: null, precio: 15 }),
    ]);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].variantes?.map((v) => [v.productoId, v.precio])).toEqual([['p1', 20], ['p2', 25]]);
    expect(resultado[1].precioUnico).toBe(15);
  });

  it('no infiere un tamaño del nombre cuando la BD indica sin tamaño o da un tamaño explícito', () => {
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Combo (Familiar)', tamanoId: null, tamano: null }),
      producto({ id: 'p2', nombre: 'Especial · Grande', tamanoId: 'duo', tamano: { id: 'duo', nombre: 'Para dos', orden: 5, activo: true } }),
    ]);
    expect(resultado[0].nombre).toBe('Combo (Familiar)');
    expect(resultado[0].precioUnico).toBe(10);
    expect(resultado[1].nombre).toBe('Especial · Grande');
    expect(resultado[1].variantes?.[0].nombre).toBe('Para dos');
  });

  it('tolera relación de tamaño ausente sin ocultar el plato ni inventar precios', () => {
    const resultado = agruparPorTamano([producto({ id: 'p1', nombre: 'Ceviche', tamanoId: 'no-cargado', precio: 32.5 })]);
    expect(resultado[0]).toMatchObject({ nombre: 'Ceviche', precioUnico: 32.5 });
  });

  it('acepta Grande y el separador punto medio solo en compatibilidad legada', () => {
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Ceviche · Familiar', precio: 45 }),
      producto({ id: 'p2', nombre: 'Ceviche · Personal', precio: 15 }),
      producto({ id: 'p3', nombre: 'Ceviche (Grande)', precio: 35 }),
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].variantes?.map((v) => [v.nombre, v.precio])).toEqual([['Personal', 15], ['Grande', 35], ['Familiar', 45]]);
  });

  it('no publica productos desactivados pero conserva tamaños ya usados aunque se desactiven para altas', () => {
    const tamano = { id: 'familiar', nombre: 'Familiar', orden: 40, activo: false };
    const resultado = agruparPorTamano([
      producto({ id: 'p1', nombre: 'Ceviche', tamano, disponible: false, precio: 30 }),
      producto({ id: 'p2', nombre: 'Arroz', tamano, disponible: true, precio: 35 }),
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('Arroz');
    expect(resultado[0].variantes?.[0].precio).toBe(35);
  });
});
