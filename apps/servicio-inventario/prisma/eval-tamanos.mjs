import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Ejecutar únicamente contra una BD de pruebas. Todo vive en un schema aleatorio
// dentro de una transacción revertida: ni lectura ni escritura de tablas reales.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Define TEST_DATABASE_URL de PostgreSQL aislado para evaluar la migración.');
const client = new pg.Client({ connectionString: url });
const schema = `eval_tamanos_${randomUUID().replaceAll('-', '')}`;
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(`
    CREATE TABLE categorias (id TEXT PRIMARY KEY, "sedeId" TEXT, nombre TEXT, area TEXT);
    CREATE TABLE productos (id TEXT PRIMARY KEY, "sedeId" TEXT, "categoriaId" TEXT, nombre TEXT,
      precio NUMERIC(10,2), "stockActual" INT, disponible BOOLEAN, "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE outbox_events (id TEXT PRIMARY KEY, "routingKey" TEXT, payload TEXT,
      status TEXT, attempts INT, "createdAt" TIMESTAMP, "updatedAt" TIMESTAMP);
    CREATE TABLE pedidos_historicos (id TEXT PRIMARY KEY, nombre TEXT, precio NUMERIC(10,2));
    INSERT INTO categorias VALUES ('c1','s1','Ceviches','COCINA'),('c2','s2','Ceviches','COCINA');
    INSERT INTO pedidos_historicos VALUES ('historico', 'Ceviche · Mediana', 20);
  `);
  const casos = [
    ['p1', 's1', 'c1', 'Ceviche · Personal', 'Ceviche', 'Personal'],
    ['p2', 's1', 'c1', 'Ceviche · Mediana', 'Ceviche', 'Mediano'],
    ['p3', 's1', 'c1', 'Ceviche (MEDIANO)  ', 'Ceviche', 'Mediano'],
    ['p4', 's1', 'c1', 'Arroz (Familiar)', 'Arroz', 'Familiar'],
    ['p5', 's1', 'c1', 'Arroz familiar especial', 'Arroz familiar especial', null],
    ['p6', 's1', 'c1', 'Plato · Gigante', 'Plato · Gigante', null],
    ['p7', 's1', 'c1', 'Tortilla Personal', 'Tortilla Personal', null],
    ['p8', 's2', 'c2', 'Ceviche · Personal', 'Ceviche', 'Personal'],
    ['p9', 's1', 'c1', ' · Personal', ' · Personal', null],
    ['p10', 's1', 'c1', 'Arroz · Grande', 'Arroz', 'Grande'],
    ['p11', 's1', 'c1', 'Ceviche · Familiar especial', 'Ceviche · Familiar especial', null],
  ];
  for (const [id, sedeId, categoriaId, nombre] of casos) await client.query('INSERT INTO productos (id,"sedeId","categoriaId",nombre,precio,"stockActual",disponible) VALUES ($1,$2,$3,$4,25,NULL,true)', [id, sedeId, categoriaId, nombre]);
  const sql = await readFile(new URL('./migrations/20260902120000_tamanos_plato/migration.sql', import.meta.url), 'utf8');
  await client.query(sql);
  const { rows } = await client.query('SELECT p.*, t.nombre AS etiqueta, t."sedeId" AS "sedeTamano" FROM productos p LEFT JOIN tamanos_plato t ON t.id=p."tamanoId" ORDER BY p.id');
  assert.equal(rows.length, casos.length);
  for (const [id, sedeId, , original, nombre, etiqueta] of casos) {
    const row = rows.find(p => p.id === id);
    assert.equal(row.nombre, nombre, `Nombre de ${original}`);
    assert.equal(row.etiqueta, etiqueta, `Tamaño de ${original}`);
    assert.equal(Number(row.precio), 25, 'Los precios nunca se reescriben');
    assert.equal(row.stockActual, null, 'El control de stock no cambia');
    assert.equal(row.disponible, true, 'La disponibilidad no cambia');
    if (etiqueta) assert.equal(row.sedeTamano, sedeId, 'Sin cruces de sede');
  }
  const tamanos = (await client.query('SELECT * FROM tamanos_plato ORDER BY "sedeId", orden')).rows;
  assert.equal(tamanos.length, 8);
  assert.deepEqual(tamanos.filter(t => t.sedeId === 's1').map(t => t.nombre), ['Personal', 'Mediano', 'Grande', 'Familiar']);
  assert.deepEqual((await client.query('SELECT nombre,precio::float FROM pedidos_historicos')).rows, [{ nombre: 'Ceviche · Mediana', precio: 20 }]);
  const eventos = (await client.query('SELECT "routingKey",payload FROM outbox_events')).rows;
  assert.equal(eventos.length, casos.filter(c => c[5] !== null).length);
  for (const evento of eventos) {
    assert.equal(evento.routingKey, 'producto.actualizado');
    const payload = JSON.parse(evento.payload);
    const caso = casos.find(c => c[0] === payload.id);
    assert.equal(payload.nombre, `${caso[4]} · ${caso[5]}`);
    assert.equal(payload.precio, 25);
    assert.equal(payload.sedeId, caso[1]);
  }
  // PostgreSQL ASC de la relación nullable deja sin tamaño al final.
  const orden = (await client.query('SELECT p.id FROM productos p LEFT JOIN tamanos_plato t ON t.id=p."tamanoId" WHERE p."sedeId"=$1 ORDER BY t.orden ASC,p.nombre,p.id', ['s1'])).rows;
  assert.equal(orden[0].id, 'p1');
  assert.ok(orden.slice(-5).every(p => casos.find(c => c[0] === p.id)[5] === null));
  await client.query('SAVEPOINT restriccion');
  await assert.rejects(client.query('DELETE FROM tamanos_plato WHERE id=(SELECT "tamanoId" FROM productos WHERE id=$1)', ['p1']), error => error.code === '23503');
  await client.query('ROLLBACK TO SAVEPOINT restriccion');
  await assert.rejects(client.query('INSERT INTO tamanos_plato (id,"sedeId",nombre,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)', ['otro', 's1', 'personal']), error => error.code === '23505');
  await client.query('ROLLBACK TO SAVEPOINT restriccion');
  console.log(`EVAL_TAMANOS_OK ${casos.length} casos, 8 tamaños, ${eventos.length} eventos; precios e históricos intactos, tenant, FK y orden verificados.`);
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
