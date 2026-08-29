// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-assertion */

import { PedidosSagaService } from './pedidos-saga.service';
import { PedidoEstado } from '@org/contracts';

// T-40: specs de transiciones de estado y compensación de saga, movidos junto a
// la clase extraída de AppService (antes vivían en app.service.spec.ts).

function createMockPrismaService(overrides: Record<string, any> = {}) {
  const prisma: any = {
    $connect: async () => {},
    $disconnect: async () => {},
    $executeRaw: jest.fn().mockResolvedValue(1),
    pedido: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      // Usado por cuentaQuedoTotalmenteAnulada (cascada de auto-cancelación)
      // — [] por defecto significa "sin cuenta que cascadear" en los tests
      // que no ejercitan esa lógica explícitamente.
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    pedidoItem: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    anulacionAuditoria: {
      create: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    idempotencyKey: {
      create: jest.fn().mockResolvedValue({}),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    secuenciaAnulacion: {
      upsert: jest.fn().mockResolvedValue({ sedeId: 'sede-001', ultimo: 1 }),
    },
    ...overrides,
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  return prisma;
}

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

function createMockMesasHttp() {
  return { liberarMesa: jest.fn().mockResolvedValue(true) };
}

function createMockCuentasHttp() {
  return { cancelarCuenta: jest.fn().mockResolvedValue(true) };
}

describe('PedidosSagaService — Pedidos', () => {
  let service: PedidosSagaService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;
  let mockMesasHttp: ReturnType<typeof createMockMesasHttp>;
  let mockCuentasHttp: ReturnType<typeof createMockCuentasHttp>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrismaService();
    mockMesasHttp = createMockMesasHttp();
    mockCuentasHttp = createMockCuentasHttp();
    service = new PedidosSagaService(mockPrisma, mockMesasHttp as never, mockCuentasHttp as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('actualizarEstado — guard de transiciones', () => {
    it('permite el avance comercial LISTO → ENTREGADO', async () => {
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({ ...basePedido, estado: PedidoEstado.Listo } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'updateMany').mockResolvedValue({ count: 1 } as never);

      await service.actualizarEstado('p-001', { estado: PedidoEstado.Entregado });

      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'p-001', estado: PedidoEstado.Listo },
        data: { estado: PedidoEstado.Entregado },
      }));
    });

    it('rechaza una transición inválida (PAGADO → EN_PREPARACION)', async () => {
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({ ...basePedido, estado: PedidoEstado.Pagado } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'updateMany');

      await expect(
        service.actualizarEstado('p-001', { estado: PedidoEstado.EnPreparacion }),
      ).rejects.toThrow(/inválida/i);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('actualizarEstadoItem — cocina manda (derivación)', () => {
    const itemBase = { id: 'i-1', pedidoId: 'p-001', nombre: 'Plato', cantidad: 1, precioUnitario: 10, area: 'COCINA', notas: null };

    it('sube el pedido a EN_PREPARACION cuando arranca el primer ítem', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.Pendiente,
        items: [
          { ...itemBase, id: 'i-1', estado: PedidoEstado.EnPreparacion },
          { ...itemBase, id: 'i-2', estado: PedidoEstado.Pendiente },
        ],
      } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({
        ...basePedido, estado: PedidoEstado.EnPreparacion, items: [],
      } as never);

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.EnPreparacion });

      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        data: { estado: PedidoEstado.EnPreparacion },
      }));
    });

    it('marca el pedido LISTO y emite pedido.listo cuando todos los ítems están listos', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-2', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.EnPreparacion,
        items: [
          { ...itemBase, id: 'i-1', estado: PedidoEstado.Listo },
          { ...itemBase, id: 'i-2', estado: PedidoEstado.Listo },
        ],
      } as never);
      jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({
        ...basePedido, estado: PedidoEstado.Listo, items: [],
      } as never);

      await service.actualizarEstadoItem('i-2', { estado: PedidoEstado.Listo });

      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      expect(eventos.some((e: any) => e.routingKey === 'pedido.listo')).toBe(true);
    });

    it('no pisa un estado comercial (ENTREGADO) al tocar un ítem', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.Entregado,
        items: [{ ...itemBase, id: 'i-1', estado: PedidoEstado.Listo }],
      } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'update');

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Listo });

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['COCINA', true],
      ['BAR', true],
      ['DIRECTO', false],
    ])('anular un ítem de área %s ¿avisa al KDS? → %s', async (area, avisa) => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001', area, nombre: 'X' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.Pendiente,
        items: [{ ...itemBase, id: 'i-1', area, estado: PedidoEstado.Cancelado }],
      } as never);
      jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({ ...basePedido, items: [] } as never);

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Cancelado });

      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      expect(eventos.some((e: any) => e.routingKey === 'pedido.item_anulado')).toBe(avisa);
    });

    it('CU-05 Caso A: anular un ítem PENDIENTE crea el registro de auditoría con el motivo capturado', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({
        id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Ceviche', cantidad: 2, precioUnitario: 30, area: 'COCINA',
      } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.Pendiente,
        items: [{ ...itemBase, id: 'i-1', productoId: 'prod-1', nombre: 'Ceviche', cantidad: 2, precioUnitario: 30, estado: PedidoEstado.Cancelado }],
      } as never);
      jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({ ...basePedido, items: [] } as never);

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Cancelado, motivo: 'Cliente se equivocó al pedir' }, 'u-1', 'Ana');

      expect(mockPrisma.anulacionAuditoria.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'ITEM',
          estadoPlato: 'SIN_PREPARAR',
          cobrado: false,
          montoAnulado: 60,
          motivo: 'Cliente se equivocó al pedir',
          productoId: 'prod-1',
          productoNombre: 'Ceviche',
          usuarioId: 'u-1',
          usuarioNombre: 'Ana',
        }),
      }));
    });

    it('CU-05 Caso A: sin motivo, usa un texto por defecto en vez de dejarlo vacío', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({
        id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Ceviche', cantidad: 1, precioUnitario: 30, area: 'COCINA',
      } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.Pendiente,
        items: [{ ...itemBase, id: 'i-1', estado: PedidoEstado.Cancelado }],
      } as never);
      jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({ ...basePedido, items: [] } as never);

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Cancelado });

      expect(mockPrisma.anulacionAuditoria.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ motivo: 'Sin motivo especificado' }),
      }));
    });

    it('bug: cancelar el ÚLTIMO ítem activo mueve el pedido a CANCELADO en vez de dejarlo congelado', async () => {
      // Antes, derivarEstadoPedido devolvía null cuando todos los ítems
      // terminaban CANCELADO/RECHAZADO_SIN_STOCK, y null se interpretaba como
      // "no tocar" — el pedido se quedaba para siempre en su último estado de
      // producción (p. ej. EN_PREPARACION) pese a no tener nada que preparar
      // ni cobrar. Reportado: el pedido anulado seguía en la columna "En
      // preparación" del tablero de Pedidos aunque Cocina ya no lo mostraba.
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.EnPreparacion,
        items: [{ ...itemBase, id: 'i-1', estado: PedidoEstado.Cancelado }],
      } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({
        ...basePedido, estado: PedidoEstado.Cancelado, items: [],
      } as never);

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Cancelado, motivo: 'Cliente se retiró' });

      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ estado: PedidoEstado.Cancelado }),
      }));
    });
  });

  // Pedido del dueño (interjección mid-sesión): "cuando ya se han anulado
  // todos los items de la cuenta actual, atencion de mesa se anule
  // inmediatamente, cuando todos sus item son anulados uno por uno" — a
  // diferencia del botón manual "Anular atención de mesa", esto dispara
  // solo desde cancelar ítems uno por uno (o un pedido puntual), sin que
  // el usuario tenga que presionar nada.
  describe('cascada automática: cancelar el último ítem de la cuenta la cancela sola', () => {
    const itemBase = { id: 'i-1', pedidoId: 'p-001', nombre: 'Plato', cantidad: 1, precioUnitario: 10, area: 'COCINA', notas: null };

    it('actualizarEstadoItem: al cancelar el último ítem de la única cuenta, libera la mesa y cancela la cuenta', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido, cuentaId: 'c-1', estado: PedidoEstado.Pendiente,
        items: [{ ...itemBase, estado: PedidoEstado.Cancelado }],
      } as never);
      jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({
        ...basePedido, cuentaId: 'c-1', estado: PedidoEstado.Cancelado, items: [],
      } as never);
      mockPrisma.pedido.findMany.mockResolvedValue([
        { mesaId: 'm-001', items: [{ estado: PedidoEstado.Cancelado }] },
      ]);

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Cancelado, motivo: 'Último ítem' });

      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { cuentaId: 'c-1' } }),
      );
      expect(mockMesasHttp.liberarMesa).toHaveBeenCalledWith('m-001', 'LIBRE');
      expect(mockCuentasHttp.cancelarCuenta).toHaveBeenCalledWith('c-1');
    });

    it('actualizarEstadoItem: si queda un ítem vivo en OTRO pedido de la misma cuenta, no cascadea', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido, cuentaId: 'c-1', estado: PedidoEstado.Pendiente,
        items: [{ ...itemBase, estado: PedidoEstado.Cancelado }],
      } as never);
      jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({
        ...basePedido, cuentaId: 'c-1', estado: PedidoEstado.Cancelado, items: [],
      } as never);
      // Otro pedido de la misma cuenta todavía tiene un ítem PENDIENTE.
      mockPrisma.pedido.findMany.mockResolvedValue([
        { mesaId: 'm-001', items: [{ estado: PedidoEstado.Cancelado }] },
        { mesaId: 'm-001', items: [{ estado: PedidoEstado.Pendiente }] },
      ]);

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Cancelado });

      expect(mockMesasHttp.liberarMesa).not.toHaveBeenCalled();
      expect(mockCuentasHttp.cancelarCuenta).not.toHaveBeenCalled();
    });

    it('actualizarEstadoItem: sin cuentaId (pedido de antes del backfill), no intenta cascadear ni revienta', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido, cuentaId: null, estado: PedidoEstado.Pendiente,
        items: [{ ...itemBase, estado: PedidoEstado.Cancelado }],
      } as never);
      jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({
        ...basePedido, cuentaId: null, estado: PedidoEstado.Cancelado, items: [],
      } as never);

      await expect(
        service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Cancelado }),
      ).resolves.toBeDefined();

      expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled();
      expect(mockMesasHttp.liberarMesa).not.toHaveBeenCalled();
      expect(mockCuentasHttp.cancelarCuenta).not.toHaveBeenCalled();
    });

    it('anularItemPreparado (NO COBRAR): al cancelar el último ítem, libera la mesa y cancela la cuenta', async () => {
      const item = {
        id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Lomo', cantidad: 1, precioUnitario: 15,
        area: 'COCINA', estado: PedidoEstado.Listo,
        pedido: { id: 'p-001', sedeId: 'sede-001', mesaId: 'm-001', numeroMesa: 5, cliente: null },
      };
      mockPrisma.pedidoItem.findUnique.mockResolvedValue(item as never);
      mockPrisma.pedidoItem.update.mockResolvedValue({ ...item, estado: PedidoEstado.Cancelado } as never);
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue({
        id: 'p-001', mesaId: 'm-001', numeroMesa: 5, sedeId: 'sede-001', cliente: null, cuentaId: 'c-1',
        estado: PedidoEstado.Listo, total: 15, createdAt: new Date(),
        items: [{ ...item, estado: PedidoEstado.Listo }],
      } as never);
      mockPrisma.pedido.update.mockResolvedValue({
        id: 'p-001', mesaId: 'm-001', numeroMesa: 5, sedeId: 'sede-001', cliente: null, cuentaId: 'c-1',
        estado: PedidoEstado.Cancelado, total: 0, createdAt: new Date(),
        items: [{ ...item, estado: PedidoEstado.Cancelado }],
      } as never);
      mockPrisma.pedido.findMany.mockResolvedValue([
        { mesaId: 'm-001', items: [{ estado: PedidoEstado.Cancelado }] },
      ]);
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-x' } as never);

      await service.anularItemPreparado('i-1', { cobrar: false, motivo: 'Se le cayó al mesero' }, null, 'sede-001');

      expect(mockMesasHttp.liberarMesa).toHaveBeenCalledWith('m-001', 'LIBRE');
      expect(mockCuentasHttp.cancelarCuenta).toHaveBeenCalledWith('c-1');
    });

    it('anularItemPreparado (SÍ COBRAR): nunca cascadea, aunque quede como el único ítem de la cuenta', async () => {
      const item = {
        id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Lomo', cantidad: 1, precioUnitario: 15,
        area: 'COCINA', estado: PedidoEstado.Listo,
        pedido: { id: 'p-001', sedeId: 'sede-001', mesaId: 'm-001', numeroMesa: 5, cliente: null },
      };
      mockPrisma.pedidoItem.findUnique.mockResolvedValue(item as never);
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue({
        id: 'p-001', mesaId: 'm-001', numeroMesa: 5, sedeId: 'sede-001', cliente: null, cuentaId: 'c-1',
        estado: PedidoEstado.Listo, total: 15, createdAt: new Date(), items: [item],
      } as never);
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-x' } as never);

      await service.anularItemPreparado('i-1', { cobrar: true, motivo: 'Cliente lo comió igual' }, null, 'sede-001');

      expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled();
      expect(mockMesasHttp.liberarMesa).not.toHaveBeenCalled();
      expect(mockCuentasHttp.cancelarCuenta).not.toHaveBeenCalled();
    });

    it('anularAtencionMesa: además de liberar la mesa, cancela la cuenta cuando no queda nada pendiente de cobro', async () => {
      const SEDE = 'sede-001';
      const MESA = 'm-001';
      const itemPendiente = { id: 'i-1', pedidoId: 'p-1', productoId: 'prod-a', nombre: 'Sopa', cantidad: 1, precioUnitario: 10, area: 'COCINA', estado: PedidoEstado.Pendiente, notas: null };
      const pedidoConCuenta = {
        id: 'p-1', mesaId: MESA, sedeId: SEDE, cuentaId: 'c-1', numeroMesa: 3, cliente: null,
        estado: PedidoEstado.Pendiente, total: 10, createdAt: new Date(), items: [itemPendiente],
      };
      mockPrisma.pedido.findMany.mockResolvedValue([pedidoConCuenta]);
      mockPrisma.pedidoItem.update.mockResolvedValue({ ...itemPendiente, estado: PedidoEstado.Cancelado });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedidoConCuenta, estado: PedidoEstado.Cancelado, items: [] });
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-x' } as never);

      const { resultado } = await service.anularAtencionMesa(MESA, { motivo: 'Cliente se retiró' }, SEDE);

      expect(resultado.mesaLiberada).toBe(true);
      expect(mockMesasHttp.liberarMesa).toHaveBeenCalledWith(MESA, 'LIBRE');
      expect(mockCuentasHttp.cancelarCuenta).toHaveBeenCalledWith('c-1');
    });

    it('anularAtencionMesa: si sobrevive algo cobrable, no cancela la cuenta (queda para que caja cierre)', async () => {
      const SEDE = 'sede-001';
      const MESA = 'm-001';
      // Mezcla: un ítem cancelable (para no chocar con el guard de "nada
      // que anular") + uno DIRECTO confirmado como consumido, que se
      // mantiene cobrable — mismo patrón que el test "branchea por ítem".
      const itemPendiente = { id: 'i-1', pedidoId: 'p-1', productoId: 'prod-a', nombre: 'Sopa', cantidad: 1, precioUnitario: 10, area: 'COCINA', estado: PedidoEstado.Pendiente, notas: null };
      const itemDirectoConfirmado = { id: 'i-3', pedidoId: 'p-1', productoId: 'prod-c', nombre: 'Cerveza', cantidad: 1, precioUnitario: 8, area: 'DIRECTO', estado: PedidoEstado.Entregado, notas: null };
      const pedidoConCuenta = {
        id: 'p-1', mesaId: MESA, sedeId: SEDE, cuentaId: 'c-1', numeroMesa: 3, cliente: null,
        estado: PedidoEstado.Pendiente, total: 18, createdAt: new Date(), items: [itemPendiente, itemDirectoConfirmado],
      };
      mockPrisma.pedido.findMany.mockResolvedValue([pedidoConCuenta]);
      mockPrisma.pedidoItem.update.mockResolvedValue({ ...itemPendiente, estado: PedidoEstado.Cancelado });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedidoConCuenta, items: [] });
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-x' } as never);

      const { resultado } = await service.anularAtencionMesa(MESA, { motivo: 'x', itemsConsumidos: ['i-3'] }, SEDE);

      expect(resultado.mesaLiberada).toBe(false);
      expect(mockMesasHttp.liberarMesa).not.toHaveBeenCalled();
      expect(mockCuentasHttp.cancelarCuenta).not.toHaveBeenCalled();
    });

    it('anularPedido: si al cancelar este pedido la cuenta queda totalmente anulada (otros pedidos ya lo estaban), cascadea', async () => {
      const SEDE = 'sede-001';
      const MESA = 'm-001';
      const itemPendiente = { id: 'i-1', pedidoId: 'p-1', productoId: 'prod-a', nombre: 'Sopa', cantidad: 1, precioUnitario: 10, area: 'COCINA', estado: PedidoEstado.Pendiente, notas: null };
      const pedidoConCuenta = {
        id: 'p-1', mesaId: MESA, sedeId: SEDE, cuentaId: 'c-1', numeroMesa: 1, cliente: null,
        estado: PedidoEstado.Pendiente, total: 10, createdAt: new Date(), items: [itemPendiente],
      };
      mockPrisma.pedido.findUnique.mockResolvedValue(pedidoConCuenta);
      mockPrisma.pedidoItem.update.mockResolvedValue({ ...itemPendiente, estado: PedidoEstado.Cancelado });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedidoConCuenta, estado: PedidoEstado.Cancelado, items: [] });
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue({ ...pedidoConCuenta, estado: PedidoEstado.Cancelado, items: [] });
      // Otro pedido "p-2" de la misma cuenta ya estaba cancelado de antes.
      mockPrisma.pedido.findMany.mockResolvedValue([
        { mesaId: MESA, items: [{ estado: PedidoEstado.Cancelado }] },
        { mesaId: MESA, items: [{ estado: PedidoEstado.Cancelado }] },
      ]);

      await service.anularPedido('p-1', { motivo: 'Cliente se arrepintió' }, SEDE);

      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { cuentaId: 'c-1' } }),
      );
      expect(mockMesasHttp.liberarMesa).toHaveBeenCalledWith(MESA, 'LIBRE');
      expect(mockCuentasHttp.cancelarCuenta).toHaveBeenCalledWith('c-1');
    });

    it('anularPedido: si el pedido cancelado mantiene algo cobrable (itemsConsumidos), no cascadea', async () => {
      const SEDE = 'sede-001';
      const MESA = 'm-001';
      const itemDirectoMantenido = { id: 'i-3', pedidoId: 'p-1', productoId: 'prod-c', nombre: 'Cerveza', cantidad: 1, precioUnitario: 8, area: 'DIRECTO', estado: PedidoEstado.Entregado, notas: null };
      const itemPendiente = { id: 'i-1', pedidoId: 'p-1', productoId: 'prod-a', nombre: 'Sopa', cantidad: 1, precioUnitario: 10, area: 'COCINA', estado: PedidoEstado.Pendiente, notas: null };
      const pedidoConCuenta = {
        id: 'p-1', mesaId: MESA, sedeId: SEDE, cuentaId: 'c-1', numeroMesa: 1, cliente: null,
        estado: PedidoEstado.Pendiente, total: 18, createdAt: new Date(), items: [itemPendiente, itemDirectoMantenido],
      };
      mockPrisma.pedido.findUnique.mockResolvedValue(pedidoConCuenta);
      mockPrisma.pedidoItem.update.mockResolvedValue({ ...itemPendiente, estado: PedidoEstado.Cancelado });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedidoConCuenta, items: [] });
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue({ ...pedidoConCuenta, items: [] });

      await service.anularPedido('p-1', { motivo: 'x', itemsConsumidos: ['i-3'] }, SEDE);

      expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled();
      expect(mockMesasHttp.liberarMesa).not.toHaveBeenCalled();
      expect(mockCuentasHttp.cancelarCuenta).not.toHaveBeenCalled();
    });
  });

  describe('procesarStockInsuficiente — compensación de saga', () => {
    const itemRechazado = (over: Record<string, any> = {}) => ({
      id: 'it-1', productoId: 'prod-a', nombre: 'A', cantidad: 1, precioUnitario: 10,
      area: 'COCINA', notas: null, estado: 'RECHAZADO_SIN_STOCK', ...over,
    });

    it('recalcula total y emite PedidoActualizado con total corregido si quedan ítems vivos', async () => {
      const pedidoActualizado = {
        id: 'ped-1', mesaId: 'm-1', numeroMesa: 3, estado: PedidoEstado.Pendiente,
        total: 20, createdAt: new Date(), updatedAt: new Date(),
        items: [
          itemRechazado(),
          itemRechazado({ id: 'it-2', productoId: 'prod-b', nombre: 'B', estado: 'PENDIENTE', precioUnitario: 20 }),
        ],
      };
      const prisma = createMockPrismaService({
        pedidoItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        pedido: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ped-1', mesaId: 'm-1', numeroMesa: 3, estado: PedidoEstado.Pendiente,
            total: 30, createdAt: new Date(), updatedAt: new Date(),
            items: [
              itemRechazado(),
              itemRechazado({ id: 'it-2', productoId: 'prod-b', nombre: 'B', estado: 'PENDIENTE', precioUnitario: 20 }),
            ],
          }),
          update: jest.fn().mockResolvedValue(pedidoActualizado),
        },
        outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        idempotencyKey: { create: jest.fn().mockResolvedValue({}) },
      });
      const svc = new PedidosSagaService(prisma as never);

      await svc.procesarStockInsuficiente({ pedidoId: 'ped-1', productoId: 'prod-a', solicitado: 5, disponible: 1 });

      expect(prisma.pedidoItem.updateMany).toHaveBeenCalledWith({
        where: { pedidoId: 'ped-1', productoId: 'prod-a', estado: { not: 'RECHAZADO_SIN_STOCK' } },
        data: { estado: 'RECHAZADO_SIN_STOCK' },
      });
      expect(prisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'ped-1' },
        data: { total: 20 },
      }));
      expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.outboxEvent.create.mock.calls[0][0].data.routingKey).toBe('pedido.actualizado');
      const payload = JSON.parse(prisma.outboxEvent.create.mock.calls[0][0].data.payload);
      expect(payload.pedido.total).toBe(20);
    });

    it('pasa el pedido entero a RECHAZADO_SIN_STOCK cuando todos los ítems quedan rechazados', async () => {
      const items = [itemRechazado()];
      const prisma = createMockPrismaService({
        pedidoItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        pedido: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ped-2', mesaId: 'm-1', numeroMesa: 3, estado: PedidoEstado.Pendiente,
            total: 10, createdAt: new Date(), items,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'ped-2', mesaId: 'm-1', numeroMesa: 3, estado: PedidoEstado.RechazadoSinStock,
            total: 0, createdAt: new Date(), updatedAt: new Date(), items,
          }),
        },
        outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        idempotencyKey: { create: jest.fn().mockResolvedValue({}) },
      });
      const svc = new PedidosSagaService(prisma as never);

      await svc.procesarStockInsuficiente({ pedidoId: 'ped-2', productoId: 'prod-a', solicitado: 5, disponible: 0 });

      expect(prisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'ped-2' },
        data: { estado: PedidoEstado.RechazadoSinStock, total: 0 },
      }));
      const payload = JSON.parse(prisma.outboxEvent.create.mock.calls[0][0].data.payload);
      expect(payload.pedido.total).toBe(0);
    });

    it('es idempotente: una clave duplicada (P2002) no propaga ni re-marca', async () => {
      const prisma = createMockPrismaService({
        idempotencyKey: { create: jest.fn().mockRejectedValue({ code: 'P2002' }) },
        pedidoItem: { updateMany: jest.fn() },
        pedido: { findUnique: jest.fn(), update: jest.fn() },
        outboxEvent: { create: jest.fn() },
      });
      const svc = new PedidosSagaService(prisma as never);

      await expect(
        svc.procesarStockInsuficiente({ pedidoId: 'ped-3', productoId: 'prod-a', solicitado: 1, disponible: 0 }),
      ).resolves.toBeUndefined();
      expect(prisma.pedidoItem.updateMany).not.toHaveBeenCalled();
      expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('hace early return y loguea si el pedido no se encuentra', async () => {
      const prisma = createMockPrismaService({
        pedidoItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        pedido: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      });
      const svc = new PedidosSagaService(prisma as never);
      
      await expect(
        svc.procesarStockInsuficiente({ pedidoId: 'ped-not-found', productoId: 'prod-a', solicitado: 1, disponible: 0 })
      ).resolves.toBeUndefined();
      expect(prisma.pedido.update).not.toHaveBeenCalled();
    });

    it('re-lanza cualquier error que no sea P2002', async () => {
      const errorMock = new Error('Database crash');
      (errorMock as any).code = 'P5000';
      const prisma = createMockPrismaService({
        idempotencyKey: { create: jest.fn().mockRejectedValue(errorMock) }
      });
      const svc = new PedidosSagaService(prisma as never);

      await expect(
        svc.procesarStockInsuficiente({ pedidoId: 'ped-crash', productoId: 'prod-a', solicitado: 1, disponible: 0 })
      ).rejects.toThrow('Database crash');
    });
  });

  describe('procesarCuentaAsociada — backfill del cuentaId y correlativo de la atención', () => {
    it('guarda cuentaId y el correlativo en el pedido', async () => {
      const prisma = createMockPrismaService({
        pedido: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      });
      const svc = new PedidosSagaService(prisma as never);

      await svc.procesarCuentaAsociada({ pedidoId: 'p-1', cuentaId: 'c-1', sedeId: 'sede-001', correlativo: 'A0000042' });

      expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { cuentaId: 'c-1', cuentaCorrelativo: 'A0000042' },
      });
    });

    it('guarda cuentaId aunque el correlativo todavía no venga (cuenta sin backfill retroactivo)', async () => {
      const prisma = createMockPrismaService({
        pedido: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      });
      const svc = new PedidosSagaService(prisma as never);

      await svc.procesarCuentaAsociada({ pedidoId: 'p-1', cuentaId: 'c-1', sedeId: 'sede-001' });

      expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { cuentaId: 'c-1' },
      });
    });

    it('no hace nada si el payload no trae pedidoId o cuentaId', async () => {
      const prisma = createMockPrismaService({
        pedido: { updateMany: jest.fn() },
      });
      const svc = new PedidosSagaService(prisma as never);

      await svc.procesarCuentaAsociada({ pedidoId: '', cuentaId: 'c-1', sedeId: 'sede-001', correlativo: 'A0000042' });
      await svc.procesarCuentaAsociada({ pedidoId: 'p-1', cuentaId: '', sedeId: 'sede-001', correlativo: 'A0000042' });

      expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('anularItemPreparado — CU-01 (Caso B: ya preparado/servido)', () => {
    const SEDE = 'sede-001';
    const itemPreparado = {
      id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Lomo Saltado',
      cantidad: 2, precioUnitario: 15, area: 'COCINA', estado: PedidoEstado.Listo,
      pedido: { id: 'p-001', sedeId: SEDE, mesaId: 'm-001', numeroMesa: 5, cliente: null },
    };
    const pedidoConItem = {
      id: 'p-001', mesaId: 'm-001', numeroMesa: 5, sedeId: SEDE, cliente: null,
      estado: PedidoEstado.Listo, total: 30, createdAt: new Date(),
      items: [{ id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Lomo Saltado', cantidad: 2, precioUnitario: 15, area: 'COCINA', estado: PedidoEstado.Listo, notas: null }],
    };

    it('rechaza si el ítem no existe', async () => {
      mockPrisma.pedidoItem.findUnique.mockResolvedValue(null);
      await expect(
        service.anularItemPreparado('no-existe', { motivo: 'x', cobrar: true }, SEDE),
      ).rejects.toThrow('no encontrado');
    });

    it('rechaza si el ítem pertenece a otra sede', async () => {
      mockPrisma.pedidoItem.findUnique.mockResolvedValue({ ...itemPreparado, pedido: { ...itemPreparado.pedido, sedeId: 'otra-sede' } });
      await expect(
        service.anularItemPreparado('i-1', { motivo: 'x', cobrar: true }, SEDE),
      ).rejects.toThrow('no encontrado');
    });

    it('rechaza si el ítem sigue PENDIENTE (debe usarse el endpoint genérico)', async () => {
      mockPrisma.pedidoItem.findUnique.mockResolvedValue({ ...itemPreparado, estado: PedidoEstado.Pendiente });
      await expect(
        service.anularItemPreparado('i-1', { motivo: 'x', cobrar: true }, SEDE),
      ).rejects.toThrow('aún no se preparó');
    });

    it.each([PedidoEstado.Cancelado, 'RECHAZADO_SIN_STOCK'])('rechaza si el ítem ya está %s', async (estado) => {
      mockPrisma.pedidoItem.findUnique.mockResolvedValue({ ...itemPreparado, estado });
      await expect(
        service.anularItemPreparado('i-1', { motivo: 'x', cobrar: true }, SEDE),
      ).rejects.toThrow('no se puede anular de nuevo');
    });

    it('SÍ COBRAR: mantiene el ítem en la cuenta, registra auditoría cobrado=true y no avisa PedidoActualizado', async () => {
      mockPrisma.pedidoItem.findUnique.mockResolvedValue(itemPreparado);
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue(pedidoConItem);
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-1' });

      const result = await service.anularItemPreparado('i-1', { motivo: 'Se cayó al llevarlo pero se cobra', cobrar: true }, SEDE);

      expect(mockPrisma.pedidoItem.update).not.toHaveBeenCalled();
      expect(mockPrisma.pedido.update).not.toHaveBeenCalled();
      expect(mockPrisma.anulacionAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cobrado: true, montoAnulado: 30, tipo: 'ITEM', estadoPlato: 'PREPARADO' }) }),
      );
      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      expect(eventos).toHaveLength(1);
      expect(eventos[0].routingKey).toBe('pedido.item_anulado_con_merma');
      expect(JSON.parse(eventos[0].payload).cobrado).toBe(true);
      expect(result.message).toContain('se mantiene en la cuenta');
    });

    it('NO COBRAR: cancela el ítem, recalcula el total y avisa PedidoActualizado además de la merma', async () => {
      mockPrisma.pedidoItem.findUnique.mockResolvedValue(itemPreparado);
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue(pedidoConItem);
      mockPrisma.pedidoItem.update.mockResolvedValue({ ...pedidoConItem.items[0], estado: PedidoEstado.Cancelado });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedidoConItem, total: 0, items: [{ ...pedidoConItem.items[0], estado: PedidoEstado.Cancelado }] });
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-2' });

      const result = await service.anularItemPreparado('i-1', { motivo: 'Cliente rechazó el plato', cobrar: false }, SEDE);

      expect(mockPrisma.pedidoItem.update).toHaveBeenCalledWith({ where: { id: 'i-1' }, data: { estado: PedidoEstado.Cancelado } });
      // Único ítem del pedido → al cancelarlo, el pedido en sí debe pasar a
      // CANCELADO (antes se quedaba congelado en su último estado de
      // producción para siempre; ver fix de derivarEstadoPedido/todosCerrados).
      expect(mockPrisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p-001' }, data: { total: 0, estado: PedidoEstado.Cancelado } }));
      expect(mockPrisma.anulacionAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cobrado: false }) }),
      );
      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      expect(eventos.map((e: any) => e.routingKey)).toEqual(
        expect.arrayContaining(['pedido.item_anulado_con_merma', 'pedido.actualizado']),
      );
      expect(result.message).toContain('retirado de la cuenta');
    });

    it('nunca avisa a cocina/KDS (pedido.item_anulado) — el plato ya salió', async () => {
      mockPrisma.pedidoItem.findUnique.mockResolvedValue(itemPreparado);
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue(pedidoConItem);
      mockPrisma.pedidoItem.update.mockResolvedValue({ ...pedidoConItem.items[0], estado: PedidoEstado.Cancelado });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedidoConItem, total: 0, items: [] });
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-3' });

      await service.anularItemPreparado('i-1', { motivo: 'x', cobrar: false }, SEDE);

      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      expect(eventos.some((e: any) => e.routingKey === 'pedido.item_anulado')).toBe(false);
    });
  });

  describe('anularAtencionMesa — CU-02 (desistimiento/abandono)', () => {
    const SEDE = 'sede-001';
    const MESA = 'm-001';

    const itemCocinaPendiente = { id: 'i-1', pedidoId: 'p-1', productoId: 'prod-a', nombre: 'Sopa', cantidad: 1, precioUnitario: 10, area: 'COCINA', estado: PedidoEstado.Pendiente, notas: null };
    const itemCocinaEntregado = { id: 'i-2', pedidoId: 'p-1', productoId: 'prod-b', nombre: 'Lomo', cantidad: 1, precioUnitario: 20, area: 'COCINA', estado: PedidoEstado.Entregado, notas: null };
    const itemDirectoConfirmado = { id: 'i-3', pedidoId: 'p-1', productoId: 'prod-c', nombre: 'Cerveza', cantidad: 2, precioUnitario: 8, area: 'DIRECTO', estado: PedidoEstado.Entregado, notas: null };
    const itemDirectoNoConfirmado = { id: 'i-4', pedidoId: 'p-1', productoId: 'prod-d', nombre: 'Gaseosa', cantidad: 1, precioUnitario: 5, area: 'DIRECTO', estado: PedidoEstado.Entregado, notas: null };

    const pedidoBase = (items: any[]) => ({
      id: 'p-1', mesaId: MESA, sedeId: SEDE, numeroMesa: 3, cliente: null,
      estado: PedidoEstado.Pendiente, total: 43, createdAt: new Date(), items,
    });

    function stubUpdates(items: Record<string, any>) {
      mockPrisma.pedidoItem.update.mockImplementation((args: any) =>
        Promise.resolve({ ...items[args.where.id], estado: args.data.estado }),
      );
      mockPrisma.pedido.update.mockImplementation((args: any) =>
        Promise.resolve({ ...pedidoBase(Object.values(items)), ...args.data }),
      );
    }

    it('rechaza si no hay atención activa para la mesa', async () => {
      mockPrisma.pedido.findMany.mockResolvedValue([]);
      await expect(
        service.anularAtencionMesa(MESA, { motivo: 'Cliente se retiró' }, SEDE),
      ).rejects.toThrow('No hay atención activa');
    });

    it('rechaza si no queda nada que anular (todo ya cancelado o confirmado como consumido)', async () => {
      mockPrisma.pedido.findMany.mockResolvedValue([pedidoBase([itemDirectoConfirmado])]);
      await expect(
        service.anularAtencionMesa(MESA, { motivo: 'x', itemsConsumidos: ['i-3'] }, SEDE),
      ).rejects.toThrow('No hay ningún ítem');
    });

    it('si el único pedido de la mesa ya tenía TODOS sus ítems anulados de antes (uno por uno), autocorrige y libera la mesa en vez de rechazar', async () => {
      // Bug reportado en vivo: el mesero anula cada ítem individualmente
      // hasta que no queda ninguno activo, pero el pedido (y por lo tanto
      // la mesa) se queda congelado — "Anular atención de mesa" rechazaba
      // con "No hay ningún ítem" y la mesa nunca se liberaba.
      const itemYaCancelado = { ...itemCocinaPendiente, estado: PedidoEstado.Cancelado };
      mockPrisma.pedido.findMany.mockResolvedValue([pedidoBase([itemYaCancelado])]);
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-mesa-forzado' });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedidoBase([]), estado: PedidoEstado.Cancelado, items: [] });

      const { resultado, message } = await service.anularAtencionMesa(
        MESA, { motivo: 'cliente se retiro sin pagar' }, SEDE,
      );

      expect(resultado.mesaLiberada).toBe(true);
      expect(mockMesasHttp.liberarMesa).toHaveBeenCalledWith(MESA, 'LIBRE');
      expect(message).toContain('mesa liberada');
      expect(mockPrisma.pedido.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: PedidoEstado.Cancelado }) }),
      );
      expect(mockPrisma.anulacionAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tipo: 'MESA', motivo: 'cliente se retiro sin pagar' }) }),
      );
    });

    it('branchea por ítem: cancela lo no servido, hace merma de lo servido, mantiene lo confirmado y restaura stock de lo no confirmado', async () => {
      const items = { 'i-1': itemCocinaPendiente, 'i-2': itemCocinaEntregado, 'i-3': itemDirectoConfirmado, 'i-4': itemDirectoNoConfirmado };
      mockPrisma.pedido.findMany.mockResolvedValue([pedidoBase(Object.values(items))]);
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-mesa-1' });
      stubUpdates(items);

      const { resultado, message } = await service.anularAtencionMesa(
        MESA, { motivo: 'Cliente se retiró', itemsConsumidos: ['i-3'] }, SEDE,
      );

      expect(resultado).toEqual({ itemsCancelados: 2, itemsConMerma: 1, itemsMantenidosParaCobro: 1, mesaLiberada: false });
      expect(mockMesasHttp.liberarMesa).not.toHaveBeenCalled();
      expect(message).toContain('pendientes de cobro');

      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      const routingKeys = eventos.map((e: any) => e.routingKey);
      expect(routingKeys).toEqual(expect.arrayContaining([
        'pedido.item_anulado', // i-1: aún no salía de cocina
        'pedido.item_anulado_con_merma', // i-2: ya se sirvió
        'stock.restaurado', // i-4: nunca se abrió
      ]));

      const mermaEvento = eventos.find((e: any) => e.routingKey === 'pedido.item_anulado_con_merma');
      expect(JSON.parse(mermaEvento.payload).cobrado).toBe(false);

      expect(mockPrisma.anulacionAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tipo: 'MESA', mesaId: MESA, montoAnulado: 20 }) }),
      );

      // Bug: con un ítem "mantenido para cobro" (i-3, ya ENTREGADO) el pedido
      // no queda 100% cancelado (todosCerrados=false) — antes, el spread
      // condicional simplemente omitía `estado` en ese caso y el pedido se
      // quedaba congelado en PENDIENTE para siempre, pese a no tener nada
      // más que preparar. Ahora se deriva "cocina manda" desde lo que
      // sobrevive (aquí, solo i-3 ENTREGADO) → LISTO.
      expect(mockPrisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ estado: PedidoEstado.Listo }),
      }));
    });

    it('libera la mesa automáticamente cuando no queda nada pendiente de cobro', async () => {
      const items = { 'i-1': itemCocinaPendiente, 'i-2': itemCocinaEntregado };
      mockPrisma.pedido.findMany.mockResolvedValue([pedidoBase(Object.values(items))]);
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-mesa-2' });
      stubUpdates(items);

      const { resultado, message } = await service.anularAtencionMesa(MESA, { motivo: 'Cliente se retiró' }, SEDE);

      expect(resultado.itemsMantenidosParaCobro).toBe(0);
      expect(resultado.mesaLiberada).toBe(true);
      expect(mockMesasHttp.liberarMesa).toHaveBeenCalledWith(MESA, 'LIBRE');
      expect(message).toContain('mesa liberada');
    });

    it('no falla la operación si la liberación de la mesa falla (dependencia caída) — solo reporta mesaLiberada=false', async () => {
      const items = { 'i-1': itemCocinaPendiente };
      mockPrisma.pedido.findMany.mockResolvedValue([pedidoBase(Object.values(items))]);
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-mesa-3' });
      stubUpdates(items);
      mockMesasHttp.liberarMesa.mockResolvedValue(false);

      const { resultado } = await service.anularAtencionMesa(MESA, { motivo: 'Cliente se retiró' }, SEDE);

      expect(resultado.mesaLiberada).toBe(false);
    });

    it('cancela TODOS los pedidos activos de la mesa, no solo uno', async () => {
      const itemsPedido1 = { 'i-1': itemCocinaPendiente };
      const itemsPedido2 = { 'i-5': { ...itemCocinaPendiente, id: 'i-5', pedidoId: 'p-2' } };
      mockPrisma.pedido.findMany.mockResolvedValue([
        pedidoBase(Object.values(itemsPedido1)),
        { ...pedidoBase(Object.values(itemsPedido2)), id: 'p-2' },
      ]);
      mockPrisma.anulacionAuditoria.create.mockResolvedValue({ id: 'aud-mesa-4' });
      mockPrisma.pedidoItem.update.mockImplementation((args: any) => {
        const all = { ...itemsPedido1, ...itemsPedido2 };
        return Promise.resolve({ ...all[args.where.id], estado: args.data.estado });
      });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedidoBase([]), items: [] });

      const { resultado } = await service.anularAtencionMesa(MESA, { motivo: 'Cliente se retiró' }, SEDE);

      expect(resultado.itemsCancelados).toBe(2);
      expect(mockPrisma.pedido.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('anularPedido — anulación puntual desde el tablero de Pedidos', () => {
    const SEDE = 'sede-001';
    const MESA = 'm-001';
    const itemCocinaPendiente = { id: 'i-1', pedidoId: 'p-1', productoId: 'prod-a', nombre: 'Sopa', cantidad: 1, precioUnitario: 10, area: 'COCINA', estado: PedidoEstado.Pendiente, notas: null };
    const itemCocinaEntregado = { id: 'i-2', pedidoId: 'p-1', productoId: 'prod-b', nombre: 'Lomo', cantidad: 1, precioUnitario: 20, area: 'COCINA', estado: PedidoEstado.Entregado, notas: null };

    const pedido = (items: any[], estado = PedidoEstado.EnPreparacion) => ({
      id: 'p-1', mesaId: MESA, sedeId: SEDE, numeroMesa: 1, cliente: null,
      estado, total: 30, createdAt: new Date(), items,
    });

    it('rechaza si el pedido no existe', async () => {
      mockPrisma.pedido.findUnique.mockResolvedValue(null);
      await expect(
        service.anularPedido('no-existe', { motivo: 'x' }, SEDE),
      ).rejects.toThrow('no encontrado');
    });

    it('rechaza si el pedido ya está en un estado terminal', async () => {
      mockPrisma.pedido.findUnique.mockResolvedValue(pedido([itemCocinaPendiente], PedidoEstado.Cancelado));
      await expect(
        service.anularPedido('p-1', { motivo: 'x' }, SEDE),
      ).rejects.toThrow('no se puede anular');
    });

    it('si todos los ítems ya estaban cancelados de antes, autocorrige el pedido a CANCELADO en vez de rechazar (pedido huérfano atascado en el tablero)', async () => {
      mockPrisma.pedido.findUnique.mockResolvedValue(
        pedido([{ ...itemCocinaPendiente, estado: PedidoEstado.Cancelado }]),
      );
      mockPrisma.pedido.update.mockResolvedValue({ ...pedido([]), estado: PedidoEstado.Cancelado, items: [] });
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue({ ...pedido([]), estado: PedidoEstado.Cancelado, items: [] });
      mockPrisma.anulacionAuditoria.createMany.mockResolvedValue({ count: 0 });

      const result = await service.anularPedido('p-1', { motivo: 'Limpieza de pedido atascado' }, SEDE);

      expect(result.pedido.estado).toBe(PedidoEstado.Cancelado);
      expect(mockPrisma.pedido.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: PedidoEstado.Cancelado }) }),
      );
    });

    it('rechaza si lo único que queda es un ítem DIRECTO confirmado como consumido (nada que cancelar ni autocorregir)', async () => {
      const itemDirectoMantenido = { id: 'i-3', pedidoId: 'p-1', productoId: 'prod-c', nombre: 'Cerveza', cantidad: 1, precioUnitario: 8, area: 'DIRECTO', estado: PedidoEstado.Entregado, notas: null };
      mockPrisma.pedido.findUnique.mockResolvedValue(pedido([itemDirectoMantenido]));
      await expect(
        service.anularPedido('p-1', { motivo: 'x', itemsConsumidos: ['i-3'] }, SEDE),
      ).rejects.toThrow('No hay ningún ítem');
    });

    it('cancela los ítems del pedido, mueve el pedido a CANCELADO, y crea auditoría POR ÍTEM (tipo ITEM, no MESA)', async () => {
      mockPrisma.pedido.findUnique.mockResolvedValue(pedido([itemCocinaPendiente, itemCocinaEntregado]));
      mockPrisma.pedidoItem.update.mockImplementation((args: any) => {
        const items: Record<string, any> = { 'i-1': itemCocinaPendiente, 'i-2': itemCocinaEntregado };
        return Promise.resolve({ ...items[args.where.id], estado: args.data.estado });
      });
      mockPrisma.anulacionAuditoria.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedido([]), estado: PedidoEstado.Cancelado, items: [] });
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue({ ...pedido([]), estado: PedidoEstado.Cancelado, items: [] });

      const result = await service.anularPedido('p-1', { motivo: 'Pedido duplicado por error' }, SEDE, undefined, 'u-1', 'Ana');

      // Auditoría por ítem, no un solo registro agregado tipo MESA (a
      // diferencia de anularAtencionMesa) — así invalidarAnulacion sí puede
      // revertir cada ítem de verdad después.
      expect(mockPrisma.anulacionAuditoria.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ itemId: 'i-1', tipo: 'ITEM', estadoPlato: 'SIN_PREPARAR' }),
          expect.objectContaining({ itemId: 'i-2', tipo: 'ITEM', estadoPlato: 'PREPARADO' }),
        ]),
      });
      expect(mockPrisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'p-1' },
        data: expect.objectContaining({ estado: PedidoEstado.Cancelado }),
      }));
      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      expect(eventos.map((e: any) => e.routingKey)).toEqual(expect.arrayContaining([
        'pedido.item_anulado', // i-1: sin preparar, avisa a cocina
        'pedido.item_anulado_con_merma', // i-2: ya se sirvió
        'pedido.actualizado',
      ]));
      expect(result.pedido.estado).toBe(PedidoEstado.Cancelado);
    });

    it('NO libera la mesa (a diferencia de anularAtencionMesa) — solo cancela este pedido', async () => {
      mockPrisma.pedido.findUnique.mockResolvedValue(pedido([itemCocinaPendiente]));
      mockPrisma.pedidoItem.update.mockResolvedValue({ ...itemCocinaPendiente, estado: PedidoEstado.Cancelado });
      mockPrisma.anulacionAuditoria.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.pedido.update.mockResolvedValue({ ...pedido([]), estado: PedidoEstado.Cancelado, items: [] });
      mockPrisma.pedido.findUniqueOrThrow.mockResolvedValue({ ...pedido([]), estado: PedidoEstado.Cancelado, items: [] });

      await service.anularPedido('p-1', { motivo: 'x' }, SEDE);

      expect(mockMesasHttp.liberarMesa).not.toHaveBeenCalled();
    });
  });

  describe('CU-05 — Auditoría de Anulaciones', () => {
    const SEDE = 'sede-001';
    const auditoriaBase = {
      id: 'aud-1', sedeId: SEDE, fecha: new Date(), mesaId: 'm-001', mesaNumero: 5,
      pedidoId: 'p-001', itemId: 'i-1', tipo: 'ITEM', productoId: 'prod-1', productoNombre: 'Lomo Saltado',
      cantidad: 2, estadoPlato: 'PREPARADO', cobrado: true, montoAnulado: { toNumber: () => 30 },
      motivo: 'x', observacion: null, usuarioId: 'u-1', usuarioNombre: 'Ana', clienteNombre: null,
      invalidada: false, invalidadaMotivo: null, invalidadaPorNombre: null, invalidadaAt: null,
    };

    describe('listarAnulaciones', () => {
      it('filtra por sede, tipo, usuario y rango de fechas', async () => {
        mockPrisma.anulacionAuditoria.findMany.mockResolvedValue([]);
        await service.listarAnulaciones({ tipo: 'ITEM', usuarioId: 'u-1', desde: '2026-08-01', hasta: '2026-08-31' } as any, SEDE);
        expect(mockPrisma.anulacionAuditoria.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              sedeId: SEDE, tipo: 'ITEM', usuarioId: 'u-1',
              fecha: { gte: new Date('2026-08-01'), lte: new Date('2026-08-31') },
            },
          }),
        );
      });

      it('T-23: exige sede si el usuario administra varias', async () => {
        await expect(service.listarAnulaciones({}, null)).rejects.toThrow('Indica la sede');
      });

      it('mapea correctamente el montoAnulado (Decimal → number)', async () => {
        mockPrisma.anulacionAuditoria.findMany.mockResolvedValue([auditoriaBase]);
        const result = await service.listarAnulaciones({}, SEDE);
        expect(result.anulaciones[0].montoAnulado).toBe(30);
      });

      it('busca por el código propio de la anulación o el de la atención cuando se indica search', async () => {
        mockPrisma.anulacionAuditoria.findMany.mockResolvedValue([]);
        await service.listarAnulaciones({ search: 'A000004' } as any, SEDE);
        expect(mockPrisma.anulacionAuditoria.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              sedeId: SEDE,
              OR: [
                { correlativo: { contains: 'A000004', mode: 'insensitive' } },
                { cuentaCorrelativo: { contains: 'A000004', mode: 'insensitive' } },
              ],
            },
          }),
        );
      });

      it('mapea el cuentaCorrelativo cuando el registro lo trae', async () => {
        mockPrisma.anulacionAuditoria.findMany.mockResolvedValue([{ ...auditoriaBase, cuentaCorrelativo: 'A0000007' }]);
        const result = await service.listarAnulaciones({}, SEDE);
        expect(result.anulaciones[0].cuentaCorrelativo).toBe('A0000007');
      });
    });

    describe('actualizarAnulacion', () => {
      it('rechaza si no existe', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue(null);
        await expect(service.actualizarAnulacion('no-existe', { motivo: 'y' }, SEDE)).rejects.toThrow('no encontrada');
      });

      it('rechaza si pertenece a otra sede', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue({ ...auditoriaBase, sedeId: 'otra-sede' });
        await expect(service.actualizarAnulacion('aud-1', { motivo: 'y' }, SEDE)).rejects.toThrow('no encontrada');
      });

      it('rechaza si ya fue invalidada', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue({ ...auditoriaBase, invalidada: true });
        await expect(service.actualizarAnulacion('aud-1', { motivo: 'y' }, SEDE)).rejects.toThrow('invalidada');
      });

      it('actualiza motivo/observación sin tocar monto/cobrado', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue(auditoriaBase);
        mockPrisma.anulacionAuditoria.update.mockResolvedValue({ ...auditoriaBase, motivo: 'Motivo corregido' });

        const result = await service.actualizarAnulacion('aud-1', { motivo: 'Motivo corregido' }, SEDE);

        expect(mockPrisma.anulacionAuditoria.update).toHaveBeenCalledWith({ where: { id: 'aud-1' }, data: { motivo: 'Motivo corregido' } });
        expect(result.anulacion.motivo).toBe('Motivo corregido');
      });
    });

    describe('invalidarAnulacion', () => {
      it('rechaza si no existe', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue(null);
        await expect(service.invalidarAnulacion('no-existe', { motivo: 'Error de digitación' }, SEDE)).rejects.toThrow('no encontrada');
      });

      it('rechaza si ya estaba invalidada', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue({ ...auditoriaBase, invalidada: true });
        await expect(service.invalidarAnulacion('aud-1', { motivo: 'Error de digitación' }, SEDE)).rejects.toThrow('ya estaba invalidada');
      });

      it('marca invalidada=true, conserva el registro y guarda quién/por qué', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue(auditoriaBase);
        mockPrisma.anulacionAuditoria.update.mockResolvedValue({ ...auditoriaBase, invalidada: true, invalidadaMotivo: 'Error de digitación', invalidadaPorNombre: 'Gerente' });

        const result = await service.invalidarAnulacion('aud-1', { motivo: 'Error de digitación' }, SEDE, undefined, 'Gerente');

        expect(mockPrisma.anulacionAuditoria.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'aud-1' },
            data: expect.objectContaining({ invalidada: true, invalidadaMotivo: 'Error de digitación', invalidadaPorNombre: 'Gerente' }),
          }),
        );
        expect(result.anulacion.invalidada).toBe(true);
      });

      it('bug: tipo MESA se rechaza explícitamente (no hay forma de saber qué ítems tocó)', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue({ ...auditoriaBase, tipo: 'MESA', itemId: null });
        await expect(
          service.invalidarAnulacion('aud-1', { motivo: 'Error de digitación' }, SEDE),
        ).rejects.toThrow('anulación de mesa completa');
        expect(mockPrisma.anulacionAuditoria.update).not.toHaveBeenCalled();
      });

      it('bug: tipo ITEM SÍ revierte el ítem real — vuelve a la cuenta actual, no solo el registro de auditoría', async () => {
        // auditoriaBase: estadoPlato PREPARADO → el ítem debe restaurarse a
        // ENTREGADO (era un plato ya servido cuando se anuló), no a PENDIENTE.
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue(auditoriaBase);
        mockPrisma.anulacionAuditoria.update.mockResolvedValue({ ...auditoriaBase, invalidada: true });
        mockPrisma.pedidoItem.findUnique.mockResolvedValue({
          id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Lomo Saltado',
          cantidad: 2, precioUnitario: 15, area: 'COCINA', estado: PedidoEstado.Cancelado, notas: null,
        });
        mockPrisma.pedidoItem.update.mockResolvedValue({
          id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Lomo Saltado',
          cantidad: 2, precioUnitario: 15, area: 'COCINA', estado: PedidoEstado.Entregado, notas: null,
        });
        mockPrisma.pedido.findUnique.mockResolvedValue({
          id: 'p-001', mesaId: 'm-001', numeroMesa: 5, sedeId: SEDE, cliente: null,
          estado: PedidoEstado.EnPreparacion, total: 0, createdAt: new Date(),
          items: [{ id: 'i-1', pedidoId: 'p-001', productoId: 'prod-1', nombre: 'Lomo Saltado', cantidad: 2, precioUnitario: 15, area: 'COCINA', estado: PedidoEstado.Cancelado, notas: null }],
        });
        mockPrisma.pedido.update.mockResolvedValue({
          id: 'p-001', mesaId: 'm-001', numeroMesa: 5, sedeId: SEDE, cliente: null,
          estado: PedidoEstado.Listo, total: 30, createdAt: new Date(), items: [],
        });

        const result = await service.invalidarAnulacion('aud-1', { motivo: 'Se anuló por error' }, SEDE);

        expect(mockPrisma.pedidoItem.update).toHaveBeenCalledWith({
          where: { id: 'i-1' },
          data: { estado: PedidoEstado.Entregado },
        });
        expect(mockPrisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
          where: { id: 'p-001' },
          data: expect.objectContaining({ total: 30 }),
        }));
        expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ routingKey: 'pedido.actualizado' }),
        }));
        expect(result.message).toContain('vuelve a la cuenta actual');
      });

      it('no revierte el ítem si ya no está CANCELADO (algo más lo cambió desde entonces) — solo corrige la auditoría', async () => {
        mockPrisma.anulacionAuditoria.findUnique.mockResolvedValue(auditoriaBase);
        mockPrisma.anulacionAuditoria.update.mockResolvedValue({ ...auditoriaBase, invalidada: true });
        mockPrisma.pedidoItem.findUnique.mockResolvedValue({
          id: 'i-1', pedidoId: 'p-001', estado: PedidoEstado.Entregado,
        });

        await service.invalidarAnulacion('aud-1', { motivo: 'x' }, SEDE);

        expect(mockPrisma.pedidoItem.update).not.toHaveBeenCalled();
        expect(mockPrisma.pedido.update).not.toHaveBeenCalled();
      });
    });
  });
});
