// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { AppService } from './app.service';
import { PedidoActualizadoPayload, PedidoCreadoPayload, PagoRegistradoPayload, PedidoEstado, MesaActualizadaPayload, MesaEstado } from '@org/contracts';

describe('EventsController (Cuentas)', () => {
  let eventsController: EventsController;
  let appService: AppService;

  beforeEach(async () => {
    const mockAppService = {
      procesarPedidoCreado: jest.fn(),
      procesarPedidoActualizado: jest.fn(),
      procesarPagoRegistrado: jest.fn(),
      procesarMesaActualizada: jest.fn(),
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

  it('handlePedidoCreado debe llamar a appService.procesarPedidoCreado', async () => {
    const payload: PedidoCreadoPayload = {
      pedido: {
        id: 'p-1',
        mesaId: 'm-1',
        estado: PedidoEstado.Pendiente,
        items: [],
        total: 100,
        createdAt: new Date().toISOString(),
        numeroMesa: 1
      }
    };
    await eventsController.handlePedidoCreado(payload);
    expect(appService.procesarPedidoCreado).toHaveBeenCalledWith(payload);
  });

  it('handlePedidoActualizado debe llamar a appService.procesarPedidoActualizado', async () => {
    const payload: PedidoActualizadoPayload = {
      pedido: {
        id: 'p-1',
        mesaId: 'm-1',
        estado: PedidoEstado.Entregado,
        items: [],
        total: 100,
        createdAt: new Date().toISOString(),
        numeroMesa: 1
      }
    };
    await eventsController.handlePedidoActualizado(payload);
    expect(appService.procesarPedidoActualizado).toHaveBeenCalledWith(payload);
  });

  it('handlePagoRegistrado debe llamar a appService.procesarPagoRegistrado', async () => {
    const payload: PagoRegistradoPayload = {
      transaccionId: 't-1',
      cuentaId: 'c-1',
      mesaId: 'm-1',
      monto: 100,
      metodo: 'EFECTIVO',
      pendiente: 0,
    };
    await eventsController.handlePagoRegistrado(payload);
    expect(appService.procesarPagoRegistrado).toHaveBeenCalledWith(payload);
  });

  it('handleMesaActualizada debe llamar a appService.procesarMesaActualizada', async () => {
    const payload: MesaActualizadaPayload = {
      mesa: {
        id: 'm-1',
        sedeId: 's-1',
        numero: 2,
        capacidad: 4,
        ubicacionId: 'u-1',
        ubicacion: 'Salón',
        estado: MesaEstado.Libre,
        cuentaAsociada: null,
      },
    };
    await eventsController.handleMesaActualizada(payload);
    expect(appService.procesarMesaActualizada).toHaveBeenCalledWith(payload);
  });
});
