// @ts-nocheck
/* eslint-disable */

import axios from 'axios';

jest.mock('axios', () => {
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  return {
    __esModule: true,
    default: { get: mockGet, post: mockPost },
    get: mockGet,
    post: mockPost,
  };
});

jest.mock('@org/resiliencia', () => {
  const actual = jest.requireActual('@org/resiliencia') as any;
  return {
    ...actual,
    CircuitBreakerOptions: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { NotFoundException } from '@nestjs/common';
import { AppService } from './app.service';
import { CuentasHttpClient } from './cuentas-http.client';

function createMockPrismaService(): any {
  const mock: any = {
    $connect: () => Promise.resolve(),
    $disconnect: () => Promise.resolve(),
    $transaction: jest.fn<any>((cb: (m: unknown) => unknown) => cb(mock)),
    checkAndRecordIdempotencyKey: () => Promise.resolve(true),
    transaccion: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    cuentaAbierta: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    turnoCaja: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    arqueoCaja: {
      create: jest.fn(),
    },
    cierreCaja: {
      create: jest.fn(),
    },
    movimientoCaja: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    pagoPendiente: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  return mock;
}

describe('AppService — Caja', () => {
  let service: AppService;
  let mockPrisma: any;
  let mockTokenService: { generateServiceToken: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTokenService = { generateServiceToken: jest.fn().mockReturnValue('mock-service-token') };

    mockPrisma = createMockPrismaService();

    process.env['CUENTAS_SERVICE_URL'] = 'http://localhost:3005/api';

    // T-40: el cliente HTTP real con el token service mockeado, para que los
    // specs sigan espiando axios de extremo a extremo.
    service = new AppService(mockPrisma as never, new CuentasHttpClient(mockTokenService as never));
  });

  describe('registrarPago', () => {
    const turnoAbierto = {
      id: 'turno-001',
      cajaId: 'T01',
      cajaNombre: 'Terminal 01',
      usuarioId: 'u-001',
      cajeroNombre: 'Caja',
      fondoInicial: 300,
      estado: 'ABIERTA',
      abiertoAt: new Date(),
      cerradoAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('debe registrar un pago y publicar evento', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' } });
      jest.mocked(axios.post).mockResolvedValue({ data: { ticket: { id: 'tk-001', total: 50 } } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.cuentaAbierta.update.mockResolvedValue({});
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      const transaccionCreada = {
        id: 't-001',
        cuentaId: 'c-001',
        turnoId: 'turno-001',
        mesaId: 'm-001',
        monto: 50,
        metodo: 'EFECTIVO',
        referencia: null,
        notas: null,
        createdAt: new Date(),
      };
      mockPrisma.transaccion.create.mockResolvedValue(transaccionCreada);
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.registrarPago({
        cuentaId: 'c-001',
        montoRecibido: 50,
        metodo: 'EFECTIVO',
      });

      expect(result.transaccion).toBeDefined();
      expect(result.transaccion.monto).toBe(50);
      expect(mockPrisma.movimientoCaja.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: 'VENTA',
            turnoId: 'turno-001',
            transaccionId: 't-001',
          }),
        }),
      );
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            routingKey: 'pago.registrado',
          })
        })
      );
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:3005/api/c-001/cerrar',
        { descuento: 0 },
        expect.any(Object),
      );
    });

    it('denormaliza el correlativo de la atención en la Transaccion y el MovimientoCaja', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({
        data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA', correlativo: 'A0000042' },
      });
      jest.mocked(axios.post).mockResolvedValue({ data: { ticket: { id: 'tk-001', total: 50 } } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.cuentaAbierta.update.mockResolvedValue({});
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      mockPrisma.transaccion.create.mockResolvedValue({
        id: 't-001', cuentaId: 'c-001', turnoId: 'turno-001', mesaId: 'm-001', monto: 50, metodo: 'EFECTIVO',
        referencia: null, notas: null, cuentaCorrelativo: 'A0000042', createdAt: new Date(),
      });
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.registrarPago({ cuentaId: 'c-001', montoRecibido: 50, metodo: 'EFECTIVO' });

      expect(result.transaccion.cuentaCorrelativo).toBe('A0000042');
      expect(mockPrisma.transaccion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cuentaCorrelativo: 'A0000042' }) }),
      );
      expect(mockPrisma.movimientoCaja.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cuentaCorrelativo: 'A0000042' }) }),
      );
    });

    it('denormaliza el mesero dominante de la cuenta en la transacción (auditoría)', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({
        data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA', meseroId: 'mesero-1', meseroNombre: 'Ana Mesa' },
      });
      jest.mocked(axios.post).mockResolvedValue({ data: { ticket: { id: 'tk-001', total: 50 } } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.cuentaAbierta.update.mockResolvedValue({});
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      mockPrisma.transaccion.create.mockResolvedValue({
        id: 't-001', cuentaId: 'c-001', turnoId: 'turno-001', mesaId: 'm-001', monto: 50, metodo: 'EFECTIVO',
        referencia: null, notas: null, meseroId: 'mesero-1', meseroNombre: 'Ana Mesa', createdAt: new Date(),
      });
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.registrarPago({ cuentaId: 'c-001', montoRecibido: 50, metodo: 'EFECTIVO' });

      expect(mockPrisma.transaccion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ meseroId: 'mesero-1', meseroNombre: 'Ana Mesa' }),
        }),
      );
    });

    it('debe registrar el usuarioId y cajeroNombre de quien cobra en la transacción', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' } });
      jest.mocked(axios.post).mockResolvedValue({ data: { ticket: { id: 'tk-001', total: 50 } } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.cuentaAbierta.update.mockResolvedValue({});
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      mockPrisma.transaccion.create.mockResolvedValue({
        id: 't-001',
        cuentaId: 'c-001',
        turnoId: 'turno-001',
        mesaId: 'm-001',
        monto: 50,
        metodo: 'EFECTIVO',
        referencia: null,
        notas: null,
        usuarioId: 'cajero-42',
        cajeroNombre: 'Yurlury Quispe',
        createdAt: new Date(),
      });
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.registrarPago(
        { cuentaId: 'c-001', montoRecibido: 50, metodo: 'EFECTIVO' },
        'cajero-42',
        'Yurlury Quispe',
      );

      expect(mockPrisma.transaccion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            usuarioId: 'cajero-42',
            cajeroNombre: 'Yurlury Quispe',
          }),
        }),
      );
      expect(result.transaccion.usuarioId).toBe('cajero-42');
      expect(result.transaccion.cajeroNombre).toBe('Yurlury Quispe');
    });

    it('debe consultar cuenta remota antes de abrir la transacción con lock', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' } });
      jest.mocked(axios.post).mockResolvedValue({ data: { ticket: { id: 'tk-001', total: 50 } } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.cuentaAbierta.update.mockResolvedValue({});
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      mockPrisma.transaccion.create.mockResolvedValue({
        id: 't-001',
        cuentaId: 'c-001',
        turnoId: 'turno-001',
        mesaId: 'm-001',
        monto: 50,
        metodo: 'EFECTIVO',
        referencia: null,
        notas: null,
        createdAt: new Date(),
      });
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.registrarPago({
        cuentaId: 'c-001',
        montoRecibido: 50,
        metodo: 'EFECTIVO',
      });

      expect(jest.mocked(axios.get).mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.$transaction.mock.invocationCallOrder[0],
      );
    });

    it('debe rechazar si el monto supera lo pendiente de la cuenta (T-16: pagos parciales)', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });

      await expect(
        service.registrarPago({ cuentaId: 'c-001', montoRecibido: 60, metodo: 'EFECTIVO' })
      ).rejects.toThrow('supera lo pendiente');
    });

    it('acepta un pago parcial y devuelve el saldo pendiente sin cerrar la cuenta (T-16)', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 100, estado: 'ABIERTA' } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 100, estado: 'ABIERTA' });
      mockPrisma.cuentaAbierta.update.mockResolvedValue({});
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      mockPrisma.transaccion.create.mockResolvedValue({
        id: 't-001', cuentaId: 'c-001', turnoId: 'turno-001', mesaId: 'm-001',
        monto: 40, metodo: 'EFECTIVO', referencia: null, notas: null, createdAt: new Date(),
      });
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.registrarPago({ cuentaId: 'c-001', montoRecibido: 40, metodo: 'EFECTIVO' });

      expect(result.pendiente).toBe(60);
      expect(axios.post).not.toHaveBeenCalledWith(expect.stringContaining('/cerrar'), expect.anything(), expect.anything());
    });
  });

  describe('abrirTurno — T-25 carrera', () => {
    const turnoAbierto = {
      id: 'turno-001',
      cajaId: 'T01',
      cajaNombre: 'Terminal 01',
      usuarioId: 'u-001',
      cajeroNombre: 'Caja',
      fondoInicial: 300,
      estado: 'ABIERTA',
      abiertoAt: new Date(),
      cerradoAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('devuelve el turno existente si ya hay uno ABIERTA (sin crear)', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);

      const result = await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001', 'sede-001');

      expect(result.id).toBe('turno-001');
      expect(mockPrisma.turnoCaja.create).not.toHaveBeenCalled();
    });

    it('crea un turno nuevo cuando no hay ninguno abierto', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValueOnce(null);
      mockPrisma.turnoCaja.create.mockResolvedValue(turnoAbierto);
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001', 'sede-001');

      expect(result.id).toBe('turno-001');
      expect(mockPrisma.turnoCaja.create).toHaveBeenCalled();
    });

    it('emite TurnoCajaAbierto para que identidad active a los meseros de la sede', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValueOnce(null);
      mockPrisma.turnoCaja.create.mockResolvedValue(turnoAbierto);
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001', 'sede-001');

      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            routingKey: 'turno.abierto',
            payload: JSON.stringify({ turnoId: 'turno-001', sedeId: 'sede-001' }),
          }),
        }),
      );
    });

    it('no emite TurnoCajaAbierto si ya había un turno abierto (sin crear de nuevo)', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);

      await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001', 'sede-001');

      expect(mockPrisma.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('ante carrera (P2002 del índice único) devuelve el turno ganador', async () => {
      // 1ª lectura: no hay turno → intenta crear; el índice rechaza con P2002;
      // 2ª lectura: el turno del ganador ya está ABIERTA.
      mockPrisma.turnoCaja.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(turnoAbierto);
      mockPrisma.turnoCaja.create.mockRejectedValue({ code: 'P2002' });

      const result = await service.abrirTurno({ fondoInicial: 300 } as any, 'u-002', 'sede-001');

      expect(result.id).toBe('turno-001');
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.abrirTurno({ fondoInicial: 300 } as any, 'u-001', null)).rejects.toThrow('Indica la sede');
    });
  });

  describe('abrirTurno — reintenta los pagos que quedaron en cola con la caja cerrada', () => {
    const turnoAbierto = {
      id: 'turno-001', cajaId: 'T01', cajaNombre: 'Terminal 01', usuarioId: 'u-001', cajeroNombre: 'Caja',
      fondoInicial: 300, estado: 'ABIERTA', abiertoAt: new Date(), cerradoAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const pagoPendiente = {
      id: 'pp-1', sedeId: 'sede-001', cuentaId: 'c-001', montoRecibido: 50, metodo: 'EFECTIVO',
      descuento: null, propina: null, mesaNumero: '3', mesaUnidaCon: null, referencia: null, notas: null,
      tipoComprobante: 'BOLETA', clienteDocumento: null, usuarioId: 'u-mesero', cajeroNombre: 'Ana',
      estado: 'PENDIENTE', transaccionId: null, error: null, createdAt: new Date(), procesadoAt: null,
    };

    it('al abrir turno, registra el pago que había quedado en espera para esa sede', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValueOnce(null);
      mockPrisma.turnoCaja.create.mockResolvedValue(turnoAbierto);
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});
      mockPrisma.pagoPendiente.findMany.mockResolvedValueOnce([pagoPendiente]);
      mockPrisma.pagoPendiente.updateMany.mockResolvedValue({ count: 1 });
      // El replay llama a registrarPago de nuevo: ahora SÍ hay turno abierto
      // (findFirst ya no está en modo "una sola vez", así que devuelve turnoAbierto).
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', sedeId: 'sede-001', total: 50, estado: 'ABIERTA' } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      mockPrisma.transaccion.create.mockResolvedValue({ id: 'tx-1', cuentaId: 'c-001', monto: 50, metodo: 'EFECTIVO', createdAt: new Date() });

      await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001', 'sede-001');

      expect(mockPrisma.pagoPendiente.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pp-1', estado: 'PENDIENTE' }, data: { estado: 'PROCESANDO' } }),
      );
      expect(mockPrisma.transaccion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cuentaId: 'c-001', turnoId: 'turno-001' }) }),
      );
      expect(mockPrisma.pagoPendiente.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pp-1' }, data: expect.objectContaining({ estado: 'PROCESADO', transaccionId: 'tx-1' }) }),
      );
    });

    it('si un pago en cola ya no se puede registrar (p. ej. la cuenta ya no existe), lo marca FALLIDO sin tumbar la apertura', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValueOnce(null);
      mockPrisma.turnoCaja.create.mockResolvedValue(turnoAbierto);
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});
      mockPrisma.pagoPendiente.findMany.mockResolvedValueOnce([pagoPendiente]);
      mockPrisma.pagoPendiente.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockRejectedValue({ response: { status: 404 } });

      const result = await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001', 'sede-001');

      expect(result.id).toBe('turno-001');
      expect(mockPrisma.pagoPendiente.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pp-1' }, data: expect.objectContaining({ estado: 'FALLIDO' }) }),
      );
    });

    it('no reintenta una fila que otra apertura concurrente ya reclamó (count 0)', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      mockPrisma.pagoPendiente.findMany.mockResolvedValueOnce([pagoPendiente]);
      mockPrisma.pagoPendiente.updateMany.mockResolvedValue({ count: 0 });

      await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001', 'sede-001');

      expect(mockPrisma.pagoPendiente.update).not.toHaveBeenCalled();
      expect(mockPrisma.transaccion.create).not.toHaveBeenCalled();
    });
  });

  describe('cerrarTurno', () => {
    const turnoParaCerrar = {
      id: 'turno-001',
      sedeId: 'sede-001',
      cajaId: 'T01',
      cajaNombre: 'Terminal 01',
      usuarioId: 'u-001',
      cajeroNombre: 'Caja',
      fondoInicial: 300,
      estado: 'ABIERTA',
      abiertoAt: new Date(),
      cerradoAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      movimientos: [],
      arqueos: [],
      cierre: null,
    };

    beforeEach(() => {
      mockPrisma.turnoCaja.findUnique.mockResolvedValue(turnoParaCerrar);
      mockPrisma.arqueoCaja.create.mockResolvedValue({
        id: 'arq-001', turnoId: 'turno-001', denominaciones: {}, efectivoEsperado: 0, efectivoContado: 0, diferencia: 0, usuarioId: 'u-001', createdAt: new Date(),
      });
      mockPrisma.cierreCaja.create.mockResolvedValue({
        id: 'cierre-001', turnoId: 'turno-001', montoEsperado: 0, montoReal: 0, diferencia: 0, usuarioId: 'u-001', resumen: {}, createdAt: new Date(),
      });
      mockPrisma.turnoCaja.update.mockResolvedValue({ ...turnoParaCerrar, estado: 'CERRADA', cerradoAt: new Date() });
      mockPrisma.outboxEvent.create.mockResolvedValue({});
      // Guard de cierre (verificarSinCuentasAbiertas): sin cuentas pendientes.
      jest.mocked(axios.get).mockResolvedValue({ data: { cuentas: [] } });
    });

    it('emite TurnoCajaCerrado para que identidad desactive a los meseros de la sede', async () => {
      await service.cerrarTurno('turno-001', { denominaciones: {} } as any, 'u-001', 'sede-001');

      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            routingKey: 'turno.cerrado',
            payload: JSON.stringify({ turnoId: 'turno-001', sedeId: 'sede-001' }),
          }),
        }),
      );
    });

    it('marca el turno como CERRADA', async () => {
      const result = await service.cerrarTurno('turno-001', { denominaciones: {} } as any, 'u-001', 'sede-001');

      expect(mockPrisma.turnoCaja.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'turno-001' }, data: expect.objectContaining({ estado: 'CERRADA' }) }),
      );
      expect(result.turno.estado).toBe('CERRADA');
    });
  });

  describe('listarTransacciones', () => {
    it('debe retornar lista de transacciones', async () => {
      mockPrisma.transaccion.findMany.mockResolvedValue([
        { id: 't-001', cuentaId: 'c-001', monto: 50, metodo: 'EFECTIVO', referencia: null, notas: null, createdAt: new Date() },
        { id: 't-002', cuentaId: 'c-002', monto: 80, metodo: 'TARJETA', referencia: 'ref-1', notas: null, createdAt: new Date() },
      ]);

      const result = await service.listarTransacciones({}, 'sede-001');

      expect(result.data).toHaveLength(2);
      expect(result.data[0].monto).toBe(50);
      expect(result.data[1].monto).toBe(80);
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.listarTransacciones({}, null)).rejects.toThrow('Indica la sede');
    });
  });

  describe('obtenerTransaccion', () => {
    it('devuelve el detalle de la transacción', async () => {
      mockPrisma.transaccion.findUnique.mockResolvedValue({
        id: 't-001', cuentaId: 'c-001', monto: 50, descuento: 0, metodo: 'EFECTIVO', referencia: null, notas: null, createdAt: new Date(),
      });

      const result = await service.obtenerTransaccion('t-001');

      expect(result.id).toBe('t-001');
      expect(result.metodo).toBe('EFECTIVO');
    });

    it('lanza NotFoundException si la transacción no existe', async () => {
      mockPrisma.transaccion.findUnique.mockResolvedValue(null);
      await expect(service.obtenerTransaccion('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizarTransaccion', () => {
    it('lanza NotFoundException si la transacción no existe', async () => {
      mockPrisma.transaccion.findUnique.mockResolvedValue(null);
      await expect(service.actualizarTransaccion('inexistente', { metodo: 'TARJETA' })).rejects.toThrow(NotFoundException);
    });

    it('actualiza el método y también corrige el MovimientoCaja vinculado (cuadre de caja)', async () => {
      mockPrisma.transaccion.findUnique.mockResolvedValue({
        id: 't-001', cuentaId: 'c-001', monto: 50, descuento: 0, metodo: 'YAPE', referencia: null, notas: null, createdAt: new Date(),
      });
      mockPrisma.transaccion.update.mockResolvedValue({
        id: 't-001', cuentaId: 'c-001', monto: 50, descuento: 0, metodo: 'EFECTIVO', referencia: null, notas: null, createdAt: new Date(),
      });

      const result = await service.actualizarTransaccion('t-001', { metodo: 'EFECTIVO' });

      expect(result.transaccion.metodo).toBe('EFECTIVO');
      expect(mockPrisma.transaccion.update).toHaveBeenCalledWith({ where: { id: 't-001' }, data: { metodo: 'EFECTIVO' } });
      expect(mockPrisma.movimientoCaja.updateMany).toHaveBeenCalledWith({
        where: { transaccionId: 't-001' },
        data: { metodo: 'EFECTIVO' },
      });
    });

    it('actualiza solo las notas sin tocar el MovimientoCaja (el método no cambió)', async () => {
      mockPrisma.transaccion.findUnique.mockResolvedValue({
        id: 't-001', cuentaId: 'c-001', monto: 50, descuento: 0, metodo: 'EFECTIVO', referencia: null, notas: null, createdAt: new Date(),
      });
      mockPrisma.transaccion.update.mockResolvedValue({
        id: 't-001', cuentaId: 'c-001', monto: 50, descuento: 0, metodo: 'EFECTIVO', referencia: null, notas: 'Cliente pidió factura', createdAt: new Date(),
      });

      const result = await service.actualizarTransaccion('t-001', { notas: 'Cliente pidió factura' });

      expect(result.transaccion.notas).toBe('Cliente pidió factura');
      expect(mockPrisma.transaccion.update).toHaveBeenCalledWith({ where: { id: 't-001' }, data: { notas: 'Cliente pidió factura' } });
      expect(mockPrisma.movimientoCaja.updateMany).not.toHaveBeenCalled();
    });
  });
});
