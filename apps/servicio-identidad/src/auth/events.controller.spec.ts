// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

import { EventsController } from './events.controller';
import { AuthService } from './auth.service';

describe('EventsController — Identidad', () => {
  let controller: EventsController;
  let mockAuthService: { activarMeserosPorSede: jest.Mock };

  beforeEach(() => {
    mockAuthService = { activarMeserosPorSede: jest.fn().mockResolvedValue(1) };
    controller = new EventsController(mockAuthService as unknown as AuthService);
  });

  it('handleTurnoCajaAbierto activa los meseros de la sede', async () => {
    await controller.handleTurnoCajaAbierto({ turnoId: 't-001', sedeId: 'sede-001' });
    expect(mockAuthService.activarMeserosPorSede).toHaveBeenCalledWith('sede-001', true);
  });

  it('handleTurnoCajaCerrado desactiva los meseros de la sede', async () => {
    await controller.handleTurnoCajaCerrado({ turnoId: 't-001', sedeId: 'sede-001' });
    expect(mockAuthService.activarMeserosPorSede).toHaveBeenCalledWith('sede-001', false);
  });
});
