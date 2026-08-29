import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CrearReservaCommand,
  ListarReservasQuery,
  ReservaCreadaPayload,
  ReservaCanceladaPayload,
  ReservaEstado,
  ReservaListResponse,
  ReservaDisponibilidadResponse,
  RoutingKeys,
} from '@org/contracts';
import { OperableLog } from '@org/observabilidad';
import { resolveSedeId } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { toReservaDto } from './reservas.mapper';
import { Prisma, Reserva } from '../generated/prisma';

@Injectable()
export class ReservasService {
  private readonly logger = new Logger(ReservasService.name);
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async listar(
    query: ListarReservasQuery = {},
    usuarioSedeId?: string | null,
  ): Promise<ReservaListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const limit = this.normalizeLimit(query.limit);
    const reservas = await this.prisma.reserva.findMany({
      where: {
        sedeId,
        ...(query.estado ? { estado: query.estado } : {}),
        ...(query.fecha ? { fecha: new Date(query.fecha) } : {}),
        ...(query.updatedSince
          ? { updatedAt: { gte: new Date(query.updatedSince) } }
          : {}),
        ...(query.search
          ? { correlativo: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }, { id: 'asc' }],
    });

    const hasMore = reservas.length > limit;
    const data = reservas.slice(0, limit);

    return {
      data: data.map(toReservaDto),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  private async siguienteCorrelativo(prisma: Prisma.TransactionClient, sedeId: string): Promise<string> {
    const secuencia = await prisma.secuenciaReserva.upsert({
      where: { sedeId },
      create: { sedeId, ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    return `R${String(secuencia.ultimo).padStart(7, '0')}`;
  }

  async crear(
    command: CrearReservaCommand,
    usuario?: { id: string; nombre: string } | null,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ) {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const clienteNombre = command.clienteNombre ?? 'Sin nombre';
    const numComensales = command.numComensales ?? 2;
    const mesaPreferida = command.mesaPreferida?.trim();

    if (!mesaPreferida) {
      throw new BadRequestException('Selecciona una mesa para crear la reserva');
    }

    this.assertFechaFutura(command.fecha, command.hora);

    await this.assertMesaDisponible(command.fecha, command.hora, sedeId, mesaPreferida);

    let reserva: Reserva;
    try {
      // M2.A: crear reserva + outbox en la misma transacción
      reserva = await this.prisma.$transaction(async (prisma) => {
        const correlativo = await this.siguienteCorrelativo(prisma, sedeId);
        const r = await prisma.reserva.create({
          data: {
            sedeId,
            clienteId: command.clienteId ?? null,
            clienteNombre,
            clienteTelefono: command.clienteTelefono ?? null,
            fecha: new Date(command.fecha),
            hora: command.hora,
            mesaPreferida,
            numComensales,
            estado: ReservaEstado.Pendiente,
            usuarioId: usuario?.id ?? null,
            usuarioNombre: usuario?.nombre ?? null,
            correlativo,
          },
        });

        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.ReservaCreada,
            payload: JSON.stringify({ reserva: toReservaDto(r) } satisfies ReservaCreadaPayload),
            status: 'PENDING',
          },
        });

        return r;
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('La mesa ya está reservada para la fecha y hora solicitadas');
      }
      throw error;
    }

    const dto = toReservaDto(reserva);
    this.logger.log({
      operation: 'crear',
      aggregateId: reserva.id,
      resultingState: ReservaEstado.Pendiente,
      message: `Reserva creada para ${clienteNombre} (mesa ${mesaPreferida}, ${command.fecha} ${command.hora}).`,
    } satisfies OperableLog);
    return { message: 'Reserva creada', reserva: dto };
  }

  async confirmar(id: string, usuarioSedeId?: string | null) {
    const reserva = await this.findOrThrow(id, usuarioSedeId);
    if (reserva.estado !== ReservaEstado.Pendiente) {
      throw new ConflictException('Solo se pueden confirmar reservas pendientes');
    }

    const updated = await this.prisma.reserva.update({
      where: { id },
      data: { estado: ReservaEstado.Confirmada },
    });

    this.logger.log({
      operation: 'confirmar',
      aggregateId: id,
      resultingState: ReservaEstado.Confirmada,
      message: 'Reserva confirmada.',
    } satisfies OperableLog);
    return { message: 'Reserva confirmada', reserva: toReservaDto(updated) };
  }

  async cancelar(id: string, motivo?: string, usuarioSedeId?: string | null) {
    await this.findOrThrow(id, usuarioSedeId);

    // M2.A: cancelar reserva + outbox en la misma transacción
    const updated = await this.prisma.$transaction(async (prisma) => {
      const r = await prisma.reserva.update({
        where: { id },
        data: { estado: ReservaEstado.Cancelada },
      });

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.ReservaCancelada,
          payload: JSON.stringify({ reservaId: id, motivo } satisfies ReservaCanceladaPayload),
          status: 'PENDING',
        },
      });

      return r;
    });

    this.logger.log({
      operation: 'cancelar',
      aggregateId: id,
      resultingState: ReservaEstado.Cancelada,
      message: `Reserva cancelada${motivo ? ` (motivo: ${motivo})` : ''}.`,
    } satisfies OperableLog);
    return { message: 'Reserva cancelada', reserva: toReservaDto(updated) };
  }

