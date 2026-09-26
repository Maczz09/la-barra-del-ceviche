import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';
import { stepsForRole, type GuideStep } from './catalog';
import type { RutaApp } from '../auth/permisos';

type Rect = { left: number; top: number; width: number; height: number };
export interface GuideSession { destroy(): void }

/** Four backdrop-filter panels leave the highlighted control sharp. */
export function spotlightRects(viewportWidth: number, viewportHeight: number, target?: Rect, padding = 10): Rect[] {
  if (!target) return [{ left: 0, top: 0, width: viewportWidth, height: viewportHeight }];
  const left = Math.max(0, Math.min(viewportWidth, target.left - padding));
  const top = Math.max(0, Math.min(viewportHeight, target.top - padding));
  const right = Math.max(left, Math.min(viewportWidth, target.left + target.width + padding));
  const bottom = Math.max(top, Math.min(viewportHeight, target.top + target.height + padding));
  return [
    { left: 0, top: 0, width: viewportWidth, height: top },
    { left: 0, top, width: left, height: bottom - top },
    { left: right, top, width: viewportWidth - right, height: bottom - top },
    { left: 0, top: bottom, width: viewportWidth, height: viewportHeight - bottom },
  ];
}

class BlurSpotlight {
  private root: HTMLDivElement;
  private panels: HTMLDivElement[];
  private target?: Element;
  private frame = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'guide-blur-layer';
    this.root.setAttribute('aria-hidden', 'true');
    this.panels = Array.from({ length: 4 }, () => {
      const panel = document.createElement('div');
      panel.className = 'guide-blur-panel';
      this.root.append(panel);
      return panel;
    });
    document.body.append(this.root);
    window.addEventListener('resize', this.queueUpdate);
    window.addEventListener('scroll', this.queueUpdate, true);
    window.visualViewport?.addEventListener('resize', this.queueUpdate);
  }

  show(target?: Element) {
    this.target = target;
    this.queueUpdate();
  }

  private queueUpdate = () => {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const bounds = this.target?.getBoundingClientRect();
      const rects = spotlightRects(window.innerWidth, window.innerHeight, bounds);
      this.panels.forEach((panel, index) => {
        const rect = rects[index];
        panel.style.display = rect ? 'block' : 'none';
        if (rect) {
          panel.style.left = `${rect.left}px`;
          panel.style.top = `${rect.top}px`;
          panel.style.width = `${rect.width}px`;
          panel.style.height = `${rect.height}px`;
        }
      });
      this.frame = 0;
    });
  };

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.queueUpdate);
    window.removeEventListener('scroll', this.queueUpdate, true);
    window.visualViewport?.removeEventListener('resize', this.queueUpdate);
    this.root.remove();
  }
}

export function launchSteps(steps: readonly GuideStep[], onComplete: () => void): GuideSession | null {
  if (steps.length === 0) return null;
  const blur = new BlurSpotlight();
  let activeTour: Driver;
  let closed = false;
  const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onEscape, true);
    blur.destroy();
  };
  const close = () => {
    cleanup();
    activeTour.destroy();
  };
  document.addEventListener('keydown', onEscape, true);
  const driveSteps: DriveStep[] = steps.map((item) => ({
    element: item.target,
    disableActiveInteraction: true,
    skipMissingElement: true,
    waitForElement: 2500,
    popover: { title: item.title, description: item.description, side: 'bottom', align: 'start' },
  }));
  activeTour = driver({
    steps: driveSteps,
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: 'Terminar',
    popoverClass: 'restoapp-guide-popover',
    overlayColor: '#081522',
    overlayOpacity: 0.42,
    stagePadding: 10,
    stageRadius: 12,
    smoothScroll: true,
    allowScroll: true,
    // En móviles no hay tecla Escape: el botón × y el fondo deben cerrar la guía.
    allowClose: true,
    onHighlighted: (element) => blur.show(element),
    // Driver.js no completa destroy() cuando existe este hook; cerramos de
    // forma explícita también si el usuario toca el overlay del móvil.
    onDestroyStarted: close,
    onDestroyed: cleanup,
    onCloseClick: close,
    onDoneClick: () => {
      onComplete();
      close();
    },
  });
  activeTour.drive();
  return { destroy: close };
}

export function launchModuleGuide(route: RutaApp, role: string | null | undefined, onComplete: () => void): GuideSession | null {
  return launchSteps(stepsForRole(route, role), onComplete);
}
