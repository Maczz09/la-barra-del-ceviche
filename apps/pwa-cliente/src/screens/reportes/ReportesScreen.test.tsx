// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportesScreen } from './ReportesScreen';
import * as reportesQueryHook from '../../hooks/queries/useReportesQuery';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { useAuthStore } from '../../store/auth.store';

const mockExportarResumenPdf = vi.fn();
vi.mock('../../utils/reportePdf', () => ({
  exportarResumenPdf: (...args: unknown[]) => mockExportarResumenPdf(...args),
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedesQuery: vi.fn(),
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

describe('ReportesScreen', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockExportarResumenPdf.mockReset();
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: null,
      loading: true,
      error: null,
      fetch: mockFetch
    } as any);
    // Usuario pineado por defecto (p.ej. Gerencia de una sede): el selector
    // de sede no debe verse.
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({ user: { rol: 'GERENCIA', sedeId: 'sede-001' } }),
    );
    vi.mocked(useSedesQuery).mockReturnValue({ sedes: [] } as any);
  });

  it('renders loading skeletons', () => {
    render(<ReportesScreen />);
    // Check if we render skeletons
    expect(screen.getByText('Reportes')).toBeInTheDocument();
  });

  it('renders empty state when no data and not loading', () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: null,
      loading: false,
      error: null,
      fetch: mockFetch
    } as any);
    render(<ReportesScreen />);
    expect(screen.getByText('Sin resumen disponible')).toBeInTheDocument();
  });

  it('renders error banner', () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: null,
      loading: false,
      error: 'Error message',
      fetch: mockFetch
    } as any);
    render(<ReportesScreen />);
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('calls fetch on refresh button click', () => {
    render(<ReportesScreen />);
    fireEvent.click(screen.getByTitle('Refrescar'));
    expect(mockFetch).toHaveBeenCalled();
  });

  it('renders report data correctly with empty arrays', () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: {
        ingresosLabel: 'S/ 100',
        fechaLabel: 'Hoy',
        totalVentas: 5,
        ticketPromedioLabel: 'S/ 20',
        ventasPorHora: [],
        topPlatos: [],
        topProductos: [],
        productosMenosVendidos: [],
        estadisticasTicket: { media: 20, mediana: 0, moda: null, medianaLabel: 'Sin ventas', modaLabel: 'Sin moda repetida' },
      },
      loading: false,
      error: null,
      fetch: mockFetch
    } as any);
    render(<ReportesScreen />);

    expect(screen.getByText('S/ 100')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('S/ 20')).toBeInTheDocument();

    expect(screen.getByText('Sin desglose horario')).toBeInTheDocument();
    expect(screen.getByText('Sin top platos')).toBeInTheDocument();
    expect(screen.getByText('Sin top productos')).toBeInTheDocument();
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
  });

  it('renders report data with arrays', () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: {
        ingresosLabel: 'S/ 100',
        fechaLabel: 'Hoy',
        totalVentas: 5,
        ticketPromedioLabel: 'S/ 20',
        ventasPorHora: [
          { hora: '12:00', total: 50 },
          { hora: '13:00', total: 0 } // coverage for max || 1
        ],
        topPlatos: [
          { productoId: 'P0', nombre: 'Ceviche', cantidad: 4, ingresos: 120 },
        ],
        topProductos: [
          { productoId: 'P1', nombre: 'Burger', cantidad: 2, ingresos: 50 },
          { nombre: 'Fries', cantidad: 3, ingresos: null } // coverage for item.productoId ?? item.nombre and null ingresos
        ],
        productosMenosVendidos: [
          { productoId: 'P2', nombre: 'Chicha morada', cantidad: 1, ingresos: 8 },
        ],
        estadisticasTicket: { media: 20, mediana: 18, moda: 15, medianaLabel: 'S/ 18.00', modaLabel: 'S/ 15.00' },
      },
      loading: false,
      error: null,
      fetch: mockFetch
    } as any);
    render(<ReportesScreen />);

    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.getByText('13:00')).toBeInTheDocument();

    expect(screen.getByText('Ceviche')).toBeInTheDocument();
    expect(screen.getByText('S/ 120.00')).toBeInTheDocument();
    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByText('S/ 50.00')).toBeInTheDocument();
    expect(screen.getByText('Fries')).toBeInTheDocument();
    expect(screen.getByText('Sin dato')).toBeInTheDocument();
    expect(screen.getByText('Chicha morada')).toBeInTheDocument();
    expect(screen.getByText('S/ 18.00')).toBeInTheDocument();
    expect(screen.getByText('S/ 15.00')).toBeInTheDocument();
  });

  it('el botón de exportar PDF está deshabilitado sin resumen', () => {
    render(<ReportesScreen />);
    expect(screen.getByTitle('Exportar PDF')).toBeDisabled();
  });

  it('aplica el filtro de fecha y lo pasa al hook', () => {
    render(<ReportesScreen />);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-06-30' } });

    expect(reportesQueryHook.useReportesQuery).toHaveBeenLastCalledWith({
      desde: '2026-06-01',
      hasta: '2026-06-30',
      sedeId: undefined,
    });
  });

  it('limpia el filtro de fecha', () => {
    render(<ReportesScreen />);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtro' }));

    expect(reportesQueryHook.useReportesQuery).toHaveBeenLastCalledWith({
      desde: undefined,
      hasta: undefined,
      sedeId: undefined,
    });
  });

  it('un usuario pineado no ve el selector de sede', () => {
    render(<ReportesScreen />);
    expect(screen.queryByLabelText('Sede')).not.toBeInTheDocument();
  });

  it('el admin general ve el selector de sede y lo pasa al hook', () => {
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({ user: { rol: 'ADMIN', sedeId: null } }),
    );
    vi.mocked(useSedesQuery).mockReturnValue({
      sedes: [{ id: 'sede-001', nombre: 'Sede Principal', activa: true }],
    } as any);

    render(<ReportesScreen />);
    fireEvent.change(screen.getByLabelText('Sede'), { target: { value: 'sede-001' } });

    expect(reportesQueryHook.useReportesQuery).toHaveBeenLastCalledWith({
      desde: undefined,
      hasta: undefined,
      sedeId: 'sede-001',
    });
  });

  it('exporta el PDF al hacer click, con resumen disponible', async () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: {
        ingresosLabel: 'S/ 100', fechaLabel: 'Hoy', rangoLabel: 'Hoy',
        totalVentas: 5, ticketPromedioLabel: 'S/ 20', ventasPorHora: [], topPlatos: [], topProductos: [],
        productosMenosVendidos: [], estadisticasTicket: { media: 20, mediana: 0, moda: null, medianaLabel: 'Sin ventas', modaLabel: 'Sin moda repetida' },
      },
      loading: false,
      error: null,
      fetch: mockFetch,
    } as any);
    mockExportarResumenPdf.mockResolvedValue(undefined);

    render(<ReportesScreen />);
    fireEvent.click(screen.getByTitle('Exportar PDF'));

    await waitFor(() => expect(mockExportarResumenPdf).toHaveBeenCalledTimes(1));
  });

  it('muestra un banner de error si la exportación del PDF falla', async () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: {
        ingresosLabel: 'S/ 100', fechaLabel: 'Hoy', rangoLabel: 'Hoy',
        totalVentas: 5, ticketPromedioLabel: 'S/ 20', ventasPorHora: [], topPlatos: [], topProductos: [],
        productosMenosVendidos: [], estadisticasTicket: { media: 20, mediana: 0, moda: null, medianaLabel: 'Sin ventas', modaLabel: 'Sin moda repetida' },
      },
      loading: false,
      error: null,
      fetch: mockFetch,
    } as any);
    mockExportarResumenPdf.mockRejectedValue(new Error('jsPDF no disponible'));

    render(<ReportesScreen />);
    fireEvent.click(screen.getByTitle('Exportar PDF'));

    await waitFor(() => expect(screen.getByText('jsPDF no disponible')).toBeInTheDocument());
  });
});

