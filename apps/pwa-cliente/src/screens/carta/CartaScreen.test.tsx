// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CartaScreen } from './CartaScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';
import { useAuthStore } from '../../store/auth.store';
import { useToast } from '../../components/ui/ToastProvider';
import { useTamanosPlatoQuery } from '../../hooks/queries/useTamanosPlatoQuery';

vi.mock('../../hooks/queries/useTamanosPlatoQuery');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn()
}));

vi.mock('../../store/auth.store');

vi.mock('../../hooks/queries/useInventarioQuery', () => ({
  useInventarioQuery: vi.fn()
}));

vi.mock('../../hooks/queries/useMenuDiarioQuery', () => ({
  useMenuDiarioQuery: vi.fn(() => ({
    menu: [],
    loading: false,
    saving: false,
    error: null,
    success: null,
    agregarAlMenu: vi.fn(),
    actualizarDisponibilidad: vi.fn(),
    quitarDelMenu: vi.fn(),
    fetch: vi.fn(),
    clearFeedback: vi.fn(),
  }))
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn()
}));

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    Search: () => <svg data-testid="icon-search" />,
    Plus: () => <svg data-testid="icon-plus" />,
    Alert: () => <svg data-testid="icon-alert" />,
    Check: () => <svg data-testid="icon-check" />,
    Pedidos: () => <svg data-testid="icon-pedidos" />,
    Close: () => <svg data-testid="icon-close" />,
    Layers: () => <svg data-testid="icon-layers" />,
    Cocina: () => <svg data-testid="icon-cocina" />,
    Drink: () => <svg data-testid="icon-drink" />
  }
}));

vi.mock('../../components/ui/Stat', () => ({
  MiniStat: ({ k, v, d }: any) => <div data-testid={`stat-${k}`}>{v} - {d}</div>
}));

const mockCategorias = [
  { id: 'cat1', nombre: 'Platos de Fondo', area: 'COCINA' },
  { id: 'cat2', nombre: 'Bebidas', area: 'BARRA' }
];

const mockProductos = [
  { id: 'p1', nombre: 'Lomo Saltado', descripcion: 'Rico', categoriaId: 'cat1', categoriaNombre: 'Platos de Fondo', precio: 25.5, precioLabel: 'S/ 25.50', disponible: true },
  { id: 'p2', nombre: 'Chicha', descripcion: '', categoriaId: 'cat2', categoriaNombre: 'Bebidas', precio: 5, precioLabel: 'S/ 5.00', disponible: false }
];
const tamanos = [
  { id: 'personal', nombre: 'Personal', orden: 10, activo: true },
  { id: 'familiar', nombre: 'Familiar', orden: 30, activo: true },
  { id: 'antiguo', nombre: 'Antiguo', orden: 40, activo: false },
];

