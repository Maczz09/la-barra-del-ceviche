import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { IdempotencyPurgeModule } from '@org/resiliencia';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';
import { RoutingKeys } from '@org/contracts';

@Module({
  imports: [
    PrismaModule,
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
    SharedAuthModule,
    ScheduleModule.forRoot(),
    IdempotencyPurgeModule.forService(PrismaService),
    RabbitMQModule.forRoot({
      uri: process.env['RABBITMQ_URI'],
      queue: 'notificaciones_queue',
      bindings: [
        RoutingKeys.PedidoCreado,
        RoutingKeys.PedidoActualizado,
        RoutingKeys.PedidoListo,
        RoutingKeys.PedidoItemAnulado,
        RoutingKeys.CuentaAbierta,
        RoutingKeys.CuentaCerrada,
        RoutingKeys.TicketGenerado,
        RoutingKeys.MesaActualizada,
        RoutingKeys.ReservaCreada,
        RoutingKeys.ReservaCancelada,
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    NotificationsGateway,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
