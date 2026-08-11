export type TurnoCajaEstado = 'ABIERTA' | 'CERRADA';
export type MovimientoCajaTipo = 'VENTA' | 'EGRESO' | 'INGRESO' | 'APERTURA' | 'AJUSTE';
export type MetodoPagoCaja = 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA';

export interface TurnoCajaDto {
  id: string;
  cajaId: string;
  cajaNombre: string;
  usuarioId: string;
  cajeroNombre: string | null;
  fondoInicial: number;
  estado: TurnoCajaEstado;
  abiertoAt: string;
  cerradoAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MovimientoCajaDto {
  id: string;
  turnoId: string;
  tipo: MovimientoCajaTipo;
  cuentaId: string | null;
  transaccionId: string | null;
  mesaId: string | null;
  donde: string;
  metodo: MetodoPagoCaja;
  monto: number;
  descuento: number;
  propina: number;
  motivo: string | null;
  createdAt: string;
}

export interface TransaccionDto {
  id: string;
  cuentaId: string;
  monto: number;
  descuento: number;
  metodo: MetodoPagoCaja;
  referencia: string | null;
  notas: string | null;
  usuarioId: string | null;
  cajeroNombre: string | null;
  mesaId?: string | null;
  turnoId?: string | null;
  meseroId?: string | null;
  meseroNombre?: string | null;
  mesaNumero?: string | null;
  mesaUnidaCon?: string | null;
  createdAt: string;
}

/** Edición acotada: el monto/descuento de una venta ya cerrada queda fijo
 * a propósito (cambiarlo rompería el cuadre de caja del turno). */
export interface ActualizarTransaccionPayload {
  metodo?: MetodoPagoCaja;
  notas?: string;
}

export interface ArqueoCajaDto {
  id: string;
  turnoId: string;
  denominaciones: Record<string, number>;
  efectivoEsperado: number;
  efectivoContado: number;
  diferencia: number;
  usuarioId: string;
  createdAt: string;
}

export interface CierreCajaDto {
  id: string;
  turnoId: string | null;
  montoEsperado: number;
  montoReal: number;
  diferencia: number;
  usuarioId: string;
  resumen: CajaResumenDto | null;
  createdAt: string;
}

export interface CajaResumenDto {
  turno: TurnoCajaDto | null;
  movimientos: MovimientoCajaDto[];
  ventas: MovimientoCajaDto[];
  // Auditoría venta-por-venta: quién atendió (mesero) y quién cobró (cajero)
  // cada venta, a diferencia de `ventas` (agregado sin esos datos).
  ventasDetalle: TransaccionDto[];
  totalVentas: number;
  totalEgresos: number;
  totalIngresos: number;
  propinas: number;
  porMetodo: Record<MetodoPagoCaja, number>;
  efectivoEsperado: number;
  comprobantes: number;
  pendientes: number;
  arqueo: ArqueoCajaDto | null;
  cierre: CierreCajaDto | null;
}

export interface AbrirTurnoPayload {
  cajaId?: string;
  cajaNombre?: string;
  cajeroNombre?: string;
  fondoInicial: number;
}

export interface CrearMovimientoCajaPayload {
  tipo: 'INGRESO' | 'EGRESO' | 'AJUSTE';
  monto: number;
  donde: string;
  motivo?: string;
}

export interface CerrarTurnoPayload {
  denominaciones: Record<string, number>;
}

export interface ListarTurnosQuery {
  limit?: number;
  cursor?: string;
  estado?: TurnoCajaEstado;
  desde?: string;
  hasta?: string;
}

export interface TurnoListResponse {
  data: TurnoCajaDto[];
  nextCursor: string | null;
}
