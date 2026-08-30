import { createHash } from 'node:crypto';
import { createWriteStream, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import https from 'node:https';
import http from 'node:http';

const root = resolve(import.meta.dirname, '../..');
const resources = resolve(root, 'apps/escritorio/src-tauri/resources/runtime');
const cache = resolve(root, '.cache/tauri-local');
const versions = JSON.parse(readFileSync(join(import.meta.dirname, 'runtime-versions.json'), 'utf8'));
const skipBuilds = process.argv.includes('--skip-builds');
const services = [
  'servicio-identidad', 'servicio-mesas', 'servicio-pedidos', 'servicio-cuentas',
  'servicio-reservas', 'servicio-inventario', 'servicio-notificaciones', 'servicio-caja',
  'servicio-reportes', 'servicio-facturacion', 'servicio-compras',
];

function assertInside(path, parent) {
  const normalized = resolve(path);
  const normalizedParent = resolve(parent);
  if (!normalized.startsWith(`${normalizedParent}${sep}`)) throw new Error(`Ruta destructiva fuera del destino permitido: ${normalized}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32', ...options });
  if (result.status !== 0) throw new Error(`${command} terminó con código ${result.status}: ${result.error?.message ?? 'sin detalle'}`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function download(url, destination) {
  if (existsSync(destination)) return;
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.download`;
  await new Promise((resolveDownload, reject) => {
    const request = (url.startsWith('https:') ? https : http).get(url, { headers: { 'User-Agent': 'RestoApp-Packager/1.0' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination).then(resolveDownload, reject);
        return;
      }
      if (response.statusCode !== 200) { reject(new Error(`Descarga ${url}: HTTP ${response.statusCode}`)); return; }
      const output = createWriteStream(temporary);
      response.pipe(output);
      output.on('finish', () => { output.close(); renameSync(temporary, destination); resolveDownload(); });
      output.on('error', reject);
    });
    request.on('error', reject);
  });
}

async function verifiedAsset(key, extension) {
  const item = versions[key];
  const path = join(cache, `${key}-${item.version}${extension}`);
  await download(item.url, path);
  const actual = sha256(path);
  if (actual !== item.sha256) throw new Error(`SHA-256 inválido para ${key}: ${actual}`);
  return path;
}

function findFile(directory, filename) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return path;
    if (entry.isDirectory()) { const found = findFile(path, filename); if (found) return found; }
  }
}

function runtimeDependencies() {
  const dependencies = { ...JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies };
  for (const name of services) {
    Object.assign(dependencies, JSON.parse(readFileSync(join(root, 'apps', name, 'package.json'), 'utf8')).dependencies ?? {});
  }
  for (const name of Object.keys(dependencies)) {
    if (name.startsWith('@org/') || dependencies[name] === '*') delete dependencies[name];
  }
  return dependencies;
}

async function main() {
  assertInside(resources, resolve(root, 'apps/escritorio/src-tauri/resources'));
  rmSync(resources, { recursive: true, force: true });
  mkdirSync(resources, { recursive: true });
  writeFileSync(join(resources, 'README.txt'), 'Este directorio se completa con `nx run escritorio:prepare`.\nLos binarios portables y builds generados no se versionan.\n');
  mkdirSync(cache, { recursive: true });

  if (!skipBuilds) {
    for (const name of services) {
      run('npm.cmd', ['exec', 'prisma', 'generate', '--', '--schema', `apps/${name}/prisma/schema.prisma`]);
    }
    run('npm.cmd', ['exec', 'nx', 'run-many', '--', '--target=build', `--projects=${services.join(',')}`, '--parallel=3', '--skipNxCache', '--skipSync']);
    run('npm.cmd', ['exec', 'nx', 'run', 'runtime-local:build:production', '--', '--skipNxCache']);
    run('npm.cmd', ['exec', 'nx', 'run', 'pwa-cliente:build', '--', '--skipNxCache', '--skipSync'], { env: { ...process.env, VITE_API_BASE_URL: '' } });
  }

  cpSync(join(root, 'dist/apps/runtime-local'), join(resources, 'runtime-local'), { recursive: true });
  cpSync(join(root, 'apps/pwa-cliente/dist'), join(resources, 'pwa'), { recursive: true });
  for (const name of services) {
    cpSync(join(root, 'dist/apps', name), join(resources, 'services', name), { recursive: true });
    cpSync(join(root, 'apps', name, 'prisma', 'migrations'), join(resources, 'migrations', name, 'migrations'), { recursive: true });
  }

  const node = await verifiedAsset('node', '.exe');
  mkdirSync(join(resources, 'node'), { recursive: true });
  cpSync(node, join(resources, 'node', 'node.exe'));

  const postgresZip = await verifiedAsset('postgres', '.zip');
  const postgresExtract = join(cache, `postgres-${versions.postgres.version}`);
  assertInside(postgresExtract, cache);
  if (!existsSync(join(postgresExtract, 'pgsql', 'bin', 'postgres.exe'))) {
    rmSync(postgresExtract, { recursive: true, force: true }); mkdirSync(postgresExtract, { recursive: true });
    run('tar.exe', ['-xf', postgresZip, '-C', postgresExtract]);
  }
  for (const extra of ['pgAdmin 4', 'StackBuilder']) rmSync(join(postgresExtract, 'pgsql', extra), { recursive: true, force: true });
  cpSync(join(postgresExtract, 'pgsql'), join(resources, 'postgres'), { recursive: true });

  const natsZip = await verifiedAsset('nats', '.zip');
  const natsExtract = join(cache, `nats-${versions.nats.version}`);
  assertInside(natsExtract, cache);
  if (!existsSync(natsExtract)) { mkdirSync(natsExtract, { recursive: true }); run('tar.exe', ['-xf', natsZip, '-C', natsExtract]); }
  const natsBinary = findFile(natsExtract, 'nats-server.exe');
  if (!natsBinary) throw new Error('El ZIP oficial de NATS no contiene nats-server.exe');
  mkdirSync(join(resources, 'nats'), { recursive: true }); cpSync(natsBinary, join(resources, 'nats', 'nats-server.exe'));

  writeFileSync(join(resources, 'package.json'), `${JSON.stringify({ private: true, name: 'restoapp-local-runtime', version: '1.0.0', dependencies: runtimeDependencies() }, null, 2)}\n`);
  run('npm.cmd', ['install', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false'], { cwd: resources });

  const manifest = { app: 'La Barra del Ceviche', platform: 'RestoApp', createdAt: new Date().toISOString(), services, versions, files: {} };
  for (const path of [join(resources, 'node/node.exe'), join(resources, 'nats/nats-server.exe'), join(resources, 'postgres/bin/postgres.exe'), join(resources, 'runtime-local/main.js')]) {
    manifest.files[path.slice(resources.length + 1).replaceAll('\\', '/')] = { sha256: sha256(path), size: statSync(path).size };
  }
  writeFileSync(join(resources, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Runtime local preparado: ${services.length} microservicios en ${resources}\n`);
}

await main();
