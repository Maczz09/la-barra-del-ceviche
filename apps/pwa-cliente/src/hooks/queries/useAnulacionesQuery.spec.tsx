// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnulacionesQuery } from './useAnulacionesQuery';
import * as pedidosApi from '../../api/pedidos.api';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/pedidos.api', () => ({
  getAnulaciones: vi.fn(),
  actualizarAnulacion: vi.fn(),
  invalidarAnulacion: vi.fn(),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const dtoBase = {
  id: 'aud-1', fecha: '2026-08-13T14:00:00.000Z', mesaId: 'm-1', mesaNumero: 3, pedidoId: 'p-1', itemId: 'i-1',
  tipo: 'ITEM' as const, productoId: 'prod-1', productoNombre: 'Cerveza', cantidad: 1, estadoPlato: 'PREPARADO' as const,
  cobrado: false, montoAnulado: 10, motivo: 'Se cayó', usuarioId: 'u-1', usuarioNombre: 'Ana',
  invalidada: false,
};

const createWrapper = () => {
  const testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useAnulacionesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carga y mapea la lista de anulaciones', async () => {
    vi.mocked(pedidosApi.getAnulaciones).mockResolvedValue([dtoBase]);

    const { result } = renderHook(() => useAnulacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.anulaciones).toHaveLength(1);
    expect(result.current.anulaciones[0].productoNombre).toBe('Cerveza');
    expect(result.current.anulaciones[0].tipoLabel).toBe('Ítem');
    expect(result.current.anulaciones[0].montoLabel).toContain('10');
  });

  it('actualiza motivo/observación e invalida la lista', async () => {
    vi.mocked(pedidosApi.getAnulaciones).mockResolvedValue([]);
    vi.mocked(pedidosApi.actualizarAnulacion).mockResolvedValue(dtoBase);

    const { result } = renderHook(() => useAnulacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.actualizarAnulacion('aud-1', { motivo: 'Corregido' });

    expect(pedidosApi.actualizarAnulacion).toHaveBeenCalledWith('aud-1', { motivo: 'Corregido' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['anulaciones'] }));
  });

  it('invalida una anulación (soft-delete) e invalida la lista', async () => {
    vi.mocked(pedidosApi.getAnulaciones).mockResolvedValue([]);
    vi.mocked(pedidosApi.invalidarAnulacion).mockResolvedValue({ ...dtoBase, invalidada: true });

    const { result } = renderHook(() => useAnulacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.invalidarAnulacion('aud-1', { motivo: 'Error de digitación' });

    expect(pedidosApi.invalidarAnulacion).toHaveBeenCalledWith('aud-1', { motivo: 'Error de digitación' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['anulaciones'] }));
  });
});
