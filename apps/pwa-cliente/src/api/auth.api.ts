// api/auth.api.ts — Llamadas de autenticación

import { client, getAuthToken, refreshAccessToken, setAuthToken } from './client';
import type {
  LoginRequest,
  LoginResponseDto,
  UserDto,
} from '../types/auth.types';

/** POST /identidad/auth/login — Login con email + password */
export async function login(req: LoginRequest): Promise<UserDto> {
  const response = await client.post<LoginResponseDto | UserDto>(
    '/identidad/auth/login',
    req,
  );
  if ('usuario' in response) {
    setAuthToken(response.access_token);
    return response.usuario;
  }
  return response;
}

/** GET /identidad/auth/me — Restaurar sesión activa */
export async function me(): Promise<UserDto> {
  // El access token vive solo en memoria. Tras cerrar/reabrir la PWA queda la
  // cookie de refresh, pero no el Bearer que exigen los demás microservicios.
  // Lo reconstruimos antes de restaurar el perfil para que la primera pantalla
  // protegida no dispare una ráfaga de 401 al cargar sus widgets.
  if (!getAuthToken()) {
    await refreshAccessToken();
  }
  return client.get<UserDto>('/identidad/auth/me');
}

/** Logout — limpieza local y en el backend */
export function logout(): Promise<{ success: boolean; message: string }> {
  return client.post<{ success: boolean; message: string }>(
    '/identidad/auth/logout',
  );
}
