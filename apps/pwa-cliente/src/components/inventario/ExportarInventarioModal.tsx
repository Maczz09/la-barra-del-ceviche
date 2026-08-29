/* eslint-disable @typescript-eslint/no-misused-promises */
// components/inventario/ExportarInventarioModal.tsx — T-49. Elige QUÉ PDF se
// baja antes de generarlo: el papel para contar en el almacén, o el valorizado
// para archivar. Un único PDF fijo no cubría los dos usos.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { FormatoInventarioPdf } from '../../utils/inventarioPdf';

export type AlcanceInventarioPdf = 'todo' | 'filtrado';

export interface OpcionesExportacion {
  formato: FormatoInventarioPdf;
  alcance: AlcanceInventarioPdf;
  soloStockCritico: boolean;
}

interface Props {
  /** Resumen del filtro activo en pantalla ("Categoría: Abarrotes · Busca: gas").
   *  null = no hay filtro, así que la opción "solo lo filtrado" no aporta nada. */
  filtroActivo: string | null;
  generando: boolean;
  onClose: () => void;
  onExport: (opciones: OpcionesExportacion) => void;
}

export function ExportarInventarioModal({ filtroActivo, generando, onClose, onExport }: Readonly<Props>) {
  const [formato, setFormato] = useState<FormatoInventarioPdf>('cuadre');
  const [alcance, setAlcance] = useState<AlcanceInventarioPdf>('todo');
  const [soloStockCritico, setSoloStockCritico] = useState(false);

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Descargar inventario en PDF" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Descargar PDF</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>

        <div style={{ padding: '4px 20px 20px' }}>
          <fieldset className="field" style={{ marginBottom: 14, border: 0, padding: 0 }}>
            <legend style={{ marginBottom: 8 }}>Tipo de documento</legend>
            <div className="seg sm" style={{ width: '100%' }}>
              <button
                type="button"
                className={formato === 'cuadre' ? 'on' : ''}
                aria-pressed={formato === 'cuadre'}
                onClick={() => setFormato('cuadre')}
              >
                Cuadre físico
              </button>
              <button
                type="button"
                className={formato === 'valorizado' ? 'on' : ''}
                aria-pressed={formato === 'valorizado'}
                onClick={() => setFormato('valorizado')}
              >
                Valorizado
              </button>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              {formato === 'cuadre'
                ? 'Hoja para imprimir y llenar a mano: trae columnas en blanco para el stock contado, la diferencia y las firmas.'
                : 'Reporte con precio unitario y valor del stock, con totales por categoría.'}
            </div>
          </fieldset>

          {filtroActivo && (
            <fieldset className="field" style={{ marginBottom: 14, border: 0, padding: 0 }}>
              <legend style={{ marginBottom: 8 }}>Alcance</legend>
              <div className="seg sm" style={{ width: '100%' }}>
                <button
                  type="button"
                  className={alcance === 'todo' ? 'on' : ''}
                  aria-pressed={alcance === 'todo'}
                  onClick={() => setAlcance('todo')}
                >
                  Todo el inventario
                </button>
                <button
                  type="button"
                  className={alcance === 'filtrado' ? 'on' : ''}
                  aria-pressed={alcance === 'filtrado'}
                  onClick={() => setAlcance('filtrado')}
                >
                  Solo lo filtrado
                </button>
              </div>
              {alcance === 'filtrado' && <div className="hint" style={{ marginTop: 8 }}>{filtroActivo}</div>}
            </fieldset>
          )}

          <label className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 18, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={soloStockCritico}
              onChange={(e) => setSoloStockCritico(e.target.checked)}
            />
            <span>Solo productos con stock bajo o agotados</span>
          </label>

          <button
            className="btn btn-primary btn-block"
            disabled={generando}
            onClick={() => onExport({ formato, alcance, soloStockCritico })}
          >
            {generando ? <span className="spinner" /> : <Icons.Download s={15} />}
            {generando ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
