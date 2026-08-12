// @ts-nocheck
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function readWorkspaceFile(...segments: string[]) {
  return readFileSync(join(workspaceRoot, ...segments), 'utf8');
}

describe('cobertura de guards HTTP mutantes', () => {
  it.each([
    'servicio-mesas',
    'servicio-pedidos',
    'servicio-cuentas',
    'servicio-reservas',
    'servicio-inventario',
    'servicio-caja',
    'servicio-reportes',
  ])('%s usa JwtAuthGuard global compartido', (serviceName) => {
    const moduleSource = readWorkspaceFile(
      'apps',
      serviceName,
      'src',
      'app',
      'app.module.ts',
    );

    expect(moduleSource).toContain("import { APP_GUARD } from '@nestjs/core'");
    expect(moduleSource).toContain(
      "import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth'",
    );
    expect(moduleSource).toMatch(
      /\{\s*provide:\s*APP_GUARD,\s*useClass:\s*JwtAuthGuard\s*\}/,
    );
  });

  it('identidad protege logout cookie-only y mutaciones administrativas', () => {
    const controllerSource = readWorkspaceFile(
      'apps',
      'servicio-identidad',
      'src',
      'auth',
      'auth.controller.ts',
    );

    expect(controllerSource).toMatch(
      /@UseGuards\(JwtAuthGuard\)\s+@Post\('auth\/logout'\)/,
    );
    expect(controllerSource).toMatch(
      /@UseGuards\(JwtAuthGuard,\s*RolesGuard\)\s+@Roles\('ADMIN'\)\s+@Post\('usuarios'\)/,
    );
    expect(controllerSource).toMatch(
      /@UseGuards\(JwtAuthGuard,\s*RolesGuard\)\s+@Roles\('ADMIN'\)\s+@Patch\('usuarios\/:id\/rol'\)/,
    );
  });

  it('ya no expone auth/validate (T-02: oráculo de tokens eliminado)', () => {
    const controllerSource = readWorkspaceFile(
      'apps',
      'servicio-identidad',
      'src',
      'auth',
      'auth.controller.ts',
    );

    expect(controllerSource).not.toContain("auth/validate");
    expect(controllerSource).not.toMatch(/async validate\(/);
  });
});

describe('autorización por rol (RBAC) alineada con el mapa de vistas del PWA', () => {
  function readController(service: string) {
    return readWorkspaceFile('apps', service, 'src', 'app', 'app.controller.ts');
  }

  it.each([
    'servicio-mesas',
    'servicio-caja',
    'servicio-cuentas',
    'servicio-reservas',
    'servicio-inventario',
    'servicio-pedidos',
    'servicio-reportes',
  ])('%s aplica RolesGuard/Roles importados de @org/shared-auth', (service) => {
    const source = readController(service);
    expect(source).toMatch(
      /import\s*\{[^}]*\bRolesGuard\b[^}]*\}\s*from\s*'@org\/shared-auth'/,
    );
    expect(source).toMatch(
      /import\s*\{[^}]*\bRoles\b[^}]*\}\s*from\s*'@org\/shared-auth'/,
    );
  });

  it('restringe cada servicio al conjunto de roles que lo alcanzan en el PWA', () => {
    expect(readController('servicio-mesas')).toContain(
      "@Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'RECEPCION')",
    );
    expect(readController('servicio-caja')).toContain(
      "@Roles('ADMIN', 'SISTEMA', 'CAJERO')",
    );
    expect(readController('servicio-cuentas')).toContain(
      "@Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'RECEPCION')",
    );
    expect(readController('servicio-reservas')).toContain(
      "@Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'MESERO', 'RECEPCION')",
    );
    expect(readController('servicio-inventario')).toContain(
      "@Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'CAJERO', 'MESERO', 'COCINA')",
    );
  });

  it('reserva el alta de mesas a administración', () => {
    expect(readController('servicio-mesas')).toMatch(
      /@Roles\('ADMIN', 'SISTEMA'\)\s+@Post\(\)/,
    );
  });

  it('inventario deja leer el catálogo a sala pero reserva las mutaciones a administración', () => {
    const source = readController('servicio-inventario');
    expect(source).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'GERENCIA'\)\s+@Post\('categorias'\)/,
    );
    expect(source).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'GERENCIA'\)\s+@Post\('productos'\)/,
    );
    expect(source).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'GERENCIA'\)\s+@Patch\('productos\/:id\/stock'\)/,
    );
    expect(source).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'GERENCIA'\)\s+@Patch\('productos\/:id'\)/,
    );
  });

  it('pedidos autoriza por método para convivir con los handlers RMQ', () => {
    const source = readController('servicio-pedidos');
    // Sin guard de roles a nivel de clase: rompería los @EventPattern.
    expect(source).not.toMatch(/@Roles\([^)]*\)\s+@Controller\(\)/);
    // Crear pedido: meseros y cajeros, sin cocina.
    expect(source).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO'\)\s+@Post\(\)/,
    );
    // Listar / actualizar estado: incluye cocina (KDS).
    expect(source).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA'\)\s+@Get\(\)/,
    );
    expect(source).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA'\)\s+@Patch\(':id\/estado'\)/,
    );
  });

  it('reportes protege el resumen para administración y gerencia', () => {
    expect(readController('servicio-reportes')).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'GERENCIA'\)\s+@Get\('resumen'\)/,
    );
  });

  it('identidad permite la lectura de usuarios a ADMIN, SISTEMA y GERENCIA', () => {
    const source = readWorkspaceFile(
      'apps',
      'servicio-identidad',
      'src',
      'auth',
      'auth.controller.ts',
    );
    expect(source).toMatch(
      /@Roles\('ADMIN', 'SISTEMA', 'GERENCIA'\)\s+@Get\('usuarios'\)/,
    );
  });

  it('notificaciones permanece accesible a cualquier autenticado (lo consume el Header)', () => {
    const source = readWorkspaceFile(
      'apps',
      'servicio-notificaciones',
      'src',
      'app',
      'app.controller.ts',
    );
    expect(source).not.toContain('RolesGuard');
  });
});
