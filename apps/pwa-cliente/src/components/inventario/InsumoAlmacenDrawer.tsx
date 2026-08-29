/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/inventario/InsumoAlmacenDrawer.tsx — T-50. Alta y edición de un
// insumo del almacén de cocina.
//
// El stock inicial solo se pide al CREAR: una vez que el insumo existe, el
// saldo se mueve por movimientos (ingreso, consumo, merma, conteo) para que el
// kardex cuadre. Editarlo a mano sería un cambio de stock sin rastro.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import { unidadesConValorActual, UNIDADES_COMPRA_GRUPOS } from '../../screens/compras/unidadesCompra';
import type {
  ActualizarInsumoPayload,
  CategoriaInsumoDto,
  CrearInsumoPayload,
  InsumoVM,
} from '../../types/compras.types';

interface Props {
  /** null = alta nueva. */
  insumo: InsumoVM | null;
  categorias: CategoriaInsumoDto[];
  saving: boolean;
  online: boolean;
  onClose: () => void;
  onCrear: (payload: CrearInsumoPayload) => Promise<unknown>;
  onActualizar: (id: string, payload: ActualizarInsumoPayload) => Promise<unknown>;
  onEliminar: (id: string) => Promise<unknown>;
}

export function InsumoAlmacenDrawer({
  insumo, categorias, saving, online, onClose, onCrear, onActualizar, onEliminar,
}: Readonly<Props>) {
  const esNuevo = !insumo;
  const [nombre, setNombre] = useState(insumo?.nombre ?? '');
  const [unidad, setUnidad] = useState(insumo?.unidad ?? 'kg');
  const [categoriaId, setCategoriaId] = useState(insumo?.categoriaId ?? '');
  const [stockInicial, setStockInicial] = useState('0');
  const [stockMinimo, setStockMinimo] = useState(insumo ? String(insumo.stockMinimo) : '0');
  const [costoUnitario, setCostoUnitario] = useState(insumo ? String(insumo.costoUnitario) : '0');
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  const opcionesUnidad = unidadesConValorActual(insumo?.unidad);
  const valido = nombre.trim() !== '' && unidad.trim() !== '' && online;

  const guardar = async () => {
    if (!valido || saving) return;
    if (esNuevo) {
      await onCrear({
        nombre: nombre.trim(),
        unidad: unidad.trim(),
        categoriaId: categoriaId || undefined,
        stockActual: Number(stockInicial) || 0,
        stockMinimo: Number(stockMinimo) || 0,
        costoUnitario: Number(costoUnitario) || 0,
      });
    } else {
      await onActualizar(insumo.id, {
        nombre: nombre.trim(),
        unidad: unidad.trim(),
        categoriaId: categoriaId || null,
        stockMinimo: Number(stockMinimo) || 0,
        costoUnitario: Number(costoUnitario) || 0,
      });
    }
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <div>
            <h3 style={{ fontSize: 17 }}>{esNuevo ? 'Nuevo insumo de almacén' : insumo.nombre}</h3>
            <div className="sub">{esNuevo ? 'Lo que se usa en cocina, no se vende' : 'Editar datos del insumo'}</div>
          </div>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>

        <div className="drawer-body" style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label htmlFor="ia-nombre">Nombre *</label>
            <div className="input">
              <input
                id="ia-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Arroz extra"
                autoFocus
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="ia-categoria">Categoría de almacén</label>
            <div className="input">
              <select id="ia-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            {categorias.length === 0 && (
              <div className="hint">Todavía no hay categorías de almacén. Créalas desde el botón «Categorías».</div>
            )}
          </div>

          <div className="field">
            <label htmlFor="ia-unidad">Unidad *</label>
            <div className="input">
              <select id="ia-unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                {UNIDADES_COMPRA_GRUPOS.map((grupo) => (
                  <optgroup key={grupo} label={grupo}>
                    {opcionesUnidad.filter((u) => u.grupo === grupo).map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="hint">En qué se mide y se descarga: kg, L, unidad, saco…</div>
          </div>

          {esNuevo && (
            <div className="field">
              <label htmlFor="ia-stock">Stock inicial</label>
              <div className="input">
                <input
                  id="ia-stock"
                  value={stockInicial}
                  onChange={(e) => setStockInicial(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                />
              </div>
              <div className="hint">Lo que ya hay hoy en la despensa.</div>
            </div>
          )}

          <div className="field">
            <label htmlFor="ia-minimo">Stock mínimo</label>
            <div className="input">
              <input
                id="ia-minimo"
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
              />
            </div>
            <div className="hint">Por debajo de esto el insumo se marca en rojo y avisa que hay que reponer.</div>
          </div>

          <div className="field">
            <label htmlFor="ia-costo">Costo por {unidad || 'unidad'}</label>
            <div className="input">
              <input
                id="ia-costo"
                value={costoUnitario}
                onChange={(e) => setCostoUnitario(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
              />
            </div>
            <div className="hint">Con esto se valoriza el almacén y se calcula lo que cuesta cada merma.</div>
          </div>

          {!esNuevo && (
            <div className="field">
              <label>Stock actual</label>
              <div className="muted">
                <span className="mono">{insumo.stockActual} {insumo.unidad}</span>
                {' · '}se cambia con movimientos (ingreso, consumo, merma o conteo), no editándolo acá
              </div>
            </div>
          )}
        </div>

        <div className="drawer-foot">
          <button className="btn btn-primary" disabled={!valido || saving} onClick={guardar}>
            {saving ? <span className="spinner" /> : <Icons.Check s={15} />}
            {esNuevo ? 'Crear insumo' : 'Guardar cambios'}
          </button>
          {!esNuevo && !confirmandoBorrado && (
            <button className="btn btn-ghost" disabled={saving || !online} onClick={() => setConfirmandoBorrado(true)}>
              Eliminar
            </button>
          )}
          {!esNuevo && confirmandoBorrado && (
            <button
              className="btn btn-danger"
              disabled={saving}
              onClick={() => onEliminar(insumo.id)}
            >
              ¿Seguro? Eliminar
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
