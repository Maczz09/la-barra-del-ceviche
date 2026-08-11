// auth/permisos.ts — Control de acceso por rol (navegación del PWA)
//
// Fuente única de verdad: por cada rol, su vista "home" (a la que aterriza al
// entrar) y el conjunto de rutas que puede abrir / ver en el menú.
//
// OJO: esto gobierna solo la navegación en el front (UX). El backend debe
// validar la autorización por su cuenta; ocultar una vista aquí no protege
// el endpoint detrás de ella.

import type { RolUsuario } from '../types/usuario.types';

/** Todas las rutas hijas bajo /app (key = segmento de URL). */
export const TODAS_LAS_RUTAS = [
  'inicio',
  'mesas',
  'pedidos',
  'cocina',
  'caja',
  'historial-caja',
  'reservas',
  'carta',
  'compras',
  'inventario',
  'categorias',
  'reportes',
  'usuarios',
  'sedes',
] as const;

export type RutaApp = (typeof TODAS_LAS_RUTAS)[number];

interface AccesoRol {
  /** Vista a la que se redirige al rol al entrar o cuando no tiene acceso. */
  home: RutaApp;
  /** Rutas que el rol puede abrir y que aparecen en el menú lateral. */
  rutas: readonly RutaApp[];
}

// Para ajustar qué ve cada rol, edita SOLO este mapa.
export const ACCESO_POR_ROL: Record<RolUsuario, AccesoRol> = {
  ADMIN: { home: 'inicio', rutas: TODAS_LAS_RUTAS },
  SISTEMA: { home: 'usuarios', rutas: TODAS_LAS_RUTAS },
  GERENCIA: {
    home: 'reportes',
    rutas: ['reportes', 'inventario', 'categorias', 'compras', 'carta', 'reservas', 'usuarios'],
  },
  CAJERO: { home: 'caja', rutas: ['caja', 'mesas', 'pedidos'] },
  COCINA: { home: 'cocina', rutas: ['cocina', 'carta'] },
  MESERO: { home: 'mesas', rutas: ['mesas', 'pedidos', 'reservas'] },
  RECEPCION: { home: 'reservas', rutas: ['reservas', 'mesas'] },
};

/** Fallback seguro si el rol viene desconocido o nulo. */
const ACCESO_FALLBACK: AccesoRol = { home: 'inicio', rutas: ['inicio'] };

export function accesoDeRol(rol: string | null | undefined): AccesoRol {
  if (rol && rol in ACCESO_POR_ROL) return ACCESO_POR_ROL[rol as RolUsuario];
  return ACCESO_FALLBACK;
}

/** ¿El rol puede abrir esta ruta? */
export function puedeAcceder(rol: string | null | undefined, ruta: string): boolean {
  return accesoDeRol(rol).rutas.includes(ruta as RutaApp);
}

/** Vista principal del rol (destino de redirecciones). */
export function homeDeRol(rol: string | null | undefined): RutaApp {
  return accesoDeRol(rol).home;
}
