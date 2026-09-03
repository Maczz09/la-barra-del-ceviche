import test from 'node:test';
import assert from 'node:assert/strict';
import { products, defaultSizes } from './seed-la-barra.mjs';

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
