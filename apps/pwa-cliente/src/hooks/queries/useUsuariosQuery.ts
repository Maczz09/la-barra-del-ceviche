import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import * as usuariosApi from '../../api/usuarios.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { mapUsuario, mapUsuarios } from '../../mappers/usuario.mapper';
import { primerMensaje } from '../../utils/feedback';
import type {
  CrearUsuarioPayload,
  ActualizarUsuarioPayload,
  RolUsuario,
  UsuarioVM,
} from '../../types/usuario.types';

export const USUARIOS_QUERY_KEY = ['usuarios'];

interface UsuariosFilters {
  rol?: RolUsuario;
  search?: string;
}

function upsertUsuario(usuarios: UsuarioVM[], usuario: UsuarioVM): UsuarioVM[] {
  const exists = usuarios.some((item) => item.id === usuario.id);
  if (!exists) return [usuario, ...usuarios];
  return usuarios.map((item) => (item.id === usuario.id ? usuario : item));
}

export function useUsuariosQuery(filters: UsuariosFilters = {}) {
  const usuariosQuery = useInfiniteQuery({
    queryKey: [...USUARIOS_QUERY_KEY, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await usuariosApi.getPage({
        cursor: pageParam,
        limit: 20,
        rol: filters.rol,
        search: filters.search,
      });

      return {
        usuarios: mapUsuarios(response.data),
        nextCursor: response.nextCursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationCrear = useMutation({
    mutationFn: async (payload: CrearUsuarioPayload) => {
      const dto = await usuariosApi.crear(payload);
      return mapUsuario(dto);
    },
    onSuccess: (usuario) => {
      queryClient.setQueriesData<{ pages: Array<{ usuarios: UsuarioVM[]; nextCursor: string | null }> }>(
        { queryKey: USUARIOS_QUERY_KEY, exact: false },
        (current) => {
          if (!current?.pages.length) return current;
          return {
            ...current,
            pages: current.pages.map((page, index) =>
              index === 0
                ? { ...page, usuarios: upsertUsuario(page.usuarios, usuario) }
                : page,
            ),
          };
        },
      );
      void queryClient.invalidateQueries({
        queryKey: USUARIOS_QUERY_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationCambiarRol = useMutation({
    mutationFn: async ({ id, rol }: { id: string; rol: RolUsuario }) => {
      const dto = await usuariosApi.cambiarRol(id, { rol });
      return mapUsuario(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: USUARIOS_QUERY_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationCambiarEstado = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const dto = await usuariosApi.cambiarEstado(id, { activo });
      return mapUsuario(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: USUARIOS_QUERY_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationActualizar = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ActualizarUsuarioPayload }) => {
      const dto = await usuariosApi.actualizar(id, payload);
      return mapUsuario(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: USUARIOS_QUERY_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const mutationCambiarPassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const dto = await usuariosApi.cambiarPassword(id, { password });
      return mapUsuario(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: USUARIOS_QUERY_KEY,
        exact: false,
        refetchType: 'active',
      });
    },
  });

  const saving =
    mutationCrear.isPending ||
    mutationCambiarRol.isPending ||
    mutationCambiarEstado.isPending ||
    mutationActualizar.isPending ||
    mutationCambiarPassword.isPending;
  const error =
    usuariosQuery.error ||
    mutationCrear.error ||
    mutationCambiarRol.error ||
    mutationCambiarEstado.error ||
    mutationActualizar.error ||
    mutationCambiarPassword.error;
  const success = primerMensaje(
    [mutationCrear.isSuccess, 'Usuario creado.'],
    [mutationCambiarRol.isSuccess, 'Rol actualizado.'],
    [mutationCambiarEstado.isSuccess, 'Estado actualizado.'],
    [mutationActualizar.isSuccess, 'Datos del usuario actualizados.'],
    [mutationCambiarPassword.isSuccess, 'Contraseña actualizada.'],
  );

  return {
    usuarios: usuariosQuery.data?.pages.flatMap((page) => page.usuarios) ?? [],
    nextCursor: usuariosQuery.hasNextPage
      ? usuariosQuery.data?.pages.at(-1)?.nextCursor ?? null
      : null,
    loading: usuariosQuery.isLoading,
    loadingMore: usuariosQuery.isFetchingNextPage,
    saving,
    error: error ? error.message : null,
    success,
    fetch: usuariosQuery.refetch,
    fetchMore: async () => {
      if (usuariosQuery.hasNextPage) await usuariosQuery.fetchNextPage();
    },
    crear: async (payload: CrearUsuarioPayload) => {
      await mutationCrear.mutateAsync(payload);
    },
    cambiarRol: async (id: string, rol: RolUsuario) => {
      await mutationCambiarRol.mutateAsync({ id, rol });
    },
    cambiarEstado: async (id: string, activo: boolean) => {
      await mutationCambiarEstado.mutateAsync({ id, activo });
    },
    actualizar: async (id: string, payload: ActualizarUsuarioPayload) => {
      await mutationActualizar.mutateAsync({ id, payload });
    },
    cambiarPassword: async (id: string, password: string) => {
      await mutationCambiarPassword.mutateAsync({ id, password });
    },
    clearFeedback: () => {
      mutationCrear.reset();
      mutationCambiarRol.reset();
      mutationCambiarEstado.reset();
      mutationActualizar.reset();
      mutationCambiarPassword.reset();
    },
  };
}
