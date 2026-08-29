import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Zona horaria del negocio (restobar en Lima, UTC-5). Fija el TZ del runner para
// que los tests sensibles a la hora (p.ej. reportes ventasPorHora/turno) sean
// deterministas en cualquier máquina/CI, no dependientes del TZ del sistema.
process.env.TZ = 'America/Lima';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
          decoratorsBeforeExport: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2021',
      },
      module: {
        type: 'es6',
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  esbuild: false,
  // Desactivar oxc para suprimir el warning de vitest 3/4
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    // Los 9 servicios NestJS (pedidos, caja, cuentas, inventario, identidad,
    // mesas, reservas, notificaciones, reportes) NO van acá: cada uno corre
    // su propia suite completa vía Jest (`nx run <servicio>:test`, jest.config.ts
    // propio) y sus specs usan `jest.*` (incl. `jest.mock()`, que depende del
    // hoisting nativo de Jest). Barrerlos también aquí los hacía fallar
    // (vitest no define `jest` como global) sin ganar cobertura real — ya
    // corren, correctamente, por su cuenta.
    include: [
      'apps/pwa-cliente/src/**/*.spec.ts',
      'libs/shared-auth/src/**/*.spec.ts',
      'libs/resiliencia/src/**/*.spec.ts',
      'libs/contracts/src/**/*.spec.ts',
      'libs/observabilidad/src/**/*.spec.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*-e2e/**'],
    onConsoleLog: () => false,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'apps/pwa-cliente/src/**/*.ts',
        'libs/shared-auth/src/**/*.ts',
      ],
      exclude: [
        '**/*.spec.ts',
        '**/main.ts',
        '**/generated/**',
        '**/prisma/**',
        '**/filters/**',
        '**/types/**',
      ],
      // Pisos anti-regresión calibrados a la cobertura real actual del workspace
      // (medida sobre *.ts de shared-auth + pwa-cliente).
      // OBJETIVO: subir progresivamente hacia 80% a medida que se añaden pruebas.
      // No bajar estos números; solo subirlos cuando la cobertura real lo permita.
      // Escalón 1 (2026-06-07): +roles.guard, +helmet.config, +permisos,
      // +pedido.flow, +7 mappers PWA → ~43% branches, ~40% stmts.
      // Escalón 2 (2026-06-07): +outbox.processor ×7 servicios, +outbox-admin,
      // +outbox-alert → ~46% branches, ~54% stmts (medido en PR de rama).
      // Calibración dev→main (2026-06-07): al incluir todas las fuentes del
      // pwa-cliente (reescritura UI), el denominador de cobertura crece y los
      // porcentajes bajan ligeramente. Valores medidos en CI: stmts 52.88%,
      // lines 53.44%, branches 45.20%. Umbrales = medición − 1pp de margen.
      // Recalibración (2026-08-12): se sacaron los 9 servicios NestJS de
      // `include`/`coverage.include` (corrían duplicados e incompatibles bajo
      // vitest — ver comentario en `test.include` — ya tienen su propia
      // cobertura de Jest, que no se agrega a este reporte). El denominador
      // se achica a solo shared-auth + pwa-cliente; medido: stmts 43.3%,
      // lines 42.55%, branches 40.75%, functions 34.13%. Umbrales = medición
      // − ~1pp, no comparables con las cifras de escalones anteriores.
      thresholds: {
        branches: 39,
        functions: 33,
        lines: 41,
        statements: 42,
      },
    },
  },
});
