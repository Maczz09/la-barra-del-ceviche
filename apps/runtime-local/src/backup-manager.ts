import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { RuntimeConfig } from './runtime-config';
import type { RuntimePaths } from './runtime-paths';
import { SERVICE_DEFINITIONS } from './service-definitions';
import { postgresConnectionString } from './postgres-runtime';

export interface BackupResult {
  path: string;
  createdAt: string;
  databases: string[];
}

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function run(binary: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(binary, args, { env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`${basename(binary)} falló: ${result.stderr || result.stdout}`);
}

export class BackupManager {
  constructor(private readonly paths: RuntimePaths, private readonly config: RuntimeConfig) {}

  create(): BackupResult {
    const createdAt = new Date().toISOString();
    const name = `la-barra-del-ceviche_${stamp()}`;
    const staging = join(this.paths.backups, `${name}.tmp`);
    const archive = join(this.paths.backups, `${name}.zip`);
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(join(staging, 'databases'), { recursive: true });

    for (const service of SERVICE_DEFINITIONS) {
      run(join(this.paths.postgresBin, 'pg_dump.exe'), [
        '--format=custom', '--no-owner', '--no-acl',
        '--file', join(staging, 'databases', `${service.database}.dump`),
        postgresConnectionString(this.config, service.database),
      ]);
    }

    copyFileSync(this.paths.configFile, join(staging, 'runtime-config.json'));
    if (existsSync(this.paths.printQueueFile)) copyFileSync(this.paths.printQueueFile, join(staging, 'print-queue.json'));
    if (existsSync(this.paths.uploads)) cpSync(this.paths.uploads, join(staging, 'comprobantes'), { recursive: true });
    writeFileSync(join(staging, 'manifest.json'), `${JSON.stringify({
      version: 1, app: 'La Barra del Ceviche', createdAt,
      databases: SERVICE_DEFINITIONS.map((service) => service.database),
    }, null, 2)}\n`);

    run('tar.exe', ['-a', '-c', '-f', archive, '-C', staging, '.']);
    rmSync(staging, { recursive: true, force: true });
    return { path: archive, createdAt, databases: SERVICE_DEFINITIONS.map((service) => service.database) };
  }

  validateArchive(archive: string): void {
    if (!archive.toLowerCase().endsWith('.zip') || !existsSync(archive)) throw new Error('El respaldo no existe o no es ZIP');
    const result = spawnSync('tar.exe', ['-tf', archive], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0 || !result.stdout.includes('manifest.json')) throw new Error('El archivo no es un respaldo válido de RestoApp');
  }

  list(): Array<{ name: string; path: string; size: number; createdAt: string }> {
    if (!existsSync(this.paths.backups)) return [];
    return readdirSync(this.paths.backups, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.zip'))
      .map((entry) => {
        const path = join(this.paths.backups, entry.name);
        const stat = statSync(path);
        return { name: entry.name, path, size: stat.size, createdAt: stat.birthtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
