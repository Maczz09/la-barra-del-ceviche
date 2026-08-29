// mappers/reporte.mapper.ts - ResumenDto -> ResumenVM

import type { ResumenDto, ResumenVM } from '../types/reporte.types';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(value);
}

function formatFecha(value: Date): string {
  return value.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mismoDia(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function mapResumen(dto: ResumenDto): ResumenVM {
  const fecha = new Date(dto.fecha);
  const hasta = dto.hasta ? new Date(dto.hasta) : null;
  const ticketPromedio = dto.totalVentas > 0 ? dto.ingresosTotales / dto.totalVentas : null;

  const fechaLabel = Number.isNaN(fecha.getTime())
    ? dto.fecha
    : fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });

  const rangoLabel = (() => {
    if (Number.isNaN(fecha.getTime())) return dto.fecha;
    if (!hasta || Number.isNaN(hasta.getTime()) || mismoDia(fecha, hasta)) return fechaLabel;
    return `${formatFecha(fecha)} – ${formatFecha(hasta)}`;
  })();

  return {
    fecha: dto.fecha,
    fechaLabel,
    rangoLabel,
    totalVentas: dto.totalVentas,
    ingresosTotales: dto.ingresosTotales,
    ingresosLabel: formatMoney(dto.ingresosTotales),
    ticketPromedio,
    ticketPromedioLabel: ticketPromedio === null ? 'Sin ventas' : formatMoney(ticketPromedio),
    ventasPorHora: dto.ventasPorHora ?? [],
    topPlatos: dto.topPlatos ?? [],
    topProductos: dto.topProductos ?? [],
    productosMenosVendidos: dto.productosMenosVendidos ?? [],
    estadisticasTicket: {
      media: dto.estadisticasTicket?.media ?? 0,
      mediana: dto.estadisticasTicket?.mediana ?? 0,
      moda: dto.estadisticasTicket?.moda ?? null,
      medianaLabel: dto.estadisticasTicket ? formatMoney(dto.estadisticasTicket.mediana) : 'Sin ventas',
      modaLabel: dto.estadisticasTicket?.moda == null ? 'Sin moda repetida' : formatMoney(dto.estadisticasTicket.moda),
    },
  };
}
