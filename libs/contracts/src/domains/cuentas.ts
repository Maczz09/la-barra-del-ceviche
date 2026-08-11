import { IsString, IsNumber, IsOptional, IsArray, IsEnum } from 'class-validator';
import type { PedidoSnapshot, PedidoSnapshotItem } from './pedidos';

export const CuentaEstado = {
  Abierta: 'ABIERTA',
  Cerrada: 'CERRADA',
  Pagada: 'PAGADA',
} as const;

export type CuentaEstado = (typeof CuentaEstado)[keyof typeof CuentaEstado];

export class CuentaAbiertaPayload {
  @IsString()
  cuentaId: string;
  @IsString()
  mesaId: string;
  @IsString()
  sedeId: string;
}

export class CuentaCerradaPayload {
  @IsString()
  cuentaId: string;
  @IsString()
  mesaId: string;
  @IsString()
  sedeId: string;
  @IsNumber()
  total: number;
  @IsOptional()
  @IsArray()
  items?: PedidoSnapshotItem[];
  // Reportes por mesero (plan 6.3). Opcional: lo poblará cuentas cuando propague
  // el mesero del pedido; el read-model de reportes ya agrupa por este campo.
  @IsOptional()
  @IsString()
  meseroId?: string;
  @IsOptional()
  @IsString()
  meseroNombre?: string;
}

export class TicketGeneradoPayload {
  @IsString()
  ticketId: string;
  @IsString()
  cuentaId: string;
}

export class CuentaDto {
  @IsString()
  id: string;
  @IsString()
  mesaId: string;
  @IsString()
  sedeId: string;
  @IsArray()
  pedidos: PedidoSnapshot[];
  @IsNumber()
  total: number;
  @IsEnum(CuentaEstado)
  estado: CuentaEstado;
  @IsOptional()
  @IsString()
  ticket?: string | null;
  @IsString()
  createdAt: string;
  @IsString()
  updatedAt: string;
  // Mesero dominante de la cuenta (más pedidos/monto), derivado de `pedidos`
  // — para que caja pueda auditar "quién atendió" además de "quién cobró".
  @IsOptional()
  @IsString()
  meseroId?: string;
  @IsOptional()
  @IsString()
  meseroNombre?: string;
}

export class TicketDto {
  @IsString()
  id: string;
  @IsString()
  cuentaId: string;
  @IsString()
  mesaId: string;
  @IsArray()
  items: PedidoSnapshotItem[];
  @IsNumber()
  subtotal: number;
  @IsNumber()
  descuento: number;
  @IsNumber()
  total: number;
  @IsString()
  fecha: string;
}

export class AbrirCuentaCommand {
  @IsString()
  mesaId: string;
}

export class CerrarCuentaCommand {
  @IsOptional()
  @IsNumber()
  descuento?: number;
}

export class DividirCuentaCommand {
  @IsString()
  metodo: 'IGUALES' | 'POR_ITEMS';
  @IsOptional()
  @IsNumber()
  numPartes?: number;
}
