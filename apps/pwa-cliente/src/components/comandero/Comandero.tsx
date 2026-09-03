// components/comandero/Comandero.tsx — Toma de pedido unificada (Salón/Delivery/Llevar)
// Overlay cableado a APIs reales: productos desde useInventarioQuery, mesas desde
// useMesasQuery, y creación vía usePedidosQuery().crear.
// La lógica del carrito/contexto y el envío viven en useComanda + domain/comanda
// (T-22); aquí queda el cableado de queries y la presentación.

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Icons, type IconName } from '../ui/icons';
import { useToast } from '../ui/ToastProvider';
import { fmt } from '../../utils/format';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';
import { useMenuDiarioQuery } from '../../hooks/queries/useMenuDiarioQuery';
import { useMesasQuery } from '../../hooks/queries/useMesasQuery';
import { usePedidosQuery } from '../../hooks/queries/usePedidosQuery';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useComanda } from '../../hooks/useComanda';
import { ContextoCanal } from './ContextoCanal';
import { ComandaCart } from './ComandaCart';
import type { Canal } from '../../domain/pedido.flow';

export type { Canal };

const CANALES: { key: Canal; label: string; ic: IconName }[] = [
  { key: 'SALON', label: 'Salón', ic: 'Mesas' },
  { key: 'DELIVERY', label: 'Delivery', ic: 'Delivery' },
  { key: 'LLEVAR', label: 'Para llevar', ic: 'Bag' },
];

export interface ComanderoProps {
  onClose: () => void;
  /** éxito al enviar (ej. refrescar o navegar) */
  onCreated?: () => void;
  initialCanal?: Canal;
  /** mesa física fijada (modo desde plano de mesas) */
  mesaId?: string;
  mesaNumero?: string;
  mesaUbicacion?: string;
  /** modo "agregar a cuenta abierta" */
  modoAgregar?: boolean;
}

