// domain/comanda.ts — Lógica pura de la toma de pedido (comanda) del Comandero.
// Reducers de líneas, totales, validación de contexto y armado del payload, sin
// React: testeable de forma aislada y reutilizable. Espejo de las reglas que el
// Comandero aplicaba inline antes de T-22.

import type { ProductoVM } from '../types/inventario.types';
import type { CrearPedidoItemPayload } from '../types/pedido.types';
import type { Canal } from './pedido.flow';

export interface CartLine {
  producto: ProductoVM;
  cantidad: number;
  notas: string;
  noteOpen: boolean;
}

/** Mesas virtuales del backend para canales no-salón. */
export const MESA_DELIVERY_NUM = 99;
export const MESA_LLEVAR_NUM = 98;

/** IGV peruano incluido en el precio (18%). */
const IGV_FACTOR = 1.18;

// ─── Reducers de líneas (puros: reciben y devuelven CartLine[]) ──────────────
export function addProducto(lines: CartLine[], prod: ProductoVM): CartLine[] {
  const ex = lines.find((l) => l.producto.id === prod.id);
  if (ex) return lines.map((l) => (l === ex ? { ...l, cantidad: l.cantidad + 1 } : l));
  return [...lines, { producto: prod, cantidad: 1, notas: '', noteOpen: false }];
}

export function incLine(lines: CartLine[], id: string, d: number): CartLine[] {
  return lines.flatMap((l) => {
    if (l.producto.id !== id) return [l];
    return l.cantidad + d <= 0 ? [] : [{ ...l, cantidad: l.cantidad + d }];
  });
}

export function delLine(lines: CartLine[], id: string): CartLine[] {
  return lines.filter((l) => l.producto.id !== id);
}

export function setNota(lines: CartLine[], id: string, notas: string): CartLine[] {
  return lines.map((l) => (l.producto.id === id ? { ...l, notas } : l));
}

export function toggleNote(lines: CartLine[], id: string): CartLine[] {
  return lines.map((l) => (l.producto.id === id ? { ...l, noteOpen: !l.noteOpen } : l));
}

/** Agrega una nota rápida sin duplicarla en la nota existente. */
export function appendNotaRapida(notas: string, n: string): string {
  if (!notas) return n;
  return notas.includes(n) ? notas : `${notas}, ${n}`;
}

// ─── Derivados ───────────────────────────────────────────────────────────────
export interface Totales {
  subtotal: number;
  igv: number;
  totalItems: number;
}

export function calcTotales(lines: CartLine[]): Totales {
  const subtotal = lines.reduce((s, l) => s + l.producto.precio * l.cantidad, 0);
  return {
    subtotal,
    igv: subtotal - subtotal / IGV_FACTOR,
    totalItems: lines.reduce((s, l) => s + l.cantidad, 0),
  };
}

// ─── Validación de contexto por canal ────────────────────────────────────────
export interface ContextoCampos {
  effectiveMesaId: string;
  cliente: string;
  dir: string;
}

export function contextoValido(canal: Canal, c: ContextoCampos): boolean {
  if (canal === 'SALON') return !!c.effectiveMesaId;
  if (canal === 'DELIVERY') return c.cliente.trim() !== '' && c.dir.trim() !== '';
  return c.cliente.trim() !== '';
}

// ─── Armado del payload de envío ─────────────────────────────────────────────
// El backend recalcula `area` de forma autoritativa a partir del stock del
// producto (ver validarYMapearItems en servicio-pedidos) — este campo es solo
// para que el payload sea coherente, no se confía en él del lado servidor.
export function buildItems(lines: CartLine[]): CrearPedidoItemPayload[] {
  return lines.map((l) => ({
    productoId: l.producto.id,
    cantidad: l.cantidad,
    area: l.producto.stockActual != null ? 'BAR' : 'COCINA',
    notas: l.notas || '',
  }));
}

/** Resuelve la mesa destino (física en SALON, virtual en DELIVERY/LLEVAR). */
export function resolveTargetMesaId(
  canal: Canal,
  effectiveMesaId: string,
  mesas: { id: string; numeroRaw: number }[],
): string {
  if (canal === 'SALON') return effectiveMesaId;
  const num = canal === 'DELIVERY' ? MESA_DELIVERY_NUM : MESA_LLEVAR_NUM;
  return mesas.find((m) => m.numeroRaw === num)?.id ?? '';
}
