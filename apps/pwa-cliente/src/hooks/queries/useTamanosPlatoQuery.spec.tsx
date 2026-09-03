// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/inventario.api';
import { queryClient } from '../../api/queryClient';
import { useTamanosPlatoQuery } from './useTamanosPlatoQuery';

vi.mock('../../api/inventario.api', () => ({ getTamanosPlato: vi.fn(), crearTamanoPlato: vi.fn(), actualizarTamanoPlato: vi.fn(), eliminarTamanoPlato: vi.fn() }));
vi.mock('../../api/queryClient', () => ({ queryClient: { invalidateQueries: vi.fn() }, retrySalvo404: () => false, refetchSiError: () => false }));
const tamano = { id: 't1', nombre: 'Personal', orden: 10, activo: true };
function wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.getTamanosPlato).mockResolvedValue([tamano]); });
afterEach(cleanup);

describe('useTamanosPlatoQuery', () => {
  it('carga tamaños y propaga crear/editar/eliminar invalidando carta y menú', async () => {
    vi.mocked(api.crearTamanoPlato).mockResolvedValue(tamano);
    vi.mocked(api.actualizarTamanoPlato).mockResolvedValue(tamano);
    vi.mocked(api.eliminarTamanoPlato).mockResolvedValue(undefined);
    const { result } = renderHook(useTamanosPlatoQuery, { wrapper });
    await waitFor(() => expect(result.current.tamanos).toEqual([tamano]));
    await act(async () => { await result.current.crearTamano({ nombre: 'Personal' }); });
    await act(async () => { await result.current.actualizarTamano('t1', { orden: 5 }); });
    await act(async () => { await result.current.eliminarTamano('t1'); });
    expect(api.actualizarTamanoPlato).toHaveBeenCalledWith('t1', { orden: 5 });
    for (const key of ['inventario-tamanos', 'inventario-productos', 'menu-diario']) {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: [key] }));
    }
  });
  it('muestra el error de un tamaño en uso sin borrar los tamaños cargados', async () => {
    vi.mocked(api.eliminarTamanoPlato).mockRejectedValue(new Error('Tamaño en uso'));
    const { result } = renderHook(useTamanosPlatoQuery, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.eliminarTamano('t1')).rejects.toThrow('Tamaño en uso'); });
    await waitFor(() => expect(result.current.error).toBe('Tamaño en uso'));
    expect(result.current.tamanos).toEqual([tamano]);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    act(() => result.current.clearFeedback());
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
