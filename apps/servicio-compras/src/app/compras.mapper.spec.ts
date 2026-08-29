// @ts-nocheck

import {
  toComprobanteCompraDto,
  toInsumoDto,
  toOrdenCompraDto,
  toProveedorDto,
  toRecepcionCompraDto,
} from './compras.mapper';

function dec(n: number) {
  return { toNumber: () => n };
}

describe('compras.mapper', () => {
  it('toProveedorDto conserva ruc/categoria nulos', () => {
    const dto = toProveedorDto({
      id: 'pr-1', sedeId: 's1', nombre: 'X', ruc: null, categoria: null, contacto: null,
      telefono: null, diasEntrega: null, condicionPago: null, activo: true,
      createdAt: new Date('2026-06-01'), updatedAt: new Date('2026-06-01'),
    });
    expect(dto).toMatchObject({ id: 'pr-1', nombre: 'X', ruc: null, activo: true });
  });

  it('toInsumoDto convierte todos los Decimal a number', () => {
    const dto = toInsumoDto({
      id: 'i-1', sedeId: 's1', nombre: 'Pescado', unidad: 'kg',
      stockActual: dec(1.2), stockMinimo: dec(3), costoUnitario: dec(28.5),
      proveedorId: 'pr-1', proveedor: { nombre: 'Pesquera del Sur' },
      productoId: null, factorConversion: dec(1), activo: true, createdAt: new Date('2026-06-01'),
    });
    expect(dto.stockActual).toBe(1.2);
    expect(dto.stockMinimo).toBe(3);
    expect(dto.costoUnitario).toBe(28.5);
    expect(dto.factorConversion).toBe(1);
    expect(dto.proveedorNombre).toBe('Pesquera del Sur');
  });

  it('toOrdenCompraDto mapea items y fechas opcionales', () => {
    const dto = toOrdenCompraDto({
      id: 'oc-1', sedeId: 's1', codigo: 'OC-1001', proveedorId: null, proveedorNombre: 'X',
      estado: 'BORRADOR', fechaEmision: new Date('2026-06-01'), fechaEnvio: null,
      fechaEntregaEsperada: null, fechaCierre: null, moneda: 'PEN', total: dec(336),
      notas: null, usuarioId: null, usuarioNombre: null,
      items: [{ id: 'it-1', insumoId: 'i-1', insumoNombre: 'Pescado', unidad: 'kg', cantidadPedida: dec(12), cantidadRecibida: dec(0), costoUnitario: dec(28) }],
      createdAt: new Date('2026-06-01'),
    });
    expect(dto.total).toBe(336);
    expect(dto.items).toEqual([
      { id: 'it-1', insumoId: 'i-1', insumoNombre: 'Pescado', unidad: 'kg', cantidadPedida: 12, cantidadRecibida: 0, costoUnitario: 28 },
    ]);
    expect(dto.fechaEnvio).toBeNull();
    // Sin _count (crear/enviar/cerrar/anular no lo piden): default seguro, no falso "0 comprobantes reales".
    expect(dto.comprobantesCount).toBe(0);
  });

  it('toOrdenCompraDto propaga comprobantesCount cuando el query trae _count (listar)', () => {
    const dto = toOrdenCompraDto({
      id: 'oc-1', sedeId: 's1', codigo: 'OC-1001', proveedorId: null, proveedorNombre: 'X',
      estado: 'RECIBIDA', fechaEmision: new Date('2026-06-01'), fechaEnvio: null,
      fechaEntregaEsperada: null, fechaCierre: null, moneda: 'PEN', total: dec(336),
      notas: null, usuarioId: null, usuarioNombre: null, items: [],
      createdAt: new Date('2026-06-01'),
      _count: { comprobantes: 2 },
    });
    expect(dto.comprobantesCount).toBe(2);
  });

  it('toRecepcionCompraDto mapea items recibidos', () => {
    const dto = toRecepcionCompraDto({
      id: 'rc-1', sedeId: 's1', ordenId: 'oc-1', fecha: new Date('2026-06-02'),
      observaciones: null, usuarioId: null, usuarioNombre: null,
      items: [{ id: 'ri-1', ordenItemId: 'it-1', cantidadRecibida: dec(5), costoUnitario: dec(28) }],
      createdAt: new Date('2026-06-02'),
    });
    expect(dto.items[0]).toEqual({ id: 'ri-1', ordenItemId: 'it-1', cantidadRecibida: 5, costoUnitario: 28 });
  });

  it('toComprobanteCompraDto convierte montoTotal y fechaEmision opcionales', () => {
    const dto = toComprobanteCompraDto({
      id: 'cp-1', sedeId: 's1', ordenId: 'oc-1', recepcionId: null, tipo: 'BOLETA',
      serie: null, numero: null, fechaEmision: new Date('2026-06-02'), montoTotal: dec(150.5),
      mimeType: 'image/webp', bytes: 1234, ancho: 800, alto: 600, sha256: 'abc',
      nombreOriginal: 'foto.jpg', usuarioId: null, usuarioNombre: null, createdAt: new Date('2026-06-02'),
    });
    expect(dto.montoTotal).toBe(150.5);
    expect(dto.fechaEmision).toBe('2026-06-02');

    const sinMonto = toComprobanteCompraDto({
      id: 'cp-2', sedeId: 's1', ordenId: null, recepcionId: null, tipo: 'BOLETA',
      serie: null, numero: null, fechaEmision: null, montoTotal: null,
      mimeType: 'image/webp', bytes: 1, ancho: 1, alto: 1, sha256: 'x',
      nombreOriginal: null, usuarioId: null, usuarioNombre: null, createdAt: new Date('2026-06-02'),
    });
    expect(sinMonto.montoTotal).toBeNull();
    expect(sinMonto.fechaEmision).toBeNull();
  });
});
