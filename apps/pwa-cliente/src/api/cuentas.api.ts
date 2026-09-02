// api/cuentas.api.ts - Llamadas al servicio de cuentas y caja

import { client } from './client';
import type {
  AbrirCuentaResponse,
  CerrarCuentaPayload,
  CerrarCuentaResponse,
  CuentaDto,
  DividirCuentaPayload,
  DividirCuentaResponse,
  RegistrarPagoPayload,
  RegistrarPagoCombinadoPayload,
  RegistrarPagoResponse,
} from '../types/cuenta.types';

/** GET /cuentas/:id - Obtener cuenta por ID */
export function getById(id: string): Promise<CuentaDto> {
  return client.get<CuentaDto>(`/cuentas/${id}`);
}

/** GET /cuentas/mesa/:mesaId - Obtener cuenta abierta de una mesa */
export function getByMesa(mesaId: string): Promise<CuentaDto> {
  return client.get<CuentaDto>(`/cuentas/mesa/${mesaId}`);
}

/** POST /cuentas - Abrir cuenta */
export async function abrir(mesaId: string): Promise<CuentaDto> {
  const response = await client.post<AbrirCuentaResponse>('/cuentas', { mesaId });
  return response.cuenta;
}

/** POST /cuentas/:id/cerrar - Cerrar cuenta */
export function cerrar(id: string, payload: CerrarCuentaPayload = {}): Promise<CerrarCuentaResponse> {
  return client.post<CerrarCuentaResponse>(`/cuentas/${id}/cerrar`, payload);
}

/** POST /cuentas/:id/dividir - Dividir cuenta */
export function dividir(id: string, payload: DividirCuentaPayload): Promise<DividirCuentaResponse> {
  return client.post<DividirCuentaResponse>(`/cuentas/${id}/dividir`, payload);
}

/** POST /caja/pagos - Registrar pago en caja */
export function registrarPago(payload: RegistrarPagoPayload): Promise<RegistrarPagoResponse> {
  return client.post<RegistrarPagoResponse>('/caja/pagos', payload);
}

/** POST atómico: todos los métodos se guardan o ninguno se guarda. */
export function registrarPagoCombinado(payload: RegistrarPagoCombinadoPayload): Promise<RegistrarPagoResponse> {
  return client.post<RegistrarPagoResponse>('/caja/pagos/combinado', payload);
}
