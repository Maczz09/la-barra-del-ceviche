// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { InventarioScreen } from './InventarioScreen';
import { ToastProvider } from '../../components/ui/ToastProvider';
import * as onlineStatusHook from '../../hooks/useOnlineStatus';
import * as inventarioQueryHook from '../../hooks/queries/useInventarioQuery';

vi.mock('../../components/inventario/ProductoTable', () => ({
  ProductoTable: ({ onToggleDisponible, onReponer, onReponerQuick, onLoadMore, onStockInput, stockInputs, onEditar }: any) => (
    <div data-testid="producto-table">
      <button onClick={() => onToggleDisponible({ id: 'P1', disponible: true })}>Toggle P1</button>
      <button onClick={() => onReponer('P1')}>Reponer P1</button>
      <button onClick={() => onReponerQuick('P1', 5)}>Quick Reponer P1</button>
      <button onClick={() => onLoadMore()}>Load More</button>
      <input data-testid="stock-input-P1" value={stockInputs['P1'] || ''} onChange={(e) => onStockInput('P1', e.target.value)} />
      <button onClick={() => onEditar({ id: 'P1', nombre: 'Producto 1', categoriaId: 'C1', precio: 10 })}>Editar P1</button>
    </div>
  )
}));

vi.mock('../../components/inventario/EditarProductoModal', () => ({
  EditarProductoModal: ({ producto, onSave, onClose }: any) => (
    <div data-testid="editar-producto-modal">
      <span>Editando {producto.nombre}</span>
      <button onClick={() => onSave({ nombre: 'Producto 1 editado', categoriaId: 'C1', precio: 12 })}>Guardar edición</button>
      <button onClick={onClose}>Cerrar edición</button>
    </div>
  )
}));

// La pantalla lee la sede activa (para la cabecera del PDF) con react-query;
// estos tests renderizan sin QueryClientProvider, así que se stubea el hook.
const mockGetTodosLosProductos = vi.fn();
vi.mock('../../api/inventario.api', () => ({
  getTodosLosProductos: (...args: any[]) => mockGetTodosLosProductos(...args),
}));

const mockExportarInventarioPdf = vi.fn();
vi.mock('../../utils/inventarioPdf', () => ({
  exportarInventarioPdf: (...args: any[]) => mockExportarInventarioPdf(...args),
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: () => ({ sede: { id: 'S1', nombre: 'Sede Centro' }, loading: false }),
}));

// La pestaña de almacén trae sus propias queries; acá solo se prueba la de
// productos de venta, así que se reemplaza por un marcador.
vi.mock('../../components/inventario/AlmacenCocinaTab', () => ({
  AlmacenCocinaTab: () => <div data-testid="almacen-cocina-tab" />,
}));

vi.mock('../../hooks/queries/useMermasQuery', () => ({
  useMermasQuery: () => ({
    mermas: [],
    loading: false,
    saving: false,
    error: null,
    success: null,
    fetch: vi.fn(),
    registrarMerma: vi.fn(),
    clearFeedback: vi.fn(),
  })
}));

vi.mock('../../components/inventario/NuevoProductoForm', () => ({
  NuevoProductoForm: ({ form, onChange, onSubmit }: any) => (
    <form data-testid="nuevo-producto-form" onSubmit={onSubmit}>
      <input data-testid="form-nombre" value={form.nombre} onChange={(e) => onChange('nombre', e.target.value)} />
      <button type="submit">Submit Form</button>
    </form>
  )
}));

function renderScreen() {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <InventarioScreen />
      </ToastProvider>
    </BrowserRouter>,
  );
}

