// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Comandero, groupCatalogProducts } from './Comandero';
import type { CategoriaDto, ProductoVM } from '../../types/inventario.types';

const mocks = vi.hoisted(() => ({ inventario: vi.fn(), menu: vi.fn(), crear: vi.fn(), fetchMore: vi.fn() }));
vi.mock('../../hooks/queries/useInventarioQuery', () => ({ useInventarioQuery: mocks.inventario }));
vi.mock('../../hooks/queries/useMenuDiarioQuery', () => ({ useMenuDiarioQuery: mocks.menu }));
vi.mock('../../hooks/queries/useMesasQuery', () => ({ useMesasQuery: () => ({ mesas: [] }) }));
vi.mock('../../hooks/queries/usePedidosQuery', () => ({ usePedidosQuery: () => ({ crear: mocks.crear }) }));
vi.mock('../../hooks/useFocusTrap', () => ({ useFocusTrap: vi.fn() }));
vi.mock('../ui/ToastProvider', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const categorias: CategoriaDto[] = [
  { id: 'ceviches', nombre: 'Ceviches', area: 'COCINA' },
  { id: 'arroces', nombre: 'Arroces', area: 'COCINA' },
  { id: 'chicharrones', nombre: 'Chicharrones', area: 'COCINA' },
  { id: 'bebidas', nombre: 'Bebidas', area: 'INVENTARIO' },
];
function producto(id: string, categoriaId: string, nombre: string, precio = 25): ProductoVM {
  return {
    id, categoriaId, categoriaNombre: categorias.find((c) => c.id === categoriaId)?.nombre ?? null,
    nombre, precio, precioLabel: '', descripcion: null, disponible: true,
    stockActual: null, stockLabel: '', stockClass: '',
  };
}
const ceviche = producto('c1', 'ceviches', 'Ceviche de pescado', 25);
const arroz = producto('a1', 'arroces', 'Arroz con mariscos', 30);
const chicharron = producto('ch1', 'chicharrones', 'Chicharrón de pota', 20);
const bebida = { ...producto('b1', 'bebidas', 'Agua mineral', 3), stockActual: 10 };
const inventario = () => ({
  productos: [ceviche, arroz, chicharron, bebida], categorias,
  loading: false, loadingMore: false, error: null, nextCursor: null, fetchMore: mocks.fetchMore,
});
const renderComandero = () => render(<Comandero onClose={vi.fn()} mesaId="mesa1" mesaNumero="01" />);
const abrir = (nombre: string) => fireEvent.click(screen.getByRole('button', { name: `Abrir categoría ${nombre}` }));
const volver = () => fireEvent.click(screen.getByRole('button', { name: 'Volver a categorías' }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inventario.mockReturnValue(inventario());
  mocks.menu.mockReturnValue({ menu: [], loading: false });
});
afterEach(cleanup);

describe('Comandero: navegación por categorías', () => {
  it('empieza con tarjetas de categorías, no con todos los platos', () => {
    renderComandero();
    expect(screen.getByRole('heading', { name: 'Elige una categoría' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir categoría Ceviches' })).toHaveClass('cmd-category-tile');
    expect(screen.getByRole('button', { name: 'Abrir categoría Arroces' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Todos', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ceviche de pescado/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Buscar plato' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Categorías de abarrotes' })).getByRole('button', { name: 'Abrir categoría Bebidas' })).toBeInTheDocument();
  });

  it('abre solo los platos de la categoría y muestra su precio', () => {
    renderComandero();
    abrir('Ceviches');
    const detalle = screen.getByRole('region', { name: 'Ceviches' });
    expect(within(detalle).getByRole('button', { name: /Ceviche de pescado S\/ 25.00/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Arroz con mariscos/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a categorías' })).toHaveFocus();
    expect(mocks.inventario).toHaveBeenLastCalledWith('ceviches', expect.objectContaining({ limit: 500 }));
  });

  it('vuelve a las tarjetas y permite entrar en otra categoría', () => {
    renderComandero();
    abrir('Ceviches');
    volver();
    expect(screen.getByRole('button', { name: 'Abrir categoría Ceviches' })).toHaveFocus();
    abrir('Arroces');
    expect(screen.getByRole('region', { name: 'Arroces' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arroz con mariscos/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ceviche de pescado/ })).not.toBeInTheDocument();
  });

  it('conserva los platos, cantidades y notas al cambiar de categoría', () => {
    renderComandero();
    abrir('Ceviches');
    fireEvent.click(screen.getByRole('button', { name: /Ceviche de pescado/ }));
    fireEvent.click(screen.getByRole('button', { name: /1 Ceviche de pescado/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Nota', exact: true }));
    fireEvent.change(screen.getByPlaceholderText('Nota para cocina (ej. sin cebolla)'), { target: { value: 'Sin ají' } });
    volver();
    abrir('Arroces');
    fireEvent.click(screen.getByRole('button', { name: /Arroz con mariscos/ }));
    const cart = within(screen.getByRole('complementary'));
    expect(cart.getByText('Ceviche de pescado')).toBeInTheDocument();
    expect(cart.getByText('Arroz con mariscos')).toBeInTheDocument();
    expect(cart.getByText('3 ítems')).toBeInTheDocument();
    expect(cart.getByDisplayValue('Sin ají')).toBeInTheDocument();
    expect(cart.getAllByText('S/ 80.00')).toHaveLength(2);
    expect(mocks.crear).not.toHaveBeenCalled();
  });

  it('busca dentro de la categoría y limpia la búsqueda al volver', () => {
    renderComandero();
    abrir('Ceviches');
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar plato' }), { target: { value: ' inexistente ' } });
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(mocks.inventario).toHaveBeenLastCalledWith('ceviches', expect.objectContaining({ search: 'inexistente' }));
    volver();
    abrir('Arroces');
    expect(screen.getByRole('textbox', { name: 'Buscar plato' })).toHaveValue('');
    expect(screen.getByRole('button', { name: /Arroz con mariscos/ })).toBeInTheDocument();
  });

  it('no mezcla dos categorías homónimas y consulta por su ID', () => {
    const segundo = { ...arroz, categoriaId: 'ceviches2', categoriaNombre: 'Ceviches' };
    mocks.inventario.mockReturnValue({ ...inventario(), productos: [ceviche, segundo], categorias: [categorias[0], { ...categorias[0], id: 'ceviches2' }] });
    renderComandero();
    fireEvent.click(screen.getAllByRole('button', { name: 'Abrir categoría Ceviches' })[1]);
    expect(screen.getByRole('button', { name: /Arroz con mariscos/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ceviche de pescado/ })).not.toBeInTheDocument();
    expect(mocks.inventario).toHaveBeenLastCalledWith('ceviches2', expect.any(Object));
  });

  it('conserva la carta cacheada si falla la consulta de una categoría', () => {
    mocks.inventario.mockImplementation((id?: string) => id
      ? { ...inventario(), productos: [], error: 'Sin conexión' }
      : inventario());
    renderComandero();
    abrir('Ceviches');
    expect(screen.getByRole('button', { name: /Ceviche de pescado/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Arroz con mariscos/ })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Mostrando los últimos productos guardados');
    volver();
    expect(screen.getByRole('button', { name: 'Abrir categoría Ceviches' })).toHaveFocus();
  });

  it('mantiene Menú del día directo y su carrito al regresar a la carta', () => {
    mocks.menu.mockReturnValue({ menu: [{ id: 'menu1', disponible: true, producto: arroz }], loading: false });
    renderComandero();
    fireEvent.click(screen.getByRole('button', { name: 'Menú del día (1)' }));
    fireEvent.click(screen.getByRole('button', { name: /Arroz con mariscos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'A la carta' }));
    expect(screen.getByRole('button', { name: 'Abrir categoría Ceviches' })).toBeInTheDocument();
    expect(within(screen.getByRole('complementary')).getByText('Arroz con mariscos')).toBeInTheDocument();
  });

  it('mantiene accesibles las categorías y la paginación si quedan productos por cargar', () => {
    mocks.inventario.mockReturnValue({ ...inventario(), productos: [ceviche], nextCursor: 'siguiente' });
    renderComandero();
    expect(screen.getByRole('button', { name: 'Abrir categoría Arroces' })).toBeInTheDocument();
    expect(screen.getByText('1+ platos disponibles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cargar más productos/ }));
    expect(mocks.fetchMore).toHaveBeenCalledOnce();
    abrir('Arroces');
    expect(mocks.inventario).toHaveBeenLastCalledWith('arroces', expect.any(Object));
    expect(screen.getByRole('button', { name: 'Volver a categorías' })).toBeInTheDocument();
  });

  it.each([
    [true, null, 'Cargando carta…'],
    [false, 'No responde', 'No pudimos cargar el catálogo'],
  ])('no confunde el respaldo de otra categoría con arroces cargados (%s, %s)', (loading, error, mensaje) => {
    mocks.inventario.mockImplementation((id?: string) => id === 'arroces'
      ? { ...inventario(), productos: [], loading, error }
      : { ...inventario(), productos: [ceviche], nextCursor: 'siguiente' });
    renderComandero();
    abrir('Arroces');
    expect(mocks.inventario).toHaveBeenLastCalledWith('arroces', expect.any(Object));
    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ceviche de pescado/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a categorías' })).toBeInTheDocument();
    volver();
    expect(screen.getByRole('button', { name: 'Abrir categoría Arroces' })).toHaveFocus();
    expect(screen.getByRole('button', { name: /Cargar más productos/ })).toBeInTheDocument();
  });

  it('oculta categorías sin platos disponibles en un catálogo completo', () => {
    mocks.inventario.mockReturnValue({ ...inventario(), productos: [ceviche, { ...arroz, disponible: false }] });
    renderComandero();
    expect(screen.queryByRole('button', { name: 'Abrir categoría Arroces' })).not.toBeInTheDocument();
  });

  it('permite abrir productos sin metadatos de categoría', () => {
    mocks.inventario.mockReturnValue({ ...inventario(), productos: [{ ...ceviche, categoriaNombre: null }], categorias: [] });
    renderComandero();
    abrir('Sin categoría');
    expect(screen.getByRole('button', { name: /Ceviche de pescado/ })).toBeInTheDocument();
  });

  it.each([
    [true, null, 'Cargando carta…'],
    [false, 'No responde', 'No pudimos cargar el catálogo'],
    [false, null, 'Sin resultados'],
  ])('conserva los estados de carga/error/vacío (%s, %s)', (loading, error, mensaje) => {
    mocks.inventario.mockReturnValue({ ...inventario(), productos: [], categorias: [], loading, error });
    renderComandero();
    expect(screen.getByText(mensaje)).toBeInTheDocument();
  });

  it('agrupa por ID, ordena nombres y cuenta solo disponibles', () => {
    const grupos = groupCatalogProducts([ceviche, arroz, { ...chicharron, disponible: false }], categorias);
    expect(grupos.map((g) => g.nombre)).toEqual(['Arroces', 'Ceviches']);
    expect(grupos[1].productos).toEqual([ceviche]);
  });
});
