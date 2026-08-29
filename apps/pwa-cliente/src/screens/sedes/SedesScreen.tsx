// screens/sedes/SedesScreen.tsx — Gestión de sedes (T-23: multi-sede)
// Solo ADMIN. El admin general elige cuántas sedes crear; cada usuario no-admin
// queda fijado a una sede al crearse (ver UsuariosScreen). Desactivar una sede
// no la borra — bloquea su selección para nuevas asignaciones; eliminarla
// requiere que ya no tenga usuarios asignados (el backend lo valida con 409).

import { useState, type SubmitEvent } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { useToast } from '../../components/ui/ToastProvider';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { useFacturacionQuery } from '../../hooks/queries/useFacturacionQuery';
import type { SedeDto } from '../../types/sede.types';

const INITIAL_FORM = { nombre: '', direccion: '', ruc: '', telefono: '' };
const INITIAL_SUNAT = { solUsuario: '', solClave: '', certificadoPass: '' };

export function SedesScreen() {
  const online = useOnlineStatus();
  const { toast } = useToast();
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
  const { crearEmpresa, configurandoEmpresa } = useFacturacionQuery();

  const [form, setForm] = useState(INITIAL_FORM);
  const [configurarSunat, setConfigurarSunat] = useState(false);
  const [sunat, setSunat] = useState(INITIAL_SUNAT);
  const [certificado, setCertificado] = useState<File | null>(null);
  const [edit, setEdit] = useState<SedeDto | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editRuc, setEditRuc] = useState('');
  const [editTelefono, setEditTelefono] = useState('');

  const activas = sedes.filter((s) => s.activa).length;

  const sunatCompleto = form.ruc.trim().length === 11 &&
    sunat.solUsuario.trim().length > 0 && sunat.solClave.length > 0 &&
    sunat.certificadoPass.length > 0 && certificado != null;

  const handleCrear = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!online) return;
    const rucSede = form.ruc.trim();
    await crearSede({
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim() || undefined,
      ruc: rucSede || undefined,
      telefono: form.telefono.trim() || undefined,
    });

    // La sede ya se creó; configurar SUNAT es aparte (otro servicio) y no
    // debe deshacer la sede si falla — solo se avisa para reintentar desde
    // Facturación → "Agregar otra empresa" con los mismos datos.
    if (configurarSunat && sunatCompleto && certificado) {
      try {
        const empresa = await crearEmpresa({
          ruc: rucSede,
          razonSocial: form.nombre.trim(),
          direccion: form.direccion.trim() || undefined,
          solUsuario: sunat.solUsuario.trim(),
          solClave: sunat.solClave,
          certificadoPass: sunat.certificadoPass,
          certificado,
        });
        toast({ title: 'SUNAT configurado', msg: `${empresa.razonSocial} ya puede emitir comprobantes electrónicos.`, icon: 'Check', kind: 'ok' });
      } catch (err) {
        toast({
          title: 'La sede se creó, pero SUNAT no se pudo configurar',
          msg: err instanceof Error ? err.message : 'Reintenta desde Facturación → Configurar SUNAT.',
          icon: 'Alert',
          kind: 'err',
        });
      }
    }

    setForm(INITIAL_FORM);
    setConfigurarSunat(false);
    setSunat(INITIAL_SUNAT);
    setCertificado(null);
  };

  const abrirEdicion = (sede: SedeDto) => {
    setEdit(sede);
    setEditNombre(sede.nombre);
    setEditDireccion(sede.direccion ?? '');
    setEditRuc(sede.ruc ?? '');
    setEditTelefono(sede.telefono ?? '');
  };

  const guardarEdicion = async () => {
    if (!edit) return;
    await actualizarSede(edit.id, {
      nombre: editNombre.trim(),
      direccion: editDireccion.trim() || null,
      ruc: editRuc.trim() || null,
      telefono: editTelefono.trim() || null,
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
                    <th className="col-mobile-hidden">Teléfono</th>
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
                      <td className="col-mobile-hidden muted">{sede.telefono || '—'}</td>
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
              <div className="field">
                <label htmlFor="sede-telefono">Teléfono</label>
                <div className="input">
                  <input
                    id="sede-telefono"
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                    placeholder="Opcional · se muestra en la carta pública"
                  />
                </div>
              </div>

              <label className="row" style={{ gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={configurarSunat} onChange={(e) => setConfigurarSunat(e.target.checked)} />
                <span style={{ fontSize: 13 }}>También configurar facturación electrónica SUNAT (opcional)</span>
              </label>

              {configurarSunat && (
                <div className="panel" style={{ padding: 14, marginBottom: 14, background: 'var(--surface-2)' }}>
                  <div className="hint" style={{ marginBottom: 10 }}>
                    Usa el mismo nombre y RUC de arriba como razón social de la empresa emisora. Necesita el RUC (11 dígitos) completo.
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="sede-sol-user">Usuario SOL</label>
                    <div className="input">
                      <input id="sede-sol-user" value={sunat.solUsuario} onChange={(e) => setSunat((s) => ({ ...s, solUsuario: e.target.value }))} autoComplete="off" />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="sede-sol-clave">Clave SOL</label>
                    <div className="input">
                      <input id="sede-sol-clave" type="password" value={sunat.solClave} onChange={(e) => setSunat((s) => ({ ...s, solClave: e.target.value }))} autoComplete="new-password" />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="sede-cert-pass">Contraseña del certificado</label>
                    <div className="input">
                      <input id="sede-cert-pass" type="password" value={sunat.certificadoPass} onChange={(e) => setSunat((s) => ({ ...s, certificadoPass: e.target.value }))} autoComplete="new-password" />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="sede-cert-file">Certificado (.p12 / .pfx)</label>
                    <div className="input">
                      <input id="sede-cert-file" type="file" accept=".p12,.pfx" onChange={(e) => setCertificado(e.target.files?.[0] ?? null)} />
                    </div>
                  </div>
                  {configurarSunat && form.ruc.trim().length !== 11 && (
                    <div className="hint" style={{ color: 'var(--warn-text)', marginTop: 8 }}>El RUC de arriba debe tener 11 dígitos para poder configurar SUNAT.</div>
                  )}
                </div>
              )}

              <button className="btn btn-primary btn-block" disabled={saving || configurandoEmpresa || !online} type="submit">
                {saving || configurandoEmpresa ? <span className="spinner" /> : <Icons.Plus s={16} />}
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
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="sede-edit-telefono">Teléfono</label>
                <div className="input">
                  <input id="sede-edit-telefono" value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} placeholder="Opcional · se muestra en la carta pública" />
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
