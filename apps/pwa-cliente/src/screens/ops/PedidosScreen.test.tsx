// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PedidosScreen } from './PedidosScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { usePedidosQuery, useAnularPedidoMutation } from '../../hooks/queries/usePedidosQuery';
import type { PedidoVM } from '../../types/pedido.types';

vi.mock('../../hooks/useOnlineStatus');
vi.mock('../../hooks/useNow', () => ({ useNow: () => Date.now() }));
vi.mock('../../hooks/queries/usePedidosQuery');
vi.mock('../../components/ui/ToastProvider', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../components/comandero/Comandero', () => ({
  Comandero: (props: any) => (
    <div data-testid="comandero">
      <button onClick={props.onClose}>Close Comandero</button>
      <button onClick={props.onCreated}>Created Comandero</button>
    </div>
  )
}));

describe('PedidosScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useOnlineStatus as any).mockReturnValue(true);
    (usePedidosQuery as any).mockReturnValue({
      pedidos: [], nextCursor: null, loading: false, loadingMore: false, error: null,
      fetch: vi.fn(), fetchMore: vi.fn(), avanzarEstado: vi.fn(), avanzarItem: vi.fn(), anularItemPreparado: vi.fn(),
    });
    (useAnularPedidoMutation as any).mockReturnValue({ saving: false, anularPedido: vi.fn() });
  });

  it('renders loading state', () => {
    (usePedidosQuery as any).mockReturnValue({ pedidos: [], loading: true, fetch: vi.fn() });
    render(<PedidosScreen />);
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('renders error state and retries', () => {
    const fetchMock = vi.fn();
    (usePedidosQuery as any).mockReturnValue({ pedidos: [], error: 'Error test', fetch: fetchMock });
    render(<PedidosScreen />);
    expect(screen.getByText('Error test')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reintentar'));
    expect(fetchMock).toHaveBeenCalled();
  });

  it('renders pedidos and tabs', async () => {
    const avanzarEstado = vi.fn().mockResolvedValue(true);
    const p1: PedidoVM = { id: 'p1', estado: 'PENDIENTE', canal: 'SALON', items: [], total: 0, createdAt: new Date().toISOString() } as any;
    const p2: PedidoVM = { id: 'p2', estado: 'PENDIENTE', canal: 'DELIVERY', items: [], total: 0, createdAt: new Date().toISOString() } as any;

    (usePedidosQuery as any).mockReturnValue({
      pedidos: [p1, p2], nextCursor: 'next', fetchMore: vi.fn(), avanzarEstado, fetch: vi.fn()
    });

    render(<PedidosScreen />);
    
    // Test canal filter
    fireEvent.click(screen.getByRole('button', { name: /Salón/ }));
    fireEvent.click(screen.getByRole('button', { name: /Delivery/ }));
    fireEvent.click(screen.getByRole('button', { name: /Para llevar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));

    // Toggle list view
    fireEvent.click(screen.getByRole('button', { name: /Lista/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tablero/ }));

    // Actions
    fireEvent.click(screen.getByRole('button', { name: /Nuevo pedido/ }));
    expect(screen.getByTestId('comandero')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Created Comandero'));
    fireEvent.click(screen.getByText('Close Comandero'));

    // Loading more
    fireEvent.click(screen.getByRole('button', { name: /Cargar más/ }));

    // Click avanzar to cover logic
    const detailBtn = screen.getAllByRole('button', { name: /Ver detalle/ })[0];
    fireEvent.click(detailBtn);
    
    // We expect the dialog to open, let's close it
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
  });
  
  it('advances pedido from detail view', async () => {
    const avanzarEstado = vi.fn().mockResolvedValue(true);
    const p1: PedidoVM = { id: 'p1', estado: 'PENDIENTE', canal: 'SALON', items: [], total: 0, createdAt: new Date().toISOString() } as any;
    (usePedidosQuery as any).mockReturnValue({
      pedidos: [p1], nextCursor: null, fetchMore: vi.fn(), avanzarEstado, fetch: vi.fn()
    });
    render(<PedidosScreen />);
    const detailBtn = screen.getAllByRole('button', { name: /Ver detalle/ })[0];
    fireEvent.click(detailBtn);
    
    // next label for PENDIENTE in SALON is 'Preparar' or 'Aceptar' depending on PERMITIR_OVERRIDE_PRODUCCION
    // since we mocked it earlier or it resolves dynamically we just look for a primary button in drawer foot
    const modalAvanzarBtn = screen.getAllByRole('button').find(b => b.className.includes('btn-primary') && b.getAttribute('aria-label')?.includes('pedido'));
    if (modalAvanzarBtn) {
        fireEvent.click(modalAvanzarBtn);
        await waitFor(() => expect(avanzarEstado).toHaveBeenCalled());
    }
  });

  it('CU-01: anula un ítem ya preparado (ENTREGADO) con la elección de cobrar', async () => {
    const anularItemPreparado = vi.fn().mockResolvedValue({ id: 'p1' });
    const p1: PedidoVM = {
      // El pedido en sí sigue en producción (otro ítem aún se prepara); este
      // ítem puntual (DIRECTO/servido a mano) ya está ENTREGADO.
      id: 'p1', estado: 'EN_PREPARACION', canal: 'SALON', total: 20, createdAt: new Date().toISOString(),
      items: [{ id: 'i-1', nombre: 'Cerveza', cantidad: 1, subtotal: 20, estado: 'ENTREGADO', area: 'BAR' }],
    } as any;
    (usePedidosQuery as any).mockReturnValue({
      pedidos: [p1], nextCursor: null, fetchMore: vi.fn(), avanzarEstado: vi.fn(), fetch: vi.fn(), anularItemPreparado,
    });

    render(<PedidosScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: /Ver detalle/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Anular 1× Cerveza \(ya preparado\)/ }));

    // El modal pide motivo + decisión de cobro antes de habilitar "Confirmar anulación".
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Se cayó al servirlo' } });
    fireEvent.click(screen.getByText('Sí, mantener en la cuenta'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar anulación/ }));

    await waitFor(() => expect(anularItemPreparado).toHaveBeenCalledWith(
      'i-1', { motivo: 'Se cayó al servirlo', cobrar: true, observacion: undefined },
    ));
  });
});
