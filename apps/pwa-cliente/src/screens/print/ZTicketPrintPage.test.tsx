// @vitest-environment jsdom
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZTicketPrintPage } from './ZTicketPrintPage';
import { Z_TICKET_PRINT_KEY } from '../../utils/zTicketPrint';

const payload = {
  k: { porMetodo: { EFECTIVO: 500, TARJETA: 300, YAPE: 100, PLIN: 0, TRANSFERENCIA: 50 }, totalVentas: 950, totalEgresos: 20, propinas: 40, comprobantes: 12 },
  esperado: 500,
  contado: 498,
  descuadre: -2,
  estado: 'faltante' as const,
  cajeroNombre: 'Usuario Demo',
  fecha: '2026-08-12T05:36:00.000Z',
  sede: null,
};

describe('ZTicketPrintPage', () => {
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

  it('lee el payload de localStorage, lo borra (uso único) y renderiza el cierre Z', () => {
    localStorage.setItem(Z_TICKET_PRINT_KEY, JSON.stringify(payload));
    render(<ZTicketPrintPage />);

    expect(screen.getByText('Reporte interno · Cierre de caja')).toBeInTheDocument();
    expect(screen.getByText('Usuario Demo')).toBeInTheDocument();
    expect(localStorage.getItem(Z_TICKET_PRINT_KEY)).toBeNull();
  });

  it('sigue renderizando el cierre bajo StrictMode (doble montaje del efecto en dev)', () => {
    localStorage.setItem(Z_TICKET_PRINT_KEY, JSON.stringify(payload));
    render(
      <StrictMode>
        <ZTicketPrintPage />
      </StrictMode>,
    );

    expect(screen.getByText('Usuario Demo')).toBeInTheDocument();
    expect(screen.queryByText(/No se encontró/i)).not.toBeInTheDocument();
  });

  it('llama a print() poco después de montar, y cierra la pestaña cuando termina de imprimir', () => {
    localStorage.setItem(Z_TICKET_PRINT_KEY, JSON.stringify(payload));
    render(<ZTicketPrintPage />);

    expect(globalThis.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(globalThis.print).toHaveBeenCalled();

    globalThis.dispatchEvent(new Event('afterprint'));
    expect(globalThis.close).toHaveBeenCalled();
  });

  it('muestra un aviso si no hay nada que imprimir (pestaña abierta directamente, sin payload)', () => {
    render(<ZTicketPrintPage />);
    expect(screen.getByText(/No se encontró el cierre/i)).toBeInTheDocument();
    expect(globalThis.print).not.toHaveBeenCalled();
  });
});
