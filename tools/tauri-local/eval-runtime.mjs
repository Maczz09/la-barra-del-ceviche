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
const runtimePathsSource = read('apps', 'runtime-local', 'src', 'runtime-paths.ts');
const apiClientSource = read('apps', 'pwa-cliente', 'src', 'api', 'client.ts');
const authApiSource = read('apps', 'pwa-cliente', 'src', 'api', 'auth.api.ts');
const mdnsSource = read('apps', 'runtime-local', 'src', 'mdns-responder.ts');
const backupSource = read('apps', 'runtime-local', 'src', 'backup-manager.ts');
const postgresSource = read('apps', 'runtime-local', 'src', 'postgres-runtime.ts');
const supervisorSource = read('apps', 'runtime-local', 'src', 'process-supervisor.ts');
const kitchenSubscriberSource = read('apps', 'runtime-local', 'src', 'kitchen-print-subscriber.ts');
const printer = read('apps', 'escritorio', 'src-tauri', 'src', 'printer.rs');
const desktopSource = read('apps', 'escritorio', 'src-tauri', 'src', 'lib.rs');
const installerHooks = read('apps', 'escritorio', 'src-tauri', 'windows', 'hooks.nsh');
const tauri = JSON.parse(read('apps', 'escritorio', 'src-tauri', 'tauri.conf.json'));

check('manifiesto identifica La Barra del Ceviche', manifest.app === 'La Barra del Ceviche');
check('manifiesto conserva plataforma RestoApp', manifest.platform === 'RestoApp');
check('exactamente 11 microservicios empaquetados', manifest.services.length === 11);
check('definiciones mantienen 11 procesos independientes', (serviceDefinitions.match(/name: 'servicio-/g) ?? []).length === 11);
check('gateway público usa puerto fijo 3210', serviceDefinitions.includes('GATEWAY_PORT = 3210'));
check('microservicios locales usan rango privado separado de Docker', serviceDefinitions.includes('LOCAL_SERVICE_PORT_BASE = 23201') && !/port: 30(?:0[1-9]|1[0-2])/.test(serviceDefinitions));
check('arranque rechaza puertos internos ocupados', runtimeSource.includes('assertPortsAvailable') && runtimeSource.includes('está ocupado'));
check('URL estable usa el hostname local', runtimeSource.includes('LOCAL_HOSTNAME') && runtimeSource.includes('GATEWAY_PORT'));
check('administración queda restringida a loopback', gateway.includes('isLoopbackAddress(request.socket.remoteAddress)'));
check('impresión usa el spooler RAW de Windows', printer.includes('WritePrinter') && printer.includes('data_type: raw.as_ptr()'));
check('instalador NSIS es por máquina', tauri.bundle.windows.nsis.installMode === 'perMachine');
check('WebView2 queda disponible sin Internet', tauri.bundle.windows.webviewInstallMode.type === 'embedBootstrapper');
check('recursos portables conservan su jerarquía en el bundle', tauri.bundle.resources['resources/runtime/'] === 'runtime/' && !Object.keys(tauri.bundle.resources).some((path) => path.includes('*')));
check('un fallo de arranque queda visible y registrado', desktopSource.includes('RESTOAPP_DESKTOP_FATAL') && desktopSource.includes('No se pudo iniciar el servidor'));
check('Node inicia con ruta relativa segura para carpetas con espacios', desktopSource.includes('command.current_dir(&runtime_directory)') && desktopSource.includes('.arg("main.js")'));
check('rutas extendidas de Windows se normalizan antes de iniciar PostgreSQL', runtimePathsSource.includes('normalizeWindowsExtendedPath') && runtimePathsSource.includes("value.startsWith('\\\\\\\\?\\\\')"));
check('dependencias de ejecución de Prisma están instaladas', existsSync(join(runtime, 'node_modules', '@prisma', 'client-runtime-utils', 'package.json')));
check('cliente envía el access token como Bearer', apiClientSource.includes("headers.set('Authorization', `Bearer ${authToken}`)"));
check('sesión restaurada reconstruye el Bearer antes del perfil', authApiSource.includes('await refreshAccessToken()') && authApiSource.includes("client.get<UserDto>('/identidad/auth/me')"));
check('mDNS anuncia solo la interfaz LAN principal', mdnsSource.includes('primaryLanAddress()') && !mdnsSource.includes('listPrivateIpv4().map'));
check('firewall permite la subred local aun con perfil público', installerHooks.includes('remoteip=localsubnet profile=any'));
check('respaldos usan una URL compatible con pg_dump', backupSource.includes('postgresCliConnectionString') && postgresSource.includes('postgresCliConnectionString'));
check('gateway fuerza el cierre de conexiones persistentes', gateway.includes('closeAllConnections()') && gateway.includes('closeIdleConnections()'));
check('NATS no puede bloquear indefinidamente el apagado', kitchenSubscriberSource.includes('closeNatsConnection') && kitchenSubscriberSource.includes('Promise.race'));
check('Windows termina cada árbol de procesos administrado', supervisorSource.includes("'/T', '/F'") && supervisorSource.includes("execFile('taskkill.exe'"));

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