describe('InventarioScreen', () => {
  const mockCrearProducto = vi.fn().mockResolvedValue(true);
  const mockActualizarProducto = vi.fn().mockResolvedValue(true);
  const mockReponerStock = vi.fn().mockResolvedValue(true);
  const mockClearFeedback = vi.fn();
  const mockFetch = vi.fn();
  const mockFetchMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(true);
    vi.spyOn(inventarioQueryHook, 'useInventarioQuery').mockReturnValue({
      categorias: [{ id: 'C1', nombre: 'Categoría 1', area: 'INVENTARIO' }],
      productos: [
        { id: 'P1', nombre: 'Producto 1', categoriaId: 'C1', stockActual: 10, disponible: true, precio: 10, minStock: 5 },
        { id: 'P2', nombre: 'Producto 2', categoriaId: 'C1', stockActual: 0, disponible: false, precio: 5, minStock: 2 }
      ],
      nextCursor: 'cursor123',
      loading: false,
      loadingMore: false,
      saving: false,
      error: null,
      success: null,
      fetch: mockFetch,
      fetchMore: mockFetchMore,
      crearProducto: mockCrearProducto,
      actualizarProducto: mockActualizarProducto,
      reponerStock: mockReponerStock,
      clearFeedback: mockClearFeedback
    } as any);
  });

  it('renders InventarioScreen and triggers fetch on refresh', () => {
    renderScreen();
    expect(screen.getByText('Inventario')).toBeInTheDocument();

    const refreshBtn = screen.getByTitle('Refrescar');
    fireEvent.click(refreshBtn);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('shows error feedback and can clear it', () => {
    vi.spyOn(inventarioQueryHook, 'useInventarioQuery').mockReturnValue({
      categorias: [], productos: [], nextCursor: null, loading: false, loadingMore: false, saving: false,
      error: 'Error message', success: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crearProducto: mockCrearProducto, actualizarProducto: mockActualizarProducto, reponerStock: mockReponerStock, clearFeedback: mockClearFeedback
    } as any);
    renderScreen();
    expect(screen.getByText('Error message')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cerrar'));
    expect(mockClearFeedback).toHaveBeenCalled();
  });

  it('shows offline warning', () => {
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    renderScreen();
    expect(screen.getByText('Sin conexión. Las mutaciones están deshabilitadas.')).toBeInTheDocument();
  });

  it('handles search and category change', () => {
    renderScreen();
    const searchInput = screen.getByPlaceholderText('Buscar producto…');
    fireEvent.change(searchInput, { target: { value: 'Prod' } });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'C1' } });

    // Changing value should just work
    expect((searchInput as HTMLInputElement).value).toBe('Prod');
    expect((select as HTMLSelectElement).value).toBe('C1');
  });

  it('handles new product creation', async () => {
    renderScreen();
    const nameInput = screen.getByTestId('form-nombre');
    fireEvent.change(nameInput, { target: { value: 'New Prod' } });

    const form = screen.getByTestId('nuevo-producto-form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockCrearProducto).toHaveBeenCalled();
    });
  });

  it('does not create product if offline', async () => {
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    renderScreen();
    const form = screen.getByTestId('nuevo-producto-form');
    fireEvent.submit(form);
    expect(mockCrearProducto).not.toHaveBeenCalled();
  });

  it('handles errors when creating product', async () => {
    mockCrearProducto.mockRejectedValueOnce(new Error('Network error'));
    renderScreen();
    const form = screen.getByTestId('nuevo-producto-form');

    fireEvent.submit(form);

    // El error se muestra al usuario vía toast, no solo en consola.
    await waitFor(() => {
      expect(screen.getByText('No se pudo crear el producto')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles product table actions', async () => {
    renderScreen();

    fireEvent.click(screen.getByText('Toggle P1'));
    await waitFor(() => {
      expect(mockActualizarProducto).toHaveBeenCalledWith('P1', { disponible: false });
    });

    // Set stock input and reponer
    const stockInput = screen.getByTestId('stock-input-P1');
    fireEvent.change(stockInput, { target: { value: '10' } });
    fireEvent.click(screen.getByText('Reponer P1'));
    await waitFor(() => {
      expect(mockReponerStock).toHaveBeenCalledWith('P1', 10);
    });

    fireEvent.click(screen.getByText('Quick Reponer P1'));
    await waitFor(() => {
      expect(mockReponerStock).toHaveBeenCalledWith('P1', 5);
    });
  });

  it('does not reponer if quantity is invalid or offline', async () => {
    renderScreen();
    const stockInput = screen.getByTestId('stock-input-P1');
    fireEvent.change(stockInput, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Reponer P1'));
    expect(mockReponerStock).not.toHaveBeenCalled();

    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    fireEvent.change(stockInput, { target: { value: '5' } });
    fireEvent.click(screen.getByText('Reponer P1'));
    expect(mockReponerStock).not.toHaveBeenCalled();
  });

  it('handles toggle and quick reponer offline or saving correctly', async () => {
    vi.spyOn(inventarioQueryHook, 'useInventarioQuery').mockReturnValue({
      categorias: [], productos: [], nextCursor: null, loading: false, loadingMore: false, saving: true,
      error: null, success: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crearProducto: mockCrearProducto, actualizarProducto: mockActualizarProducto, reponerStock: mockReponerStock, clearFeedback: mockClearFeedback
    } as any);
    const { unmount } = renderScreen();
    fireEvent.click(screen.getByText('Toggle P1'));
    expect(mockActualizarProducto).not.toHaveBeenCalled();
    unmount();

    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    vi.spyOn(inventarioQueryHook, 'useInventarioQuery').mockReturnValue({
      categorias: [], productos: [], nextCursor: null, loading: false, loadingMore: false, saving: false,
      error: null, success: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crearProducto: mockCrearProducto, actualizarProducto: mockActualizarProducto, reponerStock: mockReponerStock, clearFeedback: mockClearFeedback
    } as any);
    renderScreen();
    fireEvent.click(screen.getByText('Quick Reponer P1'));
    expect(mockReponerStock).not.toHaveBeenCalled();
  });

  it('catches errors in quick reponer and toggle', async () => {
    mockActualizarProducto.mockRejectedValueOnce(new Error('error toggle'));
    mockReponerStock.mockRejectedValueOnce(new Error('error reponer'));

    renderScreen();
    fireEvent.click(screen.getByText('Toggle P1'));
    await waitFor(() => {
      expect(screen.getByText('No se pudo actualizar el producto')).toBeInTheDocument();
      expect(screen.getByText('error toggle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Quick Reponer P1'));
    await waitFor(() => {
      expect(screen.getByText('No se pudo reponer el stock')).toBeInTheDocument();
      expect(screen.getByText('error reponer')).toBeInTheDocument();
    });
  });

  it('abre el modal de edición, guarda y lo cierra', async () => {
    renderScreen();

    expect(screen.queryByTestId('editar-producto-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Editar P1'));
    expect(screen.getByTestId('editar-producto-modal')).toBeInTheDocument();
    expect(screen.getByText('Editando Producto 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Guardar edición'));
    await waitFor(() => {
      expect(mockActualizarProducto).toHaveBeenCalledWith('P1', { nombre: 'Producto 1 editado', categoriaId: 'C1', precio: 12 });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('editar-producto-modal')).not.toBeInTheDocument();
    });
  });

  it('cierra el modal de edición sin guardar', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Editar P1'));
    expect(screen.getByTestId('editar-producto-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cerrar edición'));
    expect(screen.queryByTestId('editar-producto-modal')).not.toBeInTheDocument();
  });

  it('muestra error si falla la actualización del producto', async () => {
    mockActualizarProducto.mockRejectedValueOnce(new Error('error actualizar'));
    renderScreen();
    fireEvent.click(screen.getByText('Editar P1'));
    fireEvent.click(screen.getByText('Guardar edición'));
    await waitFor(() => {
      expect(screen.getByText('No se pudo actualizar el producto')).toBeInTheDocument();
      expect(screen.getByText('error actualizar')).toBeInTheDocument();
    });
    // El modal se mantiene abierto para que el usuario pueda reintentar.
    expect(screen.getByTestId('editar-producto-modal')).toBeInTheDocument();
  });

  it('catches errors in handleReponer', async () => {
    mockReponerStock.mockRejectedValueOnce(new Error('error handle reponer'));

    renderScreen();
    const stockInput = screen.getByTestId('stock-input-P1');
    fireEvent.change(stockInput, { target: { value: '10' } });
    fireEvent.click(screen.getByText('Reponer P1'));

    await waitFor(() => {
      expect(screen.getByText('No se pudo reponer el stock')).toBeInTheDocument();
      expect(screen.getByText('error handle reponer')).toBeInTheDocument();
    });
  });

  describe('descarga de PDF (T-49)', () => {
    beforeEach(() => {
      mockGetTodosLosProductos.mockResolvedValue([
        { id: 'P1', nombre: 'Producto 1', categoriaId: 'C1', stockActual: 10, disponible: true, precio: 10 },
      ]);
      mockExportarInventarioPdf.mockResolvedValue('inventario-cuadre_2026-08-24.pdf');
    });

    it('el botón PDF abre el modal de opciones', () => {
      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: /PDF/i }));
      expect(screen.getByLabelText('Descargar inventario en PDF')).toBeInTheDocument();
    });

    it('se deshabilita sin conexión: el PDF necesita recorrer todo el inventario', () => {
      vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
      renderScreen();
      expect(screen.getByRole('button', { name: /PDF/i })).toBeDisabled();
    });

    it('exporta con TODO el inventario, no solo la página en pantalla', async () => {
      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: /PDF/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));

      await waitFor(() => {
        expect(mockGetTodosLosProductos).toHaveBeenCalledWith({ conStock: true });
      });
      expect(mockExportarInventarioPdf).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ formato: 'cuadre', sedeNombre: 'Sede Centro', filtroLabel: 'Todo el inventario' }),
      );
    });

    it('cierra el modal y avisa con el nombre del archivo generado', async () => {
      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: /PDF/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));

      await waitFor(() => {
        expect(screen.getByText('inventario-cuadre_2026-08-24.pdf')).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Descargar inventario en PDF')).not.toBeInTheDocument();
    });

    it('avisa si la generación falla y deja el modal abierto para reintentar', async () => {
      mockGetTodosLosProductos.mockRejectedValueOnce(new Error('sin red'));
      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: /PDF/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));

      await waitFor(() => {
        expect(screen.getByText('No se pudo generar el PDF')).toBeInTheDocument();
      });
      expect(screen.getByLabelText('Descargar inventario en PDF')).toBeInTheDocument();
    });
  });

  describe('pestañas (T-50)', () => {
    it('arranca en productos de venta y puede cambiar al almacén de cocina', () => {
      renderScreen();
      expect(screen.getByTestId('producto-table')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Almacén de cocina'));

      expect(screen.getByTestId('almacen-cocina-tab')).toBeInTheDocument();
      expect(screen.queryByTestId('producto-table')).not.toBeInTheDocument();
    });

    it('en el almacén no se ofrecen las acciones de productos de venta', () => {
      renderScreen();
      fireEvent.click(screen.getByText('Almacén de cocina'));

      expect(screen.queryByRole('button', { name: /PDF/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Ver mermas')).not.toBeInTheDocument();
    });
  });
});
