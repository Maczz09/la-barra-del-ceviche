/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/caja/CobroMesaDrawer.tsx — Cobro de una cuenta de mesa (REAL).
// Cableado a useCuentasQuery: registrarPago. El backend registra el pago y cierra la cuenta.
// T-16: soporta pago único, división en partes iguales y división por plato
// (cada comensal paga lo que consumió). Cada "parte" es una llamada a
// registrarPago independiente; el backend acumula pagos parciales y solo
// cierra la cuenta cuando el saldo pendiente llega a 0.

import { Scrim } from '../../components/ui/Scrim';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons, type IconName } from '../../components/ui/icons';
import { fmt } from '../../utils/format';
import { useCuentasQuery } from '../../hooks/queries/useCuentasQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { BoletaInterna } from './BoletaInterna';
import type { MetodoPago, CuentaVM, TicketDto, TransaccionDto, TipoComprobante } from '../../types/cuenta.types';
import type { PedidoItemVM } from '../../types/pedido.types';

const METODOS: { value: MetodoPago; label: string; ic: IconName; color: string }[] = [
  { value: 'EFECTIVO', label: 'Efectivo', ic: 'Cash', color: 'var(--ok)' },
  { value: 'TARJETA', label: 'Tarjeta', ic: 'Card', color: 'var(--info)' },
  { value: 'YAPE', label: 'Yape', ic: 'Wallet', color: '#6c2bd9' },
  { value: 'PLIN', label: 'Plin', ic: 'Wallet', color: '#0aa3c2' },
  { value: 'TRANSFERENCIA', label: 'Transferencia', ic: 'Coins', color: 'var(--text-2)' },
];

type ModoDivision = 'UNICO' | 'PARTES' | 'ITEMS';

interface Parte {
  label: string;
  monto: number;
  tip: number;
  comensal?: number;
}

interface Props {
  mesaId: string;
  mesaNumero?: string;
  mesaUnidaCon?: string;
  onClose: () => void;
  onPaid?: () => void;
}

