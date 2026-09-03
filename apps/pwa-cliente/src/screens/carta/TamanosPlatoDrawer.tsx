import { useRef, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { useTamanosPlatoQuery } from '../../hooks/queries/useTamanosPlatoQuery';
import type { TamanoPlatoDto } from '../../types/inventario.types';
import './tamanos-carta.css';

interface Props {
  query: ReturnType<typeof useTamanosPlatoQuery>;
  online: boolean;
  onClose: () => void;
}

export function TamanosPlatoDrawer({ query, online, onClose }: Readonly<Props>) {
  const { tamanos, loading, saving, error, crearTamano, actualizarTamano, eliminarTamano, clearFeedback } = query;
  const [editar, setEditar] = useState<TamanoPlatoDto | null>(null);
  const [nombre, setNombre] = useState('');
  const [orden, setOrden] = useState('');
  const [eliminar, setEliminar] = useState<TamanoPlatoDto | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  useFocusTrap(drawerRef, { active: true, onClose });

  const ocupada = saving || pending;
  const ordenNumero = orden.trim() ? Number(orden) : undefined;
  const valido = nombre.trim().length > 0 && nombre.trim().length <= 60
    && (ordenNumero === undefined || (Number.isSafeInteger(ordenNumero) && ordenNumero >= 0 && ordenNumero <= 10000));
  const ordenados = [...tamanos].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));

  const limpiarFormulario = () => { setEditar(null); setNombre(''); setOrden(''); };
  const ejecutar = async (operacion: () => Promise<unknown>, mensaje: string, despues?: () => void) => {
    if (!online || ocupada) return;
    setPending(true);
    setFeedback(null);
    clearFeedback();
    try {
      await operacion();
      setFeedback({ error: false, message: mensaje });
      despues?.();
    } catch (err) {
      setFeedback({ error: true, message: err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo nuevamente.' });
    } finally {
      setPending(false);
    }
  };

  const guardar = () => {
    if (!valido) return;
    const payload = { nombre: nombre.trim(), ...(ordenNumero !== undefined ? { orden: ordenNumero } : {}) };
    void ejecutar(
      () => editar ? actualizarTamano(editar.id, payload) : crearTamano(payload),
      editar ? 'Tamaño actualizado.' : 'Tamaño creado.',
      limpiarFormulario,
    );
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer carta-tamanos-drawer" role="dialog" aria-modal="true" aria-labelledby="tamanos-titulo" ref={drawerRef}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h2 id="tamanos-titulo" style={{ fontSize: 18 }}>Tamaños de platos</h2>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar tamaños"><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <p className="muted carta-tamanos-ayuda">Define Personal, Mediano, Familiar u otros tamaños. El orden más bajo aparece primero en la carta, la comanda y la carta digital.</p>
          <p className="muted carta-tamanos-ayuda">Desactivar evita nuevas asignaciones; los platos existentes conservan su tamaño. Solo se puede eliminar un tamaño que no esté en uso.</p>
          {!online && <p role="status">Sin conexión. La gestión de tamaños está deshabilitada.</p>}
          {(feedback || error) && <div className={`carta-tamanos-feedback ${feedback?.error || (!feedback && error) ? 'is-error' : ''}`} role={feedback?.error || (!feedback && error) ? 'alert' : 'status'}>{feedback?.message ?? error}</div>}
          {loading && tamanos.length === 0 && <p role="status">Cargando tamaños…</p>}
          {!loading && tamanos.length === 0 && !error && <p className="muted">Todavía no hay tamaños. Crea el primero.</p>}
          <ul className="carta-tamanos-lista" aria-label="Tamaños configurados">
            {ordenados.map((tamano) => (
              <li className="carta-tamano-item" key={tamano.id}>
                <div className="carta-tamano-datos"><strong>{tamano.nombre}</strong><span className="muted">Orden {tamano.orden} · {tamano.activo ? 'Activo' : 'Inactivo'}</span></div>
                <div className="carta-tamano-acciones">
                  <button className="btn btn-sm btn-ghost" disabled={ocupada || !online} aria-label={`Editar ${tamano.nombre}`} onClick={() => { setEditar(tamano); setNombre(tamano.nombre); setOrden(String(tamano.orden)); setEliminar(null); setFeedback(null); }}>Editar</button>
                  <button className="btn btn-sm btn-ghost" disabled={ocupada || !online} aria-label={`${tamano.activo ? 'Desactivar' : 'Activar'} ${tamano.nombre}`} onClick={() => { void ejecutar(() => actualizarTamano(tamano.id, { activo: !tamano.activo }), tamano.activo ? 'Tamaño desactivado. Sus platos se conservan.' : 'Tamaño activado.'); }}>{tamano.activo ? 'Desactivar' : 'Activar'}</button>
                  <button className="btn btn-sm btn-ghost" disabled={ocupada || !online} aria-label={`Eliminar ${tamano.nombre}`} onClick={() => { setEliminar(tamano); setFeedback(null); }}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>

          {eliminar && <div className="carta-tamanos-confirmar" role="alertdialog" aria-label={`Eliminar tamaño ${eliminar.nombre}`}>
            <p>¿Eliminar el tamaño <strong>{eliminar.nombre}</strong>? Si hay platos asignados, se rechazará la eliminación.</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" disabled={ocupada} onClick={() => setEliminar(null)}>Cancelar eliminación</button>
              <button className="btn btn-primary" disabled={ocupada || !online} onClick={() => { void ejecutar(() => eliminarTamano(eliminar.id), 'Tamaño eliminado.', () => { if (editar?.id === eliminar.id) limpiarFormulario(); setEliminar(null); }); }}>Confirmar eliminación</button>
            </div>
          </div>}

          <form className="carta-tamanos-form" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
            <h3>{editar ? `Editar tamaño: ${editar.nombre}` : 'Nuevo tamaño'}</h3>
            <div className="field"><label htmlFor="tamano-nombre">Nombre del tamaño</label><div className="input"><input id="tamano-nombre" maxLength={60} required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Familiar" disabled={ocupada || !online} /></div></div>
            <div className="field"><label htmlFor="tamano-orden">Orden de presentación</label><div className="input"><input id="tamano-orden" type="number" min={0} max={10000} step={1} value={orden} onChange={(e) => setOrden(e.target.value)} placeholder="Automático" disabled={ocupada || !online} /></div><span className="muted">Menor número = primero. Opcional al crear.</span></div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {editar && <button className="btn btn-ghost" type="button" disabled={ocupada} onClick={limpiarFormulario}>Cancelar edición</button>}
              <button className="btn btn-primary" type="submit" disabled={!valido || ocupada || !online}>{ocupada ? 'Guardando…' : editar ? 'Guardar tamaño' : 'Crear tamaño'}</button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
