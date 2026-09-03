// @vitest-environment jsdom
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicCartaScreen } from './PublicCartaScreen';
import { obtenerSedePublica, obtenerCartaPublica } from '../../api/cartaPublica.api';
import type { CategoriaDto, ProductoDto } from '../../types/inventario.types';

const socketMock = vi.hoisted(() => ({ refrescar: () => undefined as void }));

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
  useCartaSocket: (_sede: string, refrescar: () => void) => { socketMock.refrescar = refrescar; },
}));

const SEDE = { id: 'sede-1', nombre: 'Sede Central', direccion: 'Av. X 123', telefono: '987654321' };
const CATEGORIAS: CategoriaDto[] = [
  { id: 'cat-1', nombre: 'Ceviches', descripcion: 'El clásico de la casa.', area: 'COCINA' },
  { id: 'cat-2', nombre: 'Bebidas', descripcion: null, area: 'BARRA' },
];
const PERSONAL = { id: 't-personal', nombre: 'Personal', orden: 10, activo: true };
const FAMILIAR = { id: 't-familiar', nombre: 'Familiar', orden: 40, activo: true };
const PRODUCTOS: ProductoDto[] = [
  { id: 'p1', categoriaId: 'cat-1', nombre: 'Ceviche de Filete', tamanoId: PERSONAL.id, tamano: PERSONAL, descripcion: null, precio: 30, disponible: true, stockActual: null },
  { id: 'p2', categoriaId: 'cat-1', nombre: 'Ceviche de Filete', tamanoId: FAMILIAR.id, tamano: FAMILIAR, descripcion: null, precio: 40, disponible: true, stockActual: null },
  { id: 'p3', categoriaId: 'cat-2', nombre: 'Chicha Morada', descripcion: null, precio: 8, disponible: true, stockActual: null },
];

