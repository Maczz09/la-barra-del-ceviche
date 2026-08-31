export interface ServiceDefinition {
  readonly name: string;
  readonly port: number;
  readonly database: string;
  readonly gatewayPath: string;
  readonly environment?: Readonly<Record<string, string>>;
}

export const POSTGRES_PORT = 55432;
export const NATS_PORT = 4222;
export const NATS_MONITOR_PORT = 8222;
export const GATEWAY_PORT = 3210;

// Rango privado de la edición de escritorio. Los puertos 3001-3012 son los
// defaults del monorepo en Docker y pueden estar ocupados por otro proyecto
// durante el desarrollo. Compartirlos hacía que el gateway local terminara
// hablando con contenedores ajenos sin detectarlo.
export const LOCAL_SERVICE_PORT_BASE = 23201;

export const SERVICE_DEFINITIONS: readonly ServiceDefinition[] = [
  { name: 'servicio-identidad', port: 23201, database: 'identidad_db', gatewayPath: 'identidad' },
  { name: 'servicio-mesas', port: 23202, database: 'mesas_db', gatewayPath: 'mesas' },
  {
    name: 'servicio-pedidos', port: 23203, database: 'pedidos_db', gatewayPath: 'pedidos',
    environment: {
      INVENTARIO_SERVICE_URL: 'http://127.0.0.1:23206/api',
      MESAS_SERVICE_URL: 'http://127.0.0.1:23202/api',
      CUENTAS_SERVICE_URL: 'http://127.0.0.1:23204/api',
    },
  },
  {
    name: 'servicio-cuentas', port: 23204, database: 'cuentas_db', gatewayPath: 'cuentas',
    environment: {
      PEDIDOS_SERVICE_URL: 'http://127.0.0.1:23203/api',
      MESAS_SERVICE_URL: 'http://127.0.0.1:23202/api',
    },
  },
  { name: 'servicio-reservas', port: 23205, database: 'reservas_db', gatewayPath: 'reservas' },
  { name: 'servicio-inventario', port: 23206, database: 'inventario_db', gatewayPath: 'inventario' },
  { name: 'servicio-notificaciones', port: 23207, database: 'notificaciones_db', gatewayPath: 'notificaciones' },
  {
    name: 'servicio-caja', port: 23208, database: 'caja_db', gatewayPath: 'caja',
    environment: { CUENTAS_SERVICE_URL: 'http://127.0.0.1:23204/api' },
  },
  { name: 'servicio-reportes', port: 23209, database: 'reportes_db', gatewayPath: 'reportes' },
  { name: 'servicio-facturacion', port: 23210, database: 'facturacion_db', gatewayPath: 'facturacion' },
  { name: 'servicio-compras', port: 23211, database: 'compras_db', gatewayPath: 'compras' },
] as const;

export const SERVICE_NAMES = SERVICE_DEFINITIONS.map((service) => service.name);

export function serviceByGatewayPath(path: string): ServiceDefinition | undefined {
  return SERVICE_DEFINITIONS.find((service) => service.gatewayPath === path);
}

export function assertSafeDatabaseName(name: string): string {
  if (!/^[a-z][a-z0-9_]+$/.test(name)) throw new Error(`Nombre de base inválido: ${name}`);
  return name;
}
