// api/cartaPublica.api.ts — Carta pública/QR (T-XX: sin auth, sin sedeId
// pineado — sedeId siempre va explícito por query, nunca por el allowlist
// de client.ts que resuelve la sede del usuario logueado).

import { client } from './client';
import type { SedePublicaDto, CartaPublicaResponse } from '../types/cartaPublica.types';

export async function obtenerSedePublica(sedeId: string): Promise<SedePublicaDto | null> {
  const response = await client.get<{ sede: SedePublicaDto | null }>(
    `/identidad/sedes/publica?sedeId=${encodeURIComponent(sedeId)}`,
  );
  return response.sede;
}

export async function obtenerCartaPublica(sedeId: string): Promise<CartaPublicaResponse> {
  return client.get<CartaPublicaResponse>(`/inventario/carta-publica?sedeId=${encodeURIComponent(sedeId)}`);
}
