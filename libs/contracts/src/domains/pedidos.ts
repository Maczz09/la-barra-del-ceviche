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
  IsBoolean,
  Min,
  Max,
  MinLength,
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
  /** Producto de Inventario (con control de stock): el mesero lo sirve
   * directo, sin pasar por ninguna estación de producción. */
  Directo: 'DIRECTO',
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
  // Código legible de la atención ("A0000001") — llega por backfill
  // asíncrono desde servicio-cuentas, puede tardar unos ms tras crear el
  // pedido o quedar ausente en pedidos de cuentas anteriores a este campo.
  @IsOptional()
  @IsString()
  cuentaCorrelativo?: string;
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
  // Busca por el código de la atención ("A0000001" o un fragmento).
  @IsOptional()
  @IsString()
  search?: string;
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
  /** Solo aplica cuando estado=CANCELADO (Caso A: aún no se preparó) — queda
   * en el registro de Auditoría de Anulaciones igual que CU-01. Opcional
   * para no romper el resto de transiciones, que no usan este campo. */
  @IsOptional()
  @IsString()
  motivo?: string;
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
  @IsOptional()
  @IsString()
  motivo?: string | null;
}

/**
 * CU-01/CU-02: un ítem YA preparado/servido se anula. La pérdida física es
 * real haya cobro o no (el plato/producto ya salió), así que Inventario
 * siempre registra una merma — solo cambia el `origen` según `cobrado`.
 */
export class PedidoItemAnuladoConMermaPayload {
  @IsOptional()
  @IsString()
  eventId?: string;
  @IsString()
  pedidoId: string;
  @IsString()
  itemId: string;
  @IsString()
  productoId: string;
  @IsString()
  productoNombre: string;
  @IsNumber()
  cantidad: number;
  @IsString()
  motivo: string;
  @IsOptional()
  @IsString()
  observacion?: string;
  @IsBoolean()
  cobrado: boolean;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  // Código legible de la atención ("A0000001") del pedido origen — se
  // denormaliza en la Merma que crea servicio-inventario al consumir esto.
  @IsOptional()
  @IsString()
  cuentaCorrelativo?: string | null;
}

// ─── CU-01: anular un ítem YA preparado/servido ──────────────────────────

/**
 * Body de POST /pedidos/items/:itemId/anular-preparado. Solo aplica cuando
 * el ítem ya no está PENDIENTE (empezó a prepararse, o es de Inventario y
 * por lo tanto nació ENTREGADO) — para un ítem PENDIENTE se usa el endpoint
 * genérico de cambio de estado (CANCELADO), sin merma ni cobro de por medio.
 */
export class AnularItemPreparadoCommand {
  @IsString()
  @IsNotEmpty()
  motivo: string;
  @IsBoolean()
  cobrar: boolean;
  @IsOptional()
  @IsString()
  observacion?: string;
}

// ─── CU-02: anular la atención completa de una mesa ──────────────────────

/**
 * Body de POST /pedidos/mesas/:mesaId/anular-atencion. `itemsConsumidos`
 * son los ids de PedidoItem de área DIRECTO (Inventario) que el cajero
 * confirma que sí se abrieron/consumieron — esos quedan pendientes de
 * cobro; el resto de ítems de Inventario no tocados se cancelan y
 * recuperan su stock. Los platos de Cocina/Barra se resuelven solos según
 * su estado (sin preparar → se cancelan limpio; ya preparados → merma).
 */
export class AnularAtencionMesaCommand {
  @IsString()
  @IsNotEmpty()
  motivo: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemsConsumidos?: string[];
}

/**
 * Body de POST /pedidos/:id/anular — anula UN pedido puntual (no toda la
 * mesa) directamente desde el tablero de Pedidos. Mismo criterio por ítem
 * que AnularAtencionMesaCommand, pero acotado a un solo pedido; a
 * diferencia de la anulación de mesa, cada ítem cancelado/con merma queda
 * con su propio registro de auditoría (tipo ITEM), así que sí se puede
 * revertir de verdad después desde "Invalidar anulación".
 */
export class AnularPedidoCommand {
  @IsString()
  @IsNotEmpty()
  motivo: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemsConsumidos?: string[];
}

export class AnularAtencionMesaResultado {
  @IsInt()
  itemsCancelados: number;
  @IsInt()
  itemsConMerma: number;
  @IsInt()
  itemsMantenidosParaCobro: number;
  @IsBoolean()
  mesaLiberada: boolean;
}

// ─── CU-05: Auditoría de Anulaciones ──────────────────────────────────────

export const TipoAnulacion = {
  Item: 'ITEM',
  Mesa: 'MESA',
} as const;
export type TipoAnulacion = (typeof TipoAnulacion)[keyof typeof TipoAnulacion];

export const EstadoPlatoAnulacion = {
  SinPreparar: 'SIN_PREPARAR',
  Preparado: 'PREPARADO',
} as const;
export type EstadoPlatoAnulacion = (typeof EstadoPlatoAnulacion)[keyof typeof EstadoPlatoAnulacion];

export class AnulacionAuditoriaDto {
  @IsString()
  id: string;
  // Código legible propio de este registro ("AN0000001"), independiente del
  // correlativo de la atención — identifica la anulación en sí. Nullable:
  // registros creados antes de este campo no tienen uno retroactivo.
  @IsOptional()
  @IsString()
  correlativo?: string | null;
  @IsString()
  fecha: string;
  @IsString()
  mesaId: string;
  @IsOptional()
  @IsInt()
  mesaNumero?: number | null;
  @IsString()
  pedidoId: string;
  // Código legible de la atención ("A0000001") a la que pertenecía el
  // pedido anulado, si ya se le había asignado al momento de la anulación.
  @IsOptional()
  @IsString()
  cuentaCorrelativo?: string | null;
  @IsOptional()
  @IsString()
  itemId?: string | null;
  @IsEnum(TipoAnulacion)
  tipo: TipoAnulacion;
  @IsOptional()
  @IsString()
  productoId?: string | null;
  @IsOptional()
  @IsString()
  productoNombre?: string | null;
  @IsOptional()
  @IsInt()
  cantidad?: number | null;
  @IsEnum(EstadoPlatoAnulacion)
  estadoPlato: EstadoPlatoAnulacion;
  @IsBoolean()
  cobrado: boolean;
  @IsNumber()
  montoAnulado: number;
  @IsString()
  motivo: string;
  @IsOptional()
  @IsString()
  observacion?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsOptional()
  @IsString()
  clienteNombre?: string | null;
  @IsBoolean()
  invalidada: boolean;
  @IsOptional()
  @IsString()
  invalidadaMotivo?: string | null;
  @IsOptional()
  @IsString()
  invalidadaPorNombre?: string | null;
  @IsOptional()
  @IsString()
  invalidadaAt?: string | null;
}

export class ListarAnulacionesQuery {
  @IsOptional()
  @IsEnum(TipoAnulacion)
  tipo?: TipoAnulacion;
  @IsOptional()
  @IsString()
  usuarioId?: string;
  @IsOptional()
  @IsDateString()
  desde?: string;
  @IsOptional()
  @IsDateString()
  hasta?: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;
  @IsOptional()
  @IsString()
  sedeId?: string;
  // Busca por el código de la atención ("A0000001" o un fragmento).
  @IsOptional()
  @IsString()
  search?: string;
}

export class ActualizarAnulacionCommand {
  @IsString()
  @IsNotEmpty()
  motivo: string;
  @IsOptional()
  @IsString()
  observacion?: string | null;
}

export class InvalidarAnulacionCommand {
  @IsString()
  @MinLength(3)
  motivo: string;
}
