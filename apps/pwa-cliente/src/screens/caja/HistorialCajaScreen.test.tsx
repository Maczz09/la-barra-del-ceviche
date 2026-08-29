// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistorialCajaScreen } from './HistorialCajaScreen';
import { useHistorialCajaQuery, useTurnoDetalleQuery } from '../../hooks/queries/useHistorialCajaQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { useToast } from '../../components/ui/ToastProvider';
import * as cuentasApi from '../../api/cuentas.api';
import { abrirTicketParaImprimir } from '../../utils/ticketPrint';
import { abrirZTicketParaImprimir } from '../../utils/zTicketPrint';

vi.mock('../../hooks/queries/useHistorialCajaQuery', () => ({
  useHistorialCajaQuery: vi.fn(),
  useTurnoDetalleQuery: vi.fn(),
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: vi.fn(),
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn(),
}));

vi.mock('../../api/cuentas.api', () => ({
  getById: vi.fn(),
}));

vi.mock('../../utils/ticketPrint', () => ({
  abrirTicketParaImprimir: vi.fn(),
}));

vi.mock('../../utils/zTicketPrint', () => ({
  abrirZTicketParaImprimir: vi.fn(),
}));

const mockTurnos = [
  { id: 't1', cajaId: 'T01', cajaNombre: 'Terminal 01', cajeroNombre: 'Yurlury Quispe', estado: 'CERRADA', abiertoAt: '2026-08-08T11:05:00.000Z', cerradoAt: '2026-08-08T19:00:00.000Z' },
  { id: 't2', cajaId: 'T01', cajaNombre: 'Terminal 01', cajeroNombre: null, estado: 'ABIERTA', abiertoAt: '2026-08-09T08:00:00.000Z', cerradoAt: null },
];

function baseListMock(overrides: Record<string, unknown> = {}) {
  return {
    turnos: mockTurnos,
    nextCursor: null,
    loading: false,
    loadingMore: false,
    error: null,
    fetch: vi.fn(),
    fetchMore: vi.fn(),
    ...overrides,
  };
}

