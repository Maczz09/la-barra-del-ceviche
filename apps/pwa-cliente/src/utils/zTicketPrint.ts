// utils/zTicketPrint.ts — Abre el reporte interno de cierre de caja (Z) en
// una pestaña dedicada, sin chrome de la app, para imprimir en la tiquetera
// térmica 80mm (Xprinter XP-80C/XP-E200L). Mismo patrón que
// utils/ticketPrint.ts: llamar a window.print() directo desde dentro del
// modal de cierre (CierreDrawer) salía en blanco — Chrome generaba el PDF
// térmico contando el backdrop/dialog/pasos del modal alrededor del ticket,
// no solo el ticket.
//
// La pestaña nueva solo lee este payload de localStorage (se limpia apenas
// se lee, es de un solo uso) y renderiza el ticket puro — sin fetch, sin
// auth: todo lo que necesita ya lo tiene quien abre la pestaña.

import type { ZTicketContentProps } from '../components/caja/ZTicketContent';

export const Z_TICKET_PRINT_KEY = 'restoapp.z_ticket_print_payload';
export const Z_TICKET_PRINT_ROUTE = '/imprimir/cierre';

export function abrirZTicketParaImprimir(payload: ZTicketContentProps): void {
  localStorage.setItem(Z_TICKET_PRINT_KEY, JSON.stringify(payload));
  globalThis.open(Z_TICKET_PRINT_ROUTE, '_blank');
}
