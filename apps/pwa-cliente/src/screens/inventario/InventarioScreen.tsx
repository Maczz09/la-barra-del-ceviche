/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
import { useMemo, useState, useEffect, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { ProductoTable } from '../../components/inventario/ProductoTable';
import { NuevoProductoForm } from '../../components/inventario/NuevoProductoForm';
import { RegistrarMermaModal } from '../../components/inventario/RegistrarMermaModal';
import { EditarProductoModal } from '../../components/inventario/EditarProductoModal';
import { useMermasQuery } from '../../hooks/queries/useMermasQuery';
import { useToast } from '../../components/ui/ToastProvider';
import { ExportarInventarioModal, type OpcionesExportacion } from '../../components/inventario/ExportarInventarioModal';
import { AlmacenCocinaTab } from '../../components/inventario/AlmacenCocinaTab';
import { getTodosLosProductos } from '../../api/inventario.api';
import { mapProductos } from '../../mappers/inventario.mapper';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { useAuthStore } from '../../store/auth.store';
import { INITIAL_PRODUCT, STOCK_BAJO, computeInventarioKpis, stockNivel } from '../../domain/inventario';
import type { ActualizarProductoPayload, CrearProductoPayload, ProductoVM } from '../../types/inventario.types';

type TabInventario = 'productos' | 'almacen';

export function InventarioScreen() {
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const { toast } = useToast();
  const rol = useAuthStore((s) => s.user?.rol);
  const usuarioNombre = useAuthStore((s) => s.user?.nombre);
  const { sede: sedeActual } = useSedeActualQuery();
  // COCINA entra a Inventario SOLO por el almacén: los productos de venta los
  // puede leer pero no tocar (el backend le rechaza toda mutación), así que
  // mostrarle esa pestaña sería ofrecerle botones que siempre fallan.
  const soloAlmacen = rol === 'COCINA';
  const [tab, setTab] = useState<TabInventario>(soloAlmacen ? 'almacen' : 'productos');
  const [categoriaId, setCategoriaId] = useState('');
  const [search, setSearch] = useState('');
  const [exportAbierto, setExportAbierto] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const {
    categorias: todasLasCategorias, productos, nextCursor, loading, loadingMore, saving, error, success,
    fetch, fetchMore, crearProducto, actualizarProducto, reponerStock, clearFeedback,
  } = useInventarioQuery(categoriaId || undefined, { conStock: true, search: search.trim() || undefined });

  // Categorías de Carta/Menú (Cocina/Barra) no son de Inventario — se
  // gestionan y muestran aparte, en el módulo Carta.
  const categorias = useMemo(() => todasLasCategorias.filter((c) => c.area === 'INVENTARIO'), [todasLasCategorias]);

  const { registrarMerma, saving: savingMerma } = useMermasQuery();
  const [productoForm, setProductoForm] = useState<CrearProductoPayload>(INITIAL_PRODUCT);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [mermaProducto, setMermaProducto] = useState<ProductoVM | null>(null);
  const [editProducto, setEditProducto] = useState<ProductoVM | null>(null);

  useEffect(() => {
    const el = document.querySelector('.content');
    if (el) el.classList.add('has-form');
    return () => {
      if (el) el.classList.remove('has-form');
    };
  }, []);

  const productosPorCategoria = useMemo(
    () => categorias.map((cat) => ({ categoria: cat, productos: productos.filter((p) => p.categoriaId === cat.id) })),
    [categorias, productos],
  );

  const kpis = useMemo(() => computeInventarioKpis(productos), [productos]);

  const grupos = categoriaId
    ? [{ categoria: categorias.find((c) => c.id === categoriaId), productos }]
    : productosPorCategoria;

  const handleCrear = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!online) return;
    try {
      await crearProducto({
        ...productoForm,
        categoriaId: productoForm.categoriaId || categorias[0]?.id,
        nombre: productoForm.nombre.trim(),
        descripcion: productoForm.descripcion?.trim() || undefined,
        precio: Number(productoForm.precio) || 0,
        stockActual: Number(productoForm.stockActual) || 0,
      });
      setProductoForm(INITIAL_PRODUCT);
    } catch (err) {
      toast({ title: 'No se pudo crear el producto', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const updateForm = (key: keyof CrearProductoPayload, value: string | number | boolean) =>
    setProductoForm((prev) => ({ ...prev, [key]: value }));

  const handleReponer = async (productoId: string) => {
    const cantidad = Number(stockInputs[productoId]) || 0;
    if (cantidad <= 0 || !online) return;
    try {
      await reponerStock(productoId, cantidad);
      setStockInputs((prev) => ({ ...prev, [productoId]: '' }));
    } catch (err) {
      toast({ title: 'No se pudo reponer el stock', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const handleActualizarProducto = async (payload: ActualizarProductoPayload) => {
    if (!editProducto || !online) return;
    try {
      await actualizarProducto(editProducto.id, payload);
      setEditProducto(null);
    } catch (err) {
      toast({ title: 'No se pudo actualizar el producto', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  // Se imprime en el PDF: sin esto, un cuadre parcial es indistinguible de uno
  // completo una vez que sale de la pantalla.
  const filtroActivo = useMemo(() => {
    const partes: string[] = [];
    const cat = categorias.find((c) => c.id === categoriaId);
    if (cat) partes.push(`Categoría: ${cat.nombre}`);
    if (search.trim()) partes.push(`Búsqueda: "${search.trim()}"`);
    return partes.length > 0 ? partes.join(' · ') : null;
  }, [categorias, categoriaId, search]);

  const handleExportarPdf = async (opciones: OpcionesExportacion) => {
    setGenerandoPdf(true);
    try {
      const aplicarFiltro = opciones.alcance === 'filtrado' && filtroActivo !== null;
      // Se re-consulta en vez de usar `productos`: la tabla está paginada de a
      // 50 y el cuadre tiene que salir con TODO el inventario.
      const dtos = await getTodosLosProductos({
        conStock: true,
        ...(aplicarFiltro
          ? { categoriaId: categoriaId || undefined, search: search.trim() || undefined }
          : {}),
      });
      let vms = mapProductos(dtos, todasLasCategorias);
      if (opciones.soloStockCritico) {
        vms = vms.filter((p) => ['low', 'out'].includes(stockNivel(p.stockActual)));
      }
      const etiquetas = [
        aplicarFiltro ? filtroActivo : 'Todo el inventario',
        opciones.soloStockCritico ? 'Solo stock bajo o agotado' : null,
      ].filter(Boolean);
      // jspdf/jspdf-autotable no resuelven tipos de forma consistente en el
      // import() dinámico bajo este resolver de eslint (tsc sí los resuelve bien).
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
      const { exportarInventarioPdf } = await import('../../utils/inventarioPdf');
      const archivo: string = await exportarInventarioPdf(vms, {
        formato: opciones.formato,
        sedeNombre: sedeActual?.nombre ?? null,
        usuarioNombre: usuarioNombre ?? null,
        filtroLabel: etiquetas.join(' · '),
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
      toast({ title: 'PDF generado', msg: archivo, icon: 'Download' });
      setExportAbierto(false);
    } catch (err) {
      toast({ title: 'No se pudo generar el PDF', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    } finally {
      setGenerandoPdf(false);
    }
  };

  const handleRegistrarMerma = async (cantidad: number, motivo: string) => {
    if (!mermaProducto || !online) return;
    try {
      await registrarMerma({ productoId: mermaProducto.id, cantidad, motivo });
      toast({ title: 'Merma registrada', msg: `${mermaProducto.nombre} · -${cantidad}`, icon: 'Check' });
      setMermaProducto(null);
    } catch (err) {
      toast({ title: 'No se pudo registrar la merma', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Inventario</h1>
          <div className="sub">
            {tab === 'productos'
              ? 'Productos, disponibilidad y reposición de stock'
              : 'Insumos que se usan en cocina: salidas, mermas y cuadre'}
          </div>
        </div>
        <span className="spacer" />
        {tab === 'productos' && (
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setExportAbierto(true)}
              disabled={!online}
              title={online ? 'Descargar inventario en PDF' : 'Necesita conexión: el PDF trae todo el inventario, no solo lo que ya está en pantalla'}
            >
              <Icons.Download s={15} /> PDF
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/app/mermas')}>
              <Icons.Alert s={15} /> Ver mermas
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => fetch()} title="Refrescar" aria-label="Refrescar inventario">
              <Icons.Refresh s={16} />
            </button>
          </>
        )}
      </div>

      {!online && (
        <output className="banner warn module-feedback">
          <Icons.Alert s={17} />
          <span>Sin conexión. Las mutaciones están deshabilitadas.</span>
        </output>
      )}

      {!soloAlmacen && (
        <div className="seg sm" style={{ marginBottom: 14, width: 'fit-content' }}>
          <button className={tab === 'productos' ? 'on' : ''} onClick={() => setTab('productos')}>
            Productos de venta
          </button>
          <button className={tab === 'almacen' ? 'on' : ''} onClick={() => setTab('almacen')}>
            Almacén de cocina
          </button>
        </div>
      )}

      {tab === 'almacen' && (
        <AlmacenCocinaTab
          online={online}
          puedeAdministrar={!soloAlmacen}
          sedeNombre={sedeActual?.nombre ?? null}
          usuarioNombre={usuarioNombre ?? null}
        />
      )}

      {tab === 'productos' && (error || success) && (
        <div className={`banner ${error ? 'err' : 'ok'} module-feedback`} role="alert">
          {error ? <Icons.Alert s={17} /> : <Icons.Check s={16} />}
          <span>{error ?? success}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={clearFeedback}>Cerrar</button>
        </div>
      )}

      {/* Pestaña de productos de venta: lo de siempre (KPIs, tabla y alta). */}
      {tab === 'productos' && (
        <>
        <div className="grid-stats" style={{ marginBottom: 16 }}>
          <StatKpi icon="Inventario" tint="accent" label="En esta vista" value={kpis.total} />
          <StatKpi icon="Check" tint="ok" label="Disponibles" value={kpis.disponibles} />
          <StatKpi icon="Alert" tint="warn" label={`Stock bajo (≤${STOCK_BAJO})`} value={kpis.bajo} />
          <StatKpi icon="Alert" tint="danger" label="Agotados" value={kpis.agotados} />
        </div>

        <div className="module-toolbar">
          <div className="search-box">
            <Icons.Search s={16} />
            <input
              type="search"
              placeholder="Buscar producto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar productos"
            />
          </div>
          <span className="spacer" />
          <div className="input toolbar-input">
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-label="Filtrar por categoría">
              <option value="">Todas las categorías</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="module-grid">
          <section className="panel">
            <div className="panel-h">
              <h3>Productos</h3>
              <span className="spacer" />
              <span className="badge badge-info">{productos.length} productos</span>
            </div>
            <ProductoTable
              grupos={grupos}
              loading={loading}
              stockInputs={stockInputs}
              onStockInput={(id, val) => setStockInputs((prev) => ({ ...prev, [id]: val }))}
              saving={saving}
              online={online}
              onToggleDisponible={(p) => { if (!saving) { actualizarProducto(p.id, { disponible: !p.disponible }).catch((e: unknown) => toast({ title: 'No se pudo actualizar el producto', msg: e instanceof Error ? e.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' })); } }}
              onReponer={handleReponer}
              onReponerQuick={(id, cant) => { if (online) { reponerStock(id, cant).catch((e: unknown) => toast({ title: 'No se pudo reponer el stock', msg: e instanceof Error ? e.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' })); } }}
              onRegistrarMerma={setMermaProducto}
              onEditar={setEditProducto}
              nextCursor={nextCursor}
              loadingMore={loadingMore}
              onLoadMore={fetchMore}
            />
          </section>

          <NuevoProductoForm
            categorias={categorias}
            form={productoForm}
            onChange={updateForm}
            onSubmit={handleCrear}
            saving={saving}
            online={online}
          />
        </div>
        </>
      )}

      {exportAbierto && (
        <ExportarInventarioModal
          filtroActivo={filtroActivo}
          generando={generandoPdf}
          onClose={() => setExportAbierto(false)}
          onExport={handleExportarPdf}
        />
      )}

      {mermaProducto && (
        <RegistrarMermaModal
          producto={mermaProducto}
          saving={savingMerma}
          onClose={() => setMermaProducto(null)}
          onSave={handleRegistrarMerma}
        />
      )}

      {editProducto && (
        <EditarProductoModal
          producto={editProducto}
          categorias={categorias}
          saving={saving}
          online={online}
          onClose={() => setEditProducto(null)}
          onSave={handleActualizarProducto}
        />
      )}

    </div>
  );
}
