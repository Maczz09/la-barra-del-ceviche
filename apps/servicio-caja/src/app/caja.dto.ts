import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const MetodoPagoCaja = [
  'EFECTIVO',
  'TARJETA',
  'TRANSFERENCIA',
  'YAPE',
  'PLIN',
] as const;

export const MovimientoCajaTipo = ['INGRESO', 'EGRESO', 'AJUSTE'] as const;

export class AbrirTurnoCajaCommand {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cajaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cajaNombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cajeroNombre?: string;

  @IsNumber()
  @Min(0)
  fondoInicial: number;
}

export class CrearMovimientoCajaCommand {
  @IsIn(MovimientoCajaTipo)
  tipo: (typeof MovimientoCajaTipo)[number];

  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsString()
  @MaxLength(100)
  donde: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  motivo?: string;
}

export class RegistrarArqueoCajaCommand {
  @IsObject()
  denominaciones: Record<string, number>;
}

export class CerrarTurnoCajaCommand {
  @IsObject()
  denominaciones: Record<string, number>;
}

export class PagarCuentaCajaCommand {
  @IsUUID()
  cuentaId: string;

  @IsNumber()
  @Min(0.01)
  montoRecibido: number;

  @IsIn(MetodoPagoCaja)
  metodo: (typeof MetodoPagoCaja)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  descuento?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  propina?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mesaNumero?: string;

  // Auditoría de caja: números de las mesas hermanas si la mesa cobrada
  // estaba unida a otra(s) al momento del cobro (ej. "6" o "6, 7").
  @IsOptional()
  @IsString()
  @MaxLength(60)
  mesaUnidaCon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notas?: string;
}

export interface CajaResumenDto {
  turno: unknown;
  movimientos: unknown[];
  ventas: unknown[];
  totalVentas: number;
  totalEgresos: number;
  totalIngresos: number;
  propinas: number;
  porMetodo: Record<string, number>;
  efectivoEsperado: number;
  comprobantes: number;
  pendientes: number;
  arqueo: unknown;
  cierre: unknown;
}

export class TransaccionesBulkQuery {
  @IsOptional()
  @IsArray()
  cuentaIds?: string[];
}

// Edición acotada a lo que no rompe el cuadre de caja del turno: monto,
// descuento e ítems de una transacción ya cerrada quedan fijos a propósito.
export class ActualizarTransaccionCommand {
  @IsOptional()
  @IsIn(MetodoPagoCaja)
  metodo?: (typeof MetodoPagoCaja)[number];

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notas?: string;
}
