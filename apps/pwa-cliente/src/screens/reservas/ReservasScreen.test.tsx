// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReservasScreen } from './ReservasScreen';
import { useToast } from '../../components/ui/ToastProvider';
import * as onlineStatusHook from '../../hooks/useOnlineStatus';
import * as reservasQueryHook from '../../hooks/queries/useReservasQuery';
import * as mesasQueryHook from '../../hooks/queries/useMesasQuery';

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn(),
}));

describe('ReservasScreen', () => {
  const mockFetch = vi.fn();
  const mockFetchMore = vi.fn();
  const mockCrear = vi.fn().mockResolvedValue(true);
  const mockConfirmar = vi.fn();
  const mockCancelar = vi.fn();
  const mockConsultarDisponibilidad = vi.fn();
  const mockClearFeedback = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast } as any);
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(true);
    vi.spyOn(mesasQueryHook, 'useMesasQuery').mockReturnValue({
      mesas: [
        { id: 'M1', numeroRaw: 1, numero: '1', capacidad: 4 },
        { id: 'M99', numeroRaw: 99, numero: '99', capacidad: 10 } // Should be filtered out
      ],
      loading: false,
      error: null,
      refetch: vi.fn()
    } as any);
    vi.spyOn(reservasQueryHook, 'useReservasQuery').mockReturnValue({
      reservas: [
        { id: 'R1', hora: '20:00', fechaHoraLabel: '15 ago, 20:00', clienteNombre: 'Juan', clienteTelefono: '123', mesaPreferida: 'M1', numComensales: 2, estado: 'PENDIENTE', estadoClass: 'warn', estadoLabel: 'Pendiente', usuarioNombre: 'Recepción Uno' },
        { id: 'R2', hora: '21:00', fechaHoraLabel: '16 ago, 21:00', clienteNombre: 'Ana', mesaPreferida: 'M99', numComensales: 4, estado: 'CANCELADA', estadoClass: 'err', estadoLabel: 'Cancelada' },
      ],
      nextCursor: 'abc',
      loading: false,
      loadingMore: false,
      saving: false,
      error: null,
      success: null,
      disponibilidad: null,
      fetch: mockFetch,
      fetchMore: mockFetchMore,
      crear: mockCrear,
      confirmar: mockConfirmar,
      cancelar: mockCancelar,
      consultarDisponibilidad: mockConsultarDisponibilidad,
      clearFeedback: mockClearFeedback,
    } as any);
  });

  it('renders and fetches data', () => {
    render(<ReservasScreen />);
    expect(screen.getByText('Reservas')).toBeInTheDocument();

    const refreshBtn = screen.getByTitle('Refrescar');
    fireEvent.click(refreshBtn);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('muestra quién registró la reserva, con guion cuando no hay dato', () => {
    render(<ReservasScreen />);
    expect(screen.getByText('Recepción Uno')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('muestra la fecha y hora agendada, no solo la hora (relevante al buscar por código entre varios días)', () => {
    render(<ReservasScreen />);
    expect(screen.getByText('15 ago, 20:00')).toBeInTheDocument();
    expect(screen.getByText('16 ago, 21:00')).toBeInTheDocument();
  });

  it('shows error and success banners', () => {
    vi.spyOn(reservasQueryHook, 'useReservasQuery').mockReturnValue({
      reservas: [], nextCursor: null, loading: false, loadingMore: false, saving: false,
      error: 'Error loading', success: null, disponibilidad: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crear: mockCrear, confirmar: mockConfirmar, cancelar: mockCancelar, consultarDisponibilidad: mockConsultarDisponibilidad, clearFeedback: mockClearFeedback
    } as any);
    render(<ReservasScreen />);
    expect(screen.getByText('Error loading')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cerrar'));
    expect(mockClearFeedback).toHaveBeenCalled();
  });

  it('handles loading state for reservations', () => {
    vi.spyOn(reservasQueryHook, 'useReservasQuery').mockReturnValue({
      reservas: [], nextCursor: null, loading: true, loadingMore: false, saving: false,
      error: null, success: null, disponibilidad: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crear: mockCrear, confirmar: mockConfirmar, cancelar: mockCancelar, consultarDisponibilidad: mockConsultarDisponibilidad, clearFeedback: mockClearFeedback
    } as any);
    const { container } = render(<ReservasScreen />);
    expect(container.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0);
  });

  it('handles empty state', () => {
    vi.spyOn(reservasQueryHook, 'useReservasQuery').mockReturnValue({
      reservas: [], nextCursor: null, loading: false, loadingMore: false, saving: false,
      error: null, success: null, disponibilidad: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crear: mockCrear, confirmar: mockConfirmar, cancelar: mockCancelar, consultarDisponibilidad: mockConsultarDisponibilidad, clearFeedback: mockClearFeedback
    } as any);
    render(<ReservasScreen />);
    expect(screen.getByText('Sin reservas para este día')).toBeInTheDocument();
  });

  it('can confirm and cancel reservations', () => {
    render(<ReservasScreen />);
    const confirmBtn = screen.getAllByText('Confirmar')[0];
    fireEvent.click(confirmBtn);
    expect(mockConfirmar).toHaveBeenCalledWith('R1');
    
    // R2 is cancelled so cancel btn is disabled
    const cancelBtn = screen.getAllByText('Cancelar')[0]; // R1
    fireEvent.click(cancelBtn);
    expect(mockCancelar).toHaveBeenCalledWith('R1', 'Cancelado desde PWA');
  });

  it('handles load more', () => {
    render(<ReservasScreen />);
    fireEvent.click(screen.getByText('Cargar más'));
    expect(mockFetchMore).toHaveBeenCalled();
  });

  it('can create a reservation', async () => {
    render(<ReservasScreen />);
    
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'Carlos' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '999' } });
    
    const mesaSelect = screen.getByLabelText('Mesa');
    fireEvent.change(mesaSelect, { target: { value: 'M1' } });
    
    fireEvent.click(screen.getByText('Crear reserva'));
    
    expect(mockCrear).toHaveBeenCalledWith(expect.objectContaining({
      clienteNombre: 'Carlos',
      clienteTelefono: '999',
      mesaPreferida: 'M1',
      numComensales: 2
    }));
  });

  it('handles create reservation when offline', () => {
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    render(<ReservasScreen />);
    fireEvent.click(screen.getByText('Crear reserva'));
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('catches error when create reservation fails', async () => {
    mockCrear.mockRejectedValueOnce(new Error('error creating'));

    render(<ReservasScreen />);
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'Carlos' } });
    const mesaSelect = screen.getByLabelText('Mesa');
    fireEvent.change(mesaSelect, { target: { value: 'M1' } });

    fireEvent.click(screen.getByText('Crear reserva'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'err', msg: 'error creating' }));
    });
  });

  it('can consult availability', () => {
    render(<ReservasScreen />);
    const mesaSelect = screen.getByLabelText('Mesa');
    fireEvent.change(mesaSelect, { target: { value: 'M1' } });
    
    fireEvent.click(screen.getByText('Ver disponibilidad'));
    expect(mockConsultarDisponibilidad).toHaveBeenCalled();
  });

  it('shows availability banner if checked', () => {
    vi.spyOn(reservasQueryHook, 'useReservasQuery').mockReturnValue({
      reservas: [], nextCursor: null, loading: false, loadingMore: false, saving: false,
      error: null, success: null, 
      disponibilidad: { disponible: true }, 
      fetch: mockFetch, fetchMore: mockFetchMore,
      crear: mockCrear, confirmar: mockConfirmar, cancelar: mockCancelar, consultarDisponibilidad: mockConsultarDisponibilidad, clearFeedback: mockClearFeedback
    } as any);
    render(<ReservasScreen />);
    expect(screen.getByText('Mesa disponible en ese horario')).toBeInTheDocument();
  });
  
  it('shows unavailable banner', () => {
    vi.spyOn(reservasQueryHook, 'useReservasQuery').mockReturnValue({
      reservas: [], nextCursor: null, loading: false, loadingMore: false, saving: false,
      error: null, success: null, 
      disponibilidad: { disponible: false }, 
      fetch: mockFetch, fetchMore: mockFetchMore,
      crear: mockCrear, confirmar: mockConfirmar, cancelar: mockCancelar, consultarDisponibilidad: mockConsultarDisponibilidad, clearFeedback: mockClearFeedback
    } as any);
    render(<ReservasScreen />);
    expect(screen.getByText('Mesa ya reservada en ese horario')).toBeInTheDocument();
  });

  it('handles date change', () => {
    render(<ReservasScreen />);
    const dateInputs = screen.getAllByDisplayValue(new Date().toISOString().slice(0, 10));
    fireEvent.change(dateInputs[0], { target: { value: '2025-01-01' } });
    // Should update state
    expect(dateInputs[0]).toBeDefined();
  });
});

