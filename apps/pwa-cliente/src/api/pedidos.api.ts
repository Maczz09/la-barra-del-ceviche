// api/pedidos.api.ts — Llamadas al servicio de pedidos

import { client } from './client';
import { unwrapArray, unwrapEntity } from './response';
import type {
  PedidoDto,
  PedidoListQuery,
  PedidoListResponse,
  CrearPedidoPayload,
  ActualizarEstadoPedidoPayload,
  ActualizarEstadoItemPayload,
  AnularItemPreparadoPayload,
  AnularAtencionMesaPayload,
  AnularAtencionMesaResultado,
  AnularPedidoPayload,
  AnulacionAuditoriaDto,
  ListarAnulacionesPayload,
  ActualizarAnulacionPayload,
  InvalidarAnulacionPayload,
} from '../types/pedido.types';

function buildListQuery(query: PedidoListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.mesaId) params.set('mesaId', query.mesaId);
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.estado) params.set('estado', query.estado);
  if (query.updatedSince) params.set('updatedSince', query.updatedSince);
  if (query.search) params.set('search', query.search);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

/** GET /pedidos — Listar pedidos (opcionalmente filtrados por mesaId) */
export async function getPage(
  query: PedidoListQuery = {},
): Promise<PedidoListResponse> {
  const response = await client.get<
    PedidoListResponse | PedidoDto[] | { pedidos: PedidoDto[] }
  >(`/pedidos${buildListQuery(query)}`);

  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray(response.data)
  ) {
    return response;
  }

  return {
    data: unwrapArray<PedidoDto>(response, 'pedidos'),
    nextCursor: null,
  };
}

/** GET /pedidos — Compatibilidad para pantallas que aun consumen array plano */
export async function getAll(mesaId?: string): Promise<PedidoDto[]> {
  const response = await getPage({ mesaId, limit: 50 });
  return response.data;
}

/** POST /pedidos — Crear un nuevo pedido */
export async function crear(payload: CrearPedidoPayload): Promise<PedidoDto> {
  const response = await client.post<PedidoDto | { pedido: PedidoDto }>('/pedidos', payload);
  return unwrapEntity<PedidoDto>(response, 'pedido');
}

/** PATCH /pedidos/:id/estado — Avanzar estado del pedido */
export async function avanzarEstado(
  id: string,
  payload: ActualizarEstadoPedidoPayload,
): Promise<PedidoDto> {
  const response = await client.patch<PedidoDto | { pedido: PedidoDto }>(
    `/pedidos/${id}/estado`,
    payload,
  );
  return unwrapEntity<PedidoDto>(response, 'pedido');
}

/** PATCH /pedidos/items/:itemId/estado — Avanzar estado de un ítem individual */
export function avanzarItem(itemId: string, payload: ActualizarEstadoItemPayload): Promise<void> {
  return client.patch<void>(`/pedidos/items/${itemId}/estado`, payload);
}

// ─── CU-01: anular ítem ya preparado/servido (cobrar o no) ────────────────

export async function anularItemPreparado(itemId: string, payload: AnularItemPreparadoPayload): Promise<PedidoDto> {
  const response = await client.post<PedidoDto | { pedido: PedidoDto }>(
    `/pedidos/items/${itemId}/anular-preparado`,
    payload,
  );
  return unwrapEntity<PedidoDto>(response, 'pedido');
}

// ─── CU-02: anular la atención completa de una mesa ───────────────────────

export async function anularAtencionMesa(mesaId: string, payload: AnularAtencionMesaPayload): Promise<AnularAtencionMesaResultado> {
  const response = await client.post<AnularAtencionMesaResultado | { resultado: AnularAtencionMesaResultado }>(
    `/pedidos/mesas/${mesaId}/anular-atencion`,
    payload,
  );
  return unwrapEntity<AnularAtencionMesaResultado>(response, 'resultado');
}

// Anular UN pedido puntual desde el tablero de Pedidos (no toda la mesa) —
// salvavidas operativo para pedidos atascados/duplicados/con error.
export async function anularPedido(pedidoId: string, payload: AnularPedidoPayload): Promise<PedidoDto> {
  const response = await client.post<PedidoDto | { pedido: PedidoDto }>(
    `/pedidos/${pedidoId}/anular`,
    payload,
  );
  return unwrapEntity<PedidoDto>(response, 'pedido');
}

// ─── CU-05: Auditoría de Anulaciones ──────────────────────────────────────

function buildAnulacionesQuery(query: ListarAnulacionesPayload = {}): string {
  const params = new URLSearchParams();
  if (query.tipo) params.set('tipo', query.tipo);
  if (query.usuarioId) params.set('usuarioId', query.usuarioId);
  if (query.desde) params.set('desde', query.desde);
  if (query.hasta) params.set('hasta', query.hasta);
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getAnulaciones(query: ListarAnulacionesPayload = {}): Promise<AnulacionAuditoriaDto[]> {
  const response = await client.get<{ anulaciones: AnulacionAuditoriaDto[] } | AnulacionAuditoriaDto[]>(
    `/pedidos/anulaciones${buildAnulacionesQuery(query)}`,
  );
  return unwrapArray<AnulacionAuditoriaDto>(response, 'anulaciones');
}

export async function actualizarAnulacion(id: string, payload: ActualizarAnulacionPayload): Promise<AnulacionAuditoriaDto> {
  const response = await client.patch<AnulacionAuditoriaDto | { anulacion: AnulacionAuditoriaDto }>(
    `/pedidos/anulaciones/${id}`,
    payload,
  );
  return unwrapEntity<AnulacionAuditoriaDto>(response, 'anulacion');
}

export async function invalidarAnulacion(id: string, payload: InvalidarAnulacionPayload): Promise<AnulacionAuditoriaDto> {
  const response = await client.post<AnulacionAuditoriaDto | { anulacion: AnulacionAuditoriaDto }>(
    `/pedidos/anulaciones/${id}/invalidar`,
    payload,
  );
  return unwrapEntity<AnulacionAuditoriaDto>(response, 'anulacion');
}
