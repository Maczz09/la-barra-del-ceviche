// hooks/queries/useFacturacionQuery.ts — Emisión de boletas/facturas SUNAT
//
// /facturacion no está en el allowlist de sede de client.ts (a propósito,
// mismo criterio que /reportes) — la sede del admin general se resuelve acá
// con useSedeActualQuery() y se pasa explícita a cada llamada.

import { useQuery, useMutation } from '@tanstack/react-query';
import * as facturacionApi from '../../api/facturacion.api';
import { useSedeActualQuery } from './useSedesQuery';
import { queryClient } from '../../api/queryClient';
import { primerMensaje } from '../../utils/feedback';
import type { ComprobantePagoDto, EmitirComprobantePayload, EmitirNotaPayload, NotaDto, CrearEmpresaPayload, ActualizarEmpresaPayload } from '../../types/facturacion.types';

const ESTADOS_PENDIENTES = new Set(['FIRMADO', 'ENVIADO']);

// Mientras algún comprobante emitido siga esperando el veredicto de SUNAT
// (el envío real lo hace un cron cada 30s en servicio-facturacion), se
// refresca solo cada 8s; en cuanto todo quedó ACEPTADO/RECHAZADO/OBSERVADO,
// deja de pedir de más.
function refetchMientrasPendiente(query: { state: { data?: unknown } }): number | false {
  const data = query.state.data as ComprobantePagoDto[] | undefined;
  const pendiente = data?.some((c) => c.comprobante && ESTADOS_PENDIENTES.has(c.comprobante.estado));
  return pendiente ? 8000 : false;
}

// Igual que arriba, pero las notas son Comprobante directo (sin anidar bajo
// .comprobante) — mismo polling mientras alguna siga sin veredicto de SUNAT.
function refetchNotasMientrasPendiente(query: { state: { data?: unknown } }): number | false {
  const data = query.state.data as NotaDto[] | undefined;
  const pendiente = data?.some((n) => ESTADOS_PENDIENTES.has(n.estado));
  return pendiente ? 8000 : false;
}

export function useFacturacionQuery() {
  const { sede } = useSedeActualQuery();
  const sedeId = sede?.id;

  const disponiblesQuery = useQuery({
    queryKey: ['facturacion', 'disponibles', sedeId],
    queryFn: () => facturacionApi.listarDisponibles(sedeId),
  });

  const todosQuery = useQuery({
    queryKey: ['facturacion', 'todos', sedeId],
    queryFn: () => facturacionApi.listarTodos(sedeId),
    refetchInterval: refetchMientrasPendiente,
  });

  const empresasQuery = useQuery({
    queryKey: ['facturacion', 'empresas'],
    queryFn: () => facturacionApi.listarEmpresas(),
    staleTime: 1000 * 60 * 10,
  });

  const notasQuery = useQuery({
    queryKey: ['facturacion', 'notas', sedeId],
    queryFn: () => facturacionApi.listarNotas(sedeId),
    refetchInterval: refetchNotasMientrasPendiente,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['facturacion'], exact: false, refetchType: 'active' });

  const mutationEmitir = useMutation({
    mutationFn: ({ cuentaId, payload }: { cuentaId: string; payload: EmitirComprobantePayload }) =>
      facturacionApi.emitir(cuentaId, payload),
    onSuccess: invalidate,
  });

  const mutationCrearEmpresa = useMutation({
    mutationFn: (payload: CrearEmpresaPayload) => facturacionApi.crearEmpresa(payload),
    onSuccess: invalidate,
  });

  const mutationActualizarEmpresa = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActualizarEmpresaPayload }) =>
      facturacionApi.actualizarEmpresa(id, payload),
    onSuccess: invalidate,
  });

  const mutationCambiarEstadoEmpresa = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      facturacionApi.cambiarEstadoEmpresa(id, activo),
    onSuccess: invalidate,
  });

  const mutationNotaCredito = useMutation({
    mutationFn: ({ comprobanteId, payload }: { comprobanteId: string; payload: EmitirNotaPayload }) =>
      facturacionApi.emitirNotaCredito(comprobanteId, payload),
    onSuccess: invalidate,
  });

  const mutationNotaDebito = useMutation({
    mutationFn: ({ comprobanteId, payload }: { comprobanteId: string; payload: EmitirNotaPayload }) =>
      facturacionApi.emitirNotaDebito(comprobanteId, payload),
    onSuccess: invalidate,
  });

  return {
    disponibles: disponiblesQuery.data ?? [],
    emitidos: (todosQuery.data ?? []).filter((c) => c.estado === 'EMITIDO'),
    notas: notasQuery.data ?? [],
    notasLoading: notasQuery.isLoading,
    empresas: empresasQuery.data ?? [],
    empresasLoading: empresasQuery.isLoading,
    loading: disponiblesQuery.isLoading || todosQuery.isLoading,
    emitiendo: mutationEmitir.isPending,
    configurandoEmpresa: mutationCrearEmpresa.isPending,
    actualizandoEmpresa: mutationActualizarEmpresa.isPending || mutationCambiarEstadoEmpresa.isPending,
    error: disponiblesQuery.error?.message ?? todosQuery.error?.message ?? mutationEmitir.error?.message ?? null,
    errorEmpresa: mutationCrearEmpresa.error?.message ?? null,
    errorActualizarEmpresa: mutationActualizarEmpresa.error?.message ?? null,
    success: primerMensaje([mutationEmitir.isSuccess, 'Comprobante firmado — enviándose a SUNAT.']),
    fetch: () => {
      void disponiblesQuery.refetch();
      void todosQuery.refetch();
      void notasQuery.refetch();
    },
    emitirComprobante: async (cuentaId: string, payload: EmitirComprobantePayload) => {
      await mutationEmitir.mutateAsync({ cuentaId, payload });
    },
    crearEmpresa: async (payload: CrearEmpresaPayload) => {
      return mutationCrearEmpresa.mutateAsync(payload);
    },
    actualizarEmpresa: async (id: string, payload: ActualizarEmpresaPayload) => {
      return mutationActualizarEmpresa.mutateAsync({ id, payload });
    },
    cambiarEstadoEmpresa: async (id: string, activo: boolean) => {
      return mutationCambiarEstadoEmpresa.mutateAsync({ id, activo });
    },
    emitiendoNota: mutationNotaCredito.isPending || mutationNotaDebito.isPending,
    errorNota: mutationNotaCredito.error?.message ?? mutationNotaDebito.error?.message ?? null,
    emitirNotaCredito: async (comprobanteId: string, payload: EmitirNotaPayload) => {
      return mutationNotaCredito.mutateAsync({ comprobanteId, payload });
    },
    emitirNotaDebito: async (comprobanteId: string, payload: EmitirNotaPayload) => {
      return mutationNotaDebito.mutateAsync({ comprobanteId, payload });
    },
    clearFeedbackNota: () => { mutationNotaCredito.reset(); mutationNotaDebito.reset(); },
    clearFeedback: () => mutationEmitir.reset(),
    clearFeedbackEmpresa: () => mutationCrearEmpresa.reset(),
    clearFeedbackActualizarEmpresa: () => {
      mutationActualizarEmpresa.reset();
      mutationCambiarEstadoEmpresa.reset();
    },
  };
}
