// types/reserva.types.ts - DTOs y ViewModels de reservas

import type {
  CrearReservaCommand,
  ListarReservasQuery,
  ReservaDto as ContractReservaDto,
  ReservaEstado as ContractReservaEstado,
  ReservaListResponse as ContractReservaListResponse,
} from '@org/contracts';

export const ReservaEstado = {
  Pendiente: 'PENDIENTE',
  Confirmada: 'CONFIRMADA',
  Cancelada: 'CANCELADA',
  Expirada: 'EXPIRADA',
} as const satisfies Record<string, ContractReservaEstado>;

export type ReservaEstado = ContractReservaEstado;

export type ReservaDto = ContractReservaDto;
export type ReservaListQuery = ListarReservasQuery;
export type ReservaListResponse = ContractReservaListResponse;

export interface ReservaVM {
  id: string;
  clienteNombre: string;
  clienteTelefono: string;
  fecha: string;
  hora: string;
  mesaPreferida: string | null;
  numComensales: number;
  estado: ReservaEstado;
  estadoLabel: string;
  estadoClass: string;
  fechaHoraLabel: string;
  usuarioNombre?: string;
  createdAt: string;
  /** Código legible ("R0000001"). Ausente en reservas anteriores a este campo. */
  correlativo?: string;
}

export type CrearReservaPayload = CrearReservaCommand & { clienteNombre: string };

export interface ReservaResponse {
  message: string;
  reserva: ReservaDto;
}

export interface DisponibilidadResponse {
  fecha: string;
  hora: string;
  mesaPreferida?: string;
  mesasReservadas: string[];
  disponible: boolean;
  capacidadRestante: number;
}
