/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/admin/EditarAnulacionModal.tsx — CU-05 (Update): solo
// motivo/observación son editables — monto/cobrado/producto quedan
// congelados a propósito, para no permitir maquillar cifras que ya
// afectaron caja/inventario.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { AnulacionAuditoriaVM } from '../../types/pedido.types';

interface Props {
  anulacion: AnulacionAuditoriaVM;
  saving: boolean;
  onClose: () => void;
  onSave: (motivo: string, observacion: string) => void;
}

export function EditarAnulacionModal({ anulacion, saving, onClose, onSave }: Readonly<Props>) {
  const [motivo, setMotivo] = useState(anulacion.motivo);
  const [observacion, setObservacion] = useState(anulacion.observacion ?? '');
  const valido = motivo.trim() !== '';

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Editar anulación" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Editar anulación</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
            Solo se puede corregir el motivo/observación — el monto y la decisión de cobro quedan fijos para preservar
            la integridad contable del registro.
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="editar-anulacion-motivo">Motivo</label>
            <div className="input">
              <textarea id="editar-anulacion-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="editar-anulacion-observacion">Observación (opcional)</label>
            <div className="input">
              <textarea id="editar-anulacion-observacion" rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </div>
          </div>

          <button className="btn btn-primary btn-block" disabled={!valido || saving} onClick={() => onSave(motivo.trim(), observacion.trim())}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Check s={15} />} Guardar cambios
          </button>
        </div>
      </dialog>
    </div>
  );
}
