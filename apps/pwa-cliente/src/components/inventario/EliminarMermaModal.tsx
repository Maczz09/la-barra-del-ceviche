/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/inventario/EliminarMermaModal.tsx — CU-04 (Delete): revierte una
// merma creada por error. Restaura el stock y exige justificación — nunca se
// borra en silencio algo que ya movió inventario.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { MermaVM } from '../../types/inventario.types';

interface Props {
  merma: MermaVM;
  saving: boolean;
  onClose: () => void;
  onConfirm: (justificacion: string) => void;
}

export function EliminarMermaModal({ merma, saving, onClose, onConfirm }: Readonly<Props>) {
  const [justificacion, setJustificacion] = useState('');
  const valido = justificacion.trim().length >= 3;

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Eliminar merma" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Eliminar merma</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          <div className="banner warn" style={{ marginBottom: 14 }}>
            <Icons.Alert s={16} />
            <span>
              Se eliminará el registro de <strong>{merma.cantidad}× {merma.productoNombre}</strong> y se restaurará el stock
              (si el producto lleva control). Esta acción queda igual auditada.
            </span>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="eliminar-merma-justificacion">Justificación (obligatoria)</label>
            <div className="input">
              <textarea
                id="eliminar-merma-justificacion"
                rows={2}
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                placeholder="Ej. Se registró por error, cantidad duplicada"
                autoFocus
              />
            </div>
          </div>

          <button className="btn btn-danger btn-block" disabled={!valido || saving} onClick={() => onConfirm(justificacion.trim())}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Alert s={15} />} Eliminar y restaurar stock
          </button>
        </div>
      </dialog>
    </div>
  );
}
