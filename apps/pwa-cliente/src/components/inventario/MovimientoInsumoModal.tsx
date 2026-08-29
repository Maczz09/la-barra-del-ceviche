/* eslint-disable @typescript-eslint/no-misused-promises */
// components/inventario/MovimientoInsumoModal.tsx — T-50. Registrar una salida
// del almacén de cocina (consumo o merma) o la devolución de algo que no se usó.
//
// Es la pantalla que usa la cocina a diario, parada frente a la despensa: por
// eso el tipo se elige con botones grandes y el foco arranca en la cantidad.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import { MovimientoInsumoTipo } from '../../types/compras.types';
import type { InsumoVM, MovimientoInsumoTipoManual as TipoMovimiento } from '../../types/compras.types';

interface Props {
  insumo: InsumoVM;
  saving: boolean;
  /** Con qué tipo abre. El botón "+ Stock" de la tabla entra directo en Ingreso. */
  tipoInicial?: TipoMovimiento;
  onClose: () => void;
  onSave: (tipo: TipoMovimiento, cantidad: number, motivo: string) => void;
}

const OPCIONES: { tipo: TipoMovimiento; label: string; ayuda: string; resta: boolean }[] = [
  { tipo: MovimientoInsumoTipo.EntradaManual, label: 'Ingreso', ayuda: 'Entró mercadería: la compra del día, sin orden de compra detrás.', resta: false },
  { tipo: MovimientoInsumoTipo.SalidaConsumo, label: 'Consumo', ayuda: 'Se sacó del almacén para cocinar.', resta: true },
  { tipo: MovimientoInsumoTipo.SalidaMerma, label: 'Merma', ayuda: 'Se malogró, se venció o se derramó.', resta: true },
  { tipo: MovimientoInsumoTipo.EntradaDevolucion, label: 'Devolución', ayuda: 'Vuelve al almacén algo que no se usó.', resta: false },
];

export function MovimientoInsumoModal({ insumo, saving, tipoInicial, onClose, onSave }: Readonly<Props>) {
  const [tipo, setTipo] = useState<TipoMovimiento>(tipoInicial ?? MovimientoInsumoTipo.SalidaConsumo);
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');

  const opcion = OPCIONES.find((o) => o.tipo === tipo) as (typeof OPCIONES)[number];
  const cant = Number(cantidad);
  const cantidadValida = Number.isFinite(cant) && cant > 0;
  const excedeStock = opcion.resta && cantidadValida && cant > insumo.stockActual;
  // La merma exige motivo (hay que explicar la pérdida, igual que en Inventario);
  // el consumo de todos los días no, o nadie lo registraría.
  const motivoRequerido = tipo === MovimientoInsumoTipo.SalidaMerma;
  const valido = cantidadValida && !excedeStock && (!motivoRequerido || motivo.trim() !== '');

  const stockResultante = cantidadValida
    ? Math.round((insumo.stockActual + (opcion.resta ? -cant : cant)) * 1000) / 1000
    : insumo.stockActual;

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Registrar movimiento de almacén" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Movimiento de almacén</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>

        <div style={{ padding: '4px 20px 20px' }}>
          <div className="muted" style={{ marginBottom: 14 }}>
            <strong>{insumo.nombre}</strong> · stock actual:{' '}
            <span className="mono">{insumo.stockActual} {insumo.unidad}</span>
          </div>

          <fieldset className="field" style={{ marginBottom: 12, border: 0, padding: 0 }}>
            <legend style={{ marginBottom: 8 }}>Tipo de movimiento</legend>
            <div className="seg sm" style={{ width: '100%' }}>
              {OPCIONES.map((o) => (
                <button
                  key={o.tipo}
                  type="button"
                  className={tipo === o.tipo ? 'on' : ''}
                  aria-pressed={tipo === o.tipo}
                  onClick={() => setTipo(o.tipo)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 8 }}>{opcion.ayuda}</div>
          </fieldset>

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="mov-cantidad">Cantidad ({insumo.unidad})</label>
            <div className="input">
              <input
                id="mov-cantidad"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder={`Ej. 2.5`}
                autoFocus
              />
            </div>
            {excedeStock && (
              <div className="hint" style={{ color: 'var(--danger)' }}>
                No puedes descargar más de lo que hay ({insumo.stockActual} {insumo.unidad}).
              </div>
            )}
            {cantidadValida && !excedeStock && (
              <div className="hint">
                Queda: <span className="mono">{stockResultante} {insumo.unidad}</span>
                {stockResultante <= insumo.stockMinimo && ' · por debajo del mínimo'}
              </div>
            )}
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="mov-motivo">Motivo{motivoRequerido ? '' : ' (opcional)'}</label>
            <div className="input">
              <textarea
                id="mov-motivo"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={motivoRequerido ? 'Ej. Se cortó la leche en la refrigeradora' : 'Ej. Menú del día'}
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            disabled={!valido || saving}
            onClick={() => onSave(tipo, cant, motivo.trim())}
          >
            {saving ? <span className="spinner" /> : <Icons.Check s={15} />} Registrar movimiento
          </button>
        </div>
      </dialog>
    </div>
  );
}
