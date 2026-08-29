// @ts-nocheck
/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { AppService } from './app.service';
import { PedidoCreadoPayload, PedidoEstado, PedidoItemAnuladoConMermaPayload, StockRestauradoPayload } from '@org/contracts';

describe('EventsController (Inventario)', () => {
  let eventsController: EventsController;
  let appService: AppService;

  beforeEach(async () => {
    const mockAppService = {
      procesarPedidoCreado: jest.fn(),
      procesarCompraRecibida: jest.fn(),
      procesarItemAnuladoConMerma: jest.fn(),
      procesarStockRestaurado: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    eventsController = app.get<EventsController>(EventsController);
    appService = app.get<AppService>(AppService);
  });

  it('debe estar definido', () => {
    expect(eventsController).toBeDefined();
  });

  it('handlePedidoCreado debe llamar a appService.procesarPedidoCreado con el pedido del payload', async () => {
    const pedido = {
      id: 'pedido-1',
      mesaId: 'mesa-1',
      items: [{ id: 'i-001', productoId: 'p-1', cantidad: 2, precioUnitario: 10, nombre: 'Test' }],
      total: 20,
      estado: PedidoEstado.Pendiente,
      createdAt: new Date().toISOString(),
      numeroMesa: 1,
    };
    const payload: PedidoCreadoPayload = { pedido };

    jest.spyOn(appService, 'procesarPedidoCreado').mockResolvedValue({} as any);

    await eventsController.handlePedidoCreado(payload);

    expect(appService.procesarPedidoCreado).toHaveBeenCalledWith(pedido);
  });

  it('debe propagar errores del servicio', async () => {
    const pedido = {
      id: 'pedido-err',
      mesaId: 'mesa-1',
      items: [],
      total: 0,
      estado: PedidoEstado.Pendiente,
      createdAt: new Date().toISOString(),
      numeroMesa: 1,
    };
    const payload: PedidoCreadoPayload = { pedido };

    jest.spyOn(appService, 'procesarPedidoCreado').mockRejectedValue(new Error('fail'));

    await expect(eventsController.handlePedidoCreado(payload)).rejects.toThrow('fail');
  });

  it('handlePedidoItemAnuladoConMerma debe llamar a appService.procesarItemAnuladoConMerma con el payload', async () => {
    const payload: PedidoItemAnuladoConMermaPayload = {
      eventId: 'evt-1', pedidoId: 'pedido-1', itemId: 'item-1', productoId: 'p-1',
      productoNombre: 'Cerveza', cantidad: 1, motivo: 'Cliente se retiró', cobrado: false,
    };

    jest.spyOn(appService, 'procesarItemAnuladoConMerma').mockResolvedValue(undefined);

    await eventsController.handlePedidoItemAnuladoConMerma(payload);

    expect(appService.procesarItemAnuladoConMerma).toHaveBeenCalledWith(payload);
  });

  it('handleStockRestaurado debe llamar a appService.procesarStockRestaurado con el payload', async () => {
    const payload: StockRestauradoPayload = { eventId: 'evt-2', productoId: 'p-1', cantidad: 2, motivo: 'Mesa anulada' };

    jest.spyOn(appService, 'procesarStockRestaurado').mockResolvedValue(undefined);

    await eventsController.handleStockRestaurado(payload);

    expect(appService.procesarStockRestaurado).toHaveBeenCalledWith(payload);
  });
});
