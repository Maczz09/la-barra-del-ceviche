// @vitest-environment jsdom
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FacturacionScreen } from './FacturacionScreen';
import { useFacturacionQuery } from '../../hooks/queries/useFacturacionQuery';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';
import { abrirComprobanteParaImprimir } from '../../utils/comprobantePrint';

vi.mock('../../hooks/queries/useFacturacionQuery', () => ({
  useFacturacionQuery: vi.fn(),
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedesQuery: vi.fn(),
}));

vi.mock('../../utils/comprobantePrint', () => ({
  abrirComprobanteParaImprimir: vi.fn(),
}));

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}));

// El formulario en sí (validación, campos) se prueba aparte en
// ConfigurarEmpresaModal.test.tsx — acá solo interesa la orquestación
// (cuándo se muestra el botón, que abre/cierra el modal).
vi.mock('./ConfigurarEmpresaModal', () => ({
  ConfigurarEmpresaModal: ({ onClose, onGuardar }: any) => (
    <div data-testid="configurar-empresa-modal">
      <button onClick={onClose}>Cerrar modal config</button>
      <button onClick={() => void onGuardar({ ruc: '20999999999' })}>Guardar config</button>
    </div>
  ),
}));

vi.mock('./EditarEmpresaModal', () => ({
  EditarEmpresaModal: ({ empresa, onClose, onGuardar }: any) => (
    <div data-testid="editar-empresa-modal">
      <span>{empresa.razonSocial}</span>
      <button onClick={onClose}>Cerrar modal editar</button>
      <button onClick={() => void onGuardar({ razonSocial: 'Nombre editado' })}>Guardar edición</button>
    </div>
  ),
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn(),
}));

const empresa = { id: 'e1', slot: 1, ruc: '20123456786', sedeId: 'sede-1', razonSocial: 'EMPRESA DEMO S.A.C.', activo: true };
const sedesMock = [
  { id: 'sede-1', nombre: 'Sede Central', activa: true },
  { id: 'sede-2', nombre: 'Sede Secundaria', activa: true },
];

const disponible = {
  id: 'cp1', cuentaId: 'c1', sedeId: 'sede-1', mesaId: 'm1', total: '15.00',
  items: [], meseroNombre: 'Pepe', estado: 'DISPONIBLE', fecha: '2026-08-12T10:00:00.000Z',
};

const disponibleConItems = {
  id: 'cp4', cuentaId: 'c4', sedeId: 'sede-1', mesaId: 'm4', total: '55.00',
  items: [
    { productoId: 'p1', nombre: 'Ceviche de Caballa', cantidad: 1, precioUnitario: 40 },
    { productoId: 'p2', nombre: 'Cristal', cantidad: 3, precioUnitario: 5 },
  ],
  meseroNombre: 'Javier', estado: 'DISPONIBLE', fecha: '2026-08-13T10:00:00.000Z',
};

const emitido = {
  id: 'cp2', cuentaId: 'c2', sedeId: 'sede-1', mesaId: 'm1', total: '30.00',
  items: [], meseroNombre: 'Ana', estado: 'EMITIDO', fecha: '2026-08-12T09:00:00.000Z',
  comprobante: {
    id: 'cb1', tipo: 'BOLETA', serie: 'B001', correlativo: 5, clienteRuc: null, clienteDni: null,
    clienteRazonSocial: null, clienteNombre: null, subtotal: '25.42', igv: '4.58', total: '30.00',
    estado: 'ACEPTADO', motivoRechazo: null, createdAt: '2026-08-12T09:01:00.000Z',
    empresa: { ruc: '20123456786', razonSocial: 'EMPRESA DEMO S.A.C.', nombreComercial: null, direccion: null },
  },
};

