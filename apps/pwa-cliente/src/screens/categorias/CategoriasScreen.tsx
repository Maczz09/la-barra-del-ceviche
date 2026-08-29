// screens/categorias/CategoriasScreen.tsx — Gestión de categorías
// Categorías son compartidas por Carta e Inventario (misma tabla, filtrada
// por control de stock) — un solo módulo de gestión para ambas.
// Soportan un nivel de subcategorías (parentId): una subcategoría no puede
// a su vez tener hijas — la misma regla que valida el backend.

import { useMemo, useState, type SubmitEvent } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';
import type { CategoriaDto } from '../../types/inventario.types';

const INITIAL_FORM = { nombre: '', descripcion: '', parentId: '', area: 'COCINA' as const };

// El dueño elige el área acá — nunca se infiere del nombre — así el ruteo de
// pedidos (qué pasa por Cocina/Barra y qué va directo a cuenta) es 100%
// escalable a cualquier nombre de categoría futuro.
const AREAS: { value: 'COCINA' | 'BARRA' | 'INVENTARIO'; label: string; hint: string }[] = [
  { value: 'COCINA', label: 'Carta · Cocina', hint: 'Platos que se preparan en cocina' },
  { value: 'BARRA', label: 'Carta · Barra', hint: 'Tragos/cócteles preparados en barra' },
  { value: 'INVENTARIO', label: 'Inventario', hint: 'Productos con stock, se sirven directo (sin preparación)' },
];
const AREA_LABEL: Record<string, string> = Object.fromEntries(AREAS.map((a) => [a.value, a.label]));

