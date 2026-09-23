import { describe, expect, it } from 'vitest';
import { spotlightRects } from './spotlight';

describe('desenfoque por paso', () => {
  it('deja libre el rectángulo resaltado y cubre el resto de la pantalla', () => {
    expect(spotlightRects(400, 300, { left: 100, top: 80, width: 120, height: 40 }, 10)).toEqual([
      { left: 0, top: 0, width: 400, height: 70 },
      { left: 0, top: 70, width: 90, height: 60 },
      { left: 230, top: 70, width: 170, height: 60 },
      { left: 0, top: 130, width: 400, height: 170 },
    ]);
  });

  it('no genera paneles con tamaños negativos al resaltar un borde', () => {
    const panels = spotlightRects(320, 480, { left: -5, top: -3, width: 50, height: 30 }, 10);
    expect(panels.every((panel) => panel.width >= 0 && panel.height >= 0)).toBe(true);
  });

  it('desenfoca toda la pantalla cuando un paso es introductorio', () => {
    expect(spotlightRects(320, 480)).toEqual([{ left: 0, top: 0, width: 320, height: 480 }]);
  });
});
