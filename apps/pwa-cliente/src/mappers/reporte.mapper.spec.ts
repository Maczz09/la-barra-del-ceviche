// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { mapResumen } from './reporte.mapper';

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fecha: '2026-06-07',
    totalVentas: 10,
    ingresosTotales: 1500,
    ventasPorHora: [{ hora: '12:00', total: 3, ingresos: 400 }],
    topProductos: [{ nombre: 'Nachos', cantidad: 5 }],
    ...overrides,
  };
}

describe('mapResumen', () => {
  it('mapea fecha, totalVentas e ingresosTotales', () => {
    const vm = mapResumen(dto());
    expect(vm.fecha).toBe('2026-06-07');
    expect(vm.totalVentas).toBe(10);
    expect(vm.ingresosTotales).toBe(1500);
  });

  it('fechaLabel es una cadena con la fecha formateada en español', () => {
    const vm = mapResumen(dto({ fecha: '2026-06-07' }));
    expect(typeof vm.fechaLabel).toBe('string');
    expect(vm.fechaLabel.length).toBeGreaterThan(0);
    // No debe coincidir con el formato ISO crudo
    expect(vm.fechaLabel).not.toBe('2026-06-07');
  });

  it('fechaLabel devuelve la fecha cruda si es inválida', () => {
    const vm = mapResumen(dto({ fecha: 'NO_VALIDA' }));
    expect(vm.fechaLabel).toBe('NO_VALIDA');
  });

  it('ingresosLabel es string con formato de moneda PEN', () => {
    const vm = mapResumen(dto({ ingresosTotales: 1500 }));
    expect(typeof vm.ingresosLabel).toBe('string');
    expect(vm.ingresosLabel).toContain('1');
  });

  it('ticketPromedio calcula correctamente', () => {
    const vm = mapResumen(dto({ totalVentas: 5, ingresosTotales: 500 }));
    expect(vm.ticketPromedio).toBe(100);
  });

  it('ticketPromedio es null cuando totalVentas es 0', () => {
    const vm = mapResumen(dto({ totalVentas: 0, ingresosTotales: 0 }));
    expect(vm.ticketPromedio).toBeNull();
  });

  it('ticketPromedioLabel "Sin ventas" cuando ticketPromedio es null', () => {
    const vm = mapResumen(dto({ totalVentas: 0, ingresosTotales: 0 }));
    expect(vm.ticketPromedioLabel).toBe('Sin ventas');
  });

  it('ticketPromedioLabel es string con formato de moneda cuando hay ventas', () => {
    const vm = mapResumen(dto({ totalVentas: 4, ingresosTotales: 400 }));
    expect(typeof vm.ticketPromedioLabel).toBe('string');
    expect(vm.ticketPromedioLabel).not.toBe('Sin ventas');
  });

  it('propaga ventasPorHora tal cual', () => {
    const horas = [{ hora: '14:00', total: 2 }];
    const vm = mapResumen(dto({ ventasPorHora: horas }));
    expect(vm.ventasPorHora).toEqual(horas);
  });

  it('ventasPorHora es array vacío si no viene en el DTO', () => {
    const vm = mapResumen(dto({ ventasPorHora: undefined }));
    expect(vm.ventasPorHora).toEqual([]);
  });

  it('propaga topProductos tal cual', () => {
    const prods = [{ nombre: 'Nachos', cantidad: 5 }];
    const vm = mapResumen(dto({ topProductos: prods }));
    expect(vm.topProductos).toEqual(prods);
  });

  it('topProductos es array vacío si no viene en el DTO', () => {
    const vm = mapResumen(dto({ topProductos: undefined }));
    expect(vm.topProductos).toEqual([]);
  });

  it('propaga topPlatos tal cual', () => {
    const platos = [{ nombre: 'Ceviche', cantidad: 3 }];
    const vm = mapResumen(dto({ topPlatos: platos }));
    expect(vm.topPlatos).toEqual(platos);
  });

  it('topPlatos es array vacío si no viene en el DTO', () => {
    const vm = mapResumen(dto({ topPlatos: undefined }));
    expect(vm.topPlatos).toEqual([]);
  });

  it('rangoLabel coincide con fechaLabel cuando hasta es el mismo día (o no viene)', () => {
    const sinHasta = mapResumen(dto({ fecha: '2026-06-07' }));
    expect(sinHasta.rangoLabel).toBe(sinHasta.fechaLabel);

    const mismoDia = mapResumen(dto({ fecha: '2026-06-07T08:00:00', hasta: '2026-06-07T20:00:00' }));
    expect(mismoDia.rangoLabel).toBe(mismoDia.fechaLabel);
  });

  it('rangoLabel muestra un rango cuando hasta cae en otro día', () => {
    const vm = mapResumen(dto({ fecha: '2026-06-01', hasta: '2026-06-30' }));
    expect(vm.rangoLabel).toContain('–');
    expect(vm.rangoLabel).not.toBe(vm.fechaLabel);
  });

  it('rangoLabel cae a fechaLabel si hasta es inválida', () => {
    const vm = mapResumen(dto({ fecha: '2026-06-07', hasta: 'NO_VALIDA' }));
    expect(vm.rangoLabel).toBe(vm.fechaLabel);
  });

  it('propaga productosMenosVendidos tal cual, o array vacío si no viene', () => {
    const menos = [{ nombre: 'Chicha', cantidad: 1 }];
    expect(mapResumen(dto({ productosMenosVendidos: menos })).productosMenosVendidos).toEqual(menos);
    expect(mapResumen(dto({ productosMenosVendidos: undefined })).productosMenosVendidos).toEqual([]);
  });

  it('mapea estadisticasTicket con labels formateados en moneda', () => {
    const vm = mapResumen(dto({ estadisticasTicket: { media: 50, mediana: 45, moda: 40 } }));
    expect(vm.estadisticasTicket.mediana).toBe(45);
    expect(vm.estadisticasTicket.moda).toBe(40);
    expect(vm.estadisticasTicket.medianaLabel).not.toBe('Sin ventas');
    expect(vm.estadisticasTicket.modaLabel).not.toBe('Sin moda repetida');
  });

  it('estadisticasTicket sin moda (null) muestra "Sin moda repetida"', () => {
    const vm = mapResumen(dto({ estadisticasTicket: { media: 50, mediana: 45, moda: null } }));
    expect(vm.estadisticasTicket.modaLabel).toBe('Sin moda repetida');
  });

  it('estadisticasTicket ausente en el DTO cae a valores por defecto', () => {
    const vm = mapResumen(dto({ estadisticasTicket: undefined }));
    expect(vm.estadisticasTicket).toEqual({
      media: 0,
      mediana: 0,
      moda: null,
      medianaLabel: 'Sin ventas',
      modaLabel: 'Sin moda repetida',
    });
  });
});

