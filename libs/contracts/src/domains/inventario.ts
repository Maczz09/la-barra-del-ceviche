import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// Determina qué módulo administra la categoría (Carta vs Inventario) y, si es
// Carta, a qué estación de producción se enruta un pedido — el dueño la elige
// explícitamente al crear/editar la categoría (nunca se infiere del nombre),
// para que el ruteo sea escalable sin tocar código (ver ItemArea en pedidos.ts).
export const CategoriaArea = {
  Cocina: 'COCINA',
  Barra: 'BARRA',
  Inventario: 'INVENTARIO',
} as const;

export type CategoriaArea = (typeof CategoriaArea)[keyof typeof CategoriaArea];

export class StockBajoPayload {
  @IsString()
  productoId: string;
  @IsString()
  nombre: string;
  @IsNumber()
  stockActual: number;
  @IsNumber()
  stockMinimo: number;
}

export class StockDescontadoPayload {
  @IsString()
  productoId: string;
  @IsNumber()
  cantidad: number;
  @IsString()
  motivo: string;
}

/**
 * Emitido por Inventario cuando, al consumir un `PedidoCreado`, el descuento
 * atómico de stock real falla (`count === 0`) por divergencia/staleness de la
 * proyección `productos_locales`. Dispara la compensación en Pedidos
 * (ítem/pedido → `RECHAZADO_SIN_STOCK`).
 */
export class StockInsuficientePayload {
  @IsOptional()
  @IsString()
  eventId?: string;
  @IsString()
  pedidoId: string;
  @IsString()
  productoId: string;
  @IsNumber()
  solicitado: number;
  @IsNumber()
  disponible: number;
}

/**
 * CU-02: un ítem de Inventario se reservó al crear el pedido pero nunca se
 * consumió (mesa anulada antes de abrirlo) — se le devuelve el stock.
 */
export class StockRestauradoPayload {
  @IsOptional()
  @IsString()
  eventId?: string;
  @IsString()
  productoId: string;
  @IsNumber()
  cantidad: number;
  @IsString()
  motivo: string;
}

export class CategoriaDto {
  @IsString()
  id: string;
  @IsString()
  nombre: string;
  @IsOptional()
  @IsString()
  descripcion?: string | null;
  @IsOptional()
  @IsString()
  parentId?: string | null;
  @IsEnum(CategoriaArea)
  area: CategoriaArea;
}

export class CrearCategoriaCommand {
  @IsString()
  nombre: string;
  @IsOptional()
  @IsString()
  descripcion?: string;
  @IsOptional()
  @IsString()
  parentId?: string;
  @IsOptional()
  @IsEnum(CategoriaArea)
  area?: CategoriaArea;
}

export class ActualizarCategoriaCommand {
  @IsOptional()
  @IsString()
  nombre?: string;
  @IsOptional()
  @IsString()
  descripcion?: string | null;
  @IsOptional()
  @IsString()
  parentId?: string | null;
  @IsOptional()
  @IsEnum(CategoriaArea)
  area?: CategoriaArea;
}

export class ProductoDto {
  @IsString()
  id: string;
  @IsString()
  categoriaId: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoriaDto)
  categoria?: CategoriaDto | null;
  @IsString()
  nombre: string;
  @IsOptional()
  @IsString()
  descripcion?: string | null;
  @IsNumber()
  precio: number;
  @IsBoolean()
  disponible: boolean;
  @IsOptional()
  @IsNumber()
  stockActual?: number | null;
}

export class ListarProductosQuery {
  @IsOptional()
  @IsString()
  categoriaId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  disponible?: boolean;

  /**
   * Filtra por control de stock: `true` devuelve solo productos con stock
   * (módulo Inventario), `false` solo productos sin stock (Carta / Menú).
   * Omitido devuelve todos (p. ej. el comandero).
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  conStock?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsDateString()
  updatedSince?: string;

  /** T-23 Fase 2: el controller también la extrae por separado (@Query('sedeId'))
   * para resolveSedeId; declarada acá para que el whitelist del DTO no la rechace. */
  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class ProductoListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductoDto)
  data: ProductoDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

/**
 * Carta pública/QR (T-XX): respuesta del endpoint sin autenticación.
 * Categorías/productos de Carta (COCINA/BARRA, sin stock) más los de
 * Inventario ("Abarrotes" de cara al cliente) que todavía tengan stock —
 * ya filtrados server-side, listos para mostrar.
 */
export class CartaPublicaResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoriaDto)
  categorias: CategoriaDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductoDto)
  productos: ProductoDto[];
}

export class CrearProductoCommand {
  @IsString()
  categoriaId: string;
  @IsString()
  nombre: string;
  @IsOptional()
  @IsString()
  descripcion?: string;
  @IsNumber()
  precio: number;
  @IsOptional()
  @IsBoolean()
  disponible?: boolean;
  @IsOptional()
  @IsNumber()
  stockActual?: number;
}

export class ActualizarProductoCommand {
  @IsOptional()
  @IsString()
  categoriaId?: string;
  @IsOptional()
  @IsString()
  nombre?: string;
  @IsOptional()
  @IsString()
  descripcion?: string | null;
  @IsOptional()
  @IsNumber()
  precio?: number;
  @IsOptional()
  @IsBoolean()
  disponible?: boolean;
}