const emitidoFactura = {
  id: 'cp3', cuentaId: 'c3', sedeId: 'sede-1', mesaId: 'm1', total: '100.00',
  items: [], meseroNombre: 'Ana', estado: 'EMITIDO', fecha: '2026-07-01T09:00:00.000Z',
  comprobante: {
    id: 'cb2', tipo: 'FACTURA', serie: 'F001', correlativo: 2, clienteRuc: '20123456789', clienteDni: null,
    clienteRazonSocial: 'CLIENTE SAC', clienteNombre: null, subtotal: '84.75', igv: '15.25', total: '100.00',
    estado: 'RECHAZADO', motivoRechazo: 'RUC no habido', createdAt: '2026-07-01T09:01:00.000Z',
    empresa: { ruc: '20123456786', razonSocial: 'EMPRESA DEMO S.A.C.', nombreComercial: null, direccion: null },
  },
};

function baseMock(overrides: Record<string, unknown> = {}) {
  return {
    disponibles: [disponible],
    emitidos: [emitido, emitidoFactura],
    notas: [],
    notasLoading: false,
    empresas: [empresa],
    empresasLoading: false,
    loading: false,
    emitiendo: false,
    configurandoEmpresa: false,
    error: null,
    errorEmpresa: null,
    success: null,
    fetch: vi.fn(),
    emitirComprobante: vi.fn().mockResolvedValue(undefined),
    clearFeedback: vi.fn(),
    crearEmpresa: vi.fn().mockResolvedValue({ id: 'e-2', slot: 2, ruc: '20999999999', razonSocial: 'Nueva SAC', activo: true }),
    clearFeedbackEmpresa: vi.fn(),
    actualizarEmpresa: vi.fn().mockResolvedValue({ id: 'e1', slot: 1, ruc: '20123456786', razonSocial: 'Nombre editado', activo: true }),
    cambiarEstadoEmpresa: vi.fn().mockResolvedValue({ id: 'e1', activo: false }),
    actualizandoEmpresa: false,
    errorActualizarEmpresa: null,
    clearFeedbackActualizarEmpresa: vi.fn(),
    emitiendoNota: false,
    errorNota: null,
    emitirNotaCredito: vi.fn().mockResolvedValue({ id: 'nota-1', tipo: 'NOTA_CREDITO', serie: 'FC01', correlativo: 1 }),
    emitirNotaDebito: vi.fn().mockResolvedValue({ id: 'nota-2', tipo: 'NOTA_DEBITO', serie: 'FD01', correlativo: 1 }),
    clearFeedbackNota: vi.fn(),
    ...overrides,
  };
}

