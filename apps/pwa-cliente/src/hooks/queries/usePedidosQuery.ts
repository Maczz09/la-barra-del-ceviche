import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, type InfiniteData } from '@tanstack/react-query';
import * as pedidosApi from '../../api/pedidos.api';
import { mapPedido, mapPedidos, estadoClassOf, estadoLabelOf } from '../../mappers/pedido.mapper';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { MESAS_QUERY_KEY } from './useMesasQuery';
import { ESTADOS_PRODUCCION, derivarEstadoProduccion } from '../../domain/pedido.flow';
import type {
  CrearPedidoPayload,
  EstadoPedido,
  EstadoItem,
  PedidoVM,
  AnularItemPreparadoPayload,
  AnularAtencionMesaPayload,
  AnularAtencionMesaResultado,
  AnularPedidoPayload,
} from '../../types/pedido.types';
import type { MesaVM } from '../../types/mesa.types';

export const PEDIDOS_QUERY_KEY = ['pedidos'];
const CUENTAS_QUERY_KEY = ['cuentas'];
const CONSISTENCY_REFETCH_DELAYS_MS = [800, 2500];

interface PedidosPage {
  pedidos: PedidoVM[];
  nextCursor: string | null;
}
type PedidosData = InfiniteData<PedidosPage>;

interface UsePedidosOptions {
  /** Carga progresivamente todas las páginas (KDS necesita todos los tickets activos). */
  autoLoadAll?: boolean;
  /** Busca por el código de la atención ("A0000001" o un fragmento). */
  search?: string;
}

/** Aplica `fn` al pedido `id` en toda la caché infinita. */
function mapPedidoEnCache(
  old: PedidosData | undefined,
  predicate: (p: PedidoVM) => boolean,
  fn: (p: PedidoVM) => PedidoVM,
): PedidosData | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      pedidos: page.pedidos.map((p) => (predicate(p) ? fn(p) : p)),
    })),
  };
}

function prependPedidoEnCache(
  old: PedidosData | undefined,
  pedido: PedidoVM,
): PedidosData | undefined {
  if (!old || old.pages.some((page) => page.pedidos.some((p) => p.id === pedido.id))) {
    return old;
  }

  return {
    ...old,
    pages: old.pages.map((page, index) =>
      index === 0
        ? { ...page, pedidos: [pedido, ...page.pedidos] }
        : page,
    ),
  };
}

function markMesaOcupadaEnCache(mesaId: string) {
  queryClient.setQueryData<MesaVM[] | undefined>(MESAS_QUERY_KEY, (old) =>
    old?.map((m) =>
      m.id === mesaId
        ? {
            ...m,
            estado: 'OCUPADA',
            estadoClass: 'ocup',
            estadoLabel: 'Ocupada',
          }
        : m,
    ),
  );
}

function invalidateOperationalData(mesaId?: string) {
  void queryClient.invalidateQueries({
    queryKey: PEDIDOS_QUERY_KEY,
    exact: false,
    refetchType: 'all',
  });
  void queryClient.invalidateQueries({
    queryKey: MESAS_QUERY_KEY,
    exact: false,
    refetchType: 'all',
  });
  void queryClient.invalidateQueries({
    queryKey: CUENTAS_QUERY_KEY,
    exact: false,
    refetchType: 'all',
  });

  if (mesaId) {
    void queryClient.invalidateQueries({
      queryKey: [...CUENTAS_QUERY_KEY, 'mesa', mesaId],
      exact: false,
      refetchType: 'all',
    });
  }
}

// Cubre la ventana de eventual-consistency entre el 200 OK de la mutación y el
// procesamiento asíncrono del evento (outbox → RabbitMQ → snapshot de cuentas):
// un solo invalidate+refetch inmediato puede llegar antes de que el consumidor
// haya escrito el nuevo estado, mostrando datos obsoletos (p. ej. un ítem que
// ya se anuló pero la cuenta actual todavía no lo refleja).
function scheduleConsistencyRefetch(mesaId?: string) {
  CONSISTENCY_REFETCH_DELAYS_MS.forEach((delay) => {
    globalThis.setTimeout(() => invalidateOperationalData(mesaId), delay);
  });
}

const contieneItem = (itemId: string) => (p: PedidoVM) =>
  p.items.some((it) => it.id === itemId);

function applyAvanceItem(
  p: PedidoVM,
  itemId: string,
  estado: EstadoItem,
): PedidoVM {
  const items = p.items.map((it) =>
    it.id === itemId
      ? { ...it, estado, estadoClass: estadoClassOf(estado), estadoLabel: estadoLabelOf(estado) }
      : it,
  );
  const derivado = ESTADOS_PRODUCCION.has(p.estado)
    ? derivarEstadoProduccion(items.map((it) => it.estado))
    : null;
  const estadoPedido = derivado ?? p.estado;
  return {
    ...p,
    items,
    estado: estadoPedido,
    estadoClass: estadoClassOf(estadoPedido),
    estadoLabel: estadoLabelOf(estadoPedido),
  };
}

