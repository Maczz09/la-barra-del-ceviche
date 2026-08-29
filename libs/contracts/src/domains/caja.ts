import { IsNumber, IsString, IsOptional, IsNotEmpty, IsInt, Min, Max, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export const MetodoPago = {
  Efectivo: 'EFECTIVO',
  Tarjeta: 'TARJETA',
  Transferencia: 'TRANSFERENCIA',
  Yape: 'YAPE',
  Plin: 'PLIN',
} as const;

export type MetodoPago = (typeof MetodoPago)[keyof typeof MetodoPago];

export class TransaccionDto {
  @IsString()
  id: string;

  @IsString()
  cuentaId: string;

  @IsString()
  sedeId: string;

  @IsNumber()
  monto: number;

  @IsNumber()
  descuento: number;

  @IsString()
  metodo: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsString()
  usuarioId?: string;

  @IsOptional()
  @IsString()
  cajeroNombre?: string;

  // Auditoría de cierre (quién atendió vs. quién cobró/generó el comprobante).
  @IsOptional()
  @IsString()
  mesaId?: string;

  @IsOptional()
  @IsString()
  turnoId?: string;

  @IsOptional()
  @IsString()
  meseroId?: string;

  @IsOptional()
  @IsString()
  meseroNombre?: string;

  // Número de mesa legible (y hermanas si estaba unida), para no mostrar el
  // mesaId (UUID) crudo en la auditoría de caja.
  @IsOptional()
  @IsString()
  mesaNumero?: string;

  @IsOptional()
  @IsString()
  mesaUnidaCon?: string;

  // Tipo de comprobante elegido por el cajero al cobrar; BOLETA pide DNI del
  // cliente, FACTURA pide RUC (ambos opcionales, informativos).
  @IsOptional()
  @IsString()
  tipoComprobante?: string;

  @IsOptional()
  @IsString()
  clienteDocumento?: string;

  // Código legible de la atención ("A0000001"). Ausente en cuentas
  // anteriores a este campo.
  @IsOptional()
  @IsString()
  cuentaCorrelativo?: string;

  @IsString()
  createdAt: string;
}

export class PagarPedidoCommand {
  @IsString()
  @IsNotEmpty()
  cuentaId: string;

  @IsNumber()
  montoRecibido: number;

  @IsString()
  @IsNotEmpty()
  metodo: string;
}

export class PagoRegistradoPayload {
  @IsString()
  transaccionId: string;
  @IsString()
  cuentaId: string;
  @IsString()
  mesaId: string;
  @IsNumber()
  monto: number;
  @IsString()
  metodo: string;
  // T-16 (pagos divididos): saldo que queda por cobrar de la cuenta tras
  // este pago. Los consumidores (cuentas, pedidos) solo deben cerrar la
  // cuenta / marcar pedidos como pagados cuando llega en 0 — un pago
  // parcial no debe disparar el cierre.
  @IsNumber()
  pendiente: number;
}

export class ArqueoRealizadoPayload {
  @IsString()
  turnoId: string;
  @IsNumber()
  diferencia: number;
}

/* ── Queries ─────────────────────────────────────────── */

export class ListarTransaccionesQuery {
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

  @IsOptional()
  @IsString()
  metodo?: string;

  @IsOptional()
  @IsDateString()
  updatedSince?: string;
}

export class ListarTurnosQuery {
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

  @IsOptional()
  @IsString()
  estado?: string;

  /** Filtra por cerradoAt >= desde (ISO-8601). */
  @IsOptional()
  @IsDateString()
  desde?: string;

  /** Filtra por cerradoAt <= hasta (ISO-8601). */
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

/* ── Responses ───────────────────────────────────────── */

export class TransaccionListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransaccionDto)
  data: TransaccionDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class TurnoDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  cajaId: string;
  @IsString()
  cajaNombre: string;
  @IsString()
  usuarioId: string;
  @IsOptional()
  @IsString()
  cajeroNombre?: string | null;
  @IsNumber()
  fondoInicial: number;
  @IsString()
  estado: string;
  @IsString()
  abiertoAt: string;
  @IsOptional()
  @IsString()
  cerradoAt?: string | null;
  @IsString()
  createdAt: string;
  @IsString()
  updatedAt: string;
}

export class TurnoListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TurnoDto)
  data: TurnoDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

// Eventos de apertura/cierre de turno (consumidos por identidad para
// activar/desactivar automáticamente al personal MESERO de esa sede).
export class TurnoCajaAbiertoPayload {
  @IsString()
  turnoId: string;
  @IsString()
  sedeId: string;
}

export class TurnoCajaCerradoPayload {
  @IsString()
  turnoId: string;
  @IsString()
  sedeId: string;
}
