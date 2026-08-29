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
  AnularItemPreparadoCommand,
  AnularAtencionMesaCommand,
  AnularPedidoCommand,
  AnularAtencionMesaResultado as ContractAnularAtencionMesaResultado,
  AnulacionAuditoriaDto as ContractAnulacionAuditoriaDto,
  ListarAnulacionesQuery,
  ActualizarAnulacionCommand,
  InvalidarAnulacionCommand,
  TipoAnulacion as ContractTipoAnulacion,
  EstadoPlatoAnulacion as ContractEstadoPlatoAnulacion,
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
  /** Código legible de la atención ("A0000001"). Puede tardar unos ms en
   *  aparecer tras crear el pedido (backfill asíncrono), o estar ausente en
   *  pedidos de cuentas anteriores a este campo. */
  cuentaCorrelativo?: string;
}

// ─── Payloads de creación ───────────────────────────────────────
export type CrearPedidoItemPayload = PedidoItemInput;
export type CrearPedidoPayload = CrearPedidoCommand;
export type ActualizarEstadoPedidoPayload = ActualizarEstadoPedidoCommand;
export type ActualizarEstadoItemPayload = ActualizarEstadoItemCommand;

// ─── CU-01/CU-02: anulación de ítems ya preparados / atención de mesa ────
export type AnularItemPreparadoPayload = AnularItemPreparadoCommand;
export type AnularAtencionMesaPayload = AnularAtencionMesaCommand;
export type AnularAtencionMesaResultado = ContractAnularAtencionMesaResultado;
// Anular UN pedido puntual desde el tablero de Pedidos (no toda la mesa) —
// mismo shape que AnularAtencionMesaPayload, endpoint distinto.
export type AnularPedidoPayload = AnularPedidoCommand;

export interface AnularItemPreparadoResponse {
  message: string;
  pedido: PedidoDto;
}

export interface AnularAtencionMesaResponse {
  message: string;
  resultado: AnularAtencionMesaResultado;
}

export interface AnularPedidoResponse {
  message: string;
  pedido: PedidoDto;
}

// ─── CU-05: Auditoría de Anulaciones ─────────────────────────────
export const TipoAnulacion = {
  Item: 'ITEM',
  Mesa: 'MESA',
} as const satisfies Record<string, ContractTipoAnulacion>;
export type TipoAnulacion = ContractTipoAnulacion;

export const EstadoPlatoAnulacion = {
  SinPreparar: 'SIN_PREPARAR',
  Preparado: 'PREPARADO',
} as const satisfies Record<string, ContractEstadoPlatoAnulacion>;
export type EstadoPlatoAnulacion = ContractEstadoPlatoAnulacion;

export type AnulacionAuditoriaDto = ContractAnulacionAuditoriaDto;
export type ListarAnulacionesPayload = ListarAnulacionesQuery;
export type ActualizarAnulacionPayload = ActualizarAnulacionCommand;
export type InvalidarAnulacionPayload = InvalidarAnulacionCommand;

export interface AnulacionesResponse {
  anulaciones: AnulacionAuditoriaDto[];
}

export interface AnulacionResponse {
  message: string;
  anulacion: AnulacionAuditoriaDto;
}

export interface AnulacionAuditoriaVM {
  id: string;
  /** Código legible propio de este registro ("AN0000001"), independiente de la atención. */
  correlativo: string | null;
  fechaLabel: string;
  mesaNumero: number | null;
  pedidoId: string;
  /** Código legible de la atención ("A0000001") a la que pertenecía el pedido anulado. */
  cuentaCorrelativo: string | null;
  tipo: TipoAnulacion;
  tipoLabel: string;
  productoNombre: string | null;
  cantidad: number | null;
  estadoPlato: EstadoPlatoAnulacion;
  cobrado: boolean;
  montoAnulado: number;
  montoLabel: string;
  motivo: string;
  observacion: string | null;
  usuarioNombre: string | null;
  clienteNombre: string | null;
  invalidada: boolean;
  invalidadaMotivo: string | null;
  invalidadaPorNombre: string | null;
}
