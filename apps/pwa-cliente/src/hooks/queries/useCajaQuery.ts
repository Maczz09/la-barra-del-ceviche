import { useMutation, useQuery } from '@tanstack/react-query';
import * as cajaApi from '../../api/caja.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { USUARIOS_QUERY_KEY } from './useUsuariosQuery';
import type {
  AbrirTurnoPayload,
  CerrarTurnoPayload,
  CrearMovimientoCajaPayload,
} from '../../types/caja.types';

export const CAJA_QUERY_KEY = ['caja'];

export function useCajaQuery() {
  const resumenQuery = useQuery({
    queryKey: [...CAJA_QUERY_KEY, 'turno-activo', 'resumen'],
    queryFn: cajaApi.getResumenActivo,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: CAJA_QUERY_KEY });

  // Abrir/cerrar turno activa/desactiva automáticamente a los MESERO de la
  // sede (identidad, vía evento turno.abierto/turno.cerrado) — sin esto, la
  // pantalla de Usuarios se queda mostrando el estado viejo hasta que algo
  // más dispare un refetch (F5, cambiar de pantalla y volver).
  const refreshConUsuarios = () => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: USUARIOS_QUERY_KEY, exact: false });
  };

  const abrirMutation = useMutation({
    mutationFn: (payload: AbrirTurnoPayload) => cajaApi.abrirTurno(payload),
    onSuccess: refreshConUsuarios,
  });

  const movimientoMutation = useMutation({
    mutationFn: ({ turnoId, payload }: { turnoId: string; payload: CrearMovimientoCajaPayload }) =>
      cajaApi.crearMovimiento(turnoId, payload),
    onSuccess: refresh,
  });

  const cierreMutation = useMutation({
    mutationFn: ({ turnoId, payload }: { turnoId: string; payload: CerrarTurnoPayload }) =>
      cajaApi.cerrarTurno(turnoId, payload),
    onSuccess: refreshConUsuarios,
  });

  return {
    resumen: resumenQuery.data ?? null,
    turno: resumenQuery.data?.turno ?? null,
    loading: resumenQuery.isLoading || abrirMutation.isPending || movimientoMutation.isPending || cierreMutation.isPending,
    error:
      resumenQuery.error?.message ||
      abrirMutation.error?.message ||
      movimientoMutation.error?.message ||
      cierreMutation.error?.message ||
      null,
    abrirTurno: (payload: AbrirTurnoPayload) => abrirMutation.mutateAsync(payload),
    crearMovimiento: (turnoId: string, payload: CrearMovimientoCajaPayload) =>
      movimientoMutation.mutateAsync({ turnoId, payload }),
    cerrarTurno: (turnoId: string, payload: CerrarTurnoPayload) =>
      cierreMutation.mutateAsync({ turnoId, payload }),
    refetch: resumenQuery.refetch,
    clearFeedback: () => {
      abrirMutation.reset();
      movimientoMutation.reset();
      cierreMutation.reset();
    },
  };
}
