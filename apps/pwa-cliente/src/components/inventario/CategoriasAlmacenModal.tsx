/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/inventario/CategoriasAlmacenModal.tsx — T-50. CRUD de las
// categorías del almacén de cocina.
//
// Son propias del almacén (Abarrotes, Carnes, Limpieza, Gas): no se reutilizan
// las de la carta, que responden a cómo se le muestra el menú al cliente.
// Borrar una NO borra sus insumos: quedan sin categoría (FK SetNull), y el
// backend responde cuántos se soltaron para poder decirlo.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { CategoriaInsumoDto } from '../../types/compras.types';

interface Props {
  categorias: CategoriaInsumoDto[];
  loading: boolean;
  saving: boolean;
  online: boolean;
  onClose: () => void;
  onCrear: (nombre: string, descripcion?: string) => Promise<unknown>;
  onRenombrar: (id: string, nombre: string) => Promise<unknown>;
  onEliminar: (id: string) => Promise<unknown>;
}

export function CategoriasAlmacenModal({
  categorias, loading, saving, online, onClose, onCrear, onRenombrar, onEliminar,
}: Readonly<Props>) {
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const crear = async () => {
    if (!nuevoNombre.trim() || saving) return;
    await onCrear(nuevoNombre.trim());
    setNuevoNombre('');
  };

  const guardarNombre = async (id: string) => {
    if (!nombreEditado.trim() || saving) return;
    await onRenombrar(id, nombreEditado.trim());
    setEditandoId(null);
  };

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Categorías del almacén" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <div>
            <h3 style={{ fontSize: 18 }}>Categorías del almacén</h3>
            <div className="sub">Cómo se agrupa la despensa, aparte de la carta</div>
          </div>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>

        <div style={{ padding: '4px 20px 20px' }}>
          <div className="row" style={{ gap: 8, marginBottom: 16 }}>
            <div className="input" style={{ flex: 1 }}>
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Ej. Abarrotes"
                aria-label="Nombre de la nueva categoría"
                onKeyDown={(e) => { if (e.key === 'Enter') crear(); }}
              />
            </div>
            <button className="btn btn-primary" disabled={!nuevoNombre.trim() || saving || !online} onClick={crear}>
              <Icons.Plus s={15} /> Agregar
            </button>
          </div>

          {loading && <div className="muted">Cargando categorías…</div>}

          {!loading && categorias.length === 0 && (
            <div className="muted">
              Todavía no hay categorías. Crea las que uses de verdad en la despensa:
              Abarrotes, Carnes, Verduras, Limpieza, Gas…
            </div>
          )}

          {!loading && categorias.length > 0 && (
            <div style={{ display: 'grid', gap: 6, maxHeight: '46vh', overflowY: 'auto' }}>
              {categorias.map((c) => (
                <div key={c.id} className="row" style={{ gap: 8, alignItems: 'center', padding: '6px 0' }}>
                  {editandoId === c.id ? (
                    <>
                      <div className="input" style={{ flex: 1 }}>
                        <input
                          value={nombreEditado}
                          onChange={(e) => setNombreEditado(e.target.value)}
                          aria-label={`Nuevo nombre de ${c.nombre}`}
                          onKeyDown={(e) => { if (e.key === 'Enter') guardarNombre(c.id); }}
                        />
                      </div>
                      <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => guardarNombre(c.id)}>
                        Guardar
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditandoId(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <strong>{c.nombre}</strong>
                        <div className="muted">
                          {c.insumosCount === 0 ? 'sin insumos' : `${c.insumosCount ?? 0} insumos`}
                        </div>
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={!online}
                        onClick={() => { setEditandoId(c.id); setNombreEditado(c.nombre); setConfirmandoId(null); }}
                        aria-label={`Renombrar ${c.nombre}`}
                      >
                        <Icons.Edit s={14} />
                      </button>
                      {confirmandoId === c.id ? (
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={saving}
                          onClick={() => { onEliminar(c.id); setConfirmandoId(null); }}
                        >
                          {(c.insumosCount ?? 0) > 0 ? `¿Soltar ${c.insumosCount} insumos?` : '¿Seguro?'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm btn-ghost"
                          disabled={!online}
                          onClick={() => setConfirmandoId(c.id)}
                          aria-label={`Eliminar ${c.nombre}`}
                        >
                          <Icons.Close s={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="hint" style={{ marginTop: 14 }}>
            Eliminar una categoría no borra sus insumos: quedan «sin categoría» y siguen en el almacén.
          </div>
        </div>
      </dialog>
    </div>
  );
}
