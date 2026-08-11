import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxAdminModule, OutboxModule } from '@org/resiliencia';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { RoutingKeys } from '@org/contracts';

@Module({
  imports: [
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
    PrismaModule,
    OutboxAdminModule.forRoot(PrismaService),
    OutboxModule.forService(PrismaService, { producer: 'servicio-identidad' }),
    ScheduleModule.forRoot(),
    RabbitMQModule.forRoot({
      uri: process.env['RABBITMQ_URI'],
      queue: 'identidad_queue',
      bindings: [RoutingKeys.TurnoCajaAbierto, RoutingKeys.TurnoCajaCerrado],
    }),
    AuthModule,
  ],
  providers: [],
})
export class AppModule {}
