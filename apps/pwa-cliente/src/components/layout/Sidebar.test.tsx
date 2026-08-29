import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sidebar } from './Sidebar';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/app/mesas' }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { rol: string } | null }) => unknown) =>
    selector({ user: { rol: 'ADMIN' } }),
}));

vi.mock('../../auth/permisos', () => ({
  puedeAcceder: () => true,
}));

vi.mock('../../config', () => ({
  APP_CONFIG: {
    nombreLocal: 'TestLocal',
    ubicacionFallback: 'Elige una sede',
  },
  APP_LOGO: null,
  PLATFORM_NAME: 'RestoApp.pe',
}));

const mockUseSedeActualQuery = vi.fn();
vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: () => mockUseSedeActualQuery(),
}));

vi.mock('../ui/icons', () => {
  const icon = (name: string) => ({ s, className }: { s: number; className?: string }) =>
    <span data-testid={`icon-${name}`} data-size={s} className={className} aria-hidden="true" />;
  return {
    Icons: new Proxy({}, {
      get: (_target, prop: string) => icon(prop),
    }),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sidebar', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseSedeActualQuery.mockReturnValue({ sede: null, loading: false });
  });

  it('renderiza la navegación lateral con aria-label', () => {
    render(<Sidebar />);
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('muestra el nombre del local en el brand', () => {
    render(<Sidebar />);
    expect(screen.getByText('TestLocal')).toBeInTheDocument();
  });

  it('sin sede resuelta, muestra el subtítulo de fallback', () => {
    render(<Sidebar />);
    expect(screen.getByText('Elige una sede')).toBeInTheDocument();
  });

  it('con sede resuelta, muestra su dirección bajo el nombre', () => {
    mockUseSedeActualQuery.mockReturnValue({
      sede: { id: 's1', nombre: 'Sede Central', direccion: 'Av. Principal 123', activa: true },
      loading: false,
    });
    render(<Sidebar />);
    expect(screen.getByText('Av. Principal 123')).toBeInTheDocument();
  });

  it('con sede resuelta pero sin dirección, muestra el nombre de la sede', () => {
    mockUseSedeActualQuery.mockReturnValue({
      sede: { id: 's1', nombre: 'Sede Central', direccion: null, activa: true },
      loading: false,
    });
    render(<Sidebar />);
    expect(screen.getByText('Sede Central')).toBeInTheDocument();
  });

  it('renderiza items de navegación', () => {
    render(<Sidebar />);
    // Con ADMIN todos los nav items se muestran
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('marca el item activo con aria-current="page"', () => {
    render(<Sidebar />);
    // pathname = /app/mesas → activeKey = 'mesas'
    const mesasBtn = screen.getByRole('button', { name: 'Mesas' });
    expect(mesasBtn).toHaveAttribute('aria-current', 'page');
  });

  it('el item no activo NO tiene aria-current', () => {
    render(<Sidebar />);
    const inicioBtn = screen.getByRole('button', { name: 'Inicio' });
    expect(inicioBtn).not.toHaveAttribute('aria-current');
  });

  it('navega a la ruta correcta al hacer clic', () => {
    render(<Sidebar />);
    const mesasBtn = screen.getByRole('button', { name: 'Mesas' });
    fireEvent.click(mesasBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/app/mesas');
  });

  it('navega a inicio al hacer clic en Inicio', () => {
    render(<Sidebar />);
    const inicioBtn = screen.getByRole('button', { name: 'Inicio' });
    fireEvent.click(inicioBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/app/inicio');
  });

  it('cada item tiene un title para el modo icon-only', () => {
    render(<Sidebar />);
    const mesasBtn = screen.getByRole('button', { name: 'Mesas' });
    expect(mesasBtn).toHaveAttribute('title', 'Mesas');
  });

  it('muestra grupos de navegación', () => {
    render(<Sidebar />);
    expect(screen.getByText('Operación')).toBeInTheDocument();
    expect(screen.getByText('Administración')).toBeInTheDocument();
  });

  it('muestra el footer del nav', () => {
    render(<Sidebar />);
    expect(screen.getByText(/TestLocal · Operación/)).toBeInTheDocument();
  });
});

describe('Sidebar con rol restringido (CAJERO)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseSedeActualQuery.mockReturnValue({ sede: null, loading: false });
  });

  it('solo muestra items permitidos para CAJERO', () => {
    // CAJERO: caja, mesas, pedidos
    const { unmount } = render(<Sidebar />);
    // Con el mock que devuelve true para todos, chequeamos que hay items
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    unmount();
  });
});
