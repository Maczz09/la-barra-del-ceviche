/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
// src/config.ts - Configuraciones de UI de la aplicación

// Nombre de marca centralizado: un único lugar para renombrar la suite en
// vez de tener el string repetido en cada pantalla (Sidebar, Header, Login,
// boleta interna, exports PDF, index.html, manifest.json).
export const APP_NAME = 'La Barra del Ceviche';

// Logo del cliente (Sidebar + Login). `null` = usar el avatar con la
// inicial de APP_NAME (fallback del repo core, sin logo propio todavía).
export const APP_LOGO: string | null = '/logo.webp';

// Plataforma sobre la que corre la suite (RestoApp.pe) — se muestra como
// atribución, no como marca principal. Distinto de APP_NAME a propósito:
// esto NO cambia por cliente, es siempre RestoApp.pe.
export const PLATFORM_NAME = 'RestoApp.pe';
export const PLATFORM_CREDIT = 'Basado en RestoApp del Ingeniero en Sistemas e Informática Max Alessandro García López · v1.0';

export const APP_CONFIG = {
  nombreLocal: APP_NAME,
  // Subtítulo mostrado bajo el nombre en el Sidebar cuando todavía no hay
  // una sede resuelta (login recién hecho, admin general sin sede elegida).
  // Con sede resuelta, Sidebar usa useSedeActualQuery() en su lugar — ver
  // hooks/queries/useSedeActualQuery.ts.
  ubicacionFallback: 'Elige una sede',
  turnos: [
    { nombre: 'Turno Día', startHour: 6, endHour: 17 },
    { nombre: 'Turno Noche', startHour: 17, endHour: 6 },
  ]
};

export function getTurnoActual(date = new Date()): string {
  const hour = date.getHours();
  const turno = APP_CONFIG.turnos.find(t => {
    if (t.startHour < t.endHour) {
      return hour >= t.startHour && hour < t.endHour;
    } else {
      // Cruzando medianoche
      return hour >= t.startHour || hour < t.endHour;
    }
  });
  return turno?.nombre || 'Turno Indefinido';
}
