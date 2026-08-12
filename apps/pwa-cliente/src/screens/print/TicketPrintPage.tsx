// screens/print/TicketPrintPage.tsx — Pestaña dedicada para imprimir la
// boleta/factura en la tiquetera térmica 80mm. Ruta fuera del Shell (sin
// sidebar/header/modales): así Chrome genera el PDF térmico contando solo
// el ticket, no el layout completo de la app alrededor.
//
// No hace fetch ni requiere sesión: lee el payload que dejó
// utils/ticketPrint.ts en localStorage (de un solo uso) y lo renderiza.

import { useEffect, useState } from 'react';
import { TicketContent, type TicketContentProps } from '../../components/caja/TicketContent';
import { TICKET_PRINT_KEY } from '../../utils/ticketPrint';

export function TicketPrintPage() {
  const [payload, setPayload] = useState<TicketContentProps | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(TICKET_PRINT_KEY);
    localStorage.removeItem(TICKET_PRINT_KEY);
    if (!raw) { setError(true); return; }
    try {
      setPayload(JSON.parse(raw) as TicketContentProps);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!payload) return;
    // Pequeño margen para que el logo termine de cargar antes de imprimir.
    const timer = setTimeout(() => globalThis.print(), 300);
    const cerrar = () => globalThis.close();
    globalThis.addEventListener('afterprint', cerrar);
    return () => {
      clearTimeout(timer);
      globalThis.removeEventListener('afterprint', cerrar);
    };
  }, [payload]);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        No se encontró el comprobante a imprimir. Puedes cerrar esta pestaña.
      </div>
    );
  }
  if (!payload) return null;

  return <TicketContent {...payload} />;
}
