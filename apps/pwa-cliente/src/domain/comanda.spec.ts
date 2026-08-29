// @vitest-environment jsdom
// @ts-nocheck
import { describe, expect, it } from 'vitest';
import * as comanda from './comanda';
import type { CartLine } from './comanda';
import type { ProductoVM } from '../types/inventario.types';

function producto(id: string, precio: number, categoriaNombre: string | null = 'Platos', stockActual: number | null = null): ProductoVM {
  return {
    id,
    categoriaId: 'c1',
    categoriaNombre,
    nombre: `Producto ${id}`,
    descripcion: null,
    precio,
    precioLabel: `S/ ${precio}`,
    disponible: true,
    stockActual,
    stockLabel: '',
    stockClass: '',
  };
}

function line(id: string, precio: number, cantidad: number, notas = '', categoriaNombre: string | null = 'Platos', stockActual: number | null = null): CartLine {
  return { producto: producto(id, precio, categoriaNombre, stockActual), cantidad, notas, noteOpen: false };
}

describe('domain/comanda — reducers de líneas', () => {
  it('addProducto agrega una línea nueva con cantidad 1', () => {
    const out = comanda.addProducto([], producto('a', 10));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ cantidad: 1, notas: '', noteOpen: false });
  });

  it('addProducto incrementa la cantidad si el producto ya está', () => {
    const out = comanda.addProducto([line('a', 10, 1)], producto('a', 10));
    expect(out).toHaveLength(1);
    expect(out[0].cantidad).toBe(2);
  });

  it('incLine suma/resta y elimina la línea al llegar a 0', () => {
    expect(comanda.incLine([line('a', 10, 1)], 'a', 1)[0].cantidad).toBe(2);
    expect(comanda.incLine([line('a', 10, 1)], 'a', -1)).toHaveLength(0);
    expect(comanda.incLine([line('a', 10, 2)], 'b', 1)[0].cantidad).toBe(2); // otra id: sin cambios
  });

  it('delLine quita la línea indicada', () => {
    expect(comanda.delLine([line('a', 10, 1), line('b', 5, 1)], 'a')).toHaveLength(1);
  });

  it('setNota y toggleNote actualizan solo la línea objetivo', () => {
    const ls = [line('a', 10, 1), line('b', 5, 1)];
    expect(comanda.setNota(ls, 'a', 'sin sal')[0].notas).toBe('sin sal');
    expect(comanda.toggleNote(ls, 'b')[1].noteOpen).toBe(true);
  });
});

describe('domain/comanda — appendNotaRapida', () => {
  it('usa la nota tal cual cuando no hay nota previa', () => {
    expect(comanda.appendNotaRapida('', 'sin cebolla')).toBe('sin cebolla');
  });
  it('concatena con coma y evita duplicados', () => {
    expect(comanda.appendNotaRapida('sin sal', 'sin cebolla')).toBe('sin sal, sin cebolla');
    expect(comanda.appendNotaRapida('sin sal', 'sin sal')).toBe('sin sal');
  });
});

describe('domain/comanda — calcTotales', () => {
  it('suma subtotal, deriva IGV (18% incluido) y cuenta ítems', () => {
    const t = comanda.calcTotales([line('a', 100, 2), line('b', 18, 1)]);
    expect(t.subtotal).toBe(218);
    expect(t.totalItems).toBe(3);
    expect(t.igv).toBeCloseTo(218 - 218 / 1.18, 6);
  });
  it('totales en cero para comanda vacía', () => {
    expect(comanda.calcTotales([])).toEqual({ subtotal: 0, igv: 0, totalItems: 0 });
  });
});

describe('domain/comanda — contextoValido', () => {
  it('SALON requiere mesa efectiva', () => {
    expect(comanda.contextoValido('SALON', { effectiveMesaId: 'm1', cliente: '', dir: '' })).toBe(true);
    expect(comanda.contextoValido('SALON', { effectiveMesaId: '', cliente: 'x', dir: 'y' })).toBe(false);
  });
  it('DELIVERY requiere cliente y dirección', () => {
    expect(comanda.contextoValido('DELIVERY', { effectiveMesaId: '', cliente: 'Ana', dir: 'Av 1' })).toBe(true);
    expect(comanda.contextoValido('DELIVERY', { effectiveMesaId: '', cliente: 'Ana', dir: '  ' })).toBe(false);
  });
  it('LLEVAR requiere solo cliente', () => {
    expect(comanda.contextoValido('LLEVAR', { effectiveMesaId: '', cliente: 'Ana', dir: '' })).toBe(true);
    expect(comanda.contextoValido('LLEVAR', { effectiveMesaId: '', cliente: '  ', dir: '' })).toBe(false);
  });
});

describe('domain/comanda — buildItems', () => {
  it('mapea a payload con área BAR para productos con stock (Inventario) y COCINA para el resto (Carta)', () => {
    const items = comanda.buildItems([
      line('a', 10, 2, 'sin hielo', 'Cerveza', 24),
      line('b', 20, 1, '', 'Platos', null),
    ]);
    expect(items).toEqual([
      { productoId: 'a', cantidad: 2, area: 'BAR', notas: 'sin hielo' },
      { productoId: 'b', cantidad: 1, area: 'COCINA', notas: '' },
    ]);
  });

  it('un producto con stock en 0 sigue siendo BAR (0 no es null)', () => {
    const items = comanda.buildItems([line('a', 10, 1, '', 'Gaseosas', 0)]);
    expect(items[0].area).toBe('BAR');
  });
});

describe('domain/comanda — resolveTargetMesaId', () => {
  const mesas = [
    { id: 'fisica', numeroRaw: 5 },
    { id: 'delivery', numeroRaw: comanda.MESA_DELIVERY_NUM },
    { id: 'llevar', numeroRaw: comanda.MESA_LLEVAR_NUM },
  ];
  it('SALON usa la mesa efectiva', () => {
    expect(comanda.resolveTargetMesaId('SALON', 'fisica', mesas)).toBe('fisica');
  });
  it('DELIVERY/LLEVAR resuelven la mesa virtual correspondiente', () => {
    expect(comanda.resolveTargetMesaId('DELIVERY', '', mesas)).toBe('delivery');
    expect(comanda.resolveTargetMesaId('LLEVAR', '', mesas)).toBe('llevar');
  });
  it('devuelve cadena vacía si la mesa virtual no existe', () => {
    expect(comanda.resolveTargetMesaId('DELIVERY', '', [])).toBe('');
  });
});

