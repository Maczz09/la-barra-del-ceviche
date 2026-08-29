// @ts-nocheck
/* eslint-disable */

import axios from 'axios';

// T-33: neutralizar el breaker en los specs del servicio (igual que en caja);
// el comportamiento del breaker se prueba aparte en http-clients.breaker.spec.ts.
jest.mock('@org/resiliencia', () => {
  const actual = jest.requireActual('@org/resiliencia') as any;
  return {
    ...actual,
    CircuitBreakerOptions: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { register } from 'prom-client';
import { AppService } from './app.service';
import { MesasHttpClient } from './mesas-http.client';
import { InventarioHttpClient } from './inventario-http.client';
import { PedidosSagaService } from './pedidos-saga.service';
import { PedidoEstado } from '@org/contracts';

function createMockPrismaService(overrides: Record<string, any> = {}): any {
  const mock: any = {
    $connect: async () => {},
    $disconnect: async () => {},
    checkAndRecordIdempotencyKey: async (_key: string) => true,
    ...overrides,
  };
  return mock;
}

function createMockPublisher() {
  return {
    publish: jest.fn().mockResolvedValue({} as any),
    generateServiceToken: jest.fn().mockReturnValue('service-token'),
  };
}

// T-33: los clientes HTTP reales con el token service mockeado, para que los
// specs sigan espiando axios de extremo a extremo.
function createService(prisma: any, tokenService: any) {
  return new AppService(
    prisma,
    new MesasHttpClient(tokenService),
    new InventarioHttpClient(tokenService),
    new PedidosSagaService(prisma),
  );
}

describe('AppService — Pedidos', () => {
  let service: AppService;
  let mockPrisma: any;
  let mockPublisher: ReturnType<typeof createMockPublisher>;

  const basePedido = {
    id: 'p-001',
    mesaId: 'm-001',
    numeroMesa: 5,
    estado: PedidoEstado.Pendiente,
    total: 100,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrismaService({
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ stockActual: 1 }]),
      pedido: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      pedidoItem: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      productoLocal: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([] as any),
        upsert: jest.fn(),
      },
      mesaLocal: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      idempotencyKey: {
        create: jest.fn().mockResolvedValue({}),
      },
      outboxEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(mockPrisma)),
    });
    mockPublisher = createMockPublisher();

    service = createService(mockPrisma as never, mockPublisher as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validarMesa', () => {
    it('usa la proyección local cuando la mesa ya está sincronizada', async () => {
      const mesaLocal = { id: 'mesa-1', sedeId: 'sede-001', numero: 1, updatedAt: new Date() };
      mockPrisma.mesaLocal.findUnique.mockResolvedValue(mesaLocal);
      const getSpy = jest.spyOn(axios, 'get');

      await expect((service as any).validarMesa('mesa-1')).resolves.toBe(mesaLocal);
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('re-sincroniza contra servicio-mesas cuando la proyección local no tiene sedeId (legado)', async () => {
      const mesaLocalSinSede = { id: 'mesa-1', sedeId: null, numero: 1, updatedAt: new Date() };
      const mesaLocalConSede = { id: 'mesa-1', sedeId: 'sede-001', numero: 1, updatedAt: new Date() };
      mockPrisma.mesaLocal.findUnique.mockResolvedValue(mesaLocalSinSede);
      mockPrisma.mesaLocal.upsert.mockResolvedValue(mesaLocalConSede);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { id: 'mesa-1', numero: 1, sedeId: 'sede-001' } });

      await expect((service as any).validarMesa('mesa-1')).resolves.toBe(mesaLocalConSede);
      expect(axios.get).toHaveBeenCalled();
    });

    it('sincroniza la mesa desde servicio-mesas cuando falta en pedidos', async () => {
      const mesaLocal = { id: 'mesa-1', sedeId: 'sede-001', numero: 1, updatedAt: new Date() };
      mockPrisma.mesaLocal.findUnique.mockResolvedValue(null);
      mockPrisma.mesaLocal.upsert.mockResolvedValue(mesaLocal);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { id: 'mesa-1', numero: 1, sedeId: 'sede-001' } });

      await expect((service as any).validarMesa('mesa-1')).resolves.toBe(mesaLocal);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/mesa-1'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer service-token' },
        }),
      );
      expect(mockPrisma.mesaLocal.upsert).toHaveBeenCalledWith({
        where: { id: 'mesa-1' },
        create: { id: 'mesa-1', sedeId: 'sede-001', numero: 1 },
        update: { sedeId: 'sede-001', numero: 1 },
      });
    });
  });

  describe('procesarPagoRecibido', () => {
    it('marca en lote los pedidos cobrables de la mesa como PAGADO', async () => {
      mockPrisma.pedido.updateMany.mockResolvedValue({ count: 2 });

      await service.procesarPagoRecibido({
        cuentaId: 'cuenta-1',
        mesaId: 'mesa-1',
        monto: 100,
        metodo: 'EFECTIVO',
        transaccionId: 'tx-1',
        pendiente: 0,
      });

      expect(mockPrisma.pedido.updateMany).toHaveBeenCalledWith({
        where: {
          mesaId: 'mesa-1',
          estado: {
            notIn: [
              PedidoEstado.Pagado,
              PedidoEstado.Cancelado,
              PedidoEstado.RechazadoSinStock,
            ],
          },
        },
        data: { estado: PedidoEstado.Pagado },
      });
      expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.pedido.update).not.toHaveBeenCalled();
    });

    it('es idempotente por convergencia en reentrega', async () => {
      mockPrisma.pedido.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await service.procesarPagoRecibido({ cuentaId: 'c-001', mesaId: 'm-1', monto: 100, metodo: 'EFECTIVO', transaccionId: 'tx-1', pendiente: 0 });
      await expect(service.procesarPagoRecibido({ cuentaId: 'c-001', mesaId: 'm-empty', monto: 100, metodo: 'EFECTIVO', transaccionId: 'tx-2', pendiente: 0 })).resolves.not.toThrow();
      expect(mockPrisma.pedido.updateMany).toHaveBeenCalledTimes(2);
    });

    it('es idempotente si atrapa error P2002 de base de datos', async () => {
      mockPrisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.procesarPagoRecibido({ cuentaId: 'c-1', mesaId: 'm-1', monto: 1, metodo: 'EF', transaccionId: 'tx-3', pendiente: 0 })).resolves.toBeUndefined();
    });

    it('re-lanza error si no es P2002', async () => {
      const err = new Error('test db crash');
      (err as any).code = 'P500';
      mockPrisma.$transaction.mockRejectedValueOnce(err);
      await expect(service.procesarPagoRecibido({ cuentaId: 'c-1', mesaId: 'm-1', monto: 1, metodo: 'EF', transaccionId: 'tx-4', pendiente: 0 })).rejects.toThrow('test db crash');
    });

    it('T-16: no marca pedidos como pagados si el pago es parcial (pendiente > 0)', async () => {
      await service.procesarPagoRecibido({ cuentaId: 'c-001', mesaId: 'm-1', monto: 40, metodo: 'EFECTIVO', transaccionId: 'tx-parcial', pendiente: 37 });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.pedido.updateMany).not.toHaveBeenCalled();
    });
  });

  // T-40: los specs de transiciones y derivación viven ahora en
  // pedidos-saga.service.spec.ts, junto a la clase extraída.

  describe('listarPedidos', () => {
    const SEDE = 'sede-001';

    it('debe listar solo pedidos activos por mesa', async () => {
      jest.spyOn(mockPrisma.pedido, 'findMany').mockResolvedValue([] as any);

      await service.listarPedidos({ mesaId: 'mesa-1' }, SEDE);

      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          sedeId: SEDE,
          mesaId: 'mesa-1',
          estado: { notIn: [PedidoEstado.Pagado, PedidoEstado.Cancelado] },
        },
        take: 21,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }));
    });

    it('buscar por correlativo de atención no aplica el filtro "solo activos" por defecto (cross-referencing desde Mermas/Auditoría)', async () => {
      jest.spyOn(mockPrisma.pedido, 'findMany').mockResolvedValue([] as any);

      await service.listarPedidos({ search: 'A000004' }, SEDE);

      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          sedeId: SEDE,
          cuentaCorrelativo: { contains: 'A000004', mode: 'insensitive' },
        },
      }));
    });

    it('devuelve data y nextCursor cuando hay mas resultados', async () => {
      jest.spyOn(mockPrisma.pedido, 'findMany').mockResolvedValue([
        { ...basePedido, id: 'p-001' },
        { ...basePedido, id: 'p-002' },
        { ...basePedido, id: 'p-003' },
      ] as never);

      const result = await service.listarPedidos({ limit: 2 }, SEDE);

      expect(result.data.map((pedido) => pedido.id)).toEqual(['p-001', 'p-002']);
      expect(result.nextCursor).toBe('p-002');
      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 3,
      }));
    });

    it('aplica cursor, estado, updatedSince y tope maximo de limit', async () => {
      jest.spyOn(mockPrisma.pedido, 'findMany').mockResolvedValue([] as any);

      await service.listarPedidos({
        cursor: 'p-010',
        estado: PedidoEstado.Listo,
        updatedSince: '2026-01-01T00:00:00.000Z',
        limit: 500,
      }, SEDE);

      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          sedeId: SEDE,
          estado: PedidoEstado.Listo,
          updatedAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
        },
        cursor: { id: 'p-010' },
        skip: 1,
        take: 101,
      }));
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.listarPedidos({}, null)).rejects.toThrow('Indica la sede');
    });
  });

  describe('upsertProductoLocal', () => {
    it('no debe re-inflar stock local si producto.actualizado de consumo llega stale-alto', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 7,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.upsertProductoLocal({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 12,
        categoriaNombre: 'COCINA',
        disponible: true,
        allowStockIncrease: false,
      });

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 7 }),
      }));
    });

    it('debe permitir aumento de stock local cuando la actualizacion es reposicion', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 7,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.upsertProductoLocal({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 12,
        categoriaNombre: 'COCINA',
        disponible: true,
        allowStockIncrease: true,
        stockDelta: 5,
        stockSyncMode: 'REPOSICION',
      });

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 12 }),
      }));
    });
  });

  describe('persistirPedido', () => {
    it('no debe reservar stock local para productos sin control de stock', async () => {
      mockPrisma.pedido.create.mockResolvedValue({
        ...basePedido,
        items: [
          {
            id: 'item-1',
            pedidoId: 'p-001',
            productoId: 'prod-libre',
            nombre: 'Ceviche',
            cantidad: 2,
            precioUnitario: 25,
            area: 'COCINA',
            notas: null,
            estado: PedidoEstado.Pendiente,
            comensal: 1,
          },
        ],
      } as any);

      await (service as any).persistirPedido({
        mesaId: 'mesa-1',
        numeroMesa: 1,
        items: [
          {
            productoId: 'prod-libre',
            nombre: 'Ceviche',
            cantidad: 2,
            precioUnitario: 25,
            stockActual: null,
            area: 'COCINA',
            comensal: 1,
          },
        ],
        total: 50,
      });

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockPrisma.pedido.create).toHaveBeenCalled();
    });

    it('persiste y expone el mesero en pedido, items y eventos', async () => {
      mockPrisma.pedido.create.mockResolvedValue({
        ...basePedido,
        meseroId: 'u-mesero-1',
        meseroNombre: 'Ana Mesa',
        items: [
          {
            id: 'item-1',
            pedidoId: 'p-001',
            productoId: 'prod-1',
            nombre: 'Nachos',
            cantidad: 1,
            precioUnitario: 25,
            area: 'COCINA',
            notas: null,
            estado: PedidoEstado.Pendiente,
            comensal: 1,
            meseroId: 'u-mesero-1',
            meseroNombre: 'Ana Mesa',
          },
        ],
      } as any);

      await (service as any).persistirPedido({
        mesaId: 'mesa-1',
        numeroMesa: 1,
        items: [
          {
            productoId: 'prod-1',
            nombre: 'Nachos',
            cantidad: 1,
            precioUnitario: 25,
            stockActual: null,
            area: 'COCINA',
            comensal: 1,
          },
        ],
        total: 25,
        modalidad: 'MESA',
        mesero: { id: 'u-mesero-1', nombre: 'Ana Mesa' },
      });

      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          meseroId: 'u-mesero-1',
          meseroNombre: 'Ana Mesa',
          items: expect.objectContaining({
            create: [
              expect.objectContaining({
                meseroId: 'u-mesero-1',
                meseroNombre: 'Ana Mesa',
              }),
            ],
          }),
        }),
      }));

      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      const pedidoCreado = eventos.find((e: any) => e.routingKey === 'pedido.creado');
      const payload = JSON.parse(pedidoCreado.payload);
      expect(payload.pedido).toEqual(expect.objectContaining({
        meseroId: 'u-mesero-1',
        meseroNombre: 'Ana Mesa',
      }));
      expect(payload.pedido.items[0]).toEqual(expect.objectContaining({
        meseroId: 'u-mesero-1',
        meseroNombre: 'Ana Mesa',
      }));
    });

    it('un ítem DIRECTO (Inventario) nace ENTREGADO y un pedido solo-DIRECTO arranca ENTREGADO', async () => {
      mockPrisma.pedido.create.mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.Entregado,
        items: [{ id: 'item-1', pedidoId: 'p-001', productoId: 'prod-cerveza', nombre: 'Cristal', cantidad: 2, precioUnitario: 8, area: 'DIRECTO', notas: null, estado: 'ENTREGADO', comensal: 1 }],
      } as any);

      await (service as any).persistirPedido({
        mesaId: 'mesa-1',
        numeroMesa: 1,
        items: [
          { productoId: 'prod-cerveza', nombre: 'Cristal', cantidad: 2, precioUnitario: 8, stockActual: 0, area: 'DIRECTO', comensal: 1 },
        ],
        total: 16,
      });

      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          estado: PedidoEstado.Entregado,
          items: expect.objectContaining({
            create: [expect.objectContaining({ area: 'DIRECTO', estado: 'ENTREGADO' })],
          }),
        }),
      }));
    });

    it('un ítem BAR (Barra) SÍ pasa por producción: queda PENDIENTE, no se auto-entrega como uno DIRECTO', async () => {
      mockPrisma.pedido.create.mockResolvedValue({ ...basePedido, items: [] } as any);

      await (service as any).persistirPedido({
        mesaId: 'mesa-1',
        numeroMesa: 1,
        items: [
          { productoId: 'prod-mojito', nombre: 'Mojito', cantidad: 1, precioUnitario: 20, stockActual: null, area: 'BAR', comensal: 1 },
        ],
        total: 20,
      });

      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          estado: PedidoEstado.Pendiente,
          items: expect.objectContaining({
            create: [expect.objectContaining({ area: 'BAR', estado: 'PENDIENTE' })],
          }),
        }),
      }));
    });

    it('un pedido mixto (Cocina + Inventario) arranca PENDIENTE; solo el ítem de Cocina queda PENDIENTE', async () => {
      mockPrisma.pedido.create.mockResolvedValue({ ...basePedido, items: [] } as any);

      await (service as any).persistirPedido({
        mesaId: 'mesa-1',
        numeroMesa: 1,
        items: [
          { productoId: 'prod-ceviche', nombre: 'Ceviche', cantidad: 1, precioUnitario: 30, stockActual: null, area: 'COCINA', comensal: 1 },
          { productoId: 'prod-cerveza', nombre: 'Cristal', cantidad: 1, precioUnitario: 8, stockActual: 0, area: 'DIRECTO', comensal: 1 },
        ],
        total: 38,
      });

      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          estado: PedidoEstado.Pendiente,
          items: expect.objectContaining({
            create: [
              expect.objectContaining({ area: 'COCINA', estado: 'PENDIENTE' }),
              expect.objectContaining({ area: 'DIRECTO', estado: 'ENTREGADO' }),
            ],
          }),
        }),
      }));
    });
  });

  describe('validarYMapearItems', () => {
    it('deriva el área del ítem desde categoriaArea (nunca desde el nombre de categoría)', async () => {
      mockPrisma.productoLocal.findMany.mockResolvedValue([
        { id: 'prod-cerveza', nombre: 'Cristal', precio: 8, stockActual: 5, categoriaNombre: 'Cerveza', categoriaArea: 'INVENTARIO', disponible: true },
        { id: 'prod-mojito', nombre: 'Mojito', precio: 20, stockActual: null, categoriaNombre: 'Tragos', categoriaArea: 'BARRA', disponible: true },
        { id: 'prod-ceviche', nombre: 'Ceviche', precio: 30, stockActual: null, categoriaNombre: 'Ceviches', categoriaArea: 'COCINA', disponible: true },
      ] as any);

      const items = await (service as any).validarYMapearItems([
        { productoId: 'prod-cerveza', cantidad: 1 },
        { productoId: 'prod-mojito', cantidad: 1 },
        { productoId: 'prod-ceviche', cantidad: 1 },
      ]);

      expect(items).toEqual([
        expect.objectContaining({ productoId: 'prod-cerveza', area: 'DIRECTO' }),
        expect.objectContaining({ productoId: 'prod-mojito', area: 'BAR' }),
        expect.objectContaining({ productoId: 'prod-ceviche', area: 'COCINA' }),
      ]);
    });

    it('un categoriaArea desconocido/ausente (proyección legada) cae en COCINA por seguridad', async () => {
      mockPrisma.productoLocal.findMany.mockResolvedValue([
        { id: 'prod-legado', nombre: 'Plato viejo', precio: 15, stockActual: null, categoriaNombre: 'Legado', categoriaArea: null, disponible: true },
      ] as any);

      const items = await (service as any).validarYMapearItems([{ productoId: 'prod-legado', cantidad: 1 }]);

      expect(items[0].area).toBe('COCINA');
    });
  });

  describe('procesarProductoActualizado', () => {
    it('debe aplicar reposicion como delta una sola vez si hay redelivery secuencial', async () => {
      const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      mockPrisma.idempotencyKey.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(duplicate);
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 7,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      const payload = {
        eventId: 'evt-repo-1',
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 20,
        stockDelta: 5,
        stockSyncMode: 'REPOSICION',
        categoriaNombre: 'COCINA',
        disponible: true,
      } as any;

      await service.procesarProductoActualizado(payload);
      await service.procesarProductoActualizado(payload);

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 12 }),
      }));
    });

    it('no debe inflar si un consumo stale-alto viene mal etiquetado como reposicion sin delta positivo', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 7,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.procesarProductoActualizado({
        eventId: 'evt-bad-label',
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 20,
        stockDelta: -4,
        stockSyncMode: 'REPOSICION',
        categoriaNombre: 'COCINA',
        disponible: true,
      } as any);

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 7 }),
      }));
    });

    it('no debe modificar stock local ante eco de consumo desde inventario', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 4,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.procesarProductoActualizado({
        eventId: 'evt-consumo',
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 2,
        stockDelta: -1,
        stockSyncMode: 'CONSUMO_PEDIDO',
        categoriaNombre: 'COCINA',
        disponible: true,
      } as any);

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 4 }),
      }));
    });
  });

  describe('procesarProductoCreado', () => {
    it('no debe re-inflar stock local si producto.creado llega tarde sobre una proyeccion existente', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 3,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.procesarProductoCreado({
        eventId: 'evt-created-late',
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 20,
        categoriaNombre: 'COCINA',
        disponible: true,
      } as any);

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 3 }),
      }));
    });
  });

  // T-40: los specs de procesarStockInsuficiente viven ahora en
  // pedidos-saga.service.spec.ts, junto a la clase extraída.

  describe('delegation to saga', () => {
    it('actualizarEstado delegates to saga', async () => {
      service['saga'].actualizarEstado = jest.fn().mockResolvedValue({ message: 'ok', pedido: {} });
      await service.actualizarEstado('id-1', { estado: 'LISTO' } as any);
      expect(service['saga'].actualizarEstado).toHaveBeenCalledWith('id-1', { estado: 'LISTO' });
    });

    it('actualizarEstadoItem delegates to saga', async () => {
      service['saga'].actualizarEstadoItem = jest.fn().mockResolvedValue({ message: 'ok' });
      await service.actualizarEstadoItem('item-1', { estado: 'LISTO' } as any, 'u1', 'Ana');
      expect(service['saga'].actualizarEstadoItem).toHaveBeenCalledWith('item-1', { estado: 'LISTO' }, 'u1', 'Ana');
    });

    it('procesarStockInsuficiente delegates to saga', async () => {
      service['saga'].procesarStockInsuficiente = jest.fn().mockResolvedValue(undefined);
      await service.procesarStockInsuficiente({ pedidoId: 'p1' } as any);
      expect(service['saga'].procesarStockInsuficiente).toHaveBeenCalledWith({ pedidoId: 'p1' });
    });
  });

  describe('upsertMesaLocal', () => {
    it('upserts mesa correctly', async () => {
      await service.upsertMesaLocal({ id: 'm1', numero: 5, sedeId: 'sede-001' });
      expect(mockPrisma.mesaLocal.upsert).toHaveBeenCalledWith({
        where: { id: 'm1' },
        update: { numero: 5, sedeId: 'sede-001' },
        create: { id: 'm1', numero: 5, sedeId: 'sede-001' },
      });
    });
  });

  describe('persistirPedido - stock errors', () => {
    it('throws BadRequestException if stock is insufficient', async () => {
      mockPrisma.$queryRaw = jest.fn().mockResolvedValue([]);
      await expect((service as any).persistirPedido({
        mesaId: 'mesa-1',
        numeroMesa: 1,
        items: [
          { productoId: 'prod-1', nombre: 'Nachos', cantidad: 50, precioUnitario: 25, stockActual: 10, area: 'COCINA', comensal: 1 }
        ],
        total: 1250,
      })).rejects.toThrow('Stock insuficiente para Nachos.');
    });
  });

  describe('procesarEventoProducto - error handling', () => {
    it('throws error if error is not P2002', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Random DB Error'));
      await expect((service as any).procesarEventoProducto('key', { id: 'prod-1' }, async () => {})).rejects.toThrow('Random DB Error');
    });
  });

  describe('pedidos_rechazados_dependencia_total (R-08)', () => {
    function rechazosDependencia(dependency: string): number {
      const metric = register.getSingleMetric('pedidos_rechazados_dependencia_total') as any;
      const hashMap = metric?.hashMap ?? {};
      return Object.values(hashMap).find((v: any) => v.labels.dependency === dependency)?.value ?? 0;
    }

    it('incrementa cuando inventario está caído (503) durante la creación de pedido', async () => {
      mockPrisma.productoLocal.findMany.mockResolvedValue([]); // todos faltantes → llama a inventario
      // Inventario caído: axios rechaza → obtenerProductosLote lanza 503.
      jest.spyOn(axios, 'post').mockRejectedValue(
        Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }),
      );
      const antes = rechazosDependencia('inventario');

      await expect((service as any).asegurarProductosLocales(['prod-1'])).rejects.toBeDefined();
      expect(rechazosDependencia('inventario')).toBe(antes + 1);
    });
  });
});