describe('FacturacionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFacturacionQuery).mockReturnValue(baseMock() as any);
    vi.mocked(useSedesQuery).mockReturnValue({ sedes: sedesMock } as any);
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);
  });

  it('renderiza el encabezado y los KPIs', () => {
    render(<FacturacionScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Facturación' })).toBeInTheDocument();
    expect(screen.getByText('Disponibles')).toBeInTheDocument();
  });

  it('lista los comprobantes de pago disponibles', () => {
    render(<FacturacionScreen />);
    expect(screen.getByText('Pepe')).toBeInTheDocument();
    expect(screen.getByText('S/ 15.00')).toBeInTheDocument();
  });

  it('lista los emitidos con su estado SUNAT', () => {
    render(<FacturacionScreen />);
    expect(screen.getByText('Boleta B001-5')).toBeInTheDocument();
    expect(screen.getByText('Aceptado por SUNAT')).toBeInTheDocument();
    expect(screen.getByText('Factura F001-2')).toBeInTheDocument();
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
  });

  describe('imprimir comprobantes emitidos', () => {
    it('solo el comprobante ACEPTADO tiene botón de imprimir', () => {
      render(<FacturacionScreen />);
      expect(screen.getAllByRole('button', { name: 'Imprimir comprobante' })).toHaveLength(1);
    });

    it('imprimir abre la pestaña dedicada con el comprobante y sus ítems', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Imprimir comprobante' }));
      expect(abrirComprobanteParaImprimir).toHaveBeenCalledWith({
        comprobante: emitido.comprobante,
        items: [],
      });
    });
  });

  describe('filtros de emitidos', () => {
    it('el chip Boletas oculta las facturas', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Boletas' }));
      expect(screen.getByText('Boleta B001-5')).toBeInTheDocument();
      expect(screen.queryByText('Factura F001-2')).not.toBeInTheDocument();
    });

    it('el chip Aceptados oculta los rechazados', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Aceptados' }));
      expect(screen.getByText('Boleta B001-5')).toBeInTheDocument();
      expect(screen.queryByText('Factura F001-2')).not.toBeInTheDocument();
    });

    it('el filtro de fecha "Desde" excluye emitidos anteriores', () => {
      render(<FacturacionScreen />);
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-01' } });
      expect(screen.getByText('Boleta B001-5')).toBeInTheDocument();
      expect(screen.queryByText('Factura F001-2')).not.toBeInTheDocument();
    });

    it('"Limpiar filtros" solo aparece con algún filtro activo y los resetea', () => {
      render(<FacturacionScreen />);
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Boletas' }));
      expect(screen.queryByText('Factura F001-2')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
      expect(screen.getByText('Factura F001-2')).toBeInTheDocument();
    });
  });

  it('muestra el estado vacío cuando no hay disponibles', () => {
    vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ disponibles: [] }) as any);
    render(<FacturacionScreen />);
    expect(screen.getByText('Sin comprobantes pendientes')).toBeInTheDocument();
  });

  it('avisa cuando no hay empresa configurada y deshabilita emitir', () => {
    vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ empresas: [] }) as any);
    render(<FacturacionScreen />);
    expect(screen.getByText(/No hay ninguna empresa con certificado SUNAT configurado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir' })).toBeDisabled();
  });

  describe('emitir un comprobante', () => {
    it('abre el modal, elige boleta por defecto y emite con los datos de la empresa única', async () => {
      const emitirComprobante = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirComprobante }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir' }));
      expect(screen.getByLabelText('RUC emisor')).toHaveValue('20123456786');

      fireEvent.click(screen.getByRole('button', { name: 'Emitir boleta' }));

      await waitFor(() => {
        expect(emitirComprobante).toHaveBeenCalledWith('c1', {
          tipoComprobante: 'BOLETA',
          empresaRuc: '20123456786',
          clienteRuc: undefined,
          clienteRazonSocial: undefined,
          clienteDni: undefined,
          clienteNombre: undefined,
        });
      });
    });

    it('con dos RUC deja elegir el emisor de la misma sede', async () => {
      const emitirComprobante = vi.fn().mockResolvedValue(undefined);
      const empresa2 = { ...empresa, id: 'e2', slot: 2, ruc: '20999999999', razonSocial: 'SEGUNDO EMISOR S.A.C.' };
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirComprobante, empresas: [empresa, empresa2] }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir' }));
      fireEvent.change(screen.getByLabelText('RUC emisor'), { target: { value: '20999999999' } });
      fireEvent.click(screen.getByRole('button', { name: 'Emitir boleta' }));

      await waitFor(() => expect(emitirComprobante).toHaveBeenCalledWith('c1', expect.objectContaining({
        empresaRuc: '20999999999',
      })));
    });

    it('factura sin RUC del cliente deja el botón deshabilitado', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Emitir' }));
      fireEvent.click(screen.getByRole('button', { name: 'Factura' }));
      expect(screen.getByRole('button', { name: 'Emitir factura' })).toBeDisabled();
    });

    it('factura con RUC válido emite con los datos del cliente', async () => {
      const emitirComprobante = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirComprobante }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir' }));
      fireEvent.click(screen.getByRole('button', { name: 'Factura' }));
      fireEvent.change(screen.getByLabelText('RUC del cliente'), { target: { value: '20123456789' } });
      fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'CLIENTE SAC' } });
      fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }));

      await waitFor(() => {
        expect(emitirComprobante).toHaveBeenCalledWith('c1', {
          tipoComprobante: 'FACTURA',
          empresaRuc: '20123456786',
          clienteRuc: '20123456789',
          clienteRazonSocial: 'CLIENTE SAC',
          clienteDni: undefined,
          clienteNombre: undefined,
        });
      });
    });
  });

  describe('lista de notas de crédito/débito emitidas', () => {
    it('muestra el estado vacío cuando no hay ninguna', () => {
      render(<FacturacionScreen />);
      expect(screen.getByText('Todavía no emitiste ninguna')).toBeInTheDocument();
    });

    it('lista una nota con el documento afectado, motivo, monto y estado SUNAT', () => {
      const nota = {
        id: 'n1', tipo: 'NOTA_CREDITO', serie: 'FC01', correlativo: 2,
        motivoCodigo: '01', motivoDescripcion: 'Anulación de la operación',
        subtotal: '25.42', igv: '4.58', total: '30.00',
        estado: 'ACEPTADO', motivoRechazo: null, createdAt: '2026-08-13T09:00:00.000Z',
        comprobanteAfectado: { tipo: 'BOLETA', serie: 'B002', correlativo: 9 },
      };
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitidos: [], notas: [nota] }) as any);
      render(<FacturacionScreen />);

      expect(screen.getByText('NC FC01-2')).toBeInTheDocument();
      expect(screen.getByText('Boleta B002-9')).toBeInTheDocument();
      expect(screen.getByText('Anulación de la operación')).toBeInTheDocument();
      expect(screen.getByText('S/ 30.00')).toBeInTheDocument();
      expect(screen.getByText('Aceptado por SUNAT')).toBeInTheDocument();
    });

    it('una nota de débito rechazada muestra ND y el badge de rechazado', () => {
      const nota = {
        id: 'n2', tipo: 'NOTA_DEBITO', serie: 'FD01', correlativo: 1,
        motivoCodigo: '01', motivoDescripcion: 'Intereses por mora',
        subtotal: '8.47', igv: '1.53', total: '10.00',
        estado: 'RECHAZADO', motivoRechazo: 'Formato inválido', createdAt: '2026-08-13T09:00:00.000Z',
        comprobanteAfectado: { tipo: 'FACTURA', serie: 'F001', correlativo: 2 },
      };
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitidos: [], notas: [nota] }) as any);
      render(<FacturacionScreen />);

      expect(screen.getByText('ND FD01-1')).toBeInTheDocument();
      expect(screen.getByText('Rechazado')).toBeInTheDocument();
    });

    it('el chip Crédito filtra las notas de débito', () => {
      const notaCredito = { id: 'n1', tipo: 'NOTA_CREDITO', serie: 'FC01', correlativo: 1, clienteRuc: null, clienteDni: null, clienteRazonSocial: null, clienteNombre: null, motivoCodigo: '01', motivoDescripcion: 'Anulación de la operación', subtotal: '12.71', igv: '2.29', total: '15.00', estado: 'ACEPTADO', motivoRechazo: null, createdAt: '2026-08-12T10:00:00.000Z', comprobanteAfectado: { tipo: 'BOLETA', serie: 'B001', correlativo: 1 } };
      const notaDebito = { id: 'n2', tipo: 'NOTA_DEBITO', serie: 'FD01', correlativo: 1, clienteRuc: null, clienteDni: null, clienteRazonSocial: null, clienteNombre: null, motivoCodigo: '01', motivoDescripcion: 'Intereses por mora', subtotal: '8.47', igv: '1.53', total: '10.00', estado: 'ACEPTADO', motivoRechazo: null, createdAt: '2026-08-12T10:00:00.000Z', comprobanteAfectado: { tipo: 'BOLETA', serie: 'B001', correlativo: 2 } };
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ notas: [notaCredito, notaDebito] }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Crédito' }));
      expect(screen.getByText('NC FC01-1')).toBeInTheDocument();
      expect(screen.queryByText('ND FD01-1')).not.toBeInTheDocument();
    });
  });

  describe('período rápido (hoy / semana / mes)', () => {
    it('"Hoy" fija Desde y Hasta a la fecha de hoy', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));

      const hoy = new Date().toLocaleDateString('en-CA');
      expect(screen.getByLabelText('Desde')).toHaveValue(hoy);
      expect(screen.getByLabelText('Hasta')).toHaveValue(hoy);
      expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
    });
  });

  describe('ver detalle en modal', () => {
    it('el detalle de un comprobante muestra estado, cliente y montos', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle del comprobante' })[0]);

      const dialog = screen.getByRole('dialog', { name: 'Detalle del comprobante' });
      expect(within(dialog).getByText('Boleta B001-5')).toBeInTheDocument();
      expect(within(dialog).getByText('Aceptado por SUNAT')).toBeInTheDocument();
      expect(within(dialog).getByText('Cliente varios')).toBeInTheDocument();
      expect(within(dialog).getByText('S/ 30.00')).toBeInTheDocument();
    });

    it('el detalle de un comprobante RECHAZADO muestra el motivo', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle del comprobante' })[1]);

      const dialog = screen.getByRole('dialog', { name: 'Detalle del comprobante' });
      expect(within(dialog).getByText('Factura F001-2')).toBeInTheDocument();
      expect(within(dialog).getByText('RUC no habido')).toBeInTheDocument();
      expect(within(dialog).getByText('CLIENTE SAC')).toBeInTheDocument();
    });

    it('el detalle de una nota muestra el documento que corrige y el motivo', () => {
      const nota = { id: 'n1', tipo: 'NOTA_CREDITO', serie: 'FC01', correlativo: 1, clienteRuc: null, clienteDni: null, clienteRazonSocial: null, clienteNombre: null, motivoCodigo: '01', motivoDescripcion: 'Anulación de la operación', subtotal: '12.71', igv: '2.29', total: '15.00', estado: 'ACEPTADO', motivoRechazo: null, createdAt: '2026-08-12T10:00:00.000Z', comprobanteAfectado: { tipo: 'BOLETA', serie: 'B001', correlativo: 5 } };
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ notas: [nota] }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de la nota' }));

      const dialog = screen.getByRole('dialog', { name: 'Detalle del comprobante' });
      expect(within(dialog).getByText('Nota de crédito FC01-1')).toBeInTheDocument();
      expect(within(dialog).getByText('Boleta B001-5')).toBeInTheDocument();
      expect(within(dialog).getByText('01 · Anulación de la operación')).toBeInTheDocument();
    });

    it('desde el detalle de un comprobante ACEPTADO se puede pasar directo a emitir nota', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle del comprobante' })[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota' }));

      expect(screen.getByText('Nota sobre boleta B001-5')).toBeInTheDocument();
    });

    it('cierra con el botón Cancelar', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle del comprobante' })[0]);
      const dialog = screen.getByRole('dialog', { name: 'Detalle del comprobante' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('dialog', { name: 'Detalle del comprobante' })).not.toBeInTheDocument();
    });

    it('el detalle de un comprobante de pago disponible muestra el desglose de ítems', () => {
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ disponibles: [disponibleConItems] }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle del comprobante de pago' }));

      const dialog = screen.getByRole('dialog', { name: 'Detalle del comprobante' });
      expect(within(dialog).getByText('Comprobante de pago')).toBeInTheDocument();
      expect(within(dialog).getByText('Javier')).toBeInTheDocument();
      expect(within(dialog).getByText('Ceviche de Caballa')).toBeInTheDocument();
      expect(within(dialog).getByText('Cristal')).toBeInTheDocument();
      expect(within(dialog).getByText('S/ 15.00')).toBeInTheDocument(); // subtotal de 3× Cristal (5 c/u)
    });

    it('desde el detalle de un comprobante de pago disponible se puede pasar directo a emitir', () => {
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ disponibles: [disponibleConItems] }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Ver detalle del comprobante de pago' }));
      const dialog = screen.getByRole('dialog', { name: 'Detalle del comprobante' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Emitir' }));

      expect(screen.getByLabelText('RUC emisor')).toHaveValue('20123456786');
    });
  });

  describe('emitir nota de crédito/débito', () => {
    it('solo el comprobante ACEPTADO tiene botón de nota', () => {
      render(<FacturacionScreen />);
      expect(screen.getAllByRole('button', { name: 'Emitir nota de crédito o débito' })).toHaveLength(1);
    });

    it('abre el modal con nota de crédito por defecto, motivo y monto precargados del comprobante', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota de crédito o débito' }));

      expect(screen.getByText('Nota sobre boleta B001-5')).toBeInTheDocument();
      expect(screen.getByLabelText('Descripción del ítem')).toHaveValue('Anulación de la operación');
      expect(screen.getByLabelText('Monto (con IGV incluido)')).toHaveValue(30);
    });

    it('emite la nota de crédito con el motivo y monto elegidos', async () => {
      const emitirNotaCredito = vi.fn().mockResolvedValue({ id: 'nota-1', tipo: 'NOTA_CREDITO', serie: 'FC01', correlativo: 1 });
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirNotaCredito }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota de crédito o débito' }));
      fireEvent.change(screen.getByLabelText('Monto (con IGV incluido)'), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota de crédito' }));

      await waitFor(() => {
        expect(emitirNotaCredito).toHaveBeenCalledWith('cb1', {
          motivoCodigo: '01',
          items: [{ descripcion: 'Anulación de la operación', cantidad: 1, precioUnitarioConIgv: 10 }],
        });
      });
    });

    it('cambiar a nota de débito usa el catálogo 10 y llama a emitirNotaDebito', async () => {
      const emitirNotaDebito = vi.fn().mockResolvedValue({ id: 'nota-2', tipo: 'NOTA_DEBITO', serie: 'FD01', correlativo: 1 });
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirNotaDebito }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota de crédito o débito' }));
      fireEvent.click(screen.getByRole('button', { name: 'Nota de débito' }));
      expect(screen.getByLabelText('Descripción del ítem')).toHaveValue('Intereses por mora');

      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota de débito' }));

      await waitFor(() => {
        expect(emitirNotaDebito).toHaveBeenCalledWith('cb1', {
          motivoCodigo: '01',
          items: [{ descripcion: 'Intereses por mora', cantidad: 1, precioUnitarioConIgv: 30 }],
        });
      });
    });

    it('rechaza un monto en cero o inválido sin llamar a la API', () => {
      const emitirNotaCredito = vi.fn();
      const toast = vi.fn();
      vi.mocked(useToast).mockReturnValue({ toast } as any);
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirNotaCredito }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota de crédito o débito' }));
      fireEvent.change(screen.getByLabelText('Monto (con IGV incluido)'), { target: { value: '0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota de crédito' }));

      expect(emitirNotaCredito).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'err' }));
    });

    it('cierra el modal con Cancelar sin llamar a la API', () => {
      const emitirNotaCredito = vi.fn();
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirNotaCredito }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir nota de crédito o débito' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByText('Nota sobre boleta B001-5')).not.toBeInTheDocument();
      expect(emitirNotaCredito).not.toHaveBeenCalled();
    });
  });

  describe('configurar SUNAT (alta de empresa emisora)', () => {
    it('con 1 empresa configurada, el botón de cabecera ofrece agregar otra (queda espacio para el 2do slot)', () => {
      render(<FacturacionScreen />);
      expect(screen.getByRole('button', { name: /Agregar otra empresa/i })).toBeInTheDocument();
      expect(screen.queryByText(/No hay ninguna empresa/i)).not.toBeInTheDocument();
    });

    it('sin ninguna empresa, muestra el aviso y el botón dice "Configurar SUNAT"', () => {
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ empresas: [] }) as any);
      render(<FacturacionScreen />);
      expect(screen.getByText(/No hay ninguna empresa con certificado SUNAT configurado/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Configurar SUNAT' })).toBeInTheDocument();
    });

    it('con los 2 slots ocupados, no ofrece agregar una tercera empresa', () => {
      const empresa2 = { id: 'e2', slot: 2, ruc: '20999999999', razonSocial: 'Otra SAC', activo: true };
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ empresas: [empresa, empresa2] }) as any);
      render(<FacturacionScreen />);
      expect(screen.queryByRole('button', { name: /Configurar SUNAT|Agregar otra empresa/i })).not.toBeInTheDocument();
    });

    it('mientras se cargan las empresas, no muestra el aviso de "sin configurar" (evita el flash)', () => {
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ empresas: [], empresasLoading: true }) as any);
      render(<FacturacionScreen />);
      expect(screen.queryByText(/No hay ninguna empresa/i)).not.toBeInTheDocument();
    });

    it('abre y cierra el modal de configuración', () => {
      render(<FacturacionScreen />);
      expect(screen.queryByTestId('configurar-empresa-modal')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Agregar otra empresa/i }));
      expect(screen.getByTestId('configurar-empresa-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal config' }));
      expect(screen.queryByTestId('configurar-empresa-modal')).not.toBeInTheDocument();
    });

    it('al guardar con éxito, avisa con un toast y cierra el modal', async () => {
      const toast = vi.fn();
      vi.mocked(useToast).mockReturnValue({ toast } as any);
      const crearEmpresa = vi.fn().mockResolvedValue({ id: 'e-2', slot: 2, ruc: '20999999999', razonSocial: 'Otra SAC', activo: true });
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ crearEmpresa }) as any);

      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: /Agregar otra empresa/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar config' }));

      await waitFor(() => {
        expect(crearEmpresa).toHaveBeenCalledWith({ ruc: '20999999999' });
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ok' }));
        expect(screen.queryByTestId('configurar-empresa-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('empresas configuradas (edición y activo/inactivo)', () => {
    it('lista las empresas configuradas con su RUC y botón de editar', () => {
      render(<FacturacionScreen />);
      expect(screen.getByText('Empresas configuradas')).toBeInTheDocument();
      expect(screen.getByText('20123456786')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editar EMPRESA DEMO S.A.C.' })).toBeInTheDocument();
    });

    it('muestra el nombre de la sede enlazada, o "Sin asignar" si no tiene', () => {
      const sinSede = { ...empresa, id: 'e2', sedeId: null, razonSocial: 'Otra SAC' };
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ empresas: [empresa, sinSede] }) as any);
      render(<FacturacionScreen />);

      expect(screen.getByText('Sede Central')).toBeInTheDocument();
      expect(screen.getByText('Sin asignar')).toBeInTheDocument();
    });

    it('no muestra la sección si todavía no hay ninguna empresa', () => {
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ empresas: [] }) as any);
      render(<FacturacionScreen />);
      expect(screen.queryByText('Empresas configuradas')).not.toBeInTheDocument();
    });

    it('abre y cierra el modal de edición', () => {
      render(<FacturacionScreen />);
      expect(screen.queryByTestId('editar-empresa-modal')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Editar EMPRESA DEMO S.A.C.' }));
      expect(screen.getByTestId('editar-empresa-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal editar' }));
      expect(screen.queryByTestId('editar-empresa-modal')).not.toBeInTheDocument();
    });

    it('al guardar la edición, avisa con un toast y cierra el modal', async () => {
      const toast = vi.fn();
      vi.mocked(useToast).mockReturnValue({ toast } as any);
      const actualizarEmpresa = vi.fn().mockResolvedValue({ id: 'e1', slot: 1, ruc: '20123456786', razonSocial: 'Nombre editado', activo: true });
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ actualizarEmpresa }) as any);

      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Editar EMPRESA DEMO S.A.C.' }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }));

      await waitFor(() => {
        expect(actualizarEmpresa).toHaveBeenCalledWith('e1', { razonSocial: 'Nombre editado' });
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ok' }));
        expect(screen.queryByTestId('editar-empresa-modal')).not.toBeInTheDocument();
      });
    });

    it('el toggle de estado desactiva una empresa sin abrir el modal', async () => {
      const cambiarEstadoEmpresa = vi.fn().mockResolvedValue({ id: 'e1', activo: false });
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ cambiarEstadoEmpresa }) as any);

      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Desactivar EMPRESA DEMO S.A.C.' }));

      await waitFor(() => {
        expect(cambiarEstadoEmpresa).toHaveBeenCalledWith('e1', false);
      });
      expect(screen.queryByTestId('editar-empresa-modal')).not.toBeInTheDocument();
    });

    it('una empresa inactiva sigue listada, y su toggle ofrece reactivar', () => {
      const inactiva = { ...empresa, activo: false };
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ empresas: [inactiva] }) as any);
      render(<FacturacionScreen />);
      expect(screen.getByRole('button', { name: 'Reactivar EMPRESA DEMO S.A.C.' })).toBeInTheDocument();
    });
  });
});
