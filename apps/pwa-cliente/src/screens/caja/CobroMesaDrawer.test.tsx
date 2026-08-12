// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CobroMesaDrawer } from './CobroMesaDrawer';
import { useCuentasQuery } from '../../hooks/queries/useCuentasQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn()
}));

vi.mock('../../hooks/queries/useCuentasQuery', () => ({
  useCuentasQuery: vi.fn()
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: vi.fn()
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn()
}));

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    Close: () => <svg data-testid="icon-close" />,
    Cash: () => <svg data-testid="icon-cash" />,
    Card: () => <svg data-testid="icon-card" />,
    Wallet: () => <svg data-testid="icon-wallet" />,
    Coins: () => <svg data-testid="icon-coins" />,
    Alert: () => <svg data-testid="icon-alert" />,
    Check: () => <svg data-testid="icon-check" />,
    Print: () => <svg data-testid="icon-print" />
  }
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn()
}));

const mockCuenta = {
  id: 'cuenta1',
  mesaId: 'mesa1',
  estado: 'ABIERTA',
  total: 100,
  cantidadItems: 2,
  pedidos: [
    {
      id: 'ped1',
      items: [
        { id: 'it1', nombre: 'Plato 1', cantidad: 1, subtotal: 60 },
        { id: 'it2', nombre: 'Plato 2', cantidad: 1, subtotal: 40 }
      ]
    }
  ]
};

