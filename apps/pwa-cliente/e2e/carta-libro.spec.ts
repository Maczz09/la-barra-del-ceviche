import { expect, test } from '@playwright/test';

// Use the Windows browser already present on the restaurant development PC.
test.use({ channel: 'msedge' });

const payload = {
  categorias: [
    { id: 'cev', nombre: 'Ceviches', descripcion: 'Pescado fresco del día', area: 'COCINA' },
    { id: 'beb', nombre: 'Bebidas', descripcion: null, area: 'BARRA' },
  ],
  productos: [
    { id: 'p1', categoriaId: 'cev', nombre: 'Ceviche de caballa y conchas negras', descripcion: 'Limón norteño y ají fresco', precio: 30, tamanoId: 'personal', tamano: { id: 'personal', nombre: 'Personal', orden: 10 }, disponible: true, stockActual: null },
    { id: 'p2', categoriaId: 'cev', nombre: 'Ceviche de caballa y conchas negras', descripcion: 'Limón norteño y ají fresco', precio: 35, tamanoId: 'mediana', tamano: { id: 'mediana', nombre: 'Mediana', orden: 20 }, disponible: true, stockActual: null },
    { id: 'p3', categoriaId: 'cev', nombre: 'Ceviche de caballa y conchas negras', descripcion: 'Limón norteño y ají fresco', precio: 40, tamanoId: 'familiar', tamano: { id: 'familiar', nombre: 'Familiar', orden: 30 }, disponible: true, stockActual: null },
    { id: 'p4', categoriaId: 'beb', nombre: 'Chicha morada', descripcion: null, precio: 8, disponible: true, stockActual: null },
  ],
};

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test(`carta libro ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route('**/v1/identidad/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'No autenticado' } }));
    await page.route('**/v1/identidad/auth/refresh', (route) => route.fulfill({ status: 401, json: { message: 'No autenticado' } }));
    await page.route('**/v1/identidad/sedes/publica*', (route) => route.fulfill({ json: { sede: { id: 's1', nombre: 'La Barra del Ceviche', direccion: 'Piura', telefono: '999999999' } } }));
    await page.route('**/v1/inventario/carta-publica*', (route) => route.fulfill({ json: payload }));
    await page.goto('/carta/s1');
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
    await expect(page.locator('.cb-cover').getByAltText('La Barra del Ceviche')).toBeVisible();
    expect(await page.locator('.carta-book').evaluate((node) => getComputedStyle(node).getPropertyValue('--cb-accent').trim())).toBe('#f5f5f5');
    await expect(page.getByRole('button', { name: 'Open Tanstack query devtools' })).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`portada-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.getByRole('button', { name: 'Categorías' }).click();
    await page.getByRole('dialog', { name: 'Ir a categoría' }).getByRole('button', { name: 'Ceviches' }).click();
    await page.waitForTimeout(800); // An in-flight cover animation must settle before the category jump.
    await expect(page.locator('.cb-controls [aria-live]')).toHaveText(viewport.width < 768 ? '3 / 4' : '2 / 4');
    await expect(page.getByRole('heading', { name: 'Ceviche de caballa y conchas negras' }).first()).toBeVisible();
    await expect(page.getByText('S/ 30.00').first()).toBeVisible();
    await expect(page.getByText('S/ 35.00').first()).toBeVisible();
    await expect(page.getByText('S/ 40.00').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`platos-${viewport.width}.png`), fullPage: true });
    expect(await page.locator('.carta-book').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });
}

test.describe('índice táctil de la carta', () => {
  test.use({ hasTouch: true });

  test('permite deslizar hacia abajo la lista de categorías en un celular', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.route('**/v1/identidad/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'No autenticado' } }));
    await page.route('**/v1/identidad/auth/refresh', (route) => route.fulfill({ status: 401, json: { message: 'No autenticado' } }));
    await page.route('**/v1/identidad/sedes/publica*', (route) => route.fulfill({ json: { sede: { id: 's1', nombre: 'La Barra del Ceviche', direccion: 'Piura', telefono: null } } }));
    const categorias = Array.from({ length: 9 }, (_, index) => ({ id: `c${index}`, nombre: `Categoría ${index + 1} de pescados y mariscos frescos de nuestra cocina`, area: 'COCINA' }));
    const productos = categorias.map((categoria, index) => ({ id: `p${index}`, categoriaId: categoria.id, nombre: `Plato ${index + 1}`, precio: 20, disponible: true, stockActual: null }));
    await page.route('**/v1/inventario/carta-publica*', (route) => route.fulfill({ json: { categorias, productos } }));
    await page.goto('/carta/s1');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.locator('.cb-controls [aria-live]')).toHaveText('2 / 11');
    const list = page.locator('.cb-index-list').first();
    await expect(list).toBeVisible();
    expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    const box = await list.boundingBox();
    expect(box).not.toBeNull();
    // Start on the list padding, not a button: the page-flip engine used to
    // preventDefault() here and block the browser's native vertical scroll.
    const x = box!.x + 1;
    const bottom = box!.y + box!.height - 35;
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: bottom }] });
      for (let offset = 30; offset <= 180; offset += 30) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: bottom - offset }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
    await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  });
});
