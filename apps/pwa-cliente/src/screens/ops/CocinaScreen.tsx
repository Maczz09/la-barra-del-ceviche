/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
import { useEffect, useMemo, useState } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useNow } from '../../hooks/useNow';
import { usePedidosQuery } from '../../hooks/queries/usePedidosQuery';
import { useToast } from '../../components/ui/ToastProvider';
import { onPedidoUpdate } from '../../services/socket.service';
import { Icons } from '../../components/ui/icons';
import { Metric, TicketCard } from '../../components/cocina/TicketCard';
import type { PedidoVM, PedidoItemVM, EstadoItem } from '../../types/pedido.types';
import {
  ETAPAS_PRODUCCION as COLS,
  ESTADOS_PRODUCCION,
  NEXT_ITEM,
  PREV_ITEM,
  SLA_MIN,
} from '../../domain/pedido.flow';

interface PedidoItemAnuladoData {
  productoNombre?: string;
  mesaId?: string;
}

const elapsedMinF = (iso: string, now: number) => (now - new Date(iso).getTime()) / 60_000;

export function CocinaScreen() {
  const online = useOnlineStatus();
  const now = useNow(4000);
  const { pedidos, loading, error, fetch, avanzarItem } = usePedidosQuery(undefined, { autoLoadAll: true });
  const { toast } = useToast();
  const [fs, setFs] = useState(false);

  // Notificación flotante: un mesero anuló un plato (área COCINA) — el
  // backend solo emite este evento para ítems de cocina, las bebidas de
  // barra no llegan acá (cocina no necesita saberlo).
  useEffect(() => {
    return onPedidoUpdate((evento) => {
      if (evento.pattern !== 'pedido.item_anulado') return;
      const data = (evento.data ?? {}) as PedidoItemAnuladoData;
      toast({
        title: 'Ítem anulado',
        msg: data.productoNombre ? `El mesero anuló: ${data.productoNombre}` : 'El mesero anuló un ítem del pedido.',
        icon: 'Alert',
        kind: 'warn',
      });
    });
  }, [toast]);

  // Cocina solo maneja ítems de Carta/Menú: lo seleccionado de Inventario
  // (área BAR) nace ENTREGADO en el backend — el mesero ya lo sirvió — y
  // nunca debe aparecer en el tablero ni contar en sus métricas.
  const esCocina = (it: PedidoItemVM) => it.area === 'COCINA';
  // "Aún pendiente de cocina": ni listo, ni anulado, ni rechazado por falta
  // de stock — un ítem CANCELADO no debe seguir sumando en tickets
  // activos/conteo del día solo porque su estado "no es LISTO".
  const enProduccion = (it: PedidoItemVM) => it.estado === 'PENDIENTE' || it.estado === 'EN_PREPARACION';

  const activos = useMemo(
    () => pedidos.filter((p) => ESTADOS_PRODUCCION.has(p.estado)),
    [pedidos],
  );

  const advanceItem = async (itemId: string, estado: EstadoItem) => {
    if (!online) return;
    const next = NEXT_ITEM[estado];
    if (!next) return;
    try { await avanzarItem(itemId, next); } catch { /* manejado por hook */ }
  };
  const regressItem = async (itemId: string, estado: EstadoItem) => {
    if (!online) return;
    const prev = PREV_ITEM[estado];
    if (!prev) return;
    try { await avanzarItem(itemId, prev); } catch { /* */ }
  };
  const bumpTicket = async (pid: string) => {
    if (!online) return;
    const p = activos.find((x) => x.id === pid);
    if (!p) return;
    const targets = p.items.filter((it) => esCocina(it) && NEXT_ITEM[it.estado]);
    try { await Promise.all(targets.map((it) => avanzarItem(it.id, NEXT_ITEM[it.estado]!))); } catch { /* */ }
  };

  const metrics = useMemo(() => {
    const act = activos.filter((p) => p.items.some((it) => esCocina(it) && enProduccion(it)));
    const tiempos = act.map((p) => elapsedMinF(p.createdAt, now));
    const prom = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;
    const demora = act.filter((p) => elapsedMinF(p.createdAt, now) >= SLA_MIN).length;
    const listos = activos.reduce((s, p) => s + p.items.filter((it) => esCocina(it) && it.estado === 'LISTO').length, 0);
    return { activos: act.length, prom: Math.round(prom), demora, listos };
  }, [activos, now]);

  const allday = useMemo(() => {
    const map: Record<string, number> = {};
    activos.forEach((p) => p.items.forEach((it) => {
      if (esCocina(it) && enProduccion(it)) map[it.nombre] = (map[it.nombre] || 0) + it.cantidad;
    }));
    return Object.entries(map).map(([n, q]) => ({ n, q })).sort((a, b) => b.q - a.q);
  }, [activos]);

  if (loading && pedidos.length === 0) {
    return (
      <div>
        <div className="page-h"><div><h1>Cocina · KDS</h1><div className="sub">Cargando…</div></div></div>
        <div className="kds">
          {COLS.map((col) => (
            <div key={col.estado} className="kds-col">
              <div className="kds-col-h"><span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />{col.label}</div>
              <div className="kds-list">{[1, 2].map((i) => <div key={i} className="skel" style={{ height: 120, borderRadius: 'var(--r)' }} />)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <div className="page-h"><div><h1>Cocina · KDS</h1></div></div>
        <div className="banner err" style={{ marginBottom: 16 }}>
          <Icons.Alert s={17} /><span>{error}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => fetch()}>Reintentar</button>
        </div>
      </div>
    );
  }

  const body = (
    <>
      <div className="kds-metrics">
        <Metric ic="Receipt" color="var(--accent)" soft="var(--accent-soft)" v={metrics.activos} k="Tickets activos" />
        <Metric ic="Clock" color="var(--info)" soft="var(--info-soft)" v={`${metrics.prom}m`} k="Tiempo promedio" />
        <Metric ic="Alert" alert={metrics.demora > 0} v={metrics.demora} k="En demora (SLA)" />
        <Metric ic="Check" color="var(--ok)" soft="var(--ok-soft)" v={metrics.listos} k="Ítems listos · pase" />
      </div>

      <div className="allday">
        <span className="allday-lbl">Conteo del día</span>
        {allday.length === 0 ? <span className="hint">Sin pendientes en esta área</span> :
          allday.map((d) => <span key={d.n} className={`allday-chip ${d.q >= 3 ? 'hot' : ''}`}><span className="q">{d.q}</span><b>{d.n}</b></span>)}
      </div>

      <div className="kds" style={{ flex: 1, minHeight: 0 }}>
        {COLS.map((col) => {
          const cards: { p: PedidoVM; items: PedidoItemVM[] }[] = [];
          for (const p of activos) {
            const items = p.items.filter((it) => esCocina(it) && it.estado === col.estado);
            if (items.length) cards.push({ p, items });
          }
          return (
            <div key={col.estado} className="kds-col">
              <div className="kds-col-h">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
                {col.label}
                <span className="cc">{cards.length}</span>
              </div>
              <div className="kds-list">
                {cards.length === 0 ? <div className="muted" style={{ textAlign: 'center', padding: 24, fontSize: 13 }}>Sin tickets</div> :
                  cards.map(({ p, items }) => (
                    <TicketCard key={`${p.id}-${col.estado}`} p={p} items={items} col={col} now={now}
                      online={online}
                      onAdvance={advanceItem} onRegress={regressItem} onBump={() => bumpTicket(p.id)} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  if (fs) {
    return (
      <div className="kds-fs">
        <div className="row kds-fs-head" style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Cocina · KDS</h1>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => setFs(false)}><Icons.Minimize s={16} /> Salir</button>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h" style={{ marginBottom: 14 }}>
        <div>
          <h1>Cocina · KDS</h1>
          <div className="sub">Tiempo real · tablet de cocina</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => fetch()} title="Refrescar" aria-label="Refrescar"><Icons.Refresh s={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={() => setFs(true)} title="Pantalla completa" aria-label="Pantalla completa"><Icons.Maximize s={16} /></button>
      </div>
      {body}
    </div>
  );
}
