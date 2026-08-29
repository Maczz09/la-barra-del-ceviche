// @ts-nocheck
/* eslint-disable */

import { CuentaMesaReconciliacionService } from './cuenta-mesa-reconciliacion.service';
import { CuentaEstado } from '@org/contracts';

/**
 * Barrido de respaldo: reconcilia cuentas ABIERTA cuya mesa ya no las
 * referencia (el evento MesaActualizada que hubiera enganchado esto pudo
 * perderse, o la cuenta quedó huérfana antes de que ese handler existiera).
 */
function makeService() {
  const cuentaAbierta = {
    id: 'c-001',
    mesaId: 'm-001',
    estado: CuentaEstado.Abierta,
    createdAt: new Date(Date.now() - 10 * 60 * 1000),
  };
  const prisma = {
    cuenta: {
      findMany: jest.fn().mockResolvedValue([cuentaAbierta]),
    },
  };
  const mesasHttp = {
    obtenerMesa: jest.fn().mockResolvedValue({ id: 'm-001', estado: 'LIBRE', cuentaAsociada: null }),
  };
  const appService = {
    cancelarCuenta: jest.fn().mockResolvedValue({ message: 'Cuenta cancelada exitosamente' }),
  };
  const service = new CuentaMesaReconciliacionService(prisma as any, mesasHttp as any, appService as any);
  return { service, prisma, mesasHttp, appService, cuentaAbierta };
}

describe('CuentaMesaReconciliacionService', () => {
  it('cuenta huérfana (mesa sin cuentaAsociada): la cancela', async () => {
    const { service, appService } = makeService();

    await service.reconciliarCuentasHuerfanas();

    expect(appService.cancelarCuenta).toHaveBeenCalledWith('c-001');
  });

  it('cuenta huérfana (mesa apunta a otra cuenta): la cancela', async () => {
    const { service, mesasHttp, appService } = makeService();
    mesasHttp.obtenerMesa.mockResolvedValue({ id: 'm-001', estado: 'OCUPADA', cuentaAsociada: 'c-otra' });

    await service.reconciliarCuentasHuerfanas();

    expect(appService.cancelarCuenta).toHaveBeenCalledWith('c-001');
  });

  it('cuenta vigente (mesa sigue apuntando a ella): no la toca', async () => {
    const { service, mesasHttp, appService } = makeService();
    mesasHttp.obtenerMesa.mockResolvedValue({ id: 'm-001', estado: 'OCUPADA', cuentaAsociada: 'c-001' });

    await service.reconciliarCuentasHuerfanas();

    expect(appService.cancelarCuenta).not.toHaveBeenCalled();
  });

  it('sin cuentas ABIERTA elegibles: no consulta mesas', async () => {
    const { service, prisma, mesasHttp } = makeService();
    prisma.cuenta.findMany.mockResolvedValue([]);

    await service.reconciliarCuentasHuerfanas();

    expect(mesasHttp.obtenerMesa).not.toHaveBeenCalled();
  });

  it('mesas no responde (obtenerMesa devuelve null): no cancela, no lanza', async () => {
    const { service, mesasHttp, appService } = makeService();
    mesasHttp.obtenerMesa.mockResolvedValue(null);

    await expect(service.reconciliarCuentasHuerfanas()).resolves.toBeUndefined();

    expect(appService.cancelarCuenta).not.toHaveBeenCalled();
  });

  it('cancelarCuenta falla (carrera): no propaga el error', async () => {
    const { service, appService } = makeService();
    appService.cancelarCuenta.mockRejectedValue(new Error('La cuenta no está abierta.'));

    await expect(service.reconciliarCuentasHuerfanas()).resolves.toBeUndefined();
  });

  it('solo considera cuentas ABIERTA más viejas que el umbral (findMany filtrado por createdAt)', async () => {
    const { service, prisma } = makeService();

    await service.reconciliarCuentasHuerfanas();

    const where = prisma.cuenta.findMany.mock.calls[0][0].where;
    expect(where.estado).toBe(CuentaEstado.Abierta);
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });
});
