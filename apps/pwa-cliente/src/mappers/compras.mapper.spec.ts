import { describe, it, expect } from 'vitest';
import { formatMoney, mapInsumo, mapMovimientoInsumo, mapMovimientosInsumo, mapOrden, mapProveedor } from './compras.mapper';
import type { InsumoDto, MovimientoInsumoDto, OrdenCompraDto, ProveedorDto } from '../types/compras.types';

function movimiento(overrides: Partial<MovimientoInsumoDto> = {}): MovimientoInsumoDto {
  return {
    id: 'mv-1',
    sedeId: 's1',
    insumoId: 'i-1',
    insumoNombre: 'Arroz',
    unidad: 'kg',
    tipo: 'SALIDA_CONSUMO',
    delta: -2.5,
    stockAntes: 10,
    stockDespues: 7.5,
    costoUnitario: 4.5,
    costoTotal: 11.25,
    motivo: 'Menú del día',
    observacion: null,
    recepcionId: null,
    usuarioId: 'u-1',
    usuarioNombre: 'Rosa',
    createdAt: '2026-08-24T15:00:00.000Z',
    ...overrides,
  };
}

describe('compras.mapper (frontend)', () => {
  it('formatMoney formatea en soles', () => {
    expect(formatMoney(42)).toContain('42.00');
  });

  it('mapProveedor calcula las iniciales del nombre', () => {
    const dto: ProveedorDto = {
      id: 'pr-1', sedeId: 's1', nombre: 'Pesquera del Sur', ruc: null, categoria: null,
      contacto: null, telefono: null, diasEntrega: null, condicionPago: null, activo: true,
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    expect(mapProveedor(dto).iniciales).toBe('PD');
  });

  it('mapInsumo marca bajoMinimo cuando stockActual <= stockMinimo', () => {
    const dto: InsumoDto = {
      id: 'i-1', sedeId: 's1', nombre: 'Pescado', unidad: 'kg', stockActual: 1, stockMinimo: 3,
      costoUnitario: 28, proveedorId: null, proveedorNombre: null, productoId: null,
      factorConversion: 1, activo: true, createdAt: '2026-06-01T00:00:00.000Z',
    };
    expect(mapInsumo(dto).bajoMinimo).toBe(true);
    expect(mapInsumo({ ...dto, stockActual: 40 }).bajoMinimo).toBe(false);
  });

  it('mapOrden deriva pendiente/subtotal por ítem y los flags puede* según el estado', () => {
    const dto: OrdenCompraDto = {
      id: 'oc-1', sedeId: 's1', codigo: 'OC-1001', proveedorId: null, proveedorNombre: 'X',
      estado: 'PARCIAL', fechaEmision: '2026-06-01T00:00:00.000Z', fechaEnvio: null,
      fechaEntregaEsperada: null, fechaCierre: null, moneda: 'PEN', total: 336, notas: null,
      usuarioId: null, usuarioNombre: null,
      items: [
        { id: 'it-1', insumoId: 'i-1', insumoNombre: 'Pescado', unidad: 'kg', cantidadPedida: 12, cantidadRecibida: 5, costoUnitario: 28 },
      ],
      createdAt: '2026-06-01T00:00:00.000Z',
      comprobantesCount: 0,
    };
    const vm = mapOrden(dto);

    expect(vm.items[0].pendiente).toBe(7);
    expect(vm.items[0].subtotal).toBe(336);
    expect(vm.estadoLabel).toBe('Recepción parcial');
    expect(vm.puedeRecibir).toBe(true);
    expect(vm.puedeEnviar).toBe(false);
    expect(vm.puedeEditar).toBe(false);
    expect(vm.puedeAnular).toBe(true);
  });

  describe('mapMovimientoInsumo (T-50)', () => {
    it('una salida se marca con signo menos y bandera esSalida', () => {
      const vm = mapMovimientoInsumo(movimiento());

      expect(vm.esSalida).toBe(true);
      expect(vm.deltaLabel).toBe('−2.5 kg');
      expect(vm.tipoLabel).toBe('Consumo de cocina');
      expect(vm.tipoClass).toBe('badge-info');
    });

    it('una entrada se marca con signo más', () => {
      const vm = mapMovimientoInsumo(movimiento({ tipo: 'ENTRADA_COMPRA', delta: 10, stockAntes: 0, stockDespues: 10 }));

      expect(vm.esSalida).toBe(false);
      expect(vm.deltaLabel).toBe('+10 kg');
      expect(vm.tipoLabel).toBe('Entrada por compra');
    });

    it('el ajuste por conteo puede ir en negativo y se etiqueta como ajuste', () => {
      const vm = mapMovimientoInsumo(movimiento({ tipo: 'AJUSTE_CONTEO', delta: -2 }));

      expect(vm.tipoLabel).toBe('Ajuste por conteo');
      expect(vm.tipoClass).toBe('badge-warn');
      expect(vm.deltaLabel).toBe('−2 kg');
    });

    it('sin costo unitario el costo total se muestra como guion', () => {
      const vm = mapMovimientoInsumo(movimiento({ costoUnitario: null, costoTotal: null }));
      expect(vm.costoTotalLabel).toBe('—');
    });

    it('una fecha inválida no rompe la fila del kardex', () => {
      const vm = mapMovimientoInsumo(movimiento({ createdAt: 'no-es-fecha' }));
      expect(vm.fechaLabel).toBe('—');
    });

    it('mapMovimientosInsumo mapea la lista completa', () => {
      const vms = mapMovimientosInsumo([movimiento(), movimiento({ id: 'mv-2' })]);
      expect(vms).toHaveLength(2);
      expect(vms[1].id).toBe('mv-2');
    });
  });
});
