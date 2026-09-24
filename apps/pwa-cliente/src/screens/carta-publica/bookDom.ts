import type { SedePublicaDto } from '../../types/cartaPublica.types';
import type { BookPage } from './bookModel';
import { APP_LOGO, APP_NAME } from '../../config';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const money = (value: number) => `S/ ${Number(value).toFixed(2)}`;

export function makePage(page: BookPage, sede: SedePublicaDto, number: number): HTMLElement {
  const root = element('section', `cb-page cb-${page.kind}`);
  root.setAttribute('aria-label', page.kind === 'category' ? page.category.nombre : page.kind === 'cover' ? 'Portada' : 'Categorías');
  // PageFlip writes display:block directly on the section while drawing.
  // Keep the scrolling flex layout in a child it does not mutate.
  const content = element('div', 'cb-page-content');
  root.append(content);
  if (page.kind === 'cover') {
    root.dataset.density = 'hard';
    const logo = element('img', 'cb-logo');
    logo.src = APP_LOGO ?? '/logo.webp'; logo.alt = APP_NAME;
    content.append(logo, element('p', 'cb-brand', APP_NAME), element('h1', 'cb-cover-title', sede.nombre),
      element('p', 'cb-slogan', 'Ceviches y cocina marina'));
    const open = element('button', 'cb-cover-open', 'Abrir menú');
    open.type = 'button'; open.dataset.action = 'open';
    content.append(open);
    return root;
  }
  const head = element('header', 'cb-page-head');
  const mark = element('img', 'cb-mark'); mark.src = APP_LOGO ?? '/logo.webp'; mark.alt = '';
  head.append(mark, element('span', 'cb-page-brand', APP_NAME));
  content.append(head);
  if (page.kind === 'index') {
    content.append(element('h2', 'cb-title', 'Nuestra carta'));
    if (page.categories.length === 0) content.append(element('p', 'cb-category-description', 'Todavía no hay platos disponibles en esta carta.'));
    const list = element('div', 'cb-index-list');
    for (const category of page.categories) {
      const button = element('button', 'cb-index-item', category.nombre);
      button.type = 'button'; button.dataset.categoryId = category.id;
      list.append(button);
    }
    content.append(list);
  } else {
    content.append(element('h2', 'cb-title', page.category.nombre));
    if (page.category.descripcion && page.part === 1) content.append(element('p', 'cb-category-description', page.category.descripcion));
    const dishes = element('div', 'cb-dishes');
    for (const dish of page.dishes) {
      const article = element('article', 'cb-dish');
      article.append(element('h3', 'cb-dish-name', dish.nombre));
      if (dish.descripcion) article.append(element('p', 'cb-dish-description', dish.descripcion));
      if (dish.precioUnico != null) article.append(element('p', 'cb-single-price', money(dish.precioUnico)));
      if (dish.variantes?.length) {
        const prices = element('div', 'cb-prices');
        prices.setAttribute('aria-label', `Precios de ${dish.nombre}`);
        for (const variant of dish.variantes) {
          const price = element('div', 'cb-price');
          price.append(element('span', 'cb-price-size', variant.nombre), element('strong', 'cb-price-value', money(variant.precio)));
          prices.append(price);
        }
        article.append(prices);
      }
      dishes.append(article);
    }
    content.append(dishes);
  }
  const foot = element('footer', 'cb-page-foot');
  foot.append(element('span', '', 'Precios incluyen IGV'), element('span', '', String(number + 1)));
  content.append(foot);
  return root;
}
