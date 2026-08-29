// types/inventario.types.ts - DTOs y ViewModels de inventario

import type {
  CategoriaDto as ContractCategoriaDto,
  CrearCategoriaCommand,
  ActualizarCategoriaCommand,
  CrearProductoCommand,
  ActualizarProductoCommand,
  ListarProductosQuery,
  ProductoDto as ContractProductoDto,
  ProductoListResponse as ContractProductoListResponse,
  MenuDiarioItemDto as ContractMenuDiarioItemDto,
  AgregarAlMenuCommand,
  ActualizarMenuDiarioCommand,
  MermaDto as ContractMermaDto,
  RegistrarMermaCommand,
  ActualizarMermaCommand,
  EliminarMermaCommand,
  ListarMermasQuery,
  MermaOrigen as ContractMermaOrigen,
} from '@org/contracts';

export type CategoriaDto = ContractCategoriaDto;
export type CrearCategoriaPayload = CrearCategoriaCommand;
export type ActualizarCategoriaPayload = ActualizarCategoriaCommand;
export type ProductoDto = ContractProductoDto;
export type ProductoListQuery = ListarProductosQuery;
export type ProductoListResponse = ContractProductoListResponse;

export interface ProductoVM {
  id: string;
  categoriaId: string;
  categoriaNombre: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  precioLabel: string;
  disponible: boolean;
  stockActual: number | null;
  stockLabel: string;
  stockClass: string;
}

export type CrearProductoPayload = CrearProductoCommand;
export type ActualizarProductoPayload = ActualizarProductoCommand;

export interface ProductoResponse {
  message: string;
  producto: ProductoDto;
}

export interface CategoriasResponse {
  categorias: CategoriaDto[];
}

export interface CategoriaResponse {
  message: string;
  categoria: CategoriaDto;
}

export interface ProductosResponse {
  productos: ProductoDto[];
}

// --- Menú del día (T-20) ---

export type MenuDiarioItemDto = ContractMenuDiarioItemDto;
export type AgregarAlMenuPayload = AgregarAlMenuCommand;
export type ActualizarMenuDiarioPayload = ActualizarMenuDiarioCommand;

export interface MenuDiarioResponse {
  menu: MenuDiarioItemDto[];
}

export interface MenuDiarioItemResponse {
  message: string;
  item: MenuDiarioItemDto;
}

export interface MenuDiarioItemVM {
  /** id del registro de menú del día (para activar/desactivar/quitar) */
  id: string;
  /** disponibilidad EN EL MENÚ de hoy — no confundir con producto.disponible */
  disponible: boolean;
  /** producto completo (mismo VM que la carta) — se pasa directo a cmd.addProducto */
  producto: ProductoVM;
}

// --- Merma de inventario (T-22, CU-01..CU-04) ---

export const MermaOrigen = {
  DescarteManual: 'DESCARTE_MANUAL_INVENTARIO',
  AnulacionNoCobrada: 'ANULACION_COMANDA_NO_COBRADA',
  AnulacionCobrada: 'ANULACION_COMANDA_COBRADA',
} as const satisfies Record<string, ContractMermaOrigen>;
export type MermaOrigen = ContractMermaOrigen;

export type MermaDto = ContractMermaDto;
export type RegistrarMermaPayload = RegistrarMermaCommand;
export type ActualizarMermaPayload = ActualizarMermaCommand;
export type EliminarMermaPayload = EliminarMermaCommand;
export type MermaListQuery = ListarMermasQuery;

export interface MermasResponse {
  mermas: MermaDto[];
}

export interface MermaResponse {
  message: string;
  merma: MermaDto;
}

export interface MermaVM {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  motivo: string;
  observacion: string | null;
  origen: MermaOrigen;
  origenLabel: string;
  costoUnitario: number | null;
  costoTotal: number | null;
  costoTotalLabel: string;
  usuarioNombre: string | null;
  fechaLabel: string;
  /** Código de la atención origen ("A0000001"). Ausente en mermas manuales
   *  o si el pedido origen no tenía correlativo todavía. */
  cuentaCorrelativo: string | null;
}
