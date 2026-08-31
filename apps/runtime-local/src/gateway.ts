import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import httpProxy from 'http-proxy';
import mime from 'mime-types';
import { GATEWAY_PORT, serviceByGatewayPath } from './service-definitions';
import { isLoopbackAddress } from './network-info';

export interface RuntimeAdminApi {
  safeInfo(): unknown;
  status(): Promise<unknown>;
  restart(name: string): Promise<void>;
  createBackup(): unknown;
  listBackups(): unknown;
  printerConfig(): unknown;
  updatePrinter(input: unknown): unknown;
  nextPrintJob(): unknown;
  completePrintJob(id: string): void;
  failPrintJob(id: string, error: string): void;
  retryPrintJob(id: string): void;
  printSummary(): unknown;
  onboardingStatus(): Promise<unknown>;
  createAdmin(input: unknown): Promise<void>;
  requestShutdown(): void;
}

export interface DeviceSeen { address: string; lastSeen: string; requests: number; userAgent?: string }

export interface ServiceProxyRoute { target: string; path: string }

export function closeHttpServer(server: http.Server, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolveClose) => {
    let settled = false;
    let timeout: NodeJS.Timeout;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveClose();
    };
    timeout = setTimeout(() => {
      server.closeAllConnections();
      finish();
    }, timeoutMs);
    server.close(finish);
    server.closeIdleConnections();
  });
}

export function resolveServiceProxy(pathname: string, search = ''): ServiceProxyRoute | undefined {
  const versioned = /^\/v1\/([^/]+)(\/.*)?$/.exec(pathname);
  const direct = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const match = versioned ?? direct;
  if (!match) return undefined;
  const service = serviceByGatewayPath(match[1]);
  if (!service) return undefined;
  return {
    target: `http://127.0.0.1:${service.port}`,
    path: `/api${match[2] ?? ''}${search}`,
  };
}

function notificationTarget(): string {
  const notificationService = serviceByGatewayPath('notificaciones');
  if (!notificationService) throw new Error('No está definido servicio-notificaciones');
  return `http://127.0.0.1:${notificationService.port}`;
}

const proxy = httpProxy.createProxyServer({ xfwd: true, ws: true });
proxy.on('error', (_error, _request, response) => {
  if ('writeHead' in response) {
    response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'Servicio local temporalmente no disponible' }));
  }
});

export class LocalGateway {
  private server?: http.Server;
  private readonly devices = new Map<string, DeviceSeen>();

  constructor(private readonly pwaDirectory: string, private readonly admin: RuntimeAdminApi) {}