export function CobroMesaDrawer({ mesaId, mesaNumero, mesaUnidaCon, onClose, onPaid }: Readonly<Props>) {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const { sede } = useSedeActualQuery();
  const {
    cuentaActiva, loading, error, success, queryError,
    registrarPago, clearFeedback, refetchCuenta,
  } = useCuentasQuery(mesaId);
  const modalRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(modalRef, { active: true, onClose });

  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [recibido, setRecibido] = useState('');
  const [descuento, setDescuento] = useState('0');
  const [propina, setPropina] = useState('0');
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>('BOLETA');
  const [clienteDocumento, setClienteDocumento] = useState('');
  const [recibo, setRecibo] = useState<{ ticket: TicketDto; transaccion: TransaccionDto } | null>(null);

  const [modoDivision, setModoDivision] = useState<ModoDivision>('UNICO');
  const [numPartes, setNumPartes] = useState(2);
  const [numComensales, setNumComensales] = useState(2);
  const [comensalPorItem, setComensalPorItem] = useState<Record<string, number>>({});
  const [parteIndex, setParteIndex] = useState(0);
  const [partesPagadas, setPartesPagadas] = useState<Parte[]>([]);

  const subtotal = cuentaActiva?.total ?? 0;
  const desc = Number(descuento) || 0;
  const tip = Number(propina) || 0;
  const totalBase = Math.max(0, subtotal - desc);
  const totalCobro = totalBase + tip;
  const igv = totalBase - totalBase / 1.18;

  const items = useMemo(() => cuentaActiva?.pedidos.flatMap((p) => p.items) ?? [], [cuentaActiva]);

  // Configuración de división bloqueada una vez que la primera parte ya se cobró:
  // cambiar el modo/las asignaciones a mitad de camino descuadraría lo ya pagado.
  const divisionBloqueada = parteIndex > 0;

  useEffect(() => {
    setModoDivision('UNICO');
    setParteIndex(0);
    setPartesPagadas([]);
    setComensalPorItem({});
    setNumPartes(2);
    setNumComensales(2);
    setTipoComprobante('BOLETA');
    setClienteDocumento('');
  }, [cuentaActiva?.id]);

  const partes = useMemo<Parte[]>(() => {
    if (modoDivision === 'PARTES') {
      const n = Math.max(2, numPartes);
      const per = Math.floor((totalBase / n) * 100) / 100;
      const tipPer = Math.floor((tip / n) * 100) / 100;
      return Array.from({ length: n }, (_, i) => {
        const esUltimo = i === n - 1;
        return {
          label: `Parte ${i + 1} de ${n}`,
          monto: esUltimo ? Math.round((totalBase - per * (n - 1)) * 100) / 100 : per,
          tip: esUltimo ? Math.round((tip - tipPer * (n - 1)) * 100) / 100 : tipPer,
        };
      });
    }
    if (modoDivision === 'ITEMS') {
      const grupos = new Map<number, number>();
      for (const it of items) {
        const c = comensalPorItem[it.id] ?? 1;
        grupos.set(c, (grupos.get(c) ?? 0) + it.subtotal);
      }
      const comensales = Array.from(grupos.keys()).sort((a, b) => a - b);
      if (comensales.length === 0) return [{ label: 'Total', monto: totalBase, tip }];
      const factor = subtotal > 0 ? totalBase / subtotal : 0;
      const tipFactor = subtotal > 0 ? tip / subtotal : 0;
      let sumaMonto = 0;
      let sumaTip = 0;
      return comensales.map((c, idx) => {
        const subC = grupos.get(c) ?? 0;
        const esUltimo = idx === comensales.length - 1;
        const monto = esUltimo ? Math.round((totalBase - sumaMonto) * 100) / 100 : Math.round(subC * factor * 100) / 100;
        const tipC = esUltimo ? Math.round((tip - sumaTip) * 100) / 100 : Math.round(subC * tipFactor * 100) / 100;
        if (!esUltimo) { sumaMonto += monto; sumaTip += tipC; }
        return { label: `Comensal ${c}`, monto, tip: tipC, comensal: c };
      });
    }
    return [{ label: 'Total', monto: totalBase, tip }];
  }, [modoDivision, numPartes, comensalPorItem, items, totalBase, tip, subtotal]);

  const parteActual = partes[Math.min(parteIndex, partes.length - 1)] ?? { label: 'Total', monto: totalBase, tip };
  const esUltimaParte = modoDivision === 'UNICO' || parteIndex >= partes.length - 1;
  const montoAPagar = modoDivision === 'UNICO' ? totalBase : parteActual.monto;
  const tipAPagar = modoDivision === 'UNICO' ? tip : parteActual.tip;
  const totalConTip = montoAPagar + tipAPagar;
  const pendienteRestante = useMemo(
    () => partes.slice(parteIndex).reduce((acc, p) => acc + p.monto + p.tip, 0),
    [partes, parteIndex],
  );

  const recNum = Number(recibido || 0);
  const vuelto = metodo === 'EFECTIVO' ? Math.max(0, recNum - totalConTip) : 0;
  const faltaPago = metodo === 'EFECTIVO' && recNum < totalConTip;

  useEffect(() => {
    if (cuentaActiva) setRecibido(totalConTip > 0 ? totalConTip.toFixed(2) : '');
    // Solo se re-propone el monto sugerido al cambiar de cuenta, de modo o de
    // parte — no en cada tecla que el cajero escribe.
  }, [cuentaActiva?.id, parteIndex, modoDivision, numPartes]);

  const appendDigit = (r: string, d: string): string => {
    if (d === 'C') return '';
    if (d === '.') return r.includes('.') ? r : (r || '0') + '.';
    return r + d;
  };
  const key = (d: string) => setRecibido((r) => appendDigit(r, d));

  const handlePagar = async () => {
    if (!cuentaActiva || !online) return;
    try {
      const respuesta = await registrarPago({
        cuentaId: cuentaActiva.id,
        montoRecibido: montoAPagar,
        metodo,
        descuento: desc,
        propina: tipAPagar,
        mesaNumero,
        mesaUnidaCon,
        tipoComprobante,
        clienteDocumento: clienteDocumento.trim() || undefined,
      });
      if (esUltimaParte) {
        onPaid?.();
        if (respuesta?.ticket) {
          setRecibo({ ticket: respuesta.ticket, transaccion: respuesta.transaccion });
        } else {
          onClose();
        }
      } else {
        setPartesPagadas((prev) => [...prev, { ...parteActual, comensal: parteActual.comensal }]);
        toast({
          title: `${parteActual.label} cobrada`,
          msg: `Pendiente por cobrar: ${fmt(respuesta?.pendiente ?? (pendienteRestante - totalConTip))}`,
          icon: 'Check',
          kind: 'ok',
        });
        setParteIndex((i) => i + 1);
        setRecibido('');
      }
    } catch (err) {
      toast({ title: 'No se pudo registrar el pago', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog
        open
        className="modal xwide"
        ref={modalRef}
        aria-modal="true"
        aria-label="Cobrar cuenta"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Cobrar cuenta</h3>
          <span className="tag-canal salon" style={{ marginLeft: 4 }}>Mesa {mesaNumero ?? cuentaActiva?.mesaId ?? ''}</span>
          {cuentaActiva && <span className="muted" style={{ fontSize: 13 }}>· {cuentaActiva.cantidadItems} ítems</span>}
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar cobro de cuenta"><Icons.Close s={17} /></button>
        </div>

        {(error || success) && (
          <div className={`banner ${error ? 'err' : 'ok'}`} style={{ margin: '12px 20px 0' }} role="alert" aria-live={error ? 'assertive' : 'polite'}>
            {error ? <Icons.Alert s={16} /> : <Icons.Check s={16} />}
            <span>{error ?? success}</span>
            <span className="spacer" />
            {/* T-04: "Reintentar" solo aplica cuando falló la carga de la cuenta
                (GET) — si lo que falló fue pagar/abrir/cerrar, un refetch de la
                cuenta no reintenta esa acción, solo confunde. */}
            {error && queryError && (
              <button className="btn btn-sm btn-ghost" onClick={() => void refetchCuenta()} aria-label="Reintentar carga de la cuenta">Reintentar</button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={clearFeedback} aria-label="Cerrar notificación">Cerrar</button>
          </div>
        )}

        <div className="modal-scroll">
          {recibo ? (
            <BoletaInterna
              ticket={recibo.ticket}
              transaccion={recibo.transaccion}
              mesaNumero={mesaNumero}
              propina={tip}
              sede={sede}
              onImprimir={() => globalThis.print()}
              onCerrar={onClose}
            />
          ) : (
            <CobroBody
              loading={loading}
              online={online}
              cuentaActiva={cuentaActiva}
              items={items}
              subtotal={subtotal}
              descuento={descuento}
              setDescuento={setDescuento}
              propina={propina}
              setPropina={setPropina}
              totalCobro={totalCobro}
              igv={igv}
              metodo={metodo}
              setMetodo={setMetodo}
              tipoComprobante={tipoComprobante}
              setTipoComprobante={setTipoComprobante}
              clienteDocumento={clienteDocumento}
              setClienteDocumento={setClienteDocumento}
              recibido={recibido}
              setRecibido={setRecibido}
              vuelto={vuelto}
              faltaPago={faltaPago}
              onClose={onClose}
              onKey={key}
              onPagar={handlePagar}
              modoDivision={modoDivision}
              setModoDivision={setModoDivision}
              numPartes={numPartes}
              setNumPartes={setNumPartes}
              numComensales={numComensales}
              setNumComensales={setNumComensales}
              comensalPorItem={comensalPorItem}
              setComensalPorItem={setComensalPorItem}
              divisionBloqueada={divisionBloqueada}
              partes={partes}
              parteActual={parteActual}
              partesPagadas={partesPagadas}
              montoAPagar={montoAPagar}
              tipAPagar={tipAPagar}
              totalConTip={totalConTip}
              esUltimaParte={esUltimaParte}
            />
          )}
        </div>
      </dialog>
    </div>
  );
}

interface CobroBodyProps {
  loading: boolean;
  online: boolean;
  cuentaActiva: CuentaVM | null | undefined;
  items: PedidoItemVM[];
  subtotal: number;
  descuento: string;
  setDescuento: (v: string) => void;
  propina: string;
  setPropina: (v: string) => void;
  totalCobro: number;
  igv: number;
  metodo: MetodoPago;
  setMetodo: (m: MetodoPago) => void;
  tipoComprobante: TipoComprobante;
  setTipoComprobante: (t: TipoComprobante) => void;
  clienteDocumento: string;
  setClienteDocumento: (v: string) => void;
  recibido: string;
  setRecibido: (v: string) => void;
  vuelto: number;
  faltaPago: boolean;
  onClose: () => void;
  onKey: (d: string) => void;
  onPagar: () => void;
  modoDivision: ModoDivision;
  setModoDivision: (m: ModoDivision) => void;
  numPartes: number;
  setNumPartes: (n: number) => void;
  numComensales: number;
  setNumComensales: (n: number) => void;
  comensalPorItem: Record<string, number>;
  setComensalPorItem: (fn: (prev: Record<string, number>) => Record<string, number>) => void;
  divisionBloqueada: boolean;
  partes: Parte[];
  parteActual: Parte;
  partesPagadas: Parte[];
  montoAPagar: number;
  tipAPagar: number;
  totalConTip: number;
  esUltimaParte: boolean;
}

function CobroBody({
  loading, online, cuentaActiva, items,
  subtotal, descuento, setDescuento, propina, setPropina,
  totalCobro, igv, metodo, setMetodo,
  tipoComprobante, setTipoComprobante, clienteDocumento, setClienteDocumento,
  recibido, setRecibido, vuelto, faltaPago,
  onClose, onKey, onPagar,
  modoDivision, setModoDivision, numPartes, setNumPartes,
  numComensales, setNumComensales, comensalPorItem, setComensalPorItem,
  divisionBloqueada, partes, parteActual, partesPagadas,
  montoAPagar, tipAPagar, totalConTip, esUltimaParte,
}: Readonly<CobroBodyProps>) {
  if (loading && !cuentaActiva) {
    return <div style={{ padding: 40, textAlign: 'center' }} className="muted">Cargando cuenta…</div>;
  }
  if (!cuentaActiva) {
    return (
      <div className="empty" style={{ padding: 36 }}>
        <div className="e-ic"><Icons.Wallet s={26} /></div>
        <h3>Sin cuenta abierta</h3>
        <p>Esta mesa no tiene una cuenta activa.</p>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    );
  }
  const puedeDividir = items.length > 0 && subtotal > 0;
  return (
    <div className="two-up" style={{ padding: 20, gap: 22 }}>
      <div>
        <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Detalle de la cuenta</div>
        <div className="panel cobro-items-list" style={{ padding: '4px 14px' }}>
          {items.length === 0 ? (
            <div className="muted" style={{ padding: 12, fontSize: 13 }}>La cuenta no tiene ítems.</div>
          ) : items.map((it) => (
            <div key={it.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="dish-line" style={{ padding: 0, border: 'none' }}>
                <span className="dish-q">{it.cantidad}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{it.nombre}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{fmt(it.subtotal)}</span>
              </div>
              {modoDivision === 'ITEMS' && (
                <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 4, paddingLeft: 2 }}>
                  {Array.from({ length: numComensales }, (_, i) => i + 1).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`chip ${(comensalPorItem[it.id] ?? 1) === c ? 'on' : ''}`}
                      style={{ padding: '3px 9px', fontSize: 12 }}
                      disabled={divisionBloqueada}
                      onClick={() => setComensalPorItem((prev) => ({ ...prev, [it.id]: c }))}
                    >
                      C{c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 4px 0' }}>
          <div className="kv"><span className="k">Subtotal</span><span className="v mono">{fmt(subtotal)}</span></div>
          <div className="kv"><span className="k">Descuento</span>
            <span className="v"><span className="input" style={{ padding: '4px 8px', width: 110 }}><span className="muted">S/</span><input value={descuento} onChange={(e) => setDescuento(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" style={{ textAlign: 'right' }} /></span></span>
          </div>
          <div className="kv"><span className="k">Propina</span>
            <span className="v"><span className="input" style={{ padding: '4px 8px', width: 110 }}><span className="muted">S/</span><input value={propina} onChange={(e) => setPropina(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" style={{ textAlign: 'right' }} /></span></span>
          </div>
          <div className="kv" style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 12 }}>
            <span className="k" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Total</span>
            <span className="v mono" style={{ fontSize: 22, fontWeight: 800 }}>{fmt(totalCobro)}</span>
          </div>
          <div className="hint" style={{ textAlign: 'right', marginTop: 4 }}>Incluye IGV (18%): {fmt(igv)}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        {puedeDividir && (
          <div>
            <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Cómo se divide la cuenta</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {([
                { v: 'UNICO', l: 'Pago único' },
                { v: 'PARTES', l: 'Partes iguales' },
                { v: 'ITEMS', l: 'Por plato' },
              ] as { v: ModoDivision; l: string }[]).map((m) => (
                <button
                  key={m.v}
                  type="button"
                  className={`chip ${modoDivision === m.v ? 'on' : ''}`}
                  disabled={divisionBloqueada}
                  onClick={() => setModoDivision(m.v)}
                >
                  {m.l}
                </button>
              ))}
            </div>
            {modoDivision === 'PARTES' && (
              <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span className="hint">Número de partes</span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={divisionBloqueada || numPartes <= 2} onClick={() => setNumPartes(Math.max(2, numPartes - 1))}>−</button>
                <span className="mono" style={{ fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{numPartes}</span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={divisionBloqueada || numPartes >= 8} onClick={() => setNumPartes(Math.min(8, numPartes + 1))}>+</button>
              </div>
            )}
            {modoDivision === 'ITEMS' && (
              <div style={{ marginTop: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="hint">Comensales</span>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={divisionBloqueada || numComensales <= 2} onClick={() => setNumComensales(Math.max(2, numComensales - 1))}>−</button>
                  <span className="mono" style={{ fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{numComensales}</span>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={divisionBloqueada || numComensales >= 8} onClick={() => setNumComensales(Math.min(8, numComensales + 1))}>+</button>
                </div>
                <div className="hint" style={{ marginTop: 4 }}>Asigna cada plato a un comensal en la lista de la izquierda.</div>
              </div>
            )}
            {modoDivision !== 'UNICO' && (
              <div className="cuadre" style={{ marginTop: 10, padding: '10px 12px' }}>
                <div className="lbl">{parteActual.label} {partesPagadas.length > 0 && `(${partesPagadas.length}/${partes.length} cobradas)`}</div>
                <div className="big" style={{ fontSize: 20 }}>{fmt(montoAPagar + tipAPagar)}</div>
                {tipAPagar > 0 && <div className="hint">Incluye propina: {fmt(tipAPagar)}</div>}
              </div>
            )}
          </div>
        )}
        <div>
          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Comprobante</div>
          <div className="row" style={{ gap: 6 }}>
            {([
              { v: 'BOLETA', l: 'Boleta' },
              { v: 'FACTURA', l: 'Factura' },
            ] as { v: TipoComprobante; l: string }[]).map((c) => (
              <button
                key={c.v}
                type="button"
                className={`chip ${tipoComprobante === c.v ? 'on' : ''}`}
                onClick={() => setTipoComprobante(c.v)}
              >
                {c.l}
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="cobro-doc-cliente">{tipoComprobante === 'FACTURA' ? 'RUC del cliente' : 'DNI del cliente'}</label>
            <div className="input">
              <input
                id="cobro-doc-cliente"
                value={clienteDocumento}
                onChange={(e) => setClienteDocumento(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                maxLength={tipoComprobante === 'FACTURA' ? 11 : 8}
                placeholder="Opcional"
              />
            </div>
          </div>
        </div>
        <div>
          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Método de pago</div>
          <div className="method-grid">
            {METODOS.map((m) => {
              const Ic = Icons[m.ic];
              return (
                <button key={m.value} className={`method-opt ${metodo === m.value ? 'on' : ''}`} onClick={() => setMetodo(m.value)}>
                  <span className="m-ic" style={{ background: m.color }}><Ic s={16} /></span>{m.label}
                </button>
              );
            })}
          </div>
        </div>
        {metodo === 'EFECTIVO' && (
          <div className="cobro-keypad-layout" style={{ gap: 14 }}>
            <div>
              <div className="field" style={{ marginBottom: 8 }}><label htmlFor="cobro-recibido">Recibido</label><div className="input"><span className="muted">S/</span><input id="cobro-recibido" value={recibido} onChange={(e) => setRecibido(e.target.value.replace(/[^\d.]/g, ''))} inputMode="none" style={{ fontSize: 18, fontWeight: 800 }} /></div></div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {['exacto', 50, 100, 200].map((c) => <button key={c} className="chip" onClick={() => setRecibido(c === 'exacto' ? totalConTip.toFixed(2) : String(c))}>{c === 'exacto' ? 'Exacto' : 'S/ ' + c}</button>)}
              </div>
              <div className="cuadre ok" style={{ marginTop: 12, padding: '12px 14px' }} aria-live="polite" aria-label={`Vuelto: ${vuelto > 0 ? 'S/ ' + vuelto.toFixed(2) : 'Sin vuelto'}`}>
                <div className="lbl">Vuelto</div><div className="big" style={{ fontSize: 26 }}>{fmt(vuelto)}</div>
              </div>
            </div>
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => onKey(d)}>{d}</button>)}
              <button onClick={() => onKey('.')}>.</button>
              <button onClick={() => onKey('0')}>0</button>
              <button onClick={() => onKey('C')}>C</button>
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {!online && (
            <div className="banner warn" role="alert">
              <Icons.Alert s={16} />
              <span>Sin conexión. Reconecta para registrar el pago.</span>
            </div>
          )}
          {faltaPago && online && (
            <div className="banner warn" role="status" aria-live="polite">
              <Icons.Alert s={16} />
              <span>El monto recibido es menor al total. Ingresa al menos <b className="mono">S/ {(totalConTip - Number(recibido || 0)).toFixed(2)}</b> más.</span>
            </div>
          )}
          <button
            className="btn btn-primary btn-block"
            disabled={!cuentaActiva || loading || !online || faltaPago}
            onClick={onPagar}
            aria-describedby="cobro-pago-hint"
          >
            {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Card s={16} />}
            {' '}{esUltimaParte ? 'Registrar pago y cerrar cuenta' : `Cobrar ${parteActual.label.toLowerCase()}`}
          </button>
          {(faltaPago || !online) && (
            <span id="cobro-pago-hint" className="hint" style={{ textAlign: 'center' }}>
              {online ? 'Completa el monto recibido para continuar.' : 'Requiere conexión a internet.'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
