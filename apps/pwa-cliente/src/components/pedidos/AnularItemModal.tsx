/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/pedidos/AnularItemModal.tsx — modal único para anular un ítem,
// tanto si aún no se preparó (Caso A: cancelación limpia, sin cobro) como si
// ya salió de cocina/barra (Caso B / CU-01: decide si igual se cobra). El
// motivo es obligatorio en ambos casos — nunca "un clic y listo" — con
// atajos para los motivos más comunes y un campo libre para cualquier otro.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { PedidoItemVM } from '../../types/pedido.types';

const MOTIVOS_RAPIDOS = [
  'Mala digitación',
  'Cliente se equivocó al pedir',
  'Cliente cambió de opinión',
  'Demora excesiva',
];

interface Props {
  item: PedidoItemVM;
  saving: boolean;
  onClose: () => void;
  onConfirm: (motivo: string, cobrar: boolean, observacion?: string) => void;
}

export function AnularItemModal({ item, saving, onClose, onConfirm }: Readonly<Props>) {
  const yaPreparado = item.estado === 'ENTREGADO';
  const [motivo, setMotivo] = useState('');
  const [cobrar, setCobrar] = useState<boolean | null>(null);
  const [observacion, setObservacion] = useState('');

  const valido = motivo.trim() !== '' && (!yaPreparado || cobrar !== null);

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Anular ítem" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Anular ítem</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          <div className="muted" style={{ marginBottom: 14 }}>
            <strong>{item.cantidad}× {item.nombre}</strong>
            {yaPreparado && ` ya salió de ${item.area === 'BAR' ? 'barra' : 'cocina'} — se registrará como pérdida (merma) sin importar la decisión de cobro.`}
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="anular-item-motivo">Motivo</label>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
              {MOTIVOS_RAPIDOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip ${motivo === m ? 'on' : ''}`}
                  onClick={() => setMotivo(m)}
                >
                  {m}
                </button>
              ))}
              <button
                type="button"
                className={`chip ${motivo !== '' && !MOTIVOS_RAPIDOS.includes(motivo) ? 'on' : ''}`}
                onClick={() => setMotivo('')}
              >
                Otro
              </button>
            </div>
            <div className="input">
              <textarea
                id="anular-item-motivo"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Escribe el motivo si no aplica ninguno de arriba"
                autoFocus
              />
            </div>
          </div>

          {yaPreparado && (
            <div className="field" style={{ marginBottom: 14 }}>
              <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                ¿Se cobra al cliente?
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <button
                  type="button"
                  className={`panel ${cobrar === true ? 'sel-option' : ''}`}
                  style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', border: cobrar === true ? '2px solid var(--accent)' : undefined }}
                  onClick={() => setCobrar(true)}
                >
                  <b>Sí, mantener en la cuenta</b>
                  <div className="muted" style={{ fontSize: 13 }}>El ítem sigue cobrándose normal; solo se registra la pérdida.</div>
                </button>
                <button
                  type="button"
                  className={`panel ${cobrar === false ? 'sel-option' : ''}`}
                  style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', border: cobrar === false ? '2px solid var(--accent)' : undefined }}
                  onClick={() => setCobrar(false)}
                >
                  <b>No, retirar de la cuenta</b>
                  <div className="muted" style={{ fontSize: 13 }}>El ítem se descuenta del total a pagar.</div>
                </button>
              </div>
            </div>
          )}

          {yaPreparado && (
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="anular-item-observacion">Observación (opcional)</label>
              <div className="input">
                <textarea id="anular-item-observacion" rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
              </div>
            </div>
          )}

          <button
            className="btn btn-danger btn-block"
            disabled={!valido || saving}
            onClick={() => onConfirm(motivo.trim(), cobrar === true, observacion.trim() || undefined)}
          >
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Alert s={15} />}
            {yaPreparado ? 'Confirmar anulación' : 'Anular ítem'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
