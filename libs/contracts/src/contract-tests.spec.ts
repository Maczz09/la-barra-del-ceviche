import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  PedidoCreadoPayload,
  ProductoActualizadoPayload,
  StockInsuficientePayload,
  PagoRegistradoPayload,
  MesaDto,
  CompraRecibidaPayload,
  RoutingKeys,
} from './index';

/**
 * Contract tests entre servicios (plan 4.3).
 *
 * Cada consumidor (@EventPattern) depende de la forma EXACTA del payload de
 * @org/contracts. Aquí validamos un "golden sample" por evento contra su DTO
 * con class-validator: si alguien cambia el contrato de forma incompatible
 * (renombra/elimina un campo requerido) el sample deja de validar y CI falla.
 */

// { servicio consumidor, routingKey, clase de payload, sample válido, campo requerido a romper }
const pedidoDto = {
  id: 'p1',
  sedeId: 's1',
  mesaId: 'm1',
  total: 50,
  estado: 'PENDIENTE',
  createdAt: new Date().toISOString(),
  items: [{ id: 'i1', productoId: 'pr1', nombre: 'Hamburguesa', cantidad: 1, precioUnitario: 50 }],
};

const cases = [
  {
    consumer: 'servicio-inventario',
    routingKey: RoutingKeys.PedidoCreado,
    Payload: PedidoCreadoPayload,
    sample: { pedido: pedidoDto },
    breakPath: (s: { pedido?: { id?: string } }) => { if (s.pedido) delete s.pedido.id; },
  },
  {
    consumer: 'servicio-pedidos',
    routingKey: RoutingKeys.ProductoActualizado,
    Payload: ProductoActualizadoPayload,
    sample: { id: 'pr1', sedeId: 's1', nombre: 'Hamburguesa', precio: 50, disponible: true, stockActual: 10 },
    breakPath: (s: { id?: string }) => { delete s.id; },
  },
  {
    consumer: 'servicio-pedidos',
    routingKey: RoutingKeys.StockInsuficiente,
    Payload: StockInsuficientePayload,
    sample: { pedidoId: 'p1', productoId: 'pr1', solicitado: 5, disponible: 1 },
    breakPath: (s: { pedidoId?: string }) => { delete s.pedidoId; },
  },
  {
    consumer: 'servicio-pedidos',
    routingKey: RoutingKeys.PagoRegistrado,
    Payload: PagoRegistradoPayload,
    sample: { transaccionId: 't1', cuentaId: 'c1', mesaId: 'm1', monto: 100, metodo: 'EFECTIVO', pendiente: 0 },
    breakPath: (s: { monto?: number }) => { delete s.monto; },
  },
  {
    // El consumidor lee payload.mesa como MesaDto, así que validamos ese contrato.
    consumer: 'servicio-pedidos',
    routingKey: RoutingKeys.MesaCreada,
    Payload: MesaDto,
    sample: { id: 'm1', sedeId: 's1', numero: 1, capacidad: 4, ubicacionId: 'u1', ubicacion: 'SALON', estado: 'LIBRE' },
    breakPath: (s: { numero?: number }) => { delete s.numero; },
  },
  {
    consumer: 'servicio-inventario',
    routingKey: RoutingKeys.CompraRecibida,
    Payload: CompraRecibidaPayload,
    sample: {
      recepcionId: 'rc1',
      ordenId: 'oc1',
      sedeId: 's1',
      lineas: [
        { insumoId: 'i1', insumoNombre: 'Pisco', productoId: 'pr1', cantidadRecibida: 12, cantidadStockVenta: 12 },
      ],
    },
    breakPath: (s: { recepcionId?: string }) => { delete s.recepcionId; },
  },
] as const;

describe('Contract tests — @EventPattern ↔ @org/contracts', () => {
  for (const c of cases) {
    describe(`${c.consumer} consume ${c.routingKey}`, () => {
      it('el golden sample valida contra el contrato', () => {
        const PayloadClass = c.Payload as new () => unknown;
        const instance = plainToInstance(PayloadClass, structuredClone(c.sample), {
          enableImplicitConversion: false,
        });
        const errors = validateSync(instance as object, { whitelist: false });
        expect(errors).toEqual([]);
      });

      it('un payload que rompe el contrato falla la validación', () => {
        const bad = structuredClone(c.sample);
        c.breakPath(bad);
        const PayloadClass = c.Payload as new () => unknown;
        const instance = plainToInstance(PayloadClass, bad);
        const errors = validateSync(instance as object);
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  }

  it('todas las routing keys consumidas existen en el contrato', () => {
    for (const c of cases) {
      expect(Object.values(RoutingKeys)).toContain(c.routingKey);
    }
  });
});
