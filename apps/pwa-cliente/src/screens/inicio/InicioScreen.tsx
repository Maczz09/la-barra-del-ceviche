/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
import { useNavigate } from 'react-router-dom';
import { Icons, type IconName } from '../../components/ui/icons';
import { HeroStat } from '../../components/ui/Stat';
import { fmt, elapsedMin } from '../../utils/format';
import { useInicioData, type ActividadItem } from '../../hooks/useInicioData';
import { TopProductosPanel } from './TopProductosPanel';

export function InicioScreen() {
  const navigate = useNavigate();
  const go = (key: string) => navigate(`/app/${key}`);
  const {
    totalVentas, cuentas, ticketProm, ventasHora,
    propinas, efectivo, turnoAbierto,
    salon, ocupPct, cocina,
    items86, stockAlerts, STOCK_BAJO,
    reservasProx, actividad, atencionCount,
  } = useInicioData();

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Inicio</h1>
          <div className="sub">Resumen del día · Operación</div>
        </div>
        <span className="spacer" />
        <div className="dash-actions">
          <button className="btn btn-ghost" onClick={() => go('cocina')}><Icons.Cocina s={16} /> Ver cocina</button>
          <button className="btn btn-primary" onClick={() => go('caja')}><Icons.Caja s={16} /> Ir a caja</button>
        </div>
      </div>

      <section className={`ops-strip ${atencionCount > 0 ? 'needs-attention' : ''}`} aria-label="Estado operativo del turno">
        <div className="ops-strip-main">
          <span className="ops-strip-ic"><Icons.Alert s={18} /></span>
          <div>
            <b>{atencionCount > 0 ? `${atencionCount} punto(s) requieren atención` : 'Operación sin alertas críticas'}</b>
            <span>{cocina.activos} pedido(s) activos · {salon.ocupadas} mesa(s) ocupadas · caja {turnoAbierto ? 'abierta' : 'sin turno'}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => go(atencionCount > 0 ? 'cocina' : 'mesas')}>
          {atencionCount > 0 ? 'Revisar ahora' : 'Ver salón'}
        </button>
      </section>

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <HeroStat icon="Trend" color="var(--accent)" soft="var(--accent-soft)" k="Ventas del día" v={fmt(totalVentas)} sub="acumulado del día">
          {ventasHora.length > 0 && <Spark data={ventasHora.map((x) => x.total)} />}
        </HeroStat>
        <HeroStat icon="Receipt" color="var(--info)" soft="var(--info-soft)" k="Ticket promedio" v={fmt(ticketProm)} sub="por cuenta cerrada" />
        <HeroStat icon="Pedidos" color="var(--purple)" soft="var(--purple-soft)" k="Cuentas del día" v={cuentas} sub={`${cocina.activos} pedido(s) en curso`} />
        <HeroStat icon="Mesas" color="var(--ok)" soft="var(--ok-soft)" k="Mesas ocupadas" v={`${salon.ocupadas}/${salon.total}`} sub={`${ocupPct}% de ocupación`} />
        <HeroStat icon="Clock" color={cocina.demora ? 'var(--danger)' : 'var(--warn)'} soft={cocina.demora ? 'var(--danger-soft)' : 'var(--warn-soft)'} k="Tiempo cocina" v={`${cocina.prom}m`} sub={cocina.demora ? `${cocina.demora} en demora` : 'sin demoras'} />
      </div>

      <div className="module-grid">
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="panel">
            <div className="panel-h"><h3>Ventas por hora</h3><span className="spacer" /><span className="pill-soft">Hoy</span></div>
            <div style={{ padding: '8px 16px 16px' }}>
              {ventasHora.length === 0 ? (
                <div className="muted" style={{ textAlign: 'center', padding: 24 }}>Sin ventas registradas hoy.</div>
              ) : (
                <div className="bars" style={{ height: 168 }}>
                  {ventasHora.map((x) => {
                    const max = Math.max(...ventasHora.map((y) => y.total)) || 1;
                    const peak = x.total === max && x.total > 0;
                    return (
                      <div key={x.hora} className="bar-col" title={`${x.hora} · ${fmt(x.total)}`}>
                        <div className="bar tall" style={{ height: `${Math.max(3, (x.total / max) * 100)}%`, background: peak ? 'var(--accent)' : 'var(--accent-soft)' }} />
                        <span className="bar-lbl">{x.hora.split(':')[0]}h</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <TopProductosPanel />

          <PanelActividad actividad={actividad} />
        </div>

        <aside className="module-side">
          <section className="panel">
            <div className="panel-h"><h3>Requiere atención</h3><span className="spacer" /><span className="badge badge-danger dot">{atencionCount}</span></div>
            <div className="att-list">
              {atencionCount === 0 && <div className="muted" style={{ padding: '10px 4px' }}>Todo en orden. Sin alertas.</div>}
              {cocina.demora > 0 && <Att ic="Clock" c="danger" t={`${cocina.demora} pedido(s) en demora`} s="SLA de cocina vencido" go={() => go('cocina')} />}
              {items86.map((n) => <Att key={n} ic="Alert" c="danger" t={`86 · ${n}`} s="Agotado en carta" go={() => go('carta')} />)}
              {stockAlerts.map((st) => <Att key={st.id} ic="Inventario" c="warn" t={`Stock bajo · ${st.nombre}`} s={`${st.stockLabel} en stock (mín. ${STOCK_BAJO})`} go={() => go('inventario')} />)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-h"><h3>Salón ahora</h3><span className="spacer" /><span className="pill-soft">{ocupPct}% ocupado</span></div>
            <div style={{ padding: '14px 16px' }}>
              <div className="occ-track">
                <div className="occ-seg" style={{ flex: salon.ocupadas || 0.0001, background: 'var(--accent)' }} />
                <div className="occ-seg" style={{ flex: salon.reservadas || 0.0001, background: 'var(--info)' }} />
                <div className="occ-seg" style={{ flex: salon.libres || 0.0001, background: 'var(--surface-3)' }} />
              </div>
              <div className="occ-legend">
                <div className="occ-li"><span className="sw" style={{ background: 'var(--accent)' }} />Ocupadas<span className="n">{salon.ocupadas}</span></div>
                <div className="occ-li"><span className="sw" style={{ background: 'var(--info)' }} />Reservadas<span className="n">{salon.reservadas}</span></div>
                <div className="occ-li"><span className="sw" style={{ background: 'var(--surface-3)' }} />Libres<span className="n">{salon.libres}</span></div>
              </div>
              <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 14 }} onClick={() => go('mesas')}>Ver mesas</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-h"><h3>Cocina ahora</h3></div>
            <div className="mini-stat">
              <span className="ms-ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><Icons.Receipt s={17} /></span>
              <div style={{ flex: 1 }}><div className="ms-v">{cocina.activos}</div><div className="ms-k">Pedidos activos</div></div>
            </div>
            <div className="mini-stat">
              <span className="ms-ic" style={{ background: cocina.demora ? 'var(--danger-soft)' : 'var(--ok-soft)', color: cocina.demora ? 'var(--danger-text)' : 'var(--ok-text)' }}><Icons.Alert s={17} /></span>
              <div style={{ flex: 1 }}><div className="ms-v">{cocina.demora}</div><div className="ms-k">En demora (SLA)</div></div>
              <button className="btn btn-soft btn-sm" onClick={() => go('cocina')}>Abrir KDS</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-h"><h3>Caja</h3><span className="spacer" /><span className={`badge ${turnoAbierto ? 'badge-ok' : 'badge-muted'} dot`}>{turnoAbierto ? 'Abierta' : 'Sin turno'}</span></div>
            <div className="mini-stat">
              <span className="ms-ic" style={{ background: 'var(--ok-soft)', color: 'var(--ok-text)' }}><Icons.Cash s={17} /></span>
              <div style={{ flex: 1 }}><div className="ms-v mono">{fmt(efectivo)}</div><div className="ms-k">Efectivo esperado</div></div>
            </div>
            <div className="mini-stat">
              <span className="ms-ic" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}><Icons.Coins s={17} /></span>
              <div style={{ flex: 1 }}><div className="ms-v mono">{fmt(propinas)}</div><div className="ms-k">Propinas del turno</div></div>
              <button className="btn btn-soft btn-sm" onClick={() => go('caja')}>Ir a caja</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-h"><h3>Próximas reservas</h3><span className="spacer" /><span className="pill-soft">hoy</span></div>
            <div>
              {reservasProx.length === 0 ? (
                <div className="muted" style={{ padding: '14px 18px' }}>Sin reservas para hoy.</div>
              ) : reservasProx.map((r) => (
                <div className="res-row" key={r.id}>
                  <span className="res-time">{r.hora}</span>
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 13.5 }}>{r.clienteNombre}</b>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{r.numComensales} pax{r.mesaPreferida ? ` · ${r.mesaPreferida}` : ''}</div>
                  </div>
                  <Icons.Reservas s={16} style={{ color: 'var(--muted)' }} />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Spark({ data }: Readonly<{ data: number[] }>) {
  if (data.length === 0) return null;
  const max = Math.max(...data) || 1;
  const w = 100;
  const h = 38;
  const denom = data.length > 1 ? data.length - 1 : 1;
  const pts = data.map((v, i) => `${(i / denom) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polygon points={area} fill="var(--accent-soft)" opacity="0.6" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface AttProps { ic: IconName; c: 'danger' | 'warn' | 'ok' | 'info'; t: string; s: string; go: () => void }
function Att({ ic, c, t, s, go }: Readonly<AttProps>) {
  const Ic = Icons[ic];
  return (
    <div className="att-row">
      <span className="att-ic" style={{ background: `var(--${c}-soft)`, color: `var(--${c}-text)` }}><Ic s={17} /></span>
      <div style={{ minWidth: 0 }}><b>{t}</b><small>{s}</small></div>
      <button className="btn btn-ghost btn-sm att-go" onClick={go}>Ver</button>
    </div>
  );
}

function PanelActividad({ actividad }: Readonly<{ actividad: ActividadItem[] }>) {
  return (
    <section className="panel">
      <div className="panel-h"><h3>Actividad reciente</h3></div>
      <div style={{ padding: '14px 18px' }}>
        {actividad.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: 12 }}>Sin actividad reciente en el turno.</div>
        ) : (
          <div className="timeline">
            {actividad.map((a, i) => {
              const Ic = Icons[a.ic] ?? Icons.Note;
              const min = elapsedMin(a.at, Date.now());
              return (
                <div className={`tl-item ${i === 0 ? 'active' : ''}`} key={a.key}>
                  <div className="row" style={{ gap: 9 }}>
                    <span style={{ color: a.c }}><Ic s={15} /></span>
                    <div style={{ flex: 1 }}>
                      <div className="tl-t">{a.t}</div>
                      <div className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{a.d}</div>
                    </div>
                    <span className="tl-time">hace {min}m</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
