import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const GATEWAY_URL = 'http://127.0.0.1:3210';
const POSTGRES_PORT = 55432;

const categoryDescriptions = {
  Especialidades: 'Especialidades de la casa.',
  Ceviches: 'Acompañados con cancha, sarandaja, camote y chifle.',
  Arroces: 'Arroces marinos de la casa.',
  'Dúos marinos': 'Combinaciones de dos preparaciones marinas.',
  'Tríos marinos': 'Combinaciones de tres preparaciones marinas.',
  Chicharrones: 'Acompañados con sarsa criolla.',
  Fritos: 'Acompañados con arroz, chifle, camote y sarsa criolla.',
  Sudados: 'Pescados sudados de la casa.',
  Guarniciones: 'Porciones adicionales.',
};

export const products = [];
export const defaultSizes = [
  { nombre: 'Personal', orden: 10 }, { nombre: 'Mediano', orden: 20 },
  { nombre: 'Grande', orden: 30 }, { nombre: 'Familiar', orden: 40 },
];

function add(category, name, price, description = categoryDescriptions[category], size = null) {
  products.push({ category, name, price, description, size });
}

function variants(category, baseName, prices, description, labels) {
  const resolvedLabels = labels ?? (
    prices.length === 4 ? ['Personal', 'Mediano', 'Grande', 'Familiar']
      : prices.length === 3 ? ['Personal', 'Mediano', 'Grande']
        : prices.length === 2 ? ['Personal', 'Grande'] : ['Porción']
  );
  prices.forEach((price, index) => add(category, baseName, price, description, resolvedLabels[index]));
}

variants('Especialidades', 'Mixto tumbesino', [10, 12], 'Arroz, tollito, ceviche y chanfainita.');

const cevicheDescription = categoryDescriptions.Ceviches;
variants('Ceviches', 'Ceviche de pescado', [15, 20, 30, 40], cevicheDescription);
variants('Ceviches', 'Ceviche de tollo', [20, 25, 35, 45], cevicheDescription);
variants('Ceviches', 'Ceviche de lenguado', [15, 25, 35, 45], cevicheDescription);
variants('Ceviches', 'Ceviche de aguja', [15, 25, 35, 45], cevicheDescription);
variants('Ceviches', 'Ceviche de caballa deshuesada', [15, 20, 30, 40], cevicheDescription);
variants('Ceviches', 'Ceviche de pota', [15, 20, 30, 40], cevicheDescription);
variants('Ceviches', 'Ceviche de conchas negras', [20, 25, 35, 45], cevicheDescription);
variants('Ceviches', 'Ceviche de langostinos', [25, 35, 45, 55], cevicheDescription);
variants('Ceviches', 'Ceviche carretillero', [25, 30, 35, 45], 'Ceviche de pota acompañado con chicharrón de pota.');

variants('Arroces', 'Arroz con mariscos', [15, 20, 30, 40]);
variants('Arroces', 'Arroz con conchas negras y sarsa criolla', [25, 35, 40, 50]);
variants('Arroces', 'Arroz con langostinos y sarsa criolla', [25, 35, 40, 50]);

variants('Dúos marinos', 'Ceviche de conchas negras + pescado aguja o caballa', [30, 40, 50]);
variants('Dúos marinos', 'Ceviche de conchas negras + langostino', [35, 45, 55]);
variants('Dúos marinos', 'Ceviche de langostino + pescado', [30, 40, 50]);
variants('Dúos marinos', 'Ceviche de pescado + pota', [25, 35, 45]);
variants('Dúos marinos', 'Arroz con mariscos + chicharrón', [35, 45, 55]);

variants('Tríos marinos', 'Ceviche de pescado, conchas y langostinos', [35, 45, 50]);
variants('Tríos marinos', 'Ceviche de pescado, chicharrón y arroz con mariscos', [40, 45, 50]);
variants('Tríos marinos', 'Ceviche de conchas negras, chicharrón y arroz con mariscos', [40, 50, 60]);

variants('Chicharrones', 'Chicharrón de pescado con sarsa criolla', [20, 30, 40]);
variants('Chicharrones', 'Chicharrón de pota con sarsa criolla', [20, 30, 40]);
variants('Chicharrones', 'Chicharrón de langostinos con sarsa criolla', [30, 40, 50]);
variants('Chicharrones', 'Chicharrón mixto', [35, 40, 50], 'Pescado, pota, calamar y langostino con sarsa criolla.');
add('Chicharrones', 'Tortilla de langostino con arroz y sarsa criolla', 15);

add('Fritos', 'Pescado blanco frito', 15);
add('Fritos', 'Filete de pescado frito', 15);
add('Fritos', 'Cachema frita', 15);

variants('Sudados', 'Sudado de peje blanco', [25, 35]);
variants('Sudados', 'Sudado de cabrilla', [25, 35]);
variants('Sudados', 'Pasado por agua de peje blanco', [25, 35]);

add('Guarniciones', 'Chanfainita', 2);
add('Guarniciones', 'Cancha', 2);
add('Guarniciones', 'Sarandaja', 2);
add('Guarniciones', 'Chifle', 2);
add('Guarniciones', 'Camote', 2);
add('Guarniciones', 'Porción de arroz', 3);

function connectionString(config, database) {
  return `postgresql://${encodeURIComponent(config.dbUser)}:${encodeURIComponent(config.dbPassword)}@127.0.0.1:${POSTGRES_PORT}/${database}`;
}

async function runtimeDataDirectory() {
  const response = await fetch(`${GATEWAY_URL}/local-admin/status`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`El servidor local respondió HTTP ${response.status}`);
  const status = await response.json();
  if (!status.dataDirectory) throw new Error('El runtime no informó su directorio de datos');
  return status.dataDirectory;
}