function baseDetalleMock(overrides: Record<string, unknown> = {}) {
  return {
    detalle: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('HistorialCajaScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useHistorialCajaQuery).mockReturnValue(baseListMock() as any);
    vi.mocked(useTurnoDetalleQuery).mockReturnValue(baseDetalleMock() as any);
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: false } as any);
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);
  });

  it('renderiza la lista de turnos con sus KPIs', () => {
    render(<HistorialCajaScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Historial de caja' })).toBeInTheDocument();
    expect(screen.getByText('Yurlury Quispe')).toBeInTheDocument();
    expect(screen.getAllByText('Terminal 01')).toHaveLength(2);
  });

  it('filtra por estado CERRADA por defecto', () => {
    render(<HistorialCajaScreen />);
    expect(useHistorialCajaQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'CERRADA' }),
    );
  });

  it('cambia el filtro de estado al hacer click en los chips', () => {
    render(<HistorialCajaScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(useHistorialCajaQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: undefined }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abiertas' }));
    expect(useHistorialCajaQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'ABIERTA' }),
    );
  });

  it('aplica el filtro de fecha', () => {
    render(<HistorialCajaScreen />);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-08-08' } });
    expect(useHistorialCajaQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ desde: '2026-08-01', hasta: '2026-08-08' }),
    );
  });

  it('muestra el estado vacío cuando no hay turnos', () => {
    vi.mocked(useHistorialCajaQuery).mockReturnValue(baseListMock({ turnos: [] }) as any);
    render(<HistorialCajaScreen />);
    expect(screen.getByText('Sin turnos')).toBeInTheDocument();
  });

  it('muestra el banner de error', () => {
    vi.mocked(useHistorialCajaQuery).mockReturnValue(baseListMock({ error: 'No se pudo cargar' }) as any);
    render(<HistorialCajaScreen />);
    expect(screen.getByText('No se pudo cargar')).toBeInTheDocument();
  });

  const ventaAuditoria = {
    id: 'tx1', cuentaId: 'cuenta1', mesaId: 'mesa1', mesaNumero: '5', metodo: 'EFECTIVO',
    monto: 90, descuento: 10, meseroNombre: 'Pepe', cajeroNombre: 'Ana', createdAt: '2026-08-08T18:00:00.000Z',
  };

  it('abre el detalle de un turno al hacer click en la fila', async () => {
    vi.mocked(useTurnoDetalleQuery).mockReturnValue(
      baseDetalleMock({
        detalle: {
          turno: { cajaNombre: 'Terminal 01', cajeroNombre: 'Yurlury Quispe', abiertoAt: '2026-08-08T11:05:00.000Z', cerradoAt: '2026-08-08T19:00:00.000Z' },
          totalVentas: 864,
          propinas: 40,
          efectivoEsperado: 500,
          arqueo: { efectivoEsperado: 500, efectivoContado: 498, diferencia: -2 },
          porMetodo: { EFECTIVO: 500, TARJETA: 200, YAPE: 100, PLIN: 0, TRANSFERENCIA: 64 },
          ventasDetalle: [ventaAuditoria],
        },
      }) as any,
    );

    render(<HistorialCajaScreen />);
    fireEvent.click(screen.getByText('Yurlury Quispe'));

    await waitFor(() => {
      expect(screen.getByText('S/ 864.00')).toBeInTheDocument();
    });
    expect(screen.getByText('S/ -2.00')).toBeInTheDocument();
    // IGV incluido en el precio (18%), no un cargo aparte, sobre las ventas del turno.
    expect(screen.getByText('IGV del turno')).toBeInTheDocument();
    expect(screen.getByText('S/ 131.80')).toBeInTheDocument();
  });

  describe('imprimir el cierre Z de un turno ya cerrado', () => {
    const detalleConArqueo = {
      turno: { cajaNombre: 'Terminal 01', cajeroNombre: 'Yurlury Quispe', abiertoAt: '2026-08-08T11:05:00.000Z', cerradoAt: '2026-08-08T19:00:00.000Z' },
      totalVentas: 864,
      totalEgresos: 0,
      propinas: 40,
      comprobantes: 12,
      efectivoEsperado: 500,
      arqueo: { efectivoEsperado: 500, efectivoContado: 498, diferencia: -2 },
      porMetodo: { EFECTIVO: 500, TARJETA: 200, YAPE: 100, PLIN: 0, TRANSFERENCIA: 64 },
      ventasDetalle: [ventaAuditoria],
    };

    it('muestra el botón solo cuando el turno tiene arqueo (ya cerrado)', async () => {
      vi.mocked(useTurnoDetalleQuery).mockReturnValue(baseDetalleMock({ detalle: detalleConArqueo }) as any);
      render(<HistorialCajaScreen />);
      fireEvent.click(screen.getByText('Yurlury Quispe'));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Imprimir cierre Z de este turno' })).toBeInTheDocument();
      });
    });

    it('oculta el botón cuando el turno no tiene arqueo (sin cerrar aún)', async () => {
      vi.mocked(useTurnoDetalleQuery).mockReturnValue(
        baseDetalleMock({ detalle: { ...detalleConArqueo, arqueo: null } }) as any,
      );
      render(<HistorialCajaScreen />);
      fireEvent.click(screen.getByText('Yurlury Quispe'));
      await waitFor(() => expect(screen.getByText('S/ 864.00')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Imprimir cierre Z de este turno' })).not.toBeInTheDocument();
    });

    it('abre la pestaña dedicada con los datos del turno cerrado', async () => {
      vi.mocked(useTurnoDetalleQuery).mockReturnValue(baseDetalleMock({ detalle: detalleConArqueo }) as any);
      render(<HistorialCajaScreen />);
      fireEvent.click(screen.getByText('Yurlury Quispe'));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Imprimir cierre Z de este turno' }));
      });

      expect(abrirZTicketParaImprimir).toHaveBeenCalledWith({
        k: { porMetodo: detalleConArqueo.porMetodo, totalVentas: 864, totalEgresos: 0, propinas: 40, comprobantes: 12 },
        esperado: 500,
        contado: 498,
        descuadre: -2,
        estado: 'faltante',
        cajeroNombre: 'Yurlury Quispe',
        fecha: '2026-08-08T19:00:00.000Z',
        sede: null,
      });
    });
  });

  describe('imprimir un comprobante desde la auditoría del turno', () => {
    beforeEach(() => {
      vi.mocked(useTurnoDetalleQuery).mockReturnValue(
        baseDetalleMock({
          detalle: {
            turno: { cajaNombre: 'Terminal 01', cajeroNombre: 'Yurlury Quispe', abiertoAt: null, cerradoAt: null },
            totalVentas: 90, propinas: 0, efectivoEsperado: 90, arqueo: null,
            porMetodo: { EFECTIVO: 90, TARJETA: 0, YAPE: 0, PLIN: 0, TRANSFERENCIA: 0 },
            ventasDetalle: [ventaAuditoria],
          },
        }) as any,
      );
    });

    it('reconstruye el ticket desde la cuenta y abre la pestaña dedicada de impresión', async () => {
      vi.mocked(cuentasApi.getById).mockResolvedValue({
        id: 'cuenta1', mesaId: 'mesa1', estado: 'PAGADA', total: 90, createdAt: '', updatedAt: '',
        pedidos: [{ id: 'p1', cuentaId: 'cuenta1', mesaId: 'mesa1', estado: 'PAGADO', canal: 'SALON', createdAt: '', items: [
          { id: 'it1', productoId: 'prod1', nombre: 'Ceviche', cantidad: 1, precioUnitario: 100, subtotal: 100, area: 'COCINA', notas: '', estado: 'ENTREGADO' },
        ] }],
      } as any);

      render(<HistorialCajaScreen />);
      fireEvent.click(screen.getByText('Yurlury Quispe'));
      await waitFor(() => expect(screen.getByText('Pepe')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Imprimir comprobante/i }));

      await waitFor(() => {
        expect(abrirTicketParaImprimir).toHaveBeenCalledWith(
          expect.objectContaining({
            transaccion: expect.objectContaining({ id: 'tx1', monto: 90, descuento: 10, metodo: 'EFECTIVO', tipoComprobante: 'BOLETA' }),
            mesaNumero: '5',
            propina: 0,
            ticket: expect.objectContaining({
              id: 'tx1', subtotal: 100, descuento: 10, total: 90,
              items: [{ productoId: 'prod1', nombre: 'Ceviche', cantidad: 1, precioUnitario: 100 }],
            }),
          }),
        );
      });
    });

    it('avisa con un toast si no puede reconstruir el ticket', async () => {
      const toast = vi.fn();
      vi.mocked(useToast).mockReturnValue({ toast } as any);
      vi.mocked(cuentasApi.getById).mockRejectedValue(new Error('network'));

      render(<HistorialCajaScreen />);
      fireEvent.click(screen.getByText('Yurlury Quispe'));
      await waitFor(() => expect(screen.getByText('Pepe')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Imprimir comprobante/i }));

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'err' }));
      });
      expect(abrirTicketParaImprimir).not.toHaveBeenCalled();
    });
  });

  it('carga más turnos con fetchMore', () => {
    const fetchMore = vi.fn();
    vi.mocked(useHistorialCajaQuery).mockReturnValue(baseListMock({ nextCursor: 'cur1', fetchMore }) as any);
    render(<HistorialCajaScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Cargar más/i }));
    expect(fetchMore).toHaveBeenCalled();
  });
});
