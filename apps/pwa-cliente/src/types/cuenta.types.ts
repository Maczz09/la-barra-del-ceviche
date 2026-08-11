// types/cuenta.types.ts - DTOs y ViewModels de cuentas/caja
// Basado en libs/contracts/src/domains/cuentas.ts y caja.ts

import type { PedidoDto, PedidoVM } from './pedido.types';

export const CuentaEstado = {
  Abierta: 'ABIERTA',
  Cerrada: 'CERRADA',
  Pagada: 'PAGADA',
} as const;

export type CuentaEstado = (typeof CuentaEstado)[keyof typeof CuentaEstado];

export const MetodoPago = {
  Efectivo: 'EFECTIVO',
  Tarjeta: 'TARJETA',
  Transferencia: 'TRANSFERENCIA',
  Yape: 'YAPE',
  Plin: 'PLIN',
} as const;

export type MetodoPago = (typeof MetodoPago)[keyof typeof MetodoPago];

export interface CuentaDto {
  id: string;
  mesaId: string;
  pedidos: PedidoDto[];
  total: number;
  estado: CuentaEstado;
  ticket?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketItemDto {
  productoId?: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  notas?: string;
}

export interface TicketDto {
  id: string;
  cuentaId: string;
  mesaId: string;
  items: TicketItemDto[];
  subtotal: number;
  descuento: number;
  total: number;
  fecha: string;
}

export interface CuentaVM {
  id: string;
  mesaId: string;
  pedidos: PedidoVM[];
  total: number;
  estado: CuentaEstado;
  estadoLabel: string;
  ticket: string | null;
  createdAt: string;
  updatedAt: string;
  cantidadPedidos: number;
  cantidadItems: number;
}

export interface AbrirCuentaResponse {
  message: string;
  cuenta: CuentaDto;
}

export interface CerrarCuentaPayload {
  descuento?: number;
}

export interface CerrarCuentaResponse {
  message: string;
  ticket: TicketDto;
}

export interface DividirCuentaPayload {
  metodo: 'IGUALES' | 'POR_ITEMS';
  numPartes?: number;
}

export interface DividirCuentaResponse {
  metodo: 'IGUALES' | 'POR_ITEMS';
  partes: Array<{ parte?: number; comensal?: number; monto: number }>;
}

export interface RegistrarPagoPayload {
  cuentaId: string;
  montoRecibido: number;
  metodo: MetodoPago;
  descuento?: number;
  propina?: number;
  mesaNumero?: string;
  /** Números de las mesas hermanas si la mesa cobrada está unida a otra(s) (ej. "6"). */
  mesaUnidaCon?: string;
}

export interface TransaccionDto {
  id: string;
  cuentaId: string;
  monto: number;
  descuento?: number;
  metodo: string;
  referencia?: string | null;
  notas?: string | null;
  usuarioId?: string | null;
  cajeroNombre?: string | null;
  createdAt: string;
}

export interface RegistrarPagoResponse {
  message?: string;
  transaccion: TransaccionDto;
  ticket?: TicketDto;
  // Saldo que queda por cobrar de la cuenta tras este pago; 0 cuando el pago
  // (parcial o único) completó el total y la cuenta quedó cerrada.
  pendiente?: number;
}
