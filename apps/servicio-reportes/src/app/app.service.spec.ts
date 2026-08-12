// @ts-nocheck

import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AppService — Reportes', () => {
  const prisma = {
    ventaDiaria: {
      upsert: jest.fn() as any,
      findMany: jest.fn() as any,
    },
  };

  let service: AppService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppService(prisma as unknown as PrismaService);
  });

  it('registra ventas con upsert idempotente por cuenta', async () => {
    await service.registrarVenta({
      cuentaId: 'cuenta-1',
      mesaId: 'mesa-1',
      total: 50,
      items: [{ productoId: 'prod-1', nombre: 'Nachos', cantidad: 2, precioUnitario: 25 }],
    });

    expect(prisma.ventaDiaria.upsert).toHaveBeenCalledWith({
      where: { cuentaId: 'cuenta-1' },
      create: expect.objectContaining({
        cuentaId: 'cuenta-1',
        mesaId: 'mesa-1',
        total: 50,
        items: [{ productoId: 'prod-1', nombre: 'Nachos', cantidad: 2, precioUnitario: 25 }],
      }) as unknown,
      update: expect.objectContaining({
        total: 50,
      }) as unknown,
    });
  });

  it('resume ingresos, horas y top productos del dia', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-02T15:00:00.000Z'));
    prisma.ventaDiaria.findMany.mockResolvedValue([
      {
        total: 80,
        fecha: new Date('2026-01-02T18:10:00.000Z'),
        items: [
          { productoId: 'prod-1', nombre: 'Nachos', cantidad: 2, precioUnitario: 20 },
          { productoId: 'prod-2', nombre: 'Limonada', cantidad: 1, precioUnitario: 40 },
        ],
      },
      {
        total: 20,
        fecha: new Date('2026-01-02T18:45:00.000Z'),
        items: [{ productoId: 'prod-1', nombre: 'Nachos', cantidad: 1, precioUnitario: 20 }],
      },
    ]);

    const resumen = await service.obtenerResumenDiario();

    const inicioDiaLocal = new Date('2026-01-02T15:00:00.000Z');
    inicioDiaLocal.setHours(0, 0, 0, 0);
    expect(prisma.ventaDiaria.findMany).toHaveBeenCalledWith({
      where: { fecha: { gte: inicioDiaLocal, lte: new Date('2026-01-02T15:00:00.000Z') } },
    });
    expect(resumen.fecha).toEqual(inicioDiaLocal);
    expect(resumen.hasta).toEqual(new Date('2026-01-02T15:00:00.000Z'));
    expect(resumen.totalVentas).toBe(2);
    expect(resumen.ingresosTotales).toBe(100);
    expect(resumen.ventasPorHora.find((item) => item.hora === '13:00')).toEqual({
      hora: '13:00',
      total: 100,
    });
    expect(resumen.topProductos[0]).toEqual({
      productoId: 'prod-1',
      nombre: 'Nachos',
      cantidad: 3,
      ingresos: 60,
    });

    jest.useRealTimers();
  });

  it('obtenerResumenDiario acepta un rango desde/hasta explícito (filtros de reportes)', async () => {
    prisma.ventaDiaria.findMany.mockResolvedValue([
      { total: 50, fecha: new Date('2026-01-05T14:00:00.000Z'), items: [] },
    ]);

    const resumen = await service.obtenerResumenDiario({ desde: '2026-01-01', hasta: '2026-01-31' });

    const gteEsperado = new Date('2026-01-01T00:00:00.000-05:00');
    const lteEsperado = new Date('2026-01-31T23:59:59.999-05:00');
    expect(prisma.ventaDiaria.findMany).toHaveBeenCalledWith({
      where: { fecha: { gte: gteEsperado, lte: lteEsperado } },
    });
    expect(resumen.fecha).toEqual(gteEsperado);
    expect(resumen.hasta).toEqual(lteEsperado);
    expect(resumen.totalVentas).toBe(1);
  });

  it('rango "Hoy" (desde === hasta) cubre todo el día calendario de Lima, no un instante', async () => {
    prisma.ventaDiaria.findMany.mockResolvedValue([]);
    await service.obtenerResumenDiario({ desde: '2026-08-11', hasta: '2026-08-11' });
    expect(prisma.ventaDiaria.findMany).toHaveBeenCalledWith({
      where: {
        fecha: {
          gte: new Date('2026-08-11T00:00:00.000-05:00'),
          lte: new Date('2026-08-11T23:59:59.999-05:00'),
        },
      },
    });
  });

  describe('reportes ricos (plan 6.3)', () => {
    it('registra el mesero en la venta', async () => {
      await service.registrarVenta({
        cuentaId: 'c1', mesaId: 'm1', total: 30, items: [],
        meseroId: 'u-1', meseroNombre: 'Ana',
      });
      expect(prisma.ventaDiaria.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ meseroId: 'u-1', meseroNombre: 'Ana' }) as unknown,
        }) as unknown,
      );
    });

    it('por-producto agrega cantidad e ingresos y ordena por ingresos', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([
        { total: 100, fecha: new Date(), items: [
          { productoId: 'p1', nombre: 'Nachos', cantidad: 2, precioUnitario: 20 },
          { productoId: 'p2', nombre: 'Pizza', cantidad: 1, precioUnitario: 60 },
        ] },
        { total: 40, fecha: new Date(), items: [
          { productoId: 'p1', nombre: 'Nachos', cantidad: 2, precioUnitario: 20 },
        ] },
      ]);
      const r = await service.obtenerPorProducto({ desde: '2026-01-01', hasta: '2026-12-31' });
      expect(r.productos[0]).toEqual({ productoId: 'p1', nombre: 'Nachos', cantidad: 4, ingresos: 80 });
      expect(r.productos[1]).toEqual({ productoId: 'p2', nombre: 'Pizza', cantidad: 1, ingresos: 60 });
    });

    it('por-turno deriva ALMUERZO/CENA/OTRO de la hora', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([
        { total: 50, fecha: new Date('2026-01-02T13:00:00') },
        { total: 30, fecha: new Date('2026-01-02T14:00:00') },
        { total: 90, fecha: new Date('2026-01-02T20:00:00') },
        { total: 20, fecha: new Date('2026-01-02T09:00:00') }, // antes del almuerzo → OTRO
      ]);
      const r = await service.obtenerPorTurno({});
      const almuerzo = r.turnos.find((t) => t.turno === 'ALMUERZO');
      const cena = r.turnos.find((t) => t.turno === 'CENA');
      const otro = r.turnos.find((t) => t.turno === 'OTRO');
      expect(almuerzo).toEqual({ turno: 'ALMUERZO', totalVentas: 2, ingresos: 80 });
      expect(cena).toEqual({ turno: 'CENA', totalVentas: 1, ingresos: 90 });
      expect(otro).toEqual({ turno: 'OTRO', totalVentas: 1, ingresos: 20 });
    });

    it('por-mesero agrupa por meseroId y separa lo sin asignar', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([
        { total: 100, fecha: new Date(), meseroId: 'u-1', meseroNombre: 'Ana' },
        { total: 50, fecha: new Date(), meseroId: 'u-1', meseroNombre: 'Ana' },
        { total: 70, fecha: new Date(), meseroId: null, meseroNombre: null },
      ]);
      const r = await service.obtenerPorMesero({});
      expect(r.meseros[0]).toEqual({ meseroId: 'u-1', meseroNombre: 'Ana', totalVentas: 2, ingresos: 150 });
      expect(r.meseros.find((m) => m.meseroId === '(sin asignar)')).toEqual({
        meseroId: '(sin asignar)', meseroNombre: '(sin asignar)', totalVentas: 1, ingresos: 70,
      });
    });
  });

  describe('scoping por sede (T-23 Fase 2) — LENIENTE, no resolveSedeId', () => {
    it('registrarVenta cae a Sede Principal cuando el evento no trae sedeId (rollout)', async () => {
      await service.registrarVenta({ cuentaId: 'c-legado', mesaId: 'm-1', total: 30, items: [] });
      expect(prisma.ventaDiaria.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ sedeId: '00000000-0000-0000-0000-000000000001' }) as unknown,
        }) as unknown,
      );
    });

    it('registrarVenta usa el sedeId del evento cuando viene presente', async () => {
      await service.registrarVenta({ cuentaId: 'c-1', mesaId: 'm-1', sedeId: 'sede-002', total: 30, items: [] });
      expect(prisma.ventaDiaria.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ sedeId: 'sede-002' }) as unknown,
        }) as unknown,
      );
    });

    it('usuario pineado: su sede manda, un query.sedeId distinto se ignora', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([]);
      await service.obtenerResumenDiario({ sedeId: 'sede-otra' }, 'sede-001');
      expect(prisma.ventaDiaria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: 'sede-001' }) }),
      );
    });

    it('admin general sin sedeId → vista combinada (sin filtro de sede)', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([]);
      await service.obtenerResumenDiario({}, null);
      const where = prisma.ventaDiaria.findMany.mock.calls.at(-1)[0].where;
      expect(where).not.toHaveProperty('sedeId');
    });

    it('admin general con sedeId explícito → filtra por esa sede', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([]);
      await service.obtenerResumenDiario({ sedeId: 'sede-002' }, null);
      expect(prisma.ventaDiaria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: 'sede-002' }) }),
      );
    });
  });
});
