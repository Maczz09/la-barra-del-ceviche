import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      canActivate() {
        return Promise.resolve(true);
      }
    },
}));

import { JwtAuthGuard } from './jwt-auth.guard';
import { CSRF_COOKIE_NAME } from './csrf';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => function handler() { return; },
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard compartido', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    // Por defecto ningún endpoint es @Public() — los tests existentes cubren
    // el comportamiento autenticado normal.
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    guard = new JwtAuthGuard(reflector);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'permite %s autenticado sin validar CSRF',
    async (method) => {
      await expect(
        guard.canActivate(
          contextFor({
            method,
            path: '/api/recurso',
            headers: {},
            cookies: {},
          }),
        ),
      ).resolves.toBe(true);
    },
  );

  it.each(['POST', 'PATCH', 'DELETE'])(
    'rechaza %s cookie-only sin header CSRF',
    async (method) => {
      await expect(
        guard.canActivate(
          contextFor({
            method,
            path: '/api/recurso',
            headers: {},
            cookies: { [CSRF_COOKIE_NAME]: 'csrf-token' },
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it.each(['POST', 'PATCH', 'DELETE'])(
    'permite %s cookie-only cuando cookie y header CSRF coinciden',
    async (method) => {
      await expect(
        guard.canActivate(
          contextFor({
            method,
            path: '/api/recurso',
            headers: { 'x-csrf-token': 'csrf-token' },
            cookies: { [CSRF_COOKIE_NAME]: 'csrf-token' },
          }),
        ),
      ).resolves.toBe(true);
    },
  );

  it.each(['POST', 'PATCH', 'DELETE'])(
    'permite %s service-to-service con Authorization Bearer sin CSRF',
    async (method) => {
      await expect(
        guard.canActivate(
          contextFor({
            method,
            path: '/api/recurso',
            headers: { authorization: 'Bearer service-token' },
            cookies: {},
          }),
        ),
      ).resolves.toBe(true);
    },
  );

  // T-36/P-58: la comparación constante no debe lanzar
  // ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH con longitudes distintas → 403 limpio.
  it.each(['POST', 'PATCH', 'DELETE'])(
    'rechaza %s con 403 cuando cookie y header CSRF tienen longitudes distintas',
    async (method) => {
      await expect(
        guard.canActivate(
          contextFor({
            method,
            path: '/api/recurso',
            headers: { 'x-csrf-token': 'csrf-token-mucho-mas-largo-que-la-cookie' },
            cookies: { [CSRF_COOKIE_NAME]: 'csrf-token' },
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('rechaza con 403 cuando cookie y header difieren con igual longitud', async () => {
    await expect(
      guard.canActivate(
        contextFor({
          method: 'POST',
          path: '/api/recurso',
          headers: { 'x-csrf-token': 'csrf-token-B' },
          cookies: { [CSRF_COOKIE_NAME]: 'csrf-token-A' },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permite /api/telemetry/metrics sin autenticación', async () => {
    await expect(
      guard.canActivate(contextFor({ path: '/api/telemetry/metrics', method: 'GET', headers: {}, cookies: {} }))
    ).resolves.toBe(true);
  });

  it('permite /telemetry/metrics sin autenticación', async () => {
    await expect(
      guard.canActivate(contextFor({ path: '/telemetry/metrics', method: 'GET', headers: {}, cookies: {} }))
    ).resolves.toBe(true);
  });

  it('permite un endpoint marcado @Public() sin autenticar ni validar CSRF', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(
      guard.canActivate(contextFor({ path: '/api/inventario/carta-publica', method: 'GET', headers: {}, cookies: {} }))
    ).resolves.toBe(true);
  });

  it('handleRequest devuelve el user si no hay error', () => {
    const user = { sub: 'u1', rol: 'ADMIN' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('handleRequest lanza UnauthorizedException cuando err está presente', () => {
    expect(() => guard.handleRequest(new Error('bad'), null))
      .toThrow('Token inválido o expirado');
  });

  it('handleRequest lanza UnauthorizedException cuando user es null', () => {
    expect(() => guard.handleRequest(null, null))
      .toThrow('Token inválido o expirado');
  });
});
