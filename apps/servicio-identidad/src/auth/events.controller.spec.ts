// @ts-nocheck
/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { AuthService } from './auth.service';
import { TurnoCajaAbiertoPayload, TurnoCajaCerradoPayload } from '@org/contracts';

describe('EventsController (Identidad)', () => {
  let eventsController: EventsController;
  let authService: AuthService;

  beforeEach(async () => {
    const mockAuthService = {
      activarMeserosPorSede: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    eventsController = app.get<EventsController>(EventsController);
    authService = app.get<AuthService>(AuthService);
  });

  it('debe estar definido', () => {
    expect(eventsController).toBeDefined();
  });

  it('handleTurnoCajaAbierto activa a los meseros de la sede del payload', async () => {
    const payload: TurnoCajaAbiertoPayload = { turnoId: 'turno-1', sedeId: 'sede-1' };
    jest.spyOn(authService, 'activarMeserosPorSede').mockResolvedValue(3);

    await eventsController.handleTurnoCajaAbierto(payload);

    expect(authService.activarMeserosPorSede).toHaveBeenCalledWith('sede-1', true);
  });

  it('handleTurnoCajaCerrado desactiva a los meseros de la sede del payload', async () => {
    const payload: TurnoCajaCerradoPayload = { turnoId: 'turno-1', sedeId: 'sede-1' };
    jest.spyOn(authService, 'activarMeserosPorSede').mockResolvedValue(3);

    await eventsController.handleTurnoCajaCerrado(payload);

    expect(authService.activarMeserosPorSede).toHaveBeenCalledWith('sede-1', false);
  });

  it('debe propagar errores del servicio', async () => {
    const payload: TurnoCajaAbiertoPayload = { turnoId: 'turno-1', sedeId: 'sede-1' };
    jest.spyOn(authService, 'activarMeserosPorSede').mockRejectedValue(new Error('fail'));

    await expect(eventsController.handleTurnoCajaAbierto(payload)).rejects.toThrow('fail');
  });
});
