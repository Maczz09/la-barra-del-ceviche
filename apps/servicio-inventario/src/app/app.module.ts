import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { EventsController } from './events.controller';
import { PublicCartaController } from './public-carta.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxAdminModule, OutboxModule, IdempotencyPurgeModule } from '@org/resiliencia';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';
import { RoutingKeys } from '@org/contracts';

@Module({
  imports: [
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
    SharedAuthModule,
    PrismaModule,
    OutboxAdminModule.forRoot(PrismaService),
    OutboxModule.forService(PrismaService, { producer: 'servicio-inventario', injectEventId: true }),
    IdempotencyPurgeModule.forService(PrismaService),
    ScheduleModule.forRoot(),
    RabbitMQModule.forRoot({
      uri: process.env['RABBITMQ_URI'],
      queue: 'inventario_queue',
      bindings: ['pedido.creado', RoutingKeys.CompraRecibida, RoutingKeys.PedidoItemAnuladoConMerma, RoutingKeys.StockRestaurado]
    }),
  ],
  controllers: [AppController, EventsController, PublicCartaController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
