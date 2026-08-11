import { Controller, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { RoutingKeys, TurnoCajaAbiertoPayload, TurnoCajaCerradoPayload } from '@org/contracts';
import { AuthService } from './auth.service';

@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class EventsController {
  constructor(private readonly authService: AuthService) {}

  @EventPattern(RoutingKeys.TurnoCajaAbierto)
  async handleTurnoCajaAbierto(@Payload() payload: TurnoCajaAbiertoPayload) {
    await this.authService.activarMeserosPorSede(payload.sedeId, true);
  }

  @EventPattern(RoutingKeys.TurnoCajaCerrado)
  async handleTurnoCajaCerrado(@Payload() payload: TurnoCajaCerradoPayload) {
    await this.authService.activarMeserosPorSede(payload.sedeId, false);
  }
}
