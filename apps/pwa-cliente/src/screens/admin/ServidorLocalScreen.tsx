import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Icons } from '../../components/ui/icons';
import { localRuntimeApi, type BackupSummary, type PrinterSettings, type RuntimeStatus } from '../../api/local-runtime.api';

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ServidorLocalScreen() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [printer, setPrinter] = useState<PrinterSettings | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const qrRef = useRef<HTMLCanvasElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextBackups] = await Promise.all([localRuntimeApi.status(), localRuntimeApi.backups()]);
      setStatus(nextStatus);
      setPrinter((current) => current ?? nextStatus.printer.config);
      setBackups(nextBackups);
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

  useEffect(() => {
    if (!status?.url || !qrRef.current) return;
    void QRCode.toCanvas(qrRef.current, status.url, {
      width: 168, margin: 1, color: { dark: '#061427', light: '#ffffff' },
    });
  }, [status?.url]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setError(''); setMessage('');
    try { await action(); setMessage(success); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  };

  const copyUrl = async () => {
    if (!status) return;
    await navigator.clipboard.writeText(status.url);
    setMessage('Dirección copiada. Ábrela desde cualquier equipo conectado al mismo Wi-Fi.');
  };

  const savePrinter = (event: FormEvent) => {
    event.preventDefault();
    if (!printer) return;
    void run('printer', () => localRuntimeApi.savePrinter(printer), 'Configuración de impresión guardada.');
  };

  return (
    <div className="server-page">
      <div className="page-h">
        <div><h1>Servidor local</h1><div className="sub">Red, microservicios, impresión y respaldos de esta laptop</div></div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => void refresh()} aria-label="Actualizar servidor"><Icons.Refresh s={16} /></button>
      </div>

      {error && <div className="banner err module-feedback"><Icons.Alert s={17} /><span>{error}</span></div>}
      {message && <div className="banner ok module-feedback"><Icons.Check s={17} /><span>{message}</span></div>}

      {!status && !error && <div className="panel server-loading">Consultando el servidor local…</div>}
      {status && <>
        <div className="server-hero panel">
          <div className="server-hero-copy">
            <span className="badge badge-ok">Servidor activo</span>
            <h2>{status.url}</h2>
            <p>Esta es la dirección única para los meseros, cocina y la carta digital dentro de la red del restaurante.</p>
            <div className="server-actions">
              <button className="btn btn-primary" onClick={() => void copyUrl()}><Icons.Copy s={16} /> Copiar dirección</button>
              <a className="btn btn-ghost" href={status.url} target="_blank" rel="noreferrer"><Icons.Eye s={16} /> Abrir</a>
            </div>
            <div className="server-meta">
              <span>IP alternativa {status.ipUrl}</span><span>ID {status.serverId}</span><span>Activo {formatUptime(status.uptimeSeconds)}</span><span>Puerto {status.port}</span>
            </div>
          </div>
          <div className="server-qr"><canvas ref={qrRef} /><small>QR de acceso a RestoApp</small></div>
        </div>

        <div className="banner warn module-feedback">
          <Icons.Alert s={17} />
          <span>El QR usa el nombre fijo <strong>la-barra-del-ceviche.local</strong>. Como respaldo, reserva la IP <strong>{status.primaryAddress?.address ?? 'de esta laptop'}</strong> para la MAC <strong>{status.primaryAddress?.mac ?? 'de esta laptop'}</strong> en el router.</span>
        </div>

        <div className="server-grid">
          <section className="panel">
            <div className="panel-h"><h3>Microservicios</h3><span className="spacer" /><span className="badge badge-info">{status.processes.filter((item) => item.health?.ok).length}/{status.processes.length} saludables</span></div>
            <div className="server-list">
              {status.processes.map((item) => <div className="server-list-row" key={item.name}>
                <span className={`server-dot ${item.health?.ok ? 'ok' : 'bad'}`} />
                <div><strong>{item.name}</strong><small>{item.state === 'running' ? `PID ${item.pid ?? '—'} · ${item.health?.latencyMs ?? '—'} ms` : 'Detenido'}</small></div>
                <button className="btn btn-ghost btn-sm" disabled={busy === item.name} onClick={() => void run(item.name, () => localRuntimeApi.restart(item.name), `${item.name} reiniciado.`)}><Icons.Refresh s={14} /></button>
              </div>)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-h"><h3>Red local</h3><span className="spacer" /><span className="badge badge-info">{status.devices.length} equipos activos</span></div>
            <div className="server-section-body">
              {status.addresses.map((address) => <div className="server-network" key={`${address.interface}-${address.address}`}>
                <strong>{address.address}</strong><span>{address.interface}</span><code>{address.mac}</code>
              </div>)}
              <h4>Dispositivos recientes</h4>
              {status.devices.length === 0 ? <p className="muted">Aún no hay celulares conectados.</p> : status.devices.map((device) => <div className="server-device" key={device.address}><span>{device.address}</span><small>{device.requests} solicitudes</small></div>)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-h"><h3>Impresión automática de cocina</h3></div>
            <form className="server-section-body server-form" onSubmit={savePrinter}>
              <label className="check-row"><input type="checkbox" checked={printer?.enabled ?? false} onChange={(event) => setPrinter((value) => value ? { ...value, enabled: event.target.checked } : value)} /> Imprimir al llegar un pedido</label>
              <label>Impresora<select value={printer?.printerName ?? ''} onChange={(event) => setPrinter((value) => value ? { ...value, printerName: event.target.value } : value)}><option value="">Seleccionar…</option>{status.printer.available.map((name) => <option key={name}>{name}</option>)}</select></label>
              <div className="form-grid-2">
                <label>Papel<select value={printer?.paperWidth ?? 80} onChange={(event) => setPrinter((value) => value ? { ...value, paperWidth: Number(event.target.value) as 58 | 80 } : value)}><option value="80">80 mm</option><option value="58">58 mm</option></select></label>
                <label>Copias<input type="number" min="1" max="3" value={printer?.copies ?? 1} onChange={(event) => setPrinter((value) => value ? { ...value, copies: Number(event.target.value) } : value)} /></label>
              </div>
              <button className="btn btn-primary" disabled={busy === 'printer'}><Icons.Print s={16} /> Guardar impresión</button>
              <div className="server-queue"><span>Pendientes <strong>{status.printQueue.pending}</strong></span><span>Fallidos <strong>{status.printQueue.failed}</strong></span><span>Impresos <strong>{status.printQueue.printed}</strong></span></div>
              {status.printQueue.recent.filter((job) => job.status === 'FAILED').slice(0, 3).map((job) => <div className="server-failed" key={job.id}><span>Pedido {job.pedidoId.slice(0, 8)} · {job.lastError}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => void run(`print-${job.id}`, () => localRuntimeApi.retryPrint(job.id), 'Trabajo enviado de nuevo a impresión.')}>Reintentar</button></div>)}
            </form>
          </section>

          <section className="panel">
            <div className="panel-h"><h3>Respaldos</h3><span className="spacer" /><button className="btn btn-soft btn-sm" disabled={busy === 'backup'} onClick={() => void run('backup', localRuntimeApi.createBackup, 'Respaldo verificado y guardado.')}><Icons.Download s={15} /> Crear ahora</button></div>
            <div className="server-section-body">
              <p className="muted">Se genera un respaldo automático todos los días a las 3:00 a. m.</p>
              {backups.length === 0 ? <div className="empty"><p>Aún no hay respaldos.</p></div> : backups.slice(0, 8).map((backup) => <div className="server-backup" key={backup.name}><div><strong>{backup.name}</strong><small>{new Date(backup.createdAt).toLocaleString('es-PE')} · {formatBytes(backup.size)}</small></div><code title={backup.path}>{backup.path}</code></div>)}
              <div className="server-data-path"><small>Datos de la aplicación</small><code>{status.dataDirectory}</code></div>
            </div>
          </section>
        </div>
      </>}
    </div>
  );
}
