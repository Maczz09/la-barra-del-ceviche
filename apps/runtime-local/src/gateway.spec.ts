import type http from 'node:http';
import { closeHttpServer, resolveServiceProxy } from './gateway';

describe('resolveServiceProxy', () => {
  it('acepta las rutas originales que ya usa la PWA', () => {
    expect(resolveServiceProxy('/identidad/auth/login')).toEqual({
      target: 'http://127.0.0.1:23201',
      path: '/api/auth/login',
    });
  });

  it('conserva las rutas versionadas y los parámetros', () => {
    expect(resolveServiceProxy('/v1/pedidos/pedidos', '?sedeId=abc')).toEqual({
      target: 'http://127.0.0.1:23203',
      path: '/api/pedidos?sedeId=abc',
    });
  });

  it('no confunde recursos estáticos con microservicios', () => {
    expect(resolveServiceProxy('/assets/index.js')).toBeUndefined();
    expect(resolveServiceProxy('/brand/logo-principal.png')).toBeUndefined();
  });
});

describe('closeHttpServer', () => {
  afterEach(() => jest.useRealTimers());

  it('fuerza las conexiones si el servidor no completa close', async () => {
    jest.useFakeTimers();
    const server = {
      close: jest.fn(),
      closeIdleConnections: jest.fn(),
      closeAllConnections: jest.fn(),
    } as unknown as http.Server;

    const closing = closeHttpServer(server, 2_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await closing;

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
  });

  it('no fuerza conexiones cuando close termina a tiempo', async () => {
    const server = {
      close: jest.fn((callback: () => void) => callback()),
      closeIdleConnections: jest.fn(),
      closeAllConnections: jest.fn(),
    } as unknown as http.Server;

    await closeHttpServer(server, 2_000);

    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });
});
