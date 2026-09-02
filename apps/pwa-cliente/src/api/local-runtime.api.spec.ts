// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localRuntimeApi } from './local-runtime.api';

describe('localRuntimeApi', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('consulta la dirección pública sin enviar secretos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: 'http://192.168.100.5:3210' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(localRuntimeApi.info()).resolves.toMatchObject({ url: 'http://192.168.100.5:3210' });
    expect(fetchMock).toHaveBeenCalledWith('/local-info', expect.any(Object));
  });

  it('propaga el mensaje seguro de un error local', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({ message: 'Solo laptop servidor' }) }));
    await expect(localRuntimeApi.status()).rejects.toThrow('Solo laptop servidor');
  });
});
