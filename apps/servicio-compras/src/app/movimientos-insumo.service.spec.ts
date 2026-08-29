// @ts-nocheck

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MovimientosInsumoService } from './movimientos-insumo.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingKeys } from '@org/contracts';

function dec(n: number) {
  return { toNumber: () => n, toString: () => String(n) };
}

const SEDE = 'sede-001';

function insumo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i-001',
    sedeId: SEDE,
    nombre: 'Arroz',
    unidad: 'kg',
    stockActual: dec(10),
    stockMinimo: dec(2),
    costoUnitario: dec(4.5),
    ...overrides,
  };
}

describe('MovimientosInsumoService', () => {
  let service: MovimientosInsumoService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      insumo: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      movimientoInsumo: { create: jest.fn(), findMany: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };
    mockPrisma.$transaction = jest.fn((cb: unknown) => (cb as (arg: unknown) => unknown)(mockPrisma));

    // El movimiento creado se mapea a DTO junto al insumo ya actualizado.
    mockPrisma.movimientoInsumo.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'mv-001',
        ...data,
        delta: dec(data.delta),
        stockAntes: dec(data.stockAntes),
        stockDespues: dec(data.stockDespues),
        costoUnitario: data.costoUnitario,
        createdAt: new Date('2026-08-24T12:00:00.000Z'),
      }),
    );

    service = new MovimientosInsumoService(mockPrisma as unknown as PrismaService);
  });

  describe('registrar (movimiento manual)', () => {
    it('un consumo descuenta del stock y deja la fila de kardex con delta negativo', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo());
      mockPrisma.insumo.update.mockResolvedValue(insumo({ stockActual: dec(7.5) }));

      const res = await service.registrar(
        'i-001',
        { tipo: 'SALIDA_CONSUMO', cantidad: 2.5, motivo: 'Almuerzo del día' },
        { id: 'u-1', nombre: 'Rosa' },
        SEDE,
      );

      expect(mockPrisma.insumo.update).toHaveBeenCalledWith({
        where: { id: 'i-001' },
        data: { stockActual: 7.5 },
      });
      expect(mockPrisma.movimientoInsumo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: 'SALIDA_CONSUMO',
            delta: -2.5,
            stockAntes: 10,
            stockDespues: 7.5,
            usuarioNombre: 'Rosa',
          }),
        }),
      );
      expect(res.movimiento.delta).toBe(-2.5);
    });

    it('una devolución suma al stock', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo());
      mockPrisma.insumo.update.mockResolvedValue(insumo({ stockActual: dec(11) }));

      await service.registrar('i-001', { tipo: 'ENTRADA_DEVOLUCION', cantidad: 1 }, null, SEDE);

      expect(mockPrisma.insumo.update).toHaveBeenCalledWith({
        where: { id: 'i-001' },
        data: { stockActual: 11 },
      });
    });

    it('rechaza (400) consumir más de lo que hay, sin clampar a 0', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo({ stockActual: dec(3) }));

      await expect(
        service.registrar('i-001', { tipo: 'SALIDA_CONSUMO', cantidad: 8 }, null, SEDE),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.insumo.update).not.toHaveBeenCalled();
      expect(mockPrisma.movimientoInsumo.create).not.toHaveBeenCalled();
    });

    it('el mensaje de error dice cuánto hay de verdad', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo({ stockActual: dec(3) }));

      await expect(
        service.registrar('i-001', { tipo: 'SALIDA_CONSUMO', cantidad: 8 }, null, SEDE),
      ).rejects.toThrow('solo hay 3 kg');
    });

    it('404 si el insumo es de otra sede', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo({ sedeId: 'sede-999' }));

      await expect(
        service.registrar('i-001', { tipo: 'SALIDA_CONSUMO', cantidad: 1 }, null, SEDE),
      ).rejects.toThrow(NotFoundException);
    });

    it('toma lock por insumo antes de leer el saldo (dos cocineros a la vez)', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo());
      mockPrisma.insumo.update.mockResolvedValue(insumo({ stockActual: dec(9) }));

      await service.registrar('i-001', { tipo: 'SALIDA_CONSUMO', cantidad: 1 }, null, SEDE);

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('evento insumo.stock_bajo', () => {
    it('se emite en el cruce hacia abajo del mínimo', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo({ stockActual: dec(3), stockMinimo: dec(2) }));
      mockPrisma.insumo.update.mockResolvedValue(insumo({ stockActual: dec(1.5) }));

      await service.registrar('i-001', { tipo: 'SALIDA_CONSUMO', cantidad: 1.5 }, null, SEDE);

      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ routingKey: RoutingKeys.InsumoStockBajo, status: 'PENDING' }),
      });
    });

    it('NO se re-emite si ya venía por debajo del mínimo', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo({ stockActual: dec(1.5), stockMinimo: dec(2) }));
      mockPrisma.insumo.update.mockResolvedValue(insumo({ stockActual: dec(1) }));

      await service.registrar('i-001', { tipo: 'SALIDA_CONSUMO', cantidad: 0.5 }, null, SEDE);

      expect(mockPrisma.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('no se emite si el movimiento deja el stock por encima del mínimo', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo({ stockActual: dec(10), stockMinimo: dec(2) }));
      mockPrisma.insumo.update.mockResolvedValue(insumo({ stockActual: dec(9) }));

      await service.registrar('i-001', { tipo: 'SALIDA_CONSUMO', cantidad: 1 }, null, SEDE);

      expect(mockPrisma.outboxEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('registrarConteo (cuadre físico)', () => {
    it('ajusta solo los insumos que NO cuadran', async () => {
      const arroz = insumo({ id: 'i-001', nombre: 'Arroz', stockActual: dec(10) });
      const aceite = insumo({ id: 'i-002', nombre: 'Aceite', stockActual: dec(4), unidad: 'L' });
      mockPrisma.insumo.findMany.mockResolvedValue([arroz, aceite]);
      mockPrisma.insumo.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 'i-001' ? arroz : aceite),
      );
      mockPrisma.insumo.update.mockResolvedValue(arroz);

      const { resultado } = await service.registrarConteo(
        {
          items: [
            { insumoId: 'i-001', stockContado: 8 }, // faltan 2
            { insumoId: 'i-002', stockContado: 4 }, // cuadra
          ],
        },
        { id: 'u-1', nombre: 'Rosa' },
        SEDE,
      );

      expect(resultado.insumosContados).toBe(2);
      expect(resultado.ajustados).toBe(1);
      expect(resultado.cuadraron).toBe(1);
      expect(mockPrisma.movimientoInsumo.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.movimientoInsumo.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tipo: 'AJUSTE_CONTEO', delta: -2 }) }),
      );
    });

    it('valoriza la diferencia con el costo del insumo (negativo = pérdida)', async () => {
      const arroz = insumo({ stockActual: dec(10), costoUnitario: dec(4.5) });
      mockPrisma.insumo.findMany.mockResolvedValue([arroz]);
      mockPrisma.insumo.findUnique.mockResolvedValue(arroz);
      mockPrisma.insumo.update.mockResolvedValue(arroz);

      const { resultado } = await service.registrarConteo({ items: [{ insumoId: 'i-001', stockContado: 8 }] }, null, SEDE);

      expect(resultado.diferencias[0].diferencia).toBe(-2);
      expect(resultado.valorDiferenciaTotal).toBe(-9);
    });

    it('un sobrante también se registra (delta positivo)', async () => {
      const arroz = insumo({ stockActual: dec(10) });
      mockPrisma.insumo.findMany.mockResolvedValue([arroz]);
      mockPrisma.insumo.findUnique.mockResolvedValue(arroz);
      mockPrisma.insumo.update.mockResolvedValue(arroz);

      const { resultado } = await service.registrarConteo({ items: [{ insumoId: 'i-001', stockContado: 12 }] }, null, SEDE);

      expect(resultado.diferencias[0].diferencia).toBe(2);
      expect(mockPrisma.movimientoInsumo.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ delta: 2 }) }),
      );
    });

    it('rechaza (400) el mismo insumo repetido en el conteo', async () => {
      await expect(
        service.registrarConteo(
          { items: [{ insumoId: 'i-001', stockContado: 1 }, { insumoId: 'i-001', stockContado: 2 }] },
          null,
          SEDE,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('404 si algún insumo del conteo no existe en la sede', async () => {
      mockPrisma.insumo.findMany.mockResolvedValue([]);

      await expect(
        service.registrarConteo({ items: [{ insumoId: 'i-404', stockContado: 1 }] }, null, SEDE),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listar (kardex)', () => {
    it('devuelve nextCursor cuando hay más páginas', async () => {
      const filas = Array.from({ length: 3 }, (_, i) => ({
        id: `mv-00${i}`,
        sedeId: SEDE,
        insumoId: 'i-001',
        tipo: 'SALIDA_CONSUMO',
        delta: dec(-1),
        stockAntes: dec(10),
        stockDespues: dec(9),
        costoUnitario: dec(4.5),
        motivo: null,
        observacion: null,
        recepcionId: null,
        usuarioId: null,
        usuarioNombre: null,
        createdAt: new Date('2026-08-24T12:00:00.000Z'),
        insumo: insumo(),
      }));
      mockPrisma.movimientoInsumo.findMany.mockResolvedValue(filas);

      const res = await service.listar({ limit: 2 }, SEDE);

      expect(res.data).toHaveLength(2);
      expect(res.nextCursor).toBe('mv-001');
    });

    it('el costoTotal del movimiento es absoluto aunque el delta sea negativo', async () => {
      mockPrisma.movimientoInsumo.findMany.mockResolvedValue([
        {
          id: 'mv-001',
          sedeId: SEDE,
          insumoId: 'i-001',
          tipo: 'SALIDA_CONSUMO',
          delta: dec(-2),
          stockAntes: dec(10),
          stockDespues: dec(8),
          costoUnitario: dec(4.5),
          motivo: null,
          observacion: null,
          recepcionId: null,
          usuarioId: null,
          usuarioNombre: null,
          createdAt: new Date('2026-08-24T12:00:00.000Z'),
          insumo: insumo(),
        },
      ]);

      const res = await service.listar({}, SEDE);

      expect(res.data[0].costoTotal).toBe(9);
      expect(res.data[0].delta).toBe(-2);
    });
  });
});
