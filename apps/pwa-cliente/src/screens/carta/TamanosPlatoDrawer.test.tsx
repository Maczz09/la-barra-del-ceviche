// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { useTamanosPlatoQuery } from '../../hooks/queries/useTamanosPlatoQuery';
import { TamanosPlatoDrawer } from './TamanosPlatoDrawer';

type Query = ReturnType<typeof useTamanosPlatoQuery>;
const personal = { id: 'personal', nombre: 'Personal', orden: 10, activo: true };
const familiar = { id: 'familiar', nombre: 'Familiar', orden: 30, activo: false };
const query = (): Query => ({
  tamanos: [familiar, personal], loading: false, saving: false, error: null,
  crearTamano: vi.fn().mockResolvedValue({}), actualizarTamano: vi.fn().mockResolvedValue({}),
  eliminarTamano: vi.fn().mockResolvedValue({}), fetch: vi.fn(), clearFeedback: vi.fn(),
});

describe('TamanosPlatoDrawer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista tamaños en orden y permite crear con nombre y orden explícitos', async () => {
    const control = query();
    render(<TamanosPlatoDrawer query={control} online onClose={vi.fn()} />);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Personal');
    fireEvent.change(screen.getByLabelText('Nombre del tamaño'), { target: { value: ' Mediano ' } });
    fireEvent.change(screen.getByLabelText('Orden de presentación'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear tamaño' }));
    await waitFor(() => expect(control.crearTamano).toHaveBeenCalledWith({ nombre: 'Mediano', orden: 20 }));
    expect(await screen.findByText('Tamaño creado.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del tamaño')).toHaveValue('');
  });

  it('permite orden automático al crear y rechaza orden decimal o negativo', async () => {
    const control = query();
    render(<TamanosPlatoDrawer query={control} online onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nombre del tamaño'), { target: { value: 'Grande' } });
    fireEvent.change(screen.getByLabelText('Orden de presentación'), { target: { value: '-1' } });
    expect(screen.getByRole('button', { name: 'Crear tamaño' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Orden de presentación'), { target: { value: '1.5' } });
    expect(screen.getByRole('button', { name: 'Crear tamaño' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Orden de presentación'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear tamaño' }));
    await waitFor(() => expect(control.crearTamano).toHaveBeenCalledWith({ nombre: 'Grande' }));
  });

  it('edita nombre y orden sin modificar el estado activo', async () => {
    const control = query();
    render(<TamanosPlatoDrawer query={control} online onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar Familiar' }));
    expect(screen.getByLabelText('Nombre del tamaño')).toHaveValue('Familiar');
    fireEvent.change(screen.getByLabelText('Nombre del tamaño'), { target: { value: 'Para compartir' } });
    fireEvent.change(screen.getByLabelText('Orden de presentación'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tamaño' }));
    await waitFor(() => expect(control.actualizarTamano).toHaveBeenCalledWith('familiar', { nombre: 'Para compartir', orden: 40 }));
  });

  it('activa y desactiva sin eliminar platos', async () => {
    const control = query();
    render(<TamanosPlatoDrawer query={control} online onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Personal' }));
    await waitFor(() => expect(control.actualizarTamano).toHaveBeenCalledWith('personal', { activo: false }));
    await screen.findByText('Tamaño desactivado. Sus platos se conservan.');
    fireEvent.click(screen.getByRole('button', { name: 'Activar Familiar' }));
    await waitFor(() => expect(control.actualizarTamano).toHaveBeenCalledWith('familiar', { activo: true }));
    expect(control.eliminarTamano).not.toHaveBeenCalled();
  });

  it('confirma la eliminación y comunica el bloqueo cuando el tamaño está en uso', async () => {
    const control = query();
    vi.mocked(control.eliminarTamano).mockRejectedValue(new Error('Este tamaño está en uso por 4 platos. Desactívalo.'));
    render(<TamanosPlatoDrawer query={control} online onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Personal' }));
    expect(control.eliminarTamano).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Eliminar tamaño Personal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
    await waitFor(() => expect(control.eliminarTamano).toHaveBeenCalledWith('personal'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este tamaño está en uso por 4 platos. Desactívalo.');
    expect(screen.getByText('Personal', { selector: '.carta-tamano-datos strong' })).toBeInTheDocument();
  });

  it('elimina un tamaño libre y cierra su confirmación', async () => {
    const control = query();
    render(<TamanosPlatoDrawer query={control} online onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Familiar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
    expect(await screen.findByText('Tamaño eliminado.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('impide operaciones sin conexión y durante un guardado', () => {
    const control = query();
    const { rerender } = render(<TamanosPlatoDrawer query={control} online={false} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Editar Personal' })).toBeDisabled();
    expect(screen.getByLabelText('Nombre del tamaño')).toBeDisabled();
    rerender(<TamanosPlatoDrawer query={{ ...control, saving: true }} online onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Activar Familiar' })).toBeDisabled();
  });

  it('permite cerrar con Escape y restaurar el foco', () => {
    const cerrar = vi.fn();
    render(<TamanosPlatoDrawer query={query()} online onClose={cerrar} />);
    expect(screen.getByRole('button', { name: 'Cerrar tamaños' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cerrar).toHaveBeenCalledTimes(1);
  });
});
