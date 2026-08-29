import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
vi.mock('./client', () => ({
  client: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

import { getTodosLosProductos } from './inventario.api';

describe('getTodosLosProductos (T-49)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recorre todas las páginas del cursor y devuelve el listado completo', async () => {
    mockGet
      .mockResolvedValueOnce({ data: [{ id: 'p-1' }, { id: 'p-2' }], nextCursor: 'p-2' })
      .mockResolvedValueOnce({ data: [{ id: 'p-3' }], nextCursor: null });

    const productos = await getTodosLosProductos({ conStock: true });

    expect(productos.map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3']);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('pide el máximo que el backend acepta (500) y encadena el cursor', async () => {
    mockGet
      .mockResolvedValueOnce({ data: [{ id: 'p-1' }], nextCursor: 'p-1' })
      .mockResolvedValueOnce({ data: [{ id: 'p-2' }], nextCursor: null });

    await getTodosLosProductos({ conStock: true });

    expect(mockGet).toHaveBeenNthCalledWith(1, expect.stringContaining('limit=500'));
    expect(mockGet).toHaveBeenNthCalledWith(2, expect.stringContaining('cursor=p-1'));
  });

  it('para apenas el backend deja de mandar cursor', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: 'p-1' }], nextCursor: null });

    const productos = await getTodosLosProductos();

    expect(productos).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('corta a las 20 páginas aunque el cursor nunca avance (seguro anti-cuelgue)', async () => {
    // Un backend con el cursor roto devolvería lo mismo para siempre: sin este
    // tope el navegador giraría indefinidamente al generar el PDF.
    mockGet.mockResolvedValue({ data: [{ id: 'p-1' }], nextCursor: 'siempre-el-mismo' });

    const productos = await getTodosLosProductos();

    expect(mockGet).toHaveBeenCalledTimes(20);
    expect(productos).toHaveLength(20);
  });

  it('una página vacía corta el recorrido aunque venga con cursor', async () => {
    mockGet.mockResolvedValueOnce({ data: [], nextCursor: 'fantasma' });

    const productos = await getTodosLosProductos();

    expect(productos).toEqual([]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('propaga los filtros a todas las páginas', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: 'p-1' }], nextCursor: null });

    await getTodosLosProductos({ conStock: true, categoriaId: 'c-1', search: 'gas' });

    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('categoriaId=c-1'));
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('search=gas'));
  });
});
