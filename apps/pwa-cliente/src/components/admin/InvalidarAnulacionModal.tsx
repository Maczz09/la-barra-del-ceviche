/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/admin/InvalidarAnulacionModal.tsx — CU-05 (Delete lógico): el
// registro NUNCA se borra físicamente (es evidencia de una pérdida/merma ya
// efectuada) — se marca INVÁLIDA con motivo, para que caja sepa que fue
// corregida sin perder el rastro.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { AnulacionAuditoriaVM } from '../../types/pedido.types';

interface Props {
  anulacion: AnulacionAuditoriaVM;
  saving: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}

export function InvalidarAnulacionModal({ anulacion, saving, onClose, onConfirm }: Readonly<Props>) {
  const [motivo, setMotivo] = useState('');
  const valido = motivo.trim().length >= 3;

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Invalidar anulación" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Invalidar anulación</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          <div className="banner warn" style={{ marginBottom: 14 }}>
            <Icons.Alert s={16} />
            <span>
              El registro de <strong>{anulacion.productoNombre ?? `Mesa ${anulacion.mesaNumero ?? '—'}`}</strong> ({anulacion.montoLabel})
              se marcará como inválida. No se borra — queda como evidencia corregida en caja.
            </span>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="invalidar-anulacion-motivo">Motivo de invalidación (obligatorio)</label>
            <div className="input">
              <textarea
                id="invalidar-anulacion-motivo"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Se corrigió en caja tras revisión"
                autoFocus
              />
            </div>
          </div>

          <button className="btn btn-danger btn-block" disabled={!valido || saving} onClick={() => onConfirm(motivo.trim())}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Lock s={15} />} Invalidar registro
          </button>
        </div>
      </dialog>
    </div>
  );
}
