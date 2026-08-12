// screens/caja/BoletaInterna.tsx — Vista previa de la boleta de venta
// interna (80mm) dentro del modal de cobro. La impresión real ocurre en una
// pestaña dedicada (ver utils/ticketPrint.ts) — imprimir directo desde acá
// salía mal formateado en la tiquetera térmica porque Chrome contaba el
// layout completo de la app alrededor del ticket, no solo el ticket.
// NO es el comprobante electrónico SUNAT (eso lo emite servicio-facturacion,
// aparte, a mano por caja/admin — ver CONTEXTO.md).

import { Icons } from '../../components/ui/icons';
import { TicketContent } from '../../components/caja/TicketContent';
import { abrirTicketParaImprimir } from '../../utils/ticketPrint';
import type { TicketDto, TransaccionDto } from '../../types/cuenta.types';
import type { SedeDto } from '../../types/sede.types';

interface Props {
  ticket: TicketDto;
  transaccion: TransaccionDto;
  mesaNumero?: string;
  propina: number;
  sede?: SedeDto | null;
  onCerrar: () => void;
}

export function BoletaInterna({ ticket, transaccion, mesaNumero, propina, sede, onCerrar }: Readonly<Props>) {
  return (
    <div style={{ padding: 20 }}>
      <TicketContent ticket={ticket} transaccion={transaccion} mesaNumero={mesaNumero} propina={propina} sede={sede} />

      <div className="row" style={{ gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCerrar}>Listo</button>
        <button
          className="btn btn-primary"
          onClick={() => abrirTicketParaImprimir({ ticket, transaccion, mesaNumero, propina, sede })}
        >
          <Icons.Print s={16} /> Imprimir boleta
        </button>
      </div>
    </div>
  );
}
