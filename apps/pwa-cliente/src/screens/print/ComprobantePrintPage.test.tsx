// @vitest-environment jsdom
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComprobantePrintPage } from './ComprobantePrintPage';
import { COMPROBANTE_PRINT_KEY } from '../../utils/comprobantePrint';

const payload = {
  comprobante: {
    id: 'cb1', tipo: 'BOLETA', serie: 'B001', correlativo: 1,
    clienteRuc: null, clienteDni: '45678912', clienteRazonSocial: null, clienteNombre: 'Usuario Demo',
    subtotal: '12.71', igv: '2.29', total: '15.00',
    estado: 'ACEPTADO', motivoRechazo: null, createdAt: '2026-08-12T17:41:00.000Z',
    empresa: { ruc: '20123456786', razonSocial: 'EMPRESA DEMO S.A.C.', nombreComercial: null, direccion: null },
  },
  items: [{ productoId: 'p1', nombre: 'Ceviche mixto', cantidad: 1, precioUnitario: 15 }],
};

describe('ComprobantePrintPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'print').mockImplementation(() => {});
    vi.spyOn(globalThis, 'close').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lee el payload de localStorage, lo borra (uso único) y renderiza el comprobante', () => {
    localStorage.setItem(COMPROBANTE_PRINT_KEY, JSON.stringify(payload));
    render(<ComprobantePrintPage />);

    expect(screen.getByText('Boleta de venta electrónica')).toBeInTheDocument();
    expect(screen.getByText('B001-1')).toBeInTheDocument();
    expect(localStorage.getItem(COMPROBANTE_PRINT_KEY)).toBeNull();
  });

  it('sigue renderizando el comprobante bajo StrictMode (doble montaje del efecto en dev)', () => {
    localStorage.setItem(COMPROBANTE_PRINT_KEY, JSON.stringify(payload));
    render(
      <StrictMode>
        <ComprobantePrintPage />
      </StrictMode>,
    );

    expect(screen.getByText('B001-1')).toBeInTheDocument();
    expect(screen.queryByText(/No se encontró/i)).not.toBeInTheDocument();
  });

  it('llama a print() poco después de montar, y cierra la pestaña cuando termina de imprimir', () => {
    localStorage.setItem(COMPROBANTE_PRINT_KEY, JSON.stringify(payload));
    render(<ComprobantePrintPage />);

    expect(globalThis.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(globalThis.print).toHaveBeenCalled();

    globalThis.dispatchEvent(new Event('afterprint'));
    expect(globalThis.close).toHaveBeenCalled();
  });

  it('muestra un aviso si no hay nada que imprimir (pestaña abierta directamente, sin payload)', () => {
    render(<ComprobantePrintPage />);
    expect(screen.getByText(/No se encontró el comprobante/i)).toBeInTheDocument();
    expect(globalThis.print).not.toHaveBeenCalled();
  });
});
