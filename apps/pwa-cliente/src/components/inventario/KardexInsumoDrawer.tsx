// components/inventario/KardexInsumoDrawer.tsx — T-50. Historial de movimientos
// de un insumo. Muestra `stockAntes → stockDespues` de cada fila para que se
// pueda seguir el saldo hacia atrás y encontrar dónde se rompió el cuadre.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import { useKardexInsumoQuery } from '../../hooks/queries/useMovimientosInsumoQuery';
import { MovimientoDetalleModal } from './MovimientoDetalleModal';
import type { InsumoVM, MovimientoInsumoVM } from '../../types/compras.types';

interface Props {
  insumo: InsumoVM;
  onClose: () => void;
}

export function KardexInsumoDrawer({ insumo, onClose }: Readonly<Props>) {
  const { movimientos, loading, error } = useKardexInsumoQuery(insumo.id, { limit: 100 });
  const [detalle, setDetalle] = useState<MovimientoInsumoVM | null>(null);

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <div>
            <h3 style={{ fontSize: 17 }}>{insumo.nombre}</h3>
            <div className="sub">Kardex · stock actual {insumo.stockActual} {insumo.unidad}</div>
          </div>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>

        <div className="drawer-body">
          {error && (
            <div className="banner err" role="alert">
              <Icons.Alert s={17} />
              <span>{error}</span>
            </div>
          )}

          {loading && <div className="muted" style={{ padding: 16 }}>Cargando movimientos…</div>}

          {!loading && movimientos.length === 0 && (
            <div className="empty">
              <div className="e-ic"><Icons.Note s={24} /></div>
              <h3>Sin movimientos</h3>
              <p>Este insumo todavía no registra entradas ni salidas.</p>
            </div>
          )}

          {!loading && movimientos.length > 0 && (
            <div className="table-wrap table-wrap-flat">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Movimiento</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Saldo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.fechaLabel}</td>
                      <td>
                        <span className={`badge ${m.tipoClass}`}>{m.tipoLabel}</span>
                        {m.motivo && <div className="muted">{m.motivo}</div>}
                        {m.usuarioNombre && <div className="muted">Por {m.usuarioNombre}</div>}
                      </td>
                      <td className="num">
                        <span className="mono" style={{ color: m.esSalida ? 'var(--danger)' : 'var(--ok)' }}>
                          {m.deltaLabel}
                        </span>
                        <div className="muted">{m.costoTotalLabel}</div>
                      </td>
                      <td className="num mono">
                        {m.stockAntes} → <strong>{m.stockDespues}</strong>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setDetalle(m)}
                          aria-label={`Ver detalle del movimiento de ${m.fechaLabel}`}
                        >
                          <Icons.Eye s={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </aside>

      {detalle && <MovimientoDetalleModal movimiento={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}
