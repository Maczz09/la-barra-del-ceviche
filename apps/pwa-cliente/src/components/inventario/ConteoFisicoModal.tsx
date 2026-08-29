/* eslint-disable @typescript-eslint/no-misused-promises */
// components/inventario/ConteoFisicoModal.tsx — T-50. Cierra el cuadre: se
// vuelve del almacén con el PDF lleno a mano y acá se transcribe lo contado.
//
// Los insumos que se dejan en blanco NO se tocan (no es lo mismo "conté 0" que
// "no lo conté"): solo viajan al backend los que tienen un número escrito.

import { useMemo, useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { InsumoVM } from '../../types/compras.types';

interface Props {
  insumos: InsumoVM[];
  saving: boolean;
  onClose: () => void;
  onSave: (items: { insumoId: string; stockContado: number }[], observacion: string) => void;
}

export function ConteoFisicoModal({ insumos, saving, onClose, onSave }: Readonly<Props>) {
  const [contados, setContados] = useState<Record<string, string>>({});
  const [observacion, setObservacion] = useState('');

  const filas = useMemo(
    () =>
      insumos.map((insumo) => {
        const crudo = contados[insumo.id];
        const contado = crudo === undefined || crudo.trim() === '' ? null : Number(crudo);
        const valido = contado !== null && Number.isFinite(contado) && contado >= 0;
        if (!valido || contado === null) return { insumo, contado: null, diferencia: null };
        return {
          insumo,
          contado,
          diferencia: Math.round((contado - insumo.stockActual) * 1000) / 1000,
        };
      }),
    [insumos, contados],
  );

  const items = filas
    .filter((f): f is typeof f & { contado: number } => f.contado !== null)
    .map((f) => ({ insumoId: f.insumo.id, stockContado: f.contado }));

  const conDiferencia = filas.filter((f) => f.diferencia !== null && f.diferencia !== 0).length;

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal modal-lg" aria-modal="true" aria-label="Registrar conteo físico" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <div>
            <h3 style={{ fontSize: 18 }}>Conteo físico</h3>
            <div className="sub">Escribe lo que contaste; lo que dejes vacío no se toca</div>
          </div>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>

        <div style={{ padding: '4px 20px 20px' }}>
          <div className="table-wrap table-wrap-flat" style={{ maxHeight: '46vh', overflowY: 'auto', marginBottom: 14 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th className="num">Sistema</th>
                  <th>Contado</th>
                  <th className="num">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ insumo, diferencia }) => (
                  <tr key={insumo.id}>
                    <td>
                      <strong>{insumo.nombre}</strong>
                      <div className="muted">{insumo.unidad}</div>
                    </td>
                    <td className="num mono">{insumo.stockActual}</td>
                    <td>
                      <div className="input">
                        <input
                          value={contados[insumo.id] ?? ''}
                          onChange={(e) =>
                            setContados((prev) => ({ ...prev, [insumo.id]: e.target.value.replace(/[^\d.]/g, '') }))
                          }
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`Stock contado de ${insumo.nombre}`}
                        />
                      </div>
                    </td>
                    <td className="num mono">
                      {diferencia === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span style={{ color: diferencia === 0 ? 'var(--ok)' : 'var(--danger)' }}>
                          {diferencia > 0 ? `+${diferencia}` : diferencia}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="conteo-obs">Observación (opcional)</label>
            <div className="input">
              <input
                id="conteo-obs"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Ej. Conteo de fin de mes"
              />
            </div>
          </div>

          <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
            <span className="muted">
              {items.length} insumos contados · {conDiferencia} con diferencia
            </span>
          </div>

          <button
            className="btn btn-primary btn-block"
            disabled={items.length === 0 || saving}
            onClick={() => onSave(items, observacion.trim())}
          >
            {saving ? <span className="spinner" /> : <Icons.Check s={15} />} Registrar conteo
          </button>
        </div>
      </dialog>
    </div>
  );
}