  async consultarDisponibilidad(
    fecha: string,
    hora: string,
    mesaPreferida?: string,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ): Promise<ReservaDisponibilidadResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    return this.disponibilidadEnSede(fecha, hora, sedeId, mesaPreferida);
  }

  private async disponibilidadEnSede(
    fecha: string,
    hora: string,
    sedeId: string,
    mesaPreferida?: string,
  ): Promise<ReservaDisponibilidadResponse> {
    const mesa = mesaPreferida?.trim();
    const reservasActivas = await this.prisma.reserva.findMany({
      where: {
        sedeId,
        fecha: new Date(fecha),
        hora,
        estado: { in: [ReservaEstado.Pendiente, ReservaEstado.Confirmada] },
      },
      select: { mesaPreferida: true },
    });
    const mesasReservadas = reservasActivas
      .map((reserva) => reserva.mesaPreferida)
      .filter((mesaReservada): mesaReservada is string => Boolean(mesaReservada));
    const mesaOcupada = mesa ? mesasReservadas.includes(mesa) : false;

    return {
      fecha,
      hora,
      ...(mesa ? { mesaPreferida: mesa } : {}),
      mesasReservadas,
      disponible: !mesaOcupada,
      capacidadRestante: mesaOcupada ? 0 : 1,
    };
  }

  private async assertMesaDisponible(fecha: string, hora: string, sedeId: string, mesaPreferida: string): Promise<void> {
    const { disponible } = await this.disponibilidadEnSede(fecha, hora, sedeId, mesaPreferida);
    if (!disponible) {
      throw new ConflictException('La mesa ya está reservada para la fecha y hora solicitadas');
    }
  }

  // Rechaza reservas cuyo instante (fecha + hora) ya pasó: no tiene sentido
  // reservar en el pasado y hasta ahora el backend las aceptaba en silencio.
  //
  // Bug (2026-08-13): `new Date(`${fecha}T${hora}`)` sin offset se interpreta
  // en la zona horaria del PROCESO (UTC en el contenedor), no en la del
  // negocio (Perú, America/Lima) — una reserva a horas todavía futuras en
  // hora peruana se rechazaba como "ya pasada" porque UTC va ~5h adelantado.
  // Perú no tiene horario de verano (UTC-5 fijo todo el año), así que basta
  // con fijar el offset explícito al construir el instante.
  private assertFechaFutura(fecha: string, hora: string): void {
    const horaConSegundos = hora.length === 5 ? `${hora}:00` : hora;
    const cuando = new Date(`${fecha}T${horaConSegundos}-05:00`);
    if (Number.isNaN(cuando.getTime())) {
      throw new BadRequestException('Fecha u hora de reserva inválida');
    }
    if (cuando.getTime() <= Date.now()) {
      throw new BadRequestException('No se puede reservar en una fecha u hora que ya pasó');
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }

  private async findOrThrow(id: string, usuarioSedeId?: string | null) {
    const reserva = await this.prisma.reserva.findUnique({ where: { id } });
    if (!reserva || (usuarioSedeId && reserva.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    }
    return reserva;
  }
}
