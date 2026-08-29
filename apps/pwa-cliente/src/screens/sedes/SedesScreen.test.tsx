// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SedesScreen } from './SedesScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { useFacturacionQuery } from '../../hooks/queries/useFacturacionQuery';
import { useToast } from '../../components/ui/ToastProvider';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedesQuery: vi.fn(),
}));

vi.mock('../../hooks/queries/useFacturacionQuery', () => ({
  useFacturacionQuery: vi.fn(),
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn(),
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

function baseFacturacionMock(overrides: Record<string, unknown> = {}) {
  return {
    crearEmpresa: vi.fn().mockResolvedValue({ id: 'e1', slot: 1, ruc: '20111111111', razonSocial: 'Sede Sur', activo: true }),
    configurandoEmpresa: false,
    ...overrides,
  };
}

describe('SedesScreen', () => {
  beforeEach(() => {
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useSedesQuery).mockReturnValue(baseMock() as any);
    vi.mocked(useFacturacionQuery).mockReturnValue(baseFacturacionMock() as any);
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);
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

  it('crea una sede con teléfono (opcional, se muestra en la carta pública)', async () => {
    const crearSede = vi.fn();
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ crearSede }) as any);

    render(<SedesScreen />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sede Sur' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '987654321' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear sede/i }));

    await waitFor(() => {
      expect(crearSede).toHaveBeenCalledWith({ nombre: 'Sede Sur', direccion: undefined, ruc: undefined, telefono: '987654321' });
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
      expect(actualizarSede).toHaveBeenCalledWith('s1', { nombre: 'Sede Central Renovada', direccion: 'Av. Principal 123', ruc: '20554879631', telefono: null });
    });
  });

  it('edita el teléfono de una sede existente', async () => {
    const actualizarSede = vi.fn();
    vi.mocked(useSedesQuery).mockReturnValue(baseMock({ actualizarSede }) as any);

    render(<SedesScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar Sede Central' }));

    // "Teléfono" aparece dos veces (form de creación + drawer de edición,
    // ambos montados a la vez) — el segundo es el del drawer.
    fireEvent.change(screen.getAllByLabelText('Teléfono')[1], { target: { value: '987654321' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(actualizarSede).toHaveBeenCalledWith('s1', { nombre: 'Sede Central', direccion: 'Av. Principal 123', ruc: '20554879631', telefono: '987654321' });
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

  describe('configurar SUNAT también (opcional, al crear la sede)', () => {
    it('la sección de credenciales SUNAT está oculta hasta marcar el checkbox', () => {
      render(<SedesScreen />);
      expect(screen.queryByLabelText('Usuario SOL')).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText(/También configurar facturación electrónica SUNAT/i));
      expect(screen.getByLabelText('Usuario SOL')).toBeInTheDocument();
    });

    it('crea la sede igual aunque el checkbox esté marcado sin completar las credenciales (no bloquea la sede)', async () => {
      const crearSede = vi.fn();
      const crearEmpresa = vi.fn();
      vi.mocked(useSedesQuery).mockReturnValue(baseMock({ crearSede }) as any);
      vi.mocked(useFacturacionQuery).mockReturnValue(baseFacturacionMock({ crearEmpresa }) as any);

      render(<SedesScreen />);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sede Sur' } });
      fireEvent.click(screen.getByLabelText(/También configurar facturación electrónica SUNAT/i));
      fireEvent.click(screen.getByRole('button', { name: /Crear sede/i }));

      await waitFor(() => expect(crearSede).toHaveBeenCalled());
      expect(crearEmpresa).not.toHaveBeenCalled();
    });

    it('con todo completo, crea la sede y encadena crearEmpresa con los mismos datos', async () => {
      const crearSede = vi.fn().mockResolvedValue(undefined);
      const crearEmpresa = vi.fn().mockResolvedValue({ id: 'e1', slot: 1, ruc: '20111111111', razonSocial: 'Sede Sur', activo: true });
      vi.mocked(useSedesQuery).mockReturnValue(baseMock({ crearSede }) as any);
      vi.mocked(useFacturacionQuery).mockReturnValue(baseFacturacionMock({ crearEmpresa }) as any);

      render(<SedesScreen />);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sede Sur' } });
      fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '20111111111' } });
      fireEvent.click(screen.getByLabelText(/También configurar facturación electrónica SUNAT/i));
      fireEvent.change(screen.getByLabelText('Usuario SOL'), { target: { value: 'MODDATOS' } });
      fireEvent.change(screen.getByLabelText('Clave SOL'), { target: { value: 'clave-sol' } });
      fireEvent.change(screen.getByLabelText('Contraseña del certificado'), { target: { value: 'clave-cert' } });
      const archivo = new File(['x'], 'cert.p12', { type: 'application/x-pkcs12' });
      fireEvent.change(screen.getByLabelText(/Certificado \(\.p12/), { target: { files: [archivo] } });

      fireEvent.click(screen.getByRole('button', { name: /Crear sede/i }));

      await waitFor(() => {
        expect(crearSede).toHaveBeenCalledWith({ nombre: 'Sede Sur', direccion: undefined, ruc: '20111111111' });
        expect(crearEmpresa).toHaveBeenCalledWith({
          ruc: '20111111111',
          razonSocial: 'Sede Sur',
          direccion: undefined,
          solUsuario: 'MODDATOS',
          solClave: 'clave-sol',
          certificadoPass: 'clave-cert',
          certificado: archivo,
        });
      });
    });

    it('si crearEmpresa falla, la sede queda creada igual y se avisa por toast (no revienta el flujo)', async () => {
      const toast = vi.fn();
      vi.mocked(useToast).mockReturnValue({ toast } as any);
      const crearSede = vi.fn().mockResolvedValue(undefined);
      const crearEmpresa = vi.fn().mockRejectedValue(new Error('El certificado o su contraseña no son válidos'));
      vi.mocked(useSedesQuery).mockReturnValue(baseMock({ crearSede }) as any);
      vi.mocked(useFacturacionQuery).mockReturnValue(baseFacturacionMock({ crearEmpresa }) as any);

      render(<SedesScreen />);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sede Sur' } });
      fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '20111111111' } });
      fireEvent.click(screen.getByLabelText(/También configurar facturación electrónica SUNAT/i));
      fireEvent.change(screen.getByLabelText('Usuario SOL'), { target: { value: 'MODDATOS' } });
      fireEvent.change(screen.getByLabelText('Clave SOL'), { target: { value: 'clave-sol' } });
      fireEvent.change(screen.getByLabelText('Contraseña del certificado'), { target: { value: 'clave-cert' } });
      const archivo = new File(['x'], 'cert.p12', { type: 'application/x-pkcs12' });
      fireEvent.change(screen.getByLabelText(/Certificado \(\.p12/), { target: { files: [archivo] } });

      fireEvent.click(screen.getByRole('button', { name: /Crear sede/i }));

      await waitFor(() => {
        expect(crearSede).toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'err' }));
      });
    });
  });
});
