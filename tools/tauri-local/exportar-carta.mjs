// Exporta la carta (tamaños, categorías, productos) de la instalación LOCAL
// de este equipo hacia un JSON portable, para poder inyectarla luego en otra
// instalación (ej. el dispositivo de producción) con importar-carta.mjs.
//
// Lee las credenciales de Postgres desde runtime-config.json de esta misma
// instalación — nunca las imprime ni las guarda en el JSON de salida.
//
// Uso: node tools/tauri-local/exportar-carta.mjs [ruta-salida.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const POSTGRES_PORT = 55432;
const configPath = join(homedir(), 'AppData', 'Local', 'pe.restoapp.labarradelceviche', 'runtime-config.json');
const outputPath = process.argv[2] || join(import.meta.dirname, 'carta-exportada.json');

function cargarCredenciales() {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!config.dbUser || !config.dbPassword) throw new Error('runtime-config.json no tiene dbUser/dbPassword');
  return { user: config.dbUser, password: config.dbPassword };
}

async function consultar(database, credenciales, sql) {
  const client = new pg.Client({ host: '127.0.0.1', port: POSTGRES_PORT, database, ...credenciales });
  await client.connect();
  try {
    const { rows } = await client.query(sql);
    return rows;
  } finally {
    await client.end();
  }
}

async function main() {
  const credenciales = cargarCredenciales();

  const sedes = await consultar('identidad_db', credenciales, 'SELECT id, nombre FROM sedes ORDER BY nombre');
  const sedeNombrePorId = new Map(sedes.map((s) => [s.id, s.nombre]));

  const tamanos = await consultar(
    'inventario_db', credenciales,
    'SELECT id, "sedeId", nombre, orden, activo FROM tamanos_plato ORDER BY "sedeId", orden',
  );
  const categorias = await consultar(
    'inventario_db', credenciales,
    'SELECT id, "sedeId", "parentId", nombre, descripcion, area::text AS area FROM categorias ORDER BY "sedeId", "parentId" NULLS FIRST, nombre',
  );
  const productos = await consultar(
    'inventario_db', credenciales,
    'SELECT id, "sedeId", "categoriaId", "tamanoId", nombre, descripcion, precio, disponible, "stockActual" FROM productos ORDER BY "sedeId", "categoriaId", nombre',
  );

  const tamanoNombrePorId = new Map(tamanos.map((t) => [t.id, t.nombre]));
  const categoriaNombrePorId = new Map(categorias.map((c) => [c.id, c.nombre]));

  const porSede = new Map();
  function sedeEntry(sedeId) {
    const nombre = sedeNombrePorId.get(sedeId) || `sede-desconocida-${sedeId}`;
    if (!porSede.has(nombre)) porSede.set(nombre, { tamanos: [], categorias: [], productos: [] });
    return porSede.get(nombre);
  }

  for (const t of tamanos) {
    sedeEntry(t.sedeId).tamanos.push({ nombre: t.nombre, orden: t.orden, activo: t.activo });
  }
  for (const c of categorias) {
    sedeEntry(c.sedeId).categorias.push({
      nombre: c.nombre,
      descripcion: c.descripcion,
      area: c.area,
      parentNombre: c.parentId ? categoriaNombrePorId.get(c.parentId) ?? null : null,
    });
  }
  for (const p of productos) {
    sedeEntry(p.sedeId).productos.push({
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: Number(p.precio),
      disponible: p.disponible,
      stockActual: p.stockActual,
      categoriaNombre: categoriaNombrePorId.get(p.categoriaId) ?? null,
      tamanoNombre: p.tamanoId ? tamanoNombrePorId.get(p.tamanoId) ?? null : null,
    });
  }

  const salida = {
    exportadoEn: new Date().toISOString(),
    origen: 'local-esta-pc',
    sedes: Object.fromEntries(porSede),
  };
  writeFileSync(outputPath, `${JSON.stringify(salida, null, 2)}\n`);

  console.log(`Carta exportada a: ${outputPath}`);
  for (const [nombre, datos] of porSede) {
    console.log(`  Sede "${nombre}": ${datos.tamanos.length} tamaños, ${datos.categorias.length} categorías, ${datos.productos.length} productos`);
  }
}

main().catch((err) => {
  console.error('Error exportando la carta:', err.message);
  process.exit(1);
});
