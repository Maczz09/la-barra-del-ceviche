// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CajaScreen } from './CajaScreen';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuthStore } from '../../store/auth.store';
import { useMesasQuery } from '../../hooks/queries/useMesasQuery';
import { useCajaQuery } from '../../hooks/queries/useCajaQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';

vi.mock('react-router-dom', () => ({
  useSearchParams: vi.fn()
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn()
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn()
}));

vi.mock('../../hooks/queries/useMesasQuery', () => ({
  useMesasQuery: vi.fn()
}));

vi.mock('../../hooks/queries/useCajaQuery', () => ({
  useCajaQuery: vi.fn()
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: vi.fn()
}));

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    Close: () => <svg data-testid="icon-close" />,
    Cash: () => <svg data-testid="icon-cash" />,
    Alert: () => <svg data-testid="icon-alert" />,
    Lock: () => <svg data-testid="icon-lock" />,
    Plus: () => <svg data-testid="icon-plus" />,
    Trend: () => <svg data-testid="icon-trend" />,
    Coins: () => <svg data-testid="icon-coins" />,
    Receipt: () => <svg data-testid="icon-receipt" />,
    ArrowDown: () => <svg data-testid="icon-arrow-down" />,
    ArrowUp: () => <svg data-testid="icon-arrow-up" />,
    Search: () => <svg data-testid="icon-search" />,
  }
}));

vi.mock('../../components/ui/Stat', () => ({
  MiniStat: ({ k, v, d }: any) => <div data-testid={`stat-${k}`}>{v} - {d}</div>
}));

// Mock the modals
vi.mock('./AperturaCajaModal', () => ({
  AperturaCajaModal: ({ onClose, onOpen }: any) => (
    <div data-testid="apertura-modal">
      <button onClick={onClose}>Close Apertura</button>
      <button onClick={() => onOpen(100)}>Open Caja 100</button>
    </div>
  )
}));

vi.mock('./MovimientoModal', () => ({
  MovimientoModal: ({ onClose, onSave, tipoInicial }: any) => (
    <div data-testid="movimiento-modal">
      <button onClick={onClose}>Close Mov</button>
      <button onClick={() => onSave({ tipo: tipoInicial, donde: 'Test', monto: 50 })}>Save Mov</button>
    </div>
  )
}));

vi.mock('./CierreDrawer', () => ({
  CierreDrawer: ({ onClose, onDone }: any) => (
    <div data-testid="cierre-drawer">
      <button onClick={onClose}>Close Cierre</button>
      <button onClick={() => onDone({ '100': 1 })}>Done Cierre</button>
    </div>
  )
}));

vi.mock('./CobroMesaDrawer', () => ({
  CobroMesaDrawer: ({ onClose, onPaid }: any) => (
    <div data-testid="cobro-drawer">
      <button onClick={onClose}>Close Cobro</button>
      <button onClick={onPaid}>Paid Cobro</button>
    </div>
  )
}));

vi.mock('./TransaccionDetalleDrawer', () => ({
  TransaccionDetalleDrawer: ({ transaccionId, cuentaId, onClose }: any) => (
    <div data-testid="tx-detalle-drawer">
      <span>{transaccionId} · {cuentaId}</span>
      <button onClick={onClose}>Close Detalle</button>
    </div>
  )
}));

const mockTurno = {
  id: 'turno1',
  abiertoAt: new Date().toISOString(),
  fondoInicial: 100,
  cajeroNombre: 'Juan'
};

const mockResumen = {
  efectivoEsperado: 200,
  movimientos: [
    { id: 'm1', createdAt: new Date().toISOString(), tipo: 'APERTURA', donde: 'Caja Principal', metodo: 'EFECTIVO', monto: 100, descuento: 0, propina: 0 },
    { id: 'm2', createdAt: new Date().toISOString(), tipo: 'INGRESO', donde: 'Venta', metodo: 'EFECTIVO', monto: 50, descuento: 10, propina: 5, transaccionId: 'txn123' },
    { id: 'm3', createdAt: new Date().toISOString(), tipo: 'EGRESO', donde: 'Compra', metodo: 'EFECTIVO', monto: -30, motivo: 'motivo test' },
    { id: 'm4', createdAt: new Date().toISOString(), tipo: 'VENTA', donde: 'Mesa 5', metodo: 'EFECTIVO', monto: 45, descuento: 0, propina: 0, transaccionId: 'txn-venta-1', cuentaId: 'cuenta-1' },
  ]
};

const mockMesas = [
  { id: 'mesa1', numero: '10', numeroRaw: 10, estado: 'OCUPADA', ubicacion: 'Salon', capacidad: 4 },
  { id: 'mesa2', numero: '11', numeroRaw: 11, estado: 'LIBRE', ubicacion: 'Salon', capacidad: 4 },
];

