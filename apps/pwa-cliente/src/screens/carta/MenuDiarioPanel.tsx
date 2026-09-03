/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/carta/MenuDiarioPanel.tsx — Menú del día (T-20): selección de
// platos ofrecidos hoy, separada de la carta fija. El jefe elige platos ya
// existentes o crea nuevos sobre la marcha, y los activa/desactiva si se
// acaban durante el servicio.

import { Scrim } from '../../components/ui/Scrim';
import { useMemo, useState } from 'react';
import { Icons } from '../../components/ui/icons';
import { useToast } from '../../components/ui/ToastProvider';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useMenuDiarioQuery } from '../../hooks/queries/useMenuDiarioQuery';
import { useAuthStore } from '../../store/auth.store';
import type { CategoriaDto, ProductoVM, TamanoPlatoDto } from '../../types/inventario.types';
import { coincideTamano, compararProductosPorTamano, nombreProductoConTamano, tamanosDeProductos } from '../../utils/tamanos';
import { TamanoSelect } from './TamanoSelect';
import './tamanos-carta.css';

function hoyLabel(): string {
  return new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
}

interface Props {
  productos: ProductoVM[];
  categorias: CategoriaDto[];
  tamanos?: TamanoPlatoDto[];
  tamanosLoading?: boolean;
  tamanosError?: string | null;
}

