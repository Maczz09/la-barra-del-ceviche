// screens/inicio/TopProductosPanel.tsx — "Top productos" del dashboard de
// Inicio, con filtro por período (día/semana/mes/trimestre/año/todo y
// temporadas). Consulta el mismo endpoint de reportes que la pantalla de
// Reportes (arbitrary desde/hasta), solo que aquí se ofrecen presets en vez
// de un selector de fechas libre.

import { useMemo, useState } from 'react';
import { useReportesQuery } from '../../hooks/queries/useReportesQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { fmt } from '../../utils/format';
import { PERIODOS_TOP, rangoDePeriodo, type PeriodoTop } from '../../utils/periodos';

export function TopProductosPanel() {
  const [periodo, setPeriodo] = useState<PeriodoTop>('dia');
  const { sede } = useSedeActualQuery();

  const { desde, hasta } = useMemo(() => rangoDePeriodo(periodo), [periodo]);
  const { resumen, loading } = useReportesQuery({ desde, hasta, sedeId: sede?.id });
  const topProductos = resumen?.topProductos ?? [];

  const periodoLabel = PERIODOS_TOP.find((p) => p.value === periodo)?.label ?? 'Hoy';

  return (
    <section className="panel">
      <div className="panel-h"><h3>Top productos</h3></div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', padding: '0 16px 12px' }} role="group" aria-label="Filtrar top productos por período">
        {PERIODOS_TOP.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`chip ${periodo === p.value ? 'on' : ''}`}
            onClick={() => setPeriodo(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="top-prod-table table-wrap table-wrap-flat">
        <table className="dt">
          <thead><tr><th>Producto</th><th>Vendidos</th><th style={{ textAlign: 'right' }}>Ingresos</th></tr></thead>
          <tbody>
            {loading && topProductos.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 20 }} className="muted">Cargando…</td></tr>
            ) : topProductos.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 20 }} className="muted">Sin ventas en este período ({periodoLabel.toLowerCase()}).</td></tr>
            ) : topProductos.map((p, i) => (
              <tr key={p.productoId ?? p.nombre}>
                <td><div className="row" style={{ gap: 10 }}><span className="dish-q" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>{i + 1}</span><strong>{p.nombre}</strong></div></td>
                <td><span className="mono">{p.cantidad}</span></td>
                <td style={{ textAlign: 'right' }} className="mono"><strong>{fmt(p.ingresos ?? 0)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="top-prod-list">
        {loading && topProductos.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: 20 }}>Cargando…</div>
        ) : topProductos.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin ventas en este período ({periodoLabel.toLowerCase()}).</div>
        ) : topProductos.map((p, i) => (
          <div className="top-prod-item" key={p.productoId ?? p.nombre}>
            <span className="tp-rank">{i + 1}</span>
            <span className="tp-nombre">{p.nombre}</span>
            <span className="tp-qty">{p.cantidad}</span>
            <span className="tp-amt">{fmt(p.ingresos ?? 0)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
