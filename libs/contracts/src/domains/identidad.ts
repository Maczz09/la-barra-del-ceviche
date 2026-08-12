import { IsEmail, IsString, IsEnum, IsBoolean, IsNotEmpty, MinLength, IsOptional, IsInt, Min, Max, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export const RolUsuario = {
  Admin: 'ADMIN',
  Cajero: 'CAJERO',
  Cocina: 'COCINA',
  Mesero: 'MESERO',
  Recepcion: 'RECEPCION',
  Gerencia: 'GERENCIA',
  Sistema: 'SISTEMA',
} as const;

export type RolUsuario = (typeof RolUsuario)[keyof typeof RolUsuario];

/* ── DTOs ────────────────────────────────────────────── */

export class UsuarioDto {
  @IsString()
  id: string;

  @IsString()
  nombre: string;

  @IsEmail()
  email: string;

  @IsEnum(RolUsuario)
  rol: RolUsuario;

  @IsBoolean()
  activo: boolean;

  // T-23 (multi-sede): null = admin general (sin sede fija).
  @IsOptional()
  @IsString()
  sedeId?: string | null;

  @IsString()
  createdAt: string;
}

/* ── Queries ─────────────────────────────────────────── */

export class ListarUsuariosQuery {
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
  @IsEnum(RolUsuario)
  rol?: RolUsuario;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  updatedSince?: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

/* ── Commands ────────────────────────────────────────── */

export class LoginCommand {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CrearUsuarioCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(RolUsuario)
  rol: RolUsuario;

  // Requerida salvo rol ADMIN (validado en el servicio: un ADMIN queda sin
  // sede fija — administra la que elija).
  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class CambiarRolCommand {
  @IsEnum(RolUsuario)
  rol: RolUsuario;
}

export class CambiarEstadoUsuarioCommand {
  @IsBoolean()
  activo: boolean;
}

/* ── Responses ───────────────────────────────────────── */

export class LoginResponseDto {
  @IsString()
  access_token: string;
  
  usuario: Omit<UsuarioDto, 'activo' | 'createdAt'>;
}

export class UsuarioListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UsuarioDto)
  data: UsuarioDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

/* ── Sedes (T-23: multi-sede) ────────────────────────── */

export class SedeDto {
  @IsString()
  id: string;

  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  direccion?: string | null;

  // RUC fiscal de la sede, impreso en la boleta de venta interna. Puede
  // repetirse entre sedes de un mismo cliente (misma razón social) — no es
  // unique a propósito, decisión del admin.
  @IsOptional()
  @IsString()
  ruc?: string | null;

  @IsBoolean()
  activa: boolean;
}

export class CrearSedeCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  ruc?: string;
}

export class ActualizarSedeCommand {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  direccion?: string | null;

  @IsOptional()
  @IsString()
  ruc?: string | null;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class SedesResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SedeDto)
  sedes: SedeDto[];
}
