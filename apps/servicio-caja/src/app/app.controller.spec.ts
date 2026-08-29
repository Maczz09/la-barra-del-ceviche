// @ts-nocheck
/* eslint-disable */

import { AppController } from './app.controller';

// El controller es delegación pura sobre AppService: cada endpoint reenvía sus
// argumentos al método de servicio correspondiente (y el usuario actual cuando aplica).
describe('AppController — Caja', () => {
  let service: Record<string, ReturnType<typeof jest.fn>>;
  let controller: AppController;

  beforeEach(() => {
    service = {
      registrarPago: jest.fn().mockResolvedValue({ ok: true }),
      listarTransacciones: jest.fn().mockResolvedValue({ data: [] }),
      listarTurnos: jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
      abrirTurno: jest.fn().mockResolvedValue({ id: 'turno-1' }),
      obtenerTurnoActivo: jest.fn().mockResolvedValue(null),
      obtenerResumenTurnoActivo: jest.fn().mockResolvedValue({ turno: null }),
      obtenerResumenTurno: jest.fn().mockResolvedValue({ turno: { id: 't-1' } }),
      listarMovimientosTurno: jest.fn().mockResolvedValue({ data: [] }),
      crearMovimiento: jest.fn().mockResolvedValue({ id: 'mov-1' }),
      registrarArqueo: jest.fn().mockResolvedValue({ id: 'arq-1' }),
      cerrarTurno: jest.fn().mockResolvedValue({ turno: { estado: 'CERRADA' } }),
      obtenerTransaccion: jest.fn().mockResolvedValue({ id: 't-1' }),
      actualizarTransaccion: jest.fn().mockResolvedValue({ message: 'Transacción actualizada', transaccion: { id: 't-1' } }),
    };
    controller = new AppController(service as any);
  });

  it('registrarPago delega con el usuario actual (id y nombre)', async () => {
    const body = { cuentaId: 'c-1', montoRecibido: 50, metodo: 'EFECTIVO' } as any;
    await controller.registrarPago(body, 'u-1', 'Cajero Uno', null, 'sede-001');
    expect(service.registrarPago).toHaveBeenCalledWith(body, 'u-1', 'Cajero Uno', 'sede-001');
  });

  it('registrarPago cae a email si no hay nombre, y a usuarioId si no hay ninguno', async () => {
    const body = { cuentaId: 'c-1', montoRecibido: 50, metodo: 'EFECTIVO' } as any;
    await controller.registrarPago(body, 'u-1', null, 'cajero@nachopps.pe', 'sede-001');
    expect(service.registrarPago).toHaveBeenCalledWith(body, 'u-1', 'cajero@nachopps.pe', 'sede-001');
  });

  it('P-62: registrarPago acepta token S2S sin email/nombre', async () => {
    const body = { cuentaId: 'c-1', montoRecibido: 50, metodo: 'EFECTIVO' } as any;
    await expect(controller.registrarPago(body, 'svc-caja', null, null, null)).resolves.toEqual({ ok: true });
    expect(service.registrarPago).toHaveBeenCalledWith(body, 'svc-caja', 'svc-caja', null);
  });

  it('listarTurnos delega el query (historial de cierres)', async () => {
    await controller.listarTurnos({ estado: 'CERRADA', limit: 10 } as any, 'sede-001');
    expect(service.listarTurnos).toHaveBeenCalledWith({ estado: 'CERRADA', limit: 10 }, 'sede-001');
  });

  it('listarTransacciones delega el query', async () => {
    await controller.listarTransacciones({ limit: 10 } as any, 'sede-001');
    expect(service.listarTransacciones).toHaveBeenCalledWith({ limit: 10 }, 'sede-001');
  });

  it('abrirTurno delega body y usuario', async () => {
    await controller.abrirTurno({ fondoInicial: 100 } as any, 'u-1', 'sede-001');
    expect(service.abrirTurno).toHaveBeenCalledWith({ fondoInicial: 100 }, 'u-1', 'sede-001', undefined);
  });

  it('obtenerTurnoActivo / resumenActivo delegan el usuario', async () => {
    await controller.obtenerTurnoActivo('u-1', 'sede-001');
    await controller.obtenerResumenTurnoActivo('u-1', 'sede-001');
    expect(service.obtenerTurnoActivo).toHaveBeenCalledWith('sede-001', undefined);
    expect(service.obtenerResumenTurnoActivo).toHaveBeenCalledWith('sede-001', undefined);
  });

  it('obtenerResumenTurno / listarMovimientosTurno delegan el id', async () => {
    await controller.obtenerResumenTurno('turno-1', 'sede-001');
    await controller.listarMovimientosTurno('turno-1', 'sede-001');
    expect(service.obtenerResumenTurno).toHaveBeenCalledWith('turno-1', 'sede-001');
    expect(service.listarMovimientosTurno).toHaveBeenCalledWith('turno-1', 'sede-001', undefined);
  });

  it('listarMovimientosTurno delega el search', async () => {
    await controller.listarMovimientosTurno('turno-1', 'sede-001', 'A0000042');
    expect(service.listarMovimientosTurno).toHaveBeenCalledWith('turno-1', 'sede-001', 'A0000042');
  });

  it('crearMovimiento delega id y body', async () => {
    const body = { tipo: 'INGRESO', monto: 10, donde: 'caja' } as any;
    await controller.crearMovimiento('turno-1', body, 'sede-001');
    expect(service.crearMovimiento).toHaveBeenCalledWith('turno-1', body, 'sede-001');
  });

  it('registrarArqueo delega id, body y usuario', async () => {
    const body = { denominaciones: {} } as any;
    await controller.registrarArqueo('turno-1', body, 'u-1', 'sede-001');
    expect(service.registrarArqueo).toHaveBeenCalledWith('turno-1', body, 'u-1', 'sede-001');
  });

  it('cerrarTurno delega id, body y usuario', async () => {
    const body = { denominaciones: {} } as any;
    await controller.cerrarTurno('turno-1', body, 'u-1', 'sede-001');
    expect(service.cerrarTurno).toHaveBeenCalledWith('turno-1', body, 'u-1', 'sede-001');
  });

  it('obtenerTransaccion delega el id', async () => {
    await controller.obtenerTransaccion('t-1', 'sede-001');
    expect(service.obtenerTransaccion).toHaveBeenCalledWith('t-1', 'sede-001');
  });

  it('actualizarTransaccion delega id y body', async () => {
    const body = { metodo: 'EFECTIVO' } as any;
    await controller.actualizarTransaccion('t-1', body, 'sede-001');
    expect(service.actualizarTransaccion).toHaveBeenCalledWith('t-1', body, 'sede-001');
  });
});