describe('PublicCartaScreen', () => {
  beforeEach(() => {
    vi.mocked(obtenerSedePublica).mockResolvedValue(SEDE);
    vi.mocked(obtenerCartaPublica).mockResolvedValue({ categorias: CATEGORIAS, productos: PRODUCTOS });
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
    expect(within(screen.getByRole('button', { name: /Ceviches/ })).getByText('1 plato')).toBeDefined();
    expect(screen.getByText('Bebidas')).toBeDefined();
    expect(within(screen.getByRole('button', { name: /Bebidas/ })).getByText('1 plato')).toBeDefined();
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

  it('ordena variantes y filtros por el orden de BD y admite tamaños nuevos con precios decimales', async () => {
    const degustacion = { id: 't-degustacion', nombre: 'Degustación', orden: 5, activo: true };
    const grande = { id: 't-grande', nombre: 'Grande', orden: 30, activo: true };
    vi.mocked(obtenerCartaPublica).mockResolvedValue({
      categorias: CATEGORIAS,
      productos: [PRODUCTOS[1],
        { ...PRODUCTOS[0], id: 'grande', tamanoId: grande.id, tamano: grande, precio: 37.5 },
        PRODUCTOS[0],
        { ...PRODUCTOS[0], id: 'degustacion', tamanoId: degustacion.id, tamano: degustacion, precio: 18.9 },
      ],
    });
    render(<PublicCartaScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /ver la carta/i }));
    fireEvent.click(screen.getByRole('button', { name: /Ceviches/ }));

    const filtros = screen.getByRole('group', { name: 'Filtrar por tamaño' });
    expect(within(filtros).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todos los tamaños', 'Degustación', 'Personal', 'Grande', 'Familiar']);
    const variantes = within(screen.getByRole('list', { name: 'Tamaños de Ceviche de Filete' })).getAllByRole('listitem');
    expect(variantes.map((v) => v.textContent)).toEqual(['DegustaciónS/ 18.90', 'PersonalS/ 30.00', 'GrandeS/ 37.50', 'FamiliarS/ 40.00']);

    fireEvent.click(within(filtros).getByRole('button', { name: 'Grande', exact: true }));
    expect(screen.queryByText('S/ 30.00')).toBeNull();
    expect(screen.getByText('S/ 37.50')).toBeDefined();
    expect(within(filtros).getByRole('button', { name: 'Grande', exact: true }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(filtros).getByRole('button', { name: 'Todos los tamaños' }));
    expect(screen.getByText('S/ 18.90')).toBeDefined();
  });

  it('muestra productos sin tamaño con precio único, permite filtrarlos y conserva precios duplicados', async () => {
    vi.mocked(obtenerCartaPublica).mockResolvedValue({
      categorias: CATEGORIAS,
      productos: [...PRODUCTOS,
        { ...PRODUCTOS[0], id: 'duplicado', precio: 32.5, descripcion: 'Con guarnición extra' },
        { ...PRODUCTOS[0], id: 'sin-tamano', nombre: 'Leche de tigre', tamanoId: null, tamano: null, precio: 12 },
      ],
    });
    render(<PublicCartaScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /ver la carta/i }));
    fireEvent.click(screen.getByRole('button', { name: /Ceviches/ }));

    expect(screen.getByText('S/ 30.00')).toBeDefined();
    expect(screen.getByText('S/ 32.50')).toBeDefined();
    expect(screen.getByText('Con guarnición extra')).toBeDefined();
    expect(within(screen.getByRole('article', { name: 'Leche de tigre' })).queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sin tamaño' }));
    expect(screen.getByText('S/ 12.00')).toBeDefined();
    expect(screen.queryByText('Ceviche de Filete')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Personal', exact: true }));
    expect(screen.getByText('S/ 30.00')).toBeDefined();
    expect(screen.getByText('S/ 32.50')).toBeDefined();
    expect(screen.queryByText('S/ 12.00')).toBeNull();
  });

  it('limpia el filtro al cambiar de categoría o volver para no ocultar otros platos', async () => {
    render(<PublicCartaScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /ver la carta/i }));
    fireEvent.click(screen.getByRole('button', { name: /Ceviches/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Personal', exact: true }));
    expect(screen.queryByText('S/ 40.00')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Categoría siguiente' }));
    expect(screen.getByText('Chicha Morada')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Filtrar por tamaño' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Categoría anterior' }));
    expect(screen.getByText('S/ 40.00')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Personal', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Categorías', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /Ceviches/ }));
    expect(screen.getByText('S/ 40.00')).toBeDefined();
  });

  it('refresca los tamaños, precios y disponibilidad por socket sin quedar en un filtro vacío', async () => {
    render(<PublicCartaScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /ver la carta/i }));
    fireEvent.click(screen.getByRole('button', { name: /Ceviches/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Personal', exact: true }));
    vi.mocked(obtenerCartaPublica).mockResolvedValue({
      categorias: CATEGORIAS,
      productos: [{ ...PRODUCTOS[0], disponible: false }, { ...PRODUCTOS[1], precio: 48.5 }, PRODUCTOS[2]],
    });
    await act(async () => socketMock.refrescar());
    expect(await screen.findByText('S/ 48.50')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Personal', exact: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Todos los tamaños' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('S/ 30.00')).toBeNull();
  });

  it('permite volver si se agotan todos los productos de la categoría abierta', async () => {
    render(<PublicCartaScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /ver la carta/i }));
    fireEvent.click(screen.getByRole('button', { name: /Ceviches/ }));
    vi.mocked(obtenerCartaPublica).mockResolvedValue({ categorias: CATEGORIAS, productos: [PRODUCTOS[2]] });
    await act(async () => socketMock.refrescar());
    expect(await screen.findByText('No hay platos disponibles en esta categoría.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Categorías', exact: true }));
    expect(screen.getByRole('button', { name: /Bebidas/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Ceviches/ })).toBeNull();
  });
});
