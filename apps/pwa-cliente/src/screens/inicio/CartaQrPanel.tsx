// screens/inicio/CartaQrPanel.tsx — Widget de la carta pública/QR (T-XX) en
// Inicio: genera el link/QR de la sede activa para copiar o descargar e
// imprimir y pegar en las mesas. Todo client-side (librería `qrcode`), sin
// tocar el backend.

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Icons } from '../../components/ui/icons';
import { useToast } from '../../components/ui/ToastProvider';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';

export function CartaQrPanel() {
  const { sede, loading } = useSedeActualQuery();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copiado, setCopiado] = useState(false);

  const link = sede ? `${window.location.origin}/carta/${sede.id}` : null;

  useEffect(() => {
    if (!link || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, link, {
      width: 148,
      margin: 1,
      color: { dark: '#14100e', light: '#f2e9dd' },
    });
  }, [link]);

  const copiarLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast({ title: 'No se pudo copiar', msg: 'Copia el link manualmente.', icon: 'Alert', kind: 'err' });
    }
  };

  const descargarQr = () => {
    const canvas = canvasRef.current;
    if (!canvas || !sede) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `carta-qr-${sede.nombre.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  };

  return (
    <section className="panel">
      <div className="panel-h"><h3>Carta pública</h3></div>
      <div style={{ padding: '14px 16px' }}>
        {loading && <div className="muted" style={{ fontSize: 13 }}>Cargando sede…</div>}

        {!loading && !sede && (
          <div className="muted" style={{ fontSize: 13 }}>Selecciona una sede para generar su carta pública.</div>
        )}

        {!loading && sede && (
          <>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              Compártelo con tus clientes o pega el QR impreso en las mesas de {sede.nombre}.
            </p>
            <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
              <canvas ref={canvasRef} style={{ borderRadius: 8, flex: 'none' }} />
              <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                <button className="btn btn-soft btn-sm btn-block" onClick={() => void copiarLink()}>
                  {copiado ? <Icons.Check s={15} /> : <Icons.Copy s={15} />}
                  {copiado ? 'Copiado' : 'Copiar link'}
                </button>
                <button className="btn btn-ghost btn-sm btn-block" onClick={descargarQr}>
                  <Icons.Download s={15} /> Descargar QR
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
