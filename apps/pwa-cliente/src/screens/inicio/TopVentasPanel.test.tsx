// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopVentasPanel } from './TopVentasPanel';
import { useReportesQuery } from '../../hooks/queries/useReportesQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';

vi.mock('../../hooks/queries/useReportesQuery', () => ({
  useReportesQuery: vi.fn(),
}));
vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: vi.fn(),
}));

describe('TopVentasPanel', () => {
  beforeEach(() => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: false } as any);
    vi.mocked(useReportesQuery).mockReturnValue({
      resumen: { topPlatos: [], topProductos: [] } as any,
      loading: false,
      error: null,
      fetch: vi.fn(),
    } as any);
  });

  it('renderiza el título recibido por prop', () => {
    render(<TopVentasPanel titulo="Top platos" campo="topPlatos" />);
    expect(screen.getByText('Top platos')).toBeInTheDocument();
  });

  it('renderiza los chips de período', () => {
    render(<TopVentasPanel titulo="Top productos" campo="topProductos" />);
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

  it('muestra mensaje vacío cuando no hay datos', () => {
    render(<TopVentasPanel titulo="Top productos" campo="topProductos" />);
    expect(screen.getAllByText(/Sin ventas en este período/i).length).toBeGreaterThan(0);
  });

  it('lee del campo `topPlatos` cuando así se le indica', () => {
    vi.mocked(useReportesQuery).mockReturnValue({
      resumen: {
        topPlatos: [{ productoId: '1', nombre: 'Lomo Saltado', cantidad: 5, ingresos: 150 }],
        topProductos: [{ productoId: '2', nombre: 'Cristal', cantidad: 9, ingresos: 72 }],
      } as any,
      loading: false,
      error: null,
      fetch: vi.fn(),
    } as any);
    render(<TopVentasPanel titulo="Top platos" campo="topPlatos" />);
    expect(screen.getAllByText('Lomo Saltado').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cristal')).not.toBeInTheDocument();
  });

  it('lee del campo `topProductos` cuando así se le indica', () => {
    vi.mocked(useReportesQuery).mockReturnValue({
      resumen: {
        topPlatos: [{ productoId: '1', nombre: 'Lomo Saltado', cantidad: 5, ingresos: 150 }],
        topProductos: [{ productoId: '2', nombre: 'Cristal', cantidad: 9, ingresos: 72 }],
      } as any,
      loading: false,
      error: null,
      fetch: vi.fn(),
    } as any);
    render(<TopVentasPanel titulo="Top productos" campo="topProductos" />);
    expect(screen.getAllByText('Cristal').length).toBeGreaterThan(0);
    expect(screen.queryByText('Lomo Saltado')).not.toBeInTheDocument();
  });

  it('al elegir un período distinto, vuelve a consultar useReportesQuery con el rango correspondiente', () => {
    render(<TopVentasPanel titulo="Top productos" campo="topProductos" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));

    const ultimaLlamada = vi.mocked(useReportesQuery).mock.calls.at(-1)?.[0];
    expect(ultimaLlamada?.desde).toMatch(/^\d{4}-\d{2}-01$/);
    expect(ultimaLlamada?.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('el chip del período activo queda marcado', () => {
    render(<TopVentasPanel titulo="Top productos" campo="topProductos" />);
    fireEvent.click(screen.getByRole('button', { name: 'Año' }));
    expect(screen.getByRole('button', { name: 'Año' }).className).toContain('on');
    expect(screen.getByRole('button', { name: 'Hoy' }).className).not.toContain('on');
  });

  it('escopa el resumen a la sede actual (bug: Top productos mezclaba ventas de todas las sedes)', () => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: { id: 'sede-1' }, loading: false } as any);
    render(<TopVentasPanel titulo="Top productos" campo="topProductos" />);
    const ultimaLlamada = vi.mocked(useReportesQuery).mock.calls.at(-1)?.[0];
    expect(ultimaLlamada?.sedeId).toBe('sede-1');
  });
});
