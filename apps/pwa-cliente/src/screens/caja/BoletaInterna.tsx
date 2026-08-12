// screens/caja/BoletaInterna.tsx — Boleta de venta interna, imprimible (80mm).
// NO es el comprobante electrónico SUNAT (eso lo emite servicio-facturacion,
// aparte, a mano por caja/admin — ver CONTEXTO.md). Esto es el recibo que se
// entrega al cliente al momento del cobro, con desglose de IGV.

import { Icons } from '../../components/ui/icons';
import { fmt } from '../../utils/format';
import { APP_NAME } from '../../config';
import type { TicketDto, TransaccionDto } from '../../types/cuenta.types';
import type { SedeDto } from '../../types/sede.types';

const Row = ({ l, v, bold }: Readonly<{ l: string; v: string; bold?: boolean }>) => (
  <div className={`zrow ${bold ? 'bold' : ''}`}><span>{l}</span><span>{v}</span></div>
);

interface Props {
  ticket: TicketDto;
  transaccion: TransaccionDto;
  mesaNumero?: string;
  propina: number;
  sede?: SedeDto | null;
  onImprimir: () => void;
  onCerrar: () => void;
}

export function BoletaInterna({ ticket, transaccion, mesaNumero, propina, sede, onImprimir, onCerrar }: Readonly<Props>) {
  const totalConPropina = ticket.total + propina;
  const igv = ticket.total - ticket.total / 1.18;
  const fecha = new Date(ticket.fecha);
  const esFactura = transaccion.tipoComprobante === 'FACTURA';

  return (
    <div style={{ padding: 20 }}>
      <div className="print-area">
        <div className="zticket">
          <div className="zc">
            <h4>{(sede?.nombre ?? APP_NAME).toUpperCase()}</h4>
            {sede?.direccion && <div style={{ fontSize: 11 }}>{sede.direccion}</div>}
            {sede?.ruc && <div style={{ fontSize: 11 }}>RUC {sede.ruc}</div>}
          </div>
          <hr className="zhr" />
          <div className="zc">
            <div className="zlbl">{esFactura ? 'Factura de venta' : 'Boleta de venta'}</div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Mesa {mesaNumero ?? ticket.mesaId}</div>
          </div>
          <Row l="Ticket" v={ticket.id.slice(0, 8)} />
          <Row l="Fecha" v={fecha.toLocaleDateString('es-PE')} />
          <Row l="Hora" v={fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} />
          {transaccion.cajeroNombre && <Row l="Cajero" v={transaccion.cajeroNombre} />}
          {transaccion.clienteDocumento && <Row l={esFactura ? 'RUC cliente' : 'DNI cliente'} v={transaccion.clienteDocumento} />}
          <hr className="zhr" />
          <div className="zlbl" style={{ marginBottom: 4 }}>Ítems</div>
          {ticket.items.map((it, i) => (
            <Row key={`${it.productoId ?? it.nombre}-${i}`} l={`${it.cantidad}x ${it.nombre}`} v={fmt(it.cantidad * it.precioUnitario)} />
          ))}
          <hr className="zhr" />
          <Row l="Subtotal" v={fmt(ticket.subtotal)} />
          {ticket.descuento > 0 && <Row l="Descuento" v={`-${fmt(ticket.descuento)}`} />}
          {propina > 0 && <Row l="Propina" v={fmt(propina)} />}
          <Row l="IGV (18%, incluido)" v={fmt(igv)} />
          <Row l="Total" v={fmt(totalConPropina)} bold />
          <hr className="zhr" />
          <Row l="Método de pago" v={transaccion.metodo} />
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCerrar}>Listo</button>
        <button className="btn btn-primary" onClick={onImprimir}><Icons.Print s={16} /> Imprimir boleta</button>
      </div>
    </div>
  );
}
