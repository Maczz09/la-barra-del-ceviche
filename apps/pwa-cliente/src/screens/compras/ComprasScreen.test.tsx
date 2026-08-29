// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComprasScreen } from './ComprasScreen';
import { useToast } from '../../components/ui/ToastProvider';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import * as comprasQueryHook from '../../hooks/queries/useComprasQuery';

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn(),
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: vi.fn(),
}));

const proveedorA = {
  id: 'pr-a', sedeId: 's1', nombre: 'Proveedor A', ruc: '123456789', categoria: 'Abarrotes',
  contacto: 'Juan', telefono: '999', diasEntrega: 'L a V', condicionPago: '30 días', activo: true,
  createdAt: '2026-06-01T00:00:00.000Z', iniciales: 'PA',
};
const proveedorSinInsumos = {
  id: 'pr-b', sedeId: 's1', nombre: 'Proveedor Sin Insumos', ruc: '987', categoria: 'Otros',
  contacto: 'Pedro', telefono: '777', diasEntrega: 'N/A', condicionPago: 'Contado', activo: true,
  createdAt: '2026-06-01T00:00:00.000Z', iniciales: 'PS',
};

const insumo1 = {
  id: 'i-1', sedeId: 's1', nombre: 'Insumo 1', unidad: 'kg', stockActual: 5, stockMinimo: 10,
  costoUnitario: 5, proveedorId: 'pr-a', proveedorNombre: 'Proveedor A', productoId: null,
  factorConversion: 1, activo: true, createdAt: '2026-06-01T00:00:00.000Z', bajoMinimo: true,
};

function ordenVM(overrides: Record<string, unknown> = {}) {
  return {
    id: 'oc-123', sedeId: 's1', codigo: 'OC-123', proveedorId: 'pr-a', proveedorNombre: 'Proveedor A',
    estado: 'BORRADOR', fechaEmision: '2026-06-01T00:00:00.000Z', fechaEnvio: null,
    fechaEntregaEsperada: null, fechaCierre: null, moneda: 'PEN', total: 50, notas: null,
    usuarioId: null, usuarioNombre: null, createdAt: '2026-06-01T00:00:00.000Z',
    items: [
      { id: 'it-1', insumoId: 'i-1', insumoNombre: 'Insumo 1', unidad: 'kg', cantidadPedida: 10, cantidadRecibida: 0, costoUnitario: 5, pendiente: 10, subtotal: 50 },
    ],
    estadoLabel: 'Borrador', estadoClass: 'badge-muted',
    fechaEmisionLabel: '01 jun', fechaEntregaLabel: '—',
    puedeEditar: true, puedeEnviar: true, puedeRecibir: false, puedeCerrar: false, puedeAnular: true,
    ...overrides,
  };
}

