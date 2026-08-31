import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('empaquetado del runtime Tauri', () => {
  it('copia el directorio completo sin aplanar sus subcarpetas', () => {
    const configPath = resolve(__dirname, '../../escritorio/src-tauri/tauri.conf.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      bundle: { resources: Record<string, string> };
    };

    expect(config.bundle.resources).toEqual({
      'resources/runtime/': 'runtime/',
    });
    expect(Object.keys(config.bundle.resources).some((path) => path.includes('*'))).toBe(false);
  });

  it('inicia Node desde el directorio del runtime sin pasar una ruta con espacios', () => {
    const source = readFileSync(
      resolve(__dirname, '../../escritorio/src-tauri/src/lib.rs'),
      'utf8',
    );

    expect(source).toContain('command.current_dir(&runtime_directory)');
    expect(source).toContain('.arg("main.js")');
    expect(source).not.toContain('command.arg(entry)');
  });

  it('incluye las dependencias de ejecución del cliente Prisma generado', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../tools/tauri-local/prepare-runtime.mjs'),
      'utf8',
    );

    expect(source).toContain("'node_modules', '@prisma', 'client', 'package.json'");
    expect(source).toContain('Object.assign(dependencies, prismaClient.dependencies ?? {})');
  });
});
