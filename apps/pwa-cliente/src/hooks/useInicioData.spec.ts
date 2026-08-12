// @ts-nocheck
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInicioData } from './useInicioData';

let mockMesas = [];
let mockPedidos = [];
let mockCaja = null;
let mockReportes = null;
let mockReservas = [];
let mockInventario = [];

vi.mock('./queries/useMesasQuery', () => ({
  useMesasQuery: () => ({ mesas: mockMesas }),
}));
vi.mock('./queries/usePedidosQuery', () => ({
  usePedidosQuery: () => ({ pedidos: mockPedidos }),
}));
vi.mock('./queries/useCajaQuery', () => ({
  useCajaQuery: () => ({ resumen: mockCaja }),
}));
const mockUseReportesQuery = vi.fn();
vi.mock('./queries/useReportesQuery', () => ({
  useReportesQuery: (...args: unknown[]) => { mockUseReportesQuery(...args); return { resumen: mockReportes }; },
}));
vi.mock('./queries/useSedesQuery', () => ({
  useSedeActualQuery: () => ({ sede: { id: 'sede-1' }, loading: false }),
}));
vi.mock('./queries/useReservasQuery', () => ({
  useReservasQuery: () => ({ reservas: mockReservas }),
}));
vi.mock('./queries/useInventarioQuery', () => ({
  useInventarioQuery: () => ({ productos: mockInventario }),
}));

describe('useInicioData', () => {
  beforeEach(() => {
    mockMesas = [];
    mockPedidos = [];
    mockCaja = null;
    mockReportes = null;
    mockReservas = [];
    mockInventario = [];
  });

  it('calcula salon correctamente', () => {
    mockMesas = [
      { estado: 'OCUPADA' },
      { estado: 'RESERVADA' },
      { estado: 'LIBRE' },
      { estado: 'LIBRE' }
    ];
    const { result } = renderHook(() => useInicioData());
    expect(result.current.salon.total).toBe(4);
    expect(result.current.salon.ocupadas).toBe(1);
    expect(result.current.salon.reservadas).toBe(1);
    expect(result.current.salon.libres).toBe(2);
    expect(result.current.ocupPct).toBe(25);
  });

  it('calcula cocina correctamente (demora > 15m)', () => {
    const now = Date.now();
    mockPedidos = [
      { estado: 'PENDIENTE', createdAt: new Date(now - 16 * 60000).toISOString() },
      { estado: 'EN_PREPARACION', createdAt: new Date(now - 5 * 60000).toISOString() },
      { estado: 'ENTREGADO', createdAt: new Date(now - 20 * 60000).toISOString() }
    ];
    const { result } = renderHook(() => useInicioData());
    expect(result.current.cocina.activos).toBe(2);
    expect(result.current.cocina.demora).toBe(1);
    expect(result.current.cocina.prom).toBeGreaterThan(0);
  });

  it('calcula inventario (stock bajo y 86)', () => {
    mockInventario = [
      { nombre: 'P1', disponible: false, stockActual: 0 },
      { nombre: 'P2', disponible: true, stockActual: 3 },
      { nombre: 'P3', disponible: true, stockActual: 10 }
    ];
    const { result } = renderHook(() => useInicioData());
    expect(result.current.items86).toEqual(['P1']);
    expect(result.current.stockAlerts.length).toBe(2);
    expect(result.current.atencionCount).toBeGreaterThanOrEqual(3);
  });

  it('filtra y ordena reservas', () => {
    mockReservas = [
      { estado: 'CONFIRMADA', hora: '20:00' },
      { estado: 'CANCELADA', hora: '19:00' },
      { estado: 'PENDIENTE', hora: '18:00' }
    ];
    const { result } = renderHook(() => useInicioData());
    expect(result.current.reservasProx.length).toBe(2);
    expect(result.current.reservasProx[0].hora).toBe('18:00');
  });

  it('construye actividad combinando pedidos y reservas', () => {
    const now = Date.now();
    mockPedidos = [
      { id: '1', estado: 'PAGADO', cliente: 'Pepe', cantidadItems: 2, createdAt: new Date(now - 1000).toISOString() },
      { id: '2', estado: 'LISTO', mesaNumero: '3', cantidadItems: 1, createdAt: new Date(now - 2000).toISOString() },
      { id: '3', estado: 'ENTREGADO', cliente: 'Ana', cantidadItems: 1, createdAt: new Date(now - 3000).toISOString() },
      { id: '4', estado: 'CANCELADO', cliente: 'Juan', cantidadItems: 1, createdAt: new Date(now - 4000).toISOString() },
      { id: '5', estado: 'NUEVO', cliente: 'Luis', cantidadItems: 1, createdAt: new Date(now - 5000).toISOString() }
    ];
    mockReservas = [
      { id: 'r1', estado: 'CONFIRMADA', clienteNombre: 'Sr. X', numComensales: 2, hora: '10:00', createdAt: new Date(now).toISOString() }
    ];
    const { result } = renderHook(() => useInicioData());
    expect(result.current.actividad.length).toBe(6);
    expect(result.current.actividad[0].key).toBe('r-r1');
    expect(result.current.actividad[1].t).toBe('Pago registrado');
  });

  it('devuelve datos de caja y reporte', () => {
    mockReportes = {
      ingresosTotales: 1000,
      totalVentas: 10,
      ticketPromedio: 100,
      topProductos: [],
      ventasPorHora: []
    };
    mockCaja = {
      propinas: 50,
      efectivoEsperado: 200,
      turno: { id: 1 }
    };
    const { result } = renderHook(() => useInicioData());
    expect(result.current.totalVentas).toBe(1000);
    expect(result.current.cuentas).toBe(10);
    expect(result.current.turnoAbierto).toBe(true);
    expect(result.current.ventasHora).toEqual([]);
  });

  it('escopa el resumen de reportes a la sede actual (bug: Inicio mezclaba ventas de todas las sedes)', () => {
    renderHook(() => useInicioData());
    expect(mockUseReportesQuery).toHaveBeenCalledWith({ sedeId: 'sede-1' });
  });
});
