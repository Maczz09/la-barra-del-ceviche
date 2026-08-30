import { SERVICE_DEFINITIONS, assertSafeDatabaseName, serviceByGatewayPath } from './service-definitions';

describe('definiciones del runtime local', () => {
  it('mantiene 11 microservicios con puertos, bases y rutas exclusivas', () => {
    expect(SERVICE_DEFINITIONS).toHaveLength(11);
    expect(new Set(SERVICE_DEFINITIONS.map((service) => service.port)).size).toBe(11);
    expect(new Set(SERVICE_DEFINITIONS.map((service) => service.database)).size).toBe(11);
    expect(new Set(SERVICE_DEFINITIONS.map((service) => service.gatewayPath)).size).toBe(11);
  });

  it('resuelve el gateway sin exponer puertos al cliente', () => {
    expect(serviceByGatewayPath('pedidos')?.name).toBe('servicio-pedidos');
    expect(serviceByGatewayPath('desconocido')).toBeUndefined();
  });

  it('rechaza nombres de base que permitan inyección SQL', () => {
    expect(assertSafeDatabaseName('pedidos_db')).toBe('pedidos_db');
    expect(() => assertSafeDatabaseName('pedidos_db; DROP DATABASE')).toThrow(/inválido/);
  });
});
