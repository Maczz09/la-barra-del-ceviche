// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getAuthToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  setAuthToken: vi.fn(),
}));

import * as authApi from './auth.api';
import { client, getAuthToken, refreshAccessToken } from './client';

describe('auth.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restaura primero el Bearer cuando la aplicación se vuelve a abrir', async () => {
    const user = { id: 'admin-1', nombre: 'Admin', rol: 'ADMIN' };
    vi.mocked(getAuthToken).mockReturnValue(null);
    vi.mocked(refreshAccessToken).mockResolvedValue('token-restaurado');
    vi.mocked(client.get).mockResolvedValue(user);

    await expect(authApi.me()).resolves.toEqual(user);

    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith('/identidad/auth/me');
    expect(vi.mocked(refreshAccessToken).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(client.get).mock.invocationCallOrder[0]);
  });

  it('no renueva innecesariamente cuando ya existe un Bearer', async () => {
    const user = { id: 'admin-1', nombre: 'Admin', rol: 'ADMIN' };
    vi.mocked(getAuthToken).mockReturnValue('token-vigente');
    vi.mocked(client.get).mockResolvedValue(user);

    await expect(authApi.me()).resolves.toEqual(user);

    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
