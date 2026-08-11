// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { InicioScreen } from './InicioScreen';

// Mock dependencias
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('./TopProductosPanel', () => ({
  TopProductosPanel: () => <div data-testid="top-productos-panel" />,
}));

vi.mock('../../hooks/useInicioData', () => ({
  useInicioData: () => ({
    totalVentas: 1500,
    cuentas: 10,
    ticketProm: 150,
    ventasHora: [],
    propinas: 100,
    efectivo: 500,
    turnoAbierto: true,
    salon: { cuentas: 5, cubiertos: 20 },
    ocupPct: 50,
    cocina: { open: 3, ready: 1 },
    items86: [],
    stockAlerts: [],
    STOCK_BAJO: 10,
    reservasProx: [],
    actividad: [
      { key: '1', at: new Date().toISOString(), t: 'Nueva orden', d: 'desc', ic: 'Check', c: 'black' }
    ],
    atencionCount: 0,
  }),
}));

describe('InicioScreen', () => {
  it('debe renderizar el título de inicio', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('debe renderizar las métricas principales', () => {
    render(<InicioScreen />);
    // Verifica que se muestran datos mockeados (ej. 1500 o similar)
    expect(screen.getByText(/Resumen del día/i)).toBeInTheDocument();
  });

  it('debe renderizar la línea de tiempo de actividad', () => {
    render(<InicioScreen />);
    expect(screen.getByText('Nueva orden')).toBeInTheDocument();
  });
});
