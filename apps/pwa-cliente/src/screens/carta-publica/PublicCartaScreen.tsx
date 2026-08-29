// screens/carta-publica/PublicCartaScreen.tsx — Carta pública/QR (T-XX):
// pantalla SIN autenticación, fuera del Shell/ProtectedRoute (ver
// router/index.tsx, mismo nivel que /imprimir/*). Cualquiera con el link o
// que escanee el QR de Inicio la ve.
//
// Flujo de 3 vistas (portada → grilla de categorías → detalle de una
// categoría, con "volver" y navegación prev/next tipo "pasar página"),
// animado con GSAP. La disponibilidad se refresca por WebSocket
// (useCartaSocket) en cuanto el staff togglea un plato — el poll de 45s es
// solo la red de seguridad si el socket no conecta.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { obtenerSedePublica, obtenerCartaPublica } from '../../api/cartaPublica.api';
import { useCartaSocket } from './useCartaSocket';
import { agruparPorTamano } from './agruparPorTamano';
import { fmt } from '../../utils/format';
import { Icons } from '../../components/ui/icons';
import { APP_NAME } from '../../config';
import type { SedePublicaDto } from '../../types/cartaPublica.types';
import type { CategoriaDto, ProductoDto } from '../../types/inventario.types';
import './carta-publica.css';

const REFETCH_MS = 45_000;
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&display=swap';

