// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CartaQrPanel } from './CartaQrPanel';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: vi.fn(),
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined) },
}));

const SEDE = { id: 'sede-1', nombre: 'Sede Central' };

describe('CartaQrPanel', () => {
  beforeEach(() => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: false } as any);
  });

  it('muestra un mensaje mientras carga la sede', () => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: true } as any);
    render(<CartaQrPanel />);
    expect(screen.getByText('Cargando sede…')).toBeDefined();
  });

  it('pide seleccionar una sede si no hay ninguna activa', () => {
    render(<CartaQrPanel />);
    expect(screen.getByText(/Selecciona una sede/)).toBeDefined();
  });

  it('muestra el QR y los botones de acción cuando hay sede activa', () => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: SEDE, loading: false } as any);
    render(<CartaQrPanel />);
    expect(screen.getByText(/Sede Central/)).toBeDefined();
    expect(screen.getByText('Copiar link')).toBeDefined();
    expect(screen.getByText('Descargar QR')).toBeDefined();
  });

  it('copia el link de la carta pública al portapapeles', async () => {
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: SEDE, loading: false } as any);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CartaQrPanel />);
    fireEvent.click(screen.getByText('Copiar link'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/carta/sede-1`));
    await waitFor(() => expect(screen.getByText('Copiado')).toBeDefined());
  });
});
