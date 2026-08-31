import { normalizeWindowsExtendedPath } from './runtime-paths';

describe('normalización de rutas portables de Windows', () => {
  it('quita el prefijo extendido de una unidad antes de iniciar PostgreSQL', () => {
    expect(
      normalizeWindowsExtendedPath(String.raw`\\?\D:\La Barra del Ceviche\runtime`, 'win32'),
    ).toBe(String.raw`D:\La Barra del Ceviche\runtime`);
  });

  it('convierte el prefijo UNC extendido en una ruta UNC normal', () => {
    expect(
      normalizeWindowsExtendedPath(String.raw`\\?\UNC\servidor\restoapp`, 'win32'),
    ).toBe(String.raw`\\servidor\restoapp`);
  });

  it('no altera rutas normales ni rutas de otras plataformas', () => {
    expect(normalizeWindowsExtendedPath(String.raw`D:\RestoApp`, 'win32')).toBe(String.raw`D:\RestoApp`);
    expect(normalizeWindowsExtendedPath('/opt/restoapp', 'linux')).toBe('/opt/restoapp');
  });
});