describe('CartaScreen', () => {
  const toastMock = vi.fn();

  beforeEach(() => {
    mockNavigate.mockClear();
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    (useAuthStore as any).mockReturnValue('ADMIN'); // rol
    vi.mocked(useToast).mockReturnValue({ toast: toastMock } as any);
    vi.mocked(useTamanosPlatoQuery).mockReturnValue({
      tamanos, loading: false, saving: false, error: null,
      crearTamano: vi.fn(), actualizarTamano: vi.fn(), eliminarTamano: vi.fn(), fetch: vi.fn(), clearFeedback: vi.fn(),
    });
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn(),
      actualizarDisponibilidad: vi.fn(),
    } as any);
  });

  it('renders and handles filtering', () => {
    render(<CartaScreen />);

    expect(screen.getByText('Carta / Menú')).toBeDefined();
    
    // Check categories tabs
    expect(screen.getAllByText(/Platos de Fondo/i)[0]).toBeDefined();
    
    // Switch tab
    fireEvent.click(screen.getAllByText(/Bebidas/i)[0]);
    
    // Search
    fireEvent.change(screen.getByPlaceholderText('Buscar plato…'), { target: { value: 'Lomo' } });
  });

  it('el filtro de estación (Cocina/Barra) oculta las categorías y platos de la otra área', () => {
    render(<CartaScreen />);

    // Ambas categorías visibles con "Todas las estaciones"
    expect(screen.getAllByText(/Platos de Fondo/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bebidas/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Lomo Saltado')).toBeInTheDocument();
    expect(screen.getByText('Chicha')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cocina/i }));

    // Solo la categoría/plato de Cocina queda visible
    expect(screen.getAllByText(/Platos de Fondo/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Bebidas/i)).not.toBeInTheDocument();
    expect(screen.getByText('Lomo Saltado')).toBeInTheDocument();
    expect(screen.queryByText('Chicha')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Barra$/i }));

    expect(screen.queryByText(/Platos de Fondo/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Bebidas/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Lomo Saltado')).not.toBeInTheDocument();
    expect(screen.getByText('Chicha')).toBeInTheDocument();
  });

  it('muestra "Padre › Hijo" para platos en una subcategoría', () => {
    const conSub = [...mockCategorias, { id: 'cat3', nombre: 'Calientes', parentId: 'cat2' }];
    const conProdSub = [...mockProductos, { id: 'p3', nombre: 'Café', descripcion: '', categoriaId: 'cat3', categoriaNombre: 'Calientes', precio: 6, precioLabel: 'S/ 6.00', disponible: true }];
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: conSub,
      productos: conProdSub,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn(),
      actualizarDisponibilidad: vi.fn(),
    } as any);

    render(<CartaScreen />);

    // Aparece tanto en el tab de categoría como en la celda del plato.
    expect(screen.getAllByText(/Bebidas › Calientes/).length).toBeGreaterThanOrEqual(1);
  });

  it('handles toggle disp', async () => {
    const actualizarDisponibilidad = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn(),
      actualizarDisponibilidad,
    } as any);

    render(<CartaScreen />);

    // Click toggle of first product
    const toggles = screen.getAllByRole('button', { name: /Disponible/i });
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(actualizarDisponibilidad).toHaveBeenCalledWith('p1', false);
    });
  });

  it('handles toggle disp offline and error', async () => {
    const actualizarDisponibilidad = vi.fn().mockRejectedValue(new Error('Update failed'));
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn(),
      actualizarDisponibilidad,
    } as any);

    const { rerender } = render(<CartaScreen />);

    // Click toggle
    const toggles = screen.getAllByRole('button', { name: /Disponible/i });
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({ title: 'No se pudo actualizar', msg: 'Update failed', icon: 'Alert', kind: 'err' });
    });

    vi.mocked(useOnlineStatus).mockReturnValue(false);
    rerender(<CartaScreen />);

    toastMock.mockClear();
    fireEvent.click(toggles[0]);
    expect(actualizarDisponibilidad).toHaveBeenCalledTimes(1); // not called again
  });

  it('handles edit product and save error', async () => {
    const actualizarProducto = vi.fn().mockRejectedValue(new Error('Edit error'));
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto
    } as any);

    render(<CartaScreen />);

    // Click on row to edit
    fireEvent.click(screen.getByText('Lomo Saltado'));
    
    // Edit Drawer is open
    expect(screen.getByLabelText('Nombre')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Lomo Saltado Editado' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(actualizarProducto).toHaveBeenCalledWith('p1', { nombre: 'Lomo Saltado Editado', descripcion: 'Rico', categoriaId: 'cat1', tamanoId: null, precio: 25.5, disponible: true });
    });
    
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({ title: 'No se pudo guardar', msg: 'Edit error', icon: 'Alert', kind: 'err' });
    });

    // Close
    fireEvent.click(screen.getByTestId('scrim'));
  });

  it('handles create product', async () => {
    const crearProducto = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto,
      actualizarProducto: vi.fn()
    } as any);

    render(<CartaScreen />);

    // Nuevo Plato
    fireEvent.click(screen.getByRole('button', { name: /Nuevo plato/i }));
    
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ceviche' } });
    fireEvent.change(screen.getByLabelText('Precio de venta'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'cat2' } });
    
    // Toggle disp
    const toggles = screen.getAllByRole('button');
    const drawerToggle = toggles.find(b => b.className.includes('toggle') && !b.hasAttribute('title'));
    if (drawerToggle) fireEvent.click(drawerToggle); // Turn off
    
    fireEvent.click(screen.getByRole('button', { name: /Crear plato/i }));

    await waitFor(() => {
      expect(crearProducto).toHaveBeenCalledWith({ nombre: 'Ceviche', descripcion: undefined, categoriaId: 'cat2', tamanoId: null, precio: 35, disponible: false });
    });
  });

  it('saves a description entered in the drawer', async () => {
    const crearProducto = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto,
      actualizarProducto: vi.fn()
    } as any);

    render(<CartaScreen />);

    fireEvent.click(screen.getByRole('button', { name: /Nuevo plato/i }));

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ceviche' } });
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Pescado fresco, limón, cebolla' } });
    fireEvent.change(screen.getByLabelText('Precio de venta'), { target: { value: '35' } });

    fireEvent.click(screen.getByRole('button', { name: /Crear plato/i }));

    await waitFor(() => {
      expect(crearProducto).toHaveBeenCalledWith(
        expect.objectContaining({ descripcion: 'Pescado fresco, limón, cebolla' }),
      );
    });
  });

  it('handles loading state and empty state', () => {
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: [],
      productos: [],
      loading: true,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn()
    } as any);

    render(<CartaScreen />);

    expect(screen.getByText('Cargando carta…')).toBeDefined();
  });
  
  it('handles empty filtered state', () => {
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: [],
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn()
    } as any);

    render(<CartaScreen />);

    expect(screen.getByText(/Sin platos. Crea uno con "Nuevo plato"./i)).toBeDefined();
  });

  it('T-20: cambia a la vista de Menú del día y oculta la tabla de la carta', () => {
    render(<CartaScreen />);

    expect(screen.getByText('Lomo Saltado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menú del día' }));

    expect(screen.queryByText('Lomo Saltado')).not.toBeInTheDocument();
    expect(screen.getByText(/Aún no hay platos en el menú de hoy/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A la carta' }));
    expect(screen.getByText('Lomo Saltado')).toBeInTheDocument();
  });

  it('T-21: navega a Categorías desde el atajo de Carta/Menú', () => {
    render(<CartaScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Gestionar categorías/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/app/categorias');
  });

  it('crea el plato con el tamaño elegido y nombre base separado', async () => {
    const crearProducto = vi.fn().mockResolvedValue({});
    const base = vi.mocked(useInventarioQuery)();
    vi.mocked(useInventarioQuery).mockReturnValue({ ...base, crearProducto });
    render(<CartaScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Nuevo plato/i }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ceviche' } });
    fireEvent.change(screen.getByLabelText('Precio de venta'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Tamaño del plato'), { target: { value: 'familiar' } });
    expect(within(screen.getByLabelText('Tamaño del plato')).queryByRole('option', { name: /Antiguo/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crear plato' }));
    await waitFor(() => expect(crearProducto).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Ceviche', tamanoId: 'familiar', precio: 45 })));
  });

  it('muestra tamaños y ordena Personal antes de Familiar, luego sin tamaño; permite filtrar', () => {
    const base = vi.mocked(useInventarioQuery)();
    vi.mocked(useInventarioQuery).mockReturnValue({ ...base, productos: [
      { ...mockProductos[0], id: 'fam', nombre: 'Arroz familiar', tamanoId: 'familiar', tamano: tamanos[1] },
      { ...mockProductos[0], id: 'sin', nombre: 'Acompañamiento' },
      { ...mockProductos[0], id: 'per', nombre: 'Ceviche personal', tamanoId: 'personal', tamano: tamanos[0] },
    ] } as any);
    render(<CartaScreen />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Ceviche personal');
    expect(rows[0]).toHaveTextContent('Personal');
    expect(rows[1]).toHaveTextContent('Arroz familiar');
    expect(rows[2]).toHaveTextContent('Acompañamiento');
    fireEvent.change(screen.getByLabelText('Filtrar por tamaño'), { target: { value: 'familiar' } });
    expect(screen.getByText('Arroz familiar')).toBeInTheDocument();
    expect(screen.queryByText('Ceviche personal')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrar por tamaño'), { target: { value: 'SIN_TAMANO' } });
    expect(screen.getByText('Acompañamiento')).toBeInTheDocument();
    expect(screen.queryByText('Arroz familiar')).not.toBeInTheDocument();
  });

  it('precarga tamaño inactivo existente y permite quitarlo sin perder datos', async () => {
    const base = vi.mocked(useInventarioQuery)();
    const actualizarProducto = vi.fn().mockResolvedValue({});
    vi.mocked(useInventarioQuery).mockReturnValue({ ...base, actualizarProducto, productos: [{ ...mockProductos[0], tamanoId: 'antiguo', tamano: tamanos[2] }] } as any);
    render(<CartaScreen />);
    fireEvent.click(screen.getByText('Lomo Saltado'));
    expect(screen.getByLabelText('Tamaño del plato')).toHaveValue('antiguo');
    expect(within(screen.getByLabelText('Tamaño del plato')).getByRole('option', { name: 'Antiguo (inactivo)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tamaño del plato'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(actualizarProducto).toHaveBeenCalledWith('p1', expect.objectContaining({ nombre: 'Lomo Saltado', tamanoId: null, precio: 25.5 })));
  });

  it('abre gestión de tamaños y no la ofrece a cocina', () => {
    const { unmount } = render(<CartaScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Tamaños' }));
    expect(screen.getByRole('dialog', { name: 'Tamaños de platos' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tamaños' }));
    unmount();
    (useAuthStore as any).mockReturnValue('COCINA');
    render(<CartaScreen />);
    expect(screen.queryByRole('button', { name: 'Tamaños' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo plato' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por tamaño')).toBeInTheDocument();
  });
});
