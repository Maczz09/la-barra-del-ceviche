import type { CategoriaDto, ProductoDto } from '../../types/inventario.types';
import { agruparPorTamano, type PlatoAgrupado } from './agruparPorTamano';

export type BookPage =
  | { kind: 'cover' }
  | { kind: 'index'; categories: CategoriaDto[] }
  | { kind: 'category'; category: CategoriaDto; dishes: PlatoAgrupado[]; part: number; totalParts: number };

/** Fixed two-dish pages keep 320px phones readable without clipping long names. */
export function buildBookPages(categories: CategoriaDto[], products: ProductoDto[]): BookPage[] {
  const visible = agruparPorTamano(products.filter((p) => p.disponible && (p.stockActual == null || p.stockActual > 0)));
  const withDishes = categories.filter((category) => visible.some((p) => p.categoriaId === category.id));
  const pages: BookPage[] = [{ kind: 'cover' }];
  if (withDishes.length === 0) pages.push({ kind: 'index', categories: [] });
  for (let i = 0; i < withDishes.length; i += 9) {
    pages.push({ kind: 'index', categories: withDishes.slice(i, i + 9) });
  }
  for (const category of withDishes) {
    const dishes = visible.filter((dish) => dish.categoriaId === category.id);
    const totalParts = Math.ceil(dishes.length / 2);
    for (let i = 0; i < dishes.length; i += 2) {
      pages.push({ kind: 'category', category, dishes: dishes.slice(i, i + 2), part: i / 2 + 1, totalParts });
    }
  }
  return pages;
}

export function categoryPageIndex(pages: BookPage[], categoryId: string): number {
  return pages.findIndex((page) => page.kind === 'category' && page.category.id === categoryId);
}

/** Keep the reader in the same category when availability changes pagination. */
export function pageIndexAfterRefresh(previous: BookPage[], next: BookPage[], currentIndex: number): number {
  if (next.length === 0) return 0;
  const current = previous[currentIndex];
  if (!current || current.kind === 'cover') return 0;
  if (current.kind === 'category') {
    const matches = next
      .map((page, index) => ({ page, index }))
      .filter((entry) => entry.page.kind === 'category' && entry.page.category.id === current.category.id);
    if (matches.length > 0) {
      const part = Math.min(current.part, matches.length);
      return matches[part - 1].index;
    }
  }
  return Math.min(Math.max(currentIndex, 0), next.length - 1);
}