export function MenuDiarioPanel({ productos, categorias, tamanos = [], tamanosLoading = false, tamanosError = null }: Readonly<Props>) {
  const { toast } = useToast();
  const online = useOnlineStatus();
  const rol = useAuthStore((s) => s.user?.rol);
  // COCINA solo puede marcar 86 (agotado/disponible), no agregar ni quitar platos del menú.
  const soloDisponibilidad = rol === 'COCINA';
  const { menu, loading, saving, agregarAlMenu, actualizarDisponibilidad, quitarDelMenu } = useMenuDiarioQuery();
  const [agregando, setAgregando] = useState(false);
  const [tamanoFiltro, setTamanoFiltro] = useState('TODOS');

  const idsEnMenu = useMemo(() => new Set(menu.map((m) => m.producto.id)), [menu]);
  const tamanosDelMenu = useMemo(() => tamanosDeProductos(menu.map((m) => m.producto)), [menu]);
  const menuVisible = useMemo(() => menu.filter((m) => coincideTamano(m.producto, tamanoFiltro === 'TODOS' ? '' : tamanoFiltro))
    .sort((a, b) => compararProductosPorTamano(a.producto, b.producto)), [menu, tamanoFiltro]);

  const toggle = async (id: string, disponible: boolean) => {
    if (!online) return;
    try {
      await actualizarDisponibilidad(id, !disponible);
    } catch (err) {
      toast({ title: 'No se pudo actualizar el menú', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const quitar = async (id: string) => {
    if (!online) return;
    try {
      await quitarDelMenu(id);
    } catch (err) {
      toast({ title: 'No se pudo quitar del menú', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="hint" style={{ textTransform: 'capitalize', fontWeight: 700 }}>{hoyLabel()}</div>
          <div className="muted" style={{ fontSize: 12 }}>{menu.length} plato(s) en el menú de hoy · {menu.filter((m) => m.disponible).length} disponibles</div>
        </div>
        {!soloDisponibilidad && (
          <button className="btn btn-primary" disabled={!online} onClick={() => setAgregando(true)}>
            <Icons.Plus s={16} /> Agregar al menú
          </button>
        )}
      </div>

      <div className="carta-filtros-tamano"><div className="field"><label htmlFor="menu-filtro-tamano">Filtrar por tamaño</label><div className="input"><select id="menu-filtro-tamano" value={tamanoFiltro} onChange={(e) => setTamanoFiltro(e.target.value)}>
        <option value="TODOS">Todos los tamaños</option><option value="SIN_TAMANO">Sin tamaño</option>
        {tamanosDelMenu.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
      </select></div></div></div>

      <div className="table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
        <table className="dt">
          <thead>
            <tr>
              <th>Plato</th><th className="col-mobile-hidden">Categoría</th>
              <th style={{ textAlign: 'right' }}>Precio</th>
              <th>Disponible</th><th className="col-mobile-hidden"></th>
            </tr>
          </thead>
          <tbody>
            {loading && menu.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }} className="muted">Cargando menú del día…</td></tr>
            )}
            {!loading && menu.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }} className="muted">Aún no hay platos en el menú de hoy. Agrega uno con "Agregar al menú".</td></tr>
            )}
            {!loading && menu.length > 0 && menuVisible.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>No hay platos de este tamaño en el menú de hoy.</td></tr>}
            {menuVisible.map((m) => (
              <tr key={m.id} style={{ opacity: m.disponible ? 1 : 0.55 }}>
                <td><strong>{m.producto.nombre}</strong><div><span className={`carta-tamano-etiqueta ${m.producto.tamano ? '' : 'sin-tamano'}`}>{m.producto.tamano?.nombre ?? 'Sin tamaño'}</span></div></td>
                <td className="col-mobile-hidden"><span className="pill-soft">{m.producto.categoriaNombre ?? '—'}</span></td>
                <td style={{ textAlign: 'right' }}><strong className="mono">{m.producto.precioLabel}</strong></td>
                <td>
                  <button className={`toggle ${m.disponible ? 'on' : ''}`} disabled={saving || !online} onClick={() => toggle(m.id, m.disponible)} title={m.disponible ? 'Disponible' : 'Se acabó (desactivado)'}><span className="knob" /></button>
                </td>
                <td style={{ textAlign: 'right' }} className="col-mobile-hidden">
                  {!soloDisponibilidad && (
                    <button className="btn btn-sm btn-ghost" disabled={saving || !online} onClick={() => quitar(m.id)}>Quitar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {agregando && (
        <AgregarAlMenuDrawer
          productos={productos}
          categorias={categorias}
          tamanos={tamanos}
          tamanosLoading={tamanosLoading}
          tamanosError={tamanosError}
          idsEnMenu={idsEnMenu}
          saving={saving || !online}
          onClose={() => setAgregando(false)}
          onAgregarExistente={async (productoId) => {
            try {
              await agregarAlMenu({ productoId });
              toast({ title: 'Agregado al menú del día', icon: 'Check' });
            } catch (err) {
              toast({ title: 'No se pudo agregar', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
            }
          }}
          onCrearNuevo={async (datos) => {
            try {
              await agregarAlMenu({ producto: datos });
              toast({ title: 'Plato creado y agregado al menú', msg: datos.nombre, icon: 'Check' });
              setAgregando(false);
            } catch (err) {
              toast({ title: 'No se pudo crear el plato', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
            }
          }}
        />
      )}
    </div>
  );
}

interface NuevoPlatoData {
  nombre: string;
  categoriaId: string;
  tamanoId: string | null;
  precio: number;
}

interface AgregarAlMenuDrawerProps {
  productos: ProductoVM[];
  categorias: CategoriaDto[];
  tamanos: TamanoPlatoDto[];
  tamanosLoading: boolean;
  tamanosError: string | null;
  idsEnMenu: Set<string>;
  saving: boolean;
  onClose: () => void;
  onAgregarExistente: (productoId: string) => void;
  onCrearNuevo: (datos: NuevoPlatoData) => void;
}

function AgregarAlMenuDrawer({ productos, categorias, tamanos, tamanosLoading, tamanosError, idsEnMenu, saving, onClose, onAgregarExistente, onCrearNuevo }: Readonly<AgregarAlMenuDrawerProps>) {
  const [modo, setModo] = useState<'existente' | 'nuevo'>('existente');
  const [q, setQ] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? '');
  const [precio, setPrecio] = useState('');
  const [tamanoId, setTamanoId] = useState('');
  const [tamanoFiltro, setTamanoFiltro] = useState('TODOS');
  const tamanosDisponibles = useMemo(() => tamanosDeProductos(productos), [productos]);

  const disponibles = useMemo(
    () => productos.filter((p) => (!q || nombreProductoConTamano(p).toLowerCase().includes(q.toLowerCase()))
      && coincideTamano(p, tamanoFiltro === 'TODOS' ? '' : tamanoFiltro))
      .sort(compararProductosPorTamano),
    [productos, q, tamanoFiltro],
  );

  const p = Number(precio || 0);
  const validoNuevo = nombre.trim() !== '' && Number.isFinite(p) && p > 0 && categoriaId !== '';

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Agregar al menú del día</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <div className="row" style={{ gap: 6, marginBottom: 14 }}>
            <button className={`chip ${modo === 'existente' ? 'on' : ''}`} onClick={() => setModo('existente')}>Plato existente</button>
            <button className={`chip ${modo === 'nuevo' ? 'on' : ''}`} onClick={() => setModo('nuevo')}>Plato nuevo</button>
          </div>

          {modo === 'existente' ? (
            <>
              <div className="input" style={{ marginBottom: 12 }}>
                <Icons.Search s={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar plato…" autoFocus />
              </div>
              <div className="field" style={{ marginBottom: 12 }}><label htmlFor="menu-agregar-filtro-tamano">Tamaño a agregar</label><div className="input"><select id="menu-agregar-filtro-tamano" value={tamanoFiltro} onChange={(e) => setTamanoFiltro(e.target.value)}>
                <option value="TODOS">Todos los tamaños</option><option value="SIN_TAMANO">Sin tamaño</option>
                {tamanosDisponibles.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select></div></div>
              <div style={{ display: 'grid', gap: 6 }}>
                {disponibles.length === 0 && <div className="muted" style={{ padding: 12, fontSize: 13 }}>Sin resultados.</div>}
                {disponibles.map((prod) => {
                  const yaEsta = idsEnMenu.has(prod.id);
                  return (
                    <button
                      key={prod.id}
                      className="panel"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', textAlign: 'left', opacity: yaEsta ? 0.55 : 1 }}
                      disabled={saving || yaEsta}
                      onClick={() => onAgregarExistente(prod.id)}
                    >
                      <span style={{ flex: 1 }}>
                        <strong>{prod.nombre}</strong>
                        <div><span className={`carta-tamano-etiqueta ${prod.tamano ? '' : 'sin-tamano'}`}>{prod.tamano?.nombre ?? 'Sin tamaño'}</span></div>
                        <div className="muted" style={{ fontSize: 12 }}>{prod.categoriaNombre ?? '—'}</div>
                      </span>
                      <span className="mono">{prod.precioLabel}</span>
                      {yaEsta && <span className="pill-soft">En el menú</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="menu-nombre">Nombre</label>
                <div className="input"><input id="menu-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Especial del día" autoFocus /></div>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="menu-categoria">Categoría</label>
                <div className="input">
                  <select id="menu-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={{ border: 0, background: 'transparent', width: '100%' }}>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>
              <TamanoSelect id="menu-tamano" tamanos={tamanos} value={tamanoId} onChange={setTamanoId} loading={tamanosLoading} error={tamanosError} />
              <div className="field" style={{ marginBottom: 14 }}>
                <label htmlFor="menu-precio">Precio de venta</label>
                <div className="input"><span className="muted">S/</span><input id="menu-precio" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></div>
              </div>
              <button
                className="btn btn-primary btn-block"
                disabled={!validoNuevo || saving || tamanosLoading}
                onClick={() => onCrearNuevo({ nombre: nombre.trim(), categoriaId, tamanoId: tamanoId || null, precio: p })}
              >
                <Icons.Check s={15} /> Crear y agregar al menú
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