/** PATCH acotado a solo disponibilidad (ej. rol COCINA marcando 86/agotado). */
export class ActualizarDisponibilidadCommand {
  @IsBoolean()
  disponible: boolean;
}

// --- Menú del día (T-20) ---
// Selección curada de productos ofrecidos en una fecha concreta, separada de
// la carta fija: el mismo Producto puede estar en la carta y/o en el menú de
// hoy, cada uno con su propia disponibilidad.

export class MenuDiarioItemDto {
  @IsString()
  id: string;
  @IsString()
  fecha: string;
  @IsString()
  productoId: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductoDto)
  producto?: ProductoDto | null;
  @IsBoolean()
  disponible: boolean;
}

export class AgregarAlMenuCommand {
  @IsOptional()
  @IsString()
  productoId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrearProductoCommand)
  producto?: CrearProductoCommand;

  // Fecha del menú (YYYY-MM-DD); por defecto hoy.
  @IsOptional()
  @IsDateString()
  fecha?: string;
}

export class ActualizarMenuDiarioCommand {
  @IsBoolean()
  disponible: boolean;
}

// --- Merma de inventario (T-22) ---
// Pérdida de stock que no viene de una venta (botellas rotas, vencidas,
// etc.). Queda como registro auditable con motivo obligatorio.

export const MermaOrigen = {
  DescarteManual: 'DESCARTE_MANUAL_INVENTARIO',
  AnulacionNoCobrada: 'ANULACION_COMANDA_NO_COBRADA',
  AnulacionCobrada: 'ANULACION_COMANDA_COBRADA',
} as const;

export type MermaOrigen = (typeof MermaOrigen)[keyof typeof MermaOrigen];

export class MermaDto {
  @IsString()
  id: string;
  @IsString()
  productoId: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductoDto)
  producto?: ProductoDto | null;
  @IsInt()
  cantidad: number;
  @IsString()
  motivo: string;
  @IsOptional()
  @IsString()
  observacion?: string | null;
  @IsEnum(MermaOrigen)
  origen: MermaOrigen;
  @IsOptional()
  @IsNumber()
  costoUnitario?: number | null;
  /** cantidad × costoUnitario — se calcula en el servicio, no se persiste. */
  @IsOptional()
  @IsNumber()
  costoTotal?: number | null;
  @IsOptional()
  @IsString()
  pedidoItemId?: string | null;
  // Código legible de la atención origen ("A0000001"). Ausente en mermas
  // manuales o si el pedido origen no tenía correlativo todavía.
  @IsOptional()
  @IsString()
  cuentaCorrelativo?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsString()
  createdAt: string;
}

export class RegistrarMermaCommand {
  @IsString()
  productoId: string;
  @IsInt()
  @Min(1)
  cantidad: number;
  @IsString()
  motivo: string;
  @IsOptional()
  @IsString()
  observacion?: string;
  @IsOptional()
  @IsNumber()
  costoUnitario?: number;
}

export class ActualizarMermaCommand {
  @IsOptional()
  @IsInt()
  @Min(1)
  cantidad?: number;
  @IsOptional()
  @IsString()
  motivo?: string;
  @IsOptional()
  @IsString()
  observacion?: string | null;
}

export class EliminarMermaCommand {
  @IsString()
  @MinLength(3)
  justificacion: string;
}

export class ListarMermasQuery {
  @IsOptional()
  @IsString()
  productoId?: string;

  @IsOptional()
  @IsEnum(MermaOrigen)
  origen?: MermaOrigen;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  /** T-23 Fase 2: ver nota en ListarProductosQuery. */
  @IsOptional()
  @IsString()
  sedeId?: string;

  // Busca por el código de la atención origen ("A0000001" o un fragmento).
  @IsOptional()
  @IsString()
  search?: string;
}

export class ObtenerProductosLoteCommand {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class ProductoCreadoPayload {
  @IsOptional()
  @IsString()
  eventId?: string;
  @IsString()
  id: string;
  @IsString()
  nombre: string;
  @IsNumber()
  precio: number;
  @IsOptional()
  @IsNumber()
  stockActual?: number | null;
  @IsOptional()
  @IsString()
  categoriaNombre?: string;
  @IsOptional()
  @IsEnum(CategoriaArea)
  categoriaArea?: CategoriaArea;
  @IsBoolean()
  disponible: boolean;
}

export class ProductoActualizadoPayload {
  @IsOptional()
  @IsString()
  eventId?: string;
  @IsString()
  id: string;
  // Necesario para unir clientes de la carta pública al room `sede:<id>`
  // (T-XX: WebSocket de disponibilidad) — sin esto el consumidor no puede
  // saber a qué sede pertenece el producto que cambió.
  @IsString()
  sedeId: string;
  @IsString()
  nombre: string;
  @IsNumber()
  precio: number;
  @IsOptional()
  @IsNumber()
  stockActual?: number | null;
  @IsOptional()
  @IsString()
  categoriaNombre?: string;
  @IsOptional()
  @IsEnum(CategoriaArea)
  categoriaArea?: CategoriaArea;
  @IsBoolean()
  disponible: boolean;
  @IsOptional()
  @IsString()
  stockSyncMode?: 'REPOSICION' | 'CONSUMO_PEDIDO' | 'MERMA';
  @IsOptional()
  @IsNumber()
  stockDelta?: number;
}
