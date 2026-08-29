// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditarEmpresaModal } from './EditarEmpresaModal';
import type { EmpresaDto } from '../../types/facturacion.types';
import type { SedeDto } from '../../types/sede.types';

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

const empresa: EmpresaDto = {
  id: 'e-1',
  slot: 1,
  ruc: '20123456786',
  sedeId: null,
  razonSocial: 'Empresa Demo S.A.C.',
  nombreComercial: null,
  direccion: null,
  ubigeo: null,
  codigoEstablecimiento: '0000',
  solUsuario: 'MODDATOS',
  activo: true,
};

const sedes: SedeDto[] = [
  { id: 'sede-1', nombre: 'Sede Central', activa: true },
  { id: 'sede-2', nombre: 'Sede Secundaria', activa: true },
] as SedeDto[];

describe('EditarEmpresaModal', () => {
  const onGuardar = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onGuardar.mockResolvedValue(undefined);
  });

  it('precarga los campos con los datos actuales de la empresa, con el RUC como texto no editable', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByLabelText('Razón social')).toHaveValue('Empresa Demo S.A.C.');
    expect(screen.getByLabelText('Usuario SOL')).toHaveValue('MODDATOS');
    expect(screen.getByText(/RUC 20123456786/)).toBeInTheDocument();
    expect(screen.queryByLabelText('RUC')).not.toBeInTheDocument();
  });

  it('guarda sin tocar Clave SOL ni certificado cuando se dejan en blanco', async () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith({
        razonSocial: 'Empresa Demo S.A.C.',
        nombreComercial: '',
        direccion: '',
        solUsuario: 'MODDATOS',
      });
    });
  });

  it('omite ubigeo y solUsuario del payload cuando quedan en blanco (no los pisa con vacío)', async () => {
    const empresaSinExtras: EmpresaDto = { ...empresa, ubigeo: null, solUsuario: null };
    render(<EditarEmpresaModal empresa={empresaSinExtras} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(
        expect.not.objectContaining({ ubigeo: expect.anything(), solUsuario: expect.anything() }),
      );
    });
  });

  it('un ubigeo de menos de 6 dígitos deja el botón deshabilitado', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Ubigeo'), { target: { value: '123' } });
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('incluye solClave solo si se escribió algo', async () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Clave SOL nueva'), { target: { value: 'clave-nueva' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ solClave: 'clave-nueva' }));
    });
  });

  it('un certificado nuevo sin su contraseña deja el botón deshabilitado y no guarda', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    const archivo = new File(['contenido'], 'certificado.p12', { type: 'application/x-pkcs12' });
    fireEvent.change(screen.getByLabelText(/Nuevo certificado/), { target: { files: [archivo] } });

    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('un certificado nuevo con su contraseña se envía junto en el payload', async () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    const archivo = new File(['contenido'], 'certificado.p12', { type: 'application/x-pkcs12' });
    fireEvent.change(screen.getByLabelText(/Nuevo certificado/), { target: { files: [archivo] } });
    fireEvent.change(screen.getByLabelText('Contraseña del certificado nuevo'), { target: { value: 'clave-cert-nueva' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(
        expect.objectContaining({ certificado: archivo, certificadoPass: 'clave-cert-nueva' }),
      );
    });
  });

  it('no incluye sedeId en el payload si no se tocó el selector', async () => {
    const conSede: EmpresaDto = { ...empresa, sedeId: 'sede-1' };
    render(<EditarEmpresaModal empresa={conSede} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(expect.not.objectContaining({ sedeId: expect.anything() }));
    });
  });

  it('cambiar la sede la incluye en el payload', async () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Sede que emite'), { target: { value: 'sede-2' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ sedeId: 'sede-2' }));
    });
  });

  it('desvincular la sede manda sedeId vacío', async () => {
    const conSede: EmpresaDto = { ...empresa, sedeId: 'sede-1' };
    render(<EditarEmpresaModal empresa={conSede} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Sede que emite'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ sedeId: '' }));
    });
  });

  it('una razón social vacía deja el botón deshabilitado', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'ab' } });
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('muestra el error que le pasan por props', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error="El certificado o su contraseña no son válidos" sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByText(/certificado o su contraseña no son válidos/)).toBeInTheDocument();
  });

  it('mientras guardando=true, el botón queda deshabilitado', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={true} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('el botón Cancelar, el de cerrar y el scrim llaman a onClose', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} sedesDisponibles={sedes} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // El scrim y el botón X del header comparten el mismo aria-label "Cerrar".
    const cerrarBtns = screen.getAllByRole('button', { name: 'Cerrar' });
    expect(cerrarBtns).toHaveLength(2);
    fireEvent.click(cerrarBtns[0]);
    fireEvent.click(cerrarBtns[1]);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
