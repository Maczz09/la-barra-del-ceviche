import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Client } from 'pg';
import type { RuntimeConfig } from './runtime-config';
import type { RuntimePaths } from './runtime-paths';
import { serviceMigrations } from './runtime-paths';
import { POSTGRES_PORT, SERVICE_DEFINITIONS, assertSafeDatabaseName } from './service-definitions';

export function postgresConnectionString(config: RuntimeConfig, database: string): string {
  return `postgresql://${encodeURIComponent(config.dbUser)}:${encodeURIComponent(config.dbPassword)}@127.0.0.1:${POSTGRES_PORT}/${assertSafeDatabaseName(database)}?schema=public`;
}

function run(binary: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(binary, args, { env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`${binary} falló (${result.status}): ${result.stderr || result.stdout}`);
  }
}

export function initializePostgres(paths: RuntimePaths, config: RuntimeConfig): void {
  const versionFile = join(paths.postgresData, 'PG_VERSION');
  if (existsSync(versionFile)) return;
  mkdirSync(paths.postgresData, { recursive: true });
  const passwordFile = join(paths.data, '.pg-init-password');
  writeFileSync(passwordFile, config.dbPassword, { mode: 0o600 });
  try {
    run(join(paths.postgresBin, 'initdb.exe'), [
      '-D', paths.postgresData,
      '-U', config.dbUser,
      '--pwfile', passwordFile,
      '--auth-host=scram-sha-256',
      '--auth-local=trust',
      '--encoding=UTF8',
      '--locale=C',
    ]);
  } finally {
    rmSync(passwordFile, { force: true });
  }
}

export async function waitForPostgres(config: RuntimeConfig, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  let lastError = 'sin respuesta';
  while (Date.now() - started < timeoutMs) {
    const client = new Client({ connectionString: postgresConnectionString(config, 'postgres') });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch (error) {
      lastError = String(error);
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`PostgreSQL no quedó listo: ${lastError}`);
}

export async function ensureDatabasesAndMigrations(paths: RuntimePaths, config: RuntimeConfig): Promise<void> {
  const admin = new Client({ connectionString: postgresConnectionString(config, 'postgres') });
  await admin.connect();
  try {
    const existing = await admin.query<{ datname: string }>('SELECT datname FROM pg_database');
    const names = new Set(existing.rows.map((row) => row.datname));
    for (const service of SERVICE_DEFINITIONS) {
      if (!names.has(service.database)) await admin.query(`CREATE DATABASE "${assertSafeDatabaseName(service.database)}"`);
    }
  } finally {
    await admin.end();
  }

  for (const service of SERVICE_DEFINITIONS) {
    await applyMigrations(paths, config, service.name, service.database);
  }
}

async function applyMigrations(paths: RuntimePaths, config: RuntimeConfig, service: string, database: string): Promise<void> {
  const directory = serviceMigrations(paths, service);
  if (!existsSync(directory)) throw new Error(`No se encontraron migraciones de ${service}: ${directory}`);
  const client = new Client({ connectionString: postgresConnectionString(config, database) });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS restoapp_local_migrations (
      migration TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query<{ migration: string; checksum: string }>('SELECT migration, checksum FROM restoapp_local_migrations');
    const known = new Map(applied.rows.map((row) => [row.migration, row.checksum]));
    for (const migration of readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
      const sqlFile = join(directory, migration, 'migration.sql');
      if (!existsSync(sqlFile)) continue;
      const sql = readFileSync(sqlFile, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (known.get(migration) === checksum) continue;
      if (known.has(migration)) throw new Error(`La migración ${service}/${migration} cambió después de aplicarse`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO restoapp_local_migrations (migration, checksum) VALUES ($1, $2)', [migration, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}
