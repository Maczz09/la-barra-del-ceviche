// components/ui/ToastProvider.tsx — toasts globales con accesibilidad completa
// - role="status" en host (polite) para toasts informativos
// - role="alert" individual en toasts kind=err/warn (interrumpe flujo de voz)

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icons, type IconName } from './icons';

export type ToastKind = 'ok' | 'err' | 'info' | 'warn';

export interface ToastOptions {
  title: string;
  msg?: string;
  icon?: IconName;
  kind?: ToastKind;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let toastSequence = 0;

function nextToastId(): string {
  toastSequence += 1;
  return `toast-${Date.now()}-${toastSequence}`;
}

const sinToast = (prev: ToastItem[], id: string) => prev.filter((t) => t.id !== id);

const KIND_COLOR: Record<ToastKind, string> = {
  ok: 'var(--ok)',
  err: 'var(--danger)',
  info: 'var(--info)',
  warn: 'var(--warn)',
};

/* Mapa de iconos por defecto cuando no se provee icon */
const KIND_DEFAULT_ICON: Record<ToastKind, IconName> = {
  ok: 'Check',
  err: 'Alert',
  info: 'Bell',
  warn: 'Alert',
};

function ToastItem({ t }: Readonly<{ t: ToastItem }>) {
  const kind = t.kind ?? 'ok';
  const Ic = Icons[t.icon ?? KIND_DEFAULT_ICON[kind]];
  /* role="alert" en err/warn: el lector de pantalla interrumpe para anunciar.
     role="status" en ok/info: anuncio no intrusivo (aria-live polite). */
  const role = kind === 'err' || kind === 'warn' ? 'alert' : 'status';
  return (
    <div className={`toast ${kind}`} role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'}>
      <span className="t-ic" style={{ color: KIND_COLOR[kind] }}>
        <Ic s={18} />
      </span>
      <div>
        <b>{t.title}</b>
        {t.msg && <p>{t.msg}</p>}
      </div>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((opts: ToastOptions) => {
    // randomUUID no está disponible en varios navegadores cuando la PWA se
    // abre por HTTP usando la IP LAN. Un identificador local incremental es
    // suficiente para las claves efímeras de los avisos.
    const id = nextToastId();
    setToasts((prev) => [...prev, { ...opts, id }]);
    setTimeout(() => {
      setToasts((prev) => sinToast(prev, id));
    }, 3600);
  }, []);

  const ctxValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={ctxValue}>
      {children}
      {/* aria-live="polite": el host anuncia toasts sin interrumpir.
          Los toasts err/warn tienen su propio role="alert" que sí interrumpe. */}
      <div className="toast-host" aria-label="Notificaciones" aria-relevant="additions">
        {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
      </div>
    </ToastContext.Provider>
  );
}
