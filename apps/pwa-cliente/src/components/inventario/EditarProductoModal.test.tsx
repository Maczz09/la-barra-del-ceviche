// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditarProductoModal } from './EditarProductoModal';
import type { ProductoVM } from '../../types/inventario.types';

vi.mock('../ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose} />,
}));

const producto: ProductoVM = {
  id: 'prod-1',
  categoriaId: 'cat-1',
  categoriaNombre: 'Bebidas',
  nombre: 'Cerveza',
  descripcion: 'Botella 620ml',
  precio: 8,
  precioLabel: 'S/ 8.00',
  disponible: true,
  stockActual: 10,
  stockLabel: '10',
  stockClass: 'badge-ok',
};

const categorias = [
  { id: 'cat-1', nombre: 'Bebidas' },
  { id: 'cat-2', nombre: 'Abarrotes' },
];

describe('EditarProductoModal', () => {
  it('precarga los valores actuales del producto', () => {
    render(<EditarProductoModal producto={producto} categorias={categorias} saving={false} online={true} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByLabelText('Nombre')).toHaveValue('Cerveza');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Botella 620ml');
    expect(screen.getByLabelText('Precio')).toHaveValue(8);
    expect(screen.getByLabelText('Categoría')).toHaveValue('cat-1');
  });

  it('deshabilita guardar si el nombre queda vacío', () => {
    render(<EditarProductoModal producto={producto} categorias={categorias} saving={false} online={true} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('envía el payload con los cambios (precio, categoría, nombre)', () => {
    const onSave = vi.fn();
    render(<EditarProductoModal producto={producto} categorias={categorias} saving={false} online={true} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '9.50' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'cat-2' } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cerveza Cusqueña' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    expect(onSave).toHaveBeenCalledWith({
      categoriaId: 'cat-2',
      nombre: 'Cerveza Cusqueña',
      descripcion: 'Botella 620ml',
      precio: 9.5,
    });
  });

  it('no deja guardar sin conexión ni mientras guarda', () => {
    const { rerender } = render(<EditarProductoModal producto={producto} categorias={categorias} saving={false} online={false} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();

    rerender(<EditarProductoModal producto={producto} categorias={categorias} saving={true} online={true} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('cierra con el scrim y el botón de cerrar', () => {
    const onClose = vi.fn();
    render(<EditarProductoModal producto={producto} categorias={categorias} saving={false} online={true} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
