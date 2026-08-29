// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductoTable } from './ProductoTable';
import type { ProductoVM } from '../../types/inventario.types';

function producto(overrides: Partial<ProductoVM> = {}): ProductoVM {
  return {
    id: 'p-1',
    categoriaId: 'c-1',
    categoriaNombre: 'Agua Mineral',
    nombre: 'San Carlos 450ml',
    descripcion: null,
    precio: 2,
    precioLabel: 'S/ 2.00',
    disponible: true,
    stockActual: 6,
    stockLabel: '6',
    stockClass: 'badge-ok',
    ...overrides,
  };
}

const onEditar = vi.fn();
const onRegistrarMerma = vi.fn();
const onToggleDisponible = vi.fn();

function renderTable(productos: ProductoVM[] = [producto()], props: Record<string, unknown> = {}) {
  return render(
    <ProductoTable
      grupos={[{ categoria: { id: 'c-1', nombre: 'Agua Mineral' }, productos }]}
      loading={false}
      stockInputs={{}}
      onStockInput={vi.fn()}
      saving={false}
      online
      onToggleDisponible={onToggleDisponible}
      onReponer={vi.fn()}
      onReponerQuick={vi.fn()}
      onRegistrarMerma={onRegistrarMerma}
      onEditar={onEditar}
      nextCursor={null}
      loadingMore={false}
      onLoadMore={vi.fn()}
      {...props}
    />,
  );
}

describe('ProductoTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edita con un botón explícito, no clicando la fila', () => {
    renderTable();

    // La fila en sí no dispara nada: el gesto oculto chocaba con los controles
    // de stock que viven dentro de las celdas.
    fireEvent.click(screen.getByText('San Carlos 450ml'));
    expect(onEditar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Editar San Carlos 450ml' }));
    expect(onEditar).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }));
  });

  it('el botón de merma sigue disponible junto al de editar', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar merma de San Carlos 450ml' }));
    expect(onRegistrarMerma).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }));
  });

  it('no se puede mermar un producto agotado, pero sí editarlo', () => {
    renderTable([producto({ stockActual: 0, stockLabel: '0', stockClass: 'badge-danger' })]);

    expect(screen.getByRole('button', { name: 'Registrar merma de San Carlos 450ml' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Editar San Carlos 450ml' })).toBeEnabled();
  });

  it('sin conexión no se puede editar', () => {
    renderTable([producto()], { online: false });
    expect(screen.getByRole('button', { name: 'Editar San Carlos 450ml' })).toBeDisabled();
  });

  it('marca las filas agotadas y con stock bajo', () => {
    renderTable([
      producto({ id: 'p-1', nombre: 'Sin nada', stockActual: 0 }),
      producto({ id: 'p-2', nombre: 'Poquito', stockActual: 3 }),
    ]);

    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expect(screen.getByText('Stock bajo')).toBeInTheDocument();
  });

  it('muestra el vacío cuando no hay productos', () => {
    renderTable([]);
    expect(screen.getByText('Inventario vacío')).toBeInTheDocument();
  });
});
