// api/reservas.api.ts - Llamadas al servicio de reservas

import { client } from './client';
import { unwrapArray, unwrapEntity } from './response';
import type {
  CrearReservaPayload,
  DisponibilidadResponse,
  ReservaDto,
  ReservaListQuery,
  ReservaListResponse,
  ReservaResponse,
} from '../types/reserva.types';

interface ReservasListResponse {
  reservas: ReservaDto[];
}

function buildListQuery(query: ReservaListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.estado) params.set('estado', query.estado);
  if (query.fecha) params.set('fecha', query.fecha);
  if (query.updatedSince) params.set('updatedSince', query.updatedSince);
  if (query.search) params.set('search', query.search);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getPage(
  query: ReservaListQuery = {},
): Promise<ReservaListResponse> {
  const response = await client.get<
    ReservaListResponse | ReservasListResponse | ReservaDto[]
  >(`/reservas${buildListQuery(query)}`);

  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray(response.data)
  ) {
    return response;
  }

  return {
    data: unwrapArray<ReservaDto>(response, 'reservas'),
    nextCursor: null,
  };
}

export async function getAll(): Promise<ReservaDto[]> {
  const response = await getPage({ limit: 50 });
  return response.data;
}

export async function crear(payload: CrearReservaPayload): Promise<ReservaDto> {
  const response = await client.post<ReservaResponse | ReservaDto>('/reservas', payload);
  return unwrapEntity<ReservaDto>(response, 'reserva');
}

export async function confirmar(id: string): Promise<ReservaDto> {
  const response = await client.patch<ReservaResponse | ReservaDto>(`/reservas/${id}/confirmar`);
  return unwrapEntity<ReservaDto>(response, 'reserva');
}

export async function cancelar(id: string, motivo?: string): Promise<ReservaDto> {
  const query = motivo ? `?${new URLSearchParams({ motivo }).toString()}` : '';
  const response = await client.delete<ReservaResponse | ReservaDto>(`/reservas/${id}${query}`);
  return unwrapEntity<ReservaDto>(response, 'reserva');
}

export function disponibilidad(
  fecha: string,
  hora: string,
  mesaPreferida?: string,
): Promise<DisponibilidadResponse> {
  const query = new URLSearchParams({
    fecha,
    hora,
    ...(mesaPreferida ? { mesaPreferida } : {}),
  }).toString();
  return client.get<DisponibilidadResponse>(`/reservas/disponibilidad?${query}`);
}
