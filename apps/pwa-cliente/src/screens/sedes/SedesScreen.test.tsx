// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SedesScreen } from './SedesScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedesQuery: vi.fn(),
}));

const mockSedes = [
  { id: 's1', nombre: 'Sede Central', direccion: 'Av. Principal 123', ruc: '20554879631', activa: true },
  { id: 's2', nombre: 'Sede Norte', direccion: null, ruc: null, activa: false },
];

function baseMock(overrides: Record<string, unknown> = {}) {
  return {
    sedes: mockSedes,
    loading: false,
    saving: false,
    error: null,
    success: null,
    fetch: vi.fn(),
    crearSede: vi.fn(),
    actualizarSede: vi.fn(),
    eliminarSede: vi.fn(),
    clearFeedback: vi.fn(),
    ...overrides,
  };
}

describe('SedesScreen', () => {
  beforeEach(() => {
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useSedesQuery).mockReturnValue(baseMock() as any);
  });

  it('renderiza la lista de sedes con su estado', () => {
    render(<SedesScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sedes' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Sede Central' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Sede Norte' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '20554879631' })).toBeInTheDocument();
  });

  it('crea una sede desde el formulario lateral', async () => {
    const crearSede = vi.fn();
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ crearSede }) as any);

    render(<SedesScreen />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sede Sur' } });
    fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 456' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear sede/i }));

    await waitFor(() => {
      expect(crearSede).toHaveBeenCalledWith({ nombre: 'Sede Sur', direccion: 'Calle 456' });
    });
  });

  it('crea una sede con RUC (va impreso en la boleta)', async () => {
    const crearSede = vi.fn();
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ crearSede }) as any);

    render(<SedesScreen />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sede Sur' } });
    fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '20111111111' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear sede/i }));

    await waitFor(() => {
      expect(crearSede).toHaveBeenCalledWith({ nombre: 'Sede Sur', direccion: undefined, ruc: '20111111111' });
    });
  });

  it('edita una sede existente', async () => {
    const actualizarSede = vi.fn();
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ actualizarSede }) as any);

    render(<SedesScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar Sede Central' }));

    const nombreInput = screen.getByDisplayValue('Sede Central') as HTMLInputElement;
    fireEvent.change(nombreInput, { target: { value: 'Sede Central Renovada' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(actualizarSede).toHaveBeenCalledWith('s1', { nombre: 'Sede Central Renovada', direccion: 'Av. Principal 123', ruc: '20554879631' });
    });
  });

  it('activa/desactiva una sede con el toggle', async () => {
    const actualizarSede = vi.fn();
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ actualizarSede }) as any);

    render(<SedesScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Sede Central' }));

    await waitFor(() => {
      expect(actualizarSede).toHaveBeenCalledWith('s1', { activa: false });
    });
  });

  it('elimina una sede tras confirmar', async () => {
    const eliminarSede = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ eliminarSede }) as any);

    render(<SedesScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Sede Central' }));

    await waitFor(() => {
      expect(eliminarSede).toHaveBeenCalledWith('s1');
    });
    vi.mocked(window.confirm).mockRestore();
  });

  it('no elimina si el usuario cancela la confirmación', () => {
    const eliminarSede = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ eliminarSede }) as any);

    render(<SedesScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Sede Central' }));

    expect(eliminarSede).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockRestore();
  });

  it('muestra estado vacío cuando no hay sedes', () => {
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ sedes: [] }) as any);
    render(<SedesScreen />);
    expect(screen.getByText('Sin sedes')).toBeInTheDocument();
  });

  it('muestra el banner de sin conexión y deshabilita mutaciones', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<SedesScreen />);
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear sede/i })).toBeDisabled();
  });

  it('muestra el banner de error y permite cerrarlo', () => {
    const clearFeedback = vi.fn();
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ error: 'Ya existe una sede llamada "Sede Central"', clearFeedback }) as any);
    render(<SedesScreen />);
    expect(screen.getByText('Ya existe una sede llamada "Sede Central"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(clearFeedback).toHaveBeenCalled();
  });
});
