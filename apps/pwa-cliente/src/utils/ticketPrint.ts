// utils/ticketPrint.ts — Abre la boleta/factura en una pestaña dedicada,
// sin chrome de la app, para imprimir en la tiquetera térmica 80mm
// (Xprinter XP-80C/XP-E200L). Imprimir dentro del modal de cobro salía mal
// formateado: Chrome generaba el PDF térmico contando el layout completo de
// la app (sidebar, modal, capas) alrededor del ticket, no solo el ticket.
//
// La pestaña nueva solo lee este payload de localStorage (se limpia apenas
// se lee, es de un solo uso) y renderiza el ticket puro — sin fetch, sin
// auth: todo lo que necesita ya lo tiene quien abre la pestaña.

import type { TicketContentProps } from '../components/caja/TicketContent';

export const TICKET_PRINT_KEY = 'restoapp.ticket_print_payload';
export const TICKET_PRINT_ROUTE = '/imprimir/boleta';

export function abrirTicketParaImprimir(payload: TicketContentProps): void {
  localStorage.setItem(TICKET_PRINT_KEY, JSON.stringify(payload));
  globalThis.open(TICKET_PRINT_ROUTE, '_blank');
}
