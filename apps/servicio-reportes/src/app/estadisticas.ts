// app/estadisticas.ts — media/mediana/moda del tamaño de ticket (venta por
// cuenta cerrada), para que el dueño vea no solo el promedio (ya lo tenía
// como "ticket promedio") sino cuánto varía: la mediana no se deja arrastrar
// por una cuenta enorme puntual, y la moda muestra el monto que más se repite
// (a menudo un combo o precio de carta fijo).

export interface EstadisticasTicket {
  media: number;
  mediana: number;
  // null: no hay un monto que se repita más que otro (todas las ventas
  // distintas, o sin ventas) — mostrar "moda" ahí sería engañoso.
  moda: number | null;
}

export function calcularEstadisticasTicket(valores: number[]): EstadisticasTicket {
  if (valores.length === 0) return { media: 0, mediana: 0, moda: null };

  // Redondeo a centavos ANTES de comparar: son montos en soles, la moda no
  // tiene sentido comparando floats con error de precisión binaria.
  const redondeados = valores.map((v) => Math.round(v * 100) / 100);
  const ordenados = [...redondeados].sort((a, b) => a - b);

  const media = redondeados.reduce((suma, v) => suma + v, 0) / redondeados.length;

  const mitad = Math.floor(ordenados.length / 2);
  const mediana = ordenados.length % 2 !== 0
    ? ordenados[mitad]
    : (ordenados[mitad - 1] + ordenados[mitad]) / 2;

  const frecuencias = new Map<number, number>();
  for (const v of redondeados) frecuencias.set(v, (frecuencias.get(v) ?? 0) + 1);
  let moda: number | null = null;
  let maxFrecuencia = 1; // frecuencia 1 = ningún monto se repite → sin moda
  for (const [valor, frecuencia] of frecuencias) {
    if (frecuencia > maxFrecuencia) {
      maxFrecuencia = frecuencia;
      moda = valor;
    }
  }

  return {
    media: Math.round(media * 100) / 100,
    mediana: Math.round(mediana * 100) / 100,
    moda,
  };
}
