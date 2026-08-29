// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCajaQuery } from './useCajaQuery';
import * as cajaApi from '../../api/caja.api';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/caja.api', () => ({
  getResumenActivo: vi.fn(),
  abrirTurno: vi.fn(),
  crearMovimiento: vi.fn(),
  cerrarTurno: vi.fn(),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const createWrapper = () => {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 }, // T-05: reintentos del hook instantáneos en test
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useCajaQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return initial state with nulls and loading true', () => {
    vi.mocked(cajaApi.getResumenActivo).mockReturnValue(new Promise(() => {})); // pending
    
    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });

    expect(result.current.resumen).toBeNull();
    expect(result.current.turno).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should fetch and return resumen and turno', async () => {
    const mockResumen = { turno: { id: 'turno-1' }, ingresos: 100 };
    vi.mocked(cajaApi.getResumenActivo).mockResolvedValue(mockResumen as any);

    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.resumen).toEqual(mockResumen);
    expect(result.current.turno).toEqual({ id: 'turno-1' });
    expect(result.current.error).toBeNull();
  });

  it('should return error if query fails', async () => {
    vi.mocked(cajaApi.getResumenActivo).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network Error');
  });

  it('should call abrirTurno and invalidate queries on success', async () => {
    vi.mocked(cajaApi.getResumenActivo).mockResolvedValue({} as any);
    vi.mocked(cajaApi.abrirTurno).mockResolvedValue({ id: 't1' } as any);

    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.abrirTurno({ saldoInicial: 100 } as any);

    expect(cajaApi.abrirTurno).toHaveBeenCalledWith({ saldoInicial: 100 });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['caja'] });
    // Abrir turno activa MESERO de la sede (evento async en identidad); sin
    // esto la pantalla de Usuarios se queda con el estado viejo.
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['usuarios'], exact: false });
  });

  it('should handle error in abrirTurno', async () => {
    vi.mocked(cajaApi.getResumenActivo).mockResolvedValue({} as any);
    vi.mocked(cajaApi.abrirTurno).mockRejectedValue(new Error('Abrir Error'));

    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.abrirTurno({} as any)).rejects.toThrow();

    await waitFor(() => expect(result.current.error).toBe('Abrir Error'));
  });

  it('should call crearMovimiento and invalidate queries on success', async () => {
    vi.mocked(cajaApi.getResumenActivo).mockResolvedValue({} as any);
    vi.mocked(cajaApi.crearMovimiento).mockResolvedValue({ id: 'm1' } as any);

    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.crearMovimiento('t1', { monto: 50 } as any);

    expect(cajaApi.crearMovimiento).toHaveBeenCalledWith('t1', { monto: 50 });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['caja'] });
  });

  it('should call cerrarTurno and invalidate queries on success', async () => {
    vi.mocked(cajaApi.getResumenActivo).mockResolvedValue({} as any);
    vi.mocked(cajaApi.cerrarTurno).mockResolvedValue({ id: 't1' } as any);

    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.cerrarTurno('t1', { saldoFinalDeclarado: 200 } as any);

    expect(cajaApi.cerrarTurno).toHaveBeenCalledWith('t1', { saldoFinalDeclarado: 200 });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['caja'] });
    // Cerrar turno desactiva MESERO de la sede (evento async en identidad).
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['usuarios'], exact: false });
  });

  it('should clear feedback state', async () => {
    vi.mocked(cajaApi.getResumenActivo).mockResolvedValue({} as any);
    vi.mocked(cajaApi.abrirTurno).mockRejectedValue(new Error('Abrir Error'));

    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    try { await result.current.abrirTurno({} as any); } catch (e) {}
    await new Promise(r => setTimeout(r, 0)); // wait for react render

    expect(result.current.error).toBe('Abrir Error');

    result.current.clearFeedback();
    
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });
  
  it('should pass refetch down', async () => {
    vi.mocked(cajaApi.getResumenActivo).mockResolvedValue({} as any);
    const { result } = renderHook(() => useCajaQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.refetch).toBe('function');
  });
});