async function upsertCategory(client, sedeId, name) {
  const now = new Date();
  const result = await client.query(
    `INSERT INTO "categorias" (id, nombre, "sedeId", descripcion, "parentId", area, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NULL, $5::"CategoriaArea", $6, $6)
     ON CONFLICT ("sedeId", nombre) DO UPDATE
       SET descripcion = EXCLUDED.descripcion, area = EXCLUDED.area, "updatedAt" = EXCLUDED."updatedAt"
     RETURNING id`,
    [randomUUID(), name, sedeId, categoryDescriptions[name], 'COCINA', now],
  );
  return result.rows[0].id;
}

async function upsertProduct(client, sedeId, categoryId, product, tamanoId) {
  const existing = await client.query(
    `SELECT id FROM "productos" WHERE "sedeId" = $1 AND nombre = $2 AND "categoriaId" = $3
     AND "tamanoId" IS NOT DISTINCT FROM $4 ORDER BY "createdAt" LIMIT 1`,
    [sedeId, product.name, categoryId, tamanoId],
  );
  const now = new Date();
  if (existing.rows[0]) {
    await client.query(
      `UPDATE "productos" SET "categoriaId" = $1, descripcion = $2, precio = $3, disponible = true,
       "stockActual" = NULL, "updatedAt" = $4 WHERE id = $5`,
      [categoryId, product.description, product.price, now, existing.rows[0].id],
    );
    return 'updated';
  }
  await client.query(
    `INSERT INTO "productos" (id, "categoriaId", "sedeId", nombre, descripcion, precio, disponible, "stockActual", "createdAt", "updatedAt", "tamanoId")
     VALUES ($1, $2, $3, $4, $5, $6, true, NULL, $7, $7, $8)`,
    [randomUUID(), categoryId, sedeId, product.name, product.description, product.price, now, tamanoId],
  );
  return 'created';
}

async function seedTables(client, sedeId) {
  const now = new Date();
  const location = await client.query(
    `INSERT INTO "ubicaciones" (id, nombre, "sedeId", "createdAt", "updatedAt")
     VALUES ($1, 'Piso 1', $2, $3, $3)
     ON CONFLICT ("sedeId", nombre) DO UPDATE SET "updatedAt" = EXCLUDED."updatedAt"
     RETURNING id`,
    [randomUUID(), sedeId, now],
  );
  const locationId = location.rows[0].id;
  for (let number = 1; number <= 4; number += 1) {
    await client.query(
      `INSERT INTO "mesas" (id, numero, "sedeId", capacidad, "ubicacionId", estado, "cuentaAsociada", "grupoId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 4, $4, 'LIBRE', NULL, NULL, $5, $5)
       ON CONFLICT ("sedeId", numero) DO UPDATE
         SET capacidad = 4, "ubicacionId" = EXCLUDED."ubicacionId", "updatedAt" = EXCLUDED."updatedAt"`,
      [randomUUID(), number, sedeId, locationId, now],
    );
  }
}

async function main() {
  const dataDirectory = await runtimeDataDirectory();
  const config = JSON.parse(readFileSync(join(dataDirectory, 'runtime-config.json'), 'utf8'));
  const identity = new Client({ connectionString: connectionString(config, 'identidad_db') });
  const tables = new Client({ connectionString: connectionString(config, 'mesas_db') });
  const inventory = new Client({ connectionString: connectionString(config, 'inventario_db') });
  await Promise.all([identity.connect(), tables.connect(), inventory.connect()]);
  try {
    const requestedSede = process.argv.slice(2).find((value) => value.startsWith('--sede='))?.slice('--sede='.length);
    const sedeResult = requestedSede
      ? await identity.query(`SELECT id, nombre FROM "sedes" WHERE activa = true AND nombre = $1 LIMIT 1`, [requestedSede])
      : await identity.query(`SELECT id, nombre FROM "sedes" WHERE activa = true ORDER BY "createdAt" LIMIT 1`);
    const sede = sedeResult.rows[0];
    if (!sede) throw new Error(requestedSede ? `No existe la sede activa "${requestedSede}"` : 'No existe ninguna sede activa');

    await tables.query('BEGIN');
    await inventory.query('BEGIN');
    try {
      await seedTables(tables, sede.id);
      const categories = new Map();
      for (const name of Object.keys(categoryDescriptions)) categories.set(name, await upsertCategory(inventory, sede.id, name));
      const sizes = new Map();
      for (const size of defaultSizes) {
        const found = await inventory.query('SELECT id FROM tamanos_plato WHERE "sedeId" = $1 AND lower(nombre) = lower($2)', [sede.id, size.nombre]);
        if (found.rows[0]) { sizes.set(size.nombre, found.rows[0].id); continue; }
        const id = randomUUID();
        await inventory.query('INSERT INTO tamanos_plato (id, "sedeId", nombre, orden, activo, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,true,NOW(),NOW())', [id, sede.id, size.nombre, size.orden]);
        sizes.set(size.nombre, id);
      }
      let created = 0;
      let updated = 0;
      for (const product of products) {
        const result = await upsertProduct(inventory, sede.id, categories.get(product.category), product, sizes.get(product.size) ?? null);
        if (result === 'created') created += 1;
        else updated += 1;
      }
      await Promise.all([tables.query('COMMIT'), inventory.query('COMMIT')]);
      process.stdout.write(`SEED_LA_BARRA_OK sede="${sede.nombre}" piso=1 mesas=4 productos=${products.length} creados=${created} actualizados=${updated}\n`);
    } catch (error) {
      await Promise.allSettled([tables.query('ROLLBACK'), inventory.query('ROLLBACK')]);
      throw error;
    }
  } finally {
    await Promise.allSettled([identity.end(), tables.end(), inventory.end()]);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
