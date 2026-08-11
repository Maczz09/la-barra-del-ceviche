// types/pedido.types.ts — DTOs y ViewModels de pedidos
// DTOs derivados de @org/contracts; ViewModels propios de la UI.

import type {
  ActualizarEstadoPedidoCommand,
  ActualizarEstadoItemCommand,
  CrearPedidoCommand,
  ItemArea as ContractItemArea,
  EstadoItem as ContractEstadoItem,
  ListarPedidosQuery,
  PedidoDto as ContractPedidoDto,
  PedidoEstado as ContractEstadoPedido,
  PedidoItemDto as ContractPedidoItemDto,
  PedidoListResponse as ContractPedidoListResponse,
  PedidoItemInput,
} from '@org/contracts';
import type { Canal } from '../domain/pedido.flow';

// ─── Enums ──────────────────────────────────────────────────────
export const EstadoPedido = {
  Pendiente: 'PENDIENTE',
  EnPreparacion: 'EN_PREPARACION',
  Listo: 'LISTO',
  Entregado: 'ENTREGADO',
  Pagado: 'PAGADO',
  Cancelado: 'CANCELADO',
} as const satisfies Record<string, ContractEstadoPedido>;

export type EstadoPedido = ContractEstadoPedido;

export const EstadoItem = {
  Pendiente: 'PENDIENTE',
  EnPreparacion: 'EN_PREPARACION',
  Listo: 'LISTO',
  Entregado: 'ENTREGADO',
  Cancelado: 'CANCELADO',
} as const satisfies Record<string, ContractEstadoItem>;

export type EstadoItem = ContractEstadoItem;

export const ItemArea = {
  Cocina: 'COCINA',
  Bar: 'BAR',
} as const satisfies Record<string, ContractItemArea>;

export type ItemArea = ContractItemArea;

// ─── DTO del backend ────────────────────────────────────────────
export type PedidoItemDto = ContractPedidoItemDto;
export type PedidoDto = ContractPedidoDto;
export type PedidoListQuery = ListarPedidosQuery;
export type PedidoListResponse = ContractPedidoListResponse;

// ─── ViewModels para la UI ──────────────────────────────────────
export interface PedidoItemVM {
  id: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  area: ItemArea;
  notas: string;
  estado: EstadoItem;
  /** Clase CSS del badge de estado */
  estadoClass: string;
  /** Label legible */
  estadoLabel: string;
}

export interface PedidoVM {
  id: string;
  mesaId: string;
  mesaNumero: string;        // "01", "02"
  items: PedidoItemVM[];
  total: number;
  estado: EstadoPedido;
  estadoClass: string;
  estadoLabel: string;
  createdAt: string;
  meseroId?: string;
  meseroNombre?: string;
  cliente?: string;
  telefono?: string;
  direccion?: string;
  proveedor?: string;
  modalidad?: string;
  /** Canal normalizado derivado de `modalidad`. */
  canal: Canal;
  cantidadItems: number;
}

// ─── Payloads de creación ───────────────────────────────────────
export type CrearPedidoItemPayload = PedidoItemInput;
export type CrearPedidoPayload = CrearPedidoCommand;
export type ActualizarEstadoPedidoPayload = ActualizarEstadoPedidoCommand;
export type ActualizarEstadoItemPayload = ActualizarEstadoItemCommand;
