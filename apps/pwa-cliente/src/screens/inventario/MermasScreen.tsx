/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/inventario/MermasScreen.tsx — CU-04: módulo completo de mermas
// (antes un drawer dentro de Inventario). Filtros por origen, rango de
// fechas y búsqueda libre (producto/motivo) + CRUD (editar recalcula el
// stock por la diferencia, eliminar restaura el stock completo).

import { useMemo, useState } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useMermasQuery } from '../../hooks/queries/useMermasQuery';
import { useToast } from '../../components/ui/ToastProvider';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { EditarMermaModal } from '../../components/inventario/EditarMermaModal';
import { EliminarMermaModal } from '../../components/inventario/EliminarMermaModal';
import type { MermaOrigen, MermaVM } from '../../types/inventario.types';

const ORIGEN_FILTROS: { value: MermaOrigen | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'DESCARTE_MANUAL_INVENTARIO', label: 'Descarte manual' },
  { value: 'ANULACION_COMANDA_NO_COBRADA', label: 'Anulación (no cobrada)' },
  { value: 'ANULACION_COMANDA_COBRADA', label: 'Anulación (cobrada)' },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

export function MermasScreen() {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const [origen, setOrigen] = useState<MermaOrigen | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const { mermas: mermasCrudas, loading, saving, fetch, actualizarMerma, eliminarMerma } = useMermasQuery({
    limit: 100,
    origen: origen || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });
  const [editando, setEditando] = useState<MermaVM | null>(null);
  const [eliminando, setEliminando] = useState<MermaVM | null>(null);

  const mermas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return mermasCrudas;
    return mermasCrudas.filter((m) =>
      m.productoNombre.toLowerCase().includes(q) ||
      m.motivo.toLowerCase().includes(q) ||
      (m.cuentaCorrelativo?.toLowerCase().includes(q) ?? false),
    );
  }, [mermasCrudas, busqueda]);

  const kpis = useMemo(() => {
    const totalMermado = mermas.reduce((sum, m) => sum + (m.costoTotal ?? 0), 0);
    const porProducto = new Map<string, number>();
    for (const m of mermas) {
      porProducto.set(m.productoNombre, (porProducto.get(m.productoNombre) ?? 0) + (m.costoTotal ?? 0));
    }
    let topProducto: string | null = null;
    let topMonto = 0;
    for (const [nombre, monto] of porProducto) {
      if (monto > topMonto) { topProducto = nombre; topMonto = monto; }
    }
    return { total: mermas.length, totalMermado, topProducto, topMonto };
  }, [mermas]);

  const handleGuardarEdicion = async (cantidad: number, motivo: string, observacion: string) => {
    if (!editando) return;
    try {
      await actualizarMerma(editando.id, { cantidad, motivo, observacion: observacion || null });
      toast({ title: 'Merma actualizada', icon: 'Check', kind: 'ok' });
      setEditando(null);
    } catch (err) {
      toast({ title: 'No se pudo actualizar la merma', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const handleConfirmarEliminar = async (justificacion: string) => {
    if (!eliminando) return;
    try {
      await eliminarMerma(eliminando.id, justificacion);
      toast({ title: 'Merma eliminada', msg: 'Stock restaurado.', icon: 'Check', kind: 'ok' });
      setEliminando(null);
    } catch (err) {
      toast({ title: 'No se pudo eliminar la merma', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Mermas</h1>
          <div className="sub">Pérdidas de stock — descartes manuales y anulaciones de comanda</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => void fetch()} title="Refrescar" aria-label="Refrescar mermas">
          <Icons.Refresh s={16} />
        </button>
      </div>

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Alert" tint="danger" label="Registros" value={kpis.total} />
        <StatKpi icon="Coins" tint="warn" label="Total mermado" value={formatMoney(kpis.totalMermado)} />
        <StatKpi
          icon="Inventario"
          tint="muted"
          label="Mayor pérdida"
          value={kpis.topProducto ? <>{kpis.topProducto} <span className="muted" style={{ fontSize: 13 }}>· {formatMoney(kpis.topMonto)}</span></> : '—'}
        />
      </div>

      <div className="module-toolbar">
        <div className="search-box">
          <Icons.Search s={16} />
          <input
            type="search"
            placeholder="Buscar por producto, motivo o código de atención…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar mermas"
          />
        </div>
        <fieldset className="filters" aria-label="Filtrar por origen">
          {ORIGEN_FILTROS.map((f) => (
            <button key={f.value} className={`chip ${origen === f.value ? 'on' : ''}`} onClick={() => setOrigen(f.value)}>{f.label}</button>
          ))}
        </fieldset>
        <span className="spacer" />
        <div className="input toolbar-input">
          <input type="date" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="input toolbar-input">
          <input type="date" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      <section className="panel">
        <div className="panel-h">
          <h3>Registros</h3>
          <span className="spacer" />
          <span className="badge badge-info">{mermas.length} registros</span>
        </div>

        {loading && <div className="muted" style={{ padding: 16 }}>Cargando…</div>}
        {!loading && mermas.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Alert s={24} /></div>
            <h3>Sin mermas registradas</h3>
            <p>Las pérdidas de stock (botellas rotas, vencidas, anulaciones de comanda, etc.) aparecerán aquí.</p>
          </div>
        )}
        {!loading && mermas.length > 0 && (
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Origen</th>
                  <th>Costo</th>
                  <th className="col-mobile-hidden">Motivo</th>
                  <th className="col-mobile-hidden">Usuario</th>
                  <th className="cell-action">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mermas.map((m) => (
                  <tr key={m.id}>
                    <td className="muted">{m.fechaLabel}</td>
                    <td>
                      {m.productoNombre}
                      {m.cuentaCorrelativo && <div className="muted mono" style={{ fontSize: 11 }}>{m.cuentaCorrelativo}</div>}
                    </td>
                    <td className="mono badge badge-danger" style={{ display: 'inline-block' }}>-{m.cantidad}</td>
                    <td><span className="badge badge-muted">{m.origenLabel}</span></td>
                    <td className="mono">{m.costoTotalLabel}</td>
                    <td className="col-mobile-hidden">{m.motivo}{m.observacion && <div className="muted" style={{ fontSize: 12 }}>{m.observacion}</div>}</td>
                    <td className="col-mobile-hidden muted">{m.usuarioNombre ?? '—'}</td>
                    <td className="cell-action">
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="icon-btn" disabled={!online} onClick={() => setEditando(m)} aria-label={`Editar merma de ${m.productoNombre}`} title="Editar">
                          <Icons.Edit s={14} />
                        </button>
                        <button className="icon-btn" disabled={!online} onClick={() => setEliminando(m)} aria-label={`Eliminar merma de ${m.productoNombre}`} title="Eliminar y restaurar stock">
                          <Icons.Close s={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editando && (
        <EditarMermaModal
          merma={editando}
          saving={saving}
          onClose={() => setEditando(null)}
          onSave={(cantidad, motivo, observacion) => { void handleGuardarEdicion(cantidad, motivo, observacion); }}
        />
      )}

      {eliminando && (
        <EliminarMermaModal
          merma={eliminando}
          saving={saving}
          onClose={() => setEliminando(null)}
          onConfirm={(justificacion) => { void handleConfirmarEliminar(justificacion); }}
        />
      )}
    </div>
  );
}
