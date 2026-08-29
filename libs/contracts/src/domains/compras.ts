import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ── Proveedores ──────────────────────────────────────────────────

export class ProveedorDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  nombre: string;
  @IsOptional()
  @IsString()
  ruc?: string | null;
  @IsOptional()
  @IsString()
  categoria?: string | null;
  @IsOptional()
  @IsString()
  contacto?: string | null;
  @IsOptional()
  @IsString()
  telefono?: string | null;
  @IsOptional()
  @IsString()
  diasEntrega?: string | null;
  @IsOptional()
  @IsString()
  condicionPago?: string | null;
  @IsBoolean()
  activo: boolean;
  @IsString()
  createdAt: string;
}

export class ListarProveedoresQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  activo?: boolean;

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
  @IsString()
  sedeId?: string;
}

export class ProveedorListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProveedorDto)
  data: ProveedorDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class CrearProveedorCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;
  @IsOptional()
  @IsString()
  ruc?: string;
  @IsOptional()
  @IsString()
  categoria?: string;
  @IsOptional()
  @IsString()
  contacto?: string;
  @IsOptional()
  @IsString()
  telefono?: string;
  @IsOptional()
  @IsString()
  diasEntrega?: string;
  @IsOptional()
  @IsString()
  condicionPago?: string;
}

export class ActualizarProveedorCommand {
  @IsOptional()
  @IsString()
  nombre?: string;
  @IsOptional()
  @IsString()
  ruc?: string | null;
  @IsOptional()
  @IsString()
  categoria?: string | null;
  @IsOptional()
  @IsString()
  contacto?: string | null;
  @IsOptional()
  @IsString()
  telefono?: string | null;
  @IsOptional()
  @IsString()
  diasEntrega?: string | null;
  @IsOptional()
  @IsString()
  condicionPago?: string | null;
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

// ── Categorías de insumo (taxonomía PROPIA del almacén de cocina) ────────
// Separadas a propósito de las `Categoria` de servicio-inventario: el almacén
// se agrupa por criterio de compra (Abarrotes, Carnes, Limpieza, Gas), que no
// tiene por qué coincidir con cómo se ordena la carta.

export class CategoriaInsumoDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  nombre: string;
  @IsOptional()
  @IsString()
  descripcion?: string | null;
  @IsBoolean()
  activo: boolean;
  /** Cuántos insumos la usan — para avisar antes de borrarla. */
  @IsOptional()
  @IsInt()
  insumosCount?: number;
  @IsString()
  createdAt: string;
}

export class ListarCategoriasInsumoQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class CategoriasInsumoListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoriaInsumoDto)
  data: CategoriaInsumoDto[];
}

export class CrearCategoriaInsumoCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;
  @IsOptional()
  @IsString()
  descripcion?: string;
}

export class ActualizarCategoriaInsumoCommand {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;
  @IsOptional()
  @IsString()
  descripcion?: string | null;
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

// ── Insumos (lo que se COMPRA; distinto de Producto = lo que se VENDE) ────

export class InsumoDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  nombre: string;
  @IsString()
  unidad: string;
  @IsNumber()
  stockActual: number;
  @IsNumber()
  stockMinimo: number;
  @IsNumber()
  costoUnitario: number;
  @IsOptional()
  @IsString()
  proveedorId?: string | null;
  @IsOptional()
  @IsString()
  proveedorNombre?: string | null;
  /** Categoría PROPIA del almacén (CategoriaInsumo), no la de la carta. */
  @IsOptional()
  @IsString()
  categoriaId?: string | null;
  @IsOptional()
  @IsString()
  categoriaNombre?: string | null;
  /** Puente opcional al catálogo de venta (servicio-inventario). null = insumo
   * crudo que no se revende tal cual — esos, y solo esos, son el almacén de
   * cocina. */
  @IsOptional()
  @IsString()
  productoId?: string | null;
  @IsNumber()
  factorConversion: number;
  @IsBoolean()
  activo: boolean;
  @IsString()
  createdAt: string;
}

export class ListarInsumosQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  bajoMinimo?: boolean;

  @IsOptional()
  @IsString()
  proveedorId?: string;

  @IsOptional()
  @IsString()
  categoriaId?: string;

  /** true = solo insumos de cocina (`productoId` nulo). Lo que se revende tal
   *  cual pertenece al catálogo de venta y no debe aparecer en el almacén. */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  soloCocina?: boolean;

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
  @IsString()
  sedeId?: string;
}

export class InsumoListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InsumoDto)
  data: InsumoDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class CrearInsumoCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;
  @IsString()
  @IsNotEmpty()
  unidad: string;
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockActual?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockMinimo?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
  @IsOptional()
  @IsUUID()
  proveedorId?: string;
  @IsOptional()
  @IsUUID()
  categoriaId?: string;
  @IsOptional()
  @IsUUID()
  productoId?: string;
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  factorConversion?: number;
}

