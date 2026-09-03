import { useMutation, useQuery } from '@tanstack/react-query';
import * as inventarioApi from '../../api/inventario.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { INVENTARIO_PRODUCTOS_KEY } from './useInventarioQuery';
import type { ActualizarTamanoPlatoPayload, CrearTamanoPlatoPayload } from '../../types/inventario.types';

export const TAMANOS_PLATO_KEY = ['inventario-tamanos'];

export function useTamanosPlatoQuery() {
  const consulta = useQuery({
    queryKey: TAMANOS_PLATO_KEY,
    queryFn: inventarioApi.getTamanosPlato,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });
  const invalidar = async () => {
    await Promise.all([TAMANOS_PLATO_KEY, INVENTARIO_PRODUCTOS_KEY, ['menu-diario'], ['carta-publica']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, exact: false, refetchType: 'active' })));
  };
  const crear = useMutation({ mutationFn: inventarioApi.crearTamanoPlato, onSuccess: invalidar });
  const actualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActualizarTamanoPlatoPayload }) => inventarioApi.actualizarTamanoPlato(id, payload),
    onSuccess: invalidar,
  });
  const eliminar = useMutation({ mutationFn: inventarioApi.eliminarTamanoPlato, onSuccess: invalidar });
  const error = consulta.error || crear.error || actualizar.error || eliminar.error;
  return {
    tamanos: consulta.data ?? [],
    loading: consulta.isLoading,
    saving: crear.isPending || actualizar.isPending || eliminar.isPending,
    error: error?.message ?? null,
    crearTamano: (payload: CrearTamanoPlatoPayload) => crear.mutateAsync(payload),
    actualizarTamano: (id: string, payload: ActualizarTamanoPlatoPayload) => actualizar.mutateAsync({ id, payload }),
    eliminarTamano: (id: string) => eliminar.mutateAsync(id),
    fetch: async () => { await consulta.refetch(); },
    clearFeedback: () => { crear.reset(); actualizar.reset(); eliminar.reset(); },
  };
}
