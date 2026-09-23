// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchSteps } from './spotlight';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('recorrido con desenfoque', () => {
  it('muestra cuatro paneles alrededor del objetivo y los retira al cerrar', async () => {
    const target = document.createElement('button');
    target.id = 'objetivo-guia';
    document.body.append(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 80, top: 60, width: 100, height: 40, right: 180, bottom: 100, x: 80, y: 60, toJSON: () => ({}) });
    const tour = launchSteps([{ target: '#objetivo-guia', title: 'Objetivo', description: 'Explicación segura' }], vi.fn());
    await vi.waitFor(() => expect(document.querySelectorAll('.guide-blur-panel').length).toBe(4));
    expect(document.querySelector('.driver-popover')).toBeTruthy();
    tour?.destroy();
    await vi.waitFor(() => expect(document.querySelector('.guide-blur-layer')).toBeNull());
  });

  it('recoloca el área nítida al avanzar al siguiente paso', async () => {
    const first = document.createElement('button');
    const second = document.createElement('button');
    first.id = 'primero';
    second.id = 'segundo';
    document.body.append(first, second);
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({ left: 40, top: 50, width: 80, height: 30, right: 120, bottom: 80, x: 40, y: 50, toJSON: () => ({}) });
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue({ left: 190, top: 150, width: 80, height: 30, right: 270, bottom: 180, x: 190, y: 150, toJSON: () => ({}) });
    const tour = launchSteps([
      { target: '#primero', title: 'Uno', description: 'Primer control' },
      { target: '#segundo', title: 'Dos', description: 'Segundo control' },
    ], vi.fn());
    await vi.waitFor(() => expect(document.querySelector('.guide-blur-panel:nth-child(2)')?.getAttribute('style')).toContain('width: 30px'));
    (document.querySelector('.driver-popover-next-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('.guide-blur-panel:nth-child(2)')?.getAttribute('style')).toContain('width: 180px'));
    tour?.destroy();
  });

  it('permite salir con el botón visible también en un móvil sin Escape', async () => {
    document.body.innerHTML = '<button id="objetivo-guia">Objetivo</button>';
    const tour = launchSteps([{ target: '#objetivo-guia', title: 'Objetivo', description: 'Ayuda' }], vi.fn());
    await vi.waitFor(() => expect(document.querySelector('.driver-popover-close-btn')).toBeTruthy());
    (document.querySelector('.driver-popover-close-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('.guide-blur-layer')).toBeNull());
    tour?.destroy();
  });

  it('retira popover y desenfoque al tocar el fondo', async () => {
    document.body.innerHTML = '<button id="objetivo-guia">Objetivo</button>';
    launchSteps([{ target: '#objetivo-guia', title: 'Objetivo', description: 'Ayuda' }], vi.fn());
    await vi.waitFor(() => expect(document.querySelector('.driver-overlay path')).toBeTruthy());
    (document.querySelector('.driver-overlay path') as SVGPathElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.driver-popover')).toBeNull());
    expect(document.querySelector('.guide-blur-layer')).toBeNull();
  });
});
