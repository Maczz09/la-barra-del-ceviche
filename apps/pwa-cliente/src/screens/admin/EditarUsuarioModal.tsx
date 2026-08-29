/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/admin/EditarUsuarioModal.tsx — Editar teléfono y/o resetear contraseña (solo ADMIN).

import { Scrim } from '../../components/ui/Scrim';
import { useRef, useState } from 'react';
import { Icons } from '../../components/ui/icons';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { UsuarioVM } from '../../types/usuario.types';

interface Props {
  usuario: UsuarioVM;
  saving: boolean;
  onClose: () => void;
  onGuardarTelefono: (telefono: string) => void | Promise<void>;
  onCambiarPassword: (password: string) => void | Promise<void>;
}

export function EditarUsuarioModal({ usuario, saving, onClose, onGuardarTelefono, onCambiarPassword }: Readonly<Props>) {
  const [telefono, setTelefono] = useState(usuario.telefono ?? '');
  const [password, setPassword] = useState('');
  const modalRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(modalRef, { active: true, onClose });

  const telefonoCambiado = telefono.trim() !== (usuario.telefono ?? '');
  const passwordValida = password.length >= 8;

  const guardarTelefono = async () => {
    await onGuardarTelefono(telefono.trim());
  };

  const resetearPassword = async () => {
    if (!passwordValida) return;
    if (!window.confirm(`¿Restablecer la contraseña de ${usuario.nombre}? Se cerrarán todas sus sesiones activas.`)) {
      return;
    }
    await onCambiarPassword(password);
    setPassword('');
  };

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog
        open
        className="modal"
        ref={modalRef}
        aria-modal="true"
        aria-label={`Editar a ${usuario.nombre}`}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <span className="modal-icon" style={{ width: 34, height: 34, margin: 0, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
            <Icons.Edit s={17} />
          </span>
          <h3 style={{ fontSize: 18 }}>Editar usuario</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>

        <div className="modal-scroll" style={{ padding: 20, display: 'grid', gap: 20 }}>
          <div>
            <div className="cu-name" style={{ fontSize: 15 }}>{usuario.nombre}</div>
            <div className="cu-mail">{usuario.email}</div>
          </div>

          <div className="field">
            <label htmlFor="eu-telefono">Teléfono</label>
            <div className="input">
              <input
                id="eu-telefono"
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 987654321"
              />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="spacer" />
              <button
                className="btn btn-ghost btn-sm"
                disabled={saving || !telefonoCambiado}
                onClick={guardarTelefono}
              >
                {saving ? <span className="spinner" /> : <Icons.Check s={15} />}
                Guardar teléfono
              </button>
            </div>
          </div>

          <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <label htmlFor="eu-password">Restablecer contraseña</label>
            <div className="input">
              <input
                id="eu-password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nueva contraseña"
                aria-describedby="eu-password-hint"
              />
            </div>
            <span id="eu-password-hint" className="hint">Mínimo 8 caracteres. Se cerrarán sus sesiones activas.</span>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="spacer" />
              <button
                className="btn btn-ghost btn-sm"
                disabled={saving || !passwordValida}
                onClick={resetearPassword}
              >
                {saving ? <span className="spinner" /> : <Icons.Lock s={15} />}
                Restablecer contraseña
              </button>
            </div>
          </div>
        </div>

        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </dialog>
    </div>
  );
}
