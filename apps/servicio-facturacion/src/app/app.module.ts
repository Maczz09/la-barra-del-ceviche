import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EmisionController } from './emision.controller';
import { EmisionService } from './emision.service';
import { NotasService } from './notas.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { IdempotencyPurgeModule, OutboxModule, OutboxAdminModule } from '@org/resiliencia';
import { RoutingKeys } from '@org/contracts';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';
import { SunatConfigService } from '../sunat/sunat-config.service';
import { CertificadoService } from '../sunat/certificado.service';
import { CorrelativoService } from '../sunat/correlativo.service';
import { SunatSoapClient } from '../sunat/sunat-soap.client';
import { EnvioProcessor } from '../sunat/envio.processor';
import { CredencialesCryptoService } from '../sunat/credenciales-crypto.service';

@Module({
  imports: [
    PrismaModule,
    SharedAuthModule,
    ScheduleModule.forRoot(),
    IdempotencyPurgeModule.forService(PrismaService),
    RabbitMQModule.forRoot({
      uri: process.env['RABBITMQ_URI'],
      queue: 'facturacion_queue',
      bindings: [RoutingKeys.CuentaCerrada],
    }),
    // Publica comprobante.emitido cuando SUNAT acepta (CDR recibido).
    OutboxModule.forService(PrismaService, { producer: 'servicio-facturacion' }),
    OutboxAdminModule.forRoot(PrismaService),
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
  ],
  controllers: [AppController, EmisionController],
  providers: [
    AppService,
    EmisionService,
    NotasService,
    SunatConfigService,
    CertificadoService,
    CorrelativoService,
    SunatSoapClient,
    EnvioProcessor,
    CredencialesCryptoService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
