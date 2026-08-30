import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createConnection } from 'node:net';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { BackupManager } from './backup-manager';
import { LocalGateway, type RuntimeAdminApi } from './gateway';
import { KitchenPrintSubscriber } from './kitchen-print-subscriber';
import { createAdministrator, hasAdministrator, type CreateAdminInput } from './onboarding';
import { listPrivateIpv4, localServerUrl, primaryLanAddress } from './network-info';
import { ProcessSupervisor } from './process-supervisor';
import { DurablePrintQueue } from './print-queue';
import { ensureDatabasesAndMigrations, initializePostgres, postgresConnectionString, waitForPostgres } from './postgres-runtime';
import { loadOrCreateRuntimeConfig, saveRuntimeConfig, type PrinterConfig, type RuntimeConfig } from './runtime-config';
import { resolveRuntimePaths, serviceEntry, type RuntimePaths } from './runtime-paths';
import { GATEWAY_PORT, NATS_MONITOR_PORT, NATS_PORT, POSTGRES_PORT, SERVICE_DEFINITIONS } from './service-definitions';
import { LOCAL_HOSTNAME, MdnsResponder } from './mdns-responder';

interface HealthState { ok: boolean; checkedAt: string; error?: string; latencyMs?: number }

export class LocalRuntime implements RuntimeAdminApi {
  readonly paths: RuntimePaths = resolveRuntimePaths();
  readonly config: RuntimeConfig = loadOrCreateRuntimeConfig(this.paths);
  private readonly supervisor = new ProcessSupervisor(this.paths.logs);
  private readonly queue = new DurablePrintQueue(this.paths);
  private readonly backupManager = new BackupManager(this.paths, this.config);
  private readonly health = new Map<string, HealthState>();
  private readonly startedAt = new Date().toISOString();
  private readonly lockFile = join(this.paths.data, 'runtime.lock');
  private lockHandle?: number;
  private gateway?: LocalGateway;
  private printerSubscriber?: KitchenPrintSubscriber;
  private readonly mdns = new MdnsResponder();
  private healthTimer?: NodeJS.Timeout;
  private backupTimer?: NodeJS.Timeout;
  private shuttingDown = false;

  async start(): Promise<void> {
    this.acquireLock();
    if (process.env['RESTOAPP_SKIP_CHILDREN'] !== '1') {
      this.assertPackagedResources();
      initializePostgres(this.paths, this.config);
      this.startPostgres();
      this.startNats();
      await Promise.all([
        waitForPostgres(this.config),
        waitForPort(NATS_PORT, 30_000),
      ]);
      await ensureDatabasesAndMigrations(this.paths, this.config);
      this.startServices();
      await this.waitForServicesHealthy(180_000);
      this.printerSubscriber = new KitchenPrintSubscriber(
        `nats://127.0.0.1:${NATS_PORT}`,
        this.queue,
        () => this.config.printer,
      );
      await this.printerSubscriber.start();
    }

    this.gateway = new LocalGateway(this.paths.pwa, this);
    await this.gateway.start(GATEWAY_PORT);
    this.mdns.start();
    this.healthTimer = setInterval(() => void this.refreshHealth(), 5_000);
    this.healthTimer.unref();
    this.scheduleDailyBackup();
    await this.refreshHealth();
    process.stdout.write(`RESTOAPP_READY ${JSON.stringify(this.safeInfo())}\n`);
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    if (this.healthTimer) clearInterval(this.healthTimer);
    if (this.backupTimer) clearTimeout(this.backupTimer);
    await this.gateway?.close();
    this.mdns.close();
    await this.printerSubscriber?.close();
    await this.supervisor.stopAll();
    this.releaseLock();
  }

  safeInfo() {
    const primary = primaryLanAddress();
    return {
      app: 'La Barra del Ceviche',
      platform: 'RestoApp',
      url: `http://${LOCAL_HOSTNAME}:${GATEWAY_PORT}`,
      ipUrl: localServerUrl(GATEWAY_PORT),
      loopbackUrl: `http://127.0.0.1:${GATEWAY_PORT}`,
      port: GATEWAY_PORT,
      primaryAddress: primary ? { interface: primary.name, address: primary.address, mac: primary.mac } : null,
      addresses: listPrivateIpv4().map((address) => ({ interface: address.name, address: address.address, mac: address.mac })),
      dhcpReservationRequired: true,
      serverId: createHash('sha256').update(this.config.jwtPublicKey).digest('hex').slice(0, 16),
    };
  }

