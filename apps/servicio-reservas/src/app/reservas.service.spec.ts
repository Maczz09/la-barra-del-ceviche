// @ts-nocheck

import { ReservasService } from './reservas.service';
import { ReservaEstado, RoutingKeys } from '@org/contracts';

import { PrismaService } from '../prisma/prisma.service';

type MockPrismaService = {
  reserva: {
    findMany: ReturnType<typeof jest.fn>;
    findUnique: ReturnType<typeof jest.fn>;
    create: ReturnType<typeof jest.fn>;
    update: ReturnType<typeof jest.fn>;
    count: ReturnType<typeof jest.fn>;
  };
  secuenciaReserva: {
    upsert: ReturnType<typeof jest.fn>;
  };
  outboxEvent: {
    create: ReturnType<typeof jest.fn>;
  };
  $transaction: ReturnType<typeof jest.fn>;
};

function createMockPrismaService(overrides: Record<string, unknown> = {}) {
  return { ...overrides } as unknown as MockPrismaService;
}

const SEDE = 'sede-001';
const OTRA_SEDE = 'sede-002';

describe('ReservasService — Reservas', () => {
  let service: ReservasService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  // Fecha siempre futura (+30 días) para que los tests de `crear` no caduquen:
  // el servicio ahora rechaza reservas en fecha/hora pasada.
  const fechaFutura = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const reservaBase = {
    id: 'r-001',
    sedeId: SEDE,
    clienteId: 'c-001',
    clienteNombre: 'Juan Perez',
    clienteTelefono: '999888777',
    fecha: new Date('2026-06-15'),
    hora: '19:00',
    mesaPreferida: 'mesa-005',
    numComensales: 4,
    estado: ReservaEstado.Pendiente,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = createMockPrismaService({
      reserva: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      secuenciaReserva: {
        upsert: jest.fn().mockResolvedValue({ sedeId: SEDE, ultimo: 1 }),
      },
      outboxEvent: {
        create: jest.fn(),
      },
    });
    mockPrisma.$transaction = jest.fn((callback: unknown) => Promise.resolve((callback as (arg: unknown) => unknown)(mockPrisma)));
    service = new ReservasService(mockPrisma as unknown as PrismaService);
  });

  describe('listar', () => {
    it('debe listar reservas', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([reservaBase]);
      const result = await service.listar({}, SEDE);
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
      expect(mockPrisma.reserva.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 21,
        orderBy: [{ fecha: 'asc' }, { hora: 'asc' }, { id: 'asc' }],
      }));
    });

    it('debe retornar array vacio si no hay reservas', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      const result = await service.listar({}, SEDE);
      expect(result.data).toEqual([]);
    });

    it('devuelve data y nextCursor cuando hay mas resultados', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([
        { ...reservaBase, id: 'r-001' },
        { ...reservaBase, id: 'r-002' },
        { ...reservaBase, id: 'r-003' },
      ]);

      const result = await service.listar({ limit: 2 }, SEDE);

      expect(result.data.map((reserva) => reserva.id)).toEqual(['r-001', 'r-002']);
      expect(result.nextCursor).toBe('r-002');
      expect(mockPrisma.reserva.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 3,
      }));
    });

    it('aplica cursor, estado, fecha, updatedSince y tope maximo de limit', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);

      await service.listar({
        cursor: 'r-010',
        estado: ReservaEstado.Confirmada,
        fecha: '2026-06-15',
        updatedSince: '2026-01-01T00:00:00.000Z',
        limit: 500,
      }, SEDE);

      expect(mockPrisma.reserva.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          sedeId: SEDE,
          estado: ReservaEstado.Confirmada,
          fecha: new Date('2026-06-15'),
          updatedAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
        },
        cursor: { id: 'r-010' },
        skip: 1,
        take: 101,
      }));
    });

    it('un usuario pineado ignora el sedeId del query', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      await service.listar({ sedeId: OTRA_SEDE }, SEDE);
      expect(mockPrisma.reserva.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE }) }),
      );
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.listar({}, null)).rejects.toThrow('Indica la sede');
    });

    it('el admin general con sede en el query queda scopeado a esa sede', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      await service.listar({ sedeId: OTRA_SEDE }, null);
      expect(mockPrisma.reserva.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: OTRA_SEDE }) }),
      );
    });
  });

  describe('crear', () => {
    it('debe crear una reserva y publicar evento', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.reserva.create.mockResolvedValue(reservaBase);

      const result = await service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan Perez',
        clienteTelefono: '999888777',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      }, null, SEDE);

      expect(result.message).toBe('Reserva creada');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          routingKey: RoutingKeys.ReservaCreada,
          status: 'PENDING',
        }) as unknown,
      });
    });

    it('asigna un correlativo atómico ("R0000001") tomado de secuenciaReserva de la sede', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.secuenciaReserva.upsert.mockResolvedValue({ sedeId: SEDE, ultimo: 4 });
      mockPrisma.reserva.create.mockImplementation((args: any) => Promise.resolve({ ...reservaBase, ...args.data }));

      const result = await service.crear({
        clienteId: 'c-001', clienteNombre: 'Juan Perez', fecha: fechaFutura, hora: '19:00', mesaPreferida: 'mesa-005',
      }, null, SEDE);

      expect(mockPrisma.secuenciaReserva.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sedeId: SEDE } }),
      );
      expect(mockPrisma.reserva.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ correlativo: 'R0000004' }) }),
      );
      expect(result.reserva.correlativo).toBe('R0000004');
    });

    it('debe guardar el usuario que registró la reserva', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.reserva.create.mockResolvedValue({
        ...reservaBase,
        usuarioId: 'u-recepcion',
        usuarioNombre: 'Recepción Uno',
      });

      await service.crear(
        {
          clienteId: 'c-001',
          clienteNombre: 'Juan Perez',
          clienteTelefono: '999888777',
          fecha: fechaFutura,
          hora: '19:00',
          mesaPreferida: 'mesa-005',
          numComensales: 4,
        },
        { id: 'u-recepcion', nombre: 'Recepción Uno' },
        SEDE,
      );

      expect(mockPrisma.reserva.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sedeId: SEDE,
            usuarioId: 'u-recepcion',
            usuarioNombre: 'Recepción Uno',
          }),
        }),
      );
    });

    it('guarda usuarioId/usuarioNombre como null cuando no hay usuario autenticado', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.reserva.create.mockResolvedValue(reservaBase);

      await service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan Perez',
        clienteTelefono: '999888777',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      }, null, SEDE);

      expect(mockPrisma.reserva.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            usuarioId: null,
            usuarioNombre: null,
          }),
        }),
      );
    });

    it('debe permitir crear en la misma franja si la mesa es distinta', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([{ ...reservaBase, mesaPreferida: 'mesa-004' }]);
      mockPrisma.reserva.create.mockResolvedValue(reservaBase);

      const result = await service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      }, null, SEDE);

      expect(result.message).toBe('Reserva creada');
    });

    it('debe lanzar ConflictException si la mesa ya esta reservada en la franja', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([{ ...reservaBase, mesaPreferida: 'mesa-005' }]);
      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      }, null, SEDE)).rejects.toThrow('La mesa ya está reservada');
    });

    it('debe lanzar BadRequestException si la fecha ya pasó', async () => {
      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: '2020-01-01',
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      }, null, SEDE)).rejects.toThrow('ya pasó');
    });

    it('bug: acepta una hora todavía futura en Perú aunque en UTC (zona del contenedor) ya "pasó"', async () => {
      // 2026-08-13T23:00:00Z = 2026-08-13 18:00 hora Perú (UTC-5, sin horario
      // de verano). Reservar a las 20:00 hora Perú (2h después) debe aceptarse
      // — con el bug viejo, "20:00" se interpretaba como 20:00 UTC, que ya
      // había "pasado" respecto a las 23:00 UTC actuales.
      jest.useFakeTimers().setSystemTime(new Date('2026-08-13T23:00:00.000Z'));
      try {
        mockPrisma.reserva.findMany.mockResolvedValue([]);
        mockPrisma.reserva.create.mockResolvedValue(reservaBase);

        const result = await service.crear({
          clienteId: 'c-001',
          clienteNombre: 'Juan',
          clienteTelefono: '999',
          fecha: '2026-08-13',
          hora: '20:00',
          mesaPreferida: 'mesa-005',
          numComensales: 4,
        }, null, SEDE);

        expect(result.message).toBe('Reserva creada');
      } finally {
        jest.useRealTimers();
      }
    });

    it('debe lanzar BadRequestException si no se selecciona mesa', async () => {
      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: ' ',
        numComensales: 4,
      }, null, SEDE)).rejects.toThrow('Selecciona una mesa');
    });

    it('debe traducir la carrera de unicidad a ConflictException', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.reserva.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      }, null, SEDE)).rejects.toThrow('La mesa ya está reservada');
    });

    it('re-lanza errores que no son de unicidad', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.$transaction.mockRejectedValue(new Error('db timeout'));

      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      }, null, SEDE)).rejects.toThrow('db timeout');
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      }, null, null)).rejects.toThrow('Indica la sede');
    });
  });

  describe('consultarDisponibilidad', () => {
    it('retorna disponibilidad para una mesa concreta', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([{ ...reservaBase, mesaPreferida: 'mesa-004' }]);

      const result = await service.consultarDisponibilidad('2026-06-15', '19:00', 'mesa-005', SEDE);

      expect(result).toEqual({
        fecha: '2026-06-15',
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        mesasReservadas: ['mesa-004'],
        disponible: true,
        capacidadRestante: 1,
      });
    });

    it('marca la mesa como no disponible cuando ya esta reservada', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([{ ...reservaBase, mesaPreferida: 'mesa-005' }]);

      const result = await service.consultarDisponibilidad('2026-06-15', '19:00', 'mesa-005', SEDE);

      expect(result.disponible).toBe(false);
      expect(result.capacidadRestante).toBe(0);
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.consultarDisponibilidad('2026-06-15', '19:00', 'mesa-005', null))
        .rejects.toThrow('Indica la sede');
    });
  });

  describe('confirmar', () => {
    it('debe confirmar una reserva pendiente', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue(reservaBase);
      mockPrisma.reserva.update.mockResolvedValue({ ...reservaBase, estado: ReservaEstado.Confirmada });

      const result = await service.confirmar('r-001', SEDE);
      expect(result.reserva.estado).toBe(ReservaEstado.Confirmada);
    });

    it('debe lanzar ConflictException si ya esta confirmada', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue({ ...reservaBase, estado: ReservaEstado.Confirmada });
      await expect(service.confirmar('r-001', SEDE)).rejects.toThrow('Solo se pueden confirmar reservas pendientes');
    });

    it('un usuario pineado no puede confirmar una reserva de otra sede', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue(reservaBase);
      await expect(service.confirmar('r-001', OTRA_SEDE)).rejects.toThrow('no encontrada');
    });
  });

  describe('cancelar', () => {
    it('debe cancelar una reserva y publicar evento', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue(reservaBase);
      mockPrisma.reserva.update.mockResolvedValue({ ...reservaBase, estado: ReservaEstado.Cancelada });

      const result = await service.cancelar('r-001', 'Cliente cancelo', SEDE);
      expect(result.reserva.estado).toBe(ReservaEstado.Cancelada);
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          routingKey: RoutingKeys.ReservaCancelada,
          payload: JSON.stringify({ reservaId: 'r-001', motivo: 'Cliente cancelo' }),
          status: 'PENDING',
        }) as unknown,
      });
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue(null);
      await expect(service.cancelar('inexistente', undefined, SEDE)).rejects.toThrow('no encontrada');
    });

    it('un usuario pineado no puede cancelar una reserva de otra sede', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue(reservaBase);
      await expect(service.cancelar('r-001', undefined, OTRA_SEDE)).rejects.toThrow('no encontrada');
    });
  });
});
