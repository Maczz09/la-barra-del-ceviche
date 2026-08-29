// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  agruparPorCategoria,
  exportarAlmacenPdf,
  exportarInventarioPdf,
  sanitizarTextoPdf,
  valorizar,
} from './inventarioPdf';
import type { ProductoVM } from '../types/inventario.types';

const mockSave = vi.fn();
const mockText = vi.fn();
const mockLine = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetTextColor = vi.fn();
const mockAutoTable = vi.fn();
const mockConstructor = vi.fn();
const mockSplit = vi.fn((t: string) => [t]);

vi.mock('jspdf', () => ({
  default: class MockJsPDF {
    constructor(opciones?: unknown) {
      mockConstructor(opciones);
    }
    text = mockText;
    line = mockLine;
    splitTextToSize = (t: string) => mockSplit(t) as string[];
    setFontSize = mockSetFontSize;
    setTextColor = mockSetTextColor;
    save = mockSave;
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
  },
}));

vi.mock('jspdf-autotable', () => ({
  default: (...args: unknown[]) => mockAutoTable(...args),
}));

function producto(overrides: Partial<ProductoVM> = {}): ProductoVM {
  return {
    id: 'p-1',
    categoriaId: 'c-1',
    categoriaNombre: 'Abarrotes',
    nombre: 'Aceite Primor 1L',
    descripcion: null,
    precio: 9.5,
    precioLabel: 'S/ 9.50',
    disponible: true,
    stockActual: 12,
    stockLabel: '12',
    stockClass: 'badge-ok',
    ...overrides,
  };
}

describe('exportarInventarioPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fecha fija: el nombre de archivo se deriva del día en hora de Lima.
    vi.setSystemTime(new Date('2026-08-24T15:30:00.000Z'));
  });

  it('descarga el cuadre con un nombre de archivo fechado en hora de Lima', async () => {
    await exportarInventarioPdf([producto()], { formato: 'cuadre' });
    expect(mockSave).toHaveBeenCalledWith('inventario-cuadre_2026-08-24.pdf');
  });

  it('el valorizado usa su propio nombre de archivo y también sale vertical', async () => {
    await exportarInventarioPdf([producto()], { formato: 'valorizado' });
    expect(mockSave).toHaveBeenCalledWith('inventario-valorizado_2026-08-24.pdf');
    expect(mockConstructor).toHaveBeenCalledWith(undefined);
  });

  it('el cuadre sale vertical y con las tres columnas en blanco', async () => {
    await exportarInventarioPdf([producto()], { formato: 'cuadre' });

    // Sin argumentos al constructor = A4 retrato, el default de jsPDF.
    expect(mockConstructor).toHaveBeenCalledWith(undefined);
    expect(mockAutoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        head: [['Producto', 'Stock sistema', 'Stock físico', 'Diferencia', 'Observación']],
        body: [['Aceite Primor 1L', '12', '', '', '']],
      }),
    );
  });

  it('el cuadre dibuja las dos líneas de firma', async () => {
    await exportarInventarioPdf([producto()], { formato: 'cuadre' });
    expect(mockLine).toHaveBeenCalledTimes(2);
    expect(mockText).toHaveBeenCalledWith('Contó (nombre y firma)', expect.any(Number), expect.any(Number));
    expect(mockText).toHaveBeenCalledWith('Revisó (nombre y firma)', expect.any(Number), expect.any(Number));
  });

  it('el valorizado no lleva firmas pero sí el valor total', async () => {
    await exportarInventarioPdf([producto({ precio: 10, stockActual: 3 })], { formato: 'valorizado' });

    expect(mockLine).not.toHaveBeenCalled();
    expect(mockText).toHaveBeenCalledWith(
      expect.stringContaining('Valor total del inventario'),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('marca los productos agotados y con stock bajo en la fila del cuadre', async () => {
    await exportarInventarioPdf(
      [producto({ id: 'p-1', nombre: 'Agotado', stockActual: 0 }), producto({ id: 'p-2', nombre: 'Poquito', stockActual: 2 })],
      { formato: 'cuadre' },
    );

    expect(mockAutoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: [
          ['Agotado  (AGOTADO)', '0', '', '', ''],
          ['Poquito  (BAJO)', '2', '', '', ''],
        ],
      }),
    );
  });

  it('imprime el alcance para que un PDF filtrado no se confunda con el completo', async () => {
    await exportarInventarioPdf([producto()], { formato: 'cuadre', filtroLabel: 'Categoría: Abarrotes' });
    expect(mockText).toHaveBeenCalledWith('Alcance: Categoría: Abarrotes', expect.any(Number), expect.any(Number));
  });

  it('sin filtro declara que trae todo el inventario', async () => {
    await exportarInventarioPdf([producto()], { formato: 'cuadre' });
    expect(mockText).toHaveBeenCalledWith('Alcance: Todo el inventario', expect.any(Number), expect.any(Number));
  });

  it('el resumen de KPIs no usa "≤" (jsPDF lo escribe como basura y descuadra la línea)', async () => {
    await exportarInventarioPdf([producto()], { formato: 'cuadre' });

    const escrito = mockText.mock.calls.map((c) => String(c[0]));
    expect(escrito.some((t) => t.includes('≤'))).toBe(false);
    expect(escrito.some((t) => t.includes('o menos'))).toBe(true);
  });

  it('todo el texto pasa por el ajuste de ancho de hoja', async () => {
    await exportarInventarioPdf([producto()], { formato: 'cuadre' });
    expect(mockSplit).toHaveBeenCalled();
  });

  it('con la lista vacía igual emite el PDF, avisando que no hubo coincidencias', async () => {
    await exportarInventarioPdf([], { formato: 'cuadre' });

    expect(mockAutoTable).not.toHaveBeenCalled();
    expect(mockText).toHaveBeenCalledWith(
      'No hay productos que coincidan con el filtro aplicado.',
      expect.any(Number),
      expect.any(Number),
    );
    expect(mockSave).toHaveBeenCalled();
  });

  it('emite una tabla por categoría', async () => {
    await exportarInventarioPdf(
      [producto({ id: 'p-1', categoriaNombre: 'Abarrotes' }), producto({ id: 'p-2', categoriaNombre: 'Bebidas' })],
      { formato: 'cuadre' },
    );
    expect(mockAutoTable).toHaveBeenCalledTimes(2);
  });
});

