import { calcularEstadisticasTicket } from './estadisticas';

describe('calcularEstadisticasTicket', () => {
  it('sin ventas, devuelve todo en cero y moda null', () => {
    expect(calcularEstadisticasTicket([])).toEqual({ media: 0, mediana: 0, moda: null });
  });

  it('con una sola venta, media/mediana son ese valor y no hay moda significativa', () => {
    expect(calcularEstadisticasTicket([45])).toEqual({ media: 45, mediana: 45, moda: null });
  });

  it('calcula la media como el promedio simple', () => {
    const { media } = calcularEstadisticasTicket([10, 20, 30]);
    expect(media).toBe(20);
  });

  it('mediana con cantidad impar de ventas: el valor del medio', () => {
    const { mediana } = calcularEstadisticasTicket([50, 10, 30]);
    expect(mediana).toBe(30);
  });

  it('mediana con cantidad par de ventas: el promedio de los 2 del medio', () => {
    const { mediana } = calcularEstadisticasTicket([10, 20, 30, 40]);
    expect(mediana).toBe(25);
  });

  it('la mediana no se deja arrastrar por una venta enorme puntual (a diferencia de la media)', () => {
    const { media, mediana } = calcularEstadisticasTicket([25, 28, 30, 500]);
    expect(media).toBeGreaterThan(100); // la venta de 500 sí infla la media
    expect(mediana).toBe(29); // (28+30)/2, la mediana ignora el outlier
  });

  it('sin ningún monto repetido, moda es null (no inventa un "más común" falso)', () => {
    const { moda } = calcularEstadisticasTicket([10, 20, 30]);
    expect(moda).toBeNull();
  });

  it('con un monto que se repite más que los demás, ese es la moda', () => {
    const { moda } = calcularEstadisticasTicket([15, 15, 15, 20, 25]);
    expect(moda).toBe(15);
  });

  it('redondea a centavos antes de comparar (evita que el error de punto flotante rompa la moda)', () => {
    // 0.1 + 0.2 no da exactamente 0.3 en floats — deben tratarse como el mismo monto.
    const { moda } = calcularEstadisticasTicket([0.1 + 0.2, 0.3, 0.3, 5]);
    expect(moda).toBe(0.3);
  });
});
