/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
import { useMemo, useState } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useNow } from '../../hooks/useNow';
import { usePedidosQuery, useAnularPedidoMutation } from '../../hooks/queries/usePedidosQuery';
import { useToast } from '../../components/ui/ToastProvider';
import { Icons } from '../../components/ui/icons';
import { Comandero } from '../../components/comandero/Comandero';
import { TableroView } from '../../components/pedidos/TableroView';
import { ListaView } from '../../components/pedidos/ListaView';
import { DetallePedido } from '../../components/pedidos/DetallePedido';
import { AnularItemModal } from '../../components/pedidos/AnularItemModal';
import { AnularPedidoModal } from '../../components/pedidos/AnularPedidoModal';
import { nextEstadoFor } from '../../components/pedidos/pedidos.meta';
import { ETAPAS_PRODUCCION as ETAPAS, ESTADOS_PRODUCCION as ESTADOS_VISIBLES } from '../../domain/pedido.flow';
import type { PedidoVM, PedidoItemVM } from '../../types/pedido.types';

type CanalFiltro = 'SALON' | 'DELIVERY' | 'LLEVAR' | 'TODOS';

const CANAL_TABS: CanalFiltro[] = ['TODOS', 'SALON', 'DELIVERY', 'LLEVAR'];
const CANAL_LABEL_TAB: Record<CanalFiltro, string> = { TODOS: 'Todos', SALON: 'Salón', DELIVERY: 'Delivery', LLEVAR: 'Para llevar' };
const CANAL_CLS_TAB: Record<CanalFiltro, string> = { TODOS: '', SALON: 'salon', DELIVERY: 'delivery', LLEVAR: 'llevar' };
const CANAL_ICON_TAB: Record<CanalFiltro, keyof typeof Icons> = { TODOS: 'Layers', SALON: 'Mesas', DELIVERY: 'Delivery', LLEVAR: 'Bag' };

export function PedidosScreen() {
  const online = useOnlineStatus();
  const now = useNow();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const { pedidos, nextCursor, loading, loadingMore, error, fetch, fetchMore, avanzarEstado, avanzarItem, anularItemPreparado } = usePedidosQuery(undefined, { search });
  const { saving: savingAnularPedido, anularPedido } = useAnularPedidoMutation();
  const [canal, setCanal] = useState<CanalFiltro>('TODOS');
  const [vista, setVista] = useState<'tablero' | 'lista'>('tablero');
  const [detalle, setDetalle] = useState<PedidoVM | null>(null);
  const [comandero, setComandero] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [anularItemSel, setAnularItemSel] = useState<PedidoItemVM | null>(null);
  const [savingAnular, setSavingAnular] = useState(false);
  const [anularPedidoSel, setAnularPedidoSel] = useState<PedidoVM | null>(null);

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

  const confirmarAnular = async (motivo: string, cobrar: boolean, observacion?: string) => {
    if (!anularItemSel || !online) return;
    setSavingAnular(true);
    try {
      if (anularItemSel.estado === 'ENTREGADO') {
        await anularItemPreparado(anularItemSel.id, { motivo, cobrar, observacion });
        toast({
          title: 'Ítem anulado',
          msg: cobrar ? 'Se mantiene en la cuenta.' : 'Se retiró de la cuenta.',
          icon: 'Check',
          kind: 'ok',
        });
      } else {
        await avanzarItem(anularItemSel.id, 'CANCELADO', motivo);
        toast({ title: 'Ítem anulado', icon: 'Check', kind: 'ok' });
      }
      setAnularItemSel(null);
    } catch (err) {
      toast({ title: 'No se pudo anular el ítem', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    } finally {
      setSavingAnular(false);
    }
  };

  const confirmarAnularPedido = async (motivo: string, itemsConsumidos: string[]) => {
    if (!anularPedidoSel || !online) return;
    try {
      await anularPedido(anularPedidoSel.id, { motivo, itemsConsumidos });
      toast({ title: 'Pedido anulado', icon: 'Check', kind: 'ok' });
      setAnularPedidoSel(null);
      setDetalle(null);
    } catch (err) {
      toast({ title: 'No se pudo anular el pedido', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
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
        <div className="search-box" style={{ maxWidth: 220 }}>
          <Icons.Search s={16} />
          <input
            type="search"
            placeholder="Buscar por código (A0000001)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar pedidos por código de atención"
          />
        </div>
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
          onAvanzar={avanzar} onAnularItem={setAnularItemSel} onAnularPedido={setAnularPedidoSel}
          actionLoading={actionLoading} online={online} now={now}
        />
      )}

      {anularItemSel && (
        <AnularItemModal
          item={anularItemSel}
          saving={savingAnular}
          onClose={() => setAnularItemSel(null)}
          onConfirm={(motivo, cobrar, observacion) => { void confirmarAnular(motivo, cobrar, observacion); }}
        />
      )}

      {anularPedidoSel && (
        <AnularPedidoModal
          items={anularPedidoSel.items}
          saving={savingAnularPedido}
          onClose={() => setAnularPedidoSel(null)}
          onConfirm={(motivo, itemsConsumidos) => { void confirmarAnularPedido(motivo, itemsConsumidos); }}
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