export class ActualizarInsumoCommand {
  @IsOptional()
  @IsString()
  nombre?: string;
  @IsOptional()
  @IsString()
  unidad?: string;
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockMinimo?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
  @IsOptional()
  @IsUUID()
  proveedorId?: string | null;
  @IsOptional()
  @IsUUID()
  categoriaId?: string | null;
  @IsOptional()
  @IsUUID()
  productoId?: string | null;
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  factorConversion?: number;
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

// ── Órdenes de compra ────────────────────────────────────────────

export const OrdenCompraEstado = {
  Borrador: 'BORRADOR',
  Enviada: 'ENVIADA',
  Parcial: 'PARCIAL',
  Recibida: 'RECIBIDA',
  Anulada: 'ANULADA',
} as const;

export type OrdenCompraEstado = (typeof OrdenCompraEstado)[keyof typeof OrdenCompraEstado];

export class OrdenCompraItemDto {
  @IsString()
  id: string;
  @IsString()
  insumoId: string;
  @IsString()
  insumoNombre: string;
  @IsString()
  unidad: string;
  @IsNumber()
  cantidadPedida: number;
  @IsNumber()
  cantidadRecibida: number;
  @IsNumber()
  costoUnitario: number;
}

export class OrdenCompraDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  codigo: string;
  @IsOptional()
  @IsString()
  proveedorId?: string | null;
  @IsString()
  proveedorNombre: string;
  @IsEnum(OrdenCompraEstado)
  estado: OrdenCompraEstado;
  @IsString()
  fechaEmision: string;
  @IsOptional()
  @IsString()
  fechaEnvio?: string | null;
  @IsOptional()
  @IsString()
  fechaEntregaEsperada?: string | null;
  @IsOptional()
  @IsString()
  fechaCierre?: string | null;
  @IsString()
  moneda: string;
  @IsNumber()
  total: number;
  @IsOptional()
  @IsString()
  notas?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrdenCompraItemDto)
  items: OrdenCompraItemDto[];
  @IsString()
  createdAt: string;
  // Cuántas fotos de boleta/factura tiene subidas esta orden — permite que el
  // listado avise "falta boleta" sin tener que abrir el detalle de cada una.
  @IsNumber()
  comprobantesCount: number;
}

export class ListarOrdenesQuery {
  @IsOptional()
  @IsEnum(OrdenCompraEstado)
  estado?: OrdenCompraEstado;

  @IsOptional()
  @IsString()
  proveedorId?: string;

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

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class OrdenCompraListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrdenCompraDto)
  data: OrdenCompraDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class CrearOrdenCompraItemCommand {
  @IsUUID()
  insumoId: string;
  @IsNumber()
  @Min(0.001)
  cantidadPedida: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
}

export class CrearOrdenCompraCommand {
  @IsOptional()
  @IsUUID()
  proveedorId?: string;
  @IsOptional()
  @IsString()
  proveedorNombre?: string;
  @IsOptional()
  @IsDateString()
  fechaEntregaEsperada?: string;
  @IsOptional()
  @IsString()
  notas?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOrdenCompraItemCommand)
  items: CrearOrdenCompraItemCommand[];
}

export class ActualizarOrdenCompraCommand {
  @IsOptional()
  @IsDateString()
  fechaEntregaEsperada?: string | null;
  @IsOptional()
  @IsString()
  notas?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOrdenCompraItemCommand)
  items?: CrearOrdenCompraItemCommand[];
}

export class CerrarOrdenCommand {
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class AnularOrdenCommand {
  @IsOptional()
  @IsString()
  motivo?: string;
}

// ── Recepciones (parciales o totales) ────────────────────────────

export class RecepcionCompraItemDto {
  @IsString()
  id: string;
  @IsString()
  ordenItemId: string;
  @IsNumber()
  cantidadRecibida: number;
  @IsNumber()
  costoUnitario: number;
}

export class RecepcionCompraDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  ordenId: string;
  @IsString()
  fecha: string;
  @IsOptional()
  @IsString()
  observaciones?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecepcionCompraItemDto)
  items: RecepcionCompraItemDto[];
  @IsString()
  createdAt: string;
}

export class RegistrarRecepcionItemCommand {
  @IsUUID()
  ordenItemId: string;
  @IsNumber()
  @Min(0.001)
  cantidadRecibida: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
}

export class RegistrarRecepcionCommand {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RegistrarRecepcionItemCommand)
  items: RegistrarRecepcionItemCommand[];
  @IsOptional()
  @IsString()
  observaciones?: string;
}

// ── Comprobantes (foto de boleta/factura) ────────────────────────

