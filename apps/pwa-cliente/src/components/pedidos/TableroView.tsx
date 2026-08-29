import { Icons } from '../ui/icons';
import { fmt, elapsedMin, elapsedLabel } from '../../utils/format';
import { ETAPAS_PRODUCCION as ETAPAS, SLA_MIN } from '../../domain/pedido.flow';
import type { PedidoVM } from '../../types/pedido.types';
import { CANAL_META, nextLabelFor, type ViewProps } from './pedidos.meta';

export function TableroView({ pedidos, onAvanzar, onDetalle, actionLoading, online, now }: Readonly<ViewProps>) {
  return (
    <div className="ped-board">
      {ETAPAS.map((et) => {
        const cards = pedidos.filter((p) => p.estado === et.estado);
        return (
          <div className="ped-col" key={et.estado}>
            <div className="ped-col-h">
              <span className="dot" style={{ background: et.color }} />
              {et.label}
              <span className="cc">{cards.length}</span>
            </div>
            <div className="ped-col-body">
              {cards.length === 0
                ? <div className="ped-col-empty">Sin pedidos</div>
                : cards.map((p) => (
                  <PedidoCard
                    key={p.id} p={p}
                    onAvanzar={onAvanzar} onDetalle={onDetalle}
                    actionLoading={actionLoading} online={online} now={now}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function destino(p: PedidoVM) {
  if (p.canal === 'SALON') return <b>Mesa {p.mesaNumero}</b>;
  return (
    <><b>{p.cliente ?? 'Cliente'}</b>
      {p.direccion && <div className="pc-sub"><Icons.Delivery s={12} /> {p.direccion}</div>}
    </>
  );
}

function PedidoCard({ p, onAvanzar, onDetalle, actionLoading, online, now }: { p: PedidoVM } & Omit<ViewProps, 'pedidos'>) {
  const meta = CANAL_META[p.canal];
  const mins = elapsedMin(p.createdAt, now);
  const tardio = mins >= SLA_MIN;
  const nextLabel = nextLabelFor(p);
  const Ic = Icons[meta.ic];

  return (
    <div className={`ped-card ${meta.cls}`}>
      <button
        type="button"
        className="pc-hit"
        aria-label={`Ver detalle del pedido ${p.id.slice(0, 6)}`}
        onClick={() => onDetalle(p)}
      />
      <div className="pc-top">
        <span className={`tag-canal ${meta.cls}`}><Ic s={12} /> {meta.label}</span>
        <span className="pc-id mono">{p.cuentaCorrelativo ?? p.id.slice(0, 6)}</span>
        <span className="spacer" />
        <span className={`pc-time ${tardio ? 'late' : ''}`}>
          <Icons.Clock s={12} /> {elapsedLabel(p.createdAt, now)}
          {tardio ? <span className="sr-only"> · en demora</span> : null}
        </span>
      </div>
      <div className="pc-where">{destino(p)}</div>
      <div className="pc-items">
        {p.items.slice(0, 3).map((it) => (
          <div className="pc-item" key={it.id}>
            <span className="pc-q">{it.cantidad}×</span>
            <span className="pc-n">{it.nombre}</span>
          </div>
        ))}
        {p.items.length > 3 && <div className="pc-more">+{p.items.length - 3} más</div>}
      </div>
      <div className="pc-foot">
        {p.canal === 'DELIVERY' && p.proveedor
          ? <span className="pill-soft">{p.proveedor}</span>
          : <span className="mono pc-total">{fmt(p.total)}</span>}
        <span className="spacer" />
        {nextLabel && (
          <button
            className="btn btn-sm btn-primary"
            aria-label={`${nextLabel} pedido ${p.id.slice(0, 6)}`}
            disabled={actionLoading === p.id || !online}
            onClick={(e) => { e.stopPropagation(); onAvanzar(p); }}
          >
            {actionLoading === p.id
              ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
              : nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
