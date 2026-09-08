import { describe, expect, it } from 'vitest';
import { etapasQueIngresan, snapshotCocina, snapshotPedidos } from './alertasTablero';
import type { PedidoVM } from '../types/pedido.types';

const pedido = (overrides: Partial<PedidoVM> = {}): PedidoVM => ({
  id: 'pedido-1', mesaId: 'mesa-1', mesaNumero: '01', total: 25,
  estado: 'PENDIENTE', estadoClass: 'pendiente', estadoLabel: 'Pendiente',
  createdAt: '2026-09-07T18:00:00.000Z', canal: 'SALON', cantidadItems: 1,
  items: [{
    id: 'item-1', productoId: 'prod-1', nombre: 'Ceviche', cantidad: 1,
    precioUnitario: 25, subtotal: 25, area: 'COCINA', notas: '',
    estado: 'PENDIENTE', estadoClass: 'pendiente', estadoLabel: 'Pendiente',
  }],
  ...overrides,
});

describe('alertas de tablero', () => {
  it('distingue los sonidos de cada columna del tablero de pedidos', () => {
    const anterior = snapshotPedidos([pedido()]);
    const actual = snapshotPedidos([
      pedido({ estado: 'EN_PREPARACION' }),
      pedido({ id: 'pedido-2', estado: 'LISTO' }),
      pedido({ id: 'pedido-3', estado: 'PENDIENTE' }),
    ]);

    expect(etapasQueIngresan(anterior, actual)).toEqual(['PENDIENTE', 'EN_PREPARACION', 'LISTO']);
  });

  it('en cocina cuenta solo ítems de cocina y agrupa varios ítems en una sola alerta', () => {
    const anterior = snapshotCocina([pedido()]);
    const actual = snapshotCocina([pedido({
      items: [
        { ...pedido().items[0], estado: 'EN_PREPARACION' },
        { ...pedido().items[0], id: 'item-2', estado: 'EN_PREPARACION' },
        { ...pedido().items[0], id: 'item-bar', area: 'BAR', estado: 'LISTO' },
      ],
    })]);

    expect(etapasQueIngresan(anterior, actual)).toEqual(['EN_PREPARACION']);
  });

  it('no genera alerta cuando el snapshot no cambió', () => {
    const actual = snapshotCocina([pedido()]);
    expect(etapasQueIngresan(actual, actual)).toEqual([]);
  });
});
