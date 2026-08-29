// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DetallePedido } from './DetallePedido';
import type { PedidoVM } from '../../types/pedido.types';

vi.mock('./pedidos.meta', () => ({
  CANAL_META: {
    SALON: { label: 'Salón', cls: 'salon', ic: 'Mesas' },
    DELIVERY: { label: 'Delivery', cls: 'delivery', ic: 'Delivery' },
    LLEVAR: { label: 'Llevar', cls: 'llevar', ic: 'Bag' },
  },
  nextLabelFor: vi.fn(() => 'Avanzar Test')
}));

const mockPedido = (canal: 'SALON'|'DELIVERY'|'LLEVAR', items?: unknown[]): PedidoVM => ({
  id: '1234567890',
  canal,
  estado: 'PENDIENTE',
  estadoLabel: 'Pendiente',
  estadoClass: 'pendiente',
  mesaNumero: canal === 'SALON' ? '12' : undefined,
  cliente: 'Test Client',
  telefono: canal === 'DELIVERY' ? '1234' : undefined,
  direccion: canal === 'DELIVERY' ? 'Dir 1' : undefined,
  proveedor: canal === 'DELIVERY' ? 'Rappi' : undefined,
  cantidadItems: 2,
  total: 100,
  createdAt: new Date().toISOString(),
  items: items ?? [
    { id: '1', nombre: 'Pizza', cantidad: 1, subtotal: 50, estado: 'PENDIENTE', area: 'COCINA' },
    { id: '2', nombre: 'Coca', cantidad: 1, subtotal: 50, estado: 'PENDIENTE', area: 'BAR', notas: 'Sin hielo' }
  ]
} as any);

const noop = () => { /* no-op */ };

describe('DetallePedido', () => {
  it('renders correctly for SALON', () => {
    const onAvanzar = vi.fn();
    const onClose = vi.fn();
    render(<DetallePedido pedido={mockPedido('SALON')} onClose={onClose} onAvanzar={onAvanzar} onAnularItem={noop} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />);
    expect(screen.getByText('Mesa 12')).toBeInTheDocument();
    expect(screen.getByText('12345678')).toBeInTheDocument();

    // click close
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders correctly for DELIVERY', () => {
    const onAvanzar = vi.fn();
    const onClose = vi.fn();
    render(<DetallePedido pedido={mockPedido('DELIVERY')} onClose={onClose} onAvanzar={onAvanzar} onAnularItem={noop} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />);
    expect(screen.getByText('Test Client')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.getByText('Dir 1')).toBeInTheDocument();
    expect(screen.getByText('Rappi')).toBeInTheDocument();
  });

  it('renders correctly for LLEVAR without cliente', () => {
    const onAvanzar = vi.fn();
    const onClose = vi.fn();
    const ped = mockPedido('LLEVAR');
    delete (ped as any).cliente;
    render(<DetallePedido pedido={ped} onClose={onClose} onAvanzar={onAvanzar} onAnularItem={noop} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />);
    expect(screen.getByText('Cliente')).toBeInTheDocument();
  });

  it('calls onAvanzar', () => {
    const onAvanzar = vi.fn();
    const onClose = vi.fn();
    render(<DetallePedido pedido={mockPedido('SALON')} onClose={onClose} onAvanzar={onAvanzar} onAnularItem={noop} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />);
    const btn = screen.getByRole('button', { name: /Avanzar Test/i });
    fireEvent.click(btn);
    expect(onAvanzar).toHaveBeenCalled();
  });

  it('shows spinner when actionLoading matches id', () => {
    const { container } = render(<DetallePedido pedido={mockPedido('SALON')} onClose={vi.fn()} onAvanzar={vi.fn()} onAnularItem={noop} onAnularPedido={noop} actionLoading="1234567890" online={true} now={Date.now()} />);
    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<DetallePedido pedido={mockPedido('SALON')} onClose={onClose} onAvanzar={vi.fn()} onAnularItem={noop} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />);
    fireEvent.keyDown(globalThis, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  describe('anular ítem: mismo botón para ya preparado (ENTREGADO) y para pendiente', () => {
    const items = [
      { id: '1', nombre: 'Pizza', cantidad: 1, subtotal: 50, estado: 'PENDIENTE', area: 'COCINA' },
      { id: '2', nombre: 'Coca', cantidad: 1, subtotal: 20, estado: 'ENTREGADO', area: 'BAR' },
      { id: '3', nombre: 'Torta', cantidad: 1, subtotal: 30, estado: 'CANCELADO', area: 'COCINA' },
    ];

    it('un ítem PENDIENTE muestra "Anular" y llama onAnularItem con el ítem completo', () => {
      const onAnularItem = vi.fn();
      render(
        <DetallePedido pedido={mockPedido('SALON', items)} onClose={noop} onAvanzar={noop} onAnularItem={onAnularItem} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Anular 1× Pizza/ }));
      expect(onAnularItem).toHaveBeenCalledWith(expect.objectContaining({ id: '1', nombre: 'Pizza', estado: 'PENDIENTE' }));
    });

    it('un ítem ENTREGADO muestra "Anular (ya preparado)" y llama onAnularItem con el ítem completo', () => {
      const onAnularItem = vi.fn();
      render(
        <DetallePedido pedido={mockPedido('SALON', items)} onClose={noop} onAvanzar={noop} onAnularItem={onAnularItem} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Anular 1× Coca \(ya preparado\)/ }));
      expect(onAnularItem).toHaveBeenCalledWith(expect.objectContaining({ id: '2', nombre: 'Coca', estado: 'ENTREGADO' }));
    });

    it('un ítem CANCELADO no muestra ningún botón de anular', () => {
      render(
        <DetallePedido pedido={mockPedido('SALON', items)} onClose={noop} onAvanzar={noop} onAnularItem={noop} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />,
      );
      expect(screen.queryByRole('button', { name: /Anular 1× Torta/ })).not.toBeInTheDocument();
    });
  });

  describe('anular pedido (salvavidas operativo: sacar el pedido del tablero)', () => {
    it('un pedido activo muestra "Anular pedido" y llama onAnularPedido con el pedido completo', () => {
      const onAnularPedido = vi.fn();
      render(
        <DetallePedido pedido={mockPedido('SALON')} onClose={noop} onAvanzar={noop} onAnularItem={noop} onAnularPedido={onAnularPedido} actionLoading={null} online={true} now={Date.now()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Anular pedido/ }));
      expect(onAnularPedido).toHaveBeenCalledWith(expect.objectContaining({ id: '1234567890' }));
    });

    it('un pedido ya CANCELADO no muestra "Anular pedido"', () => {
      const ped = { ...mockPedido('SALON'), estado: 'CANCELADO' };
      render(
        <DetallePedido pedido={ped} onClose={noop} onAvanzar={noop} onAnularItem={noop} onAnularPedido={noop} actionLoading={null} online={true} now={Date.now()} />,
      );
      expect(screen.queryByRole('button', { name: /Anular pedido/ })).not.toBeInTheDocument();
    });
  });
});
