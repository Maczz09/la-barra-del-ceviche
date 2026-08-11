/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/caja/CajaScreen.tsx — Caja: dashboard de turno + cobro de mesa + cierre operativo.

import { Scrim } from '../../components/ui/Scrim';
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icons } from '../../components/ui/icons';
import { MiniStat } from '../../components/ui/Stat';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuthStore } from '../../store/auth.store';
import { useMesasQuery } from '../../hooks/queries/useMesasQuery';
import { useCajaQuery } from '../../hooks/queries/useCajaQuery';
import { fmt, horaOf } from '../../utils/format';
import { METODO_META, METODOS_ORDEN, computeKpis } from './cajaMeta';
import { MovimientoModal } from './MovimientoModal';
import { CierreDrawer } from './CierreDrawer';
import { CobroMesaDrawer } from './CobroMesaDrawer';
import { AperturaCajaModal } from './AperturaCajaModal';
import { TransaccionDetalleDrawer } from './TransaccionDetalleDrawer';
import type { MovimientoCajaDto } from '../../types/caja.types';
import type { MesaVM } from '../../types/mesa.types';

type Modal = null | 'apertura' | 'cierre' | 'egreso' | 'ingreso';

interface MesaCobropickerProps {
  mesas: MesaVM[];
  onSelect: (mesaId: string, mesaNumero?: string) => void;
  onClose: () => void;
}

