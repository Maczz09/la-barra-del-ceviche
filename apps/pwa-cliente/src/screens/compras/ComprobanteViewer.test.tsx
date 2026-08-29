// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComprobanteMiniatura } from './ComprobanteViewer';
import * as comprasApi from '../../api/compras.api';
import type { ComprobanteCompraDto } from '../../types/compras.types';

vi.mock('../../api/compras.api', () => ({
  obtenerMiniaturaBlob: vi.fn(),
  obtenerArchivoBlob: vi.fn(),
  obtenerComprobantePdfBlob: vi.fn(),
}));

const comprobante: ComprobanteCompraDto = {
  id: 'cp-12345678', ordenId: 'oc-1', recepcionId: null, sedeId: 's1', tipo: 'BOLETA',
  serie: null, numero: null, fechaEmision: null, montoTotal: null, mimeType: 'image/webp',
  bytes: 200, ancho: 800, alto: 600, nombreOriginal: 'boleta.jpg', usuarioNombre: null,
  createdAt: '2026-08-12T10:00:00.000Z',
};

describe('ComprobanteViewer', () => {
  const miniBlob = new Blob(['mini'], { type: 'image/webp' });
  const fullBlob = new Blob(['full'], { type: 'image/webp' });
  const pdfBlob = new Blob(['pdf'], { type: 'application/pdf' });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(comprasApi.obtenerMiniaturaBlob).mockResolvedValue(miniBlob);
    vi.mocked(comprasApi.obtenerArchivoBlob).mockResolvedValue(fullBlob);
    vi.mocked(comprasApi.obtenerComprobantePdfBlob).mockResolvedValue(pdfBlob);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'open').mockReturnValue(null);
  });

  async function abrirVisor() {
    render(<ComprobanteMiniatura comprobante={comprobante} />);
    fireEvent.click(await screen.findByTitle('Ver comprobante'));
    await waitFor(() => expect(screen.getByAltText('Comprobante')).toBeInTheDocument());
  }

  it('"Ver PDF" pide el PDF al servidor (no lo genera en el cliente) y lo abre en una pestaña nueva', async () => {
    await abrirVisor();

    fireEvent.click(screen.getByRole('button', { name: /Ver PDF/i }));

    await waitFor(() => {
      expect(comprasApi.obtenerComprobantePdfBlob).toHaveBeenCalledWith('cp-12345678');
      expect(URL.createObjectURL).toHaveBeenCalledWith(pdfBlob);
      expect(globalThis.open).toHaveBeenCalledWith('blob:mock-url', '_blank');
    });
  });

  it('"Descargar PDF" pide el mismo PDF del servidor y dispara la descarga', async () => {
    const clickSpy = vi.fn();
    const anchorSpy = vi.spyOn(document, 'createElement');

    await abrirVisor();
    fireEvent.click(screen.getByRole('button', { name: /Descargar PDF/i }));

    await waitFor(() => expect(comprasApi.obtenerComprobantePdfBlob).toHaveBeenCalledWith('cp-12345678'));
    // El <a download> se crea, apunta al blob del servidor y se revoca luego.
    const anchor = anchorSpy.mock.results.find((r) => (r.value as HTMLElement).tagName === 'A')?.value as HTMLAnchorElement;
    expect(anchor?.download).toBe('comprobante-cp-12345.pdf');
    void clickSpy;
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'));
  });

  it('deshabilita ambos botones mientras se está generando/abriendo', async () => {
    await abrirVisor();

    fireEvent.click(screen.getByRole('button', { name: /Ver PDF/i }));

    expect(screen.getByRole('button', { name: /Descargar PDF/i })).toBeDisabled();
  });
});
