// screens/admin/UsuariosScreen.tsx — Gestión de accesos y roles del equipo.
// Cableado real: useUsuariosQuery (lista paginada + alta + cambio de rol).
// Solo ADMIN gestiona; el resto ve la tabla en lectura.

import { useMemo, useState, type SubmitEvent } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useUsuariosQuery } from '../../hooks/queries/useUsuariosQuery';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { useAuthStore } from '../../store/auth.store';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { EditarUsuarioModal } from './EditarUsuarioModal';
import type { CrearUsuarioPayload, RolUsuario, UsuarioVM } from '../../types/usuario.types';

const ROLES: { value: RolUsuario; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'GERENCIA', label: 'Gerencia' },
  { value: 'CAJERO', label: 'Cajero' },
  { value: 'MESERO', label: 'Mesero' },
  { value: 'COCINA', label: 'Cocina' },
  { value: 'RECEPCION', label: 'Recepción' },
];

// rol → clase de color (definida en styles.css, compartida por badge y avatar)
const ROL_CLASS: Record<string, string> = {
  ADMIN: 'rol-admin',
  GERENCIA: 'rol-gerencia',
  CAJERO: 'rol-cajero',
  MESERO: 'rol-mesero',
  COCINA: 'rol-cocina',
  RECEPCION: 'rol-recepcion',
  SISTEMA: 'rol-sistema',
};

const INITIAL_FORM: CrearUsuarioPayload = {
  nombre: '',
  email: '',
  password: '',
  rol: 'MESERO',
  sedeId: '',
  telefono: '',
};

