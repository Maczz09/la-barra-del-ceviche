import { Icons } from '../ui/icons';
import type { ProductoVM } from '../../types/inventario.types';
import { stockNivel } from '../../domain/inventario';

// NaN no pasa la comparación: solo habilita "Reponer" con una cantidad positiva real.
const esCantidadValida = (v: string | undefined) => Number(v) > 0;

interface CategoriaGroup {
  categoria: { id: string; nombre: string } | undefined;
  productos: ProductoVM[];
}

interface ProductoTableProps {
  grupos: CategoriaGroup[];
  stockInputs: Record<string, string>;
  onStockInput: (id: string, val: string) => void;
  saving: boolean;
  online: boolean;
  onToggleDisponible: (p: ProductoVM) => void;
  onReponer: (id: string) => void;
  onReponerQuick: (id: string, cantidad: number) => void;
  onRegistrarMerma: (p: ProductoVM) => void;
  onEditar: (p: ProductoVM) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  loading: boolean;
}

export function ProductoTable({
  grupos, stockInputs, onStockInput, saving, online,
  onToggleDisponible, onReponer, onReponerQuick, onRegistrarMerma, onEditar,
  nextCursor, loadingMore, onLoadMore, loading,
}: Readonly<ProductoTableProps>) {
  if (loading) return <LoadingRows />;

  const totalProductos = grupos.reduce((s, g) => s + g.productos.length, 0);

  if (totalProductos === 0) {
    return (
      <div className="empty">
        <div className="e-ic"><Icons.Inventario s={24} /></div>
        <h3>Inventario vacío</h3>
        <p>No hay productos que coincidan con la búsqueda o la categoría seleccionada.</p>
      </div>
    );
  }

  return (
    <div className="inventory-list">
      {grupos.map((group) => (
        <div key={group.categoria?.id ?? 'sin-categoria'} className="inventory-group">
          <div className="inventory-group-h">
            <strong>{group.categoria?.nombre ?? 'Sin categoría'}</strong>
            <span className="muted">{group.productos.length} productos</span>
          </div>
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Precio</th>
                  <th>Stock</th>
                  <th>Disponible</th>
                  <th>Reponer</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {group.productos.map((producto) => {
                  const nivel = stockNivel(producto.stockActual);
                  const rowCls = { out: 'row-out', low: 'row-low' }[nivel as string] ?? '';
                  return (
                    <tr key={producto.id} className={rowCls}>
                      <td>
                        <strong>{producto.nombre}</strong>
                        {producto.descripcion && <div className="muted">{producto.descripcion}</div>}
                      </td>
                      <td className="num"><span className="monto">{producto.precioLabel}</span></td>
                      <td>
                        <div className="stock-cell">
                          <span className={`badge ${producto.stockClass}`}>{producto.stockLabel}</span>
                          {nivel === 'out' && <span className="sc-note out">Agotado</span>}
                          {nivel === 'low' && <span className="sc-note low">Stock bajo</span>}
                        </div>
                      </td>
                      <td>
                        <div className="avail-cell">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={producto.disponible}
                            aria-label={`${producto.disponible ? 'Marcar no disponible' : 'Marcar disponible'}: ${producto.nombre}`}
                            className={`toggle ${producto.disponible ? 'on' : ''}`}
                            disabled={saving || !online}
                            onClick={() => onToggleDisponible(producto)}
                          >
                            <span className="knob" />
                          </button>
                          <span className={`av-lbl ${producto.disponible ? '' : 'off'}`}>
                            {producto.disponible ? 'Sí' : 'No'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="repo-cell">
                          <div className="repo-quick">
                            <button disabled={saving || !online} aria-label={`Reponer 5 de ${producto.nombre}`} onClick={() => onReponerQuick(producto.id, 5)}>+5</button>
                            <button disabled={saving || !online} aria-label={`Reponer 10 de ${producto.nombre}`} onClick={() => onReponerQuick(producto.id, 10)}>+10</button>
                          </div>
                          <div className="input">
                            <input
                              min="1"
                              type="number"
                              inputMode="numeric"
                              placeholder="Cant."
                              aria-label={`Cantidad a reponer de ${producto.nombre}`}
                              value={stockInputs[producto.id] ?? ''}
                              onChange={(e) => onStockInput(producto.id, e.target.value)}
                            />
                          </div>
                          <button
                            className="btn btn-sm btn-soft"
                            disabled={saving || !online || !esCantidadValida(stockInputs[producto.id])}
                            onClick={() => onReponer(producto.id)}
                          >
                            Reponer
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={saving || !online || (producto.stockActual ?? 0) <= 0}
                            onClick={() => onRegistrarMerma(producto)}
                            aria-label={`Registrar merma de ${producto.nombre}`}
                          >
                            Merma
                          </button>
                          <button
                            className="btn btn-sm btn-soft"
                            disabled={saving || !online}
                            onClick={() => onEditar(producto)}
                            aria-label={`Editar ${producto.nombre}`}
                          >
                            <Icons.Edit s={14} /> Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {nextCursor && (
        <div className="row center" style={{ padding: '12px' }}>
          <button className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? <span className="spinner" /> : null}
            Cargar más
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="table-wrap table-wrap-flat">
      <table className="dt">
        <thead>
          <tr>
            <th>Producto</th><th className="num">Precio</th>
            <th>Stock</th><th>Disponible</th><th>Reponer</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5].map((i) => (
            <tr key={i}>
              <td><div className="skel" style={{ width: 120, height: 16 }} /></td>
              <td><div className="skel" style={{ width: 60, height: 16, marginLeft: 'auto' }} /></td>
              <td><div className="skel" style={{ width: 40, height: 16 }} /></td>
              <td><div className="skel" style={{ width: 48, height: 24 }} /></td>
              <td><div className="skel" style={{ width: 150, height: 30 }} /></td>
              <td><div className="skel" style={{ width: 140, height: 24 }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
