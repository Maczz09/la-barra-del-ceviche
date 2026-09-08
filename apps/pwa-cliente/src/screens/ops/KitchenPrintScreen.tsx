import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icons } from '../../components/ui/icons';
import {
  kitchenPrintApi,
  type KitchenPrintStatus,
  type PrinterSettings,
} from '../../api/local-runtime.api';

/**
 * Panel seguro para la tablet de Cocina. La impresora siempre sigue conectada
 * a la laptop servidor: la tablet administra su cola, no intenta imprimir por
 * Bluetooth/USB desde el navegador móvil.
 */
export function KitchenPrintScreen() {
  const [status, setStatus] = useState<KitchenPrintStatus | null>(null);
  const [printer, setPrinter] = useState<PrinterSettings | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await kitchenPrintApi.status();
      setStatus(next);
      setPrinter((current) => current ?? next.printer.config);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const guardar = (event: FormEvent) => {
    event.preventDefault();
    if (!printer) return;
    setBusy('save'); setError(''); setMessage('');
    void kitchenPrintApi.savePrinter(printer)
      .then(() => { setMessage('Impresión automática de cocina actualizada.'); return refresh(); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(''));
  };

  const reintentar = (id: string) => {
    setBusy(id); setError(''); setMessage('');
    void kitchenPrintApi.retry(id)
      .then(() => { setMessage('Ticket reenviado a la impresora de cocina.'); return refresh(); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(''));
  };

  return (
    <div className="server-page">
      <div className="page-h">
        <div><h1>Impresión de cocina</h1><div className="sub">Cola automática en la impresora conectada a la laptop servidor</div></div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => void refresh()} aria-label="Actualizar impresión"><Icons.Refresh s={16} /></button>
      </div>

      {error && <div className="banner err module-feedback"><Icons.Alert s={17} /><span>{error}</span></div>}
      {message && <div className="banner ok module-feedback"><Icons.Check s={17} /><span>{message}</span></div>}
      {!status && !error && <div className="panel server-loading">Consultando la cola de impresión…</div>}

      {status && <div className="server-grid">
        <section className="panel">
          <div className="panel-h"><h3>Impresión automática</h3><span className={`badge ${printer?.enabled ? 'badge-ok' : 'badge-warn'}`}>{printer?.enabled ? 'Activa' : 'Pausada'}</span></div>
          <form className="server-section-body server-form" onSubmit={guardar}>
            <label className="check-row"><input type="checkbox" checked={printer?.enabled ?? false} onChange={(event) => setPrinter((value) => value ? { ...value, enabled: event.target.checked } : value)} /> Imprimir al llegar un pedido</label>
            <label>Impresora de la laptop<select value={printer?.printerName ?? ''} onChange={(event) => setPrinter((value) => value ? { ...value, printerName: event.target.value } : value)}><option value="">Seleccionar…</option>{status.printer.available.map((name) => <option key={name}>{name}</option>)}</select></label>
            <div className="form-grid-2">
              <label>Papel<select value={printer?.paperWidth ?? 80} onChange={(event) => setPrinter((value) => value ? { ...value, paperWidth: Number(event.target.value) as 58 | 80 } : value)}><option value="80">80 mm</option><option value="58">58 mm</option></select></label>
              <label>Copias<input type="number" min="1" max="3" value={printer?.copies ?? 1} onChange={(event) => setPrinter((value) => value ? { ...value, copies: Number(event.target.value) } : value)} /></label>
            </div>
            <button className="btn btn-primary" disabled={busy === 'save'}><Icons.Print s={16} /> Guardar</button>
            <p className="muted">Los tickets se imprimen en la laptop servidor; esta tablet solo administra la cola.</p>
          </form>
        </section>

        <section className="panel">
          <div className="panel-h"><h3>Cola de tickets</h3><span className="spacer" /><span className="badge badge-info">{status.printQueue.printed} impresos</span></div>
          <div className="server-section-body">
            <div className="server-queue"><span>Pendientes <strong>{status.printQueue.pending}</strong></span><span>Fallidos <strong>{status.printQueue.failed}</strong></span><span>Impresos <strong>{status.printQueue.printed}</strong></span></div>
            {status.printQueue.recent.length === 0 && <p className="muted">Aún no hay tickets en la cola.</p>}
            {status.printQueue.recent.map((job) => <div className="server-failed" key={job.id}>
              <span>Pedido {job.pedidoId.slice(0, 8)} · {job.status}{job.lastError ? ` · ${job.lastError}` : ''}</span>
              {job.status === 'FAILED' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === job.id} onClick={() => reintentar(job.id)}>Reintentar</button>}
            </div>)}
          </div>
        </section>
      </div>}
    </div>
  );
}
