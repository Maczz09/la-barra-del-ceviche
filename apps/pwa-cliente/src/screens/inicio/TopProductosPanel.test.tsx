// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopProductosPanel } from './TopProductosPanel';
import { useReportesQuery } from '../../hooks/queries/useReportesQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';

vi.mock('../../hooks/queries/useReportesQuery', () => ({
  useReportesQuery: vi.fn(),
}));
vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: vi.fn(),
}));

describe('TopProductosPanel', () => {
  beforeEach(() => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: false } as any);
    vi.mocked(useReportesQuery).mockReturnValue({
      resumen: { topProductos: [] } as any,
      loading: false,
      error: null,
      fetch: vi.fn(),
    } as any);
  });

  it('renderiza el título "Top productos"', () => {
    render(<TopProductosPanel />);
    expect(screen.getByText('Top productos')).toBeInTheDocument();
  });

  it('renderiza los chips de período', () => {
    render(<TopProductosPanel />);
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimestre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Año' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verano' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Otoño' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invierno' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Primavera' })).toBeInTheDocument();
  });

  it('muestra mensaje vacío cuando no hay productos', () => {
    render(<TopProductosPanel />);
    expect(screen.getAllByText(/Sin ventas en este período/i).length).toBeGreaterThan(0);
  });

  it('muestra productos cuando el resumen trae datos', () => {
    vi.mocked(useReportesQuery).mockReturnValue({
      resumen: {
        topProductos: [
          { productoId: '1', nombre: 'Lomo Saltado', cantidad: 5, ingresos: 150 },
        ],
      } as any,
      loading: false,
      error: null,
      fetch: vi.fn(),
    } as any);
    render(<TopProductosPanel />);
    expect(screen.getAllByText('Lomo Saltado').length).toBeGreaterThan(0);
  });

  it('al elegir un período distinto, vuelve a consultar useReportesQuery con el rango correspondiente', () => {
    render(<TopProductosPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));

    const ultimaLlamada = vi.mocked(useReportesQuery).mock.calls.at(-1)?.[0];
    expect(ultimaLlamada?.desde).toMatch(/^\d{4}-\d{2}-01$/);
    expect(ultimaLlamada?.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('el chip del período activo queda marcado', () => {
    render(<TopProductosPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Año' }));
    expect(screen.getByRole('button', { name: 'Año' }).className).toContain('on');
    expect(screen.getByRole('button', { name: 'Hoy' }).className).not.toContain('on');
  });

  it('escopa el resumen a la sede actual (bug: Top productos mezclaba ventas de todas las sedes)', () => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: { id: 'sede-1' }, loading: false } as any);
    render(<TopProductosPanel />);
    const ultimaLlamada = vi.mocked(useReportesQuery).mock.calls.at(-1)?.[0];
    expect(ultimaLlamada?.sedeId).toBe('sede-1');
  });
});
