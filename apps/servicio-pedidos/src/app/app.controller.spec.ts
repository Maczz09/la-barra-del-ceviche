// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

jest.mock('@org/resiliencia', () => {
  const actual = jest.requireActual('@org/resiliencia') as any;
  return {
    ...actual,
    RabbitMQRetryInterceptor: class { intercept(ctx: any, next: any) { return next.handle(); } },
    IdempotencyInterceptor: class { intercept(ctx: any, next: any) { return next.handle(); } },
    CircuitBreakerOptions: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

describe('AppController', () => {
  let controller: AppController;
  let appService: jest.Mocked<AppService>;

  beforeEach(async () => {
    appService = {
      crearPedido: jest.fn(),
      listarPedidos: jest.fn(),
      actualizarEstado: jest.fn(),
      actualizarEstadoItem: jest.fn(),
      procesarPagoRecibido: jest.fn(),
      anularItemPreparado: jest.fn(),
      listarAnulaciones: jest.fn(),
      actualizarAnulacion: jest.fn(),
      invalidarAnulacion: jest.fn(),
      anularAtencionMesa: jest.fn(),
    } as unknown as jest.Mocked<AppService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: appService },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('crearPedido', () => {
    it('should create order with user details', async () => {
      appService.crearPedido.mockResolvedValue('pedido' as any);
      const result = await controller.crearPedido({ mesaId: 'm1', items: [] }, 'u1', 'nombre1', 'email1');
      expect(result).toBe('pedido');
      expect(appService.crearPedido).toHaveBeenCalledWith({ mesaId: 'm1', items: [] }, { id: 'u1', nombre: 'nombre1' });
    });

    it('should create order with user id as name fallback if no name/email', async () => {
      appService.crearPedido.mockResolvedValue('pedido2' as any);
      const result = await controller.crearPedido({ mesaId: 'm2', items: [] }, 'u2', null, null);
      expect(result).toBe('pedido2');
      expect(appService.crearPedido).toHaveBeenCalledWith({ mesaId: 'm2', items: [] }, { id: 'u2', nombre: 'u2' });
    });

    it('should create order with no user', async () => {
      appService.crearPedido.mockResolvedValue('pedido3' as any);
      const result = await controller.crearPedido({ mesaId: 'm3', items: [] }, null, null, null);
      expect(result).toBe('pedido3');
      expect(appService.crearPedido).toHaveBeenCalledWith({ mesaId: 'm3', items: [] }, null);
    });
  });

  describe('listarPedidos', () => {
    it('should list orders', async () => {
      appService.listarPedidos.mockResolvedValue(['p1'] as any);
      const result = await controller.listarPedidos({}, 'sede-001');
      expect(result).toEqual(['p1']);
      expect(appService.listarPedidos).toHaveBeenCalledWith({}, 'sede-001');
    });
  });

  describe('actualizarEstado', () => {
    it('should update order state', async () => {
      appService.actualizarEstado.mockResolvedValue('updated' as any);
      const result = await controller.actualizarEstado('id1', { estado: 'EN_PREPARACION' } as any);
      expect(result).toBe('updated');
      expect(appService.actualizarEstado).toHaveBeenCalledWith('id1', { estado: 'EN_PREPARACION' });
    });
  });

  describe('actualizarEstadoItem', () => {
    it('should update item state', async () => {
      appService.actualizarEstadoItem.mockResolvedValue('item_updated' as any);
      const result = await controller.actualizarEstadoItem('itemId1', { estado: 'LISTO' } as any, 'u1', 'Ana');
      expect(result).toBe('item_updated');
      expect(appService.actualizarEstadoItem).toHaveBeenCalledWith('itemId1', { estado: 'LISTO' }, 'u1', 'Ana');
    });
  });

  describe('anularItemPreparado', () => {
    it('should delegate to appService with sede/usuario resolved from the request', async () => {
      appService.anularItemPreparado.mockResolvedValue('anulado' as any);
      const result = await controller.anularItemPreparado(
        'itemId1', { motivo: 'Se cayó', cobrar: false } as any, 'sede-001', 'u1', 'Ana', undefined,
      );
      expect(result).toBe('anulado');
      expect(appService.anularItemPreparado).toHaveBeenCalledWith(
        'itemId1', { motivo: 'Se cayó', cobrar: false }, 'sede-001', undefined, 'u1', 'Ana',
      );
    });
  });

  describe('anularAtencionMesa', () => {
    it('should delegate to appService with sede/usuario resolved from the request', async () => {
      appService.anularAtencionMesa.mockResolvedValue('anulada' as any);
      const result = await controller.anularAtencionMesa(
        'mesaId1', { motivo: 'Cliente se retiró' } as any, 'sede-001', 'u1', 'Ana', undefined,
      );
      expect(result).toBe('anulada');
      expect(appService.anularAtencionMesa).toHaveBeenCalledWith(
        'mesaId1', { motivo: 'Cliente se retiró' }, 'sede-001', undefined, 'u1', 'Ana',
      );
    });
  });

  describe('listarAnulaciones', () => {
    it('should list anulaciones for the resolved sede', async () => {
      appService.listarAnulaciones.mockResolvedValue({ anulaciones: [] } as any);
      const result = await controller.listarAnulaciones({}, 'sede-001');
      expect(result).toEqual({ anulaciones: [] });
      expect(appService.listarAnulaciones).toHaveBeenCalledWith({}, 'sede-001', undefined);
    });
  });

  describe('actualizarAnulacion', () => {
    it('should update motivo/observacion', async () => {
      appService.actualizarAnulacion.mockResolvedValue('updated' as any);
      const result = await controller.actualizarAnulacion('aud-1', { motivo: 'Corregido' } as any, 'sede-001');
      expect(result).toBe('updated');
      expect(appService.actualizarAnulacion).toHaveBeenCalledWith('aud-1', { motivo: 'Corregido' }, 'sede-001', undefined);
    });
  });

  describe('invalidarAnulacion', () => {
    it('should invalidate with the usuario name from the request', async () => {
      appService.invalidarAnulacion.mockResolvedValue('invalidada' as any);
      const result = await controller.invalidarAnulacion('aud-1', { motivo: 'Error' } as any, 'sede-001', 'Gerente', undefined);
      expect(result).toBe('invalidada');
      expect(appService.invalidarAnulacion).toHaveBeenCalledWith('aud-1', { motivo: 'Error' }, 'sede-001', undefined, 'Gerente');
    });
  });

  describe('procesarPago', () => {
    it('should process payment', async () => {
      appService.procesarPagoRecibido.mockResolvedValue({} as any);
      await controller.procesarPago({ cuentaId: 'c1', mesaId: 'm1', monto: 100, metodo: 'EFECTIVO', transaccionId: 'tx1' } as any);
      expect(appService.procesarPagoRecibido).toHaveBeenCalledWith({ cuentaId: 'c1', mesaId: 'm1', monto: 100, metodo: 'EFECTIVO', transaccionId: 'tx1' });
    });
  });
});
