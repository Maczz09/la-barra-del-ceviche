// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { abrirTicketParaImprimir, TICKET_PRINT_KEY, TICKET_PRINT_ROUTE } from './ticketPrint';
import type { TicketContentProps } from '../components/caja/TicketContent';

const payload: TicketContentProps = {
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

describe('abrirTicketParaImprimir', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(globalThis, 'open').mockImplementation(() => null);
  });

  it('guarda el payload en localStorage y abre la pestaña dedicada', () => {
    abrirTicketParaImprimir(payload);

    expect(JSON.parse(localStorage.getItem(TICKET_PRINT_KEY)!)).toEqual(payload);
    expect(globalThis.open).toHaveBeenCalledWith(TICKET_PRINT_ROUTE, '_blank');
  });
});
