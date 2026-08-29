import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InicioScreen } from './InicioScreen';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../components/ui/icons', () => {
  const icon = (name: string) => ({ s, style }: { s?: number; style?: React.CSSProperties }) =>
    <span data-testid={`icon-${name}`} data-size={s} style={style} aria-hidden="true" />;
  return {
    Icons: new Proxy({}, {
      get: (_target, prop: string) => icon(prop),
    }),
  };
});

vi.mock('../../components/ui/Stat', () => ({
  HeroStat: ({ k, v, sub, children }: { k: string; v: string | number; sub: string; children?: React.ReactNode }) => (
    <div data-testid="hero-stat">
      <span data-testid="stat-key">{k}</span>
      <span data-testid="stat-value">{v}</span>
      <span data-testid="stat-sub">{sub}</span>
      {children}
    </div>
  ),
}));

vi.mock('../../utils/format', () => ({
  fmt: (n: number) => `S/${n.toFixed(2)}`,
  elapsedMin: () => 5,
  fechaLocalISO: () => '2024-01-15',
}));

// Mock useInicioData como vi.fn() para poder sobreescribir en tests individuales
const mockUseInicioData = vi.fn();

vi.mock('../../hooks/useInicioData', () => ({
  useInicioData: () => mockUseInicioData(),
}));

// TopVentasPanel maneja su propia consulta (con filtro de período) —
// se prueba por separado en TopVentasPanel.test.tsx.
vi.mock('./TopVentasPanel', () => ({
  TopVentasPanel: ({ titulo }: { titulo: string }) => <div data-testid="top-ventas-panel">{titulo}</div>,
}));

// CartaQrPanel maneja su propia consulta de sede — se prueba por separado
// en CartaQrPanel.test.tsx.
vi.mock('./CartaQrPanel', () => ({
  CartaQrPanel: () => <div data-testid="carta-qr-panel" />,
}));

