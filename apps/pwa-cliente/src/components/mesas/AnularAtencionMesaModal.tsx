/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/mesas/AnularAtencionMesaModal.tsx — CU-02: el cliente
// abandona/desiste la mesa antes de terminar su atención. Los platos de
// Cocina/Barra se resuelven solos (cancelación limpia o merma según ya
// hayan salido); solo los productos de Inventario (nacen ENTREGADO aunque
// nunca se hayan abierto) necesitan que el cajero confirme cuáles sí se
// consumieron — esos quedan pendientes de cobro, el resto se cancela y
// recupera su stock.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { PedidoItemVM } from '../../types/pedido.types';

interface Props {
  mesaNumero: string;
  items: PedidoItemVM[];
  saving: boolean;
  onClose: () => void;
  onConfirm: (motivo: string, itemsConsumidos: string[]) => void;
}

const NO_APLICA = new Set(['CANCELADO', 'RECHAZADO_SIN_STOCK']);

export function AnularAtencionMesaModal({ mesaNumero, items, saving, onClose, onConfirm }: Readonly<Props>) {
  const [motivo, setMotivo] = useState('');
  const [consumidos, setConsumidos] = useState<Set<string>>(new Set());

  const activos = items.filter((it) => !NO_APLICA.has(it.estado));
  const directos = activos.filter((it) => it.area === 'DIRECTO');
  const produccion = activos.filter((it) => it.area !== 'DIRECTO');

  const toggle = (itemId: string) => {
    setConsumidos((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  // Antes exigía activos.length > 0 — pero eso deshabilitaba este botón
  // justo en el caso que existe para resolver: una mesa cuyos ítems ya
  // quedaron todos anulados uno por uno (o por una falla previa) y se quedó
  // "ocupada" sin nada que cancelar. El backend ya tolera este caso
  // (autocorrige el pedido/cuenta en vez de rechazar) — el único requisito
  // real es que haya algo que limpiar, no que quede "activo".
  const valido = motivo.trim() !== '' && items.length > 0;

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Anular atención de mesa" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Anular atención · Mesa {mesaNumero}</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          {activos.length === 0 ? (
            <div className="muted" style={{ marginBottom: 14 }}>
              No hay ítems activos que anular — todos ya están anulados o rechazados. Confirma para liberar la mesa.
            </div>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
                Usa esto cuando el cliente desiste o abandona la mesa. Los platos de cocina/barra se resuelven solos
                (se cancelan si no salieron, o quedan como pérdida si ya se sirvieron). Confirma abajo qué productos
                de inventario sí llegaron a abrirse — el resto se cancela y recupera su stock.
              </div>

              {directos.length > 0 && (
                <div className="field" style={{ marginBottom: 14 }}>
                  <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                    ¿Se llegaron a abrir/consumir?
                  </div>
                  <div className="panel" style={{ padding: '4px 14px' }}>
                    {directos.map((it) => (
                      <label key={it.id} className="dish-line" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={consumidos.has(it.id)}
                          onChange={() => toggle(it.id)}
                          style={{ marginRight: 8 }}
                        />
                        <span className="dish-q">{it.cantidad}</span>
                        <span style={{ flex: 1, fontWeight: 600 }}>{it.nombre}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {produccion.length > 0 && (
                <div className="field" style={{ marginBottom: 14 }}>
                  <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                    Cocina/Barra (se resuelven automáticamente)
                  </div>
                  <div className="panel" style={{ padding: '4px 14px' }}>
                    {produccion.map((it) => (
                      <div className="dish-line" key={it.id}>
                        <span className="dish-q">{it.cantidad}</span>
                        <span style={{ flex: 1 }}>{it.nombre}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{it.estado === 'ENTREGADO' ? 'Ya servido → pérdida' : 'Se cancela'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="anular-mesa-motivo">Motivo</label>
            <div className="input">
              <textarea
                id="anular-mesa-motivo"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. El cliente se retiró sin avisar"
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            disabled={!valido || saving}
            onClick={() => onConfirm(motivo.trim(), Array.from(consumidos))}
          >
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Alert s={15} />} Anular atención de mesa
          </button>
        </div>
      </dialog>
    </div>
  );
}
