/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/ComprobanteViewer.tsx — Miniatura + visor de la foto del
// comprobante. La imagen se trae por fetch autenticado (Blob), NUNCA por
// <img src=".../archivo">: el token vive en cookie httpOnly y Kong/helmet no
// la resolverían en una carga de imagen cruda del navegador.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import * as comprasApi from '../../api/compras.api';
import type { ComprobanteCompraDto } from '../../types/compras.types';

function useBlobUrl(cargar: () => Promise<Blob>, deps: readonly unknown[]): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelado = false;
    cargar()
      .then((blob) => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, deps);

  return url;
}

interface ComprobanteMiniaturaProps {
  comprobante: ComprobanteCompraDto;
  onEliminar?: () => void;
}

export function ComprobanteMiniatura({ comprobante, onEliminar }: Readonly<ComprobanteMiniaturaProps>) {
  const [abierto, setAbierto] = useState(false);
  const urlMini = useBlobUrl(() => comprasApi.obtenerMiniaturaBlob(comprobante.id), [comprobante.id]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Ver comprobante"
        style={{ border: '1px solid var(--border)', background: 'transparent', padding: 0, cursor: 'pointer', borderRadius: 8, width: 40, height: 40, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {urlMini ? (
          <img src={urlMini} alt="Comprobante" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Icons.Receipt s={16} />
        )}
      </button>
      {abierto && (
        <ComprobanteVisorModal comprobante={comprobante} onClose={() => setAbierto(false)} onEliminar={onEliminar} />
      )}
    </>
  );
}

interface ComprobanteVisorModalProps {
  comprobante: ComprobanteCompraDto;
  onClose: () => void;
  onEliminar?: () => void;
}

function ComprobanteVisorModal({ comprobante, onClose, onEliminar }: Readonly<ComprobanteVisorModalProps>) {
  const urlFull = useBlobUrl(() => comprasApi.obtenerArchivoBlob(comprobante.id), [comprobante.id]);
  // El PDF lo arma servicio-compras al vuelo (foto guardada como WebP, no se
  // persiste el PDF — ver ComprobantesService.generarPdf) a partir de la
  // misma foto ya subida, no algo que se regenera del lado del cliente.
  const [generando, setGenerando] = useState<'ver' | 'descargar' | null>(null);

  const verPdf = async () => {
    if (generando) return;
    setGenerando('ver');
    try {
      const blob = await comprasApi.obtenerComprobantePdfBlob(comprobante.id);
      const url = URL.createObjectURL(blob);
      globalThis.open(url, '_blank');
      // No se revoca el object URL enseguida: la pestaña nueva lo sigue
      // usando para renderizar el PDF. El navegador lo libera solo al
      // cerrarla/recargarla.
    } finally {
      setGenerando(null);
    }
  };

  const descargarPdf = async () => {
    if (generando) return;
    setGenerando('descargar');
    try {
      const blob = await comprasApi.obtenerComprobantePdfBlob(comprobante.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante-${comprobante.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerando(null);
    }
  };

  return createPortal(
    // Sin z-index inline: hereda el default global de .modal-wrap (85,
    // styles.css) igual que OrdenDetalleModal. Un valor fijo aquí (antes 80)
    // queda huérfano cada vez que ese default cambie en otro módulo — ya
    // pasó una vez (ver commit ca622e6, fix de Pedidos que subió 70→85 sin
    // tocar este archivo) y este visor terminó pintando detrás del modal de
    // detalle de OC que lo abre.
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <div className="modal" style={{ width: 'min(520px, 100%)', position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 16 }}>Comprobante</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="modal-scroll" style={{ padding: 16, textAlign: 'center' }}>
          {urlFull ? (
            <img
              src={urlFull}
              alt="Comprobante"
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 10, border: '1px solid var(--border)' }}
            />
          ) : (
            <div className="muted">Cargando imagen…</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" disabled={!!generando} onClick={() => void verPdf()}>
            <Icons.Receipt s={15} /> {generando === 'ver' ? 'Abriendo…' : 'Ver PDF'}
          </button>
          <button className="btn btn-soft" disabled={!!generando} onClick={() => void descargarPdf()}>
            <Icons.Download s={15} /> {generando === 'descargar' ? 'Generando…' : 'Descargar PDF'}
          </button>
          <span className="spacer" />
          {onEliminar && (
            <button className="btn btn-danger" onClick={() => { onEliminar(); onClose(); }}>
              <Icons.Close s={15} /> Eliminar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
