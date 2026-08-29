import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { EventsController } from './events.controller';
import { AppService } from './app.service';
import { MesasHttpClient } from './mesas-http.client';
import { CuentaMesaReconciliacionService } from './cuenta-mesa-reconciliacion.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxAdminModule, OutboxModule } from '@org/resiliencia';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
    SharedAuthModule,
    PrismaModule,
    OutboxAdminModule.forRoot(PrismaService),
    OutboxModule.forService(PrismaService, { producer: 'servicio-cuentas' }),
    ScheduleModule.forRoot(),
    RabbitMQModule.forRoot({
      uri: process.env['RABBITMQ_URI'],
      queue: 'cuentas_queue',
      bindings: ['pedido.creado', 'pedido.actualizado', 'pago.registrado', 'mesa.actualizada']
    })
  ],
  controllers: [AppController, EventsController],
  providers: [
    AppService,
    MesasHttpClient,
    CuentaMesaReconciliacionService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
