/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/carta/CartaScreen.tsx — Gestión de Carta / Menú
// Cableado a APIs reales: la Carta son los productos SIN control de stock
// (useInventarioQuery con conStock=false). Los productos con stock viven en el
// módulo Inventario. Sin food cost ni happy hour.

import { Scrim } from '../../components/ui/Scrim';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../../components/ui/icons';
import { MiniStat } from '../../components/ui/Stat';
import { useToast } from '../../components/ui/ToastProvider';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';
import { useAuthStore } from '../../store/auth.store';
import type { CategoriaDto, ProductoVM } from '../../types/inventario.types';
import { MenuDiarioPanel } from './MenuDiarioPanel';

export function CartaScreen() {
  const { toast } = useToast();
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const rol = useAuthStore((s) => s.user?.rol);
  // COCINA solo puede marcar 86 (agotado/disponible), no crear ni editar platos.
  const soloDisponibilidad = rol === 'COCINA';
  const {
    categorias: todasLasCategorias,
    productos,
    loading,
    saving,
    crearProducto,
    actualizarProducto,
    actualizarDisponibilidad,
  // La carta se muestra completa de una vez (tabs de categoría con conteos
  // en cliente), no paginada: limit alto para cubrir el menú real (~183 platos).
  } = useInventarioQuery(undefined, { conStock: false, limit: 500 });

  // Categorías de Inventario (área INVENTARIO) no son de Carta — se
  // gestionan y muestran aparte, en el módulo Inventario.
  const categorias = useMemo(() => todasLasCategorias.filter((c) => c.area !== 'INVENTARIO'), [todasLasCategorias]);

  const [modo, setModo] = useState<'CARTA' | 'MENU_DIA'>('CARTA');
  const [cat, setCat] = useState<string>('TODAS');
  const [areaFiltro, setAreaFiltro] = useState<'TODAS' | 'COCINA' | 'BARRA'>('TODAS');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<ProductoVM | null>(null);
  const [nuevo, setNuevo] = useState(false);

  // Subcategorías se muestran como "Padre › Hijo" para no confundirse con
  // categorías principales del mismo nombre corto en la lista plana.
  const nombrePorCategoria = useMemo(() => {
    const porId = new Map(categorias.map((c) => [c.id, c]));
    const mapa = new Map<string, string>();
    for (const c of categorias) {
      const padre = c.parentId ? porId.get(c.parentId) : undefined;
      mapa.set(c.id, padre ? `${padre.nombre} › ${c.nombre}` : c.nombre);
    }
    return mapa;
  }, [categorias]);

  // Área (Cocina/Barra) de cada categoría — sirve para el filtro rápido y
  // para saber a qué estación de producción va cada plato.
  const areaPorCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.area])), [categorias]);

  const categoriasVisibles = useMemo(
    () => areaFiltro === 'TODAS' ? categorias : categorias.filter((c) => c.area === areaFiltro),
    [categorias, areaFiltro],
  );

  // Productos que matchean área + búsqueda, sin filtrar aún por categoría
  // puntual — es lo que cuenta el tab "Todas" dentro de la estación elegida.
  const enAreaYBusqueda = useMemo(
    () => productos.filter((p) => {
      const okArea = areaFiltro === 'TODAS' || areaPorCategoria.get(p.categoriaId) === areaFiltro;
      const okQ = !q || p.nombre.toLowerCase().includes(q.toLowerCase());
      return okArea && okQ;
    }),
    [productos, areaFiltro, areaPorCategoria, q],
  );

  const filtrados = useMemo(
    () => enAreaYBusqueda.filter((p) => cat === 'TODAS' || p.categoriaId === cat),
    [enAreaYBusqueda, cat],
  );

  const kpis = useMemo(() => {
    const activos = productos.filter((p) => p.disponible).length;
    return { total: productos.length, activos, agotados: productos.length - activos };
  }, [productos]);

  const toggleDisp = async (p: ProductoVM) => {
    if (!online) return;
    try {
      await actualizarDisponibilidad(p.id, !p.disponible);
    } catch (err) {
      toast({ title: 'No se pudo actualizar', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const guardar = async (datos: CartaFormData, prod: ProductoVM | null) => {
    try {
      if (prod) {
        await actualizarProducto(prod.id, {
          nombre: datos.nombre,
          descripcion: datos.descripcion.trim() === '' ? null : datos.descripcion,
          categoriaId: datos.categoriaId,
          precio: datos.precio,
          disponible: datos.disponible,
        });
        toast({ title: 'Plato actualizado', msg: datos.nombre, icon: 'Check' });
      } else {
        await crearProducto({
          nombre: datos.nombre,
          descripcion: datos.descripcion.trim() === '' ? undefined : datos.descripcion,
          categoriaId: datos.categoriaId,
          precio: datos.precio,
          disponible: datos.disponible,
          // Sin stockActual → producto de carta (sin control de stock)
        });
        toast({ title: 'Plato creado', msg: datos.nombre, icon: 'Check' });
      }
      setEdit(null);
      setNuevo(false);
    } catch (err) {
      toast({ title: 'No se pudo guardar', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Carta / Menú</h1>
          <div className="sub">
            {modo === 'CARTA' ? 'Platos sin control de stock · precios y disponibilidad' : 'Selección de platos ofrecidos hoy, separada de la carta fija'}
          </div>
        </div>
        <span className="spacer" />
        {!soloDisponibilidad && (
          <button className="btn btn-ghost" onClick={() => navigate('/app/categorias')}>
            <Icons.Layers s={16} /> Gestionar categorías
          </button>
        )}
        {modo === 'CARTA' && !soloDisponibilidad && (
          <button className="btn btn-primary" disabled={!online || categorias.length === 0} onClick={() => setNuevo(true)}>
            <Icons.Plus s={16} /> Nuevo plato
          </button>
        )}
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 16 }}>
        <button className={`chip ${modo === 'CARTA' ? 'on' : ''}`} onClick={() => setModo('CARTA')}>A la carta</button>
        <button className={`chip ${modo === 'MENU_DIA' ? 'on' : ''}`} onClick={() => setModo('MENU_DIA')}>Menú del día</button>
      </div>

      {modo === 'MENU_DIA' ? (
        <MenuDiarioPanel productos={productos} categorias={categorias} />
      ) : (
      <>
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <MiniStat icon="Pedidos" color="var(--accent)" soft="var(--accent-soft)" k="Platos en carta" v={kpis.total} d={`${kpis.activos} activos`} />
        <MiniStat icon="Alert" color="var(--danger)" soft="var(--danger-soft)" k="Agotados" v={kpis.agotados} d="No visibles en comandero" />
        <MiniStat icon="Check" color="var(--ok)" soft="var(--ok-soft)" k="Disponibles" v={kpis.activos} d="visibles en comandero" />
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <button
          className={`chip ${areaFiltro === 'TODAS' ? 'on' : ''}`}
          onClick={() => { setAreaFiltro('TODAS'); setCat('TODAS'); }}
        >
          Todas las estaciones
        </button>
        <button
          className={`chip ${areaFiltro === 'COCINA' ? 'on' : ''}`}
          onClick={() => { setAreaFiltro('COCINA'); setCat('TODAS'); }}
        >
          <Icons.Cocina s={14} /> Cocina
        </button>
        <button
          className={`chip ${areaFiltro === 'BARRA' ? 'on' : ''}`}
          onClick={() => { setAreaFiltro('BARRA'); setCat('TODAS'); }}
        >
          <Icons.Drink s={14} /> Barra
        </button>
      </div>

      <div className="canal-tabs-row" style={{ marginBottom: 14 }}>
        <div className="canal-tabs">
          <button className={`canal-tab ${cat === 'TODAS' ? 'on' : ''}`} onClick={() => setCat('TODAS')}>Todas <span className="ct-count">{enAreaYBusqueda.length}</span></button>
        {categoriasVisibles.map((c) => (
          <button key={c.id} className={`canal-tab ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
            {nombrePorCategoria.get(c.id)} <span className="ct-count">{productos.filter((p) => p.categoriaId === c.id).length}</span>
          </button>
        ))}
        </div>
        <span className="spacer" />
        <div className="input toolbar-input">
          <Icons.Search s={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar plato…" />
        </div>
      </div>

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
            {loading && productos.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }} className="muted">Cargando carta…</td></tr>
            )}
            {!(loading && productos.length === 0) && filtrados.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }} className="muted">Sin platos. Crea uno con "Nuevo plato".</td></tr>
            )}
            {filtrados.map((p) => (
              <tr
                key={p.id}
                style={{ cursor: soloDisponibilidad ? 'default' : 'pointer', opacity: p.disponible ? 1 : 0.55 }}
                onClick={() => { if (!soloDisponibilidad) setEdit(p); }}
              >
                <td><strong>{p.nombre}</strong>{p.descripcion && <div className="muted" style={{ fontSize: 12 }}>{p.descripcion}</div>}</td>
                <td className="col-mobile-hidden"><span className="pill-soft">{nombrePorCategoria.get(p.categoriaId) ?? p.categoriaNombre ?? '—'}</span></td>
                <td style={{ textAlign: 'right' }}><strong className="mono">{p.precioLabel}</strong></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className={`toggle ${p.disponible ? 'on' : ''}`} disabled={saving || !online} onClick={() => toggleDisp(p)} title={p.disponible ? 'Disponible' : 'Agotado'}><span className="knob" /></button>
                </td>
                <td style={{ textAlign: 'right' }} className="col-mobile-hidden">
                  {!soloDisponibilidad && <span className="muted" style={{ fontSize: 12 }}>Editar</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(edit || nuevo) && (
        <CartaDrawer
          prod={edit}
          categorias={categorias}
          saving={saving}
          onClose={() => { setEdit(null); setNuevo(false); }}
          onSave={guardar}
        />
      )}
      </>
      )}
    </div>
  );
}

interface CartaFormData {
  nombre: string;
  descripcion: string;
  categoriaId: string;
  precio: number;
  disponible: boolean;
}

interface CartaDrawerProps {
  prod: ProductoVM | null;
  categorias: CategoriaDto[];
  saving: boolean;
  onClose: () => void;
  onSave: (datos: CartaFormData, prod: ProductoVM | null) => void;
}

function CartaDrawer({ prod, categorias, saving, onClose, onSave }: Readonly<CartaDrawerProps>) {
  const isNew = !prod;
  const [n, setN] = useState(prod ? prod.nombre : '');
  const [desc, setDesc] = useState(prod?.descripcion ?? '');
  const [catId, setCatId] = useState<string>(prod ? prod.categoriaId : (categorias[0]?.id ?? ''));
  const [precio, setPrecio] = useState<string>(prod ? String(prod.precio) : '');
  const [disp, setDisp] = useState(prod ? prod.disponible : true);

  const p = Number(precio || 0);
  const valido = n.trim() !== '' && p > 0 && catId !== '';

  const guardar = () => onSave({ nombre: n.trim(), descripcion: desc.trim(), categoriaId: catId, precio: p, disponible: disp }, prod);

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>{isNew ? 'Nuevo plato' : n}</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="carta-nombre">Nombre</label>
            <div className="input"><input id="carta-nombre" value={n} onChange={(e) => setN(e.target.value)} placeholder="Ej. Lomo Saltado" autoFocus={isNew} /></div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="carta-descripcion">Descripción</label>
            <div className="input">
              <textarea id="carta-descripcion" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Opcional · qué trae el plato" />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="carta-categoria">Categoría</label>
            <div className="input">
              <select id="carta-categoria" value={catId} onChange={(e) => setCatId(e.target.value)} style={{ border: 0, background: 'transparent', width: '100%' }}>
                {categorias.map((c) => {
                  const padre = c.parentId ? categorias.find((p) => p.id === c.parentId) : undefined;
                  return <option key={c.id} value={c.id}>{padre ? `${padre.nombre} › ${c.nombre}` : c.nombre}</option>;
                })}
              </select>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="carta-precio">Precio de venta</label>
            <div className="input"><span className="muted">S/</span><input id="carta-precio" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></div>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div><b style={{ fontSize: 13.5 }}>Disponible</b><div className="muted" style={{ fontSize: 12 }}>Apágalo para marcar 86 (agotado)</div></div>
            <button className={`toggle ${disp ? 'on' : ''}`} onClick={() => setDisp(!disp)}><span className="knob" /></button>
          </div>
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={!valido || saving} onClick={guardar}>
            <Icons.Check s={15} /> {isNew ? 'Crear plato' : 'Guardar cambios'}
          </button>
        </div>
      </aside>
    </div>
  );
}