export function usePedidosQuery(mesaId?: string, options: UsePedidosOptions = {}) {
  const { search } = options;
  const query = useInfiniteQuery({
    queryKey: [...PEDIDOS_QUERY_KEY, mesaId, search].filter(Boolean),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await pedidosApi.getPage({
        cursor: pageParam,
        mesaId,
        search: search || undefined,
        limit: 50,
      });
      return {
        pedidos: mapPedidos(response.data),
        nextCursor: response.nextCursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  // KDS: agota la paginación para tener todos los tickets activos en pantalla.
  const { autoLoadAll } = options;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (autoLoadAll && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [autoLoadAll, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const mutationCrear = useMutation({
    mutationFn: async (payload: CrearPedidoPayload) => {
      const dto = await pedidosApi.crear(payload);
      return mapPedido(dto);
    },
    onSuccess: (pedido, payload) => {
      queryClient.getQueriesData<PedidosData>({ queryKey: PEDIDOS_QUERY_KEY }).forEach(([key]) => {
        const scopedMesaId = Array.isArray(key) && typeof key[1] === 'string' ? key[1] : undefined;
        if (!scopedMesaId || scopedMesaId === pedido.mesaId || scopedMesaId === payload.mesaId) {
          queryClient.setQueryData<PedidosData>(key, (old) => prependPedidoEnCache(old, pedido));
        }
      });

      if (payload.mesaId) {
        markMesaOcupadaEnCache(payload.mesaId);
      }

      // Crear pedido dispara efectos asíncronos en cuentas/mesas. Refrescamos
      // ahora y repetimos poco después para no depender sólo del socket.
      invalidateOperationalData(payload.mesaId);
      scheduleConsistencyRefetch(payload.mesaId);
    },
  });

  // Avance comercial del pedido (LISTO → ENTREGADO, etc.). Optimista; el socket
  // confirma. No invalidamos en onSuccess para evitar refetch redundante.
  const mutationAvanzarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoPedido }) => {
      const dto = await pedidosApi.avanzarEstado(id, { estado });
      return mapPedido(dto);
    },
    onMutate: async ({ id, estado }) => {
      await queryClient.cancelQueries({ queryKey: PEDIDOS_QUERY_KEY });
      const prev = queryClient.getQueriesData<PedidosData>({ queryKey: PEDIDOS_QUERY_KEY });
      queryClient.setQueriesData<PedidosData>({ queryKey: PEDIDOS_QUERY_KEY }, (old) =>
        mapPedidoEnCache(old, (p) => p.id === id, (p) => ({
          ...p,
          estado,
          estadoClass: estadoClassOf(estado),
          estadoLabel: estadoLabelOf(estado),
        })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
  });

  // Avance/retroceso de un ítem (cocina). Optimista: parchea el ítem y deriva el
  // estado de producción del pedido igual que el backend. `motivo` solo
  // aplica cuando estado=CANCELADO (Caso A: aún no se preparó) — queda en el
  // registro de Auditoría de Anulaciones igual que CU-01.
  const mutationAvanzarItem = useMutation({
    mutationFn: async ({ itemId, estado, motivo }: { itemId: string; estado: EstadoItem; motivo?: string }) => {
      await pedidosApi.avanzarItem(itemId, { estado, motivo });
    },
    onMutate: async ({ itemId, estado }) => {
      await queryClient.cancelQueries({ queryKey: PEDIDOS_QUERY_KEY });
      const prev = queryClient.getQueriesData<PedidosData>({ queryKey: PEDIDOS_QUERY_KEY });
      queryClient.setQueriesData<PedidosData>({ queryKey: PEDIDOS_QUERY_KEY }, (old) =>
        mapPedidoEnCache(
          old,
          contieneItem(itemId),
          (p) => applyAvanceItem(p, itemId, estado),
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
  });

  // CU-01: anular un ítem ya preparado/servido (cobrar o no). Toca inventario
  // (merma) y auditoría además del pedido — se invalida en vez de parchear
  // optimista, el socket/refetch trae el estado final.
  const mutationAnularItemPreparado = useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: string; payload: AnularItemPreparadoPayload }) => {
      const dto = await pedidosApi.anularItemPreparado(itemId, payload);
      return mapPedido(dto);
    },
    onSuccess: (pedido) => invalidateOperationalData(pedido.mesaId),
  });

  return {
    pedidos: query.data?.pages.flatMap((page) => page.pedidos) ?? [],
    nextCursor: query.hasNextPage
      ? query.data?.pages.at(-1)?.nextCursor ?? null
      : null,
    currentMesaId: mesaId,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    error: query.isError ? query.error.message : null,
    fetch: query.refetch,
    fetchMore: async () => {
      if (query.hasNextPage) await query.fetchNextPage();
    },
    crear: async (payload: CrearPedidoPayload) => {
      return mutationCrear.mutateAsync(payload);
    },
    avanzarEstado: async (id: string, estado: EstadoPedido) => {
      return mutationAvanzarEstado.mutateAsync({ id, estado });
    },
    avanzarItem: async (itemId: string, estado: EstadoItem, motivo?: string) => {
      return mutationAvanzarItem.mutateAsync({ itemId, estado, motivo });
    },
    anularItemPreparado: async (itemId: string, payload: AnularItemPreparadoPayload) => {
      return mutationAnularItemPreparado.mutateAsync({ itemId, payload });
    },
  };
}

/**
 * CU-02: mutación aislada (sin la lista completa de pedidos) para anular la
 * atención de una mesa desde MesasScreen — evita levantar el infinite query
 * pesado de `usePedidosQuery` solo para disparar esta acción puntual.
 */
export function useAnularAtencionMesaMutation() {
  const mutation = useMutation({
    mutationFn: async ({ mesaId, payload }: { mesaId: string; payload: AnularAtencionMesaPayload }): Promise<AnularAtencionMesaResultado> =>
      pedidosApi.anularAtencionMesa(mesaId, payload),
    onSuccess: (_resultado, { mesaId }) => {
      invalidateOperationalData(mesaId);
      scheduleConsistencyRefetch(mesaId);
    },
  });

  return {
    saving: mutation.isPending,
    anularAtencionMesa: async (mesaId: string, payload: AnularAtencionMesaPayload) => {
      return mutation.mutateAsync({ mesaId, payload });
    },
  };
}

/**
 * Anular UN pedido puntual desde el tablero de Pedidos (no toda la mesa) —
 * salvavidas operativo: si un pedido queda atascado (o simplemente se
 * quiere cancelar uno puntual sin tocar el resto de la mesa), esto lo saca
 * de la vista sin depender de SQL manual.
 */
export function useAnularPedidoMutation() {
  const mutation = useMutation({
    mutationFn: async ({ pedidoId, payload }: { pedidoId: string; payload: AnularPedidoPayload }) =>
      pedidosApi.anularPedido(pedidoId, payload),
    onSuccess: (pedido) => {
      invalidateOperationalData(pedido.mesaId);
      scheduleConsistencyRefetch(pedido.mesaId);
    },
  });

  return {
    saving: mutation.isPending,
    anularPedido: async (pedidoId: string, payload: AnularPedidoPayload) => {
      return mutation.mutateAsync({ pedidoId, payload });
    },
  };
}

/**
 * Anular un ítem puntual (Caso A: aún no se preparó, o Caso B: ya
 * preparado/servido) desde cualquier pantalla que no quiera cargar el
 * infinite query completo de `usePedidosQuery` — usado por MesasScreen
 * (mismo flujo unificado que Pedidos/DetallePedido).
 */
export function useAnularItemMutations() {
  const mutationAvanzarItem = useMutation({
    mutationFn: async ({ itemId, estado, motivo, mesaId }: { itemId: string; estado: EstadoItem; motivo?: string; mesaId?: string }) => {
      await pedidosApi.avanzarItem(itemId, { estado, motivo });
      return mesaId;
    },
    onSuccess: (mesaId) => {
      invalidateOperationalData(mesaId);
      scheduleConsistencyRefetch(mesaId);
    },
  });

  const mutationAnularItemPreparado = useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: string; payload: AnularItemPreparadoPayload }) => {
      const dto = await pedidosApi.anularItemPreparado(itemId, payload);
      return mapPedido(dto);
    },
    onSuccess: (pedido) => {
      invalidateOperationalData(pedido.mesaId);
      scheduleConsistencyRefetch(pedido.mesaId);
    },
  });

  return {
    saving: mutationAvanzarItem.isPending || mutationAnularItemPreparado.isPending,
    avanzarItem: async (itemId: string, estado: EstadoItem, motivo?: string, mesaId?: string) => {
      return mutationAvanzarItem.mutateAsync({ itemId, estado, motivo, mesaId });
    },
    anularItemPreparado: async (itemId: string, payload: AnularItemPreparadoPayload) => {
      return mutationAnularItemPreparado.mutateAsync({ itemId, payload });
    },
  };
}
