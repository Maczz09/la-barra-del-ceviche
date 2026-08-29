// components/inventario/MovimientoDetalleModal.tsx — T-50. Ficha completa de UN
// movimiento del kardex: quién, cuándo, cuánto, de dónde salió y contra qué
// saldo. Es la unidad mínima de evidencia cuando un cuadre no cierra.

import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { MovimientoInsumoVM } from '../../types/compras.types';

interface Props {
  movimiento: MovimientoInsumoVM;
  onClose: () => void;
}

function Fila({ etiqueta, children }: Readonly<{ etiqueta: string; children: React.ReactNode }>) {
  return (
    <div className="row" style={{ gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted" style={{ minWidth: 130 }}>{etiqueta}</span>
      <span style={{ flex: 1, textAlign: 'right' }}>{children}</span>
    </div>
  );
}

export function MovimientoDetalleModal({ movimiento, onClose }: Readonly<Props>) {
  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Detalle del movimiento" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <div>
            <h3 style={{ fontSize: 18 }}>Detalle del movimiento</h3>
            <div className="sub">{movimiento.insumoNombre}</div>
          </div>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>

        <div style={{ padding: '4px 20px 20px' }}>
          <Fila etiqueta="Tipo">
            <span className={`badge ${movimiento.tipoClass}`}>{movimiento.tipoLabel}</span>
          </Fila>
          <Fila etiqueta="Cantidad">
            <span className="mono" style={{ color: movimiento.esSalida ? 'var(--danger)' : 'var(--ok)', fontWeight: 700 }}>
              {movimiento.deltaLabel}
            </span>
          </Fila>
          <Fila etiqueta="Saldo antes"><span className="mono">{movimiento.stockAntes} {movimiento.unidad}</span></Fila>
          <Fila etiqueta="Saldo después"><span className="mono">{movimiento.stockDespues} {movimiento.unidad}</span></Fila>
          <Fila etiqueta="Costo unitario">
            <span className="mono">{movimiento.costoUnitario == null ? '—' : movimiento.costoUnitario}</span>
          </Fila>
          <Fila etiqueta="Valor del movimiento"><span className="mono">{movimiento.costoTotalLabel}</span></Fila>
          <Fila etiqueta="Fecha"><span className="mono">{movimiento.fechaLabel}</span></Fila>
          <Fila etiqueta="Registrado por">{movimiento.usuarioNombre ?? '—'}</Fila>
          <Fila etiqueta="Motivo">{movimiento.motivo ?? '—'}</Fila>
          {movimiento.observacion && <Fila etiqueta="Observación">{movimiento.observacion}</Fila>}
          {movimiento.recepcionId && (
            <Fila etiqueta="Recepción origen">
              <span className="mono" style={{ fontSize: 12 }}>{movimiento.recepcionId}</span>
            </Fila>
          )}
          <div className="hint" style={{ marginTop: 12 }}>
            Los movimientos no se editan ni se borran: para corregir uno, se registra el movimiento contrario
            o se cierra con un conteo físico.
          </div>
        </div>
      </dialog>
    </div>
  );
}
