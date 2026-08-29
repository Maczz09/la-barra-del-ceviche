import { client } from './client';
import { unwrapEntity } from './response';
import type {
  CambiarRolPayload,
  CambiarEstadoPayload,
  CrearUsuarioPayload,
  ActualizarUsuarioPayload,
  CambiarPasswordUsuarioPayload,
  UsuarioDto,
  ListarUsuariosQuery,
  UsuarioListResponse,
} from '../types/usuario.types';

export async function getPage(query: ListarUsuariosQuery = {}): Promise<UsuarioListResponse> {
  const params = new URLSearchParams();
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.rol) params.set('rol', query.rol);
  if (query.search) params.set('search', query.search);
  if (query.updatedSince) params.set('updatedSince', query.updatedSince);

  const response = await client.get<UsuarioListResponse>(`/identidad/usuarios?${params.toString()}`);
  return response;
}

export async function getAll(): Promise<UsuarioDto[]> {
  const response = await getPage({ limit: 100 });
  return response.data;
}

export async function crear(payload: CrearUsuarioPayload): Promise<UsuarioDto> {
  const response = await client.post<UsuarioDto | { usuario: UsuarioDto }>('/identidad/usuarios', payload);
  return unwrapEntity<UsuarioDto>(response, 'usuario');
}

export async function cambiarRol(id: string, payload: CambiarRolPayload): Promise<UsuarioDto> {
  const response = await client.patch<UsuarioDto | { usuario: UsuarioDto }>(
    `/identidad/usuarios/${id}/rol`,
    payload,
  );
  return unwrapEntity<UsuarioDto>(response, 'usuario');
}

export async function cambiarEstado(id: string, payload: CambiarEstadoPayload): Promise<UsuarioDto> {
  const response = await client.patch<UsuarioDto | { usuario: UsuarioDto }>(
    `/identidad/usuarios/${id}/estado`,
    payload,
  );
  return unwrapEntity<UsuarioDto>(response, 'usuario');
}

export async function actualizar(id: string, payload: ActualizarUsuarioPayload): Promise<UsuarioDto> {
  const response = await client.patch<UsuarioDto | { usuario: UsuarioDto }>(
    `/identidad/usuarios/${id}`,
    payload,
  );
  return unwrapEntity<UsuarioDto>(response, 'usuario');
}

export async function cambiarPassword(id: string, payload: CambiarPasswordUsuarioPayload): Promise<UsuarioDto> {
  const response = await client.patch<UsuarioDto | { usuario: UsuarioDto }>(
    `/identidad/usuarios/${id}/password`,
    payload,
  );
  return unwrapEntity<UsuarioDto>(response, 'usuario');
}
