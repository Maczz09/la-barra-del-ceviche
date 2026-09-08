/**
 * En Chrome abrimos una pestaña aislada para imprimir; en Tauri `window.open`
 * no crea una ventana confiable, por eso navegamos temporalmente en la misma
 * ventana de escritorio y volvemos a la pantalla operativa después del diálogo
 * nativo de Windows.
 */
export function abrirRutaDeImpresion<T>(storageKey: string, payload: T, route: string): void {
  localStorage.setItem(storageKey, JSON.stringify(payload));
  const esTauri = '__TAURI_INTERNALS__' in globalThis || '__TAURI__' in globalThis;
  if (!esTauri) {
    globalThis.open(route, '_blank');
    return;
  }

  const volver = `${globalThis.location.pathname}${globalThis.location.search}`;
  globalThis.location.assign(`${route}?volver=${encodeURIComponent(volver)}`);
}

/** Vuelve al módulo que originó la impresión sin aceptar rutas externas. */
export function volverDeImpresion(): void {
  const volver = new URLSearchParams(globalThis.location.search).get('volver');
  if (volver?.startsWith('/app/')) {
    globalThis.location.replace(volver);
    return;
  }
  globalThis.close();
}
