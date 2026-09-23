import { describe, expect, it } from 'vitest';
import { ACCESO_POR_ROL, TODAS_LAS_RUTAS } from '../auth/permisos';
import { GUIDES, guidesForRole, stepsForRole } from './catalog';

describe('catálogo de guías por rol', () => {
  it('cubre exactamente todas las vistas internas', () => {
    expect(Object.keys(GUIDES).sort()).toEqual([...TODAS_LAS_RUTAS].sort());
    for (const route of TODAS_LAS_RUTAS) {
      expect(GUIDES[route].steps.length).toBeGreaterThan(0);
      expect(GUIDES[route].steps.every((step) => step.title && step.description && step.target)).toBe(true);
    }
  });

  it.each(Object.keys(ACCESO_POR_ROL) as (keyof typeof ACCESO_POR_ROL)[])('solo ofrece rutas autorizadas a %s', (role) => {
    expect(guidesForRole(role).map((guide) => guide.route)).toEqual(ACCESO_POR_ROL[role].rutas);
    for (const route of TODAS_LAS_RUTAS) {
      expect(stepsForRole(route, role).length > 0).toBe(ACCESO_POR_ROL[role].rutas.includes(route));
    }
  });

  it('no enseña edición de carta ni alta de productos al rol Cocina', () => {
    expect(stepsForRole('carta', 'COCINA').some((step) => step.title === 'Crear y editar')).toBe(false);
    expect(stepsForRole('inventario', 'COCINA').some((step) => step.title === 'Productos de venta')).toBe(false);
  });

  it('no enseña crear pedidos a Recepción', () => {
    expect(stepsForRole('mesas', 'RECEPCION').some((step) => step.title === 'Nuevo pedido')).toBe(false);
  });
});
