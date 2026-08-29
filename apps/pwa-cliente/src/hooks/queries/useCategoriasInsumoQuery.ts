// hooks/queries/useCategoriasInsumoQuery.ts — T-50. Categorías PROPIAS del
// almacén de cocina (Abarrotes, Carnes, Limpieza, Gas). No son las categorías
// de la carta: esas ordenan lo que se vende y viven en servicio-inventario.

import { useMutation, useQuery } from '@tanstack/react-query';
import * as comprasApi from '../../api/compras.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { primerMensaje } from '../../utils/feedback';
import type {
  ActualizarCategoriaInsumoPayload,
  CrearCategoriaInsumoPayload,
} from '../../types/compras.types';
import { COMPRAS_INSUMOS_KEY } from './useComprasQuery';

export const COMPRAS_CATEGORIAS_INSUMO_KEY = ['compras-categorias-insumo'];

function invalidar() {
  void queryClient.invalidateQueries({ queryKey: COMPRAS_CATEGORIAS_INSUMO_KEY, exact: false, refetchType: 'active' });
  // Borrar una categoría deja insumos sin categoría (FK SetNull): la tabla del
  // almacén también queda vieja.
  void queryClient.invalidateQueries({ queryKey: COMPRAS_INSUMOS_KEY, exact: false, refetchType: 'active' });
}

export function useCategoriasInsumoQuery(search?: string) {
  const categoriasQuery = useQuery({
    queryKey: [...COMPRAS_CATEGORIAS_INSUMO_KEY, search ?? ''],
    queryFn: () => comprasApi.listarCategoriasInsumo(search),
    // Cambian muy poco: no tiene sentido refrescarlas en cada visita.
    staleTime: 1000 * 60 * 30,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationCrear = useMutation({
    mutationFn: (payload: CrearCategoriaInsumoPayload) => comprasApi.crearCategoriaInsumo(payload),
    onSuccess: invalidar,
  });
  const mutationActualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActualizarCategoriaInsumoPayload }) =>
      comprasApi.actualizarCategoriaInsumo(id, payload),
    onSuccess: invalidar,
  });
  const mutationEliminar = useMutation({
    mutationFn: (id: string) => comprasApi.eliminarCategoriaInsumo(id),
    onSuccess: invalidar,
  });

  return {
    categorias: categoriasQuery.data ?? [],
    loading: categoriasQuery.isLoading,
    saving: mutationCrear.isPending || mutationActualizar.isPending || mutationEliminar.isPending,
    error:
      (categoriasQuery.error || mutationCrear.error || mutationActualizar.error || mutationEliminar.error)
        ?.message ?? null,
    success: primerMensaje(
      [mutationCrear.isSuccess, 'Categoría creada.'],
      [mutationActualizar.isSuccess, 'Categoría actualizada.'],
      [mutationEliminar.isSuccess, 'Categoría eliminada.'],
    ),
    crear: (payload: CrearCategoriaInsumoPayload) => mutationCrear.mutateAsync(payload),
    actualizar: (id: string, payload: ActualizarCategoriaInsumoPayload) =>
      mutationActualizar.mutateAsync({ id, payload }),
    eliminar: (id: string) => mutationEliminar.mutateAsync(id),
    clearFeedback: () => {
      mutationCrear.reset();
      mutationActualizar.reset();
      mutationEliminar.reset();
    },
  };
}
