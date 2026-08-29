/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/caja/cajaMeta.ts — metadatos de método de pago + cálculo de KPIs del turno.

import type { IconName } from '../../components/ui/icons';
import type { MetodoPagoCaja, MovimientoCajaDto } from '../../types/caja.types';

export const METODO_META: Record<MetodoPagoCaja, { label: string; cls: string; ic: IconName; abbr: string; color: string }> = {
  EFECTIVO: { label: 'Efectivo', cls: 'efectivo', ic: 'Cash', abbr: 'EF', color: 'var(--ok)' },
  TARJETA: { label: 'Tarjeta', cls: 'tarjeta', ic: 'Card', abbr: 'TJ', color: 'var(--info)' },
  YAPE: { label: 'Yape', cls: 'yape', ic: 'Wallet', abbr: 'Y', color: '#6c2bd9' },
  PLIN: { label: 'Plin', cls: 'plin', ic: 'Wallet', abbr: 'P', color: '#0aa3c2' },
  TRANSFERENCIA: { label: 'Transferencia', cls: 'transfer', ic: 'Coins', abbr: 'TR', color: 'var(--text-2)' },
};

export const METODOS_ORDEN: MetodoPagoCaja[] = ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'TRANSFERENCIA'];

export interface CajaKpis {
  ventas: MovimientoCajaDto[];
  totalVentas: number;
  totalEgresos: number;
  totalIngresos: number;
  propinas: number;
  porMetodo: Record<MetodoPagoCaja, number>;
  comprobantes: number;
  pendientes: number;
  efectivoEsperado: number;
}

export type EstadoCuadre = 'ok' | 'faltante' | 'sobrante';

/** Compara lo contado contra lo esperado del arqueo (usado en vivo por
 * CierreDrawer y al reimprimir un cierre pasado desde HistorialCajaScreen). */
export function estadoCuadre(descuadre: number): EstadoCuadre {
  if (Math.abs(descuadre) < 0.005) return 'ok';
  return descuadre < 0 ? 'faltante' : 'sobrante';
}

export function computeKpis(movs: MovimientoCajaDto[], efectivoEsperado = 0): CajaKpis {
  const ventas = movs.filter((m) => m.tipo === 'VENTA');
  const ingresos = movs.filter((m) => m.tipo === 'INGRESO');
  const egresos = movs.filter((m) => m.tipo === 'EGRESO');
  const totalVentas = ventas.reduce((s, m) => s + m.monto, 0);
  const totalIngresos = ingresos.reduce((s, m) => s + m.monto, 0);
  const totalEgresos = egresos.reduce((s, m) => s + m.monto, 0); // negativo
  const propinas = movs.reduce((s, m) => s + (m.propina || 0), 0);

  const porMetodo = METODOS_ORDEN.reduce((acc, key) => {
    acc[key] = ventas.filter((m) => m.metodo === key).reduce((s, m) => s + m.monto, 0);
    return acc;
  }, {} as Record<MetodoPagoCaja, number>);

  const comprobantes = ventas.length;
  const pendientes = 0;

  return { ventas, totalVentas, totalIngresos, totalEgresos, propinas, porMetodo, comprobantes, pendientes, efectivoEsperado };
}
