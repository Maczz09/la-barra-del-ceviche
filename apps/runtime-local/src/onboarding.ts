import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Client } from 'pg';
import type { RuntimeConfig } from './runtime-config';
import { postgresConnectionString } from './postgres-runtime';

export interface CreateAdminInput { nombre: string; email: string; password: string }

export async function hasAdministrator(config: RuntimeConfig): Promise<boolean> {
  const client = new Client({ connectionString: postgresConnectionString(config, 'identidad_db') });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "Usuario" WHERE rol IN ('ADMIN', 'SISTEMA') AND activo = true`);
    return Number(result.rows[0]?.count ?? 0) > 0;
  } finally { await client.end(); }
}

export async function createAdministrator(config: RuntimeConfig, input: CreateAdminInput): Promise<void> {
  const nombre = input.nombre.trim();
  const email = input.email.trim().toLowerCase();
  if (nombre.length < 2) throw new Error('El nombre debe tener al menos 2 caracteres');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('El correo no es válido');
  if (input.password.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres');
  if (await hasAdministrator(config)) throw new Error('La configuración inicial ya fue completada');

  const client = new Client({ connectionString: postgresConnectionString(config, 'identidad_db') });
  await client.connect();
  try {
    const password = await bcrypt.hash(input.password, 12);
    const now = new Date();
    await client.query(
      `INSERT INTO "Usuario" (id, nombre, email, password, rol, activo, "failedLoginAttempts", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ADMIN', true, 0, $5, $5)`,
      [randomUUID(), nombre, email, password, now],
    );
  } finally { await client.end(); }
}
