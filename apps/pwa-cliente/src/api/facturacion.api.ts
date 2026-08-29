// api/facturacion.api.ts — Emisión de boletas/facturas electrónicas (SUNAT)

import { client } from './client';
import type {
  ComprobantePagoDto,
  EmpresaDto,
  EmitirComprobantePayload,
  EmitirComprobanteResultado,
  EmitirNotaPayload,
  EmitirNotaResultado,
  NotaDto,
  CrearEmpresaPayload,
  ActualizarEmpresaPayload,
} from '../types/facturacion.types';

export async function listarDisponibles(sedeId?: string): Promise<ComprobantePagoDto[]> {
  const qs = sedeId ? `?sedeId=${encodeURIComponent(sedeId)}` : '';
  const response = await client.get<ComprobantePagoDto[]>(`/facturacion/comprobantes-pago${qs}`);
  return Array.isArray(response) ? response : [];
}

export async function listarTodos(sedeId?: string): Promise<ComprobantePagoDto[]> {
  const qs = sedeId ? `?sedeId=${encodeURIComponent(sedeId)}` : '';
  const response = await client.get<ComprobantePagoDto[]>(`/facturacion/comprobantes-pago/todos${qs}`);
  return Array.isArray(response) ? response : [];
}

export async function listarEmpresas(): Promise<EmpresaDto[]> {
  const response = await client.get<EmpresaDto[]>('/facturacion/empresas');
  return Array.isArray(response) ? response : [];
}

export async function emitir(cuentaId: string, payload: EmitirComprobantePayload): Promise<EmitirComprobanteResultado> {
  return client.post<EmitirComprobanteResultado>(`/facturacion/comprobantes/${cuentaId}/emitir`, payload);
}

export async function listarNotas(sedeId?: string): Promise<NotaDto[]> {
  const qs = sedeId ? `?sedeId=${encodeURIComponent(sedeId)}` : '';
  const response = await client.get<NotaDto[]>(`/facturacion/notas${qs}`);
  return Array.isArray(response) ? response : [];
}

export function emitirNotaCredito(comprobanteId: string, payload: EmitirNotaPayload): Promise<EmitirNotaResultado> {
  return client.post<EmitirNotaResultado>(`/facturacion/comprobantes/${comprobanteId}/nota-credito`, payload);
}

export function emitirNotaDebito(comprobanteId: string, payload: EmitirNotaPayload): Promise<EmitirNotaResultado> {
  return client.post<EmitirNotaResultado>(`/facturacion/comprobantes/${comprobanteId}/nota-debito`, payload);
}

export function crearEmpresa(payload: CrearEmpresaPayload): Promise<EmpresaDto> {
  const form = new FormData();
  form.append('ruc', payload.ruc);
  form.append('razonSocial', payload.razonSocial);
  if (payload.sedeId) form.append('sedeId', payload.sedeId);
  if (payload.nombreComercial) form.append('nombreComercial', payload.nombreComercial);
  if (payload.direccion) form.append('direccion', payload.direccion);
  if (payload.ubigeo) form.append('ubigeo', payload.ubigeo);
  if (payload.codigoEstablecimiento) form.append('codigoEstablecimiento', payload.codigoEstablecimiento);
  form.append('solUsuario', payload.solUsuario);
  form.append('solClave', payload.solClave);
  form.append('certificadoPass', payload.certificadoPass);
  form.append('certificado', payload.certificado, payload.certificado.name);
  return client.postForm<EmpresaDto>('/facturacion/empresas', form);
}

export function actualizarEmpresa(id: string, payload: ActualizarEmpresaPayload): Promise<EmpresaDto> {
  const form = new FormData();
  if (payload.razonSocial !== undefined) form.append('razonSocial', payload.razonSocial);
  if (payload.sedeId !== undefined) form.append('sedeId', payload.sedeId);
  if (payload.nombreComercial !== undefined) form.append('nombreComercial', payload.nombreComercial);
  if (payload.direccion !== undefined) form.append('direccion', payload.direccion);
  if (payload.ubigeo !== undefined) form.append('ubigeo', payload.ubigeo);
  if (payload.codigoEstablecimiento !== undefined) form.append('codigoEstablecimiento', payload.codigoEstablecimiento);
  if (payload.solUsuario !== undefined) form.append('solUsuario', payload.solUsuario);
  if (payload.solClave !== undefined) form.append('solClave', payload.solClave);
  if (payload.certificadoPass !== undefined) form.append('certificadoPass', payload.certificadoPass);
  if (payload.certificado) form.append('certificado', payload.certificado, payload.certificado.name);
  return client.patchForm<EmpresaDto>(`/facturacion/empresas/${id}`, form);
}

export function cambiarEstadoEmpresa(id: string, activo: boolean): Promise<EmpresaDto> {
  return client.patch<EmpresaDto>(`/facturacion/empresas/${id}/estado`, { activo });
}
