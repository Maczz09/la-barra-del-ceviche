// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TamanoSelect } from './TamanoSelect';

describe('TamanoSelect', () => {
  it('ordena las opciones activas y conserva el tamaño inactivo actual', () => {
    const onChange = vi.fn();
    render(<TamanoSelect id="size" value="old" onChange={onChange} tamanos={[
      { id: 'fam', nombre: 'Familiar', orden: 40, activo: true },
      { id: 'per', nombre: 'Personal', orden: 10, activo: true },
      { id: 'old', nombre: 'Antiguo', orden: 30, activo: false },
      { id: 'unused', nombre: 'Retirado', orden: 20, activo: false },
    ]} />);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin tamaño', 'Personal', 'Antiguo (inactivo)', 'Familiar']);
    expect(screen.getByLabelText('Tamaño del plato')).toHaveValue('old');
    fireEvent.change(screen.getByLabelText('Tamaño del plato'), { target: { value: 'per' } });
    expect(onChange).toHaveBeenCalledWith('per');
  });

  it('conserva metadata del tamaño asignado cuando el catálogo falla', () => {
    render(<TamanoSelect id="size" value="per" onChange={vi.fn()} tamanos={[]} actual={{ id: 'per', nombre: 'Personal', orden: 10, activo: true }} error="Servicio no disponible" />);
    expect(screen.getByLabelText('Tamaño del plato')).toHaveValue('per');
    expect(screen.getByRole('option', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Se conserva el tamaño actual');
  });
});
