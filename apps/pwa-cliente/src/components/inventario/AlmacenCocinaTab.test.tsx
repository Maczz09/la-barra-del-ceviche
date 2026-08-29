// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlmacenCocinaTab } from './AlmacenCocinaTab';
import { ToastProvider } from '../ui/ToastProvider';

const mockRegistrarMovimiento = vi.fn();
const mockRegistrarConteo = vi.fn();
const mockCrearInsumo = vi.fn();
const mockActualizarInsumo = vi.fn();
const mockEliminarInsumo = vi.fn();
const mockCrearCategoria = vi.fn();
const mockActualizarCategoria = vi.fn();
const mockEliminarCategoria = vi.fn();
let insumosMock: any[] = [];
let categoriasMock: any[] = [];
let loadingMock = false;
let queryInsumos: any = null;

vi.mock('../../hooks/queries/useComprasQuery', () => ({
  useInsumosQuery: (query: any) => {
    queryInsumos = query;
    return {
      insumos: insumosMock,
      loading: loadingMock,
      error: null,
      saving: false,
      crear: mockCrearInsumo,
      actualizar: mockActualizarInsumo,
      eliminar: mockEliminarInsumo,
    };
  },
  COMPRAS_INSUMOS_KEY: ['compras-insumos'],
  COMPRAS_RESUMEN_KEY: ['compras-resumen'],
}));

vi.mock('../../hooks/queries/useCategoriasInsumoQuery', () => ({
  useCategoriasInsumoQuery: () => ({
    categorias: categoriasMock,
    loading: false,
    saving: false,
    error: null,
    crear: mockCrearCategoria,
    actualizar: mockActualizarCategoria,
    eliminar: mockEliminarCategoria,
  }),
  COMPRAS_CATEGORIAS_INSUMO_KEY: ['compras-categorias-insumo'],
}));

vi.mock('../../hooks/queries/useMovimientosInsumoQuery', () => ({
  useMovimientosInsumoMutation: () => ({
    registrarMovimiento: mockRegistrarMovimiento,
    registrarConteo: mockRegistrarConteo,
    saving: false,
  }),
  useKardexInsumoQuery: () => ({ movimientos: [], loading: false, error: null }),
  COMPRAS_MOVIMIENTOS_KEY: ['compras-movimientos-insumo'],
}));

function insumo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i-1',
    sedeId: 'S1',
    nombre: 'Arroz',
    unidad: 'kg',
    stockActual: 10,
    stockMinimo: 2,
    costoUnitario: 4.5,
    proveedorId: null,
    proveedorNombre: null,
    categoriaId: null,
    categoriaNombre: null,
    productoId: null,
    factorConversion: 1,
    activo: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    bajoMinimo: false,
    ...overrides,
  };
}

function renderTab(props: Partial<Parameters<typeof AlmacenCocinaTab>[0]> = {}) {
  return render(
    <ToastProvider>
      <AlmacenCocinaTab online puedeAdministrar sedeNombre="Sede Centro" usuarioNombre="Rosa" {...props} />
    </ToastProvider>,
  );
}

