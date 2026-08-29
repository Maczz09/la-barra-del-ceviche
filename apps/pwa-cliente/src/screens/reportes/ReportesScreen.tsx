/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/reportes/ReportesScreen.tsx - Resumen diario y métricas reales

import { useState } from 'react';
import { useReportesQuery } from '../../hooks/queries/useReportesQuery';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { useAuthStore } from '../../store/auth.store';
import type { RankingProducto } from '../../types/reporte.types';

export function ReportesScreen() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [sedeId, setSedeId] = useState(''); // '' = todas las sedes (combinado)
  const [exportando, setExportando] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // T-23 Fase 2: el filtro de sede es propio de Reportes (independiente del
  // switcher del navbar) — solo el admin general (sedeId nulo) lo ve; un
  // usuario pineado ya queda scopeado a su sede en el backend sin necesidad
  // de elegir nada.
  const user = useAuthStore((s) => s.user);
  const esAdminGeneral = user != null && user.sedeId == null;
  const { sedes } = useSedesQuery({ enabled: esAdminGeneral });

  const { resumen, loading, error, fetch } = useReportesQuery({
    desde: desde || undefined,
    hasta: hasta || undefined,
    sedeId: sedeId || undefined,
  });

  const handleExportar = async () => {
    if (!resumen) return;
    setExportando(true);
    setExportError(null);
    try {
      // jspdf/jspdf-autotable no resuelven tipos de forma consistente en el
      // import() dinámico bajo este resolver de eslint (tsc sí los resuelve bien).
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
      const { exportarResumenPdf } = await import('../../utils/reportePdf');
      await exportarResumenPdf(resumen);
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo generar el PDF');
    } finally {
      setExportando(false);
    }
  };

  const limpiarFiltro = () => { setDesde(''); setHasta(''); setSedeId(''); };

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Reportes</h1>
          <div className="sub">Métricas reales del turno y ventas del día</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" disabled={!resumen || exportando} onClick={handleExportar} title="Exportar PDF">
          {exportando ? <span className="spinner" /> : <DownloadIcon />}
          Exportar PDF
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => fetch()} title="Refrescar">
          <RefreshIcon />
        </button>
      </div>

      <div className="module-toolbar" style={{ marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="rep-desde">Desde</label>
          <div className="input"><input id="rep-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="rep-hasta">Hasta</label>
          <div className="input"><input id="rep-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        </div>
        {esAdminGeneral && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="rep-sede">Sede</label>
            <div className="input">
              <select id="rep-sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
                <option value="">Todas las sedes</option>
                {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>
        )}
        {(desde || hasta || sedeId) && (
          <button className="btn btn-ghost btn-sm" onClick={limpiarFiltro}>Limpiar filtro</button>
        )}
      </div>

      {(error || exportError) && (
        <div className="banner err module-feedback">
          <AlertIcon />
          <span>{error ?? exportError}</span>
        </div>
      )}

      {!resumen && (loading ? (
        <div className="grid-stats">
          {[1, 2, 3].map((row) => (
            <div key={row} className="stat">
              <div className="skel stat-skel-title" />
              <div className="skel stat-skel-value" />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="e-ic"><ChartIcon /></div>
          <h3>Sin resumen disponible</h3>
          <p>El módulo se mantiene vacío hasta recibir datos reales de reportes.</p>
        </div>
      ))}
      {resumen && (
        <div className="report-stack">
          <div className="grid-stats">
            <div className="stat">
              <div className="k">Ingresos del día</div>
              <div className="v">{resumen.ingresosLabel}</div>
              <div className="d">{resumen.rangoLabel}</div>
            </div>
            <div className="stat">
              <div className="k">Ventas cerradas</div>
              <div className="v">{resumen.totalVentas}</div>
              <div className="d">Cuentas registradas</div>
            </div>
            <div className="stat">
              <div className="k">Ticket promedio</div>
              <div className="v">{resumen.ticketPromedioLabel}</div>
              <div className="d">Media: el total entre la cantidad de ventas</div>
            </div>
            <div className="stat">
              <div className="k">Ticket mediana</div>
              <div className="v">{resumen.estadisticasTicket.medianaLabel}</div>
              <div className="d">El valor del medio, no lo mueve una venta enorme puntual</div>
            </div>
            <div className="stat">
              <div className="k">Moda del ticket</div>
              <div className="v">{resumen.estadisticasTicket.modaLabel}</div>
              <div className="d">El monto que más se repite (suele ser un combo o precio fijo)</div>
            </div>
          </div>

          <div className="module-grid">
            <section className="panel">
              <div className="panel-h"><h3>Ventas por hora</h3></div>
              {resumen.ventasPorHora.length === 0 ? (
                <div className="empty empty-compact">
                  <div className="e-ic"><ChartIcon /></div>
                  <h3>Sin desglose horario</h3>
                  <p>El backend actual no devuelve ventas por hora.</p>
                </div>
              ) : (
                <div className="bars">
                  {(() => {
                    const max = Math.max(...resumen.ventasPorHora.map((y) => y.total)) || 1;
                    return resumen.ventasPorHora.map((item) => {
                      const peak = item.total === max && item.total > 0;
                      return (
                        <div key={item.hora} className="bar-col" title={`${item.hora} · S/ ${item.total.toFixed(2)}`}>
                          <div className="bar" style={{ height: `${Math.max(8, (item.total / max) * 100)}%`, background: peak ? 'var(--accent)' : 'var(--accent-soft)' }} />
                          <span className="bar-lbl">{item.hora}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </section>

            <RankingPanel titulo="Top platos" hint="Carta/Menú: cocina y barra" items={resumen.topPlatos} />
            <RankingPanel titulo="Top productos" hint="Inventario: se sirven directo, sin preparación" items={resumen.topProductos} />

            <section className="panel">
              <div className="panel-h"><h3>Productos menos vendidos</h3></div>
              {resumen.productosMenosVendidos.length === 0 ? (
                <div className="empty empty-compact">
                  <div className="e-ic"><ListIcon /></div>
                  <h3>Sin datos</h3>
                  <p>Aún no hay ventas registradas en el rango para calcular esto.</p>
                </div>
              ) : (
                <div className="table-wrap table-wrap-flat">
                  <table className="dt">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="col-mobile-hidden">Cantidad</th>
                        <th>Ingresos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.productosMenosVendidos.map((item) => (
                        <tr key={item.productoId ?? item.nombre}>
                          <td><strong>{item.nombre}</strong></td>
                          <td className="col-mobile-hidden">{item.cantidad}</td>
                          <td>{item.ingresos == null ? 'Sin dato' : `S/ ${item.ingresos.toFixed(2)}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function RankingPanel({ titulo, hint, items }: Readonly<{ titulo: string; hint: string; items: RankingProducto }>) {
  return (
    <section className="panel">
      <div className="panel-h"><h3>{titulo}</h3></div>
      {items.length === 0 ? (
        <div className="empty empty-compact">
          <div className="e-ic"><ListIcon /></div>
          <h3>Sin {titulo.toLowerCase()}</h3>
          <p>Sin ventas registradas en el rango para este ranking. {hint}.</p>
        </div>
      ) : (
        <div className="table-wrap table-wrap-flat">
          <table className="dt">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="col-mobile-hidden">Cantidad</th>
                <th>Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.productoId ?? item.nombre}>
                  <td><strong>{item.nombre}</strong></td>
                  <td className="col-mobile-hidden">{item.cantidad}</td>
                  <td>{item.ingresos == null ? 'Sin dato' : `S/ ${item.ingresos.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AlertIcon() {
  return <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
}

function DownloadIcon() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>;
}

function ChartIcon() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m19 9-5 5-4-4-3 3" /></svg>;
}

function ListIcon() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>;
}

function RefreshIcon() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>;
}