function MesaCobroPicker({ mesas, onSelect, onClose }: Readonly<MesaCobropickerProps>) {
  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <div className="modal" style={{ width: 'min(460px, 100%)', position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 17 }}>Cobrar cuenta · elegir mesa</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 9, maxHeight: '60vh', overflowY: 'auto' }}>
          {mesas.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: 8 }}>No hay mesas ocupadas con cuenta para cobrar.</div>
          ) : mesas.map((m) => (
            <button key={m.id} className="rep-opt" onClick={() => onSelect(m.id, m.numero)}>
              <span className="prov-ava" style={{ width: 38, height: 38, fontSize: 13 }}>{m.numero}</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <b style={{ fontSize: 14 }}>Mesa {m.numero}</b>
                <div className="muted" style={{ fontSize: 12 }}>{m.ubicacion} · {m.capacidad} pers</div>
              </div>
              <Icons.ArrowDown s={14} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CobroState { mesaId: string; mesaNumero?: string }

export function CajaScreen() {
  const { toast } = useToast();
  const cajero = useAuthStore((s) => s.user);
  const { mesas } = useMesasQuery();
  const { resumen, turno, loading, error, abrirTurno, crearMovimiento, cerrarTurno } = useCajaQuery();
  const [searchParams, setSearchParams] = useSearchParams();

  const [modal, setModal] = useState<Modal>(null);
  const [cobro, setCobro] = useState<CobroState | null>(null);
  const [cobroPicker, setCobroPicker] = useState(false);
  const [detalleTx, setDetalleTx] = useState<{ transaccionId: string; cuentaId: string | null } | null>(null);

  const movs = resumen?.movimientos ?? [];
  const k = useMemo(() => computeKpis(movs, resumen?.efectivoEsperado ?? 0), [movs, resumen?.efectivoEsperado]);
  const cajeroNombre = cajero?.nombre ?? 'Cajero';

  // Mesas ocupadas (para cobrar)
  const ocupadas = useMemo(() => mesas.filter((m) => m.numeroRaw < 90 && m.estado === 'OCUPADA'), [mesas]);

  // ?mesaId en la URL (desde Mesas → "Cobrar")
  useEffect(() => {
    const mid = searchParams.get('mesaId');
    if (mid && !cobro) {
      const mesa = mesas.find((m) => m.id === mid);
      setCobro({ mesaId: mid, mesaNumero: mesa?.numero });
    }
  }, [searchParams, mesas]);

  // Mesas hermanas si la mesa que se está cobrando está unida a otra(s), para
  // dejar constancia en la auditoría de caja (ver Transaccion.mesaUnidaCon).
  const mesaUnidaCon = useMemo(() => {
    const mesaCobro = cobro ? mesas.find((m) => m.id === cobro.mesaId) : null;
    if (!mesaCobro?.grupoId) return undefined;
    const hermanas = mesas.filter((m) => m.grupoId === mesaCobro.grupoId && m.id !== mesaCobro.id);
    return hermanas.length > 0 ? hermanas.map((h) => h.numero).join(', ') : undefined;
  }, [mesas, cobro]);

  const closeCobro = () => {
    setCobro(null);
    if (searchParams.get('mesaId')) {
      searchParams.delete('mesaId');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const abrirCaja = async (fondoInicial: number) => {
    try {
      await abrirTurno({ fondoInicial, cajeroNombre });
      setModal(null);
      toast({ title: 'Caja abierta', msg: `Fondo inicial ${fmt(fondoInicial)}`, icon: 'Cash', kind: 'ok' });
    } catch (err) {
      toast({ title: 'No se pudo abrir la caja', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Caja</h1>
          <div className="sub">Turno, cobros y cierre Z</div>
        </div>
        <span className="spacer" />
        {!turno && <button className="btn btn-primary" disabled={loading} onClick={() => setModal('apertura')}><Icons.Cash s={16} /> Abrir caja</button>}
        <button className="btn btn-soft" disabled={!turno || loading} onClick={() => setModal('cierre')}><Icons.Lock s={16} /> Cerrar caja</button>
        <button className="btn btn-primary" disabled={!turno || loading} onClick={() => setCobroPicker(true)}><Icons.Plus s={16} /> Cobrar cuenta</button>
      </div>

      {error && (
        <div className="banner err" style={{ marginBottom: 14 }}>
          <Icons.Alert s={16} /><span>{error}</span>
        </div>
      )}

      {!turno && !loading && (
        <section className="panel" style={{ padding: 24, marginBottom: 16 }}>
          <div className="empty" style={{ padding: 18 }}>
            <div className="e-ic"><Icons.Cash s={26} /></div>
            <h3>Abre un turno de caja</h3>
            <p>Los cobros, ingresos, egresos y el arqueo se registran contra el turno activo.</p>
            <button className="btn btn-primary" onClick={() => setModal('apertura')}><Icons.Cash s={16} /> Abrir caja</button>
          </div>
        </section>
      )}

      {/* Estado del turno */}
      <div className="turno-bar">
        <div className="turno-state"><span className="pip" /> {turno ? 'Caja abierta' : 'Sin turno abierto'}</div>
        <div style={{ width: 1, height: 26, background: 'var(--border)' }} />
        <div className="turno-meta">
          <div className="turno-mi"><div className="k">Apertura</div><div className="v">{turno ? `${horaOf(turno.abiertoAt)} · ${fmt(turno.fondoInicial)}` : 'Pendiente'}</div></div>
          <div className="turno-mi"><div className="k">Cajero</div><div className="v">{cajeroNombre}</div></div>
          <div className="turno-mi"><div className="k">Cuentas cobradas</div><div className="v">{k.comprobantes}</div></div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <MiniStat icon="Trend" color="var(--accent)" soft="var(--accent-soft)" k="Ventas del turno" v={fmt(k.totalVentas)} d={`${k.ventas.length} cuentas cerradas`} />
        <MiniStat icon="Cash" color="var(--ok)" soft="var(--ok-soft)" k="Efectivo esperado en caja" v={fmt(k.efectivoEsperado)} d="Fondo, ventas, propinas y movimientos en efectivo" />
        <MiniStat icon="Coins" color="var(--warn)" soft="var(--warn-soft)" k="Propinas acumuladas" v={fmt(k.propinas)} d="Pendiente de repartir" />
        <MiniStat icon="Receipt" color="var(--info)" soft="var(--info-soft)" k="Tickets internos" v={k.comprobantes} d="Cuentas cobradas en el turno" />
      </div>

      <div className="module-grid">
        {/* Movimientos */}
        <section className="panel">
          <div className="panel-h">
            <h3>Movimientos del turno</h3>
            <span className="spacer" />
            <span className="pill-soft">{movs.length} registros</span>
          </div>
          <div className="mov-table-wrap table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr><th>Hora</th><th>Detalle</th><th className="col-mobile-hidden">TX</th><th className="col-mobile-hidden">Método</th><th style={{ textAlign: 'right' }}>Monto</th><th className="cell-action"></th></tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <MovRow key={m.id} m={m} onVerDetalle={m.tipo === 'VENTA' && m.transaccionId ? () => setDetalleTx({ transaccionId: m.transaccionId!, cuentaId: m.cuentaId }) : undefined} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mov-list panel">
            {movs.map((m) => {
              const verDetalle = m.tipo === 'VENTA' && m.transaccionId
                ? () => setDetalleTx({ transaccionId: m.transaccionId!, cuentaId: m.cuentaId })
                : undefined;
              return (
                <div
                  className="mov-card"
                  key={m.id}
                  role={verDetalle ? 'button' : undefined}
                  tabIndex={verDetalle ? 0 : undefined}
                  style={verDetalle ? { cursor: 'pointer' } : undefined}
                  onClick={verDetalle}
                >
                  <span className="mc-hora">{horaOf(m.createdAt)}</span>
                  <span className="mc-tipo">{m.tipo} {m.donde}</span>
                  <span className="mc-monto">{fmt(Math.abs(m.monto))}</span>
                  <div className="mc-meta">
                    <span className="badge badge-muted">{METODO_META[m.metodo]?.label ?? m.metodo}</span>
                    {verDetalle && <span className="muted" style={{ fontSize: 11 }}>Ver detalle</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Lateral */}
        <aside className="module-side caja-aside">
          {/* Desglose por método */}
          <section className="panel">
            <div className="panel-h"><h3>Ingresos por método</h3></div>
            <div className="pay-rows">
              {METODOS_ORDEN.map((key) => {
                const meta = METODO_META[key];
                const val = k.porMetodo[key];
                const pct = k.totalVentas ? (val / k.totalVentas) * 100 : 0;
                return (
                  <div className="pay-row" key={key}>
                    <span className={`pay-ic ${meta.cls}`}>{meta.abbr}</span>
                    <div className="pay-bar-wrap">
                      <div className="pay-bar-top"><b>{meta.label}</b><span className="muted">{pct.toFixed(0)}%</span></div>
                      <div className="pay-track"><div className="pay-fill" style={{ width: `${pct}%`, background: meta.color }} /></div>
                    </div>
                    <span className="pay-amt">{fmt(val)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Acciones rápidas */}
          <section className="panel">
            <div className="panel-h"><h3>Acciones</h3></div>
            <div className="qa-grid">
              <button className="qa" onClick={() => setCobroPicker(true)}>
                <span className="qa-ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><Icons.Plus s={16} /></span>
                <b>Cobrar cuenta</b><small>Boleta / Factura</small>
              </button>
              <button className="qa" onClick={() => setModal('egreso')}>
                <span className="qa-ic" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}><Icons.ArrowDown s={16} /></span>
                <b>Registrar egreso</b><small>Gastos del turno</small>
              </button>
              <button className="qa" onClick={() => setModal('ingreso')}>
                <span className="qa-ic" style={{ background: 'var(--ok-soft)', color: 'var(--ok-text)' }}><Icons.ArrowUp s={16} /></span>
                <b>Ingreso de efectivo</b><small>Vuelto / fondo</small>
              </button>
              <button className="qa" onClick={() => setModal('cierre')}>
                <span className="qa-ic" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}><Icons.Lock s={16} /></span>
                <b>Cierre interno</b><small>Arqueo del turno</small>
              </button>
            </div>
          </section>

          {/* Tickets internos */}
          <section className="panel">
            <div className="panel-h"><h3>Tickets internos</h3><span className="spacer" /><span className="badge badge-ok dot">Operativo</span></div>
            <div style={{ padding: '8px 16px 16px' }}>
              <div className="kv" style={{ borderBottom: '1px solid var(--border)' }}><span className="k">Cuentas cobradas</span><span className="v">{k.comprobantes}</span></div>
              <div className="kv" style={{ borderBottom: '1px solid var(--border)' }}><span className="k">Turno</span><span className="v">{turno?.cajaNombre ?? 'Sin turno'}</span></div>
              <div className="kv"><span className="k">Estado</span><span className="v"><span className={`badge ${turno ? 'badge-ok' : 'badge-muted'} dot`}>{turno ? 'Abierto' : 'Pendiente'}</span></span></div>
            </div>
          </section>
        </aside>
      </div>

      {/* Selector de mesa para cobrar */}
      {cobroPicker && (
        <MesaCobroPicker
          mesas={ocupadas}
          onSelect={(mesaId, mesaNumero) => { setCobro({ mesaId, mesaNumero }); setCobroPicker(false); }}
          onClose={() => setCobroPicker(false)}
        />
      )}

      {detalleTx && (
        <TransaccionDetalleDrawer
          transaccionId={detalleTx.transaccionId}
          cuentaId={detalleTx.cuentaId}
          onClose={() => setDetalleTx(null)}
        />
      )}

      {cobro && (
        <CobroMesaDrawer
          mesaId={cobro.mesaId}
          mesaNumero={cobro.mesaNumero}
          mesaUnidaCon={mesaUnidaCon}
          onClose={closeCobro}
          onPaid={() => toast({ title: 'Pago registrado correctamente.', msg: `Mesa ${cobro.mesaNumero ?? ''}`.trim(), icon: 'Receipt', kind: 'ok' })}
        />
      )}

      {modal === 'apertura' && (
        <AperturaCajaModal loading={loading} onClose={() => setModal(null)} onOpen={abrirCaja} />
      )}

      {(modal === 'egreso' || modal === 'ingreso') && (
        <MovimientoModal
          tipoInicial={modal === 'egreso' ? 'EGRESO' : 'INGRESO'}
          onClose={() => setModal(null)}
          onSave={(...args) => { void (async (mov) => {
            if (!turno) return;
            try {
              await crearMovimiento(turno.id, mov);
              setModal(null);
              const esEgreso = mov.tipo === 'EGRESO';
              toast({ title: esEgreso ? 'Egreso registrado' : 'Ingreso registrado', msg: `${mov.donde} · ${fmt(Math.abs(mov.monto))}`, icon: esEgreso ? 'ArrowDown' : 'ArrowUp', kind: esEgreso ? 'info' : 'ok' });
            } catch (err) {
              toast({ title: 'No se pudo registrar el movimiento', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
            }
          })(...args); }}
        />
      )}

      {modal === 'cierre' && turno && (
        <CierreDrawer
          k={k}
          cajeroNombre={cajeroNombre}
          onClose={() => setModal(null)}
          onDone={(...args) => { void (async (denominaciones) => {
            try {
              await cerrarTurno(turno.id, { denominaciones });
              setModal(null);
              toast({ title: 'Caja cerrada', msg: 'Turno cerrado y arqueo guardado', icon: 'Lock' });
            } catch (err) {
              toast({ title: 'No se pudo cerrar la caja', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
            }
          })(...args); }}
        />
      )}
    </div>
  );
}

function MovRow({ m, onVerDetalle }: Readonly<{ m: MovimientoCajaDto; onVerDetalle?: () => void }>) {
  const apertura = m.tipo === 'APERTURA';
  const egreso = m.tipo === 'EGRESO';
  const ingreso = m.tipo === 'INGRESO';
  const meta = METODO_META[m.metodo];
  let montoStyle: { color: string } | undefined;
  let signo: string | null = null;
  if (egreso) {
    montoStyle = { color: 'var(--danger-text)' };
    signo = '−';
  } else if (ingreso) {
    montoStyle = { color: 'var(--ok-text)' };
    signo = '+';
  }
  let badgeTipo = <span className="tag-canal salon">Cobro</span>;
  if (apertura) badgeTipo = <span className="badge badge-muted">Apertura</span>;
  else if (egreso) badgeTipo = <span className="badge badge-danger dot">Egreso</span>;
  else if (ingreso) badgeTipo = <span className="badge badge-ok dot">Ingreso</span>;
  return (
    <tr>
      <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{horaOf(m.createdAt)}</td>
      <td>
        <div className="row" style={{ gap: 8 }}>
          {badgeTipo}
          <strong>{m.donde}</strong>
          {m.motivo && <span className="muted" style={{ fontSize: 12 }}>· {m.motivo}</span>}
          {m.descuento ? <span className="muted" style={{ fontSize: 12 }}>· Desc. {fmt(m.descuento)}</span> : null}
        </div>
      </td>
      <td className="col-mobile-hidden">
        {m.transaccionId ? <span className="mono muted">{m.transaccionId.slice(0, 8)}</span> : <span className="muted">—</span>}
      </td>
      <td className="col-mobile-hidden">{apertura ? <span className="muted">—</span> : <span className="row" style={{ gap: 7 }}><span className={`pay-ic ${meta.cls}`} style={{ width: 20, height: 20, fontSize: 10 }}>{meta.abbr}</span>{meta.label}</span>}</td>
      <td className="num">
        <span className="monto" style={montoStyle}>{signo}{fmt(Math.abs(m.monto))}</span>
        {m.descuento ? <div className="muted" style={{ fontSize: 11 }}>Subtotal {fmt(Math.abs(m.monto) + m.descuento)}</div> : null}
        {m.propina ? <div className="muted" style={{ fontSize: 11 }}>+{fmt(m.propina)} prop.</div> : null}
      </td>
      <td className="cell-action">
        {onVerDetalle && (
          <button className="btn btn-sm btn-ghost" onClick={onVerDetalle} aria-label={`Ver detalle del cobro de ${m.donde}`}>
            Ver detalle
          </button>
        )}
      </td>
    </tr>
  );
}
