import { describe, expect, it } from 'vitest';
import { compararProductosPorTamano, coincideTamano, nombreProductoConTamano, SIN_TAMANO, tamanosDeProductos } from './tamanos';

const personal = { id: 'p', nombre: 'Personal', orden: 10, activo: true };
const familiar = { id: 'f', nombre: 'Familiar', orden: 40, activo: true };
const plato = { id: '1', nombre: 'Ceviche', tamanoId: personal.id, tamano: personal };

describe('tamaños explícitos de platos', () => {
  it('ordena por posición configurada y después nombre, no alfabéticamente por tamaño', () => {
    const entrada = [{ ...plato, id: 'f', tamano: familiar }, { ...plato, id: 'u', tamano: null }, plato];
    expect([...entrada].sort(compararProductosPorTamano).map((p) => p.id)).toEqual(['1', 'f', 'u']);
    expect(entrada[0].id).toBe('f');
  });
  it('respeta el orden de un tamaño personalizado', () => {
    const degustacion = { id: 'd', nombre: 'Degustación', orden: 5, activo: true };
    expect(tamanosDeProductos([plato, { tamano: degustacion }]).map((t) => t.id)).toEqual(['d', 'p']);
  });
  it('deduplica tamaños sin esconder los inactivos que están asignados', () => {
    expect(tamanosDeProductos([plato, plato, { tamano: { ...familiar, activo: false } }])).toHaveLength(2);
  });
  it('no adivina el tamaño por el nombre y compone la etiqueta de pedidos', () => {
    expect(nombreProductoConTamano(plato)).toBe('Ceviche · Personal');
    expect(nombreProductoConTamano({ nombre: 'Combo Familiar', tamano: null })).toBe('Combo Familiar');
  });
  it('filtra todos, tamaño explícito y sin tamaño', () => {
    expect(coincideTamano(plato, '')).toBe(true);
    expect(coincideTamano(plato, 'p')).toBe(true);
    expect(coincideTamano(plato, 'f')).toBe(false);
    expect(coincideTamano(plato, SIN_TAMANO)).toBe(false);
    expect(coincideTamano({ tamanoId: null }, SIN_TAMANO)).toBe(true);
  });
});
