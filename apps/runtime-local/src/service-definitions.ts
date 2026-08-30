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

export const SERVICE_DEFINITIONS: readonly ServiceDefinition[] = [
  { name: 'servicio-identidad', port: 3001, database: 'identidad_db', gatewayPath: 'identidad' },
  { name: 'servicio-mesas', port: 3002, database: 'mesas_db', gatewayPath: 'mesas' },
  {
    name: 'servicio-pedidos', port: 3004, database: 'pedidos_db', gatewayPath: 'pedidos',
    environment: {
      INVENTARIO_SERVICE_URL: 'http://127.0.0.1:3007/api',
      MESAS_SERVICE_URL: 'http://127.0.0.1:3002/api',
      CUENTAS_SERVICE_URL: 'http://127.0.0.1:3005/api',
    },
  },
  {
    name: 'servicio-cuentas', port: 3005, database: 'cuentas_db', gatewayPath: 'cuentas',
    environment: {
      PEDIDOS_SERVICE_URL: 'http://127.0.0.1:3004/api',
      MESAS_SERVICE_URL: 'http://127.0.0.1:3002/api',
    },
  },
  { name: 'servicio-reservas', port: 3006, database: 'reservas_db', gatewayPath: 'reservas' },
  { name: 'servicio-inventario', port: 3007, database: 'inventario_db', gatewayPath: 'inventario' },
  { name: 'servicio-notificaciones', port: 3008, database: 'notificaciones_db', gatewayPath: 'notificaciones' },
  {
    name: 'servicio-caja', port: 3009, database: 'caja_db', gatewayPath: 'caja',
    environment: { CUENTAS_SERVICE_URL: 'http://127.0.0.1:3005/api' },
  },
  { name: 'servicio-reportes', port: 3010, database: 'reportes_db', gatewayPath: 'reportes' },
  { name: 'servicio-facturacion', port: 3011, database: 'facturacion_db', gatewayPath: 'facturacion' },
  { name: 'servicio-compras', port: 3012, database: 'compras_db', gatewayPath: 'compras' },
] as const;

export const SERVICE_NAMES = SERVICE_DEFINITIONS.map((service) => service.name);

export function serviceByGatewayPath(path: string): ServiceDefinition | undefined {
  return SERVICE_DEFINITIONS.find((service) => service.gatewayPath === path);
}

export function assertSafeDatabaseName(name: string): string {
  if (!/^[a-z][a-z0-9_]+$/.test(name)) throw new Error(`Nombre de base inválido: ${name}`);
  return name;
}
