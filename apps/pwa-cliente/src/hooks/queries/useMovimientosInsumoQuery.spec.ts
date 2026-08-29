// @vitest-environment jsdom
// Se escribe en .ts (no .tsx) a propósito: el wrapper se arma con
// createElement para que este spec entre también en la suite raíz, que solo
// barre `*.spec.ts`.
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useKardexInsumoQuery, useMovimientosInsumoMutation } from './useMovimientosInsumoQuery';
import * as comprasApi from '../../api/compras.api';
import { queryClient } from '../../api/queryClient';

vi.mock('../../api/compras.api', () => ({
  listarMovimientosInsumo: vi.fn(),
  registrarMovimientoInsumo: vi.fn(),
  registrarConteoInsumos: vi.fn(),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: { invalidateQueries: vi.fn() },
}));

function createWrapper() {
  const testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: testQueryClient }, children);
}

const MOVIMIENTO = {
  id: 'mv-1',
  sedeId: 's1',
  insumoId: 'i-1',
  insumoNombre: 'Arroz',
  unidad: 'kg',
  tipo: 'SALIDA_CONSUMO' as const,
  delta: -2,
  stockAntes: 10,
  stockDespues: 8,
  costoUnitario: 4.5,
  costoTotal: 9,
  motivo: null,
  observacion: null,
  recepcionId: null,
  usuarioId: null,
  usuarioNombre: null,
  createdAt: '2026-08-24T15:00:00.000Z',
};

describe('useKardexInsumoQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trae el kardex del insumo y lo mapea a ViewModel', async () => {
    vi.mocked(comprasApi.listarMovimientosInsumo).mockResolvedValue({
      data: [MOVIMIENTO],
      nextCursor: 'mv-1',
    });

    const { result } = renderHook(() => useKardexInsumoQuery('i-1', { limit: 100 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(comprasApi.listarMovimientosInsumo).toHaveBeenCalledWith({ limit: 100, insumoId: 'i-1' });
    expect(result.current.movimientos[0].deltaLabel).toBe('−2 kg');
    expect(result.current.nextCursor).toBe('mv-1');
  });

  it('sin insumo no consulta nada (el drawer está cerrado)', () => {
    renderHook(() => useKardexInsumoQuery(null), { wrapper: createWrapper() });
    expect(comprasApi.listarMovimientosInsumo).not.toHaveBeenCalled();
  });

  it('expone el error del backend', async () => {
    vi.mocked(comprasApi.listarMovimientosInsumo).mockRejectedValue(new Error('kardex caído'));

    const { result } = renderHook(() => useKardexInsumoQuery('i-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).toBe('kardex caído'));
    expect(result.current.movimientos).toEqual([]);
  });
});

describe('useMovimientosInsumoMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registra un movimiento e invalida el saldo del almacén', async () => {
    vi.mocked(comprasApi.registrarMovimientoInsumo).mockResolvedValue({
      message: 'ok',
      movimiento: MOVIMIENTO,
    });

    const { result } = renderHook(() => useMovimientosInsumoMutation(), { wrapper: createWrapper() });
    await result.current.registrarMovimiento('i-1', { tipo: 'SALIDA_CONSUMO', cantidad: 2 });

    expect(comprasApi.registrarMovimientoInsumo).toHaveBeenCalledWith('i-1', {
      tipo: 'SALIDA_CONSUMO',
      cantidad: 2,
    });
    // Insumos + movimientos + resumen: el saldo cambió y los tres quedan viejos.
    expect(vi.mocked(queryClient.invalidateQueries)).toHaveBeenCalledTimes(3);
  });

  it('registra un conteo físico', async () => {
    const resultado = {
      insumosContados: 1,
      cuadraron: 0,
      ajustados: 1,
      valorDiferenciaTotal: -9,
      diferencias: [],
    };
    vi.mocked(comprasApi.registrarConteoInsumos).mockResolvedValue({ message: 'ok', resultado });

    const { result } = renderHook(() => useMovimientosInsumoMutation(), { wrapper: createWrapper() });
    const respuesta = await result.current.registrarConteo({
      items: [{ insumoId: 'i-1', stockContado: 8 }],
    });

    expect(respuesta.resultado.ajustados).toBe(1);
  });

  it('propaga el error del backend al llamador', async () => {
    vi.mocked(comprasApi.registrarMovimientoInsumo).mockRejectedValue(new Error('solo hay 3 kg'));

    const { result } = renderHook(() => useMovimientosInsumoMutation(), { wrapper: createWrapper() });

    await expect(
      result.current.registrarMovimiento('i-1', { tipo: 'SALIDA_CONSUMO', cantidad: 8 }),
    ).rejects.toThrow('solo hay 3 kg');

    await waitFor(() => expect(result.current.error).toBe('solo hay 3 kg'));
  });

  it('clearFeedback limpia el estado de las mutaciones', async () => {
    vi.mocked(comprasApi.registrarMovimientoInsumo).mockResolvedValue({
      message: 'ok',
      movimiento: MOVIMIENTO,
    });

    const { result } = renderHook(() => useMovimientosInsumoMutation(), { wrapper: createWrapper() });
    await result.current.registrarMovimiento('i-1', { tipo: 'SALIDA_CONSUMO', cantidad: 1 });

    await waitFor(() => expect(result.current.success).toBe('Movimiento registrado.'));

    result.current.clearFeedback();

    await waitFor(() => expect(result.current.success).toBeNull());
  });
});
