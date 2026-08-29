// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicCartaScreen } from './PublicCartaScreen';
import { obtenerSedePublica, obtenerCartaPublica } from '../../api/cartaPublica.api';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ sedeId: 'sede-1' }),
}));

vi.mock('../../api/cartaPublica.api', () => ({
  obtenerSedePublica: vi.fn(),
  obtenerCartaPublica: vi.fn(),
}));

// GSAP no aporta nada verificable en jsdom (no hay layout real) y sus
// tweens son asíncronos por diseño — para las pruebas de navegación,
// `gsap.to(...)` dispara su `onComplete` de inmediato, que es lo único que
// el componente usa para decidir el cambio de vista. `useGSAP` (solo
// animaciones de entrada, no gobierna estado) se deja como no-op.
vi.mock('gsap', () => ({
  gsap: {
    to: (_target: unknown, vars: { onComplete?: () => void }) => vars.onComplete?.(),
    fromTo: () => undefined,
  },
}));
vi.mock('@gsap/react', () => ({
  useGSAP: () => ({ contextSafe: (fn: (...args: unknown[]) => unknown) => fn }),
}));

// El socket real (socket.io-client) no debe conectarse en pruebas unitarias
// — el comportamiento de tiempo real se cubre en useCartaSocket.spec.ts.
vi.mock('./useCartaSocket', () => ({
  useCartaSocket: () => undefined,
}));

const SEDE = { id: 'sede-1', nombre: 'Sede Central', direccion: 'Av. X 123', telefono: '987654321' };
const CATEGORIAS = [
  { id: 'cat-1', nombre: 'Ceviches', descripcion: 'El clásico de la casa.', area: 'COCINA' },
  { id: 'cat-2', nombre: 'Bebidas', descripcion: null, area: 'BARRA' },
];
const PRODUCTOS = [
  { id: 'p1', categoriaId: 'cat-1', nombre: 'Ceviche de Filete (Personal)', descripcion: null, precio: 30, disponible: true, stockActual: null },
  { id: 'p2', categoriaId: 'cat-1', nombre: 'Ceviche de Filete (Familiar)', descripcion: null, precio: 40, disponible: true, stockActual: null },
  { id: 'p3', categoriaId: 'cat-2', nombre: 'Chicha Morada', descripcion: null, precio: 8, disponible: true, stockActual: null },
];

describe('PublicCartaScreen', () => {
  beforeEach(() => {
    vi.mocked(obtenerSedePublica).mockResolvedValue(SEDE as any);
    vi.mocked(obtenerCartaPublica).mockResolvedValue({ categorias: CATEGORIAS, productos: PRODUCTOS } as any);
    // jsdom no implementa matchMedia — el componente lo usa para respetar
    // prefers-reduced-motion al decidir si anima las transiciones de vista.
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any;
  });

  it('muestra la portada con el nombre, dirección y teléfono de la sede', async () => {
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText('Sede Central')).toBeDefined());
    expect(screen.getByText('La Barra del Ceviche')).toBeDefined();
    expect(screen.getByText('Av. X 123')).toBeDefined();
    expect(screen.getByText('987654321')).toBeDefined();
    expect(screen.getByRole('button', { name: /ver la carta/i })).toBeDefined();
  });

  it('al pulsar "Ver la carta" muestra la grilla de categorías con el conteo de platos', async () => {
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText('Sede Central')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /ver la carta/i }));

    await waitFor(() => expect(screen.getByText('Ceviches')).toBeDefined());
    expect(screen.getByText('2 platos')).toBeDefined();
    expect(screen.getByText('Bebidas')).toBeDefined();
    expect(screen.getByText('1 plato')).toBeDefined();
  });

  it('abre una categoría, agrupa el plato por tamaño, y puede volver a la grilla', async () => {
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText('Sede Central')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /ver la carta/i }));
    await waitFor(() => expect(screen.getByText('Ceviches')).toBeDefined());

    fireEvent.click(screen.getByText('Ceviches'));

    await waitFor(() => expect(screen.getByText('Ceviche de Filete')).toBeDefined());
    expect(screen.getByText('S/ 30.00')).toBeDefined();
    expect(screen.getByText('S/ 40.00')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /categorías/i }));

    await waitFor(() => expect(screen.getByText('Bebidas')).toBeDefined());
    expect(screen.queryByText('Ceviche de Filete')).toBeNull();
  });

  it('navega entre categorías con siguiente/anterior sin volver a la grilla', async () => {
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText('Sede Central')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /ver la carta/i }));
    await waitFor(() => expect(screen.getByText('Ceviches')).toBeDefined());
    fireEvent.click(screen.getByText('Ceviches'));
    await waitFor(() => expect(screen.getByText('Ceviche de Filete')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /categoría siguiente/i }));

    await waitFor(() => expect(screen.getByText('Chicha Morada')).toBeDefined());
    expect(screen.queryByText('Ceviche de Filete')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /categoría anterior/i }));

    await waitFor(() => expect(screen.getByText('Ceviche de Filete')).toBeDefined());
  });

  it('agrupa las categorías de Inventario aparte, bajo "Abarrotes"', async () => {
    vi.mocked(obtenerCartaPublica).mockResolvedValue({
      categorias: [...CATEGORIAS, { id: 'cat-3', nombre: 'Agua Mineral', descripcion: null, area: 'INVENTARIO' }],
      productos: [...PRODUCTOS, { id: 'p4', categoriaId: 'cat-3', nombre: 'Agua Alcalina', descripcion: null, precio: 3, disponible: true, stockActual: 12 }],
    } as any);

    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText('Sede Central')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /ver la carta/i }));

    await waitFor(() => expect(screen.getByText('Agua Mineral')).toBeDefined());
    expect(screen.getByText('Abarrotes')).toBeDefined();
    expect(screen.getByText('1 disponible')).toBeDefined();

    fireEvent.click(screen.getByText('Agua Mineral'));
    await waitFor(() => expect(screen.getByText('Agua Alcalina')).toBeDefined());
    expect(screen.getByText('S/ 3.00')).toBeDefined();
  });

  it('muestra un estado de error si falla la carga', async () => {
    vi.mocked(obtenerCartaPublica).mockRejectedValue(new Error('network'));
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText(/No se pudo cargar la carta/)).toBeDefined());
  });

  it('muestra un mensaje si la sede no existe o está desactivada', async () => {
    vi.mocked(obtenerSedePublica).mockResolvedValue(null);
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText('Esta carta ya no está disponible.')).toBeDefined());
  });
});