  async start(port = GATEWAY_PORT): Promise<void> {
    this.server = http.createServer((request, response) => void this.handle(request, response));
    this.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const notificationPrefix = url.pathname.startsWith('/v1/notificaciones')
        ? '/v1/notificaciones'
        : url.pathname.startsWith('/notificaciones') ? '/notificaciones' : null;
      if (!notificationPrefix) {
        socket.destroy();
        return;
      }
      request.url = request.url?.replace(notificationPrefix, '/api');
      proxy.ws(request, socket, head, { target: notificationTarget() });
    });
    await new Promise<void>((resolveStart, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(port, '0.0.0.0', () => resolveStart());
    });
  }

  async close(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    await closeHttpServer(server);
  }

  connectedDevices(): DeviceSeen[] {
    const cutoff = Date.now() - 5 * 60_000;
    return [...this.devices.values()].filter((device) => Date.parse(device.lastSeen) >= cutoff);
  }

  private track(request: IncomingMessage): void {
    const address = request.socket.remoteAddress ?? 'desconocido';
    const previous = this.devices.get(address);
    this.devices.set(address, {
      address,
      lastSeen: new Date().toISOString(),
      requests: (previous?.requests ?? 0) + 1,
      userAgent: request.headers['user-agent'],
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.track(request);
    this.securityHeaders(response);
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/local-info' && request.method === 'GET') return this.json(response, 200, await this.admin.safeInfo());
    if (url.pathname.startsWith('/local-admin/')) {
      if (!isLoopbackAddress(request.socket.remoteAddress)) return this.json(response, 403, { message: 'Administración disponible solo en la laptop servidor' });
      return this.handleAdmin(request, response, url);
    }

    const serviceRoute = resolveServiceProxy(url.pathname, url.search);
    if (serviceRoute) {
      request.url = serviceRoute.path;
      proxy.web(request, response, { target: serviceRoute.target });
      return;
    }
    if (url.pathname.startsWith('/notificaciones')) {
      request.url = request.url?.replace(/^\/notificaciones/, '/api');
      proxy.web(request, response, { target: notificationTarget() });
      return;
    }
    return this.serveStatic(url.pathname, response);
  }

  private async handleAdmin(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    try {
      if (url.pathname === '/local-admin/status' && request.method === 'GET') return this.json(response, 200, await this.admin.status());
      if (url.pathname === '/local-admin/backups' && request.method === 'GET') return this.json(response, 200, await this.admin.listBackups());
      if (url.pathname === '/local-admin/backups' && request.method === 'POST') return this.json(response, 201, await this.admin.createBackup());
      if (url.pathname === '/local-admin/printer' && request.method === 'GET') return this.json(response, 200, this.admin.printerConfig());
      if (url.pathname === '/local-admin/printer' && request.method === 'PUT') return this.json(response, 200, await this.admin.updatePrinter(await readJson(request)));
      if (url.pathname === '/local-admin/print' && request.method === 'GET') return this.json(response, 200, this.admin.printSummary());
      if (url.pathname === '/local-admin/print/next' && request.method === 'GET') return this.json(response, 200, this.admin.nextPrintJob());
      if (url.pathname === '/local-admin/onboarding' && request.method === 'GET') return this.json(response, 200, await this.admin.onboardingStatus());
      if (url.pathname === '/local-admin/onboarding' && request.method === 'POST') {
        await this.admin.createAdmin(await readJson(request));
        return this.json(response, 201, { ok: true });
      }
      if (url.pathname === '/local-admin/shutdown' && request.method === 'POST') {
        this.admin.requestShutdown();
        return this.json(response, 202, { ok: true });
      }
      const restart = /^\/local-admin\/processes\/([^/]+)\/restart$/.exec(url.pathname);
      if (restart && request.method === 'POST') {
        await this.admin.restart(decodeURIComponent(restart[1]));
        return this.json(response, 202, { ok: true });
      }
      const printAction = /^\/local-admin\/print\/([^/]+)\/(complete|fail|retry)$/.exec(url.pathname);
      if (printAction && request.method === 'POST') {
        const [, id, action] = printAction;
        const body = action === 'fail' ? await readJson(request) as { error?: string } : {};
        if (action === 'complete') this.admin.completePrintJob(id);
        else if (action === 'retry') this.admin.retryPrintJob(id);
        else this.admin.failPrintJob(id, body.error ?? 'Error de impresión sin detalle');
        return this.json(response, 200, { ok: true });
      }
      return this.json(response, 404, { message: 'Acción local desconocida' });
    } catch (error) {
      return this.json(response, 400, { message: error instanceof Error ? error.message : String(error) });
    }
  }

  private serveStatic(pathname: string, response: ServerResponse): void {
    const normalized = pathname === '/' ? '/index.html' : pathname;
    let path = resolve(this.pwaDirectory, `.${normalized}`);
    const root = resolve(this.pwaDirectory);
    if (path !== root && !path.startsWith(`${root}${sep}`)) return this.json(response, 400, { message: 'Ruta inválida' });
    if (!existsSync(path) || statSync(path).isDirectory()) path = resolve(root, 'index.html');
    response.statusCode = 200;
    response.setHeader('Content-Type', mime.contentType(extname(path)) || 'application/octet-stream');
    response.setHeader('Cache-Control', path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
    createReadStream(path).pipe(response);
  }

  private securityHeaders(response: ServerResponse): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }

  private json(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('Solicitud demasiado grande');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
