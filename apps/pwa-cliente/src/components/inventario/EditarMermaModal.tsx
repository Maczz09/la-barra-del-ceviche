/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/inventario/EditarMermaModal.tsx — CU-04 (Update): corrige
// cantidad/motivo/observación de una merma ya registrada. El backend
// recalcula el stock por la DIFERENCIA respecto al valor anterior.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { MermaVM } from '../../types/inventario.types';

interface Props {
  merma: MermaVM;
  saving: boolean;
  onClose: () => void;
  onSave: (cantidad: number, motivo: string, observacion: string) => void;
}

export function EditarMermaModal({ merma, saving, onClose, onSave }: Readonly<Props>) {
  const [cantidad, setCantidad] = useState(String(merma.cantidad));
  const [motivo, setMotivo] = useState(merma.motivo);
  const [observacion, setObservacion] = useState(merma.observacion ?? '');

  const cant = Number(cantidad || 0);
  const valido = Number.isInteger(cant) && cant > 0 && motivo.trim() !== '';

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Editar merma" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Editar merma</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          <div className="muted" style={{ marginBottom: 14 }}><strong>{merma.productoNombre}</strong></div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="editar-merma-cantidad">Cantidad</label>
            <div className="input">
              <input
                id="editar-merma-cantidad"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                autoFocus
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="editar-merma-motivo">Motivo</label>
            <div className="input">
              <textarea id="editar-merma-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="editar-merma-observacion">Observación (opcional)</label>
            <div className="input">
              <textarea id="editar-merma-observacion" rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </div>
          </div>

          <button className="btn btn-primary btn-block" disabled={!valido || saving} onClick={() => onSave(cant, motivo.trim(), observacion.trim())}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Check s={15} />} Guardar cambios
          </button>
        </div>
      </dialog>
    </div>
  );
}
