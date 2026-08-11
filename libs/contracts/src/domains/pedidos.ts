import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
  ArrayMinSize,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export const PedidoEstado = {
  Pendiente: 'PENDIENTE',
  EnPreparacion: 'EN_PREPARACION',
  Listo: 'LISTO',
  Entregado: 'ENTREGADO',
  Pagado: 'PAGADO',
  Cancelado: 'CANCELADO',
  /** Compensación de la saga de stock: el descuento real falló en Inventario. */
  RechazadoSinStock: 'RECHAZADO_SIN_STOCK',
} as const;

export type PedidoEstado = (typeof PedidoEstado)[keyof typeof PedidoEstado];

export const ItemArea = {
  Cocina: 'COCINA',
  Bar: 'BAR',
} as const;

export type ItemArea = (typeof ItemArea)[keyof typeof ItemArea];

/**
 * Estados válidos de un ítem individual (producción en cocina).
 * Subconjunto de PedidoEstado: un ítem nunca está PAGADO. CANCELADO sí
 * aplica a nivel de ítem (T-anular-item): el mesero anula un plato/bebida
 * puntual sin cancelar el resto del pedido.
 */
export const EstadoItem = {
  Pendiente: 'PENDIENTE',
  EnPreparacion: 'EN_PREPARACION',
  Listo: 'LISTO',
  Entregado: 'ENTREGADO',
  /** El ítem no pudo descontarse del stock real (compensación de saga). */
  RechazadoSinStock: 'RECHAZADO_SIN_STOCK',
  /** El mesero anuló el ítem a pedido del cliente (ya no se prepara ni se cobra). */
  Cancelado: 'CANCELADO',
} as const;

export type EstadoItem = (typeof EstadoItem)[keyof typeof EstadoItem];

export class PedidoItemDto {
  @IsString()
  id: string;
  @IsString()
  productoId: string;
  @IsString()
  nombre: string;
  @IsNumber()
  cantidad: number;
  @IsNumber()
  precioUnitario: number;
  @IsOptional()
  @IsEnum(ItemArea)
  area?: ItemArea;
  @IsOptional()
  @IsString()
  notas?: string;
  @IsOptional()
  @IsEnum(EstadoItem)
  estado?: EstadoItem;
  @IsOptional()
  @IsString()
  meseroId?: string;
  @IsOptional()
  @IsString()
  meseroNombre?: string;
}

export class PedidoDto {
  @IsString()
  id: string;
  @IsString()
  mesaId: string;
  @IsString()
  sedeId: string;
  @IsOptional()
  @IsNumber()
  numeroMesa?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PedidoItemDto)
  items: PedidoItemDto[];
  @IsNumber()
  total: number;
  @IsEnum(PedidoEstado)
  estado: PedidoEstado;
  @IsOptional()
  @IsString()
  cliente?: string;
  @IsOptional()
  @IsString()
  telefono?: string;
  @IsOptional()
  @IsString()
  direccion?: string;
  @IsOptional()
  @IsString()
  proveedor?: string;
  @IsOptional()
  @IsString()
  modalidad?: string;
  @IsOptional()
  @IsString()
  meseroId?: string;
  @IsOptional()
  @IsString()
  meseroNombre?: string;
  @IsString()
  createdAt: string;
}

export type PedidoSnapshotItem = Pick<
  PedidoItemDto,
  'productoId' | 'nombre' | 'cantidad' | 'precioUnitario'
> &
  Partial<
    Pick<
      PedidoItemDto,
      'id' | 'area' | 'notas' | 'estado' | 'meseroId' | 'meseroNombre'
    >
  > & {
    comensal?: number;
    identificadorComensal?: number;
  };

export type PedidoSnapshot = Pick<
  PedidoDto,
  | 'id'
  | 'mesaId'
  | 'items'
  | 'total'
  | 'estado'
  | 'createdAt'
  | 'meseroId'
  | 'meseroNombre'
> & {
  items: PedidoSnapshotItem[];
  numeroMesa?: number;
  cliente?: string;
  telefono?: string;
  direccion?: string;
  proveedor?: string;
  modalidad?: string;
};

export class ListarPedidosQuery {
  @IsOptional()
  @IsString()
  mesaId?: string;
  @IsOptional()
  @IsString()
  sedeId?: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
  @IsOptional()
  @IsString()
  cursor?: string;
  @IsOptional()
  @IsEnum(PedidoEstado)
  estado?: PedidoEstado;
  @IsOptional()
  @IsDateString()
  updatedSince?: string;
}

export class PedidoListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PedidoDto)
  data: PedidoDto[];
  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class PedidoItemInput {
  @IsOptional()
  @IsString()
  id?: string;
  @IsString()
  @IsNotEmpty()
  productoId: string;
  @IsNumber()
  cantidad: number;
  @IsOptional()
  @IsEnum(ItemArea)
  area?: ItemArea;
  @IsOptional()
  @IsString()
  notas?: string;
  @IsOptional()
  @IsEnum(EstadoItem)
  estado?: EstadoItem;
  @IsOptional()
  @IsNumber()
  identificadorComensal?: number;
}

export class CrearPedidoCommand {
  @IsString()
  @IsNotEmpty()
  mesaId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PedidoItemInput)
  items: PedidoItemInput[];
  @IsOptional()
  @IsString()
  cliente?: string;
  @IsOptional()
  @IsString()
  telefono?: string;
  @IsOptional()
  @IsString()
  direccion?: string;
  @IsOptional()
  @IsString()
  proveedor?: string;
  @IsOptional()
  @IsString()
  modalidad?: string;
}

export class ActualizarEstadoPedidoCommand {
  @IsEnum(PedidoEstado)
  estado: PedidoEstado;
}

export class ActualizarEstadoItemCommand {
  @IsEnum(EstadoItem)
  estado: EstadoItem;
}

export class PedidoCreadoPayload {
  @Type(() => PedidoDto)
  @ValidateNested()
  pedido: PedidoDto;
}

export class PedidoListoPayload {
  @IsString()
  pedidoId: string;
  @IsString()
  mesaId: string;
}

export class PedidoActualizadoPayload {
  @Type(() => PedidoDto)
  @ValidateNested()
  pedido: PedidoDto;
}

/** Aviso a cocina (KDS): un mesero anuló un ítem de área COCINA a pedido
 * del cliente — items de BAR no lo emiten, cocina no necesita saberlo. */
export class PedidoItemAnuladoPayload {
  @IsString()
  pedidoId: string;
  @IsString()
  itemId: string;
  @IsString()
  productoNombre: string;
  @IsOptional()
  @IsString()
  mesaId?: string | null;
}
