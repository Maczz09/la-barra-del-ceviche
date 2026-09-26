// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookCartaScreen } from './BookCartaScreen';
import { obtenerCartaPublica, obtenerSedePublica } from '../../api/cartaPublica.api';

const engine = vi.hoisted(() => ({ page: 0, state: 'read', creations: 0, updates: 0, destroys: 0, mobileScrollSupport: false, callback: undefined as undefined | ((event: { data: number }) => void), stateCallback: undefined as undefined | ((event: { data: string }) => void) }));
const socket = vi.hoisted(() => ({ refresh: () => undefined as void }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ sedeId: 's1' }) }));
vi.mock('../../api/cartaPublica.api', () => ({ obtenerCartaPublica: vi.fn(), obtenerSedePublica: vi.fn() }));
vi.mock('./useCartaSocket', () => ({ useCartaSocket: (_id: string, cb: () => void) => { socket.refresh = cb; } }));
vi.mock('howler', () => ({ Howl: class { play() {} unload() {} } }));
vi.mock('page-flip', () => ({ PageFlip: class {
  private host: HTMLElement;
  constructor(host: HTMLElement, settings: { mobileScrollSupport: boolean }) {
    this.host = host;
    engine.creations += 1;
    engine.mobileScrollSupport = settings.mobileScrollSupport;
  }
  on(name: string, callback: (event: { data: never }) => void) {
    if (name === 'changeState') engine.stateCallback = callback as (event: { data: string }) => void;
    else engine.callback = callback as (event: { data: number }) => void;
  }
  getState() { return engine.state; }
  loadFromHTML() {}
  updateFromHtml(items: HTMLElement[]) { engine.updates += 1; this.host.replaceChildren(...items); }
  destroy() { engine.destroys += 1; }
  flip(index: number) { engine.page = index; engine.callback?.({ data: index }); }
  flipNext() { this.flip(engine.page + 1); }
  flipPrev() { this.flip(Math.max(0, engine.page - 1)); }
  turnToPage(index: number) { this.flip(index); }
  turnToNextPage() { this.flipNext(); }
  turnToPrevPage() { this.flipPrev(); }
} }));

const catalog = {
  categorias: [{ id: 'cev', nombre: 'Ceviches', area: 'COCINA' }, { id: 'bar', nombre: 'Bebidas', area: 'BARRA' }],
  productos: [
    { id: 'p1', categoriaId: 'cev', nombre: 'Ceviche de Caballa', precio: 30, tamanoId: 'personal', tamano: { id: 'personal', nombre: 'Personal', orden: 10 }, disponible: true, stockActual: null },
    { id: 'p2', categoriaId: 'cev', nombre: 'Ceviche de Caballa', precio: 40, tamanoId: 'familiar', tamano: { id: 'familiar', nombre: 'Familiar', orden: 40 }, disponible: true, stockActual: null },
    { id: 'p3', categoriaId: 'bar', nombre: 'Chicha morada', precio: 8, disponible: true, stockActual: null },
  ],
};

describe('carta libro pública', () => {
  beforeEach(() => {
    engine.page = 0;
    engine.state = 'read';
    engine.creations = 0;
    engine.updates = 0;
    engine.destroys = 0;
    engine.mobileScrollSupport = false;
    vi.mocked(obtenerSedePublica).mockResolvedValue({ id: 's1', nombre: 'La Barra del Ceviche', direccion: null, telefono: null });
    vi.mocked(obtenerCartaPublica).mockResolvedValue(catalog as any);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any;
  });

  it('muestra portada con logo y abre el índice del libro', async () => {
    render(<BookCartaScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir menú' })).toBeDefined());
    expect(screen.getAllByAltText('La Barra del Ceviche').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(engine.page).toBe(1);
    expect(engine.mobileScrollSupport).toBe(true);
  });

  it('salta por categoría y conserva los precios por tamaño', async () => {
    render(<BookCartaScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Categorías' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Categorías' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ir a categoría' })).getByRole('button', { name: 'Ceviches' }));
    expect(engine.page).toBe(2);
    expect(screen.getByText('S/ 30.00')).toBeDefined();
    expect(screen.getByText('S/ 40.00')).toBeDefined();
    expect(screen.getByText('Personal')).toBeDefined();
    expect(screen.getByText('Familiar')).toBeDefined();
  });

  it('espera a que termine el giro de portada antes de saltar a una categoría en escritorio', async () => {
    render(<BookCartaScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir menú' })).toBeDefined());
    engine.state = 'flipping';
    fireEvent.click(screen.getByRole('button', { name: 'Categorías' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ir a categoría' })).getByRole('button', { name: 'Ceviches' }));
    expect(engine.page).toBe(0);
    act(() => { engine.state = 'read'; engine.stateCallback?.({ data: 'read' }); });
    expect(engine.page).toBe(2);
  });

  it('actualiza disponibilidad por socket y no conserva un precio agotado', async () => {
    render(<BookCartaScreen />);
    await waitFor(() => expect(screen.getByText('S/ 30.00')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Categorías' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ir a categoría' })).getByRole('button', { name: 'Ceviches' }));
    const book = document.querySelector('.cb-engine');
    vi.mocked(obtenerCartaPublica).mockResolvedValue({ ...catalog, productos: catalog.productos.map((p) => p.id === 'p1' ? { ...p, disponible: false } : p) } as any);
    await act(async () => socket.refresh());
    await waitFor(() => expect(screen.queryByText('S/ 30.00')).toBeNull());
    expect(screen.getByText('S/ 40.00')).toBeDefined();
    expect(document.querySelector('.cb-engine')).toBe(book);
    expect(engine.creations).toBe(1);
    expect(engine.updates).toBe(1);
    expect(engine.destroys).toBe(0);
    expect(engine.page).toBe(2);
  });

  it('espera a que termine el giro antes de actualizar disponibilidad en vivo', async () => {
    render(<BookCartaScreen />);
    await waitFor(() => expect(screen.getByText('S/ 30.00')).toBeDefined());
    engine.state = 'flipping';
    vi.mocked(obtenerCartaPublica).mockResolvedValue({ ...catalog, productos: catalog.productos.map((p) => p.id === 'p1' ? { ...p, disponible: false } : p) } as any);
    await act(async () => socket.refresh());
    expect(engine.updates).toBe(0);
    act(() => { engine.state = 'read'; engine.stateCallback?.({ data: 'read' }); });
    expect(engine.updates).toBe(1);
    expect(screen.queryByText('S/ 30.00')).toBeNull();
  });

  it('muestra error recuperable de red', async () => {
    vi.mocked(obtenerCartaPublica).mockRejectedValue(new Error('red'));
    render(<BookCartaScreen />);
    expect(await screen.findByText(/No se pudo cargar la carta/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
  });
});
