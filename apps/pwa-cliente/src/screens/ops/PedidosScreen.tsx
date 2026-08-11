/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
import { useMemo, useState } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useNow } from '../../hooks/useNow';
import { usePedidosQuery } from '../../hooks/queries/usePedidosQuery';
import { useToast } from '../../components/ui/ToastProvider';
import { Icons } from '../../components/ui/icons';
import { Comandero } from '../../components/comandero/Comandero';
import { TableroView } from '../../components/pedidos/TableroView';
import { ListaView } from '../../components/pedidos/ListaView';
import { DetallePedido } from '../../components/pedidos/DetallePedido';
import { nextEstadoFor } from '../../components/pedidos/pedidos.meta';
import { ETAPAS_PRODUCCION as ETAPAS, ESTADOS_PRODUCCION as ESTADOS_VISIBLES } from '../../domain/pedido.flow';
import type { PedidoVM } from '../../types/pedido.types';

type CanalFiltro = 'SALON' | 'DELIVERY' | 'LLEVAR' | 'TODOS';

const CANAL_TABS: CanalFiltro[] = ['TODOS', 'SALON', 'DELIVERY', 'LLEVAR'];
const CANAL_LABEL_TAB: Record<CanalFiltro, string> = { TODOS: 'Todos', SALON: 'Salón', DELIVERY: 'Delivery', LLEVAR: 'Para llevar' };
const CANAL_CLS_TAB: Record<CanalFiltro, string> = { TODOS: '', SALON: 'salon', DELIVERY: 'delivery', LLEVAR: 'llevar' };
const CANAL_ICON_TAB: Record<CanalFiltro, keyof typeof Icons> = { TODOS: 'Layers', SALON: 'Mesas', DELIVERY: 'Delivery', LLEVAR: 'Bag' };

export function PedidosScreen() {
  const online = useOnlineStatus();
  const now = useNow();
  const { toast } = useToast();
  const { pedidos, nextCursor, loading, loadingMore, error, fetch, fetchMore, avanzarEstado, avanzarItem } = usePedidosQuery();
  const [canal, setCanal] = useState<CanalFiltro>('TODOS');
  const [vista, setVista] = useState<'tablero' | 'lista'>('tablero');
  const [detalle, setDetalle] = useState<PedidoVM | null>(null);
  const [comandero, setComandero] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Re-deriva el detalle abierto desde la lista viva: tras anular un ítem
  // (que no cierra el drawer, a diferencia de avanzar), el snapshot local
  // quedaría desactualizado si no se refresca desde `pedidos`.
  const detalleVivo = useMemo(
    () => (detalle ? pedidos.find((p) => p.id === detalle.id) ?? detalle : null),
    [detalle, pedidos],
  );

  const visibles = useMemo(
    () => pedidos.filter((p) => ESTADOS_VISIBLES.has(p.estado) && (canal === 'TODOS' || p.canal === canal)),
    [pedidos, canal],
  );
  const countCanal = (c: CanalFiltro) =>
    pedidos.filter((p) => ESTADOS_VISIBLES.has(p.estado) && (c === 'TODOS' || p.canal === c)).length;

  const avanzar = async (p: PedidoVM) => {
    const next = nextEstadoFor(p);
    if (!next || !online) return;
    setActionLoading(p.id);
    try {
      await avanzarEstado(p.id, next);
      setDetalle(null);
    } catch { /* el error se muestra vía estado del hook */ }
    finally { setActionLoading(null); }
  };

  const anularItem = async (itemId: string) => {
    if (!online) return;
    setActionLoading(itemId);
    try {
      await avanzarItem(itemId, 'CANCELADO');
      toast({ title: 'Ítem anulado', icon: 'Check', kind: 'ok' });
    } catch (err) {
      toast({ title: 'No se pudo anular el ítem', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && pedidos.length === 0) {
    return (
      <div>
        <div className="page-h"><div><h1>Pedidos</h1><div className="sub">Cargando…</div></div></div>
        <div className="ped-board">
          {ETAPAS.map((e) => (
            <div className="ped-col" key={e.estado}>
              <div className="ped-col-h"><span className="dot" style={{ background: e.color }} />{e.label}</div>
              <div className="ped-col-body">
                {[1, 2].map((i) => <div key={i} className="skel" style={{ height: 120, borderRadius: 'var(--r)' }} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="page-h"><div><h1>Pedidos</h1></div></div>
        <div className="banner err" style={{ marginBottom: 16 }}>
          <Icons.Alert s={17} /><span>{error}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => fetch()}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Pedidos</h1>
          <div className="sub">{visibles.length} pedidos activos · Salón, delivery y para llevar</div>
        </div>
        <span className="spacer" />
        <div className="seg sm" style={{ marginRight: 4 }}>
          <button className={vista === 'tablero' ? 'on' : ''} onClick={() => setVista('tablero')}><Icons.Layers s={14} /> Tablero</button>
          <button className={vista === 'lista' ? 'on' : ''} onClick={() => setVista('lista')}><Icons.Pedidos s={14} /> Lista</button>
        </div>
        <button className="btn btn-primary" onClick={() => setComandero(true)}><Icons.Plus s={16} /> Nuevo pedido</button>
      </div>

      <div className="canal-tabs-row">
        <div className="canal-tabs">
        {CANAL_TABS.map((c) => {
          const Ic = Icons[CANAL_ICON_TAB[c]];
          return (
            <button key={c} className={`canal-tab ${canal === c ? 'on' : ''} ${CANAL_CLS_TAB[c]}`} onClick={() => setCanal(c)}>
              <Ic s={15} /> {CANAL_LABEL_TAB[c]}
              <span className="ct-count">{countCanal(c)}</span>
            </button>
          );
        })}
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => fetch()} title="Refrescar"><Icons.Refresh s={15} /></button>
      </div>

      {vista === 'tablero'
        ? <TableroView pedidos={visibles} onAvanzar={avanzar} onDetalle={setDetalle} actionLoading={actionLoading} online={online} now={now} />
        : <ListaView pedidos={visibles} onAvanzar={avanzar} onDetalle={setDetalle} actionLoading={actionLoading} online={online} now={now} />}

      {nextCursor && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 12, flex: 'none' }}>
          <button className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={fetchMore}>
            {loadingMore ? <span className="spinner" /> : null} Cargar más
          </button>
        </div>
      )}

      {detalleVivo && (
        <DetallePedido
          pedido={detalleVivo} onClose={() => setDetalle(null)}
          onAvanzar={avanzar} onAnularItem={anularItem} actionLoading={actionLoading} online={online} now={now}
        />
      )}

      {comandero && (
        <Comandero
          onClose={() => setComandero(false)}
          onCreated={() => fetch()}
          initialCanal={canal === 'TODOS' ? 'SALON' : canal}
        />
      )}
    </div>
  );
}
