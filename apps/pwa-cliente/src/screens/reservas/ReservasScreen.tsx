/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/reservas/ReservasScreen.tsx - Agenda del día y acciones de reservas

import { useMemo, useState, useEffect, type SubmitEvent } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useReservasQuery } from '../../hooks/queries/useReservasQuery';
import { useMesasQuery } from '../../hooks/queries/useMesasQuery';
import { useToast } from '../../components/ui/ToastProvider';
import type { CrearReservaPayload } from '../../types/reserva.types';

const INITIAL_FORM: CrearReservaPayload = {
  clienteNombre: '',
  clienteTelefono: '',
  fecha: new Date().toISOString().slice(0, 10),
  hora: '20:00',
  mesaPreferida: '',
  numComensales: 2,
};

export function ReservasScreen() {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const [fecha, setFecha] = useState(INITIAL_FORM.fecha);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CrearReservaPayload>(INITIAL_FORM);

  useEffect(() => {
    const el = document.querySelector('.content');
    if (el) el.classList.add('has-form');
    return () => {
      if (el) el.classList.remove('has-form');
    };
  }, []);
  const { mesas, loading: loadingMesas } = useMesasQuery();
  const {
    reservas,
    nextCursor,
    loading,
    loadingMore,
    saving,
    error,
    success,
    disponibilidad,
    fetch,
    fetchMore,
    crear,
    confirmar,
    cancelar,
    consultarDisponibilidad,
    clearFeedback,
  // Buscar por código implica mirar cualquier fecha, no solo el día
  // seleccionado en la agenda — si hay búsqueda activa, no se combina con
  // el filtro de fecha (si no, casi nunca encontraría nada).
  } = useReservasQuery({ fecha: search ? undefined : fecha, search });
  const mesasFisicas = useMemo(
    () => mesas.filter((mesa) => mesa.numeroRaw < 90),
    [mesas],
  );
  const mesaLabelById = useMemo(
    () => new Map(mesasFisicas.map((mesa) => [mesa.id, `Mesa ${mesa.numero}`])),
    [mesasFisicas],
  );

  const handleChange = (key: keyof CrearReservaPayload, value: string | number) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCrear = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!online) return;
    try {
      await crear({
        ...form,
        clienteNombre: form.clienteNombre.trim(),
        clienteTelefono: form.clienteTelefono?.trim(),
        mesaPreferida: form.mesaPreferida.trim(),
        numComensales: Number(form.numComensales) || 1,
      });
    } catch (err) {
      toast({ title: 'No se pudo crear la reserva', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Reservas</h1>
          <div className="sub">Agenda del día, confirmación y cancelación</div>
        </div>
        <span className="spacer" />
        <div className="input date-filter">
          <input value={fecha} onChange={(event) => setFecha(event.target.value)} type="date" />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => fetch()} title="Refrescar">
          <RefreshIcon />
        </button>
      </div>

      {(error || success) && (
        <div className={`banner ${error ? 'err' : 'ok'} module-feedback`}>
          {error ? <AlertIcon /> : <CheckIcon />}
          <span>{error ?? success}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={clearFeedback}>Cerrar</button>
        </div>
      )}

      <div className="module-grid">
        <section className="panel">
          <div className="panel-h">
            <h3>Agenda</h3>
            <span className="spacer" />
            <div className="search-box" style={{ maxWidth: 200 }}>
              <SearchIcon />
              <input
                type="search"
                placeholder="Buscar por código (R0000001)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar reservas por código"
              />
            </div>
            <span className="badge badge-info">{reservas.length} reservas</span>
          </div>
          {loading && <LoadingRows />}
          {!loading && reservas.length === 0 && (
            <div className="empty">
              <div className="e-ic"><CalendarIcon /></div>
              <h3>Sin reservas para este día</h3>
              <p>Las reservas reales aparecerán aquí cuando el backend las devuelva.</p>
            </div>
          )}
          {!loading && reservas.length > 0 && (
            <div className="table-wrap table-wrap-flat">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>Cliente</th>
                    <th className="col-mobile-hidden">Mesa</th>
                    <th className="col-mobile-hidden">Personas</th>
                    <th className="col-mobile-hidden">Registrado por</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reservas.map((reserva) => (
                    <tr key={reserva.id}>
                      <td>
                        <strong>{reserva.fechaHoraLabel}</strong>
                        {reserva.correlativo && <div className="muted mono" style={{ fontSize: 11 }}>{reserva.correlativo}</div>}
                      </td>
                      <td>
                        <strong>{reserva.clienteNombre}</strong>
                        {reserva.clienteTelefono && <div className="muted">{reserva.clienteTelefono}</div>}
                      </td>
                      <td className="col-mobile-hidden">{reserva.mesaPreferida ? mesaLabelById.get(reserva.mesaPreferida) ?? reserva.mesaPreferida : 'Sin mesa'}</td>
                      <td className="col-mobile-hidden">{reserva.numComensales}</td>
                      <td className="col-mobile-hidden muted">{reserva.usuarioNombre ?? '—'}</td>
                      <td><span className={`badge dot ${reserva.estadoClass}`}>{reserva.estadoLabel}</span></td>
                      <td>
                        <div className="row wrap">
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={saving || reserva.estado !== 'PENDIENTE' || !online}
                            onClick={() => confirmar(reserva.id)}
                          >
                            Confirmar
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={saving || reserva.estado === 'CANCELADA' || !online}
                            onClick={() => cancelar(reserva.id, 'Cancelado desde PWA')}
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {nextCursor && (
                <div className="row center" style={{ padding: '12px' }}>
                  <button className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={fetchMore}>
                    {loadingMore ? <span className="spinner" /> : null}
                    Cargar más
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="module-side">
          <section className="panel">
            <div className="panel-h"><h3>Nueva reserva</h3></div>
            <form className="form-stack" onSubmit={handleCrear}>
              <div className="field">
                <label htmlFor="reserva-cliente">Cliente</label>
                <div className="input">
                  <input
                    id="reserva-cliente"
                    required
                    value={form.clienteNombre}
                    onChange={(event) => handleChange('clienteNombre', event.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="reserva-telefono">Teléfono</label>
                <div className="input">
                  <input
                    id="reserva-telefono"
                    value={form.clienteTelefono}
                    onChange={(event) => handleChange('clienteTelefono', event.target.value)}
                  />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="field">
                  <label htmlFor="reserva-fecha">Fecha</label>
                  <div className="input">
                    <input
                      id="reserva-fecha"
                      required
                      type="date"
                      value={form.fecha}
                      onChange={(event) => handleChange('fecha', event.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="reserva-hora">Hora</label>
                  <div className="input">
                    <input
                      id="reserva-hora"
                      required
                      type="time"
                      value={form.hora}
                      onChange={(event) => handleChange('hora', event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="form-grid-2">
                <div className="field">
                  <label htmlFor="reserva-mesa">Mesa</label>
                  <div className="input">
                    <select
                      id="reserva-mesa"
                      required
                      value={form.mesaPreferida}
                      onChange={(event) => handleChange('mesaPreferida', event.target.value)}
                    >
                      <option value="">{loadingMesas ? 'Cargando mesas...' : 'Selecciona una mesa'}</option>
                      {mesasFisicas.map((mesa) => (
                        <option key={mesa.id} value={mesa.id}>
                          Mesa {mesa.numero} · {mesa.capacidad} pers.
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="reserva-personas">Personas</label>
                  <div className="input">
                    <input
                      id="reserva-personas"
                      min="1"
                      type="number"
                      value={form.numComensales}
                      onChange={(event) => handleChange('numComensales', Number(event.target.value))}
                    />
                  </div>
                </div>
              </div>
              {disponibilidad && (
                <div className={`banner ${disponibilidad.disponible ? 'ok' : 'warn'}`}>
                  {disponibilidad.disponible ? 'Mesa disponible en ese horario' : 'Mesa ya reservada en ese horario'}
                </div>
              )}
              <div className="row wrap">
                <button
                  className="btn btn-ghost"
                  disabled={!form.fecha || !form.hora || !form.mesaPreferida}
                  type="button"
                  onClick={() => consultarDisponibilidad(form.fecha, form.hora, form.mesaPreferida)}
                >
                  Ver disponibilidad
                </button>
                <button className="btn btn-primary" disabled={saving || !online} type="submit">
                  {saving ? <span className="spinner" /> : <CalendarIcon />}
                  Crear reserva
                </button>
              </div>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="table-wrap table-wrap-flat">
      {[1, 2, 3, 4].map((row) => (
        <div key={row} className="skeleton-row">
          <div className="skel" />
        </div>
      ))}
    </div>
  );
}

function AlertIcon() {
  return <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
}

function CalendarIcon() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>;
}

function CheckIcon() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>;
}

function SearchIcon() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
}

function RefreshIcon() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>;
}
