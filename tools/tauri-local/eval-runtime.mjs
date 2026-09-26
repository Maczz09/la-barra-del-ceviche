import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultSizes, products as seedProducts } from './seed-la-barra.mjs';

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
const bootstrapSource = read('libs', 'observabilidad', 'src', 'bootstrap.ts');
const runtimePathsSource = read('apps', 'runtime-local', 'src', 'runtime-paths.ts');
const apiClientSource = read('apps', 'pwa-cliente', 'src', 'api', 'client.ts');
const authApiSource = read('apps', 'pwa-cliente', 'src', 'api', 'auth.api.ts');
const toastSource = read('apps', 'pwa-cliente', 'src', 'components', 'ui', 'ToastProvider.tsx');
const routerSource = read('apps', 'pwa-cliente', 'src', 'router', 'index.tsx');
const bookCssSource = read('apps', 'pwa-cliente', 'src', 'screens', 'carta-publica', 'book-carta.css');
const backupSource = read('apps', 'runtime-local', 'src', 'backup-manager.ts');
const postgresSource = read('apps', 'runtime-local', 'src', 'postgres-runtime.ts');
const supervisorSource = read('apps', 'runtime-local', 'src', 'process-supervisor.ts');
const kitchenSubscriberSource = read('apps', 'runtime-local', 'src', 'kitchen-print-subscriber.ts');
const printer = read('apps', 'escritorio', 'src-tauri', 'src', 'printer.rs');
const desktopSource = read('apps', 'escritorio', 'src-tauri', 'src', 'lib.rs');
const installerHooks = read('apps', 'escritorio', 'src-tauri', 'windows', 'hooks.nsh');
const cajaService = read('apps', 'servicio-caja', 'src', 'app', 'app.service.ts');
const cajaController = read('apps', 'servicio-caja', 'src', 'app', 'app.controller.ts');
const facturacionSchema = read('apps', 'servicio-facturacion', 'prisma', 'schema.prisma');
const facturacionMigration = read('apps', 'servicio-facturacion', 'prisma', 'migrations', '20260831233000_dos_ruc_por_sede', 'migration.sql');
const facturacionEnv = read('apps', 'servicio-facturacion', '.env.example');
const comandero = read('apps', 'pwa-cliente', 'src', 'components', 'comandero', 'Comandero.tsx');
const inventarioSchema = read('apps', 'servicio-inventario', 'prisma', 'schema.prisma');
const inventarioController = read('apps', 'servicio-inventario', 'src', 'app', 'app.controller.ts');
const inventarioContract = read('libs', 'contracts', 'src', 'domains', 'inventario.ts');
const carta = read('apps', 'pwa-cliente', 'src', 'screens', 'carta', 'CartaScreen.tsx');
const menuDiario = read('apps', 'pwa-cliente', 'src', 'screens', 'carta', 'MenuDiarioPanel.tsx');
const tauri = JSON.parse(read('apps', 'escritorio', 'src-tauri', 'tauri.conf.json'));

