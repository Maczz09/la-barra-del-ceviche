/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/login/LoginScreen.tsx — Login real con auth store

import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { ApiError } from '../../api/client';
import { APP_NAME, APP_LOGO, PLATFORM_CREDIT } from '../../config';

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  // `field: true` marca los inputs en rojo. Solo aplica a credenciales (401);
  // un 429 o un fallo de red no significan que el correo/contraseña estén mal.
  const [error, setError] = useState<{ kind: string; text: string; field?: boolean } | null>(null);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password });
      navigate('/app', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError({ kind: 'err', text: 'Credenciales inválidas. Verifica tu correo y contraseña.', field: true });
        } else if (err.status === 429) {
          setError({ kind: 'warn', text: 'Demasiadas solicitudes. Intenta en unos segundos.' });
        } else {
          setError({ kind: 'err', text: err.message || 'Error del servidor. Reintenta en un momento.' });
        }
      } else {
        setError({ kind: 'err', text: 'No se pudo conectar al servidor. Verifica tu conexión.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap" data-screen-label="Login">
      {/* Panel izquierdo: branding premium con gradiente y grid */}
      <div className={`login-art${APP_LOGO ? ' login-art-big-logo' : ''}`}>
        {!APP_LOGO && (
          <div className="row" style={{ gap: 12 }}>
            <div className="brand-logo" style={{ width: 42, height: 42, fontSize: 21 }}>{APP_NAME.charAt(0)}</div>
            <div>
              <b style={{ fontSize: 19, fontWeight: 800 }}>{APP_NAME}</b>
              <div style={{ opacity: 0.65, fontSize: 12, fontWeight: 600 }}>Sistema operativo de restobar</div>
            </div>
          </div>
        )}
        <div>
          {APP_LOGO && <img className="login-logo-big" src={APP_LOGO} alt={APP_NAME} />}
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.1, maxWidth: 380, margin: 0 }}>
            La consola de operación de tu salón, cocina y caja.
          </h2>
          <p style={{ opacity: 0.7, fontSize: 15, fontWeight: 500, maxWidth: 360, marginTop: 16, lineHeight: 1.45 }}>
            Mesas, pedidos, KDS, cuentas y cobros en una sola herramienta rápida, táctil y de alto rendimiento.
          </p>
        </div>
        <div className="row" style={{ gap: 18, opacity: 0.7, fontSize: 12.5, fontWeight: 600 }}>
          <span className="row" style={{ gap: 6 }}>
            <WifiIcon /> Funciona offline
          </span>
          <span className="row" style={{ gap: 6 }}>
            <LockIcon /> Seguro por rol
          </span>
        </div>
        <div className="login-watermark">{PLATFORM_CREDIT}</div>
      </div>

      {/* Panel derecho: formulario con efecto de tarjeta flotante y orbes de fondo */}
      <div className="login-form-side">
        <div className="login-glow-orb login-glow-orb-1" />
        <div className="login-glow-orb login-glow-orb-2" />

        <form className="login-card" onSubmit={submit}>
          {/* Cabecera de marca para dispositivos móviles (se oculta en pantallas grandes) */}
          <div className="login-mobile-brand">
            <div className={`brand-logo${APP_LOGO ? ' has-img' : ''}`} style={{ width: 38, height: 38, fontSize: 19 }}>
              {APP_LOGO ? <img src={APP_LOGO} alt="" /> : APP_NAME.charAt(0)}
            </div>
            <div>
              <b style={{ fontSize: 17, fontWeight: 800 }}>{APP_NAME}</b>
              <div style={{ opacity: 0.6, fontSize: 11, fontWeight: 600 }}>Sistema de restobar</div>
            </div>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-.02em', color: 'var(--text)' }}>
            Iniciar sesión
          </h1>
          <p className="muted" style={{ margin: '0 0 24px', fontWeight: 600, color: 'var(--text-2)', fontSize: 14 }}>
            Ingresa para entrar a Operación.
          </p>

          {error && (
            <div id="login-error" className={`banner ${error.kind}`} style={{ marginBottom: 18 }} role="alert">
              <AlertIcon />
              <span>{error.text}</span>
            </div>
          )}

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="login-email" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 2 }}>Correo electrónico</label>
            <div className={`input ${error?.field ? 'invalid' : ''}`} style={{ padding: '10px 14px' }}>
              <MailIcon />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@la-barra-del-ceviche.pe"
                required
                autoComplete="email"
                autoFocus
                aria-invalid={!!error?.field}
                aria-describedby={error ? 'login-error' : undefined}
                style={{ fontSize: 14.5 }}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="login-password" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 2 }}>Contraseña</label>
            <div className={`input ${error?.field ? 'invalid' : ''}`} style={{ padding: '10px 14px' }}>
              <LockIcon />
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                aria-invalid={!!error?.field}
                aria-describedby={error ? 'login-error' : undefined}
                style={{ fontSize: 14.5 }}
              />
              <button
                type="button"
                className="icon-btn"
                style={{ width: 28, height: 28, border: 0, background: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--text-2)' }}
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPass ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 24 }} />

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={loading}
            style={{ minHeight: 48, borderRadius: 'var(--r-lg)', fontSize: 15 }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />{' '}
                Ingresando…
              </>
            ) : (
              <>
                Ingresar
                <ArrowRightIcon />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Inline SVG icons (sin dependencias externas) ───────────────
function MailIcon() {
  return (
    <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg className="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h.01" /><path d="M2 8.82a15 15 0 0 1 20 0" /><path d="M5 12.859a10 10 0 0 1 14 0" /><path d="M8.5 16.429a5 5 0 0 1 7 0" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}
