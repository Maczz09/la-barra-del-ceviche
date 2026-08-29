// components/facturacion/ComprobanteTicket.tsx — Marcado puro del comprobante
// electrónico SUNAT (boleta/factura) ya ACEPTADO, formato 80mm. Reutiliza las
// mismas clases que el ticket interno de caja (zticket/zrow/zhr/print-area,
// ver styles.css) para que la tiquetera térmica (XP-80C/XP-E200L) lo imprima
// igual de bien. Lo reutilizan ComprobanteInterna (vista previa) y
// ComprobantePrintPage.tsx (la pestaña dedicada de impresión).

import { fmt } from '../../utils/format';
import type { ComprobanteDto, ItemComprobantePago } from '../../types/facturacion.types';

const Row = ({ l, v, bold }: Readonly<{ l: string; v: string; bold?: boolean }>) => (
  <div className={`zrow ${bold ? 'bold' : ''}`}><span>{l}</span><span>{v}</span></div>
);

export interface ComprobanteTicketProps {
  comprobante: ComprobanteDto;
  items: ItemComprobantePago[];
}

function datosCliente(c: ComprobanteDto): { label: string; valor: string }[] {
  if (c.tipo === 'FACTURA') {
    return [
      { label: 'RUC cliente', valor: c.clienteRuc ?? '—' },
      { label: 'Razón social', valor: c.clienteRazonSocial ?? '—' },
    ];
  }
  if (c.clienteDni) {
    return [
      { label: 'DNI cliente', valor: c.clienteDni },
      { label: 'Cliente', valor: c.clienteNombre ?? '—' },
    ];
  }
  return [{ label: 'Cliente', valor: 'Cliente varios' }];
}

export function ComprobanteTicket({ comprobante, items }: Readonly<ComprobanteTicketProps>) {
  const esFactura = comprobante.tipo === 'FACTURA';
  const fecha = new Date(comprobante.createdAt);
  const empresa = comprobante.empresa;
  const nombreEmisor = empresa.nombreComercial ?? empresa.razonSocial;

  return (
    <div className="print-area">
      <div className="zticket">
        <div className="zc">
          <img src="/logo.webp" alt="" style={{ width: 56, height: 'auto', marginBottom: 6 }} />
          <h4>{nombreEmisor.toUpperCase()}</h4>
          {empresa.nombreComercial && <div style={{ fontSize: 11 }}>{empresa.razonSocial}</div>}
          <div style={{ fontSize: 11 }}>RUC {empresa.ruc}</div>
          {empresa.direccion && <div style={{ fontSize: 11 }}>{empresa.direccion}</div>}
        </div>
        <hr className="zhr" />
        <div className="zc">
          <div className="zlbl">{esFactura ? 'Factura electrónica' : 'Boleta de venta electrónica'}</div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{comprobante.serie}-{comprobante.correlativo}</div>
        </div>
        <Row l="Fecha emisión" v={fecha.toLocaleDateString('es-PE')} />
        <Row l="Hora" v={fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} />
        {datosCliente(comprobante).map((d) => (
          <Row key={d.label} l={d.label} v={d.valor} />
        ))}
        <hr className="zhr" />
        <div className="zlbl" style={{ marginBottom: 4 }}>Ítems</div>
        {items.map((it, i) => (
          <Row key={`${it.productoId}-${i}`} l={`${it.cantidad}x ${it.nombre}`} v={fmt(it.cantidad * it.precioUnitario)} />
        ))}
        <hr className="zhr" />
        <Row l="Op. gravada" v={fmt(Number(comprobante.subtotal))} />
        <Row l="IGV (18%)" v={fmt(Number(comprobante.igv))} />
        <Row l="Total" v={fmt(Number(comprobante.total))} bold />
        <hr className="zhr" />
        <Row l="Forma de pago" v="Contado" />
        <div className="zc" style={{ marginTop: 10, fontSize: 10, color: '#8a8a93' }}>
          Representación impresa del comprobante electrónico
        </div>
      </div>
    </div>
  );
}
