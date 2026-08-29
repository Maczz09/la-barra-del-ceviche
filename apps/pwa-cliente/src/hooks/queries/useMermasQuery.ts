import { useMutation, useQuery } from '@tanstack/react-query';
import * as inventarioApi from '../../api/inventario.api';
import { mapMermas } from '../../mappers/inventario.mapper';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import type { ActualizarMermaPayload, MermaListQuery, RegistrarMermaPayload } from '../../types/inventario.types';
import { primerMensaje } from '../../utils/feedback';
import { INVENTARIO_PRODUCTOS_KEY } from './useInventarioQuery';

export const MERMAS_KEY = ['mermas'];

export function useMermasQuery(query: MermaListQuery = {}) {
  const mermasQuery = useQuery({
    queryKey: [...MERMAS_KEY, query.productoId, query.limit].filter((part) => part !== undefined),
    queryFn: async () => inventarioApi.getMermas(query),
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationRegistrar = useMutation({
    mutationFn: async (payload: RegistrarMermaPayload) => inventarioApi.registrarMerma(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MERMAS_KEY, exact: false, refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: INVENTARIO_PRODUCTOS_KEY, exact: false, refetchType: 'active' });
    },
  });

  const mutationActualizar = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ActualizarMermaPayload }) => inventarioApi.actualizarMerma(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MERMAS_KEY, exact: false, refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: INVENTARIO_PRODUCTOS_KEY, exact: false, refetchType: 'active' });
    },
  });

  const mutationEliminar = useMutation({
    mutationFn: async ({ id, justificacion }: { id: string; justificacion: string }) => inventarioApi.eliminarMerma(id, justificacion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MERMAS_KEY, exact: false, refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: INVENTARIO_PRODUCTOS_KEY, exact: false, refetchType: 'active' });
    },
  });

  return {
    mermas: mermasQuery.data ? mapMermas(mermasQuery.data) : [],
    loading: mermasQuery.isLoading,
    saving: mutationRegistrar.isPending || mutationActualizar.isPending || mutationEliminar.isPending,
    error: (mermasQuery.error || mutationRegistrar.error || mutationActualizar.error || mutationEliminar.error)?.message ?? null,
    success: primerMensaje([mutationRegistrar.isSuccess, 'Merma registrada.'], [mutationActualizar.isSuccess, 'Merma actualizada.'], [mutationEliminar.isSuccess, 'Merma eliminada y stock restaurado.']),
    fetch: async () => {
      await mermasQuery.refetch();
    },
    registrarMerma: async (payload: RegistrarMermaPayload) => {
      return mutationRegistrar.mutateAsync(payload);
    },
    actualizarMerma: async (id: string, payload: ActualizarMermaPayload) => {
      return mutationActualizar.mutateAsync({ id, payload });
    },
    eliminarMerma: async (id: string, justificacion: string) => {
      return mutationEliminar.mutateAsync({ id, justificacion });
    },
    clearFeedback: () => {
      mutationRegistrar.reset();
      mutationActualizar.reset();
      mutationEliminar.reset();
    },
  };
}
