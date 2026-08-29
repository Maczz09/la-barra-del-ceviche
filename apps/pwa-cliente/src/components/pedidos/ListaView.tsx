import { Icons } from '../ui/icons';
import { fmt, elapsedLabel } from '../../utils/format';
import type { PedidoVM } from '../../types/pedido.types';
import { CANAL_META, nextLabelFor, type ViewProps } from './pedidos.meta';

export function ListaView({ pedidos, onAvanzar, onDetalle, actionLoading, online, now }: Readonly<ViewProps>) {
  return (
    <div className="table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
      <table className="dt">
        <thead>
          <tr>
            <th>Pedido</th><th>Canal</th><th>Destino / Cliente</th>
            <th>Ítems</th><th>Total</th><th>Tiempo</th><th>Estado</th>
            <th style={{ textAlign: 'right' }}>Acción</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => <ListaRow key={p.id} p={p} onAvanzar={onAvanzar} onDetalle={onDetalle} actionLoading={actionLoading} online={online} now={now} />)}
        </tbody>
      </table>
    </div>
  );
}

function ListaRow({ p, onAvanzar, onDetalle, actionLoading, online, now }: { p: PedidoVM } & Omit<ViewProps, 'pedidos'>) {
  const meta = CANAL_META[p.canal];
  const Ic = Icons[meta.ic];
  const nextLabel = nextLabelFor(p);
  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => onDetalle(p)}>
      <td className="mono"><strong>{p.cuentaCorrelativo ?? p.id.slice(0, 6)}</strong></td>
      <td><span className={`tag-canal ${meta.cls}`}><Ic s={12} /> {meta.label}</span></td>
      <td>
        {p.canal === 'SALON'
          ? <strong>Mesa {p.mesaNumero}</strong>
          : <><strong>{p.cliente ?? 'Cliente'}</strong>
              {p.direccion && <div className="note" style={{ whiteSpace: 'normal' }}>{p.direccion}</div>}
            </>}
      </td>
      <td><span className="mono">{p.cantidadItems}</span></td>
      <td><strong className="mono">{fmt(p.total)}</strong></td>
      <td><span className="muted">{elapsedLabel(p.createdAt, now)}</span></td>
      <td><span className={`badge dot ${p.estadoClass}`}>{p.estadoLabel}</span></td>
      <td style={{ textAlign: 'right' }}>
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
      </td>
    </tr>
  );
}
