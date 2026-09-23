import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { TODAS_LAS_RUTAS, type RutaApp } from '../auth/permisos';
import { guidesForRole, GUIDE_VERSION, type GuideStep } from './catalog';
import { launchModuleGuide, launchSteps, type GuideSession } from './spotlight';
import { useFocusTrap } from '../hooks/useFocusTrap';

function routeFromPath(pathname: string): RutaApp | null {
  const segment = pathname.split('/')[2];
  return TODAS_LAS_RUTAS.find((route) => route === segment) ?? null;
}

function completionKey(userId: string, route: string) {
  return `restoapp-guide:${GUIDE_VERSION}:${userId}:${route}`;
}

export function GuideCenter() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<RutaApp | null>(null);
  const [, setCompletedRevision] = useState(0);
  const activeTour = useRef<GuideSession | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, { active: open, onClose: () => setOpen(false) });
  const currentRoute = routeFromPath(location.pathname);
  const guides = useMemo(() => guidesForRole(user?.rol), [user?.rol]);
  const completedCount = guides.filter((guide) => user && localStorage.getItem(completionKey(user.id, guide.route))).length;

  const stopTour = useCallback(() => {
    activeTour.current?.destroy();
    activeTour.current = null;
  }, []);

  useEffect(() => () => stopTour(), [stopTour]);

  useEffect(() => {
    // A route change can unmount the highlighted element while a guide is open.
    stopTour();
  }, [location.pathname, stopTour]);

  const markComplete = useCallback((route: string) => {
    if (!user) return;
    localStorage.setItem(completionKey(user.id, route), new Date().toISOString());
    setCompletedRevision((count) => count + 1);
  }, [user]);

  const startRoute = useCallback((route: RutaApp) => {
    stopTour();
    setOpen(false);
    activeTour.current = launchModuleGuide(route, user?.rol, () => markComplete(route));
  }, [markComplete, stopTour, user?.rol]);

  useEffect(() => {
    if (!pending || pending !== currentRoute) return undefined;
    // React Router lazily renders the destination. Driver.js waits for its heading.
    const timer = window.setTimeout(() => {
      startRoute(pending);
      setPending(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [currentRoute, pending, startRoute]);

  const chooseGuide = (route: RutaApp) => {
    setOpen(false);
    if (route === currentRoute) {
      window.setTimeout(() => startRoute(route), 80);
    } else {
      stopTour();
      setPending(route);
      void navigate(`/app/${route}`);
    }
  };

  const startOverview = () => {
    stopTour();
    setOpen(false);
    const navTarget = window.matchMedia?.('(max-width: 920px)').matches ? '.bottom-nav' : '.sidebar';
    const overview: GuideStep[] = [
      { title: `Bienvenido, ${user?.nombre ?? 'equipo'}`, description: 'La Barra del Ceviche muestra los módulos permitidos para tu rol. Esta guía solo señala controles; no realiza cambios ni cobros.', target: '.topbar' },
      { title: 'Navegación', description: 'En la laptop usa el menú lateral. En celular o tablet usa la barra inferior y Más para abrir el resto de módulos.', target: navTarget },
      { title: 'Vista, avisos y sesión', description: 'En la barra superior puedes revisar la conexión, cambiar la apariencia, consultar notificaciones y cerrar sesión.', target: '.topbar' },
      { title: 'Ayuda cuando la necesites', description: 'Vuelve a este botón para iniciar la guía de cualquier pantalla disponible para tu rol.', target: '[data-guide="help"]' },
    ];
    window.setTimeout(() => {
      activeTour.current = launchSteps(overview, () => markComplete('general'));
    }, 80);
  };

  return (
    <>
      <button type="button" className="icon-btn" data-guide="help" aria-label="Abrir guías de uso" title="Guías de uso" onClick={() => setOpen(true)}>
        <span aria-hidden="true" style={{ fontSize: 19, fontWeight: 800 }}>?</span>
      </button>
      {open && (
        <>
          <button type="button" className="guide-center-backdrop" data-scrim aria-label="Cerrar guías" onClick={() => setOpen(false)} />
          <section className="guide-center" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Guías de uso">
            <div className="guide-center-head">
              <div><h2>Guías de uso</h2><p>{user?.rol} · {completedCount} de {guides.length} módulos recorridos</p></div>
              <span className="spacer" />
              <button type="button" className="icon-btn" aria-label="Cerrar guías" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="guide-center-list">
              <button type="button" className="guide-center-item" onClick={startOverview}><strong>Conocer la aplicación</strong><small>Guía inicial</small></button>
              {currentRoute && guides.some((guide) => guide.route === currentRoute) && (
                <button type="button" className="guide-center-item" onClick={() => chooseGuide(currentRoute)}><strong>Explicar esta pantalla</strong><small>Empezar aquí</small></button>
              )}
              {guides.map((guide) => (
                <button type="button" className="guide-center-item" key={guide.route} onClick={() => chooseGuide(guide.route)}>
                  <span>{guide.title}</span><small>{user && localStorage.getItem(completionKey(user.id, guide.route)) ? 'Vista ✓' : 'Ver guía'}</small>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
