// @ts-nocheck
/* eslint-disable */

import { ServiceUnavailableException } from '@nestjs/common';
import { CierreReconciliacionService } from './cierre-reconciliacion.service';

/**
 * H-2: el cron reconcilia cierres remotos pendientes (pago persistido, cuenta
 * aún ABIERTA). La antigüedad se toma de la Transaccion; si cuentas responde,
 * se marca CERRADA; si cuentas sigue caído, no actualiza y no lanza.
 */
function makeService() {
  const prisma = {
    transaccion: {
      findMany: jest.fn().mockResolvedValue([{ cuentaId: 'c1' }]),
      groupBy: jest.fn().mockResolvedValue([{
        cuentaId: 'c1',
        _sum: { monto: 100 },
        _max: { descuento: 0, createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      }]),
    },
    cuentaAbierta: {
      findMany: jest.fn().mockResolvedValue([
        { cuentaId: 'c1', mesaId: 'm1', total: 100, estado: 'ABIERTA' },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const cuentasHttp = { cerrarCuenta: jest.fn().mockResolvedValue({ ticket: 't1' }) };
  const service = new CierreReconciliacionService(prisma as any, cuentasHttp as any);
  return { service, prisma, cuentasHttp };
}

describe('CierreReconciliacionService (H-2)', () => {
  it('cuenta pendiente elegible: cierra en cuentas y marca CERRADA', async () => {
    const { service, prisma, cuentasHttp } = makeService();

    await service.reconciliarCierresPendientes();

    expect(cuentasHttp.cerrarCuenta).toHaveBeenCalledWith('c1', 0);
    expect(prisma.cuentaAbierta.update).toHaveBeenCalledWith({
      where: { cuentaId: 'c1' },
      data: { estado: 'CERRADA' },
    });
  });

  it('cuentas caído (cliente lanza 503): no actualiza, no lanza, loguea', async () => {
    const { service, prisma, cuentasHttp } = makeService();
    cuentasHttp.cerrarCuenta.mockRejectedValue(new ServiceUnavailableException('cuentas caído'));

    await expect(service.reconciliarCierresPendientes()).resolves.toBeUndefined();

    expect(prisma.cuentaAbierta.update).not.toHaveBeenCalled();
  });

  it('sin transacciones viejas: no consulta cuentas abiertas ni intenta cerrar', async () => {
    const { service, prisma, cuentasHttp } = makeService();
    prisma.transaccion.findMany.mockResolvedValue([]);

    await service.reconciliarCierresPendientes();

    expect(prisma.cuentaAbierta.findMany).not.toHaveBeenCalled();
    expect(cuentasHttp.cerrarCuenta).not.toHaveBeenCalled();
  });

  it('un pago parcial viejo no cierra la cuenta con saldo pendiente', async () => {
    const { service, prisma, cuentasHttp } = makeService();
    prisma.transaccion.groupBy.mockResolvedValue([{
      cuentaId: 'c1',
      _sum: { monto: 40 },
      _max: { descuento: 0, createdAt: new Date(Date.now() - 10 * 60 * 1000) },
    }]);

    await service.reconciliarCierresPendientes();

    expect(cuentasHttp.cerrarCuenta).not.toHaveBeenCalled();
    expect(prisma.cuentaAbierta.update).not.toHaveBeenCalled();
  });

  it('espera cinco minutos desde el último tramo, no desde el primero', async () => {
    const { service, prisma, cuentasHttp } = makeService();
    prisma.transaccion.groupBy.mockResolvedValue([{
      cuentaId: 'c1',
      _sum: { monto: 100 },
      _max: { descuento: 0, createdAt: new Date() },
    }]);

    await service.reconciliarCierresPendientes();

    expect(cuentasHttp.cerrarCuenta).not.toHaveBeenCalled();
  });
});
