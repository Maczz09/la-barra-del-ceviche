// hooks/queries/useMovimientosInsumoQuery.ts — T-50. Kardex del almacén de
// cocina: movimientos de un insumo, registro de salidas/devoluciones y cuadre
// físico en lote.

import { useMutation, useQuery } from '@tanstack/react-query';
import * as comprasApi from '../../api/compras.api';
import { mapMovimientosInsumo } from '../../mappers/compras.mapper';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { primerMensaje } from '../../utils/feedback';
import type {
  ListarMovimientosInsumoPayload,
  RegistrarConteoInsumosPayload,
  RegistrarMovimientoInsumoPayload,
} from '../../types/compras.types';
import { COMPRAS_INSUMOS_KEY, COMPRAS_RESUMEN_KEY } from './useComprasQuery';

export const COMPRAS_MOVIMIENTOS_KEY = ['compras-movimientos-insumo'];

function invalidarTrasMovimiento() {
  // El saldo del insumo cambió: la tabla del almacén y el KPI de "bajo mínimo"
  // quedan viejos hasta que se refresquen.
  void queryClient.invalidateQueries({ queryKey: COMPRAS_INSUMOS_KEY, exact: false, refetchType: 'active' });
  void queryClient.invalidateQueries({ queryKey: COMPRAS_MOVIMIENTOS_KEY, exact: false, refetchType: 'active' });
  void queryClient.invalidateQueries({ queryKey: COMPRAS_RESUMEN_KEY, exact: false, refetchType: 'active' });
}

/** Kardex de UN insumo. Sin `insumoId` la query queda deshabilitada: el drawer
 *  solo pide datos cuando hay un insumo abierto. */
export function useKardexInsumoQuery(insumoId: string | null, query: ListarMovimientosInsumoPayload = {}) {
  const movimientosQuery = useQuery({
    queryKey: [...COMPRAS_MOVIMIENTOS_KEY, insumoId, query],
    queryFn: () => comprasApi.listarMovimientosInsumo({ ...query, insumoId: insumoId as string }),
    enabled: !!insumoId,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  return {
    movimientos: movimientosQuery.data ? mapMovimientosInsumo(movimientosQuery.data.data) : [],
    nextCursor: movimientosQuery.data?.nextCursor ?? null,
    loading: movimientosQuery.isLoading,
    error: movimientosQuery.error?.message ?? null,
  };
}

export function useMovimientosInsumoMutation() {
  const mutationRegistrar = useMutation({
    mutationFn: ({ insumoId, payload }: { insumoId: string; payload: RegistrarMovimientoInsumoPayload }) =>
      comprasApi.registrarMovimientoInsumo(insumoId, payload),
    onSuccess: invalidarTrasMovimiento,
  });

  const mutationConteo = useMutation({
    mutationFn: (payload: RegistrarConteoInsumosPayload) => comprasApi.registrarConteoInsumos(payload),
    onSuccess: invalidarTrasMovimiento,
  });

  return {
    saving: mutationRegistrar.isPending || mutationConteo.isPending,
    error: (mutationRegistrar.error || mutationConteo.error)?.message ?? null,
    success: primerMensaje(
      [mutationRegistrar.isSuccess, 'Movimiento registrado.'],
      [mutationConteo.isSuccess, 'Conteo físico registrado.'],
    ),
    registrarMovimiento: (insumoId: string, payload: RegistrarMovimientoInsumoPayload) =>
      mutationRegistrar.mutateAsync({ insumoId, payload }),
    registrarConteo: (payload: RegistrarConteoInsumosPayload) => mutationConteo.mutateAsync(payload),
    clearFeedback: () => {
      mutationRegistrar.reset();
      mutationConteo.reset();
    },
  };
}