export class ComprobanteCompraDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsOptional()
  @IsString()
  ordenId?: string | null;
  @IsOptional()
  @IsString()
  recepcionId?: string | null;
  @IsString()
  tipo: string;
  @IsOptional()
  @IsString()
  serie?: string | null;
  @IsOptional()
  @IsString()
  numero?: string | null;
  @IsOptional()
  @IsString()
  fechaEmision?: string | null;
  @IsOptional()
  @IsNumber()
  montoTotal?: number | null;
  @IsString()
  mimeType: string;
  @IsInt()
  bytes: number;
  @IsInt()
  ancho: number;
  @IsInt()
  alto: number;
  @IsString()
  sha256: string;
  @IsOptional()
  @IsString()
  nombreOriginal?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsString()
  createdAt: string;
}

export class SubirComprobanteCommand {
  @IsOptional()
  @IsUUID()
  ordenId?: string;
  @IsOptional()
  @IsUUID()
  recepcionId?: string;
  @IsOptional()
  @IsIn(['BOLETA', 'FACTURA', 'TICKET', 'OTRO'])
  tipo?: string;
  @IsOptional()
  @IsString()
  serie?: string;
  @IsOptional()
  @IsString()
  numero?: string;
  @IsOptional()
  @IsDateString()
  fechaEmision?: string;

  // multipart manda todo como string → convertir antes de @IsNumber.
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsNumber()
  montoTotal?: number;

  /** El controller también la extrae por separado (@Query('sedeId')) para
   * resolveSedeId; declarada acá para que el whitelist del DTO no la rechace. */
  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class ListarComprobantesQuery {
  @IsOptional()
  @IsString()
  ordenId?: string;
  @IsOptional()
  @IsString()
  recepcionId?: string;
  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class ComprobanteListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComprobanteCompraDto)
  data: ComprobanteCompraDto[];
}

// ── Resumen (KPIs de la pantalla) ────────────────────────────────

export class ResumenComprasDto {
  @IsInt()
  ordenesAbiertas: number;
  @IsInt()
  ordenesPorRecibir: number;
  @IsNumber()
  montoPorRecibir: number;
  @IsNumber()
  gastoRecibido: number;
  @IsInt()
  insumosBajoMinimo: number;
}

// ── Evento: compra.recibida (Compras → Inventario) ───────────────

export class CompraRecibidaLineaPayload {
  @IsString()
  insumoId: string;
  @IsString()
  insumoNombre: string;
  /** Puente al catálogo de venta. null = insumo crudo (no toca inventario). */
  @IsOptional()
  @IsString()
  productoId?: string | null;
  /** En unidad de COMPRA (kg, pack…). Informativo. */
  @IsNumber()
  cantidadRecibida: number;
  /** cantidadRecibida × factorConversion, truncado a entero para el Int de
   * Producto.stockActual. */
  @IsInt()
  cantidadStockVenta: number;
}

export class CompraRecibidaPayload {
  @IsOptional()
  @IsString()
  eventId?: string;
  @IsString()
  recepcionId: string;
  @IsString()
  ordenId: string;
  @IsString()
  sedeId: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompraRecibidaLineaPayload)
  lineas: CompraRecibidaLineaPayload[];
}

// ── Movimientos de insumo (kardex del almacén de cocina) ─────────
//
// T-50: hasta ahora `Insumo.stockActual` solo SUBIA (recepción de compra) y
// nadie lo bajaba: lo que cocina consumía no se registraba en ningún lado.
// Cada fila de MovimientoInsumo es un hecho INMUTABLE, y toda escritura de
// `stockActual` pasa por una — incluida la recepción, así el kardex cuadra
// desde la primera fila.

export const MovimientoInsumoTipo = {
  /** Recepción de una orden de compra. */
  EntradaCompra: 'ENTRADA_COMPRA',
  /** Ingreso a mano, sin orden de compra: la compra del día en el mercado. */
  EntradaManual: 'ENTRADA_MANUAL',
  /** Vuelve al almacén algo que se sacó y no se usó. */
  EntradaDevolucion: 'ENTRADA_DEVOLUCION',
  /** Cocina saca del almacén para producir. */
  SalidaConsumo: 'SALIDA_CONSUMO',
  /** Se malogró / se rompió / venció. */
  SalidaMerma: 'SALIDA_MERMA',
  /** Cuadre físico: diferencia entre lo contado y lo que decía el sistema. */
  AjusteConteo: 'AJUSTE_CONTEO',
} as const;

export type MovimientoInsumoTipo = (typeof MovimientoInsumoTipo)[keyof typeof MovimientoInsumoTipo];