export function Comandero({
  onClose,
  onCreated,
  initialCanal = 'SALON',
  mesaId,
  mesaNumero,
  mesaUbicacion,
  modoAgregar = false,
}: Readonly<ComanderoProps>) {
  const { toast } = useToast();
  const cmdRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(cmdRef, { active: true, onClose });
  const [vista, setVista] = useState<'CARTA' | 'MENU_DIA'>('CARTA');
  const [cat, setCat] = useState<Pick<CatalogGroup, 'id' | 'nombre'> | null>(null);
  const volverRef = useRef<HTMLButtonElement>(null);
  const categoriaOrigenRef = useRef<HTMLButtonElement>(null);
  const ultimaCategoriaId = useRef<string | null>(null);
  const focoPendiente = useRef(false);
  const catalogoGuardado = useRef<ProductoCatalogo[]>([]);
  const [q, setQ] = useState('');
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog');
  const search = q.trim();
  const {
    productos,
    categorias,
    loading: loadingInv,
    loadingMore: loadingMoreInv,
    nextCursor,
    fetchMore,
    error: errorInv,
  } = useInventarioQuery(cat?.id || undefined, { limit: 500, search: vista === 'CARTA' ? search || undefined : undefined });
  const { menu: menuDelDia, loading: loadingMenu } = useMenuDiarioQuery();
  const { mesas } = useMesasQuery();
  const { crear } = usePedidosQuery(mesaId);

  useEffect(() => {
    if (cat === null && !search && !loadingInv && !errorInv) catalogoGuardado.current = productos;
  }, [cat, search, loadingInv, errorInv, productos]);
  // Consultar una categoría no debe perder la carta ya cargada si el
  // servicio cae. El filtro por ID y búsqueda se aplica también al respaldo.
  const catalogo = productos.length === 0 && (loadingInv || errorInv) ? catalogoGuardado.current : productos;

  const mesaLock = !!mesaId; // mesa ya definida desde el plano
  const mesasFisicas = useMemo(
    () => mesas.filter((m) => m.numeroRaw < 90).sort((a, b) => a.numeroRaw - b.numeroRaw),
    [mesas],
  );

  const cmd = useComanda({
    mesaId, mesaLock, initialCanal, modoAgregar, mesaNumero,
    mesas, mesasFisicas, crear, toast, onCreated, onClose,
  });

  // Solo cambia el catálogo; useComanda conserva líneas, notas y contexto.
  const abrirCategoria = (grupo: CatalogGroup) => {
    ultimaCategoriaId.current = grupo.id;
    focoPendiente.current = true;
    setQ('');
    setCat({ id: grupo.id, nombre: grupo.nombre });
  };
  const volverACategorias = () => {
    focoPendiente.current = true;
    setQ('');
    setCat(null);
  };
  useEffect(() => {
    const destino = cat ? volverRef.current : categoriaOrigenRef.current;
    if (focoPendiente.current && destino) {
      destino.focus();
      focoPendiente.current = false;
    }
  }, [cat, loadingInv]);

  const gruposCarta = useMemo(
    () => groupCatalogProducts(catalogo, categorias, Boolean(nextCursor)),
    [catalogo, categorias, nextCursor],
  );

  const productosFiltrados = useMemo(
    () => catalogo.filter((p) => {
      const okCat = cat === null || (p.categoriaId || '') === cat.id;
      const okQ = !search || p.nombre.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'));
      return okCat && okQ && p.disponible;
    }),
    [catalogo, cat, search],
  );
  // El respaldo de otras categorías no cuenta como datos de la vista actual.
  const productosVisiblesLength = cat === null ? catalogo.length : productosFiltrados.length;

  // T-20: menú del día separado de la carta — solo platos activos hoy.
  const productosMenuDelDia = useMemo(
    () => menuDelDia
      .filter((m) => m.disponible && (!q || m.producto.nombre.toLowerCase().includes(q.toLowerCase())))
      .map((m) => m.producto),
    [menuDelDia, q],
  );

  let titulo = 'Nuevo pedido';
  if (modoAgregar) titulo = `Agregar a Mesa ${mesaNumero ?? ''}`.trim();
  else if (mesaLock) titulo = `Nuevo pedido · Mesa ${mesaNumero ?? ''}`.trim();

  return (
    <div className="cmd-overlay">
      <dialog
        open
        className="cmd"
        ref={cmdRef}
        aria-modal="true"
        aria-label={titulo}
      >
        {/* Header */}
        <div className="cmd-head">
          <button className="icon-btn" onClick={onClose} title="Cerrar"><Icons.Close s={18} /></button>
          <h2>{titulo}</h2>
          {mesaLock ? (
            <span className="pill-soft" style={{ marginLeft: 2 }}>{mesaUbicacion ?? 'Salón'}{modoAgregar ? ' · cuenta abierta' : ''}</span>
          ) : (
            <ComanderoCanales cmd={cmd} />
          )}
          <span className="spacer" />
        </div>

        {/* Selector de pestañas para móvil/tablet */}
        <div className="cmd-tabs-mobile mobile-only">
          <button className={activeTab === 'catalog' ? 'on' : ''} onClick={() => setActiveTab('catalog')}>
            <Icons.Layers s={16} /> Carta
          </button>
          <button className={activeTab === 'cart' ? 'on' : ''} onClick={() => setActiveTab('cart')}>
            <Icons.Pedidos s={16} /> Pedido {cmd.totalItems > 0 && <span className="cnt-badge">{cmd.totalItems}</span>}
          </button>
        </div>

        {/* Barra de contexto */}
        <div className="cmd-context">
          <ContextoCanal
            canal={cmd.canal}
            mesaLock={mesaLock}
            mesaNumero={mesaNumero}
            mesaUbicacion={mesaUbicacion}
            mesasFisicas={mesasFisicas}
            selMesaId={cmd.effectiveMesaId}
            setSelMesaId={cmd.setSelMesaId}
            comensales={cmd.comensales}
            setComensales={cmd.setComensales}
            cliente={cmd.cliente} setCliente={cmd.setCliente}
            tel={cmd.tel} setTel={cmd.setTel}
            dir={cmd.dir} setDir={cmd.setDir}
            referencia={cmd.referencia} setReferencia={cmd.setReferencia}
            proveedor={cmd.proveedor} setProveedor={cmd.setProveedor}
            retiro={cmd.retiro} setRetiro={cmd.setRetiro}
          />
        </div>

        <div className="cmd-body">
          {/* Catálogo */}
          <div className={`cmd-catalog ${activeTab === 'catalog' ? 'active' : 'hidden-mobile'}`}>
            <div className="row" style={{ gap: 6, padding: '0 0 10px' }}>
              <button className={`chip ${vista === 'CARTA' ? 'on' : ''}`} onClick={() => { setVista('CARTA'); volverACategorias(); }}>A la carta</button>
              <button className={`chip ${vista === 'MENU_DIA' ? 'on' : ''}`} onClick={() => { setVista('MENU_DIA'); setQ(''); }}>
                Menú del día{menuDelDia.length > 0 && ` (${menuDelDia.filter((m) => m.disponible).length})`}
              </button>
            </div>
            {(vista === 'MENU_DIA' || cat !== null) && (
              <div className="cmd-filters">
                {vista === 'CARTA' && (
                  <button type="button" className="btn btn-ghost cmd-back-categories" ref={volverRef} onClick={volverACategorias}>
                    <Icons.ArrowDown s={18} style={{ transform: 'rotate(90deg)' }} /> Volver a categorías
                  </button>
                )}
                <div className="input cmd-search"><Icons.Search s={15} /><input aria-label="Buscar plato" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar plato…" /></div>
              </div>
            )}
            {vista === 'CARTA' && errorInv && productosVisiblesLength > 0 && (
              <div className="banner err module-feedback" role="alert">
                <Icons.Alert s={17} />
                <span>No se pudo actualizar el catálogo. Mostrando los últimos productos guardados.</span>
              </div>
            )}
            {vista === 'CARTA' ? (
              <div className={`cmd-grid ${cat === null ? 'cmd-category-picker' : ''}`} key={cat?.id ?? 'categorias'}>
                {cat === null && <div className="cmd-category-intro"><h3>Elige una categoría</h3><p>Toca un recuadro para ver sus platos.</p></div>}
                {ComanderoEmptyGrid({ loadingInv, errorInv, productosLength: productosVisiblesLength, productosFiltradosLength: cat === null ? gruposCarta.length : productosFiltrados.length, nextCursor, loadingMoreInv, fetchMore }) ?? (
                  <>
                    {cat === null ? (
                      <ComanderoCategoryTiles grupos={gruposCarta} onSelect={abrirCategoria} ultimaCategoriaId={ultimaCategoriaId.current} origenRef={categoriaOrigenRef} parcial={Boolean(nextCursor)} />
                    ) : (
                      <ComanderoCatalogGroups grupos={[{ ...cat, productos: productosFiltrados }]} cmd={cmd} />
                    )}
                    <ComanderoCargarMas nextCursor={nextCursor} loadingMoreInv={loadingMoreInv} fetchMore={fetchMore} />
                  </>
                )}
              </div>
            ) : (
              <div className="cmd-grid" key="menu-del-dia">
                {loadingMenu && menuDelDia.length === 0 && (
                  <div className="cmd-empty" style={{ gridColumn: '1 / -1' }}><b>Cargando menú del día…</b></div>
                )}
                {!loadingMenu && productosMenuDelDia.length === 0 && (
                  <div className="cmd-empty" style={{ gridColumn: '1 / -1' }}><Icons.Search s={26} /><b>Sin platos en el menú de hoy</b><p>Actívalos desde Carta / Menú.</p></div>
                )}
                <ComanderoCatalogGrid productos={productosMenuDelDia} cmd={cmd} />
              </div>
            )}
          </div>

          {/* Comanda */}
          <div className={`cmd-cart-wrap ${activeTab === 'cart' ? 'active' : 'hidden-mobile'}`} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <ComandaCart cmd={cmd} modoAgregar={modoAgregar} />
          </div>
        </div>
      </dialog>
    </div>
  );
}

