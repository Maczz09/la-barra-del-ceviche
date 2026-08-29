// screens/print/ComprobantePrintPage.tsx — Pestaña dedicada para imprimir el
// comprobante SUNAT (boleta/factura aceptada) en la tiquetera térmica 80mm.
// Ruta fuera del Shell (sin sidebar/header/modales): así Chrome genera el PDF
// térmico contando solo el ticket, no el layout completo de la app alrededor.
//
// No hace fetch ni requiere sesión: lee el payload que dejó
// utils/comprobantePrint.ts en localStorage (de un solo uso) y lo renderiza.

import { useEffect, useRef, useState } from 'react';
import { ComprobanteTicket, type ComprobanteTicketProps } from '../../components/facturacion/ComprobanteTicket';
import { COMPROBANTE_PRINT_KEY } from '../../utils/comprobantePrint';

export function ComprobantePrintPage() {
  const [payload, setPayload] = useState<ComprobanteTicketProps | null>(null);
  const [error, setError] = useState(false);
  // StrictMode (dev) monta el efecto dos veces; sin este guard la 2da pasada
  // encuentra la key ya borrada por la 1ra y pisa el payload con "error".
  const leido = useRef(false);

  useEffect(() => {
    if (leido.current) return;
    leido.current = true;
    const raw = localStorage.getItem(COMPROBANTE_PRINT_KEY);
    localStorage.removeItem(COMPROBANTE_PRINT_KEY);
    if (!raw) { setError(true); return; }
    try {
      setPayload(JSON.parse(raw) as ComprobanteTicketProps);
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

  return <ComprobanteTicket {...payload} />;
}
