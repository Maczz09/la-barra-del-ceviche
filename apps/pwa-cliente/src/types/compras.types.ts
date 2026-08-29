// types/compras.types.ts - DTOs y ViewModels de Compras (proveedores, insumos,
// órdenes de compra, recepciones y comprobantes). Los DTOs vienen directo de
// @org/contracts: el backend y el frontend comparten la misma forma.

import type {
  ActualizarInsumoCommand,
  ActualizarOrdenCompraCommand,
  ActualizarProveedorCommand,
  ComprobanteCompraDto as ContractComprobanteCompraDto,
  CrearInsumoCommand,
  CrearOrdenCompraCommand,
  CrearProveedorCommand,
  InsumoDto as ContractInsumoDto,
  ActualizarCategoriaInsumoCommand,
  CategoriaInsumoDto as ContractCategoriaInsumoDto,
  ConteoInsumosResultadoDto as ContractConteoInsumosResultadoDto,
  CrearCategoriaInsumoCommand,
  ConteoInsumoDiferenciaDto as ContractConteoInsumoDiferenciaDto,
  ListarInsumosQuery,
  ListarMovimientosInsumoQuery,
  ListarOrdenesQuery,
  MovimientoInsumoDto as ContractMovimientoInsumoDto,
  MovimientoInsumoTipo as ContractMovimientoInsumoTipo,
  MovimientoInsumoTipoManual as ContractMovimientoInsumoTipoManual,
  RegistrarConteoInsumosCommand,
  RegistrarMovimientoInsumoCommand,
  ListarProveedoresQuery,
  OrdenCompraDto as ContractOrdenCompraDto,
  OrdenCompraEstado as ContractOrdenCompraEstado,
  OrdenCompraItemDto as ContractOrdenCompraItemDto,
  ProveedorDto as ContractProveedorDto,
  RecepcionCompraDto as ContractRecepcionCompraDto,
  RegistrarRecepcionCommand,
  ResumenComprasDto as ContractResumenComprasDto,
} from '@org/contracts';

export const OrdenCompraEstado = {
  Borrador: 'BORRADOR',
  Enviada: 'ENVIADA',
  Parcial: 'PARCIAL',
  Recibida: 'RECIBIDA',
  Anulada: 'ANULADA',
} as const satisfies Record<string, ContractOrdenCompraEstado>;
export type OrdenCompraEstado = ContractOrdenCompraEstado;

export type ProveedorDto = ContractProveedorDto;
export type InsumoDto = ContractInsumoDto;
export type OrdenCompraDto = ContractOrdenCompraDto;
export type OrdenCompraItemDto = ContractOrdenCompraItemDto;
export type RecepcionCompraDto = ContractRecepcionCompraDto;
export type ComprobanteCompraDto = ContractComprobanteCompraDto;
export type ResumenComprasDto = ContractResumenComprasDto;

export type ProveedorListQuery = ListarProveedoresQuery;
export type InsumoListQuery = ListarInsumosQuery;
export type OrdenListQuery = ListarOrdenesQuery;

export type CrearProveedorPayload = CrearProveedorCommand;
export type ActualizarProveedorPayload = ActualizarProveedorCommand;
export type CrearInsumoPayload = CrearInsumoCommand;
export type ActualizarInsumoPayload = ActualizarInsumoCommand;
export type CrearOrdenPayload = CrearOrdenCompraCommand;
export type ActualizarOrdenPayload = ActualizarOrdenCompraCommand;
export type RegistrarRecepcionPayload = RegistrarRecepcionCommand;

// ── Categorías del almacén de cocina (T-50) ──────────────────────
// Taxonomía PROPIA del almacén: no son las CategoriaDto de la carta, que
// ordenan lo que se vende y viven en otro servicio.

export type CategoriaInsumoDto = ContractCategoriaInsumoDto;
export type CrearCategoriaInsumoPayload = CrearCategoriaInsumoCommand;
export type ActualizarCategoriaInsumoPayload = ActualizarCategoriaInsumoCommand;

// ── Movimientos de insumo / almacén de cocina (T-50) ──────────────

export const MovimientoInsumoTipo = {
  EntradaCompra: 'ENTRADA_COMPRA',
  EntradaManual: 'ENTRADA_MANUAL',
  EntradaDevolucion: 'ENTRADA_DEVOLUCION',
  SalidaConsumo: 'SALIDA_CONSUMO',
  SalidaMerma: 'SALIDA_MERMA',
  AjusteConteo: 'AJUSTE_CONTEO',
} as const satisfies Record<string, ContractMovimientoInsumoTipo>;
export type MovimientoInsumoTipo = ContractMovimientoInsumoTipo;

/** Los tipos que se registran a mano. ENTRADA_COMPRA la escribe solo la
 *  recepción de una OC, y AJUSTE_CONTEO solo el cuadre en lote. */
export type MovimientoInsumoTipoManual = ContractMovimientoInsumoTipoManual;

export type MovimientoInsumoDto = ContractMovimientoInsumoDto;
export type ConteoInsumosResultadoDto = ContractConteoInsumosResultadoDto;
export type ConteoInsumoDiferenciaDto = ContractConteoInsumoDiferenciaDto;
export type RegistrarMovimientoInsumoPayload = RegistrarMovimientoInsumoCommand;
export type RegistrarConteoInsumosPayload = RegistrarConteoInsumosCommand;
export type ListarMovimientosInsumoPayload = ListarMovimientosInsumoQuery;

// ── ViewModels (campos derivados para la UI) ──────────────────────

export interface ProveedorVM extends ProveedorDto {
  iniciales: string;
}

export interface InsumoVM extends InsumoDto {
  bajoMinimo: boolean;
}

export interface OrdenCompraItemVM extends OrdenCompraItemDto {
  pendiente: number;
  subtotal: number;
}

export interface OrdenCompraVM extends Omit<OrdenCompraDto, 'items'> {
  items: OrdenCompraItemVM[];
  estadoLabel: string;
  estadoClass: string;
  fechaEmisionLabel: string;
  fechaEntregaLabel: string;
  puedeEnviar: boolean;
  puedeRecibir: boolean;
  puedeCerrar: boolean;
  puedeAnular: boolean;
  puedeEditar: boolean;
}

export interface MovimientoInsumoVM extends MovimientoInsumoDto {
  tipoLabel: string;
  tipoClass: string;
  /** Delta con signo explícito ("−2.5 kg" / "+10 kg"): en un kardex el sentido
   *  del movimiento tiene que leerse de un vistazo. */
  deltaLabel: string;
  esSalida: boolean;
  costoTotalLabel: string;
  fechaLabel: string;
}

export interface OrdenDetalle {
  orden: OrdenCompraDto;
  recepciones: RecepcionCompraDto[];
  comprobantes: ComprobanteCompraDto[];
}
