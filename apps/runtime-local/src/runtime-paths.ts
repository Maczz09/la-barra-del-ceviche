import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

export interface RuntimePaths {
  readonly workspaceRoot?: string;
  readonly resources: string;
  readonly data: string;
  readonly logs: string;
  readonly backups: string;
  readonly uploads: string;
  readonly postgresData: string;
  readonly natsData: string;
  readonly pwa: string;
  readonly node: string;
  readonly postgresBin: string;
  readonly natsServer: string;
  readonly services: string;
  readonly migrations: string;
  readonly configFile: string;
  readonly printQueueFile: string;
}

function defaultDataDirectory(): string {
  const base = process.env['LOCALAPPDATA'] || process.env['APPDATA'];
  if (base) return join(base, 'La Barra del Ceviche');
  return resolve(process.cwd(), '.local-data');
}

export function normalizeWindowsExtendedPath(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return value;
  if (value.startsWith('\\\\?\\UNC\\')) return `\\\\${value.slice(8)}`;
  if (value.startsWith('\\\\?\\')) return value.slice(4);
  return value;
}

export function resolveRuntimePaths(): RuntimePaths {
  const workspaceRootValue = process.env['RESTOAPP_WORKSPACE_ROOT'];
  const workspaceRoot = workspaceRootValue ? normalizeWindowsExtendedPath(workspaceRootValue) : undefined;
  const resources = resolve(normalizeWindowsExtendedPath(process.env['RESTOAPP_RESOURCES_DIR'] || (workspaceRoot ? workspaceRoot : dirname(process.execPath))));
  const data = resolve(normalizeWindowsExtendedPath(process.env['RESTOAPP_DATA_DIR'] || defaultDataDirectory()));
  const packagedRuntime = join(resources, 'runtime');
  const packaged = existsSync(packagedRuntime);
  const runtimeRoot = packaged ? packagedRuntime : resources;

  const paths: RuntimePaths = {
    workspaceRoot,
    resources,
    data,
    logs: join(data, 'logs'),
    backups: join(data, 'backups'),
    uploads: join(data, 'comprobantes'),
    postgresData: join(data, 'postgres'),
    natsData: join(data, 'nats'),
    pwa: packaged ? join(runtimeRoot, 'pwa') : join(resources, 'apps', 'pwa-cliente', 'dist'),
    node: packaged ? join(runtimeRoot, 'node', 'node.exe') : process.execPath,
    postgresBin: join(runtimeRoot, 'postgres', 'bin'),
    natsServer: join(runtimeRoot, 'nats', process.platform === 'win32' ? 'nats-server.exe' : 'nats-server'),
    services: packaged ? join(runtimeRoot, 'services') : join(resources, 'dist', 'apps'),
    migrations: packaged ? join(runtimeRoot, 'migrations') : join(resources, 'apps'),
    configFile: join(data, 'runtime-config.json'),
    printQueueFile: join(data, 'print-queue.json'),
  };

  for (const directory of [paths.data, paths.logs, paths.backups, paths.uploads, paths.natsData]) {
    mkdirSync(directory, { recursive: true });
  }
  return paths;
}

export function serviceEntry(paths: RuntimePaths, serviceName: string): string {
  return join(paths.services, serviceName, 'apps', serviceName, 'src', 'main.js');
}

export function serviceMigrations(paths: RuntimePaths, serviceName: string): string {
  return paths.workspaceRoot
    ? join(paths.migrations, serviceName, 'prisma', 'migrations')
    : join(paths.migrations, serviceName, 'migrations');
}
