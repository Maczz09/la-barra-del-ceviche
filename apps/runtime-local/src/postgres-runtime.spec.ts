import type { RuntimeConfig } from './runtime-config';
import { postgresCliConnectionString, postgresConnectionString } from './postgres-runtime';

const config = {
  dbUser: 'resto app',
  dbPassword: 'clave#segura',
} as RuntimeConfig;

describe('cadenas de conexión PostgreSQL', () => {
  it('mantiene el schema de Prisma en la conexión de la aplicación', () => {
    expect(postgresConnectionString(config, 'identidad')).toBe(
      'postgresql://resto%20app:clave%23segura@127.0.0.1:55432/identidad?schema=public',
    );
  });

  it('omite parámetros de Prisma en la URL usada por pg_dump', () => {
    const connection = postgresCliConnectionString(config, 'identidad');

    expect(connection).toBe(
      'postgresql://resto%20app:clave%23segura@127.0.0.1:55432/identidad',
    );
    expect(connection).not.toContain('schema=');
  });

  it('rechaza nombres de base de datos inseguros también para herramientas CLI', () => {
    expect(() => postgresCliConnectionString(config, 'identidad?sslmode=disable')).toThrow();
  });
});
