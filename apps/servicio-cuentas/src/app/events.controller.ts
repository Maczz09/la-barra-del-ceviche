import { Controller, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PedidoActualizadoPayload, PedidoCreadoPayload, RoutingKeys, PagoRegistradoPayload, MesaActualizadaPayload } from '@org/contracts';
import { AppService } from './app.service';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';

@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class EventsController {

  constructor(
    private readonly appService: AppService,
  ) {}

  @EventPattern(RoutingKeys.PedidoCreado)
  async handlePedidoCreado(
    @Payload() payload: PedidoCreadoPayload,
  ): Promise<void> {
    await this.appService.procesarPedidoCreado(payload);
  }

  @EventPattern(RoutingKeys.PedidoActualizado)
  async handlePedidoActualizado(
    @Payload() payload: PedidoActualizadoPayload,
  ): Promise<void> {
    await this.appService.procesarPedidoActualizado(payload);
  }

  @EventPattern(RoutingKeys.PagoRegistrado)
  async handlePagoRegistrado(
    @Payload() payload: PagoRegistradoPayload,
  ): Promise<void> {
    await this.appService.procesarPagoRegistrado(payload);
  }

  @EventPattern(RoutingKeys.MesaActualizada)
  async handleMesaActualizada(
    @Payload() payload: MesaActualizadaPayload,
  ): Promise<void> {
    await this.appService.procesarMesaActualizada(payload);
  }
}
