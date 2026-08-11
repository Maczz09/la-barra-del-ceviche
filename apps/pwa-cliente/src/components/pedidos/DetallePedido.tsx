import { Scrim } from '../ui/Scrim';
import { useEffect } from 'react';
import { Icons } from '../ui/icons';
import { fmt, elapsedLabel } from '../../utils/format';
import { FLOW_PEDIDO } from '../../domain/pedido.flow';
import type { PedidoVM } from '../../types/pedido.types';
import { CANAL_META, nextLabelFor } from './pedidos.meta';

interface DetallePedidoProps {
  pedido: PedidoVM;
  onClose: () => void;
  onAvanzar: (p: PedidoVM) => void;
  onAnularItem: (itemId: string) => void;
  actionLoading: string | null;
  online: boolean;
  now: number;
}

/** No tiene sentido anular un ítem ya entregado o ya anulado. */
const NO_ANULABLE = new Set(['ENTREGADO', 'CANCELADO', 'RECHAZADO_SIN_STOCK']);

function flowStepCls(i: number, curIdx: number): string {
  if (i < curIdx) return 'done';
  if (i === curIdx) return 'on';
  return '';
}

export function DetallePedido({ pedido: p, onClose, onAvanzar, onAnularItem, actionLoading, online, now }: Readonly<DetallePedidoProps>) {
  const meta = CANAL_META[p.canal];
  const Ic = Icons[meta.ic];
  const nextLabel = nextLabelFor(p);
  const curIdx = FLOW_PEDIDO.findIndex((f) => f.estado === p.estado);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="drawer" aria-modal="true" aria-label={`Detalle del pedido ${p.id.slice(0, 8)}`}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <span className={`tag-canal ${meta.cls}`}><Ic s={12} /> {meta.label}</span>
          <h3 style={{ fontSize: 17, marginLeft: 4 }}>{p.id.slice(0, 8)}</h3>
          <span className="spacer" />
          <button className="icon-btn" aria-label="Cerrar detalle" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
            {p.canal === 'SALON' ? (
              <div className="row" style={{ gap: 12 }}>
                <b style={{ fontSize: 20 }}>Mesa {p.mesaNumero}</b>
                <span className="muted">{p.cantidadItems} ítems</span>
              </div>
            ) : (
              <div>
                <b style={{ fontSize: 17 }}>{p.cliente ?? 'Cliente'}</b>
                {p.telefono && <div className="kv" style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}><span className="k">Teléfono</span><span className="v">{p.telefono}</span></div>}
                {p.direccion && <div className="kv"><span className="k">Dirección</span><span className="v" style={{ textAlign: 'right', maxWidth: 220 }}>{p.direccion}</span></div>}
                {p.proveedor && <div className="kv"><span className="k">Proveedor</span><span className="v">{p.proveedor}</span></div>}
              </div>
            )}
          </div>

          <div className="flow">
            {FLOW_PEDIDO.map((st, i) => (
              <div className={`flow-step ${flowStepCls(i, curIdx)}`} key={st.estado}>
                <span className="flow-dot">{i < curIdx ? <Icons.Check s={11} /> : i + 1}</span>
                <span className="flow-lbl">{st.label}</span>
              </div>
            ))}
          </div>

          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', margin: '6px 0 8px' }}>
            Ítems · {elapsedLabel(p.createdAt, now)}
          </div>
          <div className="panel" style={{ padding: '4px 14px' }}>
            {p.items.map((it) => {
              const anulado = it.estado === 'CANCELADO';
              return (
                <div className="dish-line" key={it.id} style={{ alignItems: 'flex-start', opacity: anulado ? 0.6 : undefined }}>
                  <span className="dish-q">{it.cantidad}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, textDecoration: anulado ? 'line-through' : undefined }}>{it.nombre}</span>
                    {anulado
                      ? <div className="cmd-line-mods" style={{ marginTop: 2, color: 'var(--danger)' }}><Icons.Alert s={11} /> Anulado</div>
                      : it.notas && <div className="cmd-line-mods" style={{ marginTop: 2 }}><Icons.Note s={11} /> {it.notas}</div>}
                  </div>
                  <span className="mono muted">{fmt(it.subtotal)}</span>
                  {!NO_ANULABLE.has(it.estado) && (
                    <button
                      className="icon-btn"
                      title="Anular ítem"
                      aria-label={`Anular ${it.cantidad}× ${it.nombre}`}
                      disabled={!online}
                      onClick={() => onAnularItem(it.id)}
                    >
                      <Icons.Close s={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div><div className="hint">Total</div><b className="mono" style={{ fontSize: 18 }}>{fmt(p.total)}</b></div>
          <span className="spacer" />
          {nextLabel && (
            <button
              className="btn btn-primary"
              aria-label={`${nextLabel} pedido ${p.id.slice(0, 6)}`}
              disabled={actionLoading === p.id || !online}
              onClick={() => onAvanzar(p)}
            >
              {actionLoading === p.id
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : nextLabel}
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
