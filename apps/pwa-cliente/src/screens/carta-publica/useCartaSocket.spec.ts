// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import { useCartaSocket } from './useCartaSocket';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

function crearSocket() {
  const listeners = new Map<string, () => void>();
  return {
    on: vi.fn((evento: string, listener: () => void) => listeners.set(evento, listener)),
    off: vi.fn((evento: string, listener: () => void) => {
      if (listeners.get(evento) === listener) listeners.delete(evento);
    }),
    disconnect: vi.fn(),
    cambiar: () => listeners.get('disponibilidad:cambiada')?.(),
  };
}

describe('useCartaSocket', () => {
  let socket: ReturnType<typeof crearSocket>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    socket = crearSocket();
    vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('no abre una conexión si no hay sede', () => {
    renderHook(() => useCartaSocket(undefined, vi.fn()));
    expect(io).not.toHaveBeenCalled();
  });

  it('mantiene el socket público de la sede y recarga después de 200ms', () => {
    const recargar = vi.fn();
    renderHook(() => useCartaSocket('sede-1', recargar));
    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      path: '/v1/notificaciones/carta-socket.io',
      query: { sedeId: 'sede-1' },
    }));

    act(() => socket.cambiar());
    act(() => { vi.advanceTimersByTime(199); });
    expect(recargar).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('espera 200ms desde el último evento de la ráfaga', () => {
    const recargar = vi.fn();
    renderHook(() => useCartaSocket('sede-1', recargar));

    act(() => socket.cambiar());
    act(() => { vi.advanceTimersByTime(150); });
    act(() => socket.cambiar());
    act(() => { vi.advanceTimersByTime(199); });
    expect(recargar).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('cancela la recarga pendiente y retira el listener al desmontar', () => {
    const recargar = vi.fn();
    const { unmount } = renderHook(() => useCartaSocket('sede-1', recargar));

    act(() => socket.cambiar());
    unmount();
    act(() => socket.cambiar());
    act(() => { vi.runAllTimers(); });

    expect(recargar).not.toHaveBeenCalled();
    expect(socket.off).toHaveBeenCalledWith('disponibilidad:cambiada', expect.any(Function));
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('descarta eventos de la sede anterior y escucha la nueva sede', () => {
    const recargar = vi.fn();
    const { rerender } = renderHook(({ sede }) => useCartaSocket(sede, recargar), {
      initialProps: { sede: 'sede-1' },
    });
    act(() => socket.cambiar());

    const siguienteSocket = crearSocket();
    vi.mocked(io).mockReturnValue(siguienteSocket as unknown as ReturnType<typeof io>);
    rerender({ sede: 'sede-2' });
    act(() => socket.cambiar());
    act(() => { vi.advanceTimersByTime(200); });
    expect(recargar).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(io).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
      query: { sedeId: 'sede-2' },
    }));

    act(() => siguienteSocket.cambiar());
    act(() => { vi.advanceTimersByTime(200); });
    expect(recargar).toHaveBeenCalledOnce();
  });

  it('usa el callback más reciente sin reconectar ni perder la recarga pendiente', () => {
    const anterior = vi.fn();
    const actual = vi.fn();
    const { rerender } = renderHook(({ recargar }) => useCartaSocket('sede-1', recargar), {
      initialProps: { recargar: anterior },
    });
    act(() => socket.cambiar());
    rerender({ recargar: actual });
    act(() => { vi.advanceTimersByTime(200); });

    expect(anterior).not.toHaveBeenCalled();
    expect(actual).toHaveBeenCalledOnce();
    expect(io).toHaveBeenCalledOnce();
  });

  it.each([1, 25, 50, 200])('eval: %i eventos por edición producen una sola recarga y admiten cambios posteriores', (cantidad) => {
    const recargar = vi.fn();
    renderHook(() => useCartaSocket('sede-1', recargar));

    act(() => {
      for (let indice = 0; indice < cantidad; indice++) socket.cambiar();
      vi.advanceTimersByTime(200);
    });
    expect(recargar).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    act(() => socket.cambiar());
    act(() => { vi.advanceTimersByTime(200); });
    expect(recargar).toHaveBeenCalledTimes(2);
  });
});
