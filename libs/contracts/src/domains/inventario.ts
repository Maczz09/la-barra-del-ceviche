import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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
  @Max(100)
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
}

export class ListarMermasQuery {
  @IsOptional()
  @IsString()
  productoId?: string;

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
  @IsBoolean()
  disponible: boolean;
}

export class ProductoActualizadoPayload {
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
  @IsBoolean()
  disponible: boolean;
  @IsOptional()
  @IsString()
  stockSyncMode?: 'REPOSICION' | 'CONSUMO_PEDIDO' | 'MERMA';
  @IsOptional()
  @IsNumber()
  stockDelta?: number;
}