// Datos base vacíos/cero
const defaultInicioData = {
  totalVentas: 0,
  cuentas: 0,
  ticketProm: 0,
  ventasHora: [],
  propinas: 0,
  efectivo: 0,
  turnoAbierto: false,
  salon: { total: 10, ocupadas: 3, reservadas: 1, libres: 6 },
  ocupPct: 30,
  cocina: { activos: 2, prom: 8, demora: 0 },
  items86: [],
  stockAlerts: [],
  reservasProx: [],
  actividad: [],
  atencionCount: 0,
  STOCK_BAJO: 5,
  fmt: (n: number) => `S/${n.toFixed(2)}`,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InicioScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseInicioData.mockReturnValue(defaultInicioData);
  });

  it('renderiza el título "Inicio"', () => {
    render(<InicioScreen />);
    expect(screen.getByRole('heading', { name: 'Inicio', level: 1 })).toBeInTheDocument();
  });

  it('renderiza el subtítulo de resumen', () => {
    render(<InicioScreen />);
    expect(screen.getByText(/Resumen del día/)).toBeInTheDocument();
  });

  it('renderiza botón "Ver cocina"', () => {
    render(<InicioScreen />);
    expect(screen.getByRole('button', { name: /Ver cocina/i })).toBeInTheDocument();
  });

  it('renderiza botón "Ir a caja" en la cabecera', () => {
    render(<InicioScreen />);
    const cajaBtns = screen.getAllByRole('button', { name: /Ir a caja/i });
    expect(cajaBtns.length).toBeGreaterThan(0);
  });

  it('botón "Ver cocina" navega a /app/cocina', () => {
    render(<InicioScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Ver cocina/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/app/cocina');
  });

  it('botón "Ir a caja" de cabecera navega a /app/caja', () => {
    render(<InicioScreen />);
    // El primero es el de la cabecera
    const cajaBtns = screen.getAllByRole('button', { name: /Ir a caja/i });
    fireEvent.click(cajaBtns[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/app/caja');
  });

  it('renderiza 6 HeroStats', () => {
    render(<InicioScreen />);
    expect(screen.getAllByTestId('hero-stat')).toHaveLength(6);
  });

  it('muestra stat de "Ventas del día"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Ventas del día')).toBeInTheDocument();
  });

  it('calcula el IGV del día como 18% incluido en las ventas totales, no un cargo aparte', () => {
    mockUseInicioData.mockReturnValue({ ...defaultInicioData, totalVentas: 118 });
    render(<InicioScreen />);
    expect(screen.getByText('IGV del día')).toBeInTheDocument();
    // 118 con IGV incluido al 18% → operación gravada 100, IGV exactamente 18.
    // (este archivo mockea fmt() sin espacio tras "S/", ver el vi.mock de arriba)
    expect(screen.getByText('S/18.00')).toBeInTheDocument();
  });

  it('muestra stat de "Mesas ocupadas"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Mesas ocupadas')).toBeInTheDocument();
  });

  it('muestra stat de "Ticket promedio"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Ticket promedio')).toBeInTheDocument();
  });

  it('muestra banner de estado operativo', () => {
    render(<InicioScreen />);
    expect(screen.getByRole('region', { name: 'Estado operativo del turno' })).toBeInTheDocument();
  });

  it('sin alertas, muestra "Operación sin alertas críticas"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Operación sin alertas críticas')).toBeInTheDocument();
  });

  it('botón "Ver salón" en el ops-strip cuando no hay alertas', () => {
    render(<InicioScreen />);
    expect(screen.getByRole('button', { name: /Ver salón/i })).toBeInTheDocument();
  });

  it('"Ver salón" navega a mesas', () => {
    render(<InicioScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Ver salón/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/app/mesas');
  });

  it('renderiza los paneles "Top platos" y "Top productos" por separado', () => {
    render(<InicioScreen />);
    const paneles = screen.getAllByTestId('top-ventas-panel');
    expect(paneles).toHaveLength(2);
    expect(paneles.map((p) => p.textContent)).toEqual(['Top platos', 'Top productos']);
  });

  it('renderiza sección "Requiere atención"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Requiere atención')).toBeInTheDocument();
  });

  it('sin alertas muestra "Todo en orden. Sin alertas."', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Todo en orden. Sin alertas.')).toBeInTheDocument();
  });

  it('renderiza sección "Salón ahora" con porcentaje de ocupación', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Salón ahora')).toBeInTheDocument();
    // El porcentaje aparece en la cabecera del panel como "30% ocupado"
    expect(screen.getByText('30% ocupado')).toBeInTheDocument();
  });

  it('renderiza sección "Cocina ahora"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Cocina ahora')).toBeInTheDocument();
  });

  it('renderiza sección "Caja"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Caja')).toBeInTheDocument();
  });

  it('muestra badge "Sin turno" cuando no hay turno abierto', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Sin turno')).toBeInTheDocument();
  });

  it('renderiza sección "Próximas reservas"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Próximas reservas')).toBeInTheDocument();
  });

  it('sin reservas muestra "Sin reservas para hoy."', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Sin reservas para hoy.')).toBeInTheDocument();
  });

  it('renderiza sección "Actividad reciente"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Actividad reciente')).toBeInTheDocument();
  });

  it('sin actividad muestra mensaje "Sin actividad reciente"', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Sin actividad reciente en el turno.')).toBeInTheDocument();
  });

  it('"Ver mesas" en el panel salón navega a /app/mesas', () => {
    render(<InicioScreen />);
    const verMesasBtn = screen.getByRole('button', { name: /Ver mesas/i });
    fireEvent.click(verMesasBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/app/mesas');
  });

  it('"Abrir KDS" navega a /app/cocina', () => {
    render(<InicioScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir KDS/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/app/cocina');
  });
});

