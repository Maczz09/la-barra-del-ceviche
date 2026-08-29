import { ReservaDto, ReservaEstado } from '@org/contracts';
import { Reserva } from '../generated/prisma';

export function toReservaDto(reserva: Reserva): ReservaDto {
  return {
    id: reserva.id,
    sedeId: reserva.sedeId,
    clienteId: reserva.clienteId ?? '',
    clienteNombre: reserva.clienteNombre,
    clienteTelefono: reserva.clienteTelefono ?? '',
    fecha: reserva.fecha.toISOString().slice(0, 10),
    hora: reserva.hora,
    mesaPreferida: reserva.mesaPreferida,
    numComensales: reserva.numComensales,
    estado: reserva.estado as ReservaEstado,
    usuarioId: reserva.usuarioId ?? undefined,
    usuarioNombre: reserva.usuarioNombre ?? undefined,
    correlativo: reserva.correlativo ?? undefined,
    createdAt: reserva.createdAt.toISOString(),
  };
}
