// types/reporte.types.ts - DTOs y ViewModels de reportes

export interface EstadisticasTicketDto {
  media: number;
  mediana: number;
  moda: number | null;
}

export type RankingProducto = Array<{ productoId?: string; nombre: string; cantidad: number; ingresos?: number }>;

export interface ResumenDto {
  fecha: string;
  hasta?: string;
  totalVentas: number;
  ingresosTotales: number;
  ventasPorHora?: Array<{ hora: string; total: number; ingresos?: number }>;
  /** Carta/Menú — platos y tragos preparados (cocina + barra). */
  topPlatos?: RankingProducto;
  /** Inventario — productos con stock que se sirven directo, sin preparación. */
  topProductos?: RankingProducto;
  productosMenosVendidos?: RankingProducto;
  estadisticasTicket?: EstadisticasTicketDto;
}

export interface ResumenQuery {
  desde?: string;
  hasta?: string;
  /** T-23 Fase 2: solo lo usa el admin general. Ausente = todas las sedes combinadas. */
  sedeId?: string;
}

export interface ResumenVM {
  fecha: string;
  fechaLabel: string;
  /** Etiqueta del rango completo ("07 ago 2026" o "01 ago – 07 ago 2026" si hasta difiere). */
  rangoLabel: string;
  totalVentas: number;
  ingresosTotales: number;
  ingresosLabel: string;
  ticketPromedio: number | null;
  ticketPromedioLabel: string;
  ventasPorHora: Array<{ hora: string; total: number; ingresos?: number }>;
  topPlatos: RankingProducto;
  topProductos: RankingProducto;
  /** Entre lo que sí se vendió al menos una vez — no es "productos sin ninguna venta". */
  productosMenosVendidos: RankingProducto;
  estadisticasTicket: {
    media: number;
    mediana: number;
    moda: number | null;
    medianaLabel: string;
    modaLabel: string;
  };
}
