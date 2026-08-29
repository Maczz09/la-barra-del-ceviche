// utils/comprobantePrint.ts — Abre el comprobante SUNAT (boleta/factura ya
// aceptada) en una pestaña dedicada, sin chrome de la app, para imprimir en
// la tiquetera térmica 80mm. Mismo patrón que utils/ticketPrint.ts (el ticket
// interno de caja): imprimir dentro del modal salía mal formateado porque
// Chrome contaba el layout completo de la app alrededor.
//
// La pestaña nueva solo lee este payload de localStorage (se limpia apenas
// se lee, es de un solo uso) y renderiza el ticket puro — sin fetch, sin
// auth: todo lo que necesita ya lo tiene quien abre la pestaña.

import type { ComprobanteTicketProps } from '../components/facturacion/ComprobanteTicket';

export const COMPROBANTE_PRINT_KEY = 'restoapp.comprobante_print_payload';
export const COMPROBANTE_PRINT_ROUTE = '/imprimir/comprobante';

export function abrirComprobanteParaImprimir(payload: ComprobanteTicketProps): void {
  localStorage.setItem(COMPROBANTE_PRINT_KEY, JSON.stringify(payload));
  globalThis.open(COMPROBANTE_PRINT_ROUTE, '_blank');
}
