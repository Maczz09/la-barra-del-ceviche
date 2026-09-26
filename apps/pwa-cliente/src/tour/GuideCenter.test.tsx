// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/auth.store';
import { launchModuleGuide, launchSteps } from './spotlight';
import { GuideCenter } from './GuideCenter';

vi.mock('../store/auth.store', () => ({ useAuthStore: vi.fn() }));
vi.mock('./spotlight', () => ({ launchModuleGuide: vi.fn(), launchSteps: vi.fn() }));

describe('centro de guías', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useAuthStore).mockImplementation((selector) => selector({ user: { id: 'cocina-1', nombre: 'Ana', rol: 'COCINA' } } as never));
  });

  it('muestra solo las guías del rol y arranca la pantalla actual', async () => {
    render(<MemoryRouter initialEntries={['/app/cocina']}><GuideCenter /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir guías de uso' }));
    expect(screen.getByRole('dialog', { name: 'Guías de uso' })).toBeInTheDocument();
    expect(screen.getByText('Impresión de cocina')).toBeInTheDocument();
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Explicar esta pantalla/ }));
    await waitFor(() => expect(launchModuleGuide).toHaveBeenCalledWith('cocina', 'COCINA', expect.any(Function)));
  });

  it('permite iniciar la introducción común sin cambiar datos', async () => {
    render(<MemoryRouter initialEntries={['/app/cocina']}><GuideCenter /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir guías de uso' }));
    fireEvent.click(screen.getByRole('button', { name: /Conocer la aplicación/ }));
    await waitFor(() => expect(launchSteps).toHaveBeenCalled());
    const steps = vi.mocked(launchSteps).mock.calls[0][0];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.some((item) => item.target === '[data-guide="help"]')).toBe(true);
  });
});