describe('AlmacenCocinaTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadingMock = false;
    insumosMock = [insumo()];
    categoriasMock = [{ id: 'ci-1', sedeId: 'S1', nombre: 'Abarrotes', descripcion: null, activo: true, insumosCount: 1, createdAt: '2026-08-01T00:00:00.000Z' }];
    mockCrearInsumo.mockResolvedValue({ message: 'ok', insumo: { nombre: 'Arroz' } });
    mockActualizarInsumo.mockResolvedValue({ message: 'ok', insumo: {} });
    mockEliminarInsumo.mockResolvedValue({ message: 'ok' });
    mockRegistrarMovimiento.mockResolvedValue({ message: 'ok', movimiento: {} });
    mockRegistrarConteo.mockResolvedValue({
      message: 'ok',
      resultado: { insumosContados: 1, cuadraron: 0, ajustados: 1, valorDiferenciaTotal: -9, diferencias: [] },
    });
  });

  it('lista los insumos con su unidad', () => {
    renderTab();
    expect(screen.getByText('Arroz')).toBeInTheDocument();
    expect(screen.getByText('10 kg')).toBeInTheDocument();
  });

  it('registra un consumo con la cantidad escrita', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento de Arroz' }));
    fireEvent.change(screen.getByLabelText('Cantidad (kg)'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    await waitFor(() => {
      expect(mockRegistrarMovimiento).toHaveBeenCalledWith('i-1', {
        tipo: 'SALIDA_CONSUMO',
        cantidad: 2.5,
        motivo: undefined,
      });
    });
  });

  it('no deja descargar más de lo que hay en stock', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento de Arroz' }));
    fireEvent.change(screen.getByLabelText('Cantidad (kg)'), { target: { value: '99' } });

    expect(screen.getByText(/No puedes descargar más de lo que hay/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled();
  });

  it('la merma exige motivo; el consumo no', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento de Arroz' }));
    fireEvent.change(screen.getByLabelText('Cantidad (kg)'), { target: { value: '1' } });
    expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Merma' }));
    expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Se malogró' } });
    expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeEnabled();
  });

  it('el conteo físico manda solo los insumos con un número escrito', async () => {
    insumosMock = [insumo(), insumo({ id: 'i-2', nombre: 'Aceite', unidad: 'L', stockActual: 4 })];
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Conteo físico/ }));
    // Solo se cuenta el arroz; el aceite queda en blanco y no debe viajar.
    fireEvent.change(screen.getByLabelText('Stock contado de Arroz'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar conteo' }));

    await waitFor(() => {
      expect(mockRegistrarConteo).toHaveBeenCalledWith({
        items: [{ insumoId: 'i-1', stockContado: 8 }],
        observacion: undefined,
      });
    });
  });

  it('el conteo no se puede enviar vacío', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Conteo físico/ }));
    expect(screen.getByRole('button', { name: 'Registrar conteo' })).toBeDisabled();
  });

  it('cocina no administra el catálogo ni cierra el cuadre, pero sí registra salidas', () => {
    renderTab({ puedeAdministrar: false });

    expect(screen.queryByRole('button', { name: /Conteo físico/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nuevo insumo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Categorías/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Arroz' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Registrar movimiento de Arroz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar stock a Arroz' })).toBeInTheDocument();
  });

  it('pide al backend SOLO los insumos de cocina: los productos de venta no cruzan', () => {
    renderTab();
    expect(queryInsumos).toMatchObject({ soloCocina: true });
  });

  it('crea un insumo nuevo desde el drawer', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo insumo/ }));
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Aceite vegetal' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear insumo/ }));

    await waitFor(() => {
      expect(mockCrearInsumo).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Aceite vegetal' }));
    });
  });

  it('el drawer de edición no deja tocar el stock a mano', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Arroz' }));

    // El stock inicial solo existe al crear: despues se mueve por movimientos
    // para que el kardex cuadre.
    expect(screen.queryByLabelText('Stock inicial')).not.toBeInTheDocument();
    expect(screen.getByText(/se cambia con movimientos/)).toBeInTheDocument();
  });

  it('eliminar un insumo pide confirmación antes de mandar', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Arroz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(mockEliminarInsumo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Seguro\? Eliminar/ }));
    await waitFor(() => expect(mockEliminarInsumo).toHaveBeenCalledWith('i-1'));
  });

  it('el botón "+ Stock" abre el movimiento ya en Ingreso', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar stock a Arroz' }));
    fireEvent.change(screen.getByLabelText('Cantidad (kg)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    await waitFor(() => {
      expect(mockRegistrarMovimiento).toHaveBeenCalledWith('i-1', {
        tipo: 'ENTRADA_MANUAL',
        cantidad: 20,
        motivo: undefined,
      });
    });
  });

  it('crea una categoría de almacén desde su modal', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Categorías/ }));
    fireEvent.change(screen.getByLabelText('Nombre de la nueva categoría'), { target: { value: 'Carnes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    await waitFor(() => {
      expect(mockCrearCategoria).toHaveBeenCalledWith({ nombre: 'Carnes', descripcion: undefined });
    });
  });

  it('avisa cuántos insumos se sueltan al borrar una categoría', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Categorías/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Abarrotes' }));

    // Borrar no borra los insumos: quedan sin categoria (FK SetNull).
    expect(screen.getByRole('button', { name: /Soltar 1 insumos/ })).toBeInTheDocument();
    expect(mockEliminarCategoria).not.toHaveBeenCalled();
  });

  it('filtra por categoría de almacén contra el backend', () => {
    renderTab();
    fireEvent.change(screen.getByLabelText('Filtrar por categoría de almacén'), { target: { value: 'ci-1' } });
    expect(queryInsumos).toMatchObject({ categoriaId: 'ci-1' });
  });

  it('sin conexión no se puede registrar movimientos', () => {
    renderTab({ online: false });
    expect(screen.getByRole('button', { name: 'Registrar movimiento de Arroz' })).toBeDisabled();
  });

  it('filtra por bajo mínimo', () => {
    insumosMock = [insumo(), insumo({ id: 'i-2', nombre: 'Aceite', stockActual: 1, bajoMinimo: true })];
    renderTab();
    expect(screen.getByText('Arroz')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Bajo mínimo/ }));

    expect(screen.queryByText('Arroz')).not.toBeInTheDocument();
    expect(screen.getByText('Aceite')).toBeInTheDocument();
  });

  it('el vacío explica qué va acá y ofrece crear el primer insumo', () => {
    insumosMock = [];
    renderTab();

    expect(screen.getByText(/no se vende: arroz, aceite, gas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear el primer insumo/ })).toBeInTheDocument();
  });
});
