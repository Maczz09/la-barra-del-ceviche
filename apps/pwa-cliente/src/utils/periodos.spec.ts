import { describe, it, expect } from 'vitest';
import { rangoDePeriodo } from './periodos';

// Fechas ancladas a mediodía UTC (~7am Lima) para que fechaLocalISO() no
// cruce de día al reformatear en la zona de Lima.
const HOY_VERANO = new Date('2026-01-15T12:00:00Z'); // pleno verano
const HOY_OTONO = new Date('2026-04-15T12:00:00Z');
const HOY_INVIERNO = new Date('2026-07-15T12:00:00Z');
const HOY_PRIMAVERA = new Date('2026-10-15T12:00:00Z');

describe('rangoDePeriodo', () => {
  it('dia: desde y hasta son hoy', () => {
    const r = rangoDePeriodo('dia', HOY_INVIERNO);
    expect(r.desde).toBe('2026-07-15');
    expect(r.hasta).toBe('2026-07-15');
  });

  it('semana: desde es el lunes de esta semana', () => {
    // 15 jul 2026 es miércoles.
    const r = rangoDePeriodo('semana', HOY_INVIERNO);
    expect(r.desde).toBe('2026-07-13'); // lunes
    expect(r.hasta).toBe('2026-07-15');
  });

  it('mes: desde es el día 1 del mes actual', () => {
    const r = rangoDePeriodo('mes', HOY_INVIERNO);
    expect(r.desde).toBe('2026-07-01');
    expect(r.hasta).toBe('2026-07-15');
  });

  it('trimestre: desde es el inicio del trimestre actual', () => {
    const r = rangoDePeriodo('trimestre', HOY_INVIERNO); // jul → Q3 (jul-sep)
    expect(r.desde).toBe('2026-07-01');
    expect(r.hasta).toBe('2026-07-15');
  });

  it('anio: desde es el 1 de enero del año actual', () => {
    const r = rangoDePeriodo('anio', HOY_INVIERNO);
    expect(r.desde).toBe('2026-01-01');
    expect(r.hasta).toBe('2026-07-15');
  });

  it('todo: desde es epoch', () => {
    const r = rangoDePeriodo('todo', HOY_INVIERNO);
    expect(r.desde).toBe('1970-01-01');
    expect(r.hasta).toBe('2026-07-15');
  });

  it('invierno: dentro de temporada, hasta se limita a hoy', () => {
    const r = rangoDePeriodo('invierno', HOY_INVIERNO);
    expect(r.desde).toBe('2026-06-21');
    expect(r.hasta).toBe('2026-07-15');
  });

  it('otono: dentro de temporada, hasta se limita a hoy', () => {
    const r = rangoDePeriodo('otono', HOY_OTONO);
    expect(r.desde).toBe('2026-03-21');
    expect(r.hasta).toBe('2026-04-15');
  });

  it('primavera: dentro de temporada, hasta se limita a hoy', () => {
    const r = rangoDePeriodo('primavera', HOY_PRIMAVERA);
    expect(r.desde).toBe('2026-09-23');
    expect(r.hasta).toBe('2026-10-15');
  });

  it('verano: cruza el año, hoy en enero cae dentro del verano iniciado en diciembre anterior', () => {
    const r = rangoDePeriodo('verano', HOY_VERANO); // 15 ene 2026
    expect(r.desde).toBe('2025-12-21');
    expect(r.hasta).toBe('2026-01-15');
  });

  it('verano: fuera de temporada (ej. en invierno) devuelve el verano ya terminado más reciente', () => {
    const r = rangoDePeriodo('verano', HOY_INVIERNO); // 15 jul 2026
    expect(r.desde).toBe('2025-12-21');
    expect(r.hasta).toBe('2026-03-20');
  });

  it('invierno: fuera de temporada (ej. en verano) devuelve el invierno ya terminado más reciente', () => {
    const r = rangoDePeriodo('invierno', HOY_VERANO); // 15 ene 2026
    expect(r.desde).toBe('2025-06-21');
    expect(r.hasta).toBe('2025-09-22');
  });
});
