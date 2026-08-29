/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
// api/client.ts — Wrapper delgado sobre fetch nativo con credentials: 'include'.
// Sin axios. Manejo centralizado de errores HTTP, 401, 429.

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
// Versionado de API (plan 6.2): el gateway expone /v1/{servicio}. Las rutas sin
// versión siguen activas como fallback durante la transición.
const API_VERSION_PREFIX = '/v1';
const LEGACY_AUTH_TOKEN_KEY = ['nachopps', 'access_token'].join('.');
const LEGACY_CSRF_COOKIE_KEY = ['nachopps', 'csrf_token'].join('.');
const CSRF_COOKIE_KEY = 'restoapp.csrf_token';
const CSRF_HEADER_KEY = 'X-CSRF-Token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
// La cookie vieja (httpOnly:false, sobrevive al rebrand porque el navegador
// no la borra solo) queda huérfana leyéndose junto a la nueva en DevTools.
// No la usa nadie; se limpia acá en vez de esperar a que expire sola.
document.cookie = `${LEGACY_CSRF_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;

let authToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAuthToken(token: string) {
  authToken = token;
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
}

export function getAuthToken() {
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
}

// ─── T-23 (multi-sede) ────────────────────────────────────────────
// Un usuario pineado a una sede no necesita mandar `sedeId`: el backend lo
// resuelve solo desde su JWT (y un valor del cliente se ignoraría de todos
// modos). Solo el admin general (sedeId nulo en su token) debe indicar en
// cuál sede quiere operar — esa elección vive acá, no en cada api/*.ts, para
// no tener que enhebrar `sedeId` por todos los hooks/pantallas scopeados.
const SEDE_SELECCIONADA_KEY = 'restoapp.sede_seleccionada';
const SEDE_SCOPED_PATH_PREFIXES = [
  '/mesas',
  '/inventario/categorias',
  '/inventario/productos',
  '/inventario/menu-diario',
  '/inventario/mermas',
  '/identidad/usuarios',
  '/pedidos',
  '/cuentas',
  '/caja',
  '/reservas',
  '/compras',
  '/identidad/sedes/actual',
];

let usuarioSedeId: string | null = null;
let sedeSeleccionada: string | null = localStorage.getItem(SEDE_SELECCIONADA_KEY);

/** Sede fija del usuario autenticado (null = admin general sin sede fija). Se fija en cada login/restore. */
export function setUsuarioSedeId(sedeId: string | null) {
  usuarioSedeId = sedeId;
}

/** Sede que el admin general eligió operar (navbar). Persiste entre sesiones. */
export function setSedeSeleccionada(sedeId: string | null) {
  sedeSeleccionada = sedeId;
  if (sedeId) localStorage.setItem(SEDE_SELECCIONADA_KEY, sedeId);
  else localStorage.removeItem(SEDE_SELECCIONADA_KEY);
}

export function getSedeSeleccionada(): string | null {
  return sedeSeleccionada;
}

function appendSedeParam(path: string): string {
  if (usuarioSedeId != null) return path; // pineado: el backend ya lo resuelve solo
  if (!sedeSeleccionada) return path;
  if (!SEDE_SCOPED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return path;
  if (/[?&]sedeId=/.test(path)) return path; // ya lo trae explícito (no pisarlo)
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}sedeId=${encodeURIComponent(sedeSeleccionada)}`;
}

function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (!c?.getRandomValues) {
    throw new Error('Web Crypto API no disponible para generar Idempotency-Key');
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getCookie(name: string) {
  const encodedName = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName));

  return match ? decodeURIComponent(match.slice(encodedName.length)) : null;
}

// ─── Error normalizado ─────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    const msg =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as Record<string, unknown>).message)
        : statusText;
    super(msg);
    this.name = 'ApiError';
  }
}

