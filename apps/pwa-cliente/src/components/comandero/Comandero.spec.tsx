// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { Comandero, groupCatalogProducts } from './Comandero';

vi.mock('../../hooks/queries/useInventarioQuery', () => ({
  useInventarioQuery: () => ({
    productos: [],
    categorias: [],
    loading: false,
    loadingMore: false,
    fetchMore: vi.fn(),
  })
}));

vi.mock('../../hooks/queries/useMenuDiarioQuery', () => ({
  useMenuDiarioQuery: () => ({
    menu: [],
    loading: false,
  })
}));

vi.mock('../../hooks/queries/useMesasQuery', () => ({
  useMesasQuery: () => ({
    mesas: []
  })
}));

vi.mock('../../hooks/queries/usePedidosQuery', () => ({
  usePedidosQuery: () => ({
    crear: { mutateAsync: vi.fn(), isPending: false }
  })
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

vi.mock('../../hooks/useComanda', () => ({
  useComanda: () => ({
    lines: [],
    canal: 'SALON',
    mesaId: '1',
    cliente: '',
    totalItems: 0,
    subtotal: 0,
    igv: 0,
    saving: false,
    puedeEnviar: false,
    ctxValido: true,
    vaciar: vi.fn(),
    incLine: vi.fn(),
    delLine: vi.fn(),
    toggleNote: vi.fn(),
    setNota: vi.fn(),
    setCanal: vi.fn(),
    setMesa: vi.fn(),
    setCliente: vi.fn(),
    enviar: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('../ui/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn() })
}));

describe('Comandero', () => {
  it('agrupa los platos por categoría respetando el orden de los filtros', () => {
    const arroz = { id: 'p1', categoriaNombre: 'Arroces' };
    const ceviche = { id: 'p2', categoriaNombre: 'Ceviches' };
    const grupos = groupCatalogProducts([arroz, ceviche], ['Ceviches', 'Arroces']);
    expect(grupos.map((grupo) => grupo.nombre)).toEqual(['Ceviches', 'Arroces']);
    expect(grupos[0].productos).toEqual([ceviche]);
  });

  it('debe renderizar el título de Nuevo pedido', () => {
    render(<Comandero onClose={vi.fn()} />);
    expect(screen.getByText('Nuevo pedido')).toBeInTheDocument();
  });

  it('debe permitir cambiar de canal', () => {
    render(<Comandero onClose={vi.fn()} />);
    const btnDelivery = screen.getByText('Delivery');
    fireEvent.click(btnDelivery);
    expect(btnDelivery).toBeInTheDocument();
  });

  it('debe mostrar estado de carga vacío', () => {
    render(<Comandero onClose={vi.fn()} />);
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });
});
