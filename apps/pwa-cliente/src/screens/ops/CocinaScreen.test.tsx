// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CocinaScreen } from './CocinaScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { usePedidosQuery } from '../../hooks/queries/usePedidosQuery';
import type { PedidoVM } from '../../types/pedido.types';

// mocks
vi.mock('../../hooks/useOnlineStatus');
vi.mock('../../hooks/useNow', () => ({ useNow: () => Date.now() }));
vi.mock('../../hooks/queries/usePedidosQuery');
vi.mock('../../components/ui/ToastProvider', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../services/socket.service', () => ({ onPedidoUpdate: () => () => {} }));
vi.mock('../../components/cocina/TicketCard', () => ({
  Metric: (props: any) => <div data-testid="metric">{props.k}: {props.v}</div>,
  TicketCard: (props: any) => (
    <div data-testid="ticket-card">
      <button onClick={() => props.onAdvance(props.items[0].id, props.items[0].estado)}>Advance</button>
      <button onClick={() => props.onRegress(props.items[0].id, props.items[0].estado)}>Regress</button>
      <button onClick={() => props.onBump()}>Bump</button>
    </div>
  )
}));

describe('CocinaScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useOnlineStatus as any).mockReturnValue(true);
    (usePedidosQuery as any).mockReturnValue({
      pedidos: [], loading: false, error: null, fetch: vi.fn(), avanzarItem: vi.fn()
    });
  });

  it('renders loading state', () => {
    (usePedidosQuery as any).mockReturnValue({
      pedidos: [], loading: true, error: null, fetch: vi.fn(), avanzarItem: vi.fn()
    });
    render(<CocinaScreen />);
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('renders error state and retries', () => {
    const fetchMock = vi.fn();
    (usePedidosQuery as any).mockReturnValue({
      pedidos: [], loading: false, error: 'Test error', fetch: fetchMock, avanzarItem: vi.fn()
    });
    render(<CocinaScreen />);
    expect(screen.getByText('Test error')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reintentar'));
    expect(fetchMock).toHaveBeenCalled();
  });

  it('renders correctly with pedidos and handles interactions', async () => {
    const avanzarItem = vi.fn().mockResolvedValue(true);
    const fetchMock = vi.fn();
    const p: PedidoVM = {
      id: 'p1', estado: 'PENDIENTE', canal: 'SALON',
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      items: [
        { id: 'i1', nombre: 'Item 1', cantidad: 1, estado: 'PENDIENTE', area: 'COCINA' },
        { id: 'i2', nombre: 'Item 2', cantidad: 3, estado: 'PENDIENTE', area: 'BAR' } // hot
      ]
    } as any;

    (usePedidosQuery as any).mockReturnValue({
      pedidos: [p], loading: false, error: null, fetch: fetchMock, avanzarItem
    });

    render(<CocinaScreen />);
    
    // tabs
    const barTab = screen.getByRole('button', { name: /Barra/ });
    fireEvent.click(barTab);

    // metric
    expect(screen.getAllByTestId('metric').length).toBe(4);

    // card interactions
    const advanceBtn = screen.getAllByText('Advance')[0];
    fireEvent.click(advanceBtn);
    await waitFor(() => expect(avanzarItem).toHaveBeenCalledWith('i2', 'EN_PREPARACION')); // next of PENDIENTE is EN_PREPARACION

    const regressBtn = screen.getAllByText('Regress')[0];
    fireEvent.click(regressBtn);

    const bumpBtn = screen.getAllByText('Bump')[0];
    fireEvent.click(bumpBtn);

    // header buttons
    fireEvent.click(screen.getByTitle('Refrescar'));
    expect(fetchMock).toHaveBeenCalled();

    // full screen
    fireEvent.click(screen.getByTitle('Pantalla completa'));
    expect(screen.getByText('Salir')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Salir'));
    expect(screen.queryByText('Salir')).not.toBeInTheDocument();
  });

  it('handles offline correctly', () => {
    const avanzarItem = vi.fn();
    (useOnlineStatus as any).mockReturnValue(false);
    const p: PedidoVM = {
      id: 'p1', estado: 'PENDIENTE', canal: 'SALON',
      createdAt: new Date().toISOString(),
      items: [{ id: 'i1', nombre: 'Item 1', cantidad: 1, estado: 'PENDIENTE', area: 'COCINA' }]
    } as any;

    (usePedidosQuery as any).mockReturnValue({
      pedidos: [p], loading: false, error: null, fetch: vi.fn(), avanzarItem
    });

    render(<CocinaScreen />);
    fireEvent.click(screen.getByText('Advance'));
    fireEvent.click(screen.getByText('Regress'));
    fireEvent.click(screen.getByText('Bump'));
    expect(avanzarItem).not.toHaveBeenCalled();
  });
});