/** Tipos que el usuario puede registrar a mano (uno por uno) desde el almacén.
 *  ENTRADA_COMPRA la escribe solo la recepción de una OC, y AJUSTE_CONTEO solo
 *  el cuadre en lote: ninguno se acepta en el endpoint de movimiento simple. */
export const MOVIMIENTO_INSUMO_TIPOS_MANUALES = [
  MovimientoInsumoTipo.EntradaManual,
  MovimientoInsumoTipo.SalidaConsumo,
  MovimientoInsumoTipo.SalidaMerma,
  MovimientoInsumoTipo.EntradaDevolucion,
] as const;

export type MovimientoInsumoTipoManual = (typeof MOVIMIENTO_INSUMO_TIPOS_MANUALES)[number];

export class MovimientoInsumoDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  insumoId: string;
  @IsString()
  insumoNombre: string;
  @IsString()
  unidad: string;
  @IsEnum(MovimientoInsumoTipo)
  tipo: MovimientoInsumoTipo;
  /** CON SIGNO: negativo en salidas, positivo en entradas. Invariante del
   *  kardex: `stockDespues === stockAntes + delta`. */
  @IsNumber()
  delta: number;
  @IsNumber()
  stockAntes: number;
  @IsNumber()
  stockDespues: number;
  /** Snapshot del costo al momento del movimiento (valoriza la salida aunque
   *  el costo del insumo cambie después). */
  @IsOptional()
  @IsNumber()
  costoUnitario?: number | null;
  /** |delta| × costoUnitario — se calcula en el servicio, no se persiste. */
  @IsOptional()
  @IsNumber()
  costoTotal?: number | null;
  @IsOptional()
  @IsString()
  motivo?: string | null;
  @IsOptional()
  @IsString()
  observacion?: string | null;
  @IsOptional()
  @IsString()
  recepcionId?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsString()
  createdAt: string;
}

export class RegistrarMovimientoInsumoCommand {
  @IsIn(MOVIMIENTO_INSUMO_TIPOS_MANUALES)
  tipo: MovimientoInsumoTipoManual;
  /** SIEMPRE positiva: el signo lo pone el servicio a partir de `tipo`. */
  @IsNumber()
  @Min(0.001)
  cantidad: number;
  @IsOptional()
  @IsString()
  motivo?: string;
  @IsOptional()
  @IsString()
  observacion?: string;
}

export class ListarMovimientosInsumoQuery {
  @IsOptional()
  @IsUUID()
  insumoId?: string;

  @IsOptional()
  @IsEnum(MovimientoInsumoTipo)
  tipo?: MovimientoInsumoTipo;

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

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class MovimientoInsumoListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MovimientoInsumoDto)
  data: MovimientoInsumoDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

// ── Conteo físico (cuadre en lote contra el PDF impreso) ─────────

export class ConteoInsumoItemCommand {
  @IsUUID()
  insumoId: string;
  /** Lo que se contó físicamente, en la unidad del insumo. */
  @IsNumber()
  @Min(0)
  stockContado: number;
}

export class RegistrarConteoInsumosCommand {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConteoInsumoItemCommand)
  items: ConteoInsumoItemCommand[];

  @IsOptional()
  @IsString()
  observacion?: string;
}

export class ConteoInsumoDiferenciaDto {
  @IsString()
  insumoId: string;
  @IsString()
  insumoNombre: string;
  @IsString()
  unidad: string;
  @IsNumber()
  stockSistema: number;
  @IsNumber()
  stockContado: number;
  /** contado − sistema: negativo = falta mercadería, positivo = sobra. */
  @IsNumber()
  diferencia: number;
  /** diferencia × costoUnitario (con signo). */
  @IsNumber()
  valorDiferencia: number;
}

export class ConteoInsumosResultadoDto {
  @IsInt()
  insumosContados: number;
  @IsInt()
  cuadraron: number;
  @IsInt()
  ajustados: number;
  /** Suma de los `valorDiferencia`: negativo = pérdida detectada por el cuadre. */
  @IsNumber()
  valorDiferenciaTotal: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConteoInsumoDiferenciaDto)
  diferencias: ConteoInsumoDiferenciaDto[];
}

// ── Evento: insumo.stock_bajo (Compras → Notificaciones) ─────────
//
// Se emite SOLO en el cruce de arriba hacia abajo (el movimiento anterior
// estaba sobre el mínimo y este lo dejó en/por debajo). Si se emitiera en cada
// salida de un insumo ya bajo, cada cucharada de arroz spamearía la cola.

export class InsumoStockBajoPayload {
  @IsOptional()
  @IsString()
  eventId?: string;
  @IsString()
  sedeId: string;
  @IsString()
  insumoId: string;
  @IsString()
  insumoNombre: string;
  @IsString()
  unidad: string;
  @IsNumber()
  stockActual: number;
  @IsNumber()
  stockMinimo: number;
}
