// @vitest-environment jsdom
import { vi } from 'vitest';
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  client,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
  ApiError,
  setUsuarioSedeId,
  setSedeSeleccionada,
  getSedeSeleccionada,
} from './client';

describe('client', () => {
  beforeEach(() => {
    clearAuthToken();
    setUsuarioSedeId(null);
    setSedeSeleccionada(null);
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => arr.fill(0),
      randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    });
    vi.stubGlobal('document', { cookie: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setAuthToken / getAuthToken / clearAuthToken', () => {
    setAuthToken('my-token');
    expect(getAuthToken()).toBe('my-token');
    clearAuthToken();
    expect(getAuthToken()).toBe(null);
  });

  it('ApiError sets correct properties', () => {
    const error = new ApiError(404, 'Not Found', { message: 'Item not found' });
    expect(error.status).toBe(404);
    expect(error.statusText).toBe('Not Found');
    expect(error.message).toBe('Item not found');
    expect(error.body).toEqual({ message: 'Item not found' });
  });

  it('client.get success', async () => {
    const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 1 }) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.get('/test');
    expect(data).toEqual({ id: 1 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.any(Object));
  });

  it('client.post includes Idempotency-Key and JSON body', async () => {
    const mockRes = { ok: true, status: 201, json: vi.fn().mockResolvedValue({ id: 2 }) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.post('/test', { name: 'Foo' });
    expect(data).toEqual({ id: 2 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Foo' })
    }));
  });

  it('client.patch includes body', async () => {
    const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 3 }) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    await client.patch('/test', { name: 'Bar' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Bar' })
    }));
  });

  it('client.delete works', async () => {
    const mockRes = { ok: true, status: 204 };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.delete('/test');
    expect(data).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'DELETE'
    }));
  });

  it('handles 401 error and tries to refresh', async () => {
    const mockRes401 = { ok: false, status: 401, statusText: 'Unauthorized', json: vi.fn().mockRejectedValue(new Error()) };
    const mockResRefresh = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ access_token: 'new-token' }) };
    const mockResRetry = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ ok: true }) };

    vi.mocked(fetch)
      .mockResolvedValueOnce(mockRes401 as any)
      .mockResolvedValueOnce(mockResRefresh as any)
      .mockResolvedValueOnce(mockResRetry as any);

    const data = await client.get('/protected');
    expect(data).toEqual({ ok: true });
    expect(getAuthToken()).toBe('new-token');
  });

  it('client.postForm manda el FormData tal cual, sin fijar Content-Type', async () => {
    const mockRes = { ok: true, status: 201, json: vi.fn().mockResolvedValue({ id: 1 }) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const form = new FormData();
    form.append('file', new Blob(['x']), 'foto.jpg');
    await client.postForm('/compras/comprobantes', form);

    const [, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    const headers = init.headers as Headers;
    // El browser DEBE poner su propio Content-Type con el boundary del
    // multipart; si el cliente lo fijara a application/json, la subida se rompe.
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.has('Idempotency-Key')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(form);
  });

  it('client.patchForm manda el FormData tal cual, en PATCH, sin fijar Content-Type', async () => {
    const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 1 }) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const form = new FormData();
    form.append('razonSocial', 'Nuevo nombre');
    await client.patchForm('/facturacion/empresas/e-1', form);

    const [, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    const headers = init.headers as Headers;
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.has('Idempotency-Key')).toBe(true);
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(form);
  });

  it('client.getBlob devuelve un Blob sin pasar por res.json()', async () => {
    const blob = new Blob(['imagen']);
    const mockRes = { ok: true, status: 200, blob: vi.fn().mockResolvedValue(blob) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const result = await client.getBlob('/compras/comprobantes/cp-1/archivo');
    expect(result).toBe(blob);
  });

  it('handles 429 error', async () => {
    const mockRes429 = { ok: false, status: 429, statusText: 'Too Many Requests', json: vi.fn().mockResolvedValue({}) };
    vi.mocked(fetch).mockResolvedValue(mockRes429 as any);

    await expect(client.get('/test')).rejects.toThrow(/Demasiadas solicitudes/);
  });

  describe('retry con backoff', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('reintenta un GET tras un error de red y termina en éxito', async () => {
      const mockOk = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 1 }) };
      vi.mocked(fetch)
        .mockRejectedValueOnce(new TypeError('network error'))
        .mockResolvedValueOnce(mockOk as any);

      const promise = client.get('/test');
      await vi.advanceTimersByTimeAsync(2000);
      const data = await promise;

      expect(data).toEqual({ id: 1 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('reintenta un GET tras un 5xx y termina en éxito', async () => {
      const mockRes500 = { ok: false, status: 500, statusText: 'Internal Server Error', json: vi.fn().mockResolvedValue({}) };
      const mockOk = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 1 }) };
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockRes500 as any)
        .mockResolvedValueOnce(mockOk as any);

      const promise = client.get('/test');
      await vi.advanceTimersByTimeAsync(2000);
      const data = await promise;

      expect(data).toEqual({ id: 1 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('agota los reintentos de un GET y termina en error', async () => {
      const mockRes500 = { ok: false, status: 500, statusText: 'Internal Server Error', json: vi.fn().mockResolvedValue({}) };
      vi.mocked(fetch).mockResolvedValue(mockRes500 as any);

      const promise = client.get('/test');
      // Evitar rechazo no manejado mientras avanzan los timers de los reintentos.
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(10000);
      await expect(promise).rejects.toThrow('Internal Server Error');

      // 1 intento inicial + 2 reintentos = 3 llamadas a fetch.
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('no reintenta un PATCH (sin Idempotency-Key) tras un 5xx', async () => {
      const mockRes500 = { ok: false, status: 500, statusText: 'Internal Server Error', json: vi.fn().mockResolvedValue({}) };
      vi.mocked(fetch).mockResolvedValue(mockRes500 as any);

      await expect(client.patch('/test', { a: 1 })).rejects.toThrow('Internal Server Error');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('no reintenta un 4xx aunque el request sea un GET', async () => {
      const mockRes404 = { ok: false, status: 404, statusText: 'Not Found', json: vi.fn().mockResolvedValue({}) };
      vi.mocked(fetch).mockResolvedValue(mockRes404 as any);

      await expect(client.get('/test')).rejects.toThrow('Not Found');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('agota los reintentos de un GET tras errores de red persistentes y termina en ApiError(0)', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('network error persistente'));

      const promise = client.get('/test');
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(10000);
      // T-01: el fallo de red crudo se presenta como "sin respuesta" con status 0.
      await expect(promise).rejects.toMatchObject({ status: 0 });
      await expect(promise).rejects.toThrow('El servidor no responde');

      // 1 intento inicial + 2 reintentos = 3 llamadas a fetch.
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('un timeout de petición termina en ApiError(0) tras agotar reintentos (T-06)', async () => {
      // ponytail: AbortSignal.timeout usa un timer interno que los fake timers de
      // vitest no controlan, así que simulamos el corte del servidor colgado con
      // el mismo error que produce el abort: TimeoutError. Verifica el contrato
      // "timeout -> tras reintentos -> ApiError(0)".
      const timeoutErr = new DOMException('The operation timed out.', 'TimeoutError');
      vi.mocked(fetch).mockRejectedValue(timeoutErr);

      const promise = client.get('/lento');
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(10000);

      await expect(promise).rejects.toMatchObject({ status: 0 });
      await expect(promise).rejects.toThrow('El servidor no responde');
      // 1 intento inicial + 2 reintentos = 3 llamadas a fetch.
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('mapea un 503 del gateway a mensaje humano y conserva el body crudo en detalle', async () => {
      const mockRes503 = { ok: false, status: 503, statusText: 'Service Unavailable', json: vi.fn().mockResolvedValue({ message: 'name resolution failed' }) };
      vi.mocked(fetch).mockResolvedValue(mockRes503 as any);

      const promise = client.get('/test');
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(10000);

      // El .message es el texto amigable; el crudo de Kong queda en body.detalle.
      await expect(promise).rejects.toMatchObject({
        status: 503,
        message: 'El servicio no está disponible en este momento.',
      });
      await promise.catch((err) => {
        expect((err.body as { detalle: { message: string } }).detalle.message).toBe('name resolution failed');
      });
    });

    it('reintenta un POST (lleva Idempotency-Key) tras un 5xx', async () => {
      const mockRes500 = { ok: false, status: 500, statusText: 'Internal Server Error', json: vi.fn().mockResolvedValue({}) };
      const mockOk = { ok: true, status: 201, json: vi.fn().mockResolvedValue({ id: 2 }) };
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockRes500 as any)
        .mockResolvedValueOnce(mockOk as any);

      const promise = client.post('/test', { name: 'Foo' });
      await vi.advanceTimersByTimeAsync(2000);
      const data = await promise;

      expect(data).toEqual({ id: 2 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('sede scoping (T-23: multi-sede)', () => {
    function lastUrl(): string {
      return vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
    }

    it('un usuario pineado a una sede nunca manda sedeId, aunque haya una seleccionada', async () => {
      const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue([]) };
      vi.mocked(fetch).mockResolvedValue(mockRes as any);

      setUsuarioSedeId('sede-fija');
      setSedeSeleccionada('sede-elegida');
      await client.get('/mesas');

      expect(lastUrl()).not.toContain('sedeId=');
    });

    it('el admin general sin sede seleccionada no manda sedeId', async () => {
      const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue([]) };
      vi.mocked(fetch).mockResolvedValue(mockRes as any);

      setUsuarioSedeId(null);
      await client.get('/mesas');

      expect(lastUrl()).not.toContain('sedeId=');
    });

    it('el admin general con sede seleccionada la agrega como query param en rutas scopeadas', async () => {
      const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue([]) };
      vi.mocked(fetch).mockResolvedValue(mockRes as any);

      setUsuarioSedeId(null);
      setSedeSeleccionada('sede-abc');
      await client.get('/mesas');

      expect(lastUrl()).toContain('sedeId=sede-abc');
    });

    it('no toca rutas fuera del allowlist scopeado', async () => {
      const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue([]) };
      vi.mocked(fetch).mockResolvedValue(mockRes as any);

      setUsuarioSedeId(null);
      setSedeSeleccionada('sede-abc');
      // /reportes queda deliberadamente fuera del allowlist (T-23 Fase 2):
      // usa su propio filtro de sede opcional, no la auto-inyección.
      await client.get('/reportes/resumen');

      expect(lastUrl()).not.toContain('sedeId=');
    });

    it('agrega el sedeId con & cuando la ruta ya trae otros query params', async () => {
      const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue([]) };
      vi.mocked(fetch).mockResolvedValue(mockRes as any);

      setUsuarioSedeId(null);
      setSedeSeleccionada('sede-abc');
      await client.get('/inventario/mermas?limit=10');

      expect(lastUrl()).toContain('limit=10&sedeId=sede-abc');
    });

    it('no pisa un sedeId explícito que ya viene en la ruta', async () => {
      const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue([]) };
      vi.mocked(fetch).mockResolvedValue(mockRes as any);

      setUsuarioSedeId(null);
      setSedeSeleccionada('sede-abc');
      await client.get('/mesas?sedeId=otra-sede');

      expect(lastUrl()).toContain('sedeId=otra-sede');
      expect(lastUrl()).not.toContain('sedeId=sede-abc');
    });

    it('/compras entra en el allowlist sede-scoped', async () => {
      const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue([]) };
      vi.mocked(fetch).mockResolvedValue(mockRes as any);

      setUsuarioSedeId(null);
      setSedeSeleccionada('sede-abc');
      await client.get('/compras/resumen');

      expect(lastUrl()).toContain('sedeId=sede-abc');
    });

    it('setSedeSeleccionada persiste en localStorage y getSedeSeleccionada la expone', () => {
      setSedeSeleccionada('sede-persistida');
      expect(getSedeSeleccionada()).toBe('sede-persistida');
      expect(localStorage.getItem('restoapp.sede_seleccionada')).toBe('sede-persistida');

      setSedeSeleccionada(null);
      expect(getSedeSeleccionada()).toBeNull();
      expect(localStorage.getItem('restoapp.sede_seleccionada')).toBeNull();
    });
  });
});

