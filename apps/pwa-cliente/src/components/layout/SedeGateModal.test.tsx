import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SedeGateModal } from './SedeGateModal';
import { useAuthStore } from '../../store/auth.store';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { getSedeSeleccionada, setSedeSeleccionada } from '../../api/client';
import { queryClient } from '../../api/queryClient';

vi.mock('../../hooks/useFocusTrap', () => ({ useFocusTrap: vi.fn() }));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedesQuery: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  getSedeSeleccionada: vi.fn(),
  setSedeSeleccionada: vi.fn(),
}));

const sedeA = { id: 's1', nombre: 'Sede Central', direccion: 'Av. Principal 123', activa: true };
const sedeB = { id: 's2', nombre: 'Sede Principal', direccion: null, activa: true };
const sedeInactiva = { id: 's3', nombre: 'Sede Cerrada', direccion: null, activa: false };

describe('SedeGateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  });

  function setup({
    sedeId = null,
    seleccionActual = null,
    sedes = [sedeA, sedeB],
    loading = false,
  }: { sedeId?: string | null; seleccionActual?: string | null; sedes?: typeof sedeA[]; loading?: boolean } = {}) {
    vi.mocked(useAuthStore).mockImplementation((selector: any) => selector({ user: { rol: 'ADMIN', sedeId } }));
    vi.mocked(useSedesQuery).mockReturnValue({ sedes, loading } as any);
    vi.mocked(getSedeSeleccionada).mockReturnValue(seleccionActual);
  }

  it('no muestra nada si el usuario está pineado a una sede', () => {
    setup({ sedeId: 's1' });
    render(<SedeGateModal />);
    expect(screen.queryByText('¿Con qué sede vas a trabajar?')).not.toBeInTheDocument();
  });

  it('no muestra nada si ya hay una sede seleccionada', () => {
    setup({ seleccionActual: 's1' });
    render(<SedeGateModal />);
    expect(screen.queryByText('¿Con qué sede vas a trabajar?')).not.toBeInTheDocument();
  });

  it('no muestra nada mientras cargan las sedes', () => {
    setup({ loading: true });
    render(<SedeGateModal />);
    expect(screen.queryByText('¿Con qué sede vas a trabajar?')).not.toBeInTheDocument();
  });

  it('no bloquea si todavía no hay sedes creadas (el admin necesita poder ir a crear una)', () => {
    setup({ sedes: [] });
    render(<SedeGateModal />);
    expect(screen.queryByText('¿Con qué sede vas a trabajar?')).not.toBeInTheDocument();
  });

  it('admin general sin sede elegida: muestra el modal con las sedes activas', () => {
    setup({ sedes: [sedeA, sedeB, sedeInactiva] });
    render(<SedeGateModal />);
    expect(screen.getByText('¿Con qué sede vas a trabajar?')).toBeInTheDocument();
    expect(screen.getByText('Sede Central')).toBeInTheDocument();
    expect(screen.getByText('Sede Principal')).toBeInTheDocument();
    expect(screen.queryByText('Sede Cerrada')).not.toBeInTheDocument();
  });

  it('elegir una sede la guarda, invalida las queries y cierra el modal', () => {
    setup();
    render(<SedeGateModal />);
    fireEvent.click(screen.getByText('Sede Central'));

    expect(setSedeSeleccionada).toHaveBeenCalledWith('s1');
    expect(queryClient.invalidateQueries).toHaveBeenCalled();
    expect(screen.queryByText('¿Con qué sede vas a trabajar?')).not.toBeInTheDocument();
  });
});
