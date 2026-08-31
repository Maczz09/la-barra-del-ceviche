import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localRuntimeApi } from '../../api/local-runtime.api';
import { ConfiguracionInicialScreen } from './ConfiguracionInicialScreen';

vi.mock('../../api/local-runtime.api', () => ({
  localRuntimeApi: {
    onboarding: vi.fn(),
    createAdmin: vi.fn(),
  },
}));

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/configuracion-inicial']}>
      <Routes>
        <Route path="/configuracion-inicial" element={<ConfiguracionInicialScreen />} />
        <Route path="/login" element={<div>Inicio de sesión</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConfiguracionInicialScreen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirige al login cuando la configuración ya estaba completa al abrir', async () => {
    vi.mocked(localRuntimeApi.onboarding).mockResolvedValue({ complete: true });
    renderScreen();
    expect(await screen.findByText('Inicio de sesión')).toBeInTheDocument();
  });

  it('recupera la carrera si otro proceso creó el administrador con el formulario abierto', async () => {
    vi.mocked(localRuntimeApi.onboarding)
      .mockResolvedValueOnce({ complete: false })
      .mockResolvedValueOnce({ complete: true });
    vi.mocked(localRuntimeApi.createAdmin).mockRejectedValue(new Error('La configuración inicial ya fue completada'));
    renderScreen();

    fireEvent.change(await screen.findByLabelText('Nombre completo'), { target: { value: 'Administrador' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'admin@labarradelceviche.pe' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'BarraCeviche#2026!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear administrador' }));

    await waitFor(() => expect(screen.getByText('Inicio de sesión')).toBeInTheDocument());
    expect(screen.queryByText('La configuración inicial ya fue completada')).not.toBeInTheDocument();
  });
});
