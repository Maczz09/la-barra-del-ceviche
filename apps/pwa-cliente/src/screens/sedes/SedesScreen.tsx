// screens/sedes/SedesScreen.tsx — Gestión de sedes (T-23: multi-sede)
// Solo ADMIN. El admin general elige cuántas sedes crear; cada usuario no-admin
// queda fijado a una sede al crearse (ver UsuariosScreen). Desactivar una sede
// no la borra — bloquea su selección para nuevas asignaciones; eliminarla
// requiere que ya no tenga usuarios asignados (el backend lo valida con 409).

import { useState, type SubmitEvent } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import type { SedeDto } from '../../types/sede.types';

const INITIAL_FORM = { nombre: '', direccion: '', ruc: '' };

export function SedesScreen() {
  const online = useOnlineStatus();
  const {
    sedes,
    loading,
    saving,
    error,
    success,
    fetch,
    crearSede,
    actualizarSede,
    eliminarSede,
    clearFeedback,
  } = useSedesQuery();

  const [form, setForm] = useState(INITIAL_FORM);
  const [edit, setEdit] = useState<SedeDto | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editRuc, setEditRuc] = useState('');

  const activas = sedes.filter((s) => s.activa).length;

  const handleCrear = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!online) return;
    await crearSede({
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim() || undefined,
      ruc: form.ruc.trim() || undefined,
    });
    setForm(INITIAL_FORM);
  };

  const abrirEdicion = (sede: SedeDto) => {
    setEdit(sede);
    setEditNombre(sede.nombre);
    setEditDireccion(sede.direccion ?? '');
    setEditRuc(sede.ruc ?? '');
  };

  const guardarEdicion = async () => {
    if (!edit) return;
    await actualizarSede(edit.id, {
      nombre: editNombre.trim(),
      direccion: editDireccion.trim() || null,
      ruc: editRuc.trim() || null,
    });
    setEdit(null);
  };

  const toggleActiva = async (sede: SedeDto) => {
    if (!online) return;
    await actualizarSede(sede.id, { activa: !sede.activa });
  };

  const handleEliminar = async (sede: SedeDto) => {
    if (!online) return;
    if (!window.confirm(`¿Eliminar la sede "${sede.nombre}"? Solo es posible si ya no tiene usuarios asignados.`)) return;
    await eliminarSede(sede.id);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Sedes</h1>
          <div className="sub">Locales administrados en tiempo real desde una sola cuenta</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => void fetch()} title="Refrescar" aria-label="Refrescar sedes">
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

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Sede" tint="accent" label="Sedes" value={sedes.length} />
        <StatKpi icon="Check" tint="ok" label="Activas" value={activas} />
        <StatKpi icon="Alert" tint="muted" label="Inactivas" value={sedes.length - activas} />
      </div>

      <div className="module-grid">
        <section className="panel">
          <div className="panel-h">
            <h3>Sedes</h3>
            <span className="spacer" />
            <span className="badge badge-info">{sedes.length}</span>
          </div>

          {loading && sedes.length === 0 && (
            <div className="table-wrap table-wrap-flat">
              {[1, 2, 3].map((row) => (
                <div key={row} className="skeleton-row row" style={{ gap: 12 }}>
                  <div className="skel" style={{ width: '40%', height: 13 }} />
                </div>
              ))}
            </div>
          )}

          {!loading && sedes.length === 0 && (
            <div className="empty">
              <div className="e-ic"><Icons.Sede s={24} /></div>
              <h3>Sin sedes</h3>
              <p>Crea la primera con el formulario de la derecha.</p>
            </div>
          )}

          {!loading && sedes.length > 0 && (
            <div className="table-wrap table-wrap-flat">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th className="col-mobile-hidden">Dirección</th>
                    <th className="col-mobile-hidden">RUC</th>
                    <th>Estado</th>
                    <th className="cell-action">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sedes.map((sede) => (
                    <tr key={sede.id}>
                      <td><strong>{sede.nombre}</strong></td>
                      <td className="col-mobile-hidden muted">{sede.direccion || '—'}</td>
                      <td className="col-mobile-hidden muted">{sede.ruc || '—'}</td>
                      <td>
                        <button
                          className={`toggle ${sede.activa ? 'on' : ''}`}
                          disabled={saving || !online}
                          title={sede.activa ? 'Desactivar sede' : 'Reactivar sede'}
                          aria-label={`${sede.activa ? 'Desactivar' : 'Reactivar'} ${sede.nombre}`}
                          onClick={() => void toggleActiva(sede)}
                        >
                          <span className="knob" />
                        </button>
                      </td>
                      <td className="cell-action">
                        <div className="row wrap" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={!online}
                            onClick={() => abrirEdicion(sede)}
                            aria-label={`Editar ${sede.nombre}`}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={!online || saving}
                            onClick={() => void handleEliminar(sede)}
                            aria-label={`Eliminar ${sede.nombre}`}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="module-side">
          <section className="panel">
            <div className="panel-h">
              <Icons.Plus s={16} />
              <h3>Nueva sede</h3>
            </div>
            <form className="form-stack" onSubmit={(e) => void handleCrear(e)}>
              <div className="field">
                <label htmlFor="sede-nombre">Nombre</label>
                <div className="input">
                  <input
                    id="sede-nombre"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej. Sede San Isidro"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="sede-direccion">Dirección</label>
                <div className="input">
                  <input
                    id="sede-direccion"
                    value={form.direccion}
                    onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="sede-ruc">RUC</label>
                <div className="input">
                  <input
                    id="sede-ruc"
                    value={form.ruc}
                    onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))}
                    placeholder="Opcional · va impreso en la boleta"
                  />
                </div>
              </div>
              <button className="btn btn-primary btn-block" disabled={saving || !online} type="submit">
                {saving ? <span className="spinner" /> : <Icons.Plus s={16} />}
                Crear sede
              </button>
            </form>
          </section>
        </aside>
      </div>

      {edit && (
        <div className="drawer-wrap">
          <Scrim onClose={() => setEdit(null)} />
          <aside className="drawer">
            <div className="panel-h" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 18 }}>{edit.nombre}</h3>
              <span className="spacer" />
              <button className="icon-btn" onClick={() => setEdit(null)}><Icons.Close s={17} /></button>
            </div>
            <div className="drawer-body">
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="sede-edit-nombre">Nombre</label>
                <div className="input">
                  <input id="sede-edit-nombre" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="sede-edit-direccion">Dirección</label>
                <div className="input">
                  <input id="sede-edit-direccion" value={editDireccion} onChange={(e) => setEditDireccion(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="sede-edit-ruc">RUC</label>
                <div className="input">
                  <input id="sede-edit-ruc" value={editRuc} onChange={(e) => setEditRuc(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancelar</button>
              <span className="spacer" />
              <button className="btn btn-primary" disabled={editNombre.trim() === '' || saving} onClick={() => void guardarEdicion()}>
                <Icons.Check s={15} /> Guardar cambios
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
