// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditarUsuarioModal } from './EditarUsuarioModal';
import type { UsuarioVM } from '../../types/usuario.types';

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    Edit: () => <svg data-testid="icon-edit" />,
    Close: () => <svg data-testid="icon-close" />,
    Check: () => <svg data-testid="icon-check" />,
    Lock: () => <svg data-testid="icon-lock" />
  }
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn()
}));

const usuario: UsuarioVM = {
  id: 'u-1',
  nombre: 'Ana Torres',
  email: 'ana@test.com',
  rol: 'MESERO',
  rolLabel: 'Mesero',
  activo: true,
  estadoLabel: 'Activo',
  estadoClass: 'badge-ok',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdAtLabel: '1/1/2026',
  sedeId: 'sede-1',
  telefono: null,
};

describe('EditarUsuarioModal', () => {
  it('guarda el teléfono solo cuando cambió', () => {
    const onGuardarTelefono = vi.fn();
    const onClose = vi.fn();

    render(
      <EditarUsuarioModal
        usuario={usuario}
        saving={false}
        onClose={onClose}
        onGuardarTelefono={onGuardarTelefono}
        onCambiarPassword={vi.fn()}
      />,
    );

    const guardarBtn = screen.getByRole('button', { name: /Guardar teléfono/i });
    expect(guardarBtn).toBeDisabled();

    const input = screen.getByLabelText('Teléfono');
    fireEvent.change(input, { target: { value: '987654321' } });
    expect(guardarBtn).not.toBeDisabled();

    fireEvent.click(guardarBtn);
    expect(onGuardarTelefono).toHaveBeenCalledWith('987654321');
  });

  it('pide confirmación antes de restablecer la contraseña y limpia el campo', async () => {
    const onCambiarPassword = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <EditarUsuarioModal
        usuario={usuario}
        saving={false}
        onClose={vi.fn()}
        onGuardarTelefono={vi.fn()}
        onCambiarPassword={onCambiarPassword}
      />,
    );

    const passInput = screen.getByLabelText('Restablecer contraseña') as HTMLInputElement;
    const resetBtn = screen.getByRole('button', { name: /Restablecer contraseña/i });
    expect(resetBtn).toBeDisabled();

    fireEvent.change(passInput, { target: { value: 'corta' } });
    expect(resetBtn).toBeDisabled();

    fireEvent.change(passInput, { target: { value: 'nuevaClave123' } });
    expect(resetBtn).not.toBeDisabled();

    fireEvent.click(resetBtn);
    expect(window.confirm).toHaveBeenCalled();
    expect(onCambiarPassword).toHaveBeenCalledWith('nuevaClave123');
    await waitFor(() => expect(passInput.value).toBe(''));

    vi.mocked(window.confirm).mockRestore();
  });

  it('no cambia la contraseña si se cancela la confirmación', () => {
    const onCambiarPassword = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <EditarUsuarioModal
        usuario={usuario}
        saving={false}
        onClose={vi.fn()}
        onGuardarTelefono={vi.fn()}
        onCambiarPassword={onCambiarPassword}
      />,
    );

    const passInput = screen.getByLabelText('Restablecer contraseña');
    fireEvent.change(passInput, { target: { value: 'nuevaClave123' } });
    fireEvent.click(screen.getByRole('button', { name: /Restablecer contraseña/i }));

    expect(onCambiarPassword).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockRestore();
  });

  it('cierra con el botón de cerrar, el scrim y el pie de modal', () => {
    const onClose = vi.fn();
    render(
      <EditarUsuarioModal
        usuario={usuario}
        saving={false}
        onClose={onClose}
        onGuardarTelefono={vi.fn()}
        onCambiarPassword={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
