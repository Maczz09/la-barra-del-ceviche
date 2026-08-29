import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const ReservaEstado = {
  Pendiente: 'PENDIENTE',
  Confirmada: 'CONFIRMADA',
  Cancelada: 'CANCELADA',
  Expirada: 'EXPIRADA',
} as const;

export type ReservaEstado = (typeof ReservaEstado)[keyof typeof ReservaEstado];

export class ReservaDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  clienteId: string;
  @IsString()
  clienteNombre: string;
  @IsString()
  clienteTelefono: string;
  @IsString()
  fecha: string;
  @IsString()
  hora: string;
  @IsOptional()
  @IsString()
  mesaPreferida?: string | null;
  @IsNumber()
  numComensales: number;
  @IsEnum(ReservaEstado)
  estado: ReservaEstado;
  @IsOptional()
  @IsString()
  usuarioId?: string;
  @IsOptional()
  @IsString()
  usuarioNombre?: string;
  // Código legible ("R0000001"). Ausente en reservas creadas antes de este
  // campo (no hay backfill retroactivo).
  @IsOptional()
  @IsString()
  correlativo?: string;
  @IsString()
  createdAt: string;
}

export class ListarReservasQuery {
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
  @IsEnum(ReservaEstado)
  estado?: ReservaEstado;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsDateString()
  updatedSince?: string;

  // Busca por el código de la reserva ("R0000001" o un fragmento).
  @IsOptional()
  @IsString()
  search?: string;
}

export class ReservaListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReservaDto)
  data: ReservaDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class CrearReservaCommand {
  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ obj, value }) => (value as string | undefined) ?? (obj as { nombreCliente?: string }).nombreCliente)
  clienteNombre?: string;

  @IsOptional()
  @IsString()
  clienteTelefono?: string;

  @IsString()
  @IsNotEmpty()
  fecha: string;

  @IsString()
  @IsNotEmpty()
  hora: string;

  @IsString()
  @IsNotEmpty()
  mesaPreferida: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ obj, value }) => (value as number | undefined) ?? (obj as { personas?: number }).personas)
  numComensales?: number;
}

export class ReservaDisponibilidadResponse {
  @IsString()
  fecha: string;

  @IsString()
  hora: string;

  @IsOptional()
  @IsString()
  mesaPreferida?: string;

  @IsArray()
  @IsString({ each: true })
  mesasReservadas: string[];

  @IsNumber()
  capacidadRestante: number;

  disponible: boolean;
}

export class ReservaCreadaPayload {
  @ValidateNested()
  @Type(() => ReservaDto)
  reserva: ReservaDto;
}

export class ReservaCanceladaPayload {
  @IsString()
  reservaId: string;
  @IsOptional()
  @IsString()
  motivo?: string;
}