function iniciales(nombre: string): string {
  return nombre.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export function UsuariosScreen() {
  const online = useOnlineStatus();
  const puedeGestionar = useAuthStore((s) => s.user?.rol) === 'ADMIN';
  const usuarioActualId = useAuthStore((s) => s.user?.id);
  const [form, setForm] = useState<CrearUsuarioPayload>(INITIAL_FORM);
  const [search, setSearch] = useState('');
  const [rolFiltro, setRolFiltro] = useState<string>('');
  const [editando, setEditando] = useState<UsuarioVM | null>(null);

  const filters = useMemo(
    () => ({
      rol: rolFiltro ? (rolFiltro as RolUsuario) : undefined,
      search: search.trim() || undefined,
    }),
    [rolFiltro, search],
  );

  const {
    usuarios,
    nextCursor,
    loading,
    loadingMore,
    saving,
    error,
    success,
    fetch,
    fetchMore,
    crear,
    cambiarRol,
    cambiarEstado,
    actualizar,
    cambiarPassword,
    clearFeedback,
  } = useUsuariosQuery(filters);

  const usuarioEditando = editando
    ? usuarios.find((u) => u.id === editando.id) ?? editando
    : null;

  const { sedes } = useSedesQuery();
  const sedeNombrePorId = useMemo(() => new Map(sedes.map((s) => [s.id, s.nombre])), [sedes]);
  const sedeRequerida = form.rol !== 'ADMIN';

  const handleCambiarEstado = async (id: string, nombre: string, activo: boolean) => {
    if (!activo && !window.confirm(`¿Desactivar a ${nombre}? No podrá iniciar sesión hasta que lo reactives.`)) {
      return;
    }
    await cambiarEstado(id, activo);
  };

  // KPIs derivados de la página cargada
  const kpis = useMemo(() => {
    const activos = usuarios.filter((u) => u.activo).length;
    return {
      total: usuarios.length,
      activos,
      inactivos: usuarios.length - activos,
      roles: new Set(usuarios.map((u) => u.rol)).size,
    };
  }, [usuarios]);

  const handleCrear = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!online) return;
    if (sedeRequerida && !form.sedeId) return;
    await crear({
      ...form,
      nombre: form.nombre.trim(),
      email: form.email.trim(),
      sedeId: form.rol === 'ADMIN' ? undefined : form.sedeId,
      telefono: form.telefono?.trim() || undefined,
    });
    setForm(INITIAL_FORM);
  };

  const updateForm = (key: keyof CrearUsuarioPayload, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      ref={(el) => {
        const content = el?.closest('.content');
        if (content) {
          if (puedeGestionar) content.classList.add('has-form');
          else content.classList.remove('has-form');
        }
      }}
    >
      <div className="page-h">
        <div>
          <h1>Usuarios</h1>
          <div className="sub">Gestión de accesos y roles del equipo</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => void fetch()} title="Refrescar" aria-label="Refrescar usuarios">
          <Icons.Refresh s={16} />
        </button>
      </div>

      {!online && (
        <output className="banner warn module-feedback">
          <Icons.Alert s={17} />
          <span>Sin conexión. Las mutaciones están deshabilitadas.</span>
        </output>
      )}

      {(error || success) && (
        <div className={`banner ${error ? 'err' : 'ok'} module-feedback`} role="alert">
          {error ? <Icons.Alert s={17} /> : <Icons.Check s={16} />}
          <span>{error ?? success}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={clearFeedback}>Cerrar</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Usuarios" tint="accent" label="En esta vista" value={kpis.total} />
        <StatKpi icon="Check" tint="ok" label="Activos" value={kpis.activos} />
        <StatKpi icon="Lock" tint="muted" label="Inactivos" value={kpis.inactivos} />
        <StatKpi icon="Layers" tint="purple" label="Roles distintos" value={kpis.roles} />
      </div>

      {/* Toolbar de filtros */}
      <div className="module-toolbar">
        <div className="search-box">
          <Icons.Search s={16} />
          <input
            type="search"
            placeholder="Buscar por nombre o correo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar usuarios"
          />
        </div>
        <span className="spacer" />
        <fieldset className="filters" aria-label="Filtrar por rol">
          <button className={`chip ${rolFiltro === '' ? 'on' : ''}`} onClick={() => setRolFiltro('')}>Todos</button>
          {ROLES.map((role) => (
            <button
              key={role.value}
              className={`chip ${rolFiltro === role.value ? 'on' : ''}`}
              onClick={() => setRolFiltro(role.value)}
            >
              {role.label}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="module-grid">
        <section className="panel">
          <div className="panel-h">
            <h3>Equipo</h3>
            <span className="spacer" />
            <span className="badge badge-info">{usuarios.length} usuarios</span>
          </div>

          {loading && <LoadingRows />}
          {!loading && usuarios.length === 0 && (
            <div className="empty">
              <div className="e-ic"><Icons.Usuarios s={24} /></div>
              <h3>Sin usuarios</h3>
              <p>No hay usuarios que coincidan con la búsqueda o el filtro de rol seleccionado.</p>
              {(search || rolFiltro) && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setRolFiltro(''); }}>
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
          {!loading && usuarios.length > 0 && (
            <>
              <div className="table-wrap table-wrap-flat">
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th className="col-mobile-hidden">Sede</th>
                      <th>Estado</th>
                      <th className="col-mobile-hidden">Creado</th>
                      {puedeGestionar && <th className="cell-action">Cambiar rol</th>}
                      {puedeGestionar && <th className="cell-action">Acceso</th>}
                      {puedeGestionar && <th className="cell-action">Editar</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((usuario) => (
                      <tr key={usuario.id}>
                        <td>
                          <div className="cell-user">
                            <div className={`ava-sm ${ROL_CLASS[usuario.rol] ?? 'rol-sistema'}`} aria-hidden="true">
                              {iniciales(usuario.nombre)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div className="cu-name">{usuario.nombre}</div>
                              <div className="cu-mail">{usuario.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge-rol ${ROL_CLASS[usuario.rol] ?? 'rol-sistema'}`}>{usuario.rolLabel}</span>
                        </td>
                        <td className="col-mobile-hidden muted">
                          {usuario.sedeId ? (sedeNombrePorId.get(usuario.sedeId) ?? '—') : 'Todas (admin)'}
                        </td>
                        <td><span className={`badge dot ${usuario.estadoClass}`}>{usuario.estadoLabel}</span></td>
                        <td className="muted col-mobile-hidden">{usuario.createdAtLabel}</td>
                        {puedeGestionar && (
                          <td className="cell-action">
                            <div className="input">
                              <select
                                value={usuario.rol}
                                disabled={saving || !online}
                                aria-label={`Cambiar rol de ${usuario.nombre}`}
                                onChange={(event) => void cambiarRol(usuario.id, event.target.value as RolUsuario)}
                              >
                                {ROLES.map((role) => (
                                  <option key={role.value} value={role.value}>{role.label}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                        )}
                        {puedeGestionar && (
                          <td className="cell-action">
                            <button
                              className={`toggle ${usuario.activo ? 'on' : ''}`}
                              disabled={saving || !online || usuario.id === usuarioActualId}
                              title={
                                usuario.id === usuarioActualId
                                  ? 'No puedes desactivar tu propia cuenta'
                                  : usuario.activo ? 'Desactivar acceso' : 'Reactivar acceso'
                              }
                              aria-label={`${usuario.activo ? 'Desactivar' : 'Reactivar'} a ${usuario.nombre}`}
                              onClick={() => void handleCambiarEstado(usuario.id, usuario.nombre, !usuario.activo)}
                            >
                              <span className="knob" />
                            </button>
                          </td>
                        )}
                        {puedeGestionar && (
                          <td className="cell-action">
                            <button
                              className="icon-btn"
                              disabled={saving || !online}
                              title={`Editar a ${usuario.nombre}`}
                              aria-label={`Editar a ${usuario.nombre}`}
                              onClick={() => setEditando(usuario)}
                            >
                              <Icons.Edit s={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {nextCursor && (
                <div className="row center" style={{ padding: '12px' }}>
                  <button className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={() => void fetchMore()}>
                    {loadingMore ? <span className="spinner" /> : null}
                    Cargar más
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {puedeGestionar && (
          <aside className="module-side">
            <section className="panel">
              <div className="panel-h">
                <Icons.Plus s={16} />
                <h3>Nuevo usuario</h3>
              </div>
              <form className="form-stack" onSubmit={(e) => void handleCrear(e)}>
                <div className="field">
                  <label htmlFor="nu-nombre">Nombre</label>
                  <div className="input">
                    <input id="nu-nombre" required value={form.nombre} onChange={(event) => updateForm('nombre', event.target.value)} placeholder="Nombre y apellido" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="nu-email">Email</label>
                  <div className="input">
                    <input id="nu-email" required type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="persona@la-barra-del-ceviche.pe" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="nu-telefono">Teléfono</label>
                  <div className="input">
                    <input id="nu-telefono" type="tel" value={form.telefono ?? ''} onChange={(event) => updateForm('telefono', event.target.value)} placeholder="Opcional · Ej. 987654321" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="nu-pass">Contraseña</label>
                  <div className="input">
                    <input id="nu-pass" required minLength={8} type="password" value={form.password} onChange={(event) => updateForm('password', event.target.value)} aria-describedby="nu-pass-hint" />
                  </div>
                  <span id="nu-pass-hint" className="hint">Mínimo 8 caracteres.</span>
                </div>
                <div className="field">
                  <label htmlFor="nu-rol">Rol</label>
                  <div className="input">
                    <select id="nu-rol" value={form.rol} onChange={(event) => updateForm('rol', event.target.value)}>
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {sedeRequerida && (
                  <div className="field">
                    <label htmlFor="nu-sede">Sede</label>
                    <div className="input">
                      <select id="nu-sede" required value={form.sedeId} onChange={(event) => updateForm('sedeId', event.target.value)}>
                        <option value="">Elige una sede…</option>
                        {sedes.filter((s) => s.activa).map((sede) => (
                          <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <span className="hint">Este rol queda fijo a la sede elegida.</span>
                  </div>
                )}
                <button className="btn btn-primary btn-block" disabled={saving || !online || (sedeRequerida && !form.sedeId)} type="submit">
                  {saving ? <span className="spinner" /> : <Icons.Plus s={16} />}
                  Crear usuario
                </button>
              </form>
            </section>
          </aside>
        )}
      </div>

      {usuarioEditando && (
        <EditarUsuarioModal
          usuario={usuarioEditando}
          saving={saving}
          onClose={() => setEditando(null)}
          onGuardarTelefono={async (telefono) => {
            await actualizar(usuarioEditando.id, { telefono: telefono || null });
          }}
          onCambiarPassword={async (password) => {
            await cambiarPassword(usuarioEditando.id, password);
          }}
        />
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="table-wrap table-wrap-flat">
      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="skeleton-row row" style={{ gap: 12 }}>
          <div className="skel" style={{ width: 34, height: 34, borderRadius: '50%', flex: 'none' }} />
          <div className="col" style={{ gap: 6, flex: 1 }}>
            <div className="skel" style={{ width: '40%', height: 13 }} />
            <div className="skel" style={{ width: '60%', height: 11 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
