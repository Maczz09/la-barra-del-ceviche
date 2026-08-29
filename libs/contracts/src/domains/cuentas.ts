import { IsString, IsNumber, IsOptional, IsArray, IsEnum } from 'class-validator';
import type { PedidoSnapshot, PedidoSnapshotItem } from './pedidos';

export const CuentaEstado = {
  Abierta: 'ABIERTA',
  Cerrada: 'CERRADA',
  Pagada: 'PAGADA',
  // Todos los ítems de la atención se anularon (nunca se cobró nada) — a
  // diferencia de CERRADA, no genera ticket ni evento CuentaCerrada. Ver
  // AppService.cancelarCuenta.
  Cancelada: 'CANCELADA',
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

/**
 * Backfill: servicio-cuentas emite esto cada vez que confirma a qué cuenta
 * (atención) pertenece un pedido, para que servicio-pedidos guarde el
 * correlativo de la atención ("A0000001") directamente en el Pedido —
 * evita que pwa-cliente tenga que resolverlo con una llamada cruzada.
 */
export class CuentaAsociadaPayload {
  @IsString()
  pedidoId: string;
  @IsString()
  cuentaId: string;
  @IsString()
  sedeId: string;
  @IsOptional()
  @IsString()
  correlativo?: string;
}

export class TicketGeneradoPayload {
  @IsString()
  ticketId: string;
  @IsString()
  cuentaId: string;
}

/**
 * Cascada automática (servicio-pedidos → servicio-cuentas): cuando todos los
 * ítems de la atención quedan anulados uno por uno (o vía "Anular atención de
 * mesa"), la cuenta pasa a CANCELADA sin generar ticket — a diferencia de
 * CuentaCerradaPayload, que sí implica un cobro real.
 */
export class CuentaCanceladaPayload {
  @IsString()
  cuentaId: string;
  @IsString()
  mesaId: string;
  @IsString()
  sedeId: string;
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
  // Código legible de la atención ("A0000001"). Ausente en cuentas creadas
  // antes de este campo (no hay backfill retroactivo).
  @IsOptional()
  @IsString()
  correlativo?: string;
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
