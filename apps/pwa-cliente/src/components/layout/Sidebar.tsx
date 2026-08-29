/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
// components/layout/Sidebar.tsx — Navegación lateral
// v2: Añadidos aria-current="page" (faltaba en la versión original) y
//     title={it.label} en cada nav-item para que el modo icon-only
//     (sidebar 62px en 921–1099px) sea accesible via tooltip nativo
//     y tecnologías asistivas. Sin cambios en props ni arquitectura.

import { useLocation, useNavigate } from 'react-router-dom';
import { APP_CONFIG, APP_LOGO, PLATFORM_NAME } from '../../config';
import { useAuthStore } from '../../store/auth.store';
import { puedeAcceder } from '../../auth/permisos';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { Icons } from '../ui/icons';
import { NAV_GROUPS } from './navigation';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const rol = useAuthStore((s) => s.user?.rol);
  const { sede } = useSedeActualQuery();
  const ubicacion = sede ? (sede.direccion?.trim() || sede.nombre) : APP_CONFIG.ubicacionFallback;

  // Extraer la key activa del pathname: /app/mesas → mesas
  const activeKey = location.pathname.split('/')[2] ?? '';

  const go = (key: string) => navigate(`/app/${key}`);

  // Solo se muestran las entradas que el rol puede abrir; los grupos que
  // quedan vacíos se ocultan por completo.
  const navVisible = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => puedeAcceder(rol, it.key)) }))
    .filter((g) => g.items.length > 0);

  return (
    <nav className="sidebar" aria-label="Navegación principal">
      <div className={`brand${APP_LOGO ? ' brand-logo-only' : ''}`} aria-hidden="true">
        {APP_LOGO ? (
          <>
            <img className="brand-logo-big" src={APP_LOGO} alt={APP_CONFIG.nombreLocal} />
            <small>{ubicacion}</small>
            <span className="brand-by">by {PLATFORM_NAME}</span>
          </>
        ) : (
          <>
            <div className="brand-logo">{APP_CONFIG.nombreLocal.charAt(0)}</div>
            <div>
              <b>{APP_CONFIG.nombreLocal}</b>
              <small>{ubicacion}</small>
            </div>
          </>
        )}
      </div>

      <menu className="nav">
        {navVisible.map((g) => (
          <div key={g.group} aria-label={g.group}>
            <div className="nav-lbl" aria-hidden="true">{g.group}</div>
            {g.items.map((it) => {
              const Ic = Icons[it.icon];
              const on = activeKey === it.key;
              return (
                <button
                  key={it.key}
                  className={`nav-item ${on ? 'on' : ''}`}
                  onClick={() => go(it.key)}
                  // aria-current="page" → requerido por WCAG 2.1 SC 1.3.1
                  // Ausente en la versión original — añadido en v2.
                  aria-current={on ? 'page' : undefined}
                  // title → tooltip nativo para el modo icon-only (921–1099px)
                  // donde el span de texto está oculto por CSS.
                  title={it.label}
                  type="button"
                >
                  <Ic s={18} className="ic" aria-hidden="true" />
                  <span>{it.label}</span>
                  {/* Los contadores (.cnt) se ocultan en icon-only por CSS */}
                </button>
              );
            })}
          </div>
        ))}
      </menu>

      <div className="nav-foot" aria-hidden="true">
        <div className="hint" style={{ padding: '4px 8px', lineHeight: 1.5 }}>
          {APP_CONFIG.nombreLocal} · Operación
        </div>
      </div>
    </nav>
  );
}
