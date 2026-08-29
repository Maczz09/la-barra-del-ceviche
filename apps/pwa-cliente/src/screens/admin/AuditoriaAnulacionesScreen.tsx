/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/admin/AuditoriaAnulacionesScreen.tsx — CU-05: panel de
// fiscalización de anulaciones (ítem/mesa). Solo ADMIN/SISTEMA/GERENCIA.
// Update acotado a motivo/observación; Delete es lógico (invalidar), nunca
// se borra el registro físico — ver EditarAnulacionModal/InvalidarAnulacionModal.

import { useMemo, useState } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useAnulacionesQuery } from '../../hooks/queries/useAnulacionesQuery';
import { useToast } from '../../components/ui/ToastProvider';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { EditarAnulacionModal } from '../../components/admin/EditarAnulacionModal';
import { InvalidarAnulacionModal } from '../../components/admin/InvalidarAnulacionModal';
import type { AnulacionAuditoriaVM, TipoAnulacion } from '../../types/pedido.types';

const TIPO_FILTROS: { value: TipoAnulacion | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'ITEM', label: 'Ítem' },
  { value: 'MESA', label: 'Mesa completa' },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

export function AuditoriaAnulacionesScreen() {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const [tipo, setTipo] = useState<TipoAnulacion | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [search, setSearch] = useState('');
  const { anulaciones, loading, saving, fetch, actualizarAnulacion, invalidarAnulacion } = useAnulacionesQuery({
    tipo: tipo || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    search: search || undefined,
    limit: 100,
  });
  const [editando, setEditando] = useState<AnulacionAuditoriaVM | null>(null);
  const [invalidando, setInvalidando] = useState<AnulacionAuditoriaVM | null>(null);

  const kpis = useMemo(() => {
    const vigentes = anulaciones.filter((a) => !a.invalidada);
    const montoTotal = vigentes.reduce((sum, a) => sum + a.montoAnulado, 0);
    const cobradas = vigentes.filter((a) => a.cobrado).length;
    const invalidadas = anulaciones.length - vigentes.length;
    return { total: vigentes.length, montoTotal, cobradas, invalidadas };
  }, [anulaciones]);

  const handleGuardarEdicion = async (motivo: string, observacion: string) => {
    if (!editando) return;
    try {
      await actualizarAnulacion(editando.id, { motivo, observacion: observacion || null });
      toast({ title: 'Anulación actualizada', icon: 'Check', kind: 'ok' });
      setEditando(null);
    } catch (err) {
      toast({ title: 'No se pudo actualizar', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const handleInvalidar = async (motivo: string) => {
    if (!invalidando) return;
    try {
      await invalidarAnulacion(invalidando.id, { motivo });
      toast({ title: 'Anulación invalidada', msg: 'El registro se conserva para auditoría.', icon: 'Check', kind: 'ok' });
      setInvalidando(null);
    } catch (err) {
      toast({ title: 'No se pudo invalidar', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Auditoría de anulaciones</h1>
          <div className="sub">Ítems y mesas anuladas — control de pérdidas y fiscalización</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => void fetch()} title="Refrescar" aria-label="Refrescar auditoría">
          <Icons.Refresh s={16} />
        </button>
      </div>

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Alert" tint="danger" label="Anulaciones vigentes" value={kpis.total} />
        <StatKpi icon="Coins" tint="warn" label="Monto anulado" value={formatMoney(kpis.montoTotal)} />
        <StatKpi icon="Cash" tint="info" label="Cobradas de todos modos" value={kpis.cobradas} />
        <StatKpi icon="Lock" tint="muted" label="Invalidadas" value={kpis.invalidadas} />
      </div>

      <div className="module-toolbar">
        <fieldset className="filters" aria-label="Filtrar por tipo">
          {TIPO_FILTROS.map((f) => (
            <button key={f.value} className={`chip ${tipo === f.value ? 'on' : ''}`} onClick={() => setTipo(f.value)}>{f.label}</button>
          ))}
        </fieldset>
        <span className="spacer" />
        <div className="search-box" style={{ maxWidth: 200 }}>
          <Icons.Search s={16} />
          <input
            type="search"
            placeholder="Buscar por código (AN0000001 o A0000001)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar anulaciones por su código o el de la atención"
          />
        </div>
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
          <span className="badge badge-info">{anulaciones.length} registros</span>
        </div>

        {loading && <div className="muted" style={{ padding: 16 }}>Cargando…</div>}
        {!loading && anulaciones.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Lock s={24} /></div>
            <h3>Sin anulaciones registradas</h3>
            <p>Las anulaciones de ítems ya preparados y de atención de mesa aparecerán aquí.</p>
          </div>
        )}
        {!loading && anulaciones.length > 0 && (
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Mesa</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Cobrado</th>
                  <th>Monto</th>
                  <th className="col-mobile-hidden">Motivo</th>
                  <th className="col-mobile-hidden">Usuario</th>
                  <th>Estado</th>
                  <th className="cell-action">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {anulaciones.map((a) => (
                  <tr key={a.id} style={{ opacity: a.invalidada ? 0.6 : undefined }}>
                    <td className="muted">
                      {a.fechaLabel}
                      {a.correlativo && <div className="mono" style={{ fontSize: 11 }}>{a.correlativo}</div>}
                      {a.cuentaCorrelativo && (
                        <div className="mono" style={{ fontSize: 11 }} title="Código de la atención">
                          Atención {a.cuentaCorrelativo}
                        </div>
                      )}
                    </td>
                    <td>{a.mesaNumero ?? '—'}</td>
                    <td><span className="badge badge-muted">{a.tipoLabel}</span></td>
                    <td>{a.productoNombre ? `${a.cantidad ?? ''}× ${a.productoNombre}` : '—'}</td>
                    <td>
                      <span className={`badge dot ${a.cobrado ? 'badge-ok' : 'badge-danger'}`}>{a.cobrado ? 'Sí' : 'No'}</span>
                    </td>
                    <td className="mono">{a.montoLabel}</td>
                    <td className="col-mobile-hidden">{a.motivo}</td>
                    <td className="col-mobile-hidden muted">{a.usuarioNombre ?? '—'}</td>
                    <td>
                      {a.invalidada
                        ? <span className="badge badge-muted" title={a.invalidadaMotivo ?? undefined}>Inválida</span>
                        : <span className="badge badge-ok">Vigente</span>}
                    </td>
                    <td className="cell-action">
                      {!a.invalidada && (
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            className="icon-btn"
                            disabled={!online}
                            onClick={() => setEditando(a)}
                            aria-label={`Editar motivo de anulación ${a.id.slice(0, 8)}`}
                            title="Editar motivo/observación"
                          >
                            <Icons.Edit s={14} />
                          </button>
                          <button
                            className="icon-btn"
                            disabled={!online}
                            onClick={() => setInvalidando(a)}
                            aria-label={`Invalidar anulación ${a.id.slice(0, 8)}`}
                            title="Invalidar registro"
                          >
                            <Icons.Lock s={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editando && (
        <EditarAnulacionModal
          anulacion={editando}
          saving={saving}
          onClose={() => setEditando(null)}
          onSave={(motivo, observacion) => { void handleGuardarEdicion(motivo, observacion); }}
        />
      )}

      {invalidando && (
        <InvalidarAnulacionModal
          anulacion={invalidando}
          saving={saving}
          onClose={() => setInvalidando(null)}
          onConfirm={(motivo) => { void handleInvalidar(motivo); }}
        />
      )}
    </div>
  );
}
