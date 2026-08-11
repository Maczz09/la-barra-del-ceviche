// utils/periodos.ts — Presets de rango de fechas para filtros tipo "Top
// productos": día/semana/mes/trimestre/año/todo + temporadas del hemisferio
// sur (Perú). Cada preset resuelve a un rango {desde, hasta} en fechas
// locales de Lima (YYYY-MM-DD), listo para pasar a ResumenQuery.

import { fechaLocalISO } from './format';

export type PeriodoTop =
  | 'dia' | 'semana' | 'mes' | 'trimestre' | 'anio' | 'todo'
  | 'verano' | 'otono' | 'invierno' | 'primavera';

export const PERIODOS_TOP: { value: PeriodoTop; label: string }[] = [
  { value: 'dia', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'anio', label: 'Año' },
  { value: 'todo', label: 'Todo' },
  { value: 'verano', label: 'Verano' },
  { value: 'otono', label: 'Otoño' },
  { value: 'invierno', label: 'Invierno' },
  { value: 'primavera', label: 'Primavera' },
];

interface FechaYMD { y: number; m: number; d: number } // m: 0-indexado

function hoyEnLima(ahora: Date): FechaYMD {
  const [y, m, d] = fechaLocalISO(ahora).split('-').map(Number);
  return { y, m: m - 1, d };
}

/** Formatea y/m(0-idx)/d como YYYY-MM-DD, anclado a mediodía UTC para no
 * cruzar de día por DST/offset al reformatear en la zona de Lima. */
function fmtISO(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(dt);
}

type Temporada = 'verano' | 'otono' | 'invierno' | 'primavera';

// Límites de temporada (hemisferio sur). Meses 0-indexados.
const TEMPORADAS: Record<Temporada, { inicioMes: number; inicioDia: number; finMes: number; finDia: number }> = {
  verano: { inicioMes: 11, inicioDia: 21, finMes: 2, finDia: 20 }, // cruza el año
  otono: { inicioMes: 2, inicioDia: 21, finMes: 5, finDia: 20 },
  invierno: { inicioMes: 5, inicioDia: 21, finMes: 8, finDia: 22 },
  primavera: { inicioMes: 8, inicioDia: 23, finMes: 11, finDia: 20 },
};

function rangoTemporada(temporada: Temporada, hoy: FechaYMD): { desde: string; hasta: string } {
  const t = TEMPORADAS[temporada];
  const hoyDate = new Date(hoy.y, hoy.m, hoy.d);

  // Genera instancias candidatas alrededor de hoy (año-1, año, año+1) — el
  // verano cruza el límite de año, así que necesita ver ambos lados.
  const candidatos = [-1, 0, 1].map((offset) => {
    const anioInicio = hoy.y + offset;
    const anioFin = t.finMes < t.inicioMes ? anioInicio + 1 : anioInicio;
    return {
      inicio: new Date(anioInicio, t.inicioMes, t.inicioDia),
      fin: new Date(anioFin, t.finMes, t.finDia),
    };
  });

  const actual = candidatos.find((c) => hoyDate >= c.inicio && hoyDate <= c.fin);
  const masReciente = candidatos.filter((c) => c.fin < hoyDate).sort((a, b) => b.fin.getTime() - a.fin.getTime())[0];
  const elegido = actual ?? masReciente ?? [...candidatos].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0];

  const finRango = actual ? hoyDate : elegido.fin;
  return {
    desde: fmtISO(elegido.inicio.getFullYear(), elegido.inicio.getMonth(), elegido.inicio.getDate()),
    hasta: fmtISO(finRango.getFullYear(), finRango.getMonth(), finRango.getDate()),
  };
}

/** Resuelve un preset a un rango {desde, hasta} en fechas locales de Lima. */
export function rangoDePeriodo(periodo: PeriodoTop, ahora: Date = new Date()): { desde: string; hasta: string } {
  const hoy = hoyEnLima(ahora);
  const hoyStr = fmtISO(hoy.y, hoy.m, hoy.d);

  switch (periodo) {
    case 'dia':
      return { desde: hoyStr, hasta: hoyStr };
    case 'semana': {
      const hoyDate = new Date(hoy.y, hoy.m, hoy.d);
      const dow = hoyDate.getDay(); // 0=Dom..6=Sab
      const diffALunes = dow === 0 ? -6 : 1 - dow;
      const lunes = new Date(hoy.y, hoy.m, hoy.d + diffALunes);
      return { desde: fmtISO(lunes.getFullYear(), lunes.getMonth(), lunes.getDate()), hasta: hoyStr };
    }
    case 'mes':
      return { desde: fmtISO(hoy.y, hoy.m, 1), hasta: hoyStr };
    case 'trimestre': {
      const inicioMesTrimestre = Math.floor(hoy.m / 3) * 3;
      return { desde: fmtISO(hoy.y, inicioMesTrimestre, 1), hasta: hoyStr };
    }
    case 'anio':
      return { desde: fmtISO(hoy.y, 0, 1), hasta: hoyStr };
    case 'todo':
      return { desde: '1970-01-01', hasta: hoyStr };
    case 'verano':
    case 'otono':
    case 'invierno':
    case 'primavera':
      return rangoTemporada(periodo, hoy);
    default:
      return { desde: hoyStr, hasta: hoyStr };
  }
}