// Tipos derivados de los hooks (fuente de verdad) para los sub-componentes de
// presentación: evita `any` sin duplicar las formas de datos ni acoplarse a DTOs.
type ComandaCtrl = ReturnType<typeof useComanda>;
type ProductoCatalogo = ReturnType<typeof useInventarioQuery>['productos'][number];
type NextCursor = ReturnType<typeof useInventarioQuery>['nextCursor'];
type FetchMore = ReturnType<typeof useInventarioQuery>['fetchMore'];

function ComanderoCanales({ cmd }: Readonly<{ cmd: ComandaCtrl }>) {
  return (
    <div className="cmd-canal seg">
      {CANALES.map((c) => {
        const Ic = Icons[c.ic];
        return (
          <button key={c.key} className={cmd.canal === c.key ? 'on' : ''} onClick={() => cmd.setCanal(c.key)}>
            <Ic s={15} /> {c.label}
          </button>
        );
      })}
    </div>
  );
}

type CategoriaCatalogo = ReturnType<typeof useInventarioQuery>['categorias'][number];
interface CatalogGroup {
  id: string;
  nombre: string;
  area: CategoriaCatalogo['area'];
  productos: ProductoCatalogo[];
}

export function groupCatalogProducts(productos: ProductoCatalogo[], categorias: CategoriaCatalogo[], incluirSinCargar = false): CatalogGroup[] {
  const metadata = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  const groups = new Map<string, CatalogGroup>();
  // Una categoría todavía sin productos cargados sigue accesible si hay
  // páginas pendientes. Al abrirla se consulta por su ID al backend.
  if (incluirSinCargar) {
    for (const categoria of categorias) groups.set(categoria.id, { ...categoria, productos: [] });
  }
  for (const producto of productos) {
    if (!producto.disponible) continue;
    const id = producto.categoriaId || '';
    const categoria = metadata.get(id);
    const group: CatalogGroup = groups.get(id) ?? {
      id,
      nombre: categoria?.nombre ?? (producto.categoriaNombre?.trim() || 'Sin categoría'),
      area: categoria?.area ?? (producto.stockActual == null ? 'COCINA' : 'INVENTARIO'),
      productos: [],
    };
    group.productos.push(producto);
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function ComanderoCategoryTiles({ grupos, onSelect, ultimaCategoriaId, origenRef, parcial }: Readonly<{
  grupos: CatalogGroup[];
  onSelect: (grupo: CatalogGroup) => void;
  ultimaCategoriaId: string | null;
  origenRef: RefObject<HTMLButtonElement | null>;
  parcial: boolean;
}>) {
  return [false, true].map((abarrotes) => {
    const items = grupos.filter((grupo) => (grupo.area === 'INVENTARIO') === abarrotes);
    if (items.length === 0) return null;
    return (
      <section className="cmd-category-tile-section" key={String(abarrotes)} aria-label={abarrotes ? 'Categorías de abarrotes' : 'Categorías de platos'}>
        {abarrotes && <h3>Abarrotes</h3>}
        <div className="cmd-category-tiles">
          {items.map((grupo) => {
            const Ic = grupo.area === 'INVENTARIO' ? Icons.Bag : grupo.area === 'BARRA' ? Icons.Drink : Icons.Chef;
            const cantidad = grupo.productos.length;
            return (
              <button type="button" className="cmd-category-tile" key={grupo.id} aria-label={`Abrir categoría ${grupo.nombre}`} ref={grupo.id === ultimaCategoriaId ? origenRef : undefined} onClick={() => onSelect(grupo)}>
                <span className="cmd-category-tile-icon"><Ic s={32} /></span>
                <span className="cmd-category-tile-name">{grupo.nombre}</span>
                <span className="cmd-category-tile-count">{cantidad > 0 ? `${cantidad}${parcial ? '+' : ''} ${abarrotes ? 'productos' : 'platos'} disponibles` : 'Ver platos'}</span>
                <span className="cmd-category-tile-action">Ver {abarrotes ? 'productos' : 'platos'} <Icons.ArrowDown s={16} style={{ transform: 'rotate(-90deg)' }} /></span>
              </button>
            );
          })}
        </div>
      </section>
    );
  });
}

function ComanderoCatalogGroups({ grupos, cmd }: Readonly<{ grupos: Array<{ id: string; nombre: string; productos: ProductoCatalogo[] }>, cmd: ComandaCtrl }>) {
  return grupos.map((grupo) => (
    <section className="cmd-category-section" key={grupo.id} aria-labelledby={`cmd-category-${encodeURIComponent(grupo.id)}`}>
      <div className="cmd-category-heading">
        <h3 id={`cmd-category-${encodeURIComponent(grupo.id)}`}>{grupo.nombre}</h3>
        <span>{grupo.productos.length} {grupo.productos.length === 1 ? 'plato' : 'platos'}</span>
      </div>
      <div className="cmd-category-grid">
        <ComanderoCatalogGrid productos={grupo.productos} cmd={cmd} showCategory={false} />
      </div>
    </section>
  ));
}

function ComanderoCatalogGrid({ productos, cmd, showCategory = true }: Readonly<{ productos: ProductoCatalogo[], cmd: ComandaCtrl, showCategory?: boolean }>) {
  return (
    <>
      {productos.map((p) => {
        const enCarrito = cmd.lines.find((l) => l.producto.id === p.id)?.cantidad ?? 0;
        return (
          <button key={p.id} className={`dish-card ${enCarrito ? 'has' : ''}`} onClick={() => cmd.addProducto(p)}>
            {enCarrito > 0 && <span className="dish-badge">{enCarrito}</span>}
            {showCategory && <div className="dish-cat">{p.categoriaNombre ?? '—'}</div>}
            <div className="dish-name">{p.nombre}</div>
            <div className="dish-foot">
              <span className="dish-price mono">{fmt(p.precio)}</span>
            </div>
          </button>
        );
      })}
    </>
  );
}

function ComanderoCargarMas({ nextCursor, loadingMoreInv, fetchMore }: Readonly<{ nextCursor: NextCursor, loadingMoreInv: boolean, fetchMore: FetchMore }>) {
  if (!nextCursor) return null;
  return (
    <button className="dish-card cmd-load-more" disabled={loadingMoreInv} onClick={() => { void fetchMore(); }}>
      <div className="dish-cat">Catálogo</div>
      <div className="dish-name">{loadingMoreInv ? 'Cargando...' : 'Cargar más productos'}</div>
      <div className="dish-foot">
        <span className="dish-price mono">Más resultados</span>
      </div>
    </button>
  );
}

function ComanderoEmptyGrid({ loadingInv, errorInv, productosLength, productosFiltradosLength, nextCursor, loadingMoreInv, fetchMore }: Readonly<{ loadingInv: boolean, errorInv?: string | null, productosLength: number, productosFiltradosLength: number, nextCursor: NextCursor, loadingMoreInv: boolean, fetchMore: FetchMore }>) {
  if (loadingInv && productosLength === 0) {
    return <div className="cmd-empty" style={{ gridColumn: '1 / -1' }}><b>Cargando carta…</b></div>;
  }
  // Sin caché previa y la carga falló: distinto de "sin resultados" — el
  // catálogo no cargó por una dependencia caída, no porque el filtro no
  // matchee nada. El hook ya reintenta y refetchea solo cada 5s (queryClient).
  if (errorInv && productosLength === 0) {
    return (
      <div className="cmd-empty" style={{ gridColumn: '1 / -1' }}>
        <Icons.Alert s={26} /><b>No pudimos cargar el catálogo</b>
        <p>El servicio de inventario no responde.</p>
      </div>
    );
  }
  if (productosFiltradosLength === 0) {
    return (
      <>
        <div className="cmd-empty" style={{ gridColumn: '1 / -1' }}><Icons.Search s={26} /><b>Sin resultados</b><p>Ajusta la categoría o la búsqueda.</p></div>
        <ComanderoCargarMas nextCursor={nextCursor} loadingMoreInv={loadingMoreInv} fetchMore={fetchMore} />
      </>
    );
  }
  return null;
}
