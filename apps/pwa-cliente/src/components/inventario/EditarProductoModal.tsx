/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/inventario/EditarProductoModal.tsx — edita nombre/categoría/
// descripción/precio de un producto de Inventario ya existente (ej. cuando
// cambia el precio de compra). El stock NO se edita acá: tiene su propio
// flujo con auditoría (Reponer / Merma en ProductoTable) — ActualizarProductoCommand
// ni siquiera acepta stockActual (libs/contracts/src/domains/inventario.ts).

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { ActualizarProductoPayload, ProductoVM } from '../../types/inventario.types';

interface CategoriaItem {
  id: string;
  nombre: string;
}

interface Props {
  producto: ProductoVM;
  categorias: CategoriaItem[];
  saving: boolean;
  online: boolean;
  onClose: () => void;
  onSave: (payload: ActualizarProductoPayload) => void;
}

export function EditarProductoModal({ producto, categorias, saving, online, onClose, onSave }: Readonly<Props>) {
  const [categoriaId, setCategoriaId] = useState(producto.categoriaId);
  const [nombre, setNombre] = useState(producto.nombre);
  const [descripcion, setDescripcion] = useState(producto.descripcion ?? '');
  const [precio, setPrecio] = useState(String(producto.precio));

  const precioNum = Number(precio);
  const valido = nombre.trim() !== '' && categoriaId !== '' && Number.isFinite(precioNum) && precioNum >= 0;

  const guardar = () => {
    if (!valido) return;
    onSave({
      categoriaId,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      precio: precioNum,
    });
  };

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Editar producto" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Editar producto</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="editar-prod-cat">Categoría</label>
            <div className="input">
              <select id="editar-prod-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="editar-prod-nombre">Nombre</label>
            <div className="input">
              <input id="editar-prod-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="editar-prod-desc">Descripción</label>
            <div className="input">
              <textarea id="editar-prod-desc" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="editar-prod-precio">Precio</label>
            <div className="input">
              <input
                id="editar-prod-precio"
                min="0"
                step="0.01"
                type="number"
                inputMode="decimal"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
              />
            </div>
          </div>

          <button className="btn btn-primary btn-block" disabled={!valido || saving || !online} onClick={guardar}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Check s={15} />} Guardar cambios
          </button>
        </div>
      </dialog>
    </div>
  );
}