// Refresh tokens (plan 1.4): intenta renovar el access token con la cookie
// refresh_token httpOnly y guarda el access token solo en memoria.
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const csrf = getCookie(CSRF_COOKIE_KEY);
      const res = await fetch(`${BASE_URL}${API_VERSION_PREFIX}/identidad/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { [CSRF_HEADER_KEY]: csrf } : {},
        // Este fetch no pasa por fetchWithRetry; sin timeout un identidad colgado
        // estancaría la renovación de token. El catch de abajo devuelve null en
        // TimeoutError, degradando a "sesión expirada" como cualquier otro fallo.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body = await res.json() as { access_token?: string };
      if (!body.access_token) return null;
      setAuthToken(body.access_token);
      return body.access_token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function tryRefresh(): Promise<boolean> {
  return (await refreshAccessToken()) != null;
}

// ─── Request interno ────────────────────────────────────────────
function buildUrl(path: string): string {
  const versionedPath =
    path.startsWith('/') && !path.startsWith(`${API_VERSION_PREFIX}/`)
      ? `${API_VERSION_PREFIX}${path}`
      : path;
  return `${BASE_URL}${versionedPath}`;
}

function applyHeaders(headers: Headers, method: string, body?: BodyInit | null): void {
  // FormData: el browser DEBE poner su propio Content-Type con el boundary
  // del multipart. Fijarlo a application/json aquí rompería la subida de fotos.
  const esFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (!esFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const csrfToken = getCookie(CSRF_COOKIE_KEY);
  if (csrfToken && MUTATING_METHODS.has(method) && !headers.has(CSRF_HEADER_KEY)) {
    headers.set(CSRF_HEADER_KEY, csrfToken);
  }
}

// ─── Retry con backoff exponencial + jitter ─────────────────────
// Solo para requests seguros de reintentar: GET (siempre idempotente) o
// mutaciones que ya llevan Idempotency-Key (hoy, solo POST vía withIdempotencyKey).
// PATCH/DELETE no lo llevan y algunos representan deltas (p. ej. reponer stock),
// así que nunca se reintentan automáticamente para evitar aplicar el cambio dos veces.
// Nunca se reintenta en 4xx (incluye 401/429, que ya tienen su propio manejo).
const RETRY_MAX_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 300;
const RETRY_MAX_DELAY_MS = 2000;
// Demo fallida: la ruta PWA→Kong→cuentas no tenía timeout y quedaba colgada
// minutos. Cada intento se corta a los 8 s con AbortSignal.timeout; el corte
// cuenta como intento fallido para el retry (peor caso GET ≈ 3×8 s + backoffs).
// Si el llamador pasa su propia signal en init, se respeta esa en su lugar.
const REQUEST_TIMEOUT_MS = 8000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fracción [0, 1) para el jitter del backoff. No es un uso criptográfico —
// solo evita reintentos sincronizados entre clientes — pero se usa
// Web Crypto (ya usado en newIdempotencyKey) en vez de Math.random() para
// no disparar el hotspot de seguridad "PRNG inseguro" de SonarQube.
function randomFraction(): number {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) return 0;
  const bytes = new Uint32Array(1);
  c.getRandomValues(bytes);
  return bytes[0] / 0xffffffff;
}

function backoffDelay(attempt: number): number {
  const exp = RETRY_BASE_DELAY_MS * 2 ** attempt;
  const jitter = randomFraction() * RETRY_BASE_DELAY_MS;
  return Math.min(exp + jitter, RETRY_MAX_DELAY_MS);
}

function isRetryable(headers: Headers, method: string): boolean {
  return method === 'GET' || headers.has('Idempotency-Key');
}

// Un intento sin respuesta: timeout del AbortSignal (Timeout/AbortError) o fallo
// de red del fetch (TypeError). Se distingue del 5xx (que sí trae Response).
function isSinRespuesta(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const name = (err as { name?: string })?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

async function fetchWithRetry(url: string, init: RequestInit, retryable: boolean): Promise<Response> {
  const maxAttempts = retryable ? RETRY_MAX_ATTEMPTS : 0;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const signal = init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const res = await fetch(url, { ...init, signal });
      if (res.status >= 500 && attempt < maxAttempts) {
        await delay(backoffDelay(attempt));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < maxAttempts) {
        await delay(backoffDelay(attempt));
        continue;
      }
      // Tras agotar reintentos, el timeout y el fallo de red se presentan como
      // "sin respuesta" (status 0) con mensaje humano, nunca como el Error crudo.
      if (isSinRespuesta(err)) {
        throw new ApiError(0, 'Sin respuesta del servidor', {
          message: 'El servidor no responde. Verifica tu conexión o inténtalo de nuevo.',
        });
      }
      throw err;
    }
  }
}

async function parseErrorBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return { message: res.statusText };
  }
}

async function handleErrorResponse<T>(
  res: Response,
  path: string,
  url: string,
  init: RequestInit | undefined,
  retried: boolean,
): Promise<T> {
  const body = await parseErrorBody(res);

  if (res.status === 401) {
    const isAuthPath = /\/auth\/(refresh|login|logout)$/.test(path);
    if (!retried && !isAuthPath && (await tryRefresh())) {
      return request<T>(path, init, true);
    }
    clearAuthToken();
    if (!url.endsWith('/logout')) {
      globalThis.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new ApiError(res.status, res.statusText, body);
  }

  if (res.status === 429) {
    throw new ApiError(res.status, 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.', body);
  }

  // T-02: los errores de gateway/infra (Kong/nginx: 502/503/504) traen bodies
  // crudos como "name resolution failed". Se mapean a un mensaje humano; el body
  // original queda en `detalle` solo para depuración/console, nunca para la UI.
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new ApiError(res.status, res.statusText, {
      message: 'El servicio no está disponible en este momento.',
      detalle: body,
    });
  }

  throw new ApiError(res.status, res.statusText, body);
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const url = buildUrl(appendSedeParam(path));
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? 'GET').toUpperCase();
  applyHeaders(headers, method, init?.body);

  const res = await fetchWithRetry(url, { ...init, headers, credentials: 'include' }, isRetryable(headers, method));

  if (!res.ok) return handleErrorResponse<T>(res, path, url, init, retried);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Descarga binaria (foto del comprobante de compra): no pasa por res.json().
// Duplica el ciclo mínimo de refresh-en-401 de `request` porque su firma
// genérica siempre retry-a-JSON; aquí el contrato de salida es Blob.
async function requestBlob(path: string, init?: RequestInit, retried = false): Promise<Blob> {
  const url = buildUrl(appendSedeParam(path));
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? 'GET').toUpperCase();
  applyHeaders(headers, method, init?.body);

  const res = await fetchWithRetry(url, { ...init, headers, credentials: 'include' }, isRetryable(headers, method));

  if (res.status === 401) {
    if (!retried && (await tryRefresh())) {
      return requestBlob(path, init, true);
    }
    clearAuthToken();
    globalThis.dispatchEvent(new CustomEvent('auth:expired'));
    const body = await parseErrorBody(res);
    throw new ApiError(res.status, res.statusText, body);
  }
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ApiError(res.status, res.statusText, body);
  }
  return res.blob();
}

function withIdempotencyKey(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', newIdempotencyKey());
  }
  return { ...init, headers };
}

// ─── Helpers tipados ────────────────────────────────────────────
export const client = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'GET' }),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(
      path,
      withIdempotencyKey({
        ...init,
        method: 'POST',
        body: body == null ? undefined : JSON.stringify(body),
      }),
    ),

  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: 'PATCH',
      body: body == null ? undefined : JSON.stringify(body),
    }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'DELETE' }),

  // Subida de foto de comprobante (multipart/form-data). No JSON.stringify:
  // el FormData va tal cual, con Idempotency-Key para el mismo replay-safe
  // que el resto de POSTs.
  postForm: <T>(path: string, form: FormData, init?: RequestInit) =>
    request<T>(path, withIdempotencyKey({ ...init, method: 'POST', body: form })),

  // Edición con archivo opcional (ej. reemplazar el certificado SUNAT de una
  // empresa ya configurada) — mismo criterio que postForm, en PATCH.
  patchForm: <T>(path: string, form: FormData, init?: RequestInit) =>
    request<T>(path, withIdempotencyKey({ ...init, method: 'PATCH', body: form })),

  // Descarga binaria (foto del comprobante). No pasa por res.json().
  getBlob: (path: string, init?: RequestInit) => requestBlob(path, { ...init, method: 'GET' }),
};
