import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { EventsController } from './events.controller';
import { AppService } from './app.service';
import { MesasHttpClient } from './mesas-http.client';
import { CuentasHttpClient } from './cuentas-http.client';
import { InventarioHttpClient } from './inventario-http.client';
import { PedidosSagaService } from './pedidos-saga.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxAdminModule, OutboxModule, IdempotencyPurgeModule, IdempotencyInterceptor, IDEMPOTENCY_DB } from '@org/resiliencia';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingKeys } from '@org/contracts';

@Module({
  imports: [
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
    SharedAuthModule,
    PrismaModule,
    OutboxAdminModule.forRoot(PrismaService),
    OutboxModule.forService(PrismaService, { producer: 'servicio-pedidos' }),
    IdempotencyPurgeModule.forService(PrismaService),
    ScheduleModule.forRoot(),
    RabbitMQModule.forRoot({
      uri: process.env['RABBITMQ_URI'],
      queue: 'pedidos_queue',
      bindings: [RoutingKeys.PagoRegistrado, RoutingKeys.MesaCreada, RoutingKeys.MesaActualizada, RoutingKeys.ProductoCreado, RoutingKeys.ProductoActualizado, RoutingKeys.StockInsuficiente, RoutingKeys.CuentaAsociada]
    }),
  ],
  controllers: [AppController, EventsController],
  providers: [
    AppService,
    MesasHttpClient,
    CuentasHttpClient,
    InventarioHttpClient,
    PedidosSagaService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    IdempotencyInterceptor,
    { provide: IDEMPOTENCY_DB, useExisting: PrismaService },
  ],
})
export class AppModule {}
