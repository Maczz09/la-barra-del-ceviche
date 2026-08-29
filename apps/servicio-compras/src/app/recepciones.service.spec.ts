// @ts-nocheck

import { RecepcionesService } from './recepciones.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingKeys } from '@org/contracts';

function dec(n: number) {
  return {
    toNumber: () => n,
    gte: (o: { toNumber: () => number } | number) => n >= (typeof o === 'number' ? o : o.toNumber()),
  };
}

const SEDE = 'sede-001';

function ordenItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'it-001',
    ordenId: 'oc-001',
    insumoId: 'i-001',
    insumoNombre: 'Pescado (lenguado)',
    unidad: 'kg',
    cantidadPedida: dec(12),
    cantidadRecibida: dec(0),
    costoUnitario: dec(28),
    insumo: { id: 'i-001', productoId: null, factorConversion: dec(1) },
    ...overrides,
  };
}

describe('RecepcionesService', () => {
  let service: RecepcionesService;
  let mockPrisma: any;
  let mockOrdenes: any;
  let mockMovimientos: any;

  beforeEach(() => {
    mockPrisma = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      ordenCompraItem: { findMany: jest.fn(), update: jest.fn() },
      insumo: { update: jest.fn() },
      recepcionCompra: { create: jest.fn(), findMany: jest.fn() },
      ordenCompra: { update: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };
    mockPrisma.$transaction = jest.fn((callback: unknown) => (callback as (arg: unknown) => unknown)(mockPrisma));

    mockOrdenes = { findOrThrow: jest.fn() };
    mockMovimientos = { aplicarMovimiento: jest.fn().mockResolvedValue({ movimiento: {}, insumo: {} }) };
    service = new RecepcionesService(mockPrisma as unknown as PrismaService, mockOrdenes, mockMovimientos);
  });

  describe('registrar', () => {
    it('registra una recepción parcial: acumula cantidadRecibida y deja la orden en PARCIAL', async () => {
      mockOrdenes.findOrThrow.mockResolvedValue({ id: 'oc-001', sedeId: SEDE, estado: 'ENVIADA', codigo: 'OC-1001' });
      mockPrisma.ordenCompraItem.findMany
        .mockResolvedValueOnce([ordenItem()]) // dentro de la tx, antes de actualizar
        .mockResolvedValueOnce([ordenItem({ cantidadRecibida: dec(5) })]); // tras el increment
      mockPrisma.recepcionCompra.create.mockResolvedValue({
        id: 'rc-001',
        sedeId: SEDE,
        ordenId: 'oc-001',
        fecha: new Date(),
        observaciones: null,
        usuarioId: null,
        usuarioNombre: null,
        items: [{ id: 'ri-001', ordenItemId: 'it-001', cantidadRecibida: dec(5), costoUnitario: dec(28) }],
        createdAt: new Date(),
      });
      mockPrisma.ordenCompra.update.mockResolvedValue({
        id: 'oc-001', sedeId: SEDE, codigo: 'OC-1001', estado: 'PARCIAL', proveedorNombre: 'X',
        fechaEmision: new Date(), fechaEnvio: new Date(), fechaEntregaEsperada: null, fechaCierre: null,
        moneda: 'PEN', total: dec(336), notas: null, usuarioId: null, usuarioNombre: null,
        items: [ordenItem({ cantidadRecibida: dec(5) })], createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.registrar('oc-001', { items: [{ ordenItemId: 'it-001', cantidadRecibida: 5 }] }, null, SEDE);

      expect(mockPrisma.ordenCompraItem.update).toHaveBeenCalledWith({
        where: { id: 'it-001' },
        data: { cantidadRecibida: { increment: 5 } },
      });
      // T-50: el stock propio del insumo (unidad de compra) sube por la MISMA
      // puerta que el consumo de cocina, para que la entrada quede en el kardex
      // y apunte a la recepción que la originó.
      expect(mockPrisma.insumo.update).not.toHaveBeenCalled();
      expect(mockMovimientos.aplicarMovimiento).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          insumoId: 'i-001',
          tipo: 'ENTRADA_COMPRA',
          delta: 5,
          recepcionId: 'rc-001',
        }),
      );
      expect(result.orden.estado).toBe('PARCIAL');
      expect(result.message).toContain('parcial');
    });

    it('una segunda recepción que completa el ítem deja la orden en RECIBIDA con fechaCierre', async () => {
      mockOrdenes.findOrThrow.mockResolvedValue({ id: 'oc-001', sedeId: SEDE, estado: 'PARCIAL', codigo: 'OC-1001' });
      mockPrisma.ordenCompraItem.findMany
        .mockResolvedValueOnce([ordenItem({ cantidadRecibida: dec(5) })])
        .mockResolvedValueOnce([ordenItem({ cantidadRecibida: dec(12) })]); // ya completo
      mockPrisma.recepcionCompra.create.mockResolvedValue({
        id: 'rc-002', sedeId: SEDE, ordenId: 'oc-001', fecha: new Date(), observaciones: null,
        usuarioId: null, usuarioNombre: null,
        items: [{ id: 'ri-002', ordenItemId: 'it-001', cantidadRecibida: dec(7), costoUnitario: dec(28) }],
        createdAt: new Date(),
      });
      mockPrisma.ordenCompra.update.mockResolvedValue({
        id: 'oc-001', sedeId: SEDE, codigo: 'OC-1001', estado: 'RECIBIDA', proveedorNombre: 'X',
        fechaEmision: new Date(), fechaEnvio: new Date(), fechaEntregaEsperada: null, fechaCierre: new Date(),
        moneda: 'PEN', total: dec(336), notas: null, usuarioId: null, usuarioNombre: null,
        items: [ordenItem({ cantidadRecibida: dec(12) })], createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.registrar('oc-001', { items: [{ ordenItemId: 'it-001', cantidadRecibida: 7 }] }, null, SEDE);

      expect(mockPrisma.ordenCompra.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'RECIBIDA' }) }),
      );
      expect(result.orden.estado).toBe('RECIBIDA');
      expect(result.message).toContain('completa');
    });

    it('rechaza (400) recibir más de lo pendiente', async () => {
      mockOrdenes.findOrThrow.mockResolvedValue({ id: 'oc-001', sedeId: SEDE, estado: 'ENVIADA', codigo: 'OC-1001' });
      mockPrisma.ordenCompraItem.findMany.mockResolvedValueOnce([ordenItem()]);

      await expect(
        service.registrar('oc-001', { items: [{ ordenItemId: 'it-001', cantidadRecibida: 99 }] }, null, SEDE),
      ).rejects.toThrow('pendientes');
    });

    it('rechaza (409) recibir sobre una orden que no está ENVIADA ni PARCIAL', async () => {
      mockOrdenes.findOrThrow.mockResolvedValue({ id: 'oc-001', sedeId: SEDE, estado: 'BORRADOR', codigo: 'OC-1001' });
      await expect(
        service.registrar('oc-001', { items: [{ ordenItemId: 'it-001', cantidadRecibida: 1 }] }, null, SEDE),
      ).rejects.toThrow('Solo se puede recibir');
    });

    it('publica compra.recibida en el outbox cuando el insumo tiene productoId (se revende)', async () => {
      mockOrdenes.findOrThrow.mockResolvedValue({ id: 'oc-001', sedeId: SEDE, estado: 'ENVIADA', codigo: 'OC-1001' });
      mockPrisma.ordenCompraItem.findMany
        .mockResolvedValueOnce([ordenItem({ insumo: { id: 'i-001', productoId: 'prod-1', factorConversion: dec(6) } })])
        .mockResolvedValueOnce([ordenItem({ cantidadRecibida: dec(2) })]);
      mockPrisma.recepcionCompra.create.mockResolvedValue({
        id: 'rc-003', sedeId: SEDE, ordenId: 'oc-001', fecha: new Date(), observaciones: null,
        usuarioId: null, usuarioNombre: null,
        items: [{ id: 'ri-003', ordenItemId: 'it-001', cantidadRecibida: dec(2), costoUnitario: dec(28) }],
        createdAt: new Date(),
      });
      mockPrisma.ordenCompra.update.mockResolvedValue({
        id: 'oc-001', sedeId: SEDE, codigo: 'OC-1001', estado: 'PARCIAL', proveedorNombre: 'X',
        fechaEmision: new Date(), fechaEnvio: new Date(), fechaEntregaEsperada: null, fechaCierre: null,
        moneda: 'PEN', total: dec(336), notas: null, usuarioId: null, usuarioNombre: null,
        items: [], createdAt: new Date(), updatedAt: new Date(),
      });

      await service.registrar('oc-001', { items: [{ ordenItemId: 'it-001', cantidadRecibida: 2 }] }, null, SEDE);

      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          routingKey: RoutingKeys.CompraRecibida,
          payload: JSON.stringify({
            recepcionId: 'rc-003',
            ordenId: 'oc-001',
            sedeId: SEDE,
            lineas: [{ insumoId: 'i-001', insumoNombre: 'Pescado (lenguado)', productoId: 'prod-1', cantidadRecibida: 2, cantidadStockVenta: 12 }],
          }),
          status: 'PENDING',
        }),
      });
    });

    it('no publica ningún evento cuando ningún insumo recibido tiene productoId (insumos crudos)', async () => {
      mockOrdenes.findOrThrow.mockResolvedValue({ id: 'oc-001', sedeId: SEDE, estado: 'ENVIADA', codigo: 'OC-1001' });
      mockPrisma.ordenCompraItem.findMany
        .mockResolvedValueOnce([ordenItem()]) // productoId: null
        .mockResolvedValueOnce([ordenItem({ cantidadRecibida: dec(5) })]);
      mockPrisma.recepcionCompra.create.mockResolvedValue({
        id: 'rc-004', sedeId: SEDE, ordenId: 'oc-001', fecha: new Date(), observaciones: null,
        usuarioId: null, usuarioNombre: null,
        items: [{ id: 'ri-004', ordenItemId: 'it-001', cantidadRecibida: dec(5), costoUnitario: dec(28) }],
        createdAt: new Date(),
      });
      mockPrisma.ordenCompra.update.mockResolvedValue({
        id: 'oc-001', sedeId: SEDE, codigo: 'OC-1001', estado: 'PARCIAL', proveedorNombre: 'X',
        fechaEmision: new Date(), fechaEnvio: new Date(), fechaEntregaEsperada: null, fechaCierre: null,
        moneda: 'PEN', total: dec(336), notas: null, usuarioId: null, usuarioNombre: null,
        items: [], createdAt: new Date(), updatedAt: new Date(),
      });

      await service.registrar('oc-001', { items: [{ ordenItemId: 'it-001', cantidadRecibida: 5 }] }, null, SEDE);

      expect(mockPrisma.outboxEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('listarPorOrden', () => {
    it('lista las recepciones de una orden validando la sede vía OrdenesService', async () => {
      mockOrdenes.findOrThrow.mockResolvedValue({ id: 'oc-001', sedeId: SEDE });
      mockPrisma.recepcionCompra.findMany.mockResolvedValue([]);
      const result = await service.listarPorOrden('oc-001', SEDE);
      expect(mockOrdenes.findOrThrow).toHaveBeenCalledWith('oc-001', SEDE);
      expect(result.data).toEqual([]);
    });
  });
});
