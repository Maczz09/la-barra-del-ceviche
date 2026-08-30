import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const runtime = join(root, 'apps', 'escritorio', 'src-tauri', 'resources', 'runtime');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const checks = [];

function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

const manifest = JSON.parse(readFileSync(join(runtime, 'runtime-manifest.json'), 'utf8'));
const serviceDefinitions = read('apps', 'runtime-local', 'src', 'service-definitions.ts');
const gateway = read('apps', 'runtime-local', 'src', 'gateway.ts');
const runtimeSource = read('apps', 'runtime-local', 'src', 'local-runtime.ts');
const printer = read('apps', 'escritorio', 'src-tauri', 'src', 'printer.rs');
const tauri = JSON.parse(read('apps', 'escritorio', 'src-tauri', 'tauri.conf.json'));

check('manifiesto identifica La Barra del Ceviche', manifest.app === 'La Barra del Ceviche');
check('manifiesto conserva plataforma RestoApp', manifest.platform === 'RestoApp');
check('exactamente 11 microservicios empaquetados', manifest.services.length === 11);
check('definiciones mantienen 11 procesos independientes', (serviceDefinitions.match(/name: 'servicio-/g) ?? []).length === 11);
check('gateway público usa puerto fijo 3210', serviceDefinitions.includes('GATEWAY_PORT = 3210'));
check('URL estable usa el hostname local', runtimeSource.includes('LOCAL_HOSTNAME') && runtimeSource.includes('GATEWAY_PORT'));
check('administración queda restringida a loopback', gateway.includes('isLoopbackAddress(request.socket.remoteAddress)'));
check('impresión usa el spooler RAW de Windows', printer.includes('WritePrinter') && printer.includes('data_type: raw.as_ptr()'));
check('instalador NSIS es por máquina', tauri.bundle.windows.nsis.installMode === 'perMachine');
check('WebView2 queda disponible sin Internet', tauri.bundle.windows.webviewInstallMode.type === 'embedBootstrapper');
check('recursos portables están incluidos en el bundle', tauri.bundle.resources['resources/runtime/**/*'] === 'runtime/');

for (const service of manifest.services) {
  check(`${service}: build presente`, existsSync(join(runtime, 'services', service, 'apps', service, 'src', 'main.js')));
  check(`${service}: migraciones presentes`, existsSync(join(runtime, 'migrations', service, 'migrations')));
}

for (const [relativePath, expected] of Object.entries(manifest.files)) {
  const absolutePath = join(runtime, ...relativePath.split('/'));
  check(`${relativePath}: recurso presente`, existsSync(absolutePath));
  const hash = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
  check(`${relativePath}: checksum válido`, hash === expected.sha256);
}

console.log(`EVAL_RUNTIME_OK ${checks.length} verificaciones`);
