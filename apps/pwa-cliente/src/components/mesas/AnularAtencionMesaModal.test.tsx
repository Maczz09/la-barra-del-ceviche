// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AnularAtencionMesaModal } from './AnularAtencionMesaModal';
import type { PedidoItemVM } from '../../types/pedido.types';

function item(over: Partial<PedidoItemVM> = {}): PedidoItemVM {
  return {
    id: 'i-1', nombre: 'Sopa', cantidad: 1, estado: 'PENDIENTE', area: 'COCINA',
    ...over,
  } as PedidoItemVM;
}

describe('AnularAtencionMesaModal', () => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  it('con ítems activos, el botón requiere motivo', () => {
    render(
      <AnularAtencionMesaModal
        mesaNumero="2"
        items={[item({ estado: 'PENDIENTE' })]}
        saving={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('button', { name: /Anular atención de mesa/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cliente se retiró' } });
    expect(screen.getByRole('button', { name: /Anular atención de mesa/i })).not.toBeDisabled();
  });

  it('bug: cuando todos los ítems ya están anulados/rechazados, el botón NO debe quedar deshabilitado para siempre — solo falta el motivo', () => {
    // Reportado en vivo: el mesero anuló cada ítem uno por uno hasta que no
    // quedó ninguno activo, y "Anular atención de mesa" seguía deshabilitado
    // sin ninguna forma de liberar la mesa — el backend ya tolera este caso
    // (autocorrige en vez de rechazar), pero el frontend nunca dejaba llegar
    // la llamada.
    render(
      <AnularAtencionMesaModal
        mesaNumero="2"
        items={[item({ estado: 'CANCELADO' }), item({ id: 'i-2', estado: 'CANCELADO' })]}
        saving={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/No hay ítems activos que anular/i)).toBeInTheDocument();

    const boton = screen.getByRole('button', { name: /Anular atención de mesa/i });
    expect(boton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cliente se retiró sin pagar' } });
    expect(boton).not.toBeDisabled();

    fireEvent.click(boton);
    expect(onConfirm).toHaveBeenCalledWith('Cliente se retiró sin pagar', []);
  });

  it('sin ningún ítem en la mesa, el botón queda deshabilitado (nada que limpiar)', () => {
    render(
      <AnularAtencionMesaModal
        mesaNumero="2"
        items={[]}
        saving={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: /Anular atención de mesa/i })).toBeDisabled();
  });

  it('confirma con los ítems de Inventario marcados como consumidos', () => {
    render(
      <AnularAtencionMesaModal
        mesaNumero="2"
        items={[item({ id: 'i-3', area: 'DIRECTO', estado: 'ENTREGADO', nombre: 'Cerveza' })]}
        saving={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText('Cerveza'));
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Se fue' } });
    fireEvent.click(screen.getByRole('button', { name: /Anular atención de mesa/i }));

    expect(onConfirm).toHaveBeenCalledWith('Se fue', ['i-3']);
  });

  it('mientras saving=true, el botón queda deshabilitado y muestra el spinner', () => {
    render(
      <AnularAtencionMesaModal
        mesaNumero="2"
        items={[item({ estado: 'PENDIENTE' })]}
        saving={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: /Anular atención de mesa/i })).toBeDisabled();
  });
});