check('manifiesto identifica La Barra del Ceviche', manifest.app === 'La Barra del Ceviche');
check('manifiesto conserva plataforma RestoApp', manifest.platform === 'RestoApp');
check('exactamente 11 microservicios empaquetados', manifest.services.length === 11);
check('definiciones mantienen 11 procesos independientes', (serviceDefinitions.match(/name: 'servicio-/g) ?? []).length === 11);
check('gateway público usa puerto fijo 3210', serviceDefinitions.includes('GATEWAY_PORT = 3210'));
check('microservicios locales usan rango privado separado de Docker', serviceDefinitions.includes('LOCAL_SERVICE_PORT_BASE = 23201') && !/port: 30(?:0[1-9]|1[0-2])/.test(serviceDefinitions));
check('arranque rechaza puertos internos ocupados', runtimeSource.includes('assertPortsAvailable') && runtimeSource.includes('está ocupado'));
check('URL pública usa exclusivamente la IP LAN', runtimeSource.includes('url: localServerUrl(GATEWAY_PORT)') && !runtimeSource.includes('LOCAL_HOSTNAME'));
check('administración queda restringida a loopback', gateway.includes('isLoopbackAddress(request.socket.remoteAddress)'));
check('gateway acepta IP dinámica sin CORS obsoleto', gateway.includes('sanitizeInternalProxyHeaders') && gateway.includes('delete headers.origin'));
check('microservicios internos escuchan solo en loopback', runtimeSource.includes("HOST: '127.0.0.1'") && bootstrapSource.includes('app.listen(port, host)'));
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
check('PWA funciona en HTTP LAN sin crypto.randomUUID', !toastSource.includes('crypto.randomUUID') && !routerSource.includes('crypto.randomUUID'));
check('QR público abre la carta libro en escritorio', routerSource.includes("import('../screens/carta-publica/BookCartaScreen')") && routerSource.includes('<BookCartaScreen />'));
check('carta libro conserva paleta monocromática de La Barra', bookCssSource.includes('--cb-accent: #f5f5f5') && !bookCssSource.includes('--cb-gold'));
check('carta libro y logo incluidos en el runtime local', readdirSync(join(runtime, 'pwa', 'assets')).some((file) => /^BookCartaScreen-.*\.js$/.test(file)) && existsSync(join(runtime, 'pwa', 'logo.webp')));
check('firewall permite la subred local aun con perfil público', installerHooks.includes('remoteip=localsubnet profile=any'));
check('actualización detiene el servidor y la app antes de reemplazar binarios', installerHooks.includes('NSIS_HOOK_PREINSTALL') && installerHooks.includes('/local-admin/shutdown') && installerHooks.includes('la-barra-del-ceviche.exe'));
check('instalador y runtime no dependen de mDNS', !installerHooks.includes('firewall add rule name=\\"La Barra del Ceviche - RestoApp mDNS') && !runtimeSource.includes('LOCAL_HOSTNAME'));
check('pago combinado usa endpoint propio y una sola transacción DB', cajaController.includes("@Post('pagos/combinado')") && cajaService.includes('async registrarPagoCombinado') && cajaService.includes('const resultado = await this.prisma.$transaction'));
check('pago combinado conserva cada método en la cascada de operaciones', cajaService.includes('Pago combinado ${indice + 1}/${pagos.length}') && cajaService.includes('await prisma.movimientoCaja.create'));
check('facturación permite dos RUC enlazados a una sede', !facturacionSchema.includes('sedeId             String?  @unique') && facturacionSchema.includes('@@index([sedeId])') && facturacionMigration.includes('DROP INDEX IF EXISTS "empresas_sedeId_key"'));
check('facturador apunta a SUNAT producción', facturacionEnv.includes('e-factura.sunat.gob.pe') && !facturacionEnv.includes('e-beta.sunat.gob.pe'));
check('comandero comienza con tarjetas grandes de categorías', comandero.includes('cmd-category-tile') && comandero.includes('Elige una categoría') && comandero.includes("| null>(null)") && !comandero.includes('>Todos</button>'));
check('comandero permite volver sin reiniciar la comanda', comandero.includes('Volver a categorías') && comandero.includes('volverACategorias') && comandero.includes('const cmd = useComanda('));
check('comandero separa categorías por ID y conserva sus precios', comandero.includes('p.categoriaId') && comandero.includes('cat?.id || undefined') && comandero.includes('cmd-category-section') && comandero.includes('fmt(p.precio)'));
check('comandero no oculta carga y errores con caché de otras categorías', comandero.includes('cat === null ? catalogo.length : productosFiltrados.length') && comandero.includes('productosLength: productosVisiblesLength'));
// Smoke checks de integración. El comportamiento se evalúa en las suites
// indicadas abajo y la SQL real se ejecuta únicamente en PostgreSQL aislado.
check('inventario modela tamaños por sede y relación opcional', /model\s+TamanoPlato\s*\{[^}]*sedeId\s+String/s.test(inventarioSchema) && /tamanoId\s+String\?/.test(inventarioSchema) && /tamano\s+TamanoPlato\?/.test(inventarioSchema));
check('contrato aditivo incluye filtro y orden por tamaño', /CATALOGO_SCHEMA_VERSION\s*=\s*2\b/.test(inventarioContract) && /tamanoId\?:\s*string/.test(inventarioContract) && /ordenPorTamano\?:\s*boolean/.test(inventarioContract));
for (const [method, route] of [['Get', 'tamanos-plato'], ['Post', 'tamanos-plato'], ['Patch', 'tamanos-plato/:id'], ['Delete', 'tamanos-plato/:id']]) {
  check(`tamaños: ruta ${method.toUpperCase()} ${route}`, new RegExp(`@${method}\\(\\s*['"]${route}['"]\\s*\\)`).test(inventarioController));
}
check('API de tamaños usa la sede activa del cliente', apiClientSource.includes('/inventario/tamanos-plato'));
check('Carta y menú del día incorporan selector de tamaño', /<TamanosPlatoDrawer\b/.test(carta) && /<TamanoSelect\b/.test(carta) && /<TamanoSelect\b/.test(menuDiario));
check('comandero comparte grupos de tamaño entre carta y menú del día', (comandero.match(/<ComanderoSizeGroups\b/g) ?? []).length >= 2);
check('seed usa nombres base, presentaciones conocidas y precios válidos', seedProducts.length > 0 && seedProducts.every((product) => Number.isFinite(product.price) && product.price > 0 && (product.size === null || defaultSizes.some((size) => size.nombre === product.size)) && !/[·()]\s*(Personal|Mediana|Mediano|Grande|Familiar)/i.test(product.name)));
check('seed conserva una identidad distinta por categoría, plato y tamaño', new Set(seedProducts.map((product) => JSON.stringify([product.category, product.name, product.size]))).size === seedProducts.length);
check('seed listo dentro del instalador', existsSync(join(runtime, 'seed-la-barra.mjs')));
check('seed no sobreescribe platos existentes', !read('tools', 'tauri-local', 'seed-la-barra.mjs').includes('UPDATE "productos"'));
check('seed empaquetado coincide con la fuente', readFileSync(join(runtime, 'seed-la-barra.mjs')).equals(readFileSync(join(root, 'tools', 'tauri-local', 'seed-la-barra.mjs'))));
const previewSeed = spawnSync(join(runtime, 'node', 'node.exe'), [join(runtime, 'seed-la-barra.mjs'), '--preview'], { encoding: 'utf8', timeout: 10_000 });
check('seed inicia con el Node incluido y muestra 102 presentaciones sin tocar la base', previewSeed.status === 0 && /productos=102.*sin cambios/.test(previewSeed.stdout));
for (const relativePath of [
  'apps/servicio-inventario/prisma/migrations/20260902120000_tamanos_plato/migration.sql',
  'apps/servicio-inventario/prisma/eval-tamanos.mjs',
  'apps/servicio-inventario/src/app/tamanos-plato.spec.ts',
  'libs/contracts/src/tamanos-plato.spec.ts',
  'apps/pwa-cliente/src/screens/carta/TamanosPlatoDrawer.test.tsx',
  'apps/pwa-cliente/src/components/comandero/Comandero.spec.tsx',
  'apps/pwa-cliente/src/screens/carta-publica/agruparPorTamano.eval.test.ts',
  'apps/pwa-cliente/src/screens/carta-publica/useCartaSocket.spec.ts',
  'apps/servicio-pedidos/src/app/http-clients.breaker.spec.ts',
  'tools/tauri-local/seed-la-barra.test.mjs',
  'docs/tamanos-platos.md',
]) {
  check(`tamaños: evidencia presente ${relativePath}`, existsSync(join(root, relativePath)));
}
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
