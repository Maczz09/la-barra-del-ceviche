import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import * as inventarioApi from '../../api/inventario.api';
import { mapProductos } from '../../mappers/inventario.mapper';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import type {
  ActualizarCategoriaPayload,
  ActualizarProductoPayload,
  CrearCategoriaPayload,
  CrearProductoPayload,
} from '../../types/inventario.types';
import { primerMensaje } from '../../utils/feedback';

export const INVENTARIO_CATEGORIAS_KEY = ['inventario-categorias'];
export const INVENTARIO_PRODUCTOS_KEY = ['inventario-productos'];

export interface UseInventarioOptions {
  /** true: solo productos con stock (Inventario); false: solo sin stock (Carta). */
  conStock?: boolean;
  limit?: number;
  search?: string;
}

export function useInventarioQuery(categoriaId?: string, options: UseInventarioOptions = {}) {
  const { conStock, limit = 50, search } = options;
  const categoriasQuery = useQuery({
    queryKey: INVENTARIO_CATEGORIAS_KEY,
    queryFn: async () => {
      return inventarioApi.getCategorias();
    },
    staleTime: 1000 * 60 * 60, // 1 hora para las categorías (casi nunca cambian)
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const productosQuery = useInfiniteQuery({
    queryKey: [...INVENTARIO_PRODUCTOS_KEY, categoriaId, conStock, limit, search].filter((part) => part !== undefined && part !== ''),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await inventarioApi.getProductosPage({
        categoriaId,
        conStock,
        search,
        cursor: pageParam,
        limit,
      });
      return {
        productos: response.data,
        nextCursor: response.nextCursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!categoriasQuery.data, // Esperar a que carguen las categorías para mapear
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationCrear = useMutation({
    mutationFn: async (payload: CrearProductoPayload) => {
      return inventarioApi.crearProducto(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: INVENTARIO_PRODUCTOS_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationReponer = useMutation({
    mutationFn: async ({ id, cantidad }: { id: string; cantidad: number }) => {
      return inventarioApi.reponerStock(id, cantidad);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: INVENTARIO_PRODUCTOS_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationActualizar = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ActualizarProductoPayload }) => {
      return inventarioApi.actualizarProducto(id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: INVENTARIO_PRODUCTOS_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationActualizarDisponibilidad = useMutation({
    mutationFn: async ({ id, disponible }: { id: string; disponible: boolean }) => {
      return inventarioApi.actualizarDisponibilidadProducto(id, disponible);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: INVENTARIO_PRODUCTOS_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationCrearCategoria = useMutation({
    mutationFn: async (payload: CrearCategoriaPayload) => inventarioApi.crearCategoria(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTARIO_CATEGORIAS_KEY, exact: false, refetchType: 'active' });
    },
  });

  const mutationActualizarCategoria = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ActualizarCategoriaPayload }) =>
      inventarioApi.actualizarCategoria(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTARIO_CATEGORIAS_KEY, exact: false, refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: INVENTARIO_PRODUCTOS_KEY, exact: false, refetchType: 'active' });
    },
  });

  const mutationEliminarCategoria = useMutation({
    mutationFn: async (id: string) => inventarioApi.eliminarCategoria(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTARIO_CATEGORIAS_KEY, exact: false, refetchType: 'active' });
    },
  });

  const loading = categoriasQuery.isLoading || productosQuery.isLoading;
  const saving = mutationCrear.isPending || mutationReponer.isPending || mutationActualizar.isPending
    || mutationActualizarDisponibilidad.isPending
    || mutationCrearCategoria.isPending || mutationActualizarCategoria.isPending || mutationEliminarCategoria.isPending;
  const error = categoriasQuery.error || productosQuery.error || mutationCrear.error || mutationReponer.error || mutationActualizar.error
    || mutationActualizarDisponibilidad.error
    || mutationCrearCategoria.error || mutationActualizarCategoria.error || mutationEliminarCategoria.error;

  return {
    categorias: categoriasQuery.data ?? [],
    productos: productosQuery.data != null && categoriasQuery.data != null
      ? mapProductos(
          productosQuery.data.pages.flatMap((page) => page.productos),
          categoriasQuery.data,
        )
      : [],
    nextCursor: productosQuery.hasNextPage
      ? productosQuery.data?.pages.at(-1)?.nextCursor ?? null
      : null,
    loading,
    loadingMore: productosQuery.isFetchingNextPage,
    saving,
    error: error ? error.message : null,
    success: primerMensaje(
      [mutationCrear.isSuccess, 'Producto creado.'],
      [mutationActualizar.isSuccess, 'Producto actualizado.'],
      [mutationReponer.isSuccess, 'Stock actualizado.'],
      [mutationCrearCategoria.isSuccess, 'Categoría creada.'],
      [mutationActualizarCategoria.isSuccess, 'Categoría actualizada.'],
      [mutationEliminarCategoria.isSuccess, 'Categoría eliminada.'],
    ),

    fetch: async () => {
      await categoriasQuery.refetch();
      await productosQuery.refetch();
    },
    fetchMore: async () => {
      if (productosQuery.hasNextPage) await productosQuery.fetchNextPage();
    },
    crearProducto: async (payload: CrearProductoPayload) => {
      return mutationCrear.mutateAsync(payload);
    },
    actualizarProducto: async (id: string, payload: ActualizarProductoPayload) => {
      return mutationActualizar.mutateAsync({ id, payload });
    },
    actualizarDisponibilidad: async (id: string, disponible: boolean) => {
      return mutationActualizarDisponibilidad.mutateAsync({ id, disponible });
    },
    reponerStock: async (id: string, cantidad: number) => {
      return mutationReponer.mutateAsync({ id, cantidad });
    },
    crearCategoria: async (payload: CrearCategoriaPayload) => {
      return mutationCrearCategoria.mutateAsync(payload);
    },
    actualizarCategoria: async (id: string, payload: ActualizarCategoriaPayload) => {
      return mutationActualizarCategoria.mutateAsync({ id, payload });
    },
    eliminarCategoria: async (id: string) => {
      return mutationEliminarCategoria.mutateAsync(id);
    },
    clearFeedback: () => {
      mutationCrear.reset();
      mutationActualizar.reset();
      mutationActualizarDisponibilidad.reset();
      mutationReponer.reset();
      mutationCrearCategoria.reset();
      mutationActualizarCategoria.reset();
      mutationEliminarCategoria.reset();
    },
  };
}
