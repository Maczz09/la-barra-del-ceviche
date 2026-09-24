import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageFlip, type SizeType, type FlipCorner } from 'page-flip';
import { Howl } from 'howler';
import { obtenerCartaPublica, obtenerSedePublica } from '../../api/cartaPublica.api';
import type { SedePublicaDto } from '../../types/cartaPublica.types';
import type { CategoriaDto, ProductoDto } from '../../types/inventario.types';
import { useCartaSocket } from './useCartaSocket';
import { buildBookPages, categoryPageIndex, pageIndexAfterRefresh, type BookPage } from './bookModel';
import { makePage } from './bookDom';
import { pageSoundDataUri } from './pageSound';
import { APP_LOGO, APP_NAME } from '../../config';
import './book-carta.css';

interface Catalog { sede: SedePublicaDto | null; categorias: CategoriaDto[]; productos: ProductoDto[] }
const REFRESH_MS = 45_000;
// The installed page-flip bundle exports PageFlip but not its FlippingState enum.
const isFlipping = (flip: PageFlip) => String(flip.getState()) === 'flipping';

export function BookCartaScreen() {
  const { sedeId } = useParams<{ sedeId: string }>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineHostRef = useRef<HTMLDivElement | null>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const renderedPagesRef = useRef<BookPage[]>([]);
  const renderedSedeRef = useRef<SedePublicaDto | null>(null);
  const pendingUpdateRef = useRef<{ pages: BookPage[]; sede: SedePublicaDto } | null>(null);
  const soundRef = useRef<Howl | null>(null);
  const soundOnRef = useRef(false);
  const pageIndexRef = useRef(0);
  const pendingPageRef = useRef<number | null>(null);
  soundOnRef.current = soundOn;

  const load = useCallback(async () => {
    if (!sedeId) return;
    try {
      const [sede, carta] = await Promise.all([obtenerSedePublica(sedeId), obtenerCartaPublica(sedeId)]);
      const next = { sede, categorias: carta.categorias, productos: carta.productos };
      setCatalog((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      setError(null);
    } catch {
      setError('No se pudo cargar la carta. Revisa tu conexión e intenta de nuevo.');
    }
  }, [sedeId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);
  useCartaSocket(sedeId, () => void load());

  const pages = useMemo(() => catalog ? buildBookPages(catalog.categorias, catalog.productos) : [], [catalog]);
  const categories = useMemo(() => pages.filter((p): p is Extract<(typeof pages)[number], { kind: 'category' }> => p.kind === 'category' && p.part === 1), [pages]);

  useEffect(() => {
    soundRef.current = new Howl({ src: [pageSoundDataUri()], format: ['wav'], volume: 0.22 });
    return () => { soundRef.current?.unload(); soundRef.current = null; };
  }, []);
  useEffect(() => {
    const sync = () => setFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const updateBook = useCallback((nextPages: BookPage[], sede: SedePublicaDto) => {
    const flip = flipRef.current;
    if (!flip) return;
    const target = pageIndexAfterRefresh(renderedPagesRef.current, nextPages, pageIndexRef.current);
    flip.updateFromHtml(nextPages.map((page, index) => makePage(page, sede, index)));
    flip.turnToPage(target);
    renderedPagesRef.current = nextPages;
    renderedSedeRef.current = sede;
    pageIndexRef.current = target;
    setPageIndex(target);
  }, []);

  useEffect(() => {
    const sede = catalog?.sede;
    if (!sede || !hostRef.current) return;
    const current = flipRef.current;
    if (current && renderedSedeRef.current?.id === sede.id) {
      if (renderedPagesRef.current === pages && renderedSedeRef.current === sede) return;
      if (isFlipping(current)) pendingUpdateRef.current = { pages, sede };
      else updateBook(pages, sede);
      return;
    }
    if (current) {
      current.destroy();
      engineHostRef.current?.remove();
      pendingUpdateRef.current = null;
      pageIndexRef.current = 0;
    }
    const host = document.createElement('div');
    host.className = 'cb-engine';
    pages.forEach((page, index) => host.append(makePage(page, sede, index)));
    hostRef.current.append(host);
    const flip = new PageFlip(host, {
      width: 360, height: 560, size: 'stretch' as SizeType, minWidth: 280, maxWidth: 460,
      minHeight: 450, maxHeight: 700, autoSize: false, showCover: true,
      usePortrait: true, drawShadow: true, maxShadowOpacity: 0.4,
      flippingTime: 650, mobileScrollSupport: true, clickEventForward: true,
    });
    engineHostRef.current = host;
    flipRef.current = flip;
    renderedPagesRef.current = pages;
    renderedSedeRef.current = sede;
    flip.on('flip', (event) => {
      setPageIndex(Number(event.data));
      pageIndexRef.current = Number(event.data);
      if (soundOnRef.current) soundRef.current?.play();
    });
    flip.on('changeState', (event) => {
      if (event.data !== 'read') return;
      const pendingUpdate = pendingUpdateRef.current;
      pendingUpdateRef.current = null;
      if (pendingUpdate) updateBook(pendingUpdate.pages, pendingUpdate.sede);
      if (pendingPageRef.current === null) return;
      const target = pendingPageRef.current;
      pendingPageRef.current = null;
      flip.turnToPage(Math.min(target, renderedPagesRef.current.length - 1));
    });
    flip.loadFromHTML(Array.from(host.querySelectorAll<HTMLElement>('.cb-page')));
    setPageIndex(0);
  }, [catalog?.sede, pages, updateBook]);

  useEffect(() => () => {
    pendingPageRef.current = null;
    pendingUpdateRef.current = null;
    const flip = flipRef.current;
    flipRef.current = null;
    flip?.destroy();
    engineHostRef.current?.remove();
    engineHostRef.current = null;
    renderedPagesRef.current = [];
    renderedSedeRef.current = null;
  }, []);

  const go = (index: number) => {
    const flip = flipRef.current;
    if (!flip || index < 0 || index >= pages.length) return;
    if (isFlipping(flip)) {
      pendingPageRef.current = index;
      return;
    }
    // StPageFlip's animated flipToPage can overshoot a target in a desktop
    // spread (cover + paired pages). Category jumps must land exactly.
    if (index > 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) flip.turnToPage(index);
    else flip.flip(index, 'bottom' as FlipCorner);
  };
  const step = (direction: -1 | 1) => {
    const flip = flipRef.current;
    if (!flip) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (direction > 0) flip.turnToNextPage(); else flip.turnToPrevPage();
    } else if (direction > 0) flip.flipNext('bottom' as FlipCorner); else flip.flipPrev('bottom' as FlipCorner);
  };
  const jump = (id: string) => {
    go(categoryPageIndex(pages, id));
    setCategoriesOpen(false);
  };
  const handleBookClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-action="open"]')) go(1);
    const categoryId = target.closest<HTMLElement>('[data-category-id]')?.dataset.categoryId;
    if (categoryId) jump(categoryId);
  };
  const toggleFullScreen = async () => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrapperRef.current.requestFullscreen();
    setFullScreen(Boolean(document.fullscreenElement));
  };

  if (!sedeId) return <main className="carta-book"><p className="cb-status">Enlace inválido.</p></main>;
  if (error && !catalog) return <main className="carta-book"><p className="cb-status">{error}</p><button onClick={() => void load()}>Reintentar</button></main>;
  if (!catalog) return <main className="carta-book"><p className="cb-status">Cargando carta...</p></main>;
  if (!catalog.sede) return <main className="carta-book"><p className="cb-status">Esta carta ya no está disponible.</p></main>;

  return <main className="carta-book" ref={wrapperRef} onKeyDown={(event) => {
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'Escape') setCategoriesOpen(false);
  }}>
    <header className="cb-toolbar">
      <div className="cb-identity"><img src={APP_LOGO ?? '/logo.webp'} alt={APP_NAME} /><span>{catalog.sede.nombre}</span></div>
      <div className="cb-toolbar-actions">
        <button type="button" aria-label={soundOn ? 'Silenciar carta' : 'Activar sonido'} aria-pressed={soundOn} onClick={() => setSoundOn((value) => !value)}>{soundOn ? 'Sonido: sí' : 'Sonido: no'}</button>
        <button type="button" aria-label={fullScreen ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={() => void toggleFullScreen()}>{fullScreen ? 'Salir' : 'Pantalla completa'}</button>
      </div>
    </header>
    {error && <div className="cb-warning" role="status">Sin conexión. Mostramos la última carta disponible.</div>}
    <div className="cb-book-wrap" onClick={handleBookClick}>
      <div className="cb-stage" ref={hostRef} aria-label="Carta digital en formato libro" />
    </div>
    <nav className="cb-controls" aria-label="Navegación de la carta">
      <button type="button" onClick={() => step(-1)} disabled={pageIndex === 0}>Anterior</button>
      <button type="button" className="cb-categories-trigger" onClick={() => setCategoriesOpen(true)}>Categorías</button>
      <span aria-live="polite">{pageIndex + 1} / {pages.length}</span>
      <button type="button" onClick={() => step(1)} disabled={pageIndex >= pages.length - 1}>Siguiente</button>
    </nav>
    {categoriesOpen && <div className="cb-sheet-backdrop" onClick={() => setCategoriesOpen(false)}>
      <div className="cb-sheet" role="dialog" aria-modal="true" aria-label="Ir a categoría" onClick={(event) => event.stopPropagation()}>
        <div className="cb-sheet-head"><h2>Categorías</h2><button type="button" onClick={() => setCategoriesOpen(false)} aria-label="Cerrar categorías">Cerrar</button></div>
        <div className="cb-sheet-list"><button type="button" onClick={() => { go(0); setCategoriesOpen(false); }}>Portada</button>
          {categories.map((entry) => <button type="button" key={entry.category.id} onClick={() => jump(entry.category.id)}>{entry.category.nombre}</button>)}
        </div>
      </div>
    </div>}
  </main>;
}
