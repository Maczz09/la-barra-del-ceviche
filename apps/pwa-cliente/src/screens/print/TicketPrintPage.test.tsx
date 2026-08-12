// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TicketPrintPage } from './TicketPrintPage';
import { TICKET_PRINT_KEY } from '../../utils/ticketPrint';

const payload = {
  ticket: {
    id: 'ticket-1', cuentaId: 'cuenta1', mesaId: 'mesa1',
    items: [{ productoId: 'p1', nombre: 'Ceviche', cantidad: 1, precioUnitario: 35 }],
    subtotal: 35, descuento: 0, total: 35, fecha: '2026-08-08T20:15:00.000Z',
  },
  transaccion: { id: 'tx1', cuentaId: 'cuenta1', monto: 35, metodo: 'EFECTIVO', createdAt: '2026-08-08T20:15:00.000Z' },
  mesaNumero: '5',
  propina: 0,
  sede: null,
};

describe('TicketPrintPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'print').mockImplementation(() => {});
    vi.spyOn(globalThis, 'close').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lee el payload de localStorage, lo borra (uso único) y renderiza el ticket', () => {
    localStorage.setItem(TICKET_PRINT_KEY, JSON.stringify(payload));
    render(<TicketPrintPage />);

    expect(screen.getByText('Boleta de venta')).toBeInTheDocument();
    expect(screen.getByText('Mesa 5')).toBeInTheDocument();
    expect(localStorage.getItem(TICKET_PRINT_KEY)).toBeNull();
  });

  it('llama a print() poco después de montar, y cierra la pestaña cuando termina de imprimir', () => {
    localStorage.setItem(TICKET_PRINT_KEY, JSON.stringify(payload));
    render(<TicketPrintPage />);

    expect(globalThis.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(globalThis.print).toHaveBeenCalled();

    globalThis.dispatchEvent(new Event('afterprint'));
    expect(globalThis.close).toHaveBeenCalled();
  });

  it('muestra un aviso si no hay nada que imprimir (pestaña abierta directamente, sin payload)', () => {
    render(<TicketPrintPage />);
    expect(screen.getByText(/No se encontró el comprobante/i)).toBeInTheDocument();
    expect(globalThis.print).not.toHaveBeenCalled();
  });
});