function useFuentePublica() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Orla decorativa (sin fotografía) — separador entre el nombre de la sede y sus datos. */
function Orla() {
  return (
    <svg className="cp-orla" viewBox="0 0 220 24" aria-hidden="true">
      <line x1="0" y1="12" x2="88" y2="12" stroke="currentColor" strokeWidth="1" />
      <path d="M110 4 L118 12 L110 20 L102 12 Z" fill="currentColor" />
      <line x1="132" y1="12" x2="220" y2="12" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function iconoDeCategoria(area: CategoriaDto['area']) {
  if (area === 'BARRA') return Icons.Drink;
  if (area === 'INVENTARIO') return Icons.Bag;
  return Icons.Chef;
}

interface Datos {
  sede: SedePublicaDto | null;
  categorias: CategoriaDto[];
  productos: ProductoDto[];
}

type Vista = 'portada' | 'categorias' | 'detalle';

const EXIT_MS = 280;

export function PublicCartaScreen() {
  const { sedeId } = useParams<{ sedeId: string }>();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('portada');
  const [categoriaActivaId, setCategoriaActivaId] = useState<string | null>(null);
  const [direccionNav, setDireccionNav] = useState<'next' | 'prev'>('next');

  const containerRef = useRef<HTMLDivElement>(null);

  useFuentePublica();

  const cargar = useCallback(async () => {
    if (!sedeId) return;
    try {
      const [sede, carta] = await Promise.all([obtenerSedePublica(sedeId), obtenerCartaPublica(sedeId)]);
      setDatos({ sede, categorias: carta.categorias, productos: carta.productos });
      setError(null);
    } catch {
      setError('No se pudo cargar la carta. Verifica tu conexión e intenta de nuevo.');
    }
  }, [sedeId]);

  useEffect(() => {
    void cargar();
    const interval = setInterval(() => void cargar(), REFETCH_MS);
    return () => clearInterval(interval);
  }, [cargar]);

  // Tiempo real: el staff togglea disponibilidad → el evento llega por
  // WebSocket → recargamos la carta completa (más simple y robusto que
  // parchear un solo producto en memoria).
  useCartaSocket(sedeId, () => void cargar());

  const categoriasConItems = useMemo(() => {
    if (!datos) return [];
    const idsConProductos = new Set(datos.productos.map((p) => p.categoriaId));
    return datos.categorias.filter((c) => idsConProductos.has(c.id));
  }, [datos]);

  // Categorías de área INVENTARIO (agua, cerveza, gaseosas…) se muestran
  // agrupadas aparte bajo "Abarrotes" — de cara al cliente es un nombre más
  // claro que "Inventario", que es solo la palabra interna del staff.
  const categoriasCarta = useMemo(() => categoriasConItems.filter((c) => c.area !== 'INVENTARIO'), [categoriasConItems]);
  const categoriasAbarrotes = useMemo(() => categoriasConItems.filter((c) => c.area === 'INVENTARIO'), [categoriasConItems]);

  const categoriaActiva = categoriasConItems.find((c) => c.id === categoriaActivaId);

  const platosDeCategoriaActiva = useMemo(() => {
    if (!datos || !categoriaActivaId) return [];
    const productosDeCategoria = datos.productos.filter((p) => p.categoriaId === categoriaActivaId);
    return agruparPorTamano(productosDeCategoria);
  }, [datos, categoriaActivaId]);

  // ─── Animaciones de entrada por vista ──────────────────────────────
  const { contextSafe } = useGSAP(
    () => {
      if (reducedMotion()) return;
      if (vista === 'portada') {
        gsap.fromTo('.cp-portada', { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.out' });
      } else if (vista === 'categorias') {
        gsap.fromTo(
          '.cp-cat-card',
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.055, ease: 'power2.out' },
        );
      } else if (vista === 'detalle') {
        const desde = direccionNav === 'next' ? 36 : -36;
        gsap.fromTo(
          '.cp-detalle-panel',
          { opacity: 0, x: desde },
          { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' },
        );
      }
    },
    // Sin `scope`: esta pantalla es un árbol de render aislado (fuera del
    // Shell, sin overlap de clases con el resto de la app), así que no
    // hace falta acotar el selector de gsap a un contenedor — y evita el
    // caso raro donde una selector-text llamada desde fuera del callback
    // de useGSAP (los handlers de click de abajo) se resuelve contra un
    // contexto que ya no aplica.
    // `!!datos` en las deps: el layout-effect corre ANTES de que la carta
    // termine de cargar (mientras se muestra "Cargando carta…", sin
    // `.cp-portada` en el DOM todavía) — sin este flag, la animación de
    // entrada de la portada se dispara una vez contra un DOM vacío y
    // nunca más, y el fade-in real nunca se ve.
    { dependencies: [vista, categoriaActivaId, !!datos] },
  );

  // ─── Transiciones (salida animada, luego cambia el estado) ─────────
  // contextSafe() asegura que estos tweens queden registrados en el
  // contexto de useGSAP (se revierten solos si el componente se
  // desmonta a mitad de una animación).
  const irACategorias = contextSafe(() => {
    if (reducedMotion()) { setVista('categorias'); return; }
    gsap.to('.cp-portada', { opacity: 0, y: -14, duration: EXIT_MS / 1000, ease: 'power1.in', onComplete: () => setVista('categorias') });
  });

  const abrirCategoria = contextSafe((id: string) => {
    if (reducedMotion()) { setCategoriaActivaId(id); setVista('detalle'); return; }
    gsap.to('.cp-cat-grid', {
      opacity: 0,
      duration: EXIT_MS / 1000,
      ease: 'power1.in',
      onComplete: () => { setCategoriaActivaId(id); setVista('detalle'); },
    });
  });

  const volverACategorias = contextSafe(() => {
    if (reducedMotion()) { setVista('categorias'); return; }
    gsap.to('.cp-detalle-panel', { opacity: 0, duration: EXIT_MS / 1000, ease: 'power1.in', onComplete: () => setVista('categorias') });
  });

  const navegarCategoria = contextSafe((dir: 'prev' | 'next') => {
    if (categoriasConItems.length < 2) return;
    const idx = categoriasConItems.findIndex((c) => c.id === categoriaActivaId);
    const siguienteIdx = dir === 'next'
      ? (idx + 1) % categoriasConItems.length
      : (idx - 1 + categoriasConItems.length) % categoriasConItems.length;
    const siguienteId = categoriasConItems[siguienteIdx].id;
    setDireccionNav(dir);
    if (reducedMotion()) { setCategoriaActivaId(siguienteId); return; }
    gsap.to('.cp-detalle-panel', {
      opacity: 0,
      x: dir === 'next' ? -36 : 36,
      duration: 0.22,
      ease: 'power1.in',
      onComplete: () => setCategoriaActivaId(siguienteId),
    });
  });

  if (!sedeId) {
    return <div className="carta-publica"><div className="cp-estado">Link inválido.</div></div>;
  }
  if (error) {
    return <div className="carta-publica"><div className="cp-estado">{error}</div></div>;
  }
  if (!datos) {
    return <div className="carta-publica"><div className="cp-estado">Cargando carta…</div></div>;
  }
  if (!datos.sede) {
    return <div className="carta-publica"><div className="cp-estado">Esta carta ya no está disponible.</div></div>;
  }

  return (
    <div className="carta-publica" ref={containerRef}>
      {vista === 'portada' && (
        <section className="cp-portada">
          <p className="cp-portada-marca">{APP_NAME}</p>
          <h1 className="cp-portada-nombre">{datos.sede.nombre}</h1>
          <Orla />
          <div className="cp-portada-datos">
            {datos.sede.direccion && <span>{datos.sede.direccion}</span>}
            {datos.sede.telefono && <span>{datos.sede.telefono}</span>}
          </div>
          <button type="button" className="cp-portada-cta" onClick={irACategorias}>
            Ver la carta
          </button>
        </section>
      )}

      {vista !== 'portada' && categoriasConItems.length === 0 && (
        <div className="cp-vacio">Todavía no hay platos disponibles en esta carta.</div>
      )}

      {vista === 'categorias' && categoriasConItems.length > 0 && (
        <>
          <header className="cp-header-min">
            <p className="cp-marca">{APP_NAME}</p>
            <h2 className="cp-nombre-sede-min">{datos.sede.nombre}</h2>
          </header>
          <div className="cp-cat-grid">
            {categoriasCarta.map((cat) => {
              const Ic = iconoDeCategoria(cat.area);
              const cantidad = datos.productos.filter((p) => p.categoriaId === cat.id).length;
              return (
                <button key={cat.id} type="button" className="cp-cat-card" onClick={() => abrirCategoria(cat.id)}>
                  <Ic s={26} />
                  <span className="cp-cat-nombre">{cat.nombre}</span>
                  <span className="cp-cat-conteo">{cantidad} plato{cantidad === 1 ? '' : 's'}</span>
                </button>
              );
            })}
            {categoriasAbarrotes.length > 0 && (
              <>
                <div className="cp-cat-section-h">Abarrotes</div>
                {categoriasAbarrotes.map((cat) => {
                  const Ic = iconoDeCategoria(cat.area);
                  const cantidad = datos.productos.filter((p) => p.categoriaId === cat.id).length;
                  return (
                    <button key={cat.id} type="button" className="cp-cat-card" onClick={() => abrirCategoria(cat.id)}>
                      <Ic s={26} />
                      <span className="cp-cat-nombre">{cat.nombre}</span>
                      <span className="cp-cat-conteo">{cantidad} disponible{cantidad === 1 ? '' : 's'}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}

      {vista === 'detalle' && categoriaActiva && (
        <>
          <div className="cp-detalle-toolbar">
            <button type="button" className="cp-volver" onClick={volverACategorias}>
              <Icons.ArrowDown s={15} style={{ transform: 'rotate(90deg)' }} /> Categorías
            </button>
            {categoriasConItems.length > 1 && (
              <div className="cp-detalle-nav">
                <button type="button" aria-label="Categoría anterior" onClick={() => navegarCategoria('prev')}>
                  <Icons.ArrowDown s={15} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <button type="button" aria-label="Categoría siguiente" onClick={() => navegarCategoria('next')}>
                  <Icons.ArrowDown s={15} style={{ transform: 'rotate(-90deg)' }} />
                </button>
              </div>
            )}
          </div>

          <main className="cp-main">
            <h2 className="cp-categoria-titulo">{categoriaActiva.nombre}</h2>
            {categoriaActiva.descripcion && <p className="cp-categoria-desc">{categoriaActiva.descripcion}</p>}

            <div className="cp-detalle-panel" key={categoriaActivaId}>
              {platosDeCategoriaActiva.map((plato) => (
                <div className="cp-plato" key={plato.key}>
                  <div className="cp-plato-cabecera">
                    <span className="cp-plato-nombre">{plato.nombre}</span>
                    {plato.precioUnico != null && (
                      <span className="cp-plato-precio-unico">{fmt(plato.precioUnico)}</span>
                    )}
                  </div>
                  {plato.descripcion && <p className="cp-plato-desc">{plato.descripcion}</p>}
                  {plato.precios && (
                    <div className="cp-tabla-tallas">
                      {plato.precios.personal != null && (
                        <div className="cp-talla">
                          <div className="cp-talla-label">Personal</div>
                          <div className="cp-talla-precio">{fmt(plato.precios.personal)}</div>
                        </div>
                      )}
                      {plato.precios.mediana != null && (
                        <div className="cp-talla">
                          <div className="cp-talla-label">Mediana</div>
                          <div className="cp-talla-precio">{fmt(plato.precios.mediana)}</div>
                        </div>
                      )}
                      {plato.precios.familiar != null && (
                        <div className="cp-talla">
                          <div className="cp-talla-label">Familiar</div>
                          <div className="cp-talla-precio">{fmt(plato.precios.familiar)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </main>
        </>
      )}

      {vista !== 'portada' && <footer className="cp-footer">Precios incluyen IGV</footer>}
    </div>
  );
}