describe('exportarAlmacenPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-08-24T15:30:00.000Z'));
  });

  it('trae unidad y mínimo, que es lo que distingue al almacén, y sale vertical', async () => {
    await exportarAlmacenPdf([{ nombre: 'Arroz', unidad: 'kg', stockActual: 20, stockMinimo: 5 }], {});

    expect(mockConstructor).toHaveBeenCalledWith(undefined);
    expect(mockSave).toHaveBeenCalledWith('almacen-cocina-cuadre_2026-08-24.pdf');
    expect(mockAutoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        head: [['Insumo', 'Unidad', 'Stock sistema', 'Mínimo', 'Stock físico', 'Diferencia', 'Observación']],
        body: [['Arroz', 'kg', '20', '5', '', '', '']],
      }),
    );
  });

  it('marca el insumo que está en o por debajo del mínimo', async () => {
    await exportarAlmacenPdf([{ nombre: 'Aceite', unidad: 'L', stockActual: 2, stockMinimo: 2 }], {});

    expect(mockAutoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: [['Aceite  (BAJO)', 'L', '2', '2', '', '', '']] }),
    );
  });
});

describe('agruparPorCategoria', () => {
  it('ordena alfabéticamente y manda "Sin categoría" al final', () => {
    const grupos = agruparPorCategoria([
      producto({ id: 'p-1', categoriaNombre: null }),
      producto({ id: 'p-2', categoriaNombre: 'Limpieza' }),
      producto({ id: 'p-3', categoriaNombre: 'Abarrotes' }),
    ]);

    expect(grupos.map((g) => g.nombre)).toEqual(['Abarrotes', 'Limpieza', 'Sin categoría']);
  });
});

describe('sanitizarTextoPdf', () => {
  it('cambia los caracteres que WinAnsi no sabe escribir', () => {
    expect(sanitizarTextoPdf('Stock bajo (≤5)')).toBe('Stock bajo (<=5)');
    expect(sanitizarTextoPdf('a · b')).toBe('a - b');
    expect(sanitizarTextoPdf('10 → 8')).toBe('10 -> 8');
    expect(sanitizarTextoPdf('−2 kg')).toBe('-2 kg');
  });

  it('deja intactas las tildes y la ñ, que sí están en Latin-1', () => {
    expect(sanitizarTextoPdf('Cusqueña de Trigo · Observación')).toBe('Cusqueña de Trigo - Observación');
  });

  it('baja a ASCII la puntuación tipográfica (raya, comillas curvas)', () => {
    expect(sanitizarTextoPdf('Agua — “San Luis”')).toBe('Agua - "San Luis"');
  });

  it('descarta lo que quede fuera de Latin-1 en vez de romper la línea', () => {
    expect(sanitizarTextoPdf('Arroz 🍚 extra')).toBe('Arroz  extra');
  });
});

describe('valorizar', () => {
  it('multiplica precio por stock y trata el stock nulo como 0', () => {
    expect(valorizar([producto({ precio: 10, stockActual: 3 }), producto({ precio: 5, stockActual: null })])).toBe(30);
  });
});