describe('InicioScreen con datos', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('muestra reservas próximas cuando hay datos', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      reservasProx: [
        {
          id: 'r1', hora: '19:00', clienteNombre: 'Ana García',
          numComensales: 4, mesaPreferida: 'Mesa 5',
          estado: 'CONFIRMADA', createdAt: '2024-01-15T10:00:00Z',
        },
      ],
    });
    render(<InicioScreen />);
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.getByText('19:00')).toBeInTheDocument();
  });

  it('muestra alertas cuando atencionCount > 0', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      atencionCount: 2,
      cocina: { activos: 3, prom: 20, demora: 2 },
    });
    render(<InicioScreen />);
    expect(screen.getByText('2 punto(s) requieren atención')).toBeInTheDocument();
  });

  it('con turno abierto muestra badge "Abierta"', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      turnoAbierto: true,
    });
    render(<InicioScreen />);
    expect(screen.getByText('Abierta')).toBeInTheDocument();
  });

  it('con atencionCount > 0 el ops-strip muestra "Revisar ahora"', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      atencionCount: 1,
      cocina: { activos: 1, prom: 20, demora: 1 },
    });
    render(<InicioScreen />);
    expect(screen.getByRole('button', { name: /Revisar ahora/i })).toBeInTheDocument();
  });

  it('"Revisar ahora" navega a cocina cuando hay alertas', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      atencionCount: 1,
      cocina: { activos: 1, prom: 20, demora: 1 },
    });
    render(<InicioScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Revisar ahora/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/app/cocina');
  });

  it('muestra items86 en la lista de atención', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      items86: ['Lomo Fino'],
      atencionCount: 1,
    });
    render(<InicioScreen />);
    expect(screen.getByText(/86 · Lomo Fino/)).toBeInTheDocument();
  });

  it('muestra stockAlerts en la lista de atención', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      stockAlerts: [{ id: 's1', nombre: 'Aceite', stockActual: 3, stockLabel: '3 L' }],
      atencionCount: 1,
    });
    render(<InicioScreen />);
    expect(screen.getByText(/Stock bajo · Aceite/)).toBeInTheDocument();
  });

  it('muestra gráfico Spark y barras cuando ventasHora tiene datos', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      ventasHora: [
        { hora: '12:00', total: 100 },
        { hora: '13:00', total: 200 },
      ],
    });
    render(<InicioScreen />);
    // La barra de las 12h y 13h debe renderizarse
    expect(screen.getByText('12h')).toBeInTheDocument();
    expect(screen.getByText('13h')).toBeInTheDocument();
    // Spark component debe renderizarse
    const svg = document.querySelector('.spark');
    expect(svg).toBeInTheDocument();
  });

  it('navega a caja desde la sección Caja', () => {
    render(<InicioScreen />);
    // Hay dos botones "Ir a caja", el segundo es el de la sección Caja
    const cajaBtns = screen.getAllByRole('button', { name: /Ir a caja/i });
    fireEvent.click(cajaBtns[1]);
    expect(mockNavigate).toHaveBeenCalledWith('/app/caja');
  });

  it('navega a cocina desde la alerta de demora', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      cocina: { activos: 5, prom: 20, demora: 2 },
    });
    render(<InicioScreen />);
    // Buscamos el botón "Ver" de la alerta
    const verBtns = screen.getAllByRole('button', { name: /Ver/i });
    // El primero debe ser el de cocina (si no hay otros)
    fireEvent.click(verBtns[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/app/cocina');
  });

  it('renderiza PanelActividad con icono fallback', () => {
    mockUseInicioData.mockReturnValue({
      ...defaultInicioData,
      actividad: [
        { key: '1', at: Date.now() - 60000, t: 'Acción', d: 'desc', ic: 'NonExistentIcon', c: 'black' }
      ],
    });
    render(<InicioScreen />);
    expect(screen.getByText('hace 5m')).toBeInTheDocument();
  });
});
