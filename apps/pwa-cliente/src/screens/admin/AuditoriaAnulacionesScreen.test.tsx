// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditoriaAnulacionesScreen } from './AuditoriaAnulacionesScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useAnulacionesQuery } from '../../hooks/queries/useAnulacionesQuery';
import { useToast } from '../../components/ui/ToastProvider';

vi.mock('../../hooks/useOnlineStatus');
vi.mock('../../hooks/queries/useAnulacionesQuery');
vi.mock('../../components/ui/ToastProvider', () => ({ useToast: vi.fn() }));

const anulacionItem = {
  id: 'aud-1', correlativo: 'AN0000001', fechaLabel: '13/8/26, 14:00', mesaNumero: 3, pedidoId: 'p-1', cuentaCorrelativo: 'A0000007', tipo: 'ITEM' as const, tipoLabel: 'Ítem',
  productoNombre: 'Cerveza', cantidad: 1, estadoPlato: 'PREPARADO' as const, cobrado: false, montoAnulado: 20,
  montoLabel: 'S/ 20.00', motivo: 'Se cayó al servirlo', observacion: null, usuarioNombre: 'Ana', clienteNombre: null,
  invalidada: false, invalidadaMotivo: null, invalidadaPorNombre: null,
};

const anulacionMesa = {
  id: 'aud-2', fechaLabel: '13/8/26, 15:00', mesaNumero: 5, pedidoId: 'p-2', tipo: 'MESA' as const, tipoLabel: 'Mesa completa',
  productoNombre: null, cantidad: null, estadoPlato: 'SIN_PREPARAR' as const, cobrado: false, montoAnulado: 0,
  montoLabel: 'S/ 0.00', motivo: 'Cliente se retiró', observacion: null, usuarioNombre: 'Ana', clienteNombre: null,
  invalidada: true, invalidadaMotivo: 'Error de digitación', invalidadaPorNombre: 'Gerente',
};

describe('AuditoriaAnulacionesScreen', () => {
  const fetch = vi.fn();
  const actualizarAnulacion = vi.fn();
  const invalidarAnulacion = vi.fn();
  const toast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useOnlineStatus as any).mockReturnValue(true);
    (useToast as any).mockReturnValue({ toast });
    (useAnulacionesQuery as any).mockReturnValue({
      anulaciones: [], loading: false, saving: false, fetch, actualizarAnulacion, invalidarAnulacion,
    });
  });

  it('muestra el estado vacío cuando no hay anulaciones', () => {
    render(<AuditoriaAnulacionesScreen />);
    expect(screen.getByText('Sin anulaciones registradas')).toBeInTheDocument();
  });

  it('lista las anulaciones con sus datos clave', () => {
    (useAnulacionesQuery as any).mockReturnValue({
      anulaciones: [anulacionItem], loading: false, saving: false, fetch, actualizarAnulacion, invalidarAnulacion,
    });
    render(<AuditoriaAnulacionesScreen />);

    expect(screen.getByText('1× Cerveza')).toBeInTheDocument();
    // "S/ 20.00" también aparece en el KPI "Monto anulado" (única anulación vigente).
    expect(screen.getAllByText('S/ 20.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Se cayó al servirlo')).toBeInTheDocument();
    expect(screen.getByText('Vigente')).toBeInTheDocument();
  });

  it('muestra el código propio de la anulación junto con el de la atención a la que pertenece', () => {
    (useAnulacionesQuery as any).mockReturnValue({
      anulaciones: [anulacionItem], loading: false, saving: false, fetch, actualizarAnulacion, invalidarAnulacion,
    });
    render(<AuditoriaAnulacionesScreen />);

    expect(screen.getByText('AN0000001')).toBeInTheDocument();
    expect(screen.getByText('Atención A0000007')).toBeInTheDocument();
  });

  it('las anulaciones invalidadas no muestran acciones y se marcan como Inválida', () => {
    (useAnulacionesQuery as any).mockReturnValue({
      anulaciones: [anulacionMesa], loading: false, saving: false, fetch, actualizarAnulacion, invalidarAnulacion,
    });
    render(<AuditoriaAnulacionesScreen />);

    expect(screen.getByText('Inválida')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar motivo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Invalidar anulación/ })).not.toBeInTheDocument();
  });

  it('calcula los KPIs solo sobre anulaciones vigentes (excluye invalidadas)', () => {
    (useAnulacionesQuery as any).mockReturnValue({
      anulaciones: [anulacionItem, anulacionMesa], loading: false, saving: false, fetch, actualizarAnulacion, invalidarAnulacion,
    });
    render(<AuditoriaAnulacionesScreen />);

    expect(screen.getByText('Anulaciones vigentes')).toBeInTheDocument();
    // Solo anulacionItem es vigente (monto 20); anulacionMesa está invalidada.
    const kpiPanel = screen.getByText('Monto anulado').closest('.stat');
    expect(kpiPanel).toHaveTextContent('S/ 20.00');
  });

  it('CU-05 Update: edita el motivo de una anulación vigente', async () => {
    actualizarAnulacion.mockResolvedValue({});
    (useAnulacionesQuery as any).mockReturnValue({
      anulaciones: [anulacionItem], loading: false, saving: false, fetch, actualizarAnulacion, invalidarAnulacion,
    });
    render(<AuditoriaAnulacionesScreen />);

    fireEvent.click(screen.getByRole('button', { name: /Editar motivo de anulación/ }));
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Motivo corregido' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => expect(actualizarAnulacion).toHaveBeenCalledWith('aud-1', { motivo: 'Motivo corregido', observacion: null }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Anulación actualizada' })));
  });

  it('CU-05 Delete lógico: invalida una anulación con motivo obligatorio', async () => {
    invalidarAnulacion.mockResolvedValue({});
    (useAnulacionesQuery as any).mockReturnValue({
      anulaciones: [anulacionItem], loading: false, saving: false, fetch, actualizarAnulacion, invalidarAnulacion,
    });
    render(<AuditoriaAnulacionesScreen />);

    fireEvent.click(screen.getByRole('button', { name: /Invalidar anulación/ }));
    expect(screen.getByRole('button', { name: /Invalidar registro/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo de invalidación (obligatorio)'), { target: { value: 'Se corrigió en caja' } });
    fireEvent.click(screen.getByRole('button', { name: /Invalidar registro/ }));

    await waitFor(() => expect(invalidarAnulacion).toHaveBeenCalledWith('aud-1', { motivo: 'Se corrigió en caja' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Anulación invalidada' })));
  });

  it('filtra por tipo', () => {
    render(<AuditoriaAnulacionesScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Mesa completa' }));
    expect(useAnulacionesQuery).toHaveBeenLastCalledWith({ tipo: 'MESA', desde: undefined, hasta: undefined, limit: 100 });
  });
});