  async status() {
    return {
      ...(this.safeInfo()),
      startedAt: this.startedAt,
      uptimeSeconds: Math.floor((Date.now() - Date.parse(this.startedAt)) / 1000),
      processes: this.supervisor.status().map((processStatus) => ({
        ...processStatus,
        health: this.health.get(processStatus.name),
      })),
      devices: this.gateway?.connectedDevices() ?? [],
      printer: this.printerConfig(),
      printQueue: this.queue.summary(),
      onboardingComplete: await hasAdministrator(this.config).catch(() => false),
      dataDirectory: this.paths.data,
    };
  }

  async restart(name: string): Promise<void> { await this.supervisor.restart(name); }
  createBackup() { return this.backupManager.create(); }
  listBackups() { return this.backupManager.list(); }

  printerConfig() {
    return { config: this.config.printer, available: listWindowsPrinters() };
  }

  updatePrinter(input: unknown) {
    const value = input as Partial<PrinterConfig>;
    const paperWidth = value.paperWidth === 58 ? 58 : 80;
    const copies = Math.max(1, Math.min(3, Number(value.copies ?? 1)));
    const printerName = String(value.printerName ?? '').trim();
    this.config.printer = { enabled: Boolean(value.enabled), printerName, paperWidth, copies };
    saveRuntimeConfig(this.paths, this.config);
    return this.printerConfig();
  }

  nextPrintJob() { return this.queue.takeNext(this.config.printer); }
  completePrintJob(id: string): void { this.queue.complete(id); }
  failPrintJob(id: string, error: string): void { this.queue.fail(id, error); }
  retryPrintJob(id: string): void { this.queue.retry(id); }
  printSummary() { return this.queue.summary(); }
  async onboardingStatus() { return { complete: await hasAdministrator(this.config) }; }
  async createAdmin(input: unknown): Promise<void> { await createAdministrator(this.config, input as CreateAdminInput); }
  requestShutdown(): void {
    setTimeout(() => void this.shutdown().finally(() => process.exit(0)), 100).unref();
  }

  private startPostgres(): void {
    this.supervisor.start({
      name: 'postgresql', executable: join(this.paths.postgresBin, 'postgres.exe'),
      args: [
        '-D', this.paths.postgresData, '-p', String(POSTGRES_PORT), '-h', '127.0.0.1',
        '-c', 'max_connections=180', '-c', 'shared_buffers=128MB',
        '-c', 'fsync=on', '-c', 'synchronous_commit=on', '-c', 'full_page_writes=on',
      ],
      cwd: this.paths.postgresBin,
    });
  }

  private startNats(): void {
    this.supervisor.start({
      name: 'nats-jetstream', executable: this.paths.natsServer,
      args: ['-js', '-sd', this.paths.natsData, '-a', '127.0.0.1', '-p', String(NATS_PORT), '-m', String(NATS_MONITOR_PORT)],
      cwd: dirname(this.paths.natsServer),
    });
  }

  private startServices(): void {
    const origins = [
      `http://127.0.0.1:${GATEWAY_PORT}`, `http://localhost:${GATEWAY_PORT}`,
      `http://${LOCAL_HOSTNAME}:${GATEWAY_PORT}`,
      ...listPrivateIpv4().map((address) => `http://${address.address}:${GATEWAY_PORT}`),
    ].join(',');
    const selected = process.env['RESTOAPP_ONLY_SERVICES']
      ? new Set(process.env['RESTOAPP_ONLY_SERVICES'].split(',').map((name) => name.trim()))
      : null;
    for (const service of SERVICE_DEFINITIONS) {
      if (selected && !selected.has(service.name)) continue;
      const entry = serviceEntry(this.paths, service.name);
      this.supervisor.start({
        name: service.name,
        executable: this.paths.node,
        args: [entry],
        cwd: dirname(entry),
        env: {
          NODE_ENV: 'production', NODE_OPTIONS: service.name === 'servicio-compras' ? '--max-old-space-size=320' : '--max-old-space-size=256',
          PORT: String(service.port), SERVICE_NAME: service.name, SERVICE_AUD_ENFORCE: 'true',
          DATABASE_URL: postgresConnectionString(this.config, service.database),
          LOCAL_BROKER_URL: `nats://127.0.0.1:${NATS_PORT}`,
          JWT_PRIVATE_KEY: this.config.jwtPrivateKey,
          JWT_PUBLIC_KEY: this.config.jwtPublicKey,
          SERVICE_JWT_SECRET: this.config.serviceJwtSecret,
          JWT_EXPIRES_IN: '15m', REFRESH_TOKEN_TTL_DAYS: '7',
          COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'strict', CORS_ORIGIN: origins,
          OTEL_SDK_DISABLED: 'true', OUTBOX_BATCH_SIZE: '50', RMQ_PREFETCH: '5',
          PG_POOL_MAX: service.name === 'servicio-compras' ? '10' : '15',
          PG_POOL_CONN_TIMEOUT_MS: '10000', PG_TX_MAXWAIT_MS: '10000', PG_TX_TIMEOUT_MS: '30000',
          FACTURACION_CRED_ENCRYPTION_KEY: this.config.facturacionEncryptionKey,
          COMPROBANTES_DIR: this.paths.uploads,
          SUNAT_WSDL_URL: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl',
          ...service.environment,
        },
      });
    }
  }