export function CategoriasScreen() {
  const online = useOnlineStatus();
  const {
    categorias,
    productos,
    loading,
    saving,
    error,
    success,
    fetch,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
    clearFeedback,
  // Necesita el catálogo completo: "Con productos" y el bloqueo de borrado se
  // calculan sobre `productos`, no solo la primera página.
  } = useInventarioQuery(undefined, { limit: 500 });

  const [form, setForm] = useState(INITIAL_FORM);
  const [edit, setEdit] = useState<CategoriaDto | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editParentId, setEditParentId] = useState('');
  const [editArea, setEditArea] = useState<'COCINA' | 'BARRA' | 'INVENTARIO'>('COCINA');

  const principales = useMemo(() => categorias.filter((c) => !c.parentId), [categorias]);
  const subcategoriasPorPadre = useMemo(() => {
    const mapa = new Map<string, CategoriaDto[]>();
    for (const c of categorias) {
      if (!c.parentId) continue;
      const lista = mapa.get(c.parentId) ?? [];
      lista.push(c);
      mapa.set(c.parentId, lista);
    }
    return mapa;
  }, [categorias]);

  // Orden jerárquico para la tabla: cada principal seguida de sus subcategorías.
  const categoriasOrdenadas = useMemo(() => {
    const out: { categoria: CategoriaDto; esSub: boolean }[] = [];
    for (const p of principales) {
      out.push({ categoria: p, esSub: false });
      for (const s of subcategoriasPorPadre.get(p.id) ?? []) {
        out.push({ categoria: s, esSub: true });
      }
    }
    return out;
  }, [principales, subcategoriasPorPadre]);

  const conteoPorCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of productos) {
      mapa.set(p.categoriaId, (mapa.get(p.categoriaId) ?? 0) + 1);
    }
    return mapa;
  }, [productos]);

  const kpis = useMemo(() => {
    const conProductos = categorias.filter((c) => (conteoPorCategoria.get(c.id) ?? 0) > 0).length;
    return {
      total: categorias.length,
      conProductos,
      vacias: categorias.length - conProductos,
    };
  }, [categorias, conteoPorCategoria]);

  const handleCrear = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!online) return;
    await crearCategoria({
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      parentId: form.parentId || undefined,
      area: form.area,
    });
    setForm(INITIAL_FORM);
  };

  const abrirEdicion = (categoria: CategoriaDto) => {
    setEdit(categoria);
    setEditNombre(categoria.nombre);
    setEditDescripcion(categoria.descripcion ?? '');
    setEditParentId(categoria.parentId ?? '');
    setEditArea(categoria.area);
  };

  const guardarEdicion = async () => {
    if (!edit) return;
    await actualizarCategoria(edit.id, {
      nombre: editNombre.trim(),
      descripcion: editDescripcion.trim() || null,
      parentId: editParentId || null,
      ...(editArea === edit.area ? {} : { area: editArea }),
    });
    setEdit(null);
  };

  const handleEliminar = async (categoria: CategoriaDto) => {
    if (!online) return;
    const cuenta = conteoPorCategoria.get(categoria.id) ?? 0;
    const subCuenta = (subcategoriasPorPadre.get(categoria.id) ?? []).length;
    if (cuenta > 0 || subCuenta > 0) {
      // El backend ya rechaza esto con 409, pero confirmar aquí evita el
      // viaje de red para el caso más común (categoría con productos o subcategorías).
      return;
    }
    if (!window.confirm(`¿Eliminar la categoría "${categoria.nombre}"?`)) return;
    await eliminarCategoria(categoria.id);
  };

  const editTieneSubcategorias = edit ? (subcategoriasPorPadre.get(edit.id) ?? []).length > 0 : false;
  // Al editar, las opciones de padre son las principales, sin incluirse a sí misma.
  const opcionesPadreEdicion = principales.filter((p) => p.id !== edit?.id);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Categorías</h1>
          <div className="sub">Categorías compartidas por Carta e Inventario</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => void fetch()} title="Refrescar" aria-label="Refrescar categorías">
          <Icons.Refresh s={16} />
        </button>
      </div>

      {!online && (
        <output className="banner warn module-feedback">
          <Icons.Alert s={17} />
          <span>Sin conexión. Las mutaciones están deshabilitadas.</span>
        </output>
      )}

      {(error || success) && (
        <div className={`banner ${error ? 'err' : 'ok'} module-feedback`} role="alert">
          {error ? <Icons.Alert s={17} /> : <Icons.Check s={16} />}
          <span>{error ?? success}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={clearFeedback}>Cerrar</button>
        </div>
      )}

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Tag" tint="accent" label="Categorías" value={kpis.total} />
        <StatKpi icon="Check" tint="ok" label="Con productos" value={kpis.conProductos} />
        <StatKpi icon="Alert" tint="muted" label="Vacías" value={kpis.vacias} />
      </div>

      <div className="module-grid">
        <section className="panel">
          <div className="panel-h">
            <h3>Categorías</h3>
            <span className="spacer" />
            <span className="badge badge-info">{categorias.length}</span>
          </div>

          {loading && categorias.length === 0 && (
            <div className="table-wrap table-wrap-flat">
              {[1, 2, 3].map((row) => (
                <div key={row} className="skeleton-row row" style={{ gap: 12 }}>
                  <div className="skel" style={{ width: '40%', height: 13 }} />
                </div>
              ))}
            </div>
          )}

          {!loading && categorias.length === 0 && (
            <div className="empty">
              <div className="e-ic"><Icons.Tag s={24} /></div>
              <h3>Sin categorías</h3>
              <p>Crea la primera con el formulario de la derecha.</p>
            </div>
          )}

          {!loading && categorias.length > 0 && (
            <div className="table-wrap table-wrap-flat">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th className="col-mobile-hidden">Área</th>
                    <th className="col-mobile-hidden">Descripción</th>
                    <th style={{ textAlign: 'right' }}>Productos</th>
                    <th className="cell-action">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriasOrdenadas.map(({ categoria, esSub }) => {
                    const cuenta = conteoPorCategoria.get(categoria.id) ?? 0;
                    const subCuenta = (subcategoriasPorPadre.get(categoria.id) ?? []).length;
                    const bloqueada = cuenta > 0 || subCuenta > 0;
                    return (
                      <tr key={categoria.id}>
                        <td style={esSub ? { paddingLeft: 34 } : undefined}>
                          {esSub && <span className="muted" style={{ marginRight: 6 }}>↳</span>}
                          <strong>{categoria.nombre}</strong>
                        </td>
                        <td className="col-mobile-hidden"><span className="pill-soft">{AREA_LABEL[categoria.area] ?? categoria.area}</span></td>
                        <td className="col-mobile-hidden muted">{categoria.descripcion || '—'}</td>
                        <td style={{ textAlign: 'right' }}><span className="pill-soft">{cuenta}</span></td>
                        <td className="cell-action">
                          <div className="row wrap" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              className="btn btn-sm btn-ghost"
                              disabled={!online}
                              onClick={() => abrirEdicion(categoria)}
                              aria-label={`Editar ${categoria.nombre}`}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              disabled={!online || saving || bloqueada}
                              title={bloqueada ? 'Reasigna sus productos y/o subcategorías antes de eliminarla' : 'Eliminar'}
                              onClick={() => void handleEliminar(categoria)}
                              aria-label={`Eliminar ${categoria.nombre}`}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="module-side">
          <section className="panel">
            <div className="panel-h">
              <Icons.Plus s={16} />
              <h3>Nueva categoría</h3>
            </div>
            <form className="form-stack" onSubmit={(e) => void handleCrear(e)}>
              <div className="field">
                <label htmlFor="cat-nombre">Nombre</label>
                <div className="input">
                  <input
                    id="cat-nombre"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej. Bebidas"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="cat-descripcion">Descripción</label>
                <div className="input">
                  <textarea
                    id="cat-descripcion"
                    rows={3}
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="cat-area">Área</label>
                <div className="input">
                  <select
                    id="cat-area"
                    value={form.area}
                    onChange={(e) => setForm((f) => ({ ...f, area: e.target.value as typeof f.area }))}
                    style={{ border: 0, background: 'transparent', width: '100%' }}
                  >
                    {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <span className="hint">{AREAS.find((a) => a.value === form.area)?.hint}</span>
              </div>
              <div className="field">
                <label htmlFor="cat-parent">Categoría padre</label>
                <div className="input">
                  <select
                    id="cat-parent"
                    value={form.parentId}
                    onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                    style={{ border: 0, background: 'transparent', width: '100%' }}
                  >
                    <option value="">Ninguna (categoría principal)</option>
                    {principales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <span className="hint">Elige una para crear una subcategoría; solo se permite un nivel.</span>
              </div>
              <button className="btn btn-primary btn-block" disabled={saving || !online} type="submit">
                {saving ? <span className="spinner" /> : <Icons.Plus s={16} />}
                Crear categoría
              </button>
            </form>
          </section>
        </aside>
      </div>

      {edit && (
        <div className="drawer-wrap">
          <Scrim onClose={() => setEdit(null)} />
          <aside className="drawer">
            <div className="panel-h" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 18 }}>{edit.nombre}</h3>
              <span className="spacer" />
              <button className="icon-btn" onClick={() => setEdit(null)}><Icons.Close s={17} /></button>
            </div>
            <div className="drawer-body">
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="cat-edit-nombre">Nombre</label>
                <div className="input">
                  <input id="cat-edit-nombre" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="cat-edit-descripcion">Descripción</label>
                <div className="input">
                  <textarea id="cat-edit-descripcion" rows={3} value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="cat-edit-area">Área</label>
                <div className="input">
                  <select
                    id="cat-edit-area"
                    value={editArea}
                    disabled={(conteoPorCategoria.get(edit.id) ?? 0) > 0}
                    onChange={(e) => setEditArea(e.target.value as typeof editArea)}
                    style={{ border: 0, background: 'transparent', width: '100%' }}
                  >
                    {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                {(conteoPorCategoria.get(edit.id) ?? 0) > 0 && (
                  <span className="hint">Tiene productos asociados — reasígnalos primero para cambiar el área.</span>
                )}
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="cat-edit-parent">Categoría padre</label>
                <div className="input">
                  <select
                    id="cat-edit-parent"
                    value={editParentId}
                    disabled={editTieneSubcategorias}
                    onChange={(e) => setEditParentId(e.target.value)}
                    style={{ border: 0, background: 'transparent', width: '100%' }}
                  >
                    <option value="">Ninguna (categoría principal)</option>
                    {opcionesPadreEdicion.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                {editTieneSubcategorias && (
                  <span className="hint">Ya tiene subcategorías propias — no puede convertirse en subcategoría.</span>
                )}
              </div>
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancelar</button>
              <span className="spacer" />
              <button className="btn btn-primary" disabled={editNombre.trim() === '' || saving} onClick={() => void guardarEdicion()}>
                <Icons.Check s={15} /> Guardar cambios
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
