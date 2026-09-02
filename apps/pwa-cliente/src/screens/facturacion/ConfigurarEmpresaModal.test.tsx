// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurarEmpresaModal } from './ConfigurarEmpresaModal';
import type { SedeDto } from '../../types/sede.types';

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

const sedes: SedeDto[] = [
  { id: 'sede-1', nombre: 'Sede Central', activa: true },
  { id: 'sede-2', nombre: 'Sede Secundaria', activa: true },
] as SedeDto[];

function llenarFormularioValido() {
  fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '20123456786' } });
  fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'Empresa Demo S.A.C.' } });
  fireEvent.change(screen.getByLabelText('Usuario SOL'), { target: { value: 'MODDATOS' } });
  fireEvent.change(screen.getByLabelText('Clave SOL'), { target: { value: 'clave-sol' } });
  fireEvent.change(screen.getByLabelText('Contraseña del certificado'), { target: { value: 'clave-cert' } });
  const archivo = new File(['contenido'], 'certificado.p12', { type: 'application/x-pkcs12' });
  fireEvent.change(screen.getByLabelText(/Archivo del certificado/), { target: { files: [archivo] } });
  return archivo;
}

describe('ConfigurarEmpresaModal', () => {
  const onGuardar = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onGuardar.mockResolvedValue(undefined);
  });

  it('el botón de guardar arranca deshabilitado (formulario vacío)', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /Guardar y activar/i })).toBeDisabled();
  });

  it('con todos los campos requeridos completos, habilita guardar y no exige los opcionales', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    expect(screen.getByRole('button', { name: /Guardar y activar/i })).not.toBeDisabled();
  });

  it('un RUC de menos de 11 dígitos deja el botón deshabilitado', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '123' } });
    expect(screen.getByRole('button', { name: /Guardar y activar/i })).toBeDisabled();
  });

  it('el campo RUC descarta caracteres no numéricos', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '20abc123456786xyz' } });
    expect(screen.getByLabelText('RUC')).toHaveValue('20123456786');
  });

  it('envía el multipart completo (incluido el archivo) al guardar', async () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    const archivo = llenarFormularioValido();

    fireEvent.click(screen.getByRole('button', { name: /Guardar y activar/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith({
        ruc: '20123456786',
        razonSocial: 'Empresa Demo S.A.C.',
        sedeId: undefined,
        nombreComercial: undefined,
        direccion: undefined,
        ubigeo: undefined,
        solUsuario: 'MODDATOS',
        solClave: 'clave-sol',
        certificadoPass: 'clave-cert',
        certificado: archivo,
      });
    });
  });

  it('permite elegir una sede libre y la incluye en el payload', async () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    fireEvent.change(screen.getByLabelText('Sede que emite'), { target: { value: 'sede-2' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar y activar/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ sedeId: 'sede-2' }));
    });
  });

  it('sin sedes libres, el selector solo ofrece "Sin asignar" y muestra el aviso', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={[]} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByText(/Todas las sedes ya tienen sus dos RUC emisores enlazados/)).toBeInTheDocument();
    expect(screen.getByLabelText('Sede que emite')).toHaveValue('');
  });

  it('recorta espacios de razón social / usuario SOL antes de enviar', async () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: '  Empresa Demo S.A.C.  ' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar y activar/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ razonSocial: 'Empresa Demo S.A.C.' }));
    });
  });

  it('muestra el error que le pasan por props (p. ej. "RUC ya existe" del backend)', () => {
    render(<ConfigurarEmpresaModal guardando={false} error="Ya existe una empresa configurada con el RUC 20123456786" sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByText(/Ya existe una empresa configurada/)).toBeInTheDocument();
  });

  it('mientras guardando=true, el botón muestra el spinner y queda deshabilitado', () => {
    render(<ConfigurarEmpresaModal guardando={true} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    expect(screen.getByRole('button', { name: /Guardar y activar/i })).toBeDisabled();
  });

  it('el botón Cancelar llama a onClose', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
  });
});
