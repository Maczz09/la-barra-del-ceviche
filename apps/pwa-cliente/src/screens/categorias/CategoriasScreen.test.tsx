// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoriasScreen } from './CategoriasScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock('../../hooks/queries/useInventarioQuery', () => ({
  useInventarioQuery: vi.fn(),
}));

const mockCategorias = [
  { id: 'cat1', nombre: 'Bebidas', descripcion: 'Frías y calientes', area: 'COCINA' },
  { id: 'cat2', nombre: 'Postres', descripcion: null, area: 'COCINA' },
];

const mockProductos = [
  { id: 'p1', categoriaId: 'cat1', nombre: 'Chicha Morada' },
  { id: 'p2', categoriaId: 'cat1', nombre: 'Inca Kola' },
];

function baseMock(overrides: Record<string, unknown> = {}) {
  return {
    categorias: mockCategorias,
    productos: mockProductos,
    loading: false,
    saving: false,
    error: null,
    success: null,
    fetch: vi.fn(),
    crearCategoria: vi.fn(),
    actualizarCategoria: vi.fn(),
    eliminarCategoria: vi.fn(),
    clearFeedback: vi.fn(),
    ...overrides,
  };
}

describe('CategoriasScreen', () => {
  beforeEach(() => {
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock() as any);
  });

  it('pide productos con un limit permitido por el backend (<=500)', () => {
    render(<CategoriasScreen />);
    const [, options] = vi.mocked(useInventarioQuery).mock.calls[0];
    expect((options as any).limit).toBeLessThanOrEqual(500);
  });

  it('renderiza la lista con el conteo de productos por categoría', () => {
    render(<CategoriasScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Categorías' })).toBeInTheDocument();
    // "Bebidas"/"Postres" también aparecen como <option> del selector de
    // categoría padre — confirmamos que existen en la fila de la tabla.
    expect(screen.getByRole('cell', { name: 'Bebidas' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Postres' })).toBeInTheDocument();
    // Bebidas tiene 2 productos (p1, p2), Postres tiene 0
    const pills = screen.getAllByText(/^[02]$/);
    expect(pills.length).toBeGreaterThanOrEqual(2);
  });

  it('crea una categoría desde el formulario lateral', async () => {
    const crearCategoria = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ crearCategoria }) as any);

    render(<CategoriasScreen />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Entradas' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear categoría/i }));

    await waitFor(() => {
      expect(crearCategoria).toHaveBeenCalledWith({ nombre: 'Entradas', descripcion: undefined, parentId: undefined, area: 'COCINA' });
    });
  });

  it('crea una subcategoría cuando se elige una categoría padre', async () => {
    const crearCategoria = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ crearCategoria }) as any);

    render(<CategoriasScreen />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Bebidas Calientes' } });
    fireEvent.change(screen.getByLabelText('Categoría padre'), { target: { value: 'cat1' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear categoría/i }));

    await waitFor(() => {
      expect(crearCategoria).toHaveBeenCalledWith({ nombre: 'Bebidas Calientes', descripcion: undefined, parentId: 'cat1', area: 'COCINA' });
    });
  });

  it('solo ofrece categorías principales como opción de padre', () => {
    const conSub = [
      ...mockCategorias,
      { id: 'cat3', nombre: 'Calientes', descripcion: null, parentId: 'cat1' },
    ];
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ categorias: conSub }) as any);

    render(<CategoriasScreen />);
    const select = screen.getByLabelText('Categoría padre') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toEqual(['Ninguna (categoría principal)', 'Bebidas', 'Postres']);
    expect(options).not.toContain('Calientes');
  });

  it('muestra las subcategorías indentadas debajo de su categoría padre', () => {
    const conSub = [
      ...mockCategorias,
      { id: 'cat3', nombre: 'Calientes', descripcion: null, parentId: 'cat1' },
    ];
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ categorias: conSub }) as any);

    render(<CategoriasScreen />);
    const filas = screen.getAllByRole('row').slice(1); // sin la fila de encabezado
    const nombresEnOrden = filas.map((f) => f.textContent);
    // Bebidas y su subcategoría Calientes van juntas, antes que Postres.
    expect(nombresEnOrden[0]).toContain('Bebidas');
    expect(nombresEnOrden[1]).toContain('Calientes');
    expect(nombresEnOrden[2]).toContain('Postres');
  });

  it('edita una categoría existente', async () => {
    const actualizarCategoria = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ actualizarCategoria }) as any);

    render(<CategoriasScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar Bebidas' }));

    // "Nombre" está duplicado en pantalla (form lateral "Nueva categoría" +
    // drawer de edición); el input del drawer es el único precargado con "Bebidas".
    const nombreInput = screen.getByDisplayValue('Bebidas') as HTMLInputElement;
    fireEvent.change(nombreInput, { target: { value: 'Bebidas Frías' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(actualizarCategoria).toHaveBeenCalledWith('cat1', { nombre: 'Bebidas Frías', descripcion: 'Frías y calientes', parentId: null });
    });
  });

  it('deshabilita el selector de padre al editar una categoría que ya tiene subcategorías', () => {
    const conSub = [
      ...mockCategorias,
      { id: 'cat3', nombre: 'Calientes', descripcion: null, parentId: 'cat1' },
    ];
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ categorias: conSub }) as any);

    render(<CategoriasScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar Bebidas' }));

    // "Categoría padre" está duplicado (form lateral + drawer de edición);
    // el segundo select (por orden en el DOM) es el del drawer.
    const selects = screen.getAllByLabelText('Categoría padre');
    expect(selects[1]).toBeDisabled();
    expect(screen.getByText(/ya tiene subcategorías propias/i)).toBeInTheDocument();
  });

  it('bloquea eliminar una categoría con subcategorías asociadas', () => {
    const eliminarCategoria = vi.fn();
    const conSub = [
      ...mockCategorias,
      { id: 'cat3', nombre: 'Calientes', descripcion: null, parentId: 'cat1' },
    ];
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ categorias: conSub, eliminarCategoria }) as any);

    render(<CategoriasScreen />);
    const btn = screen.getByRole('button', { name: 'Eliminar Bebidas' });
    expect(btn).toBeDisabled();

    fireEvent.click(btn);
    expect(eliminarCategoria).not.toHaveBeenCalled();
  });

  it('bloquea eliminar una categoría con productos asociados', () => {
    const eliminarCategoria = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ eliminarCategoria }) as any);

    render(<CategoriasScreen />);
    const btn = screen.getByRole('button', { name: 'Eliminar Bebidas' });
    expect(btn).toBeDisabled();

    fireEvent.click(btn);
    expect(eliminarCategoria).not.toHaveBeenCalled();
  });

  it('elimina una categoría sin productos tras confirmar', async () => {
    const eliminarCategoria = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ eliminarCategoria }) as any);

    render(<CategoriasScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Postres' }));

    await waitFor(() => {
      expect(eliminarCategoria).toHaveBeenCalledWith('cat2');
    });
    vi.mocked(window.confirm).mockRestore();
  });

  it('no elimina si el usuario cancela la confirmación', () => {
    const eliminarCategoria = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ eliminarCategoria }) as any);

    render(<CategoriasScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Postres' }));

    expect(eliminarCategoria).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockRestore();
  });

  it('muestra estado vacío cuando no hay categorías', () => {
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ categorias: [], productos: [] }) as any);
    render(<CategoriasScreen />);
    expect(screen.getByText('Sin categorías')).toBeInTheDocument();
  });

  it('muestra el banner de sin conexión y deshabilita mutaciones', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<CategoriasScreen />);
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear categoría/i })).toBeDisabled();
  });

  it('muestra el banner de error y permite cerrarlo', () => {
    const clearFeedback = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue(baseMock({ error: 'Ya existe una categoría llamada "Bebidas"', clearFeedback }) as any);
    render(<CategoriasScreen />);
    expect(screen.getByText('Ya existe una categoría llamada "Bebidas"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(clearFeedback).toHaveBeenCalled();
  });
});
