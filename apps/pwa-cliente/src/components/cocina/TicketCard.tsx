import type { CSSProperties, ReactNode } from 'react';
import { Icons, type IconName } from '../ui/icons';
import type { PedidoVM, PedidoItemVM, EstadoPedido, EstadoItem } from '../../types/pedido.types';
import { NEXT_ITEM, slaRatio as ratioOf, urgClass, CANAL_LABEL, CANAL_CLS } from '../../domain/pedido.flow';

// ─── Metric ──────────────────────────────────────────────────

interface MetricProps {
  ic: IconName;
  color?: string;
  soft?: string;
  v: ReactNode;
  k: string;
  alert?: boolean;
}

export function Metric({ ic, color, soft, v, k, alert }: Readonly<MetricProps>) {
  const Ic = Icons[ic];
  return (
    <div className={`kds-metric ${alert ? 'alert' : ''}`}>
      <span className="km-ic" style={{ background: alert ? 'transparent' : soft, color: alert ? 'var(--danger)' : color }}><Ic s={18} /></span>
      <div><div className="km-v">{v}</div><div className="km-k">{k}</div></div>
    </div>
  );
}

// ─── SlaRing ─────────────────────────────────────────────────

export function SlaRing({ el }: Readonly<{ el: number }>) {
  const r = ratioOf(el);
  const p = Math.min(100, r * 100);
  return <span className={`sla ${urgClass(r)}`} style={{ '--p': p } as CSSProperties}><b>{Math.round(el)}′</b></span>;
}

// ─── TicketCard ──────────────────────────────────────────────

export interface TicketCardProps {
  p: PedidoVM;
  items: PedidoItemVM[];
  col: { estado: EstadoPedido; label: string; color: string };
  now: number;
  online: boolean;
  onAdvance: (itemId: string, estado: EstadoItem) => void;
  onRegress: (itemId: string, estado: EstadoItem) => void;
  onBump: () => void;
}

export function TicketCard({ p, items, col, now, online, onAdvance, onRegress, onBump }: Readonly<TicketCardProps>) {
  const el = (now - new Date(p.createdAt).getTime()) / 60_000;
  const canalCls = CANAL_CLS[p.canal];
  const donde = p.canal === 'SALON' ? `Mesa ${p.mesaNumero}` : (p.cliente ?? 'Cliente');

  return (
    <div className={`kds-card ${urgClass(ratioOf(el))}`}>
      <div className="kds-head">
        {col.estado !== 'LISTO' && <SlaRing el={el} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 7 }}>
            <span className={`tag-canal ${canalCls}`}>{CANAL_LABEL[p.canal]}</span>
            <span className="tk-num">{p.id.slice(0, 6)}</span>
          </div>
          <div className="tk-where">{donde}</div>
          {p.meseroNombre && (
            <div className="tk-mesero" title={`Enviado por ${p.meseroNombre}`}>
              <Icons.Chef s={12} /> {p.meseroNombre}
            </div>
          )}
        </div>
      </div>

      <div className="kds-items" style={{ marginTop: 12 }}>
        {items.map((it) => {
          const next = NEXT_ITEM[it.estado];
          const anulado = it.estado === 'CANCELADO';
          return (
            <div key={it.id} className={`kds-item ${it.estado === 'LISTO' ? 'done' : ''}`} style={{ justifyContent: 'space-between', alignItems: 'flex-start', opacity: anulado ? 0.6 : undefined }}>
              <div style={{ display: 'flex', gap: 9, minWidth: 0 }}>
                <span className="q">{it.cantidad}×</span>
                <div style={{ minWidth: 0 }}>
                  <span className="nm" style={anulado ? { textDecoration: 'line-through' } : undefined}>{it.nombre}</span>
                  {anulado
                    ? <div className="note" style={{ color: 'var(--danger)' }}><Icons.Alert s={12} /> Anulado por mesero</div>
                    : it.notas && <div className="note"><Icons.Note s={12} /> {it.notas}</div>}
                </div>
              </div>
              {!anulado && (col.estado === 'LISTO' ? (
                <button
                  className="btn btn-ghost kds-item-btn"
                  disabled={!online}
                  onClick={(e) => { e.stopPropagation(); onRegress(it.id, it.estado); }}
                  title="Regresar"
                  aria-label={`Regresar: ${it.cantidad}× ${it.nombre}`}
                >
                  <Icons.Undo s={16} />
                </button>
              ) : (
                <button
                  className="btn btn-soft kds-item-btn"
                  disabled={!online}
                  onClick={(e) => { e.stopPropagation(); onAdvance(it.id, it.estado); }}
                  title={next === 'EN_PREPARACION' ? 'Iniciar' : 'Listo'}
                  aria-label={`${next === 'EN_PREPARACION' ? 'Iniciar' : 'Marcar listo'}: ${it.cantidad}× ${it.nombre}`}
                >
                  {next === 'EN_PREPARACION' ? <Icons.Play s={16} /> : <Icons.Check s={16} />}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {col.estado !== 'LISTO' && (
        <button
          className="btn btn-block kds-bump-btn"
          style={{ background: col.estado === 'PENDIENTE' ? 'var(--info)' : 'var(--ok)', color: '#fff', marginTop: 4 }}
          disabled={!online}
          onClick={(e) => { e.stopPropagation(); onBump(); }}
        >
          {col.estado === 'PENDIENTE'
            ? <><Icons.Play s={15} /> Iniciar todo</>
            : <><Icons.Check s={15} /> Marcar listo</>}
        </button>
      )}
    </div>
  );
}