describe('ComprasScreen', () => {
  const mockToast = vi.fn();
  const mockCrear = vi.fn().mockResolvedValue(ordenVM());
  const mockActualizar = vi.fn().mockResolvedValue(ordenVM());
  const mockEnviar = vi.fn().mockResolvedValue(ordenVM({ estado: 'ENVIADA' }));
  const mockRecibir = vi.fn().mockResolvedValue({ orden: ordenVM({ estado: 'RECIBIDA' }), recepcion: {} });
  const mockCerrar = vi.fn().mockResolvedValue(ordenVM({ estado: 'RECIBIDA' }));
  const mockAnular = vi.fn().mockResolvedValue(ordenVM({ estado: 'ANULADA' }));
  const mockEliminar = vi.fn().mockResolvedValue({ message: 'ok' });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'crypto', {
      value: { randomUUID: () => '12345678-1234-1234-1234-123456789012' },
      configurable: true,
    });
    vi.mocked(useToast).mockReturnValue({ toast: mockToast } as any);
    vi.mocked(useSedeActualQuery).mockReturnValue({
      sede: { id: 's1', nombre: 'Sede Central', direccion: 'Av. Principal 123', activa: true },
      loading: false,
    } as any);

    vi.spyOn(comprasQueryHook, 'useResumenComprasQuery').mockReturnValue({
      resumen: { ordenesAbiertas: 1, ordenesPorRecibir: 1, montoPorRecibir: 50, gastoRecibido: 0, insumosBajoMinimo: 1 },
      loading: false,
    } as any);

    vi.spyOn(comprasQueryHook, 'useProveedoresQuery').mockReturnValue({
      proveedores: [proveedorA, proveedorSinInsumos],
      loading: false,
      saving: false,
      error: null,
      success: null,
      crear: vi.fn(),
      actualizar: vi.fn(),
      eliminar: vi.fn(),
      clearFeedback: vi.fn(),
    } as any);

    vi.spyOn(comprasQueryHook, 'useInsumosQuery').mockReturnValue({
      insumos: [insumo1],
      loading: false,
      saving: false,
      error: null,
      success: null,
      crear: vi.fn(),
      actualizar: vi.fn(),
      eliminar: vi.fn(),
      clearFeedback: vi.fn(),
    } as any);

    vi.spyOn(comprasQueryHook, 'useOrdenesQuery').mockReturnValue({
      ordenes: [ordenVM()],
      loading: false,
      saving: false,
      error: null,
      success: null,
      crear: mockCrear,
      actualizar: mockActualizar,
      eliminar: mockEliminar,
      enviar: mockEnviar,
      cerrar: mockCerrar,
      anular: mockAnular,
      recibir: mockRecibir,
      clearFeedback: vi.fn(),
    } as any);

    vi.spyOn(comprasQueryHook, 'useOrdenDetalleQuery').mockReturnValue({
      orden: ordenVM(),
      recepciones: [],
      comprobantes: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(comprasQueryHook, 'useComprobantesMutation').mockReturnValue({
      subiendo: false,
      eliminando: false,
      error: null,
      subir: vi.fn(),
      eliminar: vi.fn(),
      clearFeedback: vi.fn(),
    } as any);
  });

  it('renders title and sub', () => {
    render(<ComprasScreen />);
    expect(screen.getByText('Compras y Proveedores')).toBeInTheDocument();
  });

  it('handles tabs: ordenes, insumos, proveedores', () => {
    render(<ComprasScreen />);
    expect(screen.getByText('OC-123')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Insumos'));
    expect(screen.getByText('Insumo 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Proveedores'));
    expect(screen.getByText('Proveedor A')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Órdenes de compra'));
    expect(screen.getByText('OC-123')).toBeInTheDocument();
  });

  it('puede enviar una OC en BORRADOR', async () => {
    render(<ComprasScreen />);
    const row = screen.getByText('OC-123').closest('tr');
    fireEvent.click(within(row!).getByText('Enviar'));
    expect(mockEnviar).toHaveBeenCalledWith('oc-123');
  });

  it('puede abrir el drawer de recepción y confirmar con el stepper', async () => {
    vi.spyOn(comprasQueryHook, 'useOrdenesQuery').mockReturnValue({
      ordenes: [ordenVM({ estado: 'ENVIADA', puedeEnviar: false, puedeRecibir: true, puedeCerrar: true })],
      loading: false,
      saving: false,
      error: null,
      success: null,
      crear: mockCrear,
      actualizar: mockActualizar,
      eliminar: mockEliminar,
      enviar: mockEnviar,
      cerrar: mockCerrar,
      anular: mockAnular,
      recibir: mockRecibir,
      clearFeedback: vi.fn(),
    } as any);

    render(<ComprasScreen />);
    const row = screen.getByText('OC-123').closest('tr');
    fireEvent.click(within(row!).getByText('Recepcionar'));

    expect(screen.getByText('Recepción · OC-123')).toBeInTheDocument();
    // El stepper arranca en el pendiente (10): confirmar sin tocar nada ya
    // manda cantidadRecibida = 10 (default = pendiente, no checkbox).
    fireEvent.click(screen.getByText('Confirmar recepción'));

    expect(mockRecibir).toHaveBeenCalledWith('oc-123', { items: [{ ordenItemId: 'it-1', cantidadRecibida: 10 }] });
  });

  it('puede cerrar el drawer de recepción sin confirmar', () => {
    vi.spyOn(comprasQueryHook, 'useOrdenesQuery').mockReturnValue({
      ordenes: [ordenVM({ estado: 'ENVIADA', puedeEnviar: false, puedeRecibir: true })],
      loading: false, saving: false, error: null, success: null,
      crear: mockCrear, actualizar: mockActualizar, eliminar: mockEliminar, enviar: mockEnviar, cerrar: mockCerrar, anular: mockAnular, recibir: mockRecibir,
      clearFeedback: vi.fn(),
    } as any);

    const { container } = render(<ComprasScreen />);
    const row = screen.getByText('OC-123').closest('tr');
    fireEvent.click(within(row!).getByText('Recepcionar'));

    const closeBtn = container.querySelector('.drawer .icon-btn');
    fireEvent.click(closeBtn!);
    expect(screen.queryByText('Recepción · OC-123')).not.toBeInTheDocument();
  });

  it('OC recibida sin comprobantes muestra "Falta boleta" y abre el detalle al hacer click', () => {
    vi.spyOn(comprasQueryHook, 'useOrdenesQuery').mockReturnValue({
      ordenes: [ordenVM({ estado: 'RECIBIDA', puedeEnviar: false, puedeRecibir: false, comprobantesCount: 0 })],
      loading: false, saving: false, error: null, success: null,
      crear: mockCrear, actualizar: mockActualizar, eliminar: mockEliminar, enviar: mockEnviar, cerrar: mockCerrar, anular: mockAnular, recibir: mockRecibir,
      clearFeedback: vi.fn(),
    } as any);

    render(<ComprasScreen />);
    const row = screen.getByText('OC-123').closest('tr');
    expect(within(row!).getByText('Falta boleta')).toBeInTheDocument();

    fireEvent.click(within(row!).getByText('Falta boleta'));
    expect(screen.getByText('Comprobantes (boleta/factura)')).toBeInTheDocument();
  });

  it('OC recibida con comprobantes ya subidos muestra "Completada", no "Falta boleta"', () => {
    vi.spyOn(comprasQueryHook, 'useOrdenesQuery').mockReturnValue({
      ordenes: [ordenVM({ estado: 'RECIBIDA', puedeEnviar: false, puedeRecibir: false, comprobantesCount: 1 })],
      loading: false, saving: false, error: null, success: null,
      crear: mockCrear, actualizar: mockActualizar, eliminar: mockEliminar, enviar: mockEnviar, cerrar: mockCerrar, anular: mockAnular, recibir: mockRecibir,
      clearFeedback: vi.fn(),
    } as any);

    render(<ComprasScreen />);
    const row = screen.getByText('OC-123').closest('tr');
    expect(within(row!).getByText('Completada')).toBeInTheDocument();
    expect(within(row!).queryByText('Falta boleta')).not.toBeInTheDocument();
  });

  it('puede crear una nueva OC', async () => {
    const { container } = render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Nueva orden'));

    const combobox = screen.getByLabelText('Proveedor');
    fireEvent.change(combobox, { target: { value: 'pr-a' } });

    const plusBtns = container.querySelectorAll('.drawer .stepper button');
    fireEvent.click(plusBtns[1]);

    fireEvent.click(screen.getByText('Crear borrador'));
    expect(mockCrear).toHaveBeenCalledWith({ proveedorId: 'pr-a', items: [{ insumoId: 'i-1', cantidadPedida: 1 }] });
  });

  it('puede cerrar el drawer de nueva OC', () => {
    const { container } = render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Nueva orden'));
    const closeBtn = container.querySelector('.drawer .icon-btn');
    fireEvent.click(closeBtn!);
    expect(screen.queryByText('Nueva orden de compra')).not.toBeInTheDocument();
  });

  it('muestra el mensaje de proveedor sin insumos', () => {
    render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Nueva orden'));
    const combobox = screen.getByLabelText('Proveedor');
    fireEvent.change(combobox, { target: { value: 'pr-b' } });
    expect(screen.getByText('Este proveedor no tiene insumos asociados todavía.')).toBeInTheDocument();
  });

  it('el stepper no baja de 0', () => {
    const { container } = render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Nueva orden'));
    const combobox = screen.getByLabelText('Proveedor');
    fireEvent.change(combobox, { target: { value: 'pr-a' } });

    const minusBtns = container.querySelectorAll('.drawer .stepper button');
    fireEvent.click(minusBtns[0]); // 0 - 1 = 0
    expect(screen.getByText('Total · 0 líneas')).toBeInTheDocument();
  });

  it('abre el detalle de la orden al hacer click en la fila', () => {
    render(<ComprasScreen />);
    fireEvent.click(screen.getByText('OC-123').closest('tr')!);
    // El modal usa el mismo código como título junto al badge de estado.
    expect(screen.getAllByText('OC-123').length).toBeGreaterThan(1);
  });

  // Bug real: al fallar la creación (p. ej. "Indica la sede"), el error se
  // perdía en silencio — ningún handler tenía try/catch, así que el usuario
  // veía el drawer simplemente no hacer nada. Ahora se debe avisar por toast.
  it('si crear un proveedor falla, avisa por toast en vez de fallar en silencio', async () => {
    const mockCrearProveedor = vi.fn().mockRejectedValue(new Error('Indica la sede (sedeId): tu usuario administra varias y ninguna quedó seleccionada.'));
    vi.spyOn(comprasQueryHook, 'useProveedoresQuery').mockReturnValue({
      proveedores: [proveedorA, proveedorSinInsumos],
      loading: false, saving: false, error: null, success: null,
      crear: mockCrearProveedor, actualizar: vi.fn(), eliminar: vi.fn(), clearFeedback: vi.fn(),
    } as any);

    render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Proveedores'));
    fireEvent.click(screen.getByText('Nuevo proveedor'));
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Pesquera del Norte' } });
    fireEvent.click(screen.getByText('Crear proveedor'));

    await vi.waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'No se pudo crear el proveedor',
        msg: expect.stringContaining('Indica la sede'),
        kind: 'err',
      }));
    });
  });

  it('sin sede elegida, muestra el aviso y deshabilita crear', () => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: false } as any);
    render(<ComprasScreen />);
    expect(screen.getByText(/Elige una sede arriba/)).toBeInTheDocument();
    expect(screen.getByText('Nueva orden').closest('button')).toBeDisabled();
  });

  it('con sede elegida, no muestra el aviso', () => {
    render(<ComprasScreen />);
    expect(screen.queryByText(/Elige una sede arriba/)).not.toBeInTheDocument();
  });

  it('click en un proveedor abre el drawer con sus datos para editar', () => {
    render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Proveedores'));
    fireEvent.click(screen.getByText('Proveedor A'));

    expect(screen.getByText('Guardar cambios')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Proveedor A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('123456789')).toBeInTheDocument();
  });

  it('editar un proveedor llama a actualizar con el id correcto', async () => {
    const mockActualizarProveedor = vi.fn().mockResolvedValue({ proveedor: proveedorA });
    vi.spyOn(comprasQueryHook, 'useProveedoresQuery').mockReturnValue({
      proveedores: [proveedorA, proveedorSinInsumos],
      loading: false, saving: false, error: null, success: null,
      crear: vi.fn(), actualizar: mockActualizarProveedor, eliminar: vi.fn(), clearFeedback: vi.fn(),
    } as any);

    render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Proveedores'));
    fireEvent.click(screen.getByText('Proveedor A'));
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Proveedor A Renombrado' } });
    fireEvent.click(screen.getByText('Guardar cambios'));

    await vi.waitFor(() => {
      expect(mockActualizarProveedor).toHaveBeenCalledWith('pr-a', expect.objectContaining({ nombre: 'Proveedor A Renombrado' }));
    });
  });

  it('click en un insumo abre el drawer con sus datos para editar (stock actual no editable)', () => {
    render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Insumos'));
    fireEvent.click(screen.getByText('Insumo 1'));

    expect(screen.getByText('Guardar cambios')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Insumo 1')).toBeInTheDocument();
    // El stock actual se muestra de solo lectura, no como <input>.
    expect(screen.queryByLabelText('Stock actual')).not.toBeInTheDocument();
  });
});
