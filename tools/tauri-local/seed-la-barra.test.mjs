import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { products, defaultSizes, upsertCategory, upsertProduct, seedTables } from './seed-la-barra.mjs';

test('seed conserva todas las porciones con tamaño independiente del nombre', () => {
  const pescado = products.filter((p) => p.category === 'Ceviches' && p.name === 'Ceviche de pescado');
  assert.deepEqual(pescado.map((p) => [p.size, p.price]), [['Personal', 15], ['Mediano', 20], ['Grande', 30], ['Familiar', 40]]);
  assert.equal(new Set(products.map((p) => `${p.category}/${p.name}/${p.size}`)).size, products.length);
  assert.ok(products.every((p) => !p.name.includes(' · ')));
});
test('seed preserva precios únicos y solo referencia tamaños definidos', () => {
  assert.equal(products.find((p) => p.name === 'Porción de arroz').size, null);
  assert.ok(products.every((p) => p.size === null || defaultSizes.some((s) => s.nombre === p.size)));
  assert.deepEqual(defaultSizes.map((s) => s.orden), [10, 20, 30, 40]);
});

test('seed coincide con las 102 presentaciones de la carta exportada', () => {
  const exportado = JSON.parse(readFileSync(new URL('./carta-exportada.json', import.meta.url), 'utf8')).sedes['Sede Principal'];
  const key = (category, name, size, price) => JSON.stringify([category, name, size, price]);
  assert.deepEqual(
    products.map((p) => key(p.category, p.name, p.size, p.price)).sort(),
    exportado.productos.map((p) => key(p.categoriaNombre, p.nombre, p.tamanoNombre, p.precio)).sort(),
  );
  assert.deepEqual(defaultSizes.map((s) => [s.nombre, s.orden]), exportado.tamanos.map((s) => [s.nombre, s.orden]));
});

test('seed no altera un producto que ya existe, incluso si cambió precio o disponibilidad', async () => {
  const queries = [];
  const client = { query: async (sql, params) => { queries.push({ sql, params }); return { rows: [{ id: 'producto-existente' }] }; } };
  const result = await upsertProduct(client, 'sede-1', 'categoria-1', products[0], 'tamano-1');
  assert.equal(result, 'existing');
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /^SELECT id FROM "productos"/);
  assert.deepEqual(queries[0].params, ['sede-1', products[0].name, 'categoria-1', 'tamano-1']);
});

test('seed inserta un plato nuevo con su tamaño separado del nombre', async () => {
  const queries = [];
  const client = { query: async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; } };
  const result = await upsertProduct(client, 'sede-1', 'categoria-1', products[0], 'tamano-1');
  assert.equal(result, 'created');
  assert.equal(queries.length, 2);
  assert.match(queries[1].sql, /^INSERT INTO "productos"/);
  assert.equal(queries[1].params.at(-1), 'tamano-1');
  assert.equal(queries[1].params[3], products[0].name);
});

test('seed reutiliza categoría y mesas sin reescribir configuración existente', async () => {
  const categoryQueries = [];
  const categoryClient = { query: async (sql) => {
    categoryQueries.push(sql);
    return { rows: categoryQueries.length === 1 ? [] : [{ id: 'categoria-existente' }] };
  } };
  assert.equal(await upsertCategory(categoryClient, 'sede-1', 'Ceviches'), 'categoria-existente');
  assert.match(categoryQueries[0], /ON CONFLICT \("sedeId", nombre\) DO NOTHING/);
  assert.match(categoryQueries[1], /^SELECT id FROM "categorias"/);

  const tableQueries = [];
  const tableClient = { query: async (sql) => {
    tableQueries.push(sql);
    return { rows: tableQueries.length === 2 ? [{ id: 'piso-existente' }] : [] };
  } };
  await seedTables(tableClient, 'sede-1');
  assert.equal(tableQueries.length, 6);
  assert.equal(tableQueries.filter((sql) => sql.startsWith('INSERT INTO "mesas"')).length, 4);
  assert.ok(tableQueries.filter((sql) => sql.includes('ON CONFLICT')).every((sql) => sql.includes('DO NOTHING')));
});

test('preview funciona sin servidor ni base de datos', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./seed-la-barra.mjs', import.meta.url)), '--preview'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /categorias=9 tamanos=4 productos=102 mesas=4; sin cambios/);
});