  private async refreshHealth(): Promise<void> {
    const targets = [
      { name: 'postgresql', url: undefined },
      { name: 'nats-jetstream', url: `http://127.0.0.1:${NATS_MONITOR_PORT}/healthz` },
      ...SERVICE_DEFINITIONS.map((service) => ({ name: service.name, url: `http://127.0.0.1:${service.port}/api/health/live` })),
    ];
    await Promise.all(targets.map(async (target) => {
      const before = Date.now();
      try {
        if (target.name === 'postgresql') await waitForPostgres(this.config, 1_000);
        else {
          const response = await fetch(target.url!, { signal: AbortSignal.timeout(1_500) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
        this.health.set(target.name, { ok: true, checkedAt: new Date().toISOString(), latencyMs: Date.now() - before });
      } catch (error) {
        this.health.set(target.name, { ok: false, checkedAt: new Date().toISOString(), error: String(error), latencyMs: Date.now() - before });
      }
    }));
  }

  private async waitForServicesHealthy(timeoutMs: number): Promise<void> {
    const selected = process.env['RESTOAPP_ONLY_SERVICES']
      ? new Set(process.env['RESTOAPP_ONLY_SERVICES'].split(',').map((name) => name.trim()))
      : null;
    const services = selected ? SERVICE_DEFINITIONS.filter((service) => selected.has(service.name)) : SERVICE_DEFINITIONS;
    const pending = new Set(services.map((service) => service.name));
    const started = Date.now();
    while (pending.size > 0 && Date.now() - started < timeoutMs) {
      await Promise.all(services.filter((service) => pending.has(service.name)).map(async (service) => {
        try {
          const response = await fetch(`http://127.0.0.1:${service.port}/api/health/live`, { signal: AbortSignal.timeout(1_500) });
          if (response.ok) pending.delete(service.name);
        } catch { /* El supervisor sigue iniciando o reiniciando el proceso. */ }
      }));
      if (pending.size > 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (pending.size > 0) throw new Error(`No iniciaron a tiempo: ${[...pending].join(', ')}`);
  }

  private scheduleDailyBackup(): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    this.backupTimer = setTimeout(() => {
      try { this.backupManager.create(); } finally { this.scheduleDailyBackup(); }
    }, next.getTime() - now.getTime());
    this.backupTimer.unref();
  }

  private assertPackagedResources(): void {
    const required = [this.paths.node, this.paths.natsServer, join(this.paths.postgresBin, 'postgres.exe'), this.paths.pwa];
    for (const path of required) if (!existsSync(path)) throw new Error(`Falta recurso del runtime: ${path}`);
    for (const service of SERVICE_DEFINITIONS) {
      const entry = serviceEntry(this.paths, service.name);
      if (!existsSync(entry)) throw new Error(`Falta el build de ${service.name}: ${entry}`);
    }
  }

  private acquireLock(): void {
    try {
      this.lockHandle = openSync(this.lockFile, 'wx');
      writeFileSync(this.lockHandle, String(process.pid));
    } catch {
      const existingPid = Number(readFileSync(this.lockFile, 'utf8'));
      try {
        process.kill(existingPid, 0);
        throw new Error(`El servidor local ya está ejecutándose (PID ${existingPid})`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('El servidor local')) throw error;
        rmSync(this.lockFile, { force: true });
        this.lockHandle = openSync(this.lockFile, 'wx');
        writeFileSync(this.lockHandle, String(process.pid));
      }
    }
  }

  private releaseLock(): void {
    if (this.lockHandle != null) closeSync(this.lockHandle);
    rmSync(this.lockFile, { force: true });
  }
}

function listWindowsPrinters(): string[] {
  if (process.platform !== 'win32') return [];
  try {
    const raw = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "@(Get-Printer | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress",
    ], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string | string[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { return []; }
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`El puerto local ${port} no quedó disponible`);
}
