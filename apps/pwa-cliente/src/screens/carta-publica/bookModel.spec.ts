import { describe, expect, it } from 'vitest';
import { buildBookPages, categoryPageIndex, pageIndexAfterRefresh } from './bookModel';
import type { CategoriaDto, ProductoDto } from '../../types/inventario.types';

const categories = [{ id: 'cev', nombre: 'Ceviches', area: 'COCINA' }, { id: 'bar', nombre: 'Bebidas', area: 'BARRA' }] as CategoriaDto[];
const products = [
  { id: '1', categoriaId: 'cev', nombre: 'Clásico', precio: 30, disponible: true },
  { id: '2', categoriaId: 'cev', nombre: 'Mixto', precio: 35, disponible: true },
  { id: '3', categoriaId: 'cev', nombre: 'Triple', precio: 40, disponible: true },
  { id: '4', categoriaId: 'bar', nombre: 'Chicha', precio: 8, disponible: true },
] as ProductoDto[];

describe('carta flipbook', () => {
  it('pagina dos platos sin perder productos y permite saltar a cada categoría', () => {
    const pages = buildBookPages(categories, products);
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'index', 'category', 'category', 'category']);
    expect(categoryPageIndex(pages, 'cev')).toBe(2);
    expect(categoryPageIndex(pages, 'bar')).toBe(4);
    expect((pages[2] as Extract<(typeof pages)[number], { kind: 'category' }>).dishes).toHaveLength(2);
    expect((pages[3] as Extract<(typeof pages)[number], { kind: 'category' }>).dishes[0].nombre).toBe('Triple');
  });

  it('no muestra agotados ni artículos sin stock y no crea páginas vacías', () => {
    const pages = buildBookPages(categories, products.map((p) => ({ ...p, disponible: false })));
    expect(pages).toEqual([{ kind: 'cover' }, { kind: 'index', categories: [] }]);
  });

  it('mantiene la categoría abierta si un plato desaparece y cambia la paginación', () => {
    const before = buildBookPages(categories, products);
    const after = buildBookPages(categories, products.filter((product) => product.id !== '3'));
    expect(pageIndexAfterRefresh(before, after, 3)).toBe(2);
    expect(pageIndexAfterRefresh(before, after, 4)).toBe(3);
    expect(pageIndexAfterRefresh(before, after, 0)).toBe(0);
  });
});
