// Inyecta en OTRA instalación (ej. el dispositivo de producción) la carta
// exportada con exportar-carta.mjs. Usa la API HTTP del gateway local (no
// toca la base de datos directamente), así que valida datos y dispara los
// mismos eventos que si se cargara la carta a mano desde la app.
//
// Es idempotente: si una sede, tamaño, categoría o producto ya existe (mismo
// nombre), lo reutiliza en vez de duplicarlo — se puede ejecutar varias veces
// sin riesgo.
//
// Uso (desde una máquina con acceso de red a la instalación destino):
//
//   $env:BASE_URL = 'http://<ip-produccion>:3210'
//   $env:ADMIN_EMAIL = 'admin@turestaurante.pe'
//   $env:ADMIN_PASSWORD = '********'
//   node tools/tauri-local/importar-carta.mjs tools/tauri-local/carta-exportada.json
//
// Las credenciales solo se usan localmente contra BASE_URL; no se guardan ni
// se envían a ningún otro sitio.

import { readFileSync } from 'node:fs';
import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3210';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const inputPath = process.argv[2];

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Faltan ADMIN_EMAIL / ADMIN_PASSWORD como variables de entorno.');
  process.exit(1);
}
if (!inputPath) {
  console.error('Uso: node importar-carta.mjs <ruta-carta-exportada.json>');
  process.exit(1);
}

function headers(token, sedeId) {
  const h = { Authorization: `Bearer ${token}` };
  return sedeId ? { headers: h, params: { sedeId } } : { headers: h };
}

async function login() {
  const res = await axios.post(`${BASE_URL}/identidad/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  return res.data.access_token;
}

async function obtenerSedeId(token, nombreSede) {
  const res = await axios.get(`${BASE_URL}/identidad/sedes`, { headers: { Authorization: `Bearer ${token}` } });
  const sedes = res.data.sedes || res.data || [];
  const encontrada = sedes.find((s) => s.nombre === nombreSede);
  if (!encontrada) {
    const disponibles = sedes.map((s) => s.nombre).join(', ') || '(ninguna)';
    throw new Error(`La sede "${nombreSede}" no existe en destino. Sedes disponibles: ${disponibles}`);
  }
  return encontrada.id;
}

async function obtenerOCrear(token, sedeId, ruta, nombre, crearBody, listaKey) {
  const listado = await axios.get(`${BASE_URL}/inventario/${ruta}`, headers(token, sedeId));
  const items = listado.data[listaKey] || listado.data.data || listado.data || [];
  const existente = items.find((i) => i.nombre === nombre);
  if (existente) return existente;

  try {
    const creado = await axios.post(`${BASE_URL}/inventario/${ruta}`, crearBody, headers(token, sedeId));
    return creado.data[listaKey?.replace(/s$/, '')] || creado.data;
  } catch (err) {
    if (err.response?.status === 409) {
      const retry = await axios.get(`${BASE_URL}/inventario/${ruta}`, headers(token, sedeId));
      const retryItems = retry.data[listaKey] || retry.data.data || retry.data || [];
      const found = retryItems.find((i) => i.nombre === nombre);
      if (found) return found;
    }
    throw err;
  }
}

async function importarSede(token, nombreSede, datos) {
  console.log(`\n=== Sede "${nombreSede}" ===`);
  const sedeId = await obtenerSedeId(token, nombreSede);

  console.log(`Tamaños (${datos.tamanos.length})...`);
  for (const t of datos.tamanos) {
    await obtenerOCrear(token, sedeId, 'tamanos-plato', t.nombre, { nombre: t.nombre, orden: t.orden, activo: t.activo }, 'tamanos');
    console.log(`  ✅ ${t.nombre}`);
  }

  console.log(`Categorías (${datos.categorias.length})...`);
  const categoriaIdPorNombre = new Map();
  // Primero las categorías raíz (sin parent), luego las subcategorías —
  // el esquema solo admite un nivel de anidamiento.
  const raiz = datos.categorias.filter((c) => !c.parentNombre);
  const hijas = datos.categorias.filter((c) => c.parentNombre);
  for (const c of raiz) {
    const creada = await obtenerOCrear(token, sedeId, 'categorias', c.nombre, { nombre: c.nombre, descripcion: c.descripcion, area: c.area }, 'categorias');
    categoriaIdPorNombre.set(c.nombre, creada.id);
    console.log(`  ✅ ${c.nombre}`);
  }
  for (const c of hijas) {
    const parentId = categoriaIdPorNombre.get(c.parentNombre);
    const creada = await obtenerOCrear(token, sedeId, 'categorias', c.nombre, { nombre: c.nombre, descripcion: c.descripcion, area: c.area, parentId }, 'categorias');
    categoriaIdPorNombre.set(c.nombre, creada.id);
    console.log(`  ✅ ${c.nombre} (bajo ${c.parentNombre})`);
  }

  console.log(`Tamaños → mapa de nombres...`);
  const tamanosDestino = await axios.get(`${BASE_URL}/inventario/tamanos-plato`, headers(token, sedeId));
  const tamanoIdPorNombre = new Map((tamanosDestino.data.tamanos || tamanosDestino.data || []).map((t) => [t.nombre, t.id]));

  console.log(`Productos (${datos.productos.length})...`);
  let creados = 0, existentes = 0;
  for (const p of datos.productos) {
    const categoriaId = categoriaIdPorNombre.get(p.categoriaNombre);
    if (!categoriaId) { console.log(`  ⚠️  ${p.nombre}: categoría "${p.categoriaNombre}" no encontrada, se omite`); continue; }
    const tamanoId = p.tamanoNombre ? tamanoIdPorNombre.get(p.tamanoNombre) ?? null : null;

    const listado = await axios.get(`${BASE_URL}/inventario/productos`, { headers: { Authorization: `Bearer ${token}` }, params: { sedeId, search: p.nombre, limit: 50 } });
    const items = listado.data.data || listado.data.productos || listado.data || [];
    const yaExiste = items.find((i) => i.nombre === p.nombre && (i.tamano?.nombre ?? null) === p.tamanoNombre);
    if (yaExiste) { existentes++; continue; }

    await axios.post(`${BASE_URL}/inventario/productos`, {
      categoriaId,
      tamanoId,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      disponible: p.disponible,
      ...(p.stockActual != null ? { stockActual: p.stockActual } : {}),
    }, headers(token, sedeId));
    creados++;
  }
  console.log(`  ✅ ${creados} productos creados, ${existentes} ya existían`);
}

async function main() {
  const contenido = JSON.parse(readFileSync(inputPath, 'utf8'));
  console.log(`Importando contra ${BASE_URL} (exportado el ${contenido.exportadoEn})`);

  const token = await login();
  console.log('✅ Sesión iniciada como', ADMIN_EMAIL);

  for (const [nombreSede, datos] of Object.entries(contenido.sedes)) {
    await importarSede(token, nombreSede, datos);
  }

  console.log('\nImportación finalizada.');
}

main().catch((err) => {
  console.error('\n❌ Error importando la carta:', err.response?.data || err.message);
  process.exit(1);
});
