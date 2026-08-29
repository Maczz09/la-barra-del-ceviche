import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxAdminModule, OutboxModule, IdempotencyPurgeModule, IdempotencyInterceptor, IDEMPOTENCY_DB } from '@org/resiliencia';
import { PrismaService } from '../prisma/prisma.service';
import { AppController } from './app.controller';
import { ProveedoresService } from './proveedores.service';
import { InsumosService } from './insumos.service';
import { CategoriasInsumoService } from './categorias-insumo.service';
import { MovimientosInsumoService } from './movimientos-insumo.service';
import { OrdenesService } from './ordenes.service';
import { RecepcionesService } from './recepciones.service';
import { ComprobantesService } from './comprobantes.service';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';

@Module({
  imports: [
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
    SharedAuthModule,
    PrismaModule,
    OutboxAdminModule.forRoot(PrismaService),
    OutboxModule.forService(PrismaService, { producer: 'servicio-compras' }),
    IdempotencyPurgeModule.forService(PrismaService),
    ScheduleModule.forRoot(),
    RabbitMQModule.forRoot(process.env['RABBITMQ_URI']),
  ],
  controllers: [AppController],
  providers: [
    ProveedoresService,
    InsumosService,
    CategoriasInsumoService,
    MovimientosInsumoService,
    OrdenesService,
    RecepcionesService,
    ComprobantesService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    IdempotencyInterceptor,
    { provide: IDEMPOTENCY_DB, useExisting: PrismaService },
  ],
})
export class AppModule {}