describe('CajaScreen', () => {
  const toastMock = vi.fn();
  const setSearchParams = vi.fn();

  beforeEach(() => {
    toastMock.mockClear();
    vi.mocked(useToast).mockReturnValue({ toast: toastMock } as any);
    vi.mocked(useAuthStore).mockImplementation((selector: any) => selector({ user: { nombre: 'Juan' } }));
    vi.mocked(useMesasQuery).mockReturnValue({ mesas: mockMesas } as any);
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: false } as any);
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(), setSearchParams] as any);
  });

  it('renders without turno and can open caja', async () => {
    const abrirTurno = vi.fn();
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: null,
      turno: null,
      loading: false,
      error: 'Error de caja',
      abrirTurno,
      crearMovimiento: vi.fn(),
      cerrarTurno: vi.fn()
    } as any);

    render(<CajaScreen />);

    expect(screen.getByText('Error de caja')).toBeDefined();
    expect(screen.getByText('Abre un turno de caja')).toBeDefined();
    
    // Click on Abrir caja empty state
    fireEvent.click(screen.getAllByRole('button', { name: /Abrir caja/i })[1]);
    
    expect(screen.getByTestId('apertura-modal')).toBeDefined();
    
    fireEvent.click(screen.getByText('Open Caja 100'));
    
    await waitFor(() => {
      expect(abrirTurno).toHaveBeenCalledWith({ fondoInicial: 100, cajeroNombre: 'Juan' });
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Caja abierta' }));
    });
  });

  it('renders with turno and can close caja', async () => {
    const cerrarTurno = vi.fn();
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: mockResumen,
      turno: mockTurno,
      loading: false,
      error: null,
      abrirTurno: vi.fn(),
      crearMovimiento: vi.fn(),
      cerrarTurno
    } as any);

    render(<CajaScreen />);

    expect(screen.queryByText('Abre un turno de caja')).toBeNull();
    expect(screen.getByText('Caja abierta')).toBeDefined();

    // Click Cerrar caja (header)
    fireEvent.click(screen.getAllByRole('button', { name: /Cerrar caja/i })[0]);
    expect(screen.getByTestId('cierre-drawer')).toBeDefined();

    fireEvent.click(screen.getByText('Done Cierre'));

    await waitFor(() => {
      expect(cerrarTurno).toHaveBeenCalledWith('turno1', { denominaciones: { '100': 1 } });
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Caja cerrada' }));
    });
  });

  it('can create ingresos and egresos', async () => {
    const crearMovimiento = vi.fn();
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: mockResumen,
      turno: mockTurno,
      loading: false,
      error: null,
      abrirTurno: vi.fn(),
      crearMovimiento,
      cerrarTurno: vi.fn()
    } as any);

    render(<CajaScreen />);

    // Ingreso
    fireEvent.click(screen.getByText('Ingreso de efectivo'));
    expect(screen.getByTestId('movimiento-modal')).toBeDefined();
    fireEvent.click(screen.getByText('Save Mov'));

    await waitFor(() => {
      expect(crearMovimiento).toHaveBeenCalledWith('turno1', { tipo: 'INGRESO', donde: 'Test', monto: 50 });
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ingreso registrado' }));
    });

    // Egreso
    fireEvent.click(screen.getByText('Registrar egreso'));
    expect(screen.getByTestId('movimiento-modal')).toBeDefined();
    fireEvent.click(screen.getByText('Save Mov')); 

    await waitFor(() => {
      expect(crearMovimiento).toHaveBeenCalledWith('turno1', { tipo: 'EGRESO', donde: 'Test', monto: 50 });
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Egreso registrado' }));
    });
  });

  it('handles search params and cobro picker', async () => {
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: mockResumen,
      turno: mockTurno,
      loading: false,
      error: null,
      abrirTurno: vi.fn(),
      crearMovimiento: vi.fn(),
      cerrarTurno: vi.fn()
    } as any);
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams('?mesaId=mesa1'), setSearchParams] as any);

    render(<CajaScreen />);
    
    // Drawer should open since mesaId is in url
    expect(screen.getByTestId('cobro-drawer')).toBeDefined();
    
    // onClose
    fireEvent.click(screen.getByText('Close Cobro'));
    expect(setSearchParams).toHaveBeenCalled();
    
    // Picker
    fireEvent.click(screen.getAllByRole('button', { name: /Cobrar cuenta/i })[0]);
    expect(screen.getByText('Cobrar cuenta · elegir mesa')).toBeDefined();
    
    // Select mesa
    fireEvent.click(screen.getByText('Mesa 10'));
    expect(screen.getByTestId('cobro-drawer')).toBeDefined();
    
    // onPaid
    fireEvent.click(screen.getByText('Paid Cobro'));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pago registrado correctamente.' }));
  });

  it('abre el detalle de un cobro (VENTA) y lo cierra', () => {
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: mockResumen,
      turno: mockTurno,
      loading: false,
      error: null,
      abrirTurno: vi.fn(),
      crearMovimiento: vi.fn(),
      cerrarTurno: vi.fn()
    } as any);

    render(<CajaScreen />);

    expect(screen.queryByTestId('tx-detalle-drawer')).toBeNull();

    const botones = screen.getAllByRole('button', { name: /Ver detalle/i });
    fireEvent.click(botones[0]);

    expect(screen.getByTestId('tx-detalle-drawer')).toBeDefined();
    expect(screen.getByText('txn-venta-1 · cuenta-1')).toBeDefined();

    fireEvent.click(screen.getByText('Close Detalle'));
    expect(screen.queryByTestId('tx-detalle-drawer')).toBeNull();
  });

  it('no ofrece "Ver detalle" para movimientos que no son VENTA', () => {
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: mockResumen,
      turno: mockTurno,
      loading: false,
      error: null,
      abrirTurno: vi.fn(),
      crearMovimiento: vi.fn(),
      cerrarTurno: vi.fn()
    } as any);

    render(<CajaScreen />);

    // Solo hay 1 VENTA en el mock (m4); INGRESO/EGRESO/APERTURA no cuentan.
    const botones = screen.getAllByRole('button', { name: /Ver detalle/i });
    expect(botones).toHaveLength(2); // tabla + tarjeta mobile del mismo movimiento
  });

  it('handles empty picker', () => {
    vi.mocked(useMesasQuery).mockReturnValue({ mesas: [] } as any);
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: mockResumen,
      turno: mockTurno,
      loading: false,
      error: null,
      abrirTurno: vi.fn(),
      crearMovimiento: vi.fn(),
      cerrarTurno: vi.fn()
    } as any);

    render(<CajaScreen />);

    fireEvent.click(screen.getAllByRole('button', { name: /Cobrar cuenta/i })[0]);
    expect(screen.getByText('No hay mesas ocupadas con cuenta para cobrar.')).toBeDefined();

    fireEvent.click(screen.getByTestId('scrim'));
    expect(screen.queryByText('Cobrar cuenta · elegir mesa')).toBeNull();
  });

  it('agrupa mesas unidas en una sola fila del picker (bug: antes salían como cobros separados)', () => {
    vi.mocked(useMesasQuery).mockReturnValue({
      mesas: [
        { id: 'mesa1', numero: '01', numeroRaw: 1, estado: 'OCUPADA', ubicacion: 'Salon', capacidad: 2, grupoId: 'mesa1' },
        { id: 'mesa2', numero: '02', numeroRaw: 2, estado: 'OCUPADA', ubicacion: 'Salon', capacidad: 2, grupoId: 'mesa1' },
        { id: 'mesa3', numero: '03', numeroRaw: 3, estado: 'OCUPADA', ubicacion: 'Salon', capacidad: 4, grupoId: null },
      ],
    } as any);
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: mockResumen,
      turno: mockTurno,
      loading: false,
      error: null,
      abrirTurno: vi.fn(),
      crearMovimiento: vi.fn(),
      cerrarTurno: vi.fn(),
    } as any);

    render(<CajaScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: /Cobrar cuenta/i })[0]);

    // Una sola fila "Mesa 01 + 02" (no dos filas separadas) con la etiqueta
    // de cuenta compartida, y la mesa suelta sigue apareciendo normal.
    expect(screen.getByText('Mesa 01 + 02')).toBeDefined();
    expect(screen.getByText('Unidas · cuenta compartida')).toBeDefined();
    expect(screen.queryByText('Mesa 01')).toBeNull();
    expect(screen.queryByText('Mesa 02')).toBeNull();
    expect(screen.getByText('Mesa 03')).toBeDefined();

    // Selecciona el grupo unido — debe abrir el drawer usando la mesa anfitriona.
    fireEvent.click(screen.getByText('Mesa 01 + 02'));
    expect(screen.getByTestId('cobro-drawer')).toBeDefined();
  });

  it('handles API errors without crashing', async () => {
    const crearMovimiento = vi.fn().mockRejectedValue(new Error('error'));
    const abrirTurno = vi.fn().mockRejectedValue(new Error('error'));
    const cerrarTurno = vi.fn().mockRejectedValue(new Error('error'));
    vi.mocked(useCajaQuery).mockReturnValue({
      resumen: mockResumen,
      turno: mockTurno,
      loading: false,
      error: null,
      abrirTurno,
      crearMovimiento,
      cerrarTurno
    } as any);

    render(<CajaScreen />);

    fireEvent.click(screen.getByText('Registrar egreso'));
    fireEvent.click(screen.getByText('Save Mov')); 
    
    await waitFor(() => {
      expect(crearMovimiento).toHaveBeenCalled();
    });
    
    fireEvent.click(screen.getAllByRole('button', { name: /Cerrar caja/i })[0]);
    fireEvent.click(screen.getByText('Done Cierre'));
    
    await waitFor(() => {
      expect(cerrarTurno).toHaveBeenCalled();
    });
  });
});
