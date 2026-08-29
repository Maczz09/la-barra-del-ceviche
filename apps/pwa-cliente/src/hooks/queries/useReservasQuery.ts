import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import * as reservasApi from '../../api/reservas.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { mapReserva, mapReservas } from '../../mappers/reserva.mapper';
import { primerMensaje } from '../../utils/feedback';
import type {
  CrearReservaPayload,
  DisponibilidadResponse,
  ReservaVM,
} from '../../types/reserva.types';

export const RESERVAS_QUERY_KEY = ['reservas'];

interface ReservasFilters {
  fecha?: string;
  /** Busca por el código de la reserva ("R0000001" o un fragmento). */
  search?: string;
}

function updateReserva(reservas: ReservaVM[], reserva: ReservaVM): ReservaVM[] {
  const exists = reservas.some((item) => item.id === reserva.id);
  if (!exists) return [reserva, ...reservas];
  return reservas.map((item) => (item.id === reserva.id ? reserva : item));
}

export function useReservasQuery(filters: ReservasFilters = {}) {
  const [disponibilidad, setDisponibilidad] = useState<DisponibilidadResponse | null>(null);

  const reservasQuery = useInfiniteQuery({
    queryKey: [...RESERVAS_QUERY_KEY, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await reservasApi.getPage({
        cursor: pageParam,
        fecha: filters.fecha,
        search: filters.search || undefined,
        limit: 50,
      });

      return {
        reservas: mapReservas(response.data),
        nextCursor: response.nextCursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationCrear = useMutation({
    mutationFn: async (payload: CrearReservaPayload) => {
      const dto = await reservasApi.crear(payload);
      return mapReserva(dto);
    },
    onSuccess: (reserva) => {
      queryClient.setQueriesData<{ pages: Array<{ reservas: ReservaVM[]; nextCursor: string | null }> }>(
        { queryKey: RESERVAS_QUERY_KEY, exact: false },
        (current) => {
          if (!current?.pages.length) return current;
          return {
            ...current,
            pages: current.pages.map((page, index) =>
              index === 0
                ? { ...page, reservas: updateReserva(page.reservas, reserva) }
                : page,
            ),
          };
        },
      );
      void queryClient.invalidateQueries({
        queryKey: RESERVAS_QUERY_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationConfirmar = useMutation({
    mutationFn: async (id: string) => {
      const dto = await reservasApi.confirmar(id);
      return mapReserva(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: RESERVAS_QUERY_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationCancelar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const dto = await reservasApi.cancelar(id, motivo);
      return mapReserva(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: RESERVAS_QUERY_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const saving =
    mutationCrear.isPending ||
    mutationConfirmar.isPending ||
    mutationCancelar.isPending;
  const error =
    reservasQuery.error ||
    mutationCrear.error ||
    mutationConfirmar.error ||
    mutationCancelar.error;
  const success = primerMensaje(
    [mutationCrear.isSuccess, 'Reserva creada.'],
    [mutationConfirmar.isSuccess, 'Reserva confirmada.'],
    [mutationCancelar.isSuccess, 'Reserva cancelada.'],
  );

  return {
    reservas: reservasQuery.data?.pages.flatMap((page) => page.reservas) ?? [],
    nextCursor: reservasQuery.hasNextPage
      ? reservasQuery.data?.pages.at(-1)?.nextCursor ?? null
      : null,
    loading: reservasQuery.isLoading,
    loadingMore: reservasQuery.isFetchingNextPage,
    saving,
    error: error ? error.message : null,
    success,
    disponibilidad,
    fetch: reservasQuery.refetch,
    fetchMore: async () => {
      if (reservasQuery.hasNextPage) await reservasQuery.fetchNextPage();
    },
    crear: async (payload: CrearReservaPayload) => {
      await mutationCrear.mutateAsync(payload);
    },
    confirmar: async (id: string) => {
      await mutationConfirmar.mutateAsync(id);
    },
    cancelar: async (id: string, motivo?: string) => {
      await mutationCancelar.mutateAsync({ id, motivo });
    },
    consultarDisponibilidad: async (fecha: string, hora: string, mesaPreferida?: string) => {
      if (!fecha || !hora || !mesaPreferida) {
        setDisponibilidad(null);
        return;
      }

      try {
        setDisponibilidad(await reservasApi.disponibilidad(fecha, hora, mesaPreferida));
      } catch {
        setDisponibilidad(null);
      }
    },
    clearFeedback: () => {
      mutationCrear.reset();
      mutationConfirmar.reset();
      mutationCancelar.reset();
    },
  };
}
