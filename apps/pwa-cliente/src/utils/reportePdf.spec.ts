// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportarResumenPdf } from './reportePdf';
import type { ResumenVM } from '../types/reporte.types';

const mockSave = vi.fn();
const mockText = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetTextColor = vi.fn();
const mockAutoTable = vi.fn();

vi.mock('jspdf', () => ({
  default: class MockJsPDF {
    text = mockText;
    setFontSize = mockSetFontSize;
    setTextColor = mockSetTextColor;
    save = mockSave;
  },
}));

vi.mock('jspdf-autotable', () => ({
  default: (...args: unknown[]) => mockAutoTable(...args),
}));

function resumen(overrides: Partial<ResumenVM> = {}): ResumenVM {
  return {
    fecha: '2026-06-07',
    fechaLabel: '07 de junio de 2026',
    rangoLabel: '07 de junio de 2026',
    totalVentas: 3,
    ingresosTotales: 150,
    ingresosLabel: 'S/ 150.00',
    ticketPromedio: 50,
    ticketPromedioLabel: 'S/ 50.00',
    ventasPorHora: [{ hora: '13:00', total: 100 }],
    topPlatos: [{ nombre: 'Ceviche', cantidad: 2, ingresos: 70 }],
    topProductos: [{ nombre: 'Cristal', cantidad: 4, ingresos: 32 }],
    productosMenosVendidos: [{ nombre: 'Chicha morada', cantidad: 1, ingresos: 8 }],
    estadisticasTicket: { media: 50, mediana: 45, moda: 40, medianaLabel: 'S/ 45.00', modaLabel: 'S/ 40.00' },
    ...overrides,
  };
}

describe('exportarResumenPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('genera el PDF y lo descarga con un nombre de archivo derivado de la fecha', async () => {
    await exportarResumenPdf(resumen());
    expect(mockSave).toHaveBeenCalledWith('reporte-ventas_2026-06-07.pdf');
  });

  it('incluye la tabla de top productos cuando hay datos', async () => {
    await exportarResumenPdf(resumen());
    expect(mockAutoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ head: [['Producto', 'Cantidad', 'Ingresos']] }),
    );
  });

  it('incluye la tabla de ventas por hora cuando hay datos', async () => {
    await exportarResumenPdf(resumen());
    expect(mockAutoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ head: [['Hora', 'Total']] }),
    );
  });

  it('incluye la tabla de productos menos vendidos cuando hay datos', async () => {
    await exportarResumenPdf(resumen());
    expect(mockText).toHaveBeenCalledWith('Productos menos vendidos', expect.any(Number), expect.any(Number));
  });

  it('no llama a autoTable si no hay top platos, top productos, menos vendidos ni ventas por hora', async () => {
    await exportarResumenPdf(resumen({ topPlatos: [], topProductos: [], productosMenosVendidos: [], ventasPorHora: [] }));
    expect(mockAutoTable).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalled();
  });
});
