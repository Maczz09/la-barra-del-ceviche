import { describe, expect, it } from 'vitest';
import { GUIDES } from './catalog';

/** Evaluación local del contenido crítico: no requiere cuentas ni datos reales. */
describe('evaluación de cobertura del tutorial', () => {
  it('explica los flujos de pedido, cocina, cobro y emisión sin acciones automáticas', () => {
    const text = ['pedidos', 'cocina', 'caja', 'facturacion']
      .flatMap((route) => GUIDES[route as keyof typeof GUIDES].steps)
      .map((step) => `${step.title} ${step.description}`.toLowerCase())
      .join(' ');
    for (const concept of ['comanda', 'estado', 'cuenta', 'boleta', 'factura', 'sunat']) {
      expect(text).toContain(concept);
    }
    expect(text).toMatch(/no realiza anulaciones/);
    expect(text).toMatch(/no enviará documentos/);
  });
});
