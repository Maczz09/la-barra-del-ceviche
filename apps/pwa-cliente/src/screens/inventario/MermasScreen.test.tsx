// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MermasScreen } from './MermasScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useMermasQuery } from '../../hooks/queries/useMermasQuery';
import { useToast } from '../../components/ui/ToastProvider';

vi.mock('../../hooks/useOnlineStatus');
vi.mock('../../hooks/queries/useMermasQuery');
vi.mock('../../components/ui/ToastProvider', () => ({ useToast: vi.fn() }));

const mermaBase = {
  id: 'm1', productoId: 'p1', productoNombre: 'Cerveza', cantidad: 3, motivo: 'Botellas rotas',
  observacion: null, origen: 'DESCARTE_MANUAL_INVENTARIO', origenLabel: 'Descarte manual',
  costoUnitario: 8.5, costoTotal: 25.5, costoTotalLabel: 'S/ 25.50',
  usuarioNombre: 'Ana', fechaLabel: '13/8/26, 14:00',
};

describe('MermasScreen', () => {
  const fetch = vi.fn();
  const actualizarMerma = vi.fn();
  const eliminarMerma = vi.fn();
  const toast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useOnlineStatus as any).mockReturnValue(true);
    (useToast as any).mockReturnValue({ toast });
    (useMermasQuery as any).mockReturnValue({
      mermas: [], loading: false, saving: false, fetch, actualizarMerma, eliminarMerma,
    });
  });

  it('muestra el estado vacío cuando no hay mermas', () => {
    render(<MermasScreen />);
    expect(screen.getByText('Sin mermas registradas')).toBeInTheDocument();
  });

  it('lista las mermas en la tabla con sus datos clave', () => {
    (useMermasQuery as any).mockReturnValue({
      mermas: [mermaBase], loading: false, saving: false, fetch, actualizarMerma, eliminarMerma,
    });
    render(<MermasScreen />);

    // "Cerveza" también aparece en el KPI "Mayor pérdida" (única merma).
    expect(screen.getAllByText('Cerveza').length).toBeGreaterThan(0);
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText('Botellas rotas')).toBeInTheDocument();
    expect(screen.getAllByText('Descarte manual').length).toBeGreaterThan(0);
  });

  it('busca por producto o motivo (filtro de cliente)', () => {
    (useMermasQuery as any).mockReturnValue({
      mermas: [
        mermaBase,
        { ...mermaBase, id: 'm2', productoNombre: 'Pisco', motivo: 'Se venció' },
      ],
      loading: false, saving: false, fetch, actualizarMerma, eliminarMerma,
    });
    render(<MermasScreen />);

    // "Cerveza"/"Pisco" también pueden aparecer en el KPI "Mayor pérdida".
    expect(screen.getAllByText('Cerveza').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pisco').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Buscar mermas'), { target: { value: 'pisco' } });

    expect(screen.queryByText('Cerveza')).not.toBeInTheDocument();
    expect(screen.getAllByText('Pisco').length).toBeGreaterThan(0);
  });

  it('filtra por origen y por fecha (server-side, vía useMermasQuery)', () => {
    render(<MermasScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Anulación (cobrada)' }));
    expect(useMermasQuery).toHaveBeenLastCalledWith({ limit: 100, origen: 'ANULACION_COMANDA_COBRADA', desde: undefined, hasta: undefined });

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-01' } });
    expect(useMermasQuery).toHaveBeenLastCalledWith({ limit: 100, origen: 'ANULACION_COMANDA_COBRADA', desde: '2026-08-01', hasta: undefined });
  });

  it('CU-04 Update: edita una merma', async () => {
    actualizarMerma.mockResolvedValue({});
    (useMermasQuery as any).mockReturnValue({
      mermas: [mermaBase], loading: false, saving: false, fetch, actualizarMerma, eliminarMerma,
    });
    render(<MermasScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar merma de Cerveza' }));
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => expect(actualizarMerma).toHaveBeenCalledWith('m1', { cantidad: 5, motivo: 'Botellas rotas', observacion: null }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Merma actualizada' })));
  });

  it('CU-04 Delete: elimina una merma con justificación', async () => {
    eliminarMerma.mockResolvedValue(undefined);
    (useMermasQuery as any).mockReturnValue({
      mermas: [mermaBase], loading: false, saving: false, fetch, actualizarMerma, eliminarMerma,
    });
    render(<MermasScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar merma de Cerveza' }));
    fireEvent.change(screen.getByLabelText('Justificación (obligatoria)'), { target: { value: 'Se registró por error' } });
    fireEvent.click(screen.getByRole('button', { name: /Eliminar y restaurar stock/ }));

    await waitFor(() => expect(eliminarMerma).toHaveBeenCalledWith('m1', 'Se registró por error'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Merma eliminada' })));
  });
});