describe('CobroMesaDrawer', () => {
  beforeEach(() => {
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: false } as any);
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn(),
      refetchCuenta: vi.fn()
    } as any);
  });

  it('renders and handles exact cash payment', async () => {
    const registrarPago = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago,
      clearFeedback: vi.fn()
    } as any);

    const onClose = vi.fn();
    const onPaid = vi.fn();

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} onPaid={onPaid} />);

    expect(screen.getByText('Plato 1')).toBeDefined();
    
    // Descuento
    // The inputs are inputs without labels, we can find them by order or value
    // The first is Descuento, the second is Propina, the third is Recibido
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '10' } });
    fireEvent.change(inputs[1], { target: { value: '5' } });
    
    // Keypad C
    const recibidoInput = screen.getByLabelText('Recibido') as HTMLInputElement;
    fireEvent.click(screen.getByText('C'));
    
    // Keypad 100
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    
    expect(recibidoInput.value).toBe('100');

    // Pay
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i }));

    await waitFor(() => {
      expect(registrarPago).toHaveBeenCalledWith({
        cuentaId: 'cuenta1',
        montoRecibido: 90, // totalBase
        metodo: 'EFECTIVO',
        descuento: 10,
        propina: 5,
        mesaNumero: '12',
        tipoComprobante: 'BOLETA'
      });
      expect(onPaid).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('muestra la boleta interna imprimible cuando el pago devuelve un ticket, en vez de cerrar de una', async () => {
    const registrarPago = vi.fn().mockResolvedValue({
      transaccion: { id: 'tx1', cuentaId: 'cuenta1', monto: 100, metodo: 'EFECTIVO', cajeroNombre: 'Ana' },
      ticket: {
        id: 'ticket-001', cuentaId: 'cuenta1', mesaId: 'mesa1',
        items: [{ nombre: 'Plato 1', cantidad: 1, precioUnitario: 60 }, { nombre: 'Plato 2', cantidad: 1, precioUnitario: 40 }],
        subtotal: 100, descuento: 0, total: 100, fecha: '2026-08-08T20:00:00.000Z',
      },
    });
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta, loading: false, error: null, success: null,
      registrarPago, clearFeedback: vi.fn(),
    } as any);
    const printSpy = vi.spyOn(globalThis, 'print').mockImplementation(() => {});
    const onClose = vi.fn();
    const onPaid = vi.fn();

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} onPaid={onPaid} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText('Boleta de venta')).toBeInTheDocument();
    });
    expect(onPaid).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // no cierra hasta que el usuario confirme

    fireEvent.click(screen.getByRole('button', { name: /Imprimir boleta/i }));
    expect(printSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onClose).toHaveBeenCalled();

    printSpy.mockRestore();
  });

  it('handles other payment methods and insufficient payment', () => {
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    
    // Change method to Yape
    fireEvent.click(screen.getByText('Yape'));
    
    // Keypad is not there for Yape
    expect(screen.queryByText('Recibido')).toBeNull();
    
    // Change back to Efectivo
    fireEvent.click(screen.getByText('Efectivo'));
    
    const input = screen.getByLabelText('Recibido') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '50' } }); // 50 < 100 total
    
    expect(screen.getByText(/El monto recibido es menor al total./i)).toBeDefined();
    
    const payBtn = screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i });
    expect(payBtn.hasAttribute('disabled')).toBe(true);

    // Exact button
    fireEvent.click(screen.getByText('Exacto'));
    expect(input.value).toBe('100.00');

    // S/ 200 button
    fireEvent.click(screen.getByText('S/ 200'));
    expect(input.value).toBe('200');
  });

  it('handles loading, offline and empty states', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: null,
      loading: true,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);

    const { rerender } = render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Cargando cuenta…')).toBeDefined();

    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: null,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    rerender(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Sin cuenta abierta')).toBeDefined();

    // With cuenta but offline
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    rerender(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    
    expect(screen.getByText('Sin conexión. Reconecta para registrar el pago.')).toBeDefined();
  });

  it('shows error and success messages, with retry when the cuenta failed to load', () => {
    const clearFeedback = vi.fn();
    const refetchCuenta = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: 'Error mock',
      queryError: true,
      success: 'Success mock',
      registrarPago: vi.fn(),
      clearFeedback,
      refetchCuenta
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Error mock')).toBeDefined();
    // T-04: con error de carga de la cuenta, "Reintentar" dispara refetchCuenta.
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga de la cuenta' }));
    expect(refetchCuenta).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));
    expect(clearFeedback).toHaveBeenCalled();
  });

  it('hides "Reintentar" when the error comes from a mutation (e.g. pagar), not from loading the cuenta', () => {
    const refetchCuenta = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: 'No se pudo registrar el pago',
      queryError: false,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn(),
      refetchCuenta
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('No se pudo registrar el pago')).toBeDefined();
    // Refetch de la cuenta no reintenta un pago fallido: el botón no debe existir.
    expect(screen.queryByRole('button', { name: 'Reintentar carga de la cuenta' })).toBeNull();
    expect(refetchCuenta).not.toHaveBeenCalled();
  });

  it('handles empty items array', () => {
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: { ...mockCuenta, pedidos: [] },
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    expect(screen.getByText('La cuenta no tiene ítems.')).toBeDefined();
  });

  it('T-16: divide la cuenta en partes iguales y cobra cada parte por separado', async () => {
    const registrarPago = vi.fn()
      .mockResolvedValueOnce({ transaccion: { id: 'tx1' }, pendiente: 50 })
      .mockResolvedValueOnce({ transaccion: { id: 'tx2' }, pendiente: 0 });
    const onClose = vi.fn();
    const onPaid = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta, loading: false, error: null, success: null,
      registrarPago, clearFeedback: vi.fn(),
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} onPaid={onPaid} />);

    fireEvent.click(screen.getByRole('button', { name: 'Partes iguales' }));

    const cobrarParte1 = screen.getByRole('button', { name: /Cobrar parte 1 de 2/i });
    fireEvent.click(cobrarParte1);

    await waitFor(() => {
      expect(registrarPago).toHaveBeenNthCalledWith(1, {
        cuentaId: 'cuenta1',
        montoRecibido: 50,
        metodo: 'EFECTIVO',
        descuento: 0,
        propina: 0,
        mesaNumero: '12',
        tipoComprobante: 'BOLETA',
      });
    });
    // Pago parcial: no cierra el drawer todavía, pasa a la parte 2.
    expect(onClose).not.toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();

    const cobrarParte2 = await screen.findByRole('button', { name: /Registrar pago y cerrar cuenta/i });
    await waitFor(() => expect(cobrarParte2).not.toBeDisabled());
    fireEvent.click(cobrarParte2);

    await waitFor(() => {
      expect(registrarPago).toHaveBeenNthCalledWith(2, {
        cuentaId: 'cuenta1',
        montoRecibido: 50,
        metodo: 'EFECTIVO',
        descuento: 0,
        propina: 0,
        mesaNumero: '12',
        tipoComprobante: 'BOLETA',
      });
      expect(onPaid).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('T-16: divide la cuenta por plato asignando cada ítem a un comensal', async () => {
    const registrarPago = vi.fn()
      .mockResolvedValueOnce({ transaccion: { id: 'tx1' }, pendiente: 40 })
      .mockResolvedValueOnce({ transaccion: { id: 'tx2' }, pendiente: 0 });
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta, loading: false, error: null, success: null,
      registrarPago, clearFeedback: vi.fn(),
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={vi.fn()} onPaid={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Por plato' }));

    // Plato 1 ($60) queda en Comensal 1 (default). Plato 2 ($40) se reasigna a Comensal 2.
    const chipsC2 = screen.getAllByRole('button', { name: 'C2' });
    fireEvent.click(chipsC2[1]);

    const cobrarComensal1 = screen.getByRole('button', { name: /Cobrar comensal 1/i });
    fireEvent.click(cobrarComensal1);

    await waitFor(() => {
      expect(registrarPago).toHaveBeenNthCalledWith(1, {
        cuentaId: 'cuenta1',
        montoRecibido: 60,
        metodo: 'EFECTIVO',
        descuento: 0,
        propina: 0,
        mesaNumero: '12',
        tipoComprobante: 'BOLETA',
      });
    });

    const cobrarComensal2 = await screen.findByRole('button', { name: /Registrar pago y cerrar cuenta/i });
    await waitFor(() => expect(cobrarComensal2).not.toBeDisabled());
    fireEvent.click(cobrarComensal2);

    await waitFor(() => {
      expect(registrarPago).toHaveBeenNthCalledWith(2, {
        cuentaId: 'cuenta1',
        montoRecibido: 40,
        metodo: 'EFECTIVO',
        descuento: 0,
        propina: 0,
        mesaNumero: '12',
        tipoComprobante: 'BOLETA',
      });
    });
  });
});
