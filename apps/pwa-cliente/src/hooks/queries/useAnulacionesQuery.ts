// hooks/queries/useAnulacionesQuery.ts — CU-05: Auditoría de Anulaciones

import { useMutation, useQuery } from '@tanstack/react-query';
import * as pedidosApi from '../../api/pedidos.api';
import { mapAnulacionesAuditoria } from '../../mappers/pedido.mapper';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import type { ActualizarAnulacionPayload, InvalidarAnulacionPayload, ListarAnulacionesPayload } from '../../types/pedido.types';
import { primerMensaje } from '../../utils/feedback';

export const ANULACIONES_KEY = ['anulaciones'];

export function useAnulacionesQuery(query: ListarAnulacionesPayload = {}) {
  const anulacionesQuery = useQuery({
    queryKey: [...ANULACIONES_KEY, query.tipo, query.usuarioId, query.desde, query.hasta, query.limit, query.search].filter((part) => part !== undefined),
    queryFn: async () => pedidosApi.getAnulaciones(query),
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationActualizar = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ActualizarAnulacionPayload }) => pedidosApi.actualizarAnulacion(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ANULACIONES_KEY, exact: false, refetchType: 'active' });
    },
  });

  const mutationInvalidar = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: InvalidarAnulacionPayload }) => pedidosApi.invalidarAnulacion(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ANULACIONES_KEY, exact: false, refetchType: 'active' });
    },
  });

  return {
    anulaciones: anulacionesQuery.data ? mapAnulacionesAuditoria(anulacionesQuery.data) : [],
    loading: anulacionesQuery.isLoading,
    saving: mutationActualizar.isPending || mutationInvalidar.isPending,
    error: (anulacionesQuery.error || mutationActualizar.error || mutationInvalidar.error)?.message ?? null,
    success: primerMensaje([mutationActualizar.isSuccess, 'Anulación actualizada.'], [mutationInvalidar.isSuccess, 'Anulación invalidada.']),
    fetch: async () => {
      await anulacionesQuery.refetch();
    },
    actualizarAnulacion: async (id: string, payload: ActualizarAnulacionPayload) => {
      return mutationActualizar.mutateAsync({ id, payload });
    },
    invalidarAnulacion: async (id: string, payload: InvalidarAnulacionPayload) => {
      return mutationInvalidar.mutateAsync({ id, payload });
    },
    clearFeedback: () => {
      mutationActualizar.reset();
      mutationInvalidar.reset();
    },
  };
}
