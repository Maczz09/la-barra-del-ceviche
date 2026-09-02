/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
import { useQuery, useMutation } from '@tanstack/react-query';
import * as cuentasApi from '../../api/cuentas.api';
import { mapCuenta } from '../../mappers/cuenta.mapper';
import { queryClient } from '../../api/queryClient';
import { MESAS_QUERY_KEY } from './useMesasQuery';
import { PEDIDOS_QUERY_KEY } from './usePedidosQuery';
import { CAJA_QUERY_KEY } from './useCajaQuery';
import type { DividirCuentaPayload, RegistrarPagoCombinadoPayload, RegistrarPagoPayload } from '../../types/cuenta.types';
import { primerMensaje } from '../../utils/feedback';

export const CUENTAS_QUERY_KEY = ['cuentas'];

// T-03: el 404 (cuenta inexistente) no es error duro y no reintenta; cualquier
// otro fallo reintenta hasta 2 veces, para que la UI se cure sola cuando el
// servicio vuelve. Exportado para test unitario del predicado.
export const retryCuentas = (failureCount: number, err: unknown): boolean =>
  (err as { status?: number }).status !== 404 && failureCount < 2;

export function useCuentasQuery(mesaId?: string) {
  const query = useQuery({
    queryKey: [...CUENTAS_QUERY_KEY, 'mesa', mesaId].filter(Boolean),
    queryFn: async () => {
      if (!mesaId) return null;
      try {
        const dto = await cuentasApi.getByMesa(mesaId);
        return mapCuenta(dto);
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 404) return null; // Si no hay cuenta, no es un error duro
        throw err;
      }
    },
    enabled: !!mesaId,
    retry: retryCuentas,
    // Ya en error, re-pregunta cada 5 s; al recuperar, deja de repreguntar.
    refetchInterval: (query) => (query.state.status === 'error' ? 5000 : false),
  });

  const mutationAbrir = useMutation({
    mutationFn: async (idMesa: string) => {
      const dto = await cuentasApi.abrir(idMesa);
      return mapCuenta(dto);
    },
    onSuccess: (data, idMesa) => {
      queryClient.setQueryData([...CUENTAS_QUERY_KEY, 'mesa', idMesa], data);
      void queryClient.invalidateQueries({ queryKey: MESAS_QUERY_KEY });
    },
  });

  const mutationRegistrarPago = useMutation({
    mutationFn: async (payload: RegistrarPagoPayload) => {
      return cuentasApi.registrarPago(payload);
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: CUENTAS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: MESAS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: PEDIDOS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: CAJA_QUERY_KEY });
    },
  });

  const mutationRegistrarPagoCombinado = useMutation({
    mutationFn: (payload: RegistrarPagoCombinadoPayload) => cuentasApi.registrarPagoCombinado(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CUENTAS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: MESAS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: PEDIDOS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: CAJA_QUERY_KEY });
    },
  });

  const mutationCerrar = useMutation({
    mutationFn: async ({ id, descuento }: { id: string; descuento?: number }) => {
      return cuentasApi.cerrar(id, { descuento });
    },
    onSuccess: (response, variables) => {
      // Limpiar caché de la cuenta
      queryClient.setQueryData([...CUENTAS_QUERY_KEY, 'mesa', mesaId], null);
      void queryClient.invalidateQueries({ queryKey: MESAS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: PEDIDOS_QUERY_KEY });
    },
  });

  const mutationDividir = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: DividirCuentaPayload }) => {
      return cuentasApi.dividir(id, payload);
    },
  });

  return {
    cuentaActiva: query.data ?? null,
    loading: query.isLoading || mutationAbrir.isPending || mutationRegistrarPago.isPending || mutationRegistrarPagoCombinado.isPending || mutationCerrar.isPending,
    error: query.isError ? (query.error as Error).message : mutationAbrir.error?.message || mutationRegistrarPago.error?.message || mutationRegistrarPagoCombinado.error?.message || mutationCerrar.error?.message || null,
    // T-04: distingue "no se pudo cargar la cuenta" (recuperable con refetch)
    // de un fallo de mutación (pagar/abrir/cerrar) — refetch no reintenta eso.
    queryError: query.isError,
    success: primerMensaje(
      [mutationAbrir.isSuccess, 'Cuenta abierta.'],
      // T-04: el backend distingue "cuenta cerrada y ticket generado" de
      // "cierre de cuenta en proceso" (degradación honesta de caja). Reflejamos
      // su mensaje real cuando viene; si no, el genérico de siempre.
      [mutationRegistrarPago.isSuccess, mutationRegistrarPago.data?.message ?? 'Pago registrado correctamente.'],
      [mutationRegistrarPagoCombinado.isSuccess, mutationRegistrarPagoCombinado.data?.message ?? 'Pago combinado registrado correctamente.'],
      [mutationCerrar.isSuccess, mutationCerrar.data?.message],
    ),
    ticket: mutationRegistrarPago.data?.ticket ?? mutationCerrar.data?.ticket ?? null,
    division: mutationDividir.data ?? null,
    
    // Mapeo de métodos compatibles con el store original
    cargar: async (idMesa: string) => {
      if (idMesa === mesaId) await query.refetch();
      // Si cambia el mesaId, el useQuery lo manejará por reactividad.
    },
    // T-04: recuperación manual desde el botón "Reintentar" del drawer de cobro.
    refetchCuenta: () => query.refetch(),
    abrir: async (idMesa: string) => {
      await mutationAbrir.mutateAsync(idMesa);
    },
    registrarPago: async (payload: RegistrarPagoPayload) => {
      return mutationRegistrarPago.mutateAsync(payload);
    },
    registrarPagoCombinado: (payload: RegistrarPagoCombinadoPayload) => mutationRegistrarPagoCombinado.mutateAsync(payload),
    cerrar: async (descuento = 0) => {
      if (query.data?.id) {
        await mutationCerrar.mutateAsync({ id: query.data.id, descuento });
      }
    },
    dividir: async (payload: DividirCuentaPayload) => {
      if (query.data?.id) {
        await mutationDividir.mutateAsync({ id: query.data.id, payload });
      }
    },
    clearFeedback: () => {
      mutationAbrir.reset();
      mutationRegistrarPago.reset();
      mutationRegistrarPagoCombinado.reset();
      mutationCerrar.reset();
      mutationDividir.reset();
    },
  };
}
