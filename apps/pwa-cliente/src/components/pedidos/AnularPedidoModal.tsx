/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/pedidos/AnularPedidoModal.tsx — anular UN pedido puntual desde
// el tablero de Pedidos (no toda la mesa, ver AnularAtencionMesaModal).
// Salvavidas operativo: pedido explícito tras un bug donde un pedido podía
// quedar atascado en el tablero — así el mesero/cajero lo puede sacar de la
// vista sin depender de un desarrollador con acceso a la base de datos.
// Mismo criterio por ítem que la anulación de mesa: Cocina/Barra se
// resuelven solos, solo Inventario (DIRECTO) necesita confirmar qué se
// llegó a abrir/consumir.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { PedidoItemVM } from '../../types/pedido.types';

interface Props {
  items: PedidoItemVM[];
  saving: boolean;
  onClose: () => void;
  onConfirm: (motivo: string, itemsConsumidos: string[]) => void;
}

const NO_APLICA = new Set(['CANCELADO', 'RECHAZADO_SIN_STOCK']);

export function AnularPedidoModal({ items, saving, onClose, onConfirm }: Readonly<Props>) {
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

  // `activos.length === 0` es válido a propósito: cubre el pedido huérfano
  // (todos sus ítems ya están anulados/rechazados de antes, pero el pedido
  // en sí quedó congelado sin pasar a CANCELADO) — el backend lo autocorrige
  // aunque no haya nada nuevo que cancelar.
  const valido = motivo.trim() !== '';

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Anular pedido" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Anular pedido</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          {activos.length === 0 ? (
            <div className="muted" style={{ marginBottom: 14 }}>
              Todos los ítems de este pedido ya están anulados o rechazados, pero el pedido sigue en el tablero.
              Al confirmar, se cierra directamente como anulado.
            </div>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
                Anula solo este pedido, no toda la mesa. Los platos de cocina/barra se resuelven solos (se cancelan
                si no salieron, o quedan como pérdida si ya se sirvieron). Confirma abajo qué productos de inventario
                sí llegaron a abrirse — el resto se cancela y recupera su stock.
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
            <label htmlFor="anular-pedido-motivo">Motivo</label>
            <div className="input">
              <textarea
                id="anular-pedido-motivo"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Pedido duplicado por error"
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            disabled={!valido || saving}
            onClick={() => onConfirm(motivo.trim(), Array.from(consumidos))}
          >
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Alert s={15} />} Anular pedido
          </button>
        </div>
      </dialog>
    </div>
  );
}
