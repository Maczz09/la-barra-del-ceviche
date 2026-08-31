import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { localRuntimeApi } from '../../api/local-runtime.api';

export function ConfiguracionInicialScreen() {
  const navigate = useNavigate();
  const [complete, setComplete] = useState<boolean | null>(null);
  const [form, setForm] = useState({ nombre: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void localRuntimeApi.onboarding().then((value) => setComplete(value.complete)).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))); }, []);
  if (complete) return <Navigate to="/login" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await localRuntimeApi.createAdmin(form); void navigate('/login', { replace: true }); }
    catch (cause) {
      try {
        const status = await localRuntimeApi.onboarding();
        if (status.complete) {
          setComplete(true);
          return;
        }
      } catch {
        // Conserva el error original del POST, que describe mejor la operación fallida.
      }
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    finally { setBusy(false); }
  };

  return <main className="setup-page">
    <section className="setup-card">
      <img src="/brand/logo-principal.png" alt="La Barra del Ceviche" />
      <span className="badge badge-info">Primera configuración</span>
      <h1>Prepara el acceso administrador</h1>
      <p>Este paso solo se puede completar desde la laptop servidor.</p>
      {error && <div className="banner err">{error}</div>}
      <form onSubmit={(event) => void submit(event)}>
        <label>Nombre completo<input required minLength={2} value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} /></label>
        <label>Correo<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Contraseña<input required type="password" minLength={10} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <button className="btn btn-primary btn-block" disabled={busy || complete === null}>{busy ? 'Creando…' : 'Crear administrador'}</button>
      </form>
      <small>Basado en RestoApp del Ingeniero en Sistemas e Informática Max Alessandro García López.</small>
    </section>
  </main>;
}
