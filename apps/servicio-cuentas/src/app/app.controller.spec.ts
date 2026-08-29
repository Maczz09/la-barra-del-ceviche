// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RolesGuard } from '@org/shared-auth';
import {
  AbrirCuentaCommand,
  CerrarCuentaCommand,
  DividirCuentaCommand
} from '@org/contracts';

describe('AppController (Cuentas)', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const mockAppService = {
      abrirCuenta: jest.fn(),
      obtenerCuentaPorMesa: jest.fn(),
      obtenerCuenta: jest.fn(),
      dividirCuenta: jest.fn(),
      cerrarCuenta: jest.fn(),
      cancelarCuenta: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  it('debe estar definido', () => {
    expect(appController).toBeDefined();
  });

  it('healthCheck debe devolver status OK', () => {
    expect(appController.healthCheck()).toEqual({ status: 'OK', service: 'Cuentas' });
  });

  it('abrirCuenta debe llamar a appService.abrirCuenta', async () => {
    const command: AbrirCuentaCommand = { mesaId: 'm-1' };
    const expectedResult = { message: 'Cuenta abierta exitosamente', cuenta: { id: 'c-1', mesaId: 'm-1', pedidos: [], total: 0, estado: 'ABIERTA', ticket: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
    jest.spyOn(appService, 'abrirCuenta').mockResolvedValue(expectedResult as any);

    const result = await appController.abrirCuenta(command, 'sede-001');
    expect(appService.abrirCuenta).toHaveBeenCalledWith(command, 'sede-001', undefined);
    expect(result).toEqual(expectedResult);
  });

  it('obtenerCuentaPorMesa debe llamar a appService.obtenerCuentaPorMesa', async () => {
    const mesaId = 'm-1';
    const expectedResult = { id: 'c-1', mesaId, pedidos: [], total: 0, estado: 'ABIERTA', ticket: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    jest.spyOn(appService, 'obtenerCuentaPorMesa').mockResolvedValue(expectedResult as any);

    const result = await appController.obtenerCuentaPorMesa(mesaId);
    expect(appService.obtenerCuentaPorMesa).toHaveBeenCalledWith(mesaId);
    expect(result).toEqual(expectedResult);
  });

  it('obtenerCuenta debe llamar a appService.obtenerCuenta', async () => {
    const id = 'c-1';
    const expectedResult = { id, mesaId: 'm-1', pedidos: [], total: 0, estado: 'ABIERTA', ticket: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    jest.spyOn(appService, 'obtenerCuenta').mockResolvedValue(expectedResult as any);

    const result = await appController.obtenerCuenta(id);
    expect(appService.obtenerCuenta).toHaveBeenCalledWith(id);
    expect(result).toEqual(expectedResult);
  });

  it('dividirCuenta debe llamar a appService.dividirCuenta', async () => {
    const id = 'c-1';
    const command: DividirCuentaCommand = { metodo: 'IGUALES', numPartes: 2 };
    const expectedResult = { metodo: 'IGUALES' as const, partes: [{ parte: 1, monto: 50 }, { parte: 2, monto: 50 }] };
    jest.spyOn(appService, 'dividirCuenta').mockResolvedValue(expectedResult);

    const result = await appController.dividirCuenta(id, command);
    expect(appService.dividirCuenta).toHaveBeenCalledWith(id, command);
    expect(result).toEqual(expectedResult);
  });

  it('cerrarCuenta debe llamar a appService.cerrarCuenta', async () => {
    const id = 'c-1';
    const command: CerrarCuentaCommand = { descuento: 10 };
    const expectedResult = { message: 'Cuenta cerrada exitosamente', ticket: { id: 't-1', cuentaId: id, mesaId: 'm-1', items: [], subtotal: 100, descuento: 10, total: 90, fecha: new Date().toISOString() } };
    jest.spyOn(appService, 'cerrarCuenta').mockResolvedValue(expectedResult as any);

    const result = await appController.cerrarCuenta(id, command);
    expect(appService.cerrarCuenta).toHaveBeenCalledWith(id, command);
    expect(result).toEqual(expectedResult);
  });

  it('cancelarCuenta debe llamar a appService.cancelarCuenta', async () => {
    const id = 'c-1';
    const expectedResult = { message: 'Cuenta cancelada exitosamente' };
    jest.spyOn(appService, 'cancelarCuenta').mockResolvedValue(expectedResult as any);

    const result = await appController.cancelarCuenta(id);
    expect(appService.cancelarCuenta).toHaveBeenCalledWith(id);
    expect(result).toEqual(expectedResult);
  });
});
