// mappers/reserva.mapper.ts - ReservaDto -> ReservaVM

import type { ReservaDto, ReservaEstado, ReservaVM } from '../types/reserva.types';

const ESTADO_LABEL: Record<ReservaEstado, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  CANCELADA: 'Cancelada',
  EXPIRADA: 'Expirada',
};

const ESTADO_CLASS: Record<ReservaEstado, string> = {
  PENDIENTE: 'badge-warn',
  CONFIRMADA: 'badge-ok',
  CANCELADA: 'badge-danger',
  EXPIRADA: 'badge-muted',
};

export function mapReserva(dto: ReservaDto): ReservaVM {
  const fechaHora = new Date(`${dto.fecha}T${dto.hora}`);

  return {
    id: dto.id,
    clienteNombre: dto.clienteNombre,
    clienteTelefono: dto.clienteTelefono,
    fecha: dto.fecha,
    hora: dto.hora,
    mesaPreferida: dto.mesaPreferida ?? null,
    numComensales: dto.numComensales,
    estado: dto.estado,
    estadoLabel: ESTADO_LABEL[dto.estado] ?? dto.estado,
    estadoClass: ESTADO_CLASS[dto.estado] ?? 'badge-muted',
    fechaHoraLabel: Number.isNaN(fechaHora.getTime())
      ? `${dto.fecha} ${dto.hora}`
      : fechaHora.toLocaleString('es-PE', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
    usuarioNombre: dto.usuarioNombre ?? undefined,
    createdAt: dto.createdAt,
    correlativo: dto.correlativo ?? undefined,
  };
}

export function mapReservas(dtos: ReservaDto[]): ReservaVM[] {
  return dtos.map(mapReserva);
}
