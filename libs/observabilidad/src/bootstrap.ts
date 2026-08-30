/**
 * Bootstrap compartido de los microservicios NachoPps (plan T-10).
 *
 * Las 9 copias de `main.ts` diferían solo en: nombre de servicio, cola/DLQ,
 * metadatos de Swagger y puerto por defecto. Este helper centraliza el resto
 * (fail-fast de RABBITMQ_URI, Winston, prefijo `api`, cookieParser, helmet,
 * CORS, ValidationPipe, filtro global, transporte RMQ con DLX y Swagger fuera
 * de producción), replicando exactamente lo que cada `main.ts` hacía.
 *
 * IMPORTANTE — orden de carga: `initTracing()` debe ejecutarse ANTES de importar
 * Nest para que la auto-instrumentación de OpenTelemetry parchee http/amqp/pg.
 * Por eso este módulo vive FUERA del barrel `@org/observabilidad` (que es ligero)
 * y se importa en un segundo paso desde `@org/observabilidad/bootstrap`, después
 * de la llamada a `initTracing` en `main.ts`.
 */
import { Logger, Type, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { buildHelmetOptions } from '@org/shared-auth';
import { GlobalExceptionFilter } from './lib/global-exception.filter';
import { shutdownTracing } from './lib/tracing';
import { OperableLog } from './lib/operable-log';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { LocalJetStreamServer } from '@org/shared-rabbitmq';

// Red de seguridad de proceso: un rejection/excepción no capturada (p. ej. en un
// fire-and-forget o en las internals de socket.io) mataría el proceso con un
// stack crudo, sin log correlacionable. Se registra UNA vez por proceso.
let processHandlersRegistrados = false;
function registrarProcessHandlers(): void {
  if (processHandlersRegistrados) return;
  processHandlersRegistrados = true;
  const logger = new Logger('Process');

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error(
      {
        operation: 'unhandledRejection',
        errorCode: 'UNHANDLED_REJECTION',
        message: `Promesa rechazada sin manejar: ${reason instanceof Error ? reason.message : String(reason)}`,
      } satisfies OperableLog,
      reason instanceof Error ? reason.stack : undefined,
    );
  });

  process.on('uncaughtException', (error: Error) => {
    // Excepción síncrona no capturada: el proceso queda en estado indefinido.
    // Se loguea de forma operable y se sale con código de error para que el
    // orquestador reinicie con estado limpio (fail-fast, no seguir corrupto).
    logger.error(
      {
        operation: 'uncaughtException',
        errorCode: 'UNCAUGHT_EXCEPTION',
        message: `Excepción no capturada; el proceso se reiniciará: ${error.message}`,
      } satisfies OperableLog,
      error.stack,
    );
    void shutdownTracing().finally(() => process.exit(1));
  });
}

export interface BootstrapSwaggerConfig {
  title: string;
  description: string;
  version?: string;
}

export interface BootstrapOptions {
  /** Nombre del servicio (debe coincidir con el de `initTracing`). */
  serviceName: string;
  /** AppModule raíz del servicio. */
  module: Type<unknown>;
  /** Cola RMQ consumidora; si se omite, no se levanta microservicio (p. ej. identidad/reservas). */
  queue?: string;
  /** Metadatos de Swagger; si se omite, no se expone Swagger. */
  swagger?: BootstrapSwaggerConfig;
  /** Puerto por defecto si no hay `PORT` en el entorno. */
  defaultPort: number;
}

export async function bootstrapNachoppsService(options: BootstrapOptions): Promise<void> {
  const { serviceName, module, queue, swagger, defaultPort } = options;

  if (!process.env.RABBITMQ_URI && !process.env.LOCAL_BROKER_URL) {
    throw new Error('RABBITMQ_URI or LOCAL_BROKER_URL environment variable is required');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN environment variable is required in production');
  }

  registrarProcessHandlers();

  const app = await NestFactory.create(module, { bufferLogs: true });
  // Logger JSON estructurado con trace_id/correlationId (plan 5.1).
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.use(cookieParser());
  app.use(helmet(buildHelmetOptions()));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  if (queue) {
    if (process.env.LOCAL_BROKER_URL) {
      app.connectMicroservice({
        strategy: new LocalJetStreamServer({
          servers: [process.env.LOCAL_BROKER_URL],
          queue,
        }),
      });
    } else {
      app.connectMicroservice({
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URI],
          queue,
          queueOptions: {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': 'NACHOPPS_DLX',
              'x-dead-letter-routing-key': `dlq.${queue}`,
            },
          },
          exchange: 'nachopps_exchange',
          exchangeType: 'topic',
          noAck: false,
          // Backpressure: cap de mensajes en vuelo por consumidor (R-09). No toca
          // la declaración de colas → sin riesgo de redeclare.
          prefetchCount: Number(process.env.RMQ_PREFETCH ?? 20),
        },
      });
    }
  }

  if (swagger && process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(swagger.title)
      .setDescription(swagger.description)
      .setVersion(swagger.version ?? '1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    Logger.log(`📄 Swagger: http://localhost:${process.env.PORT || defaultPort}/api/docs`);
  }

  const port = process.env.PORT || defaultPort;
  if (queue) {
    await app.startAllMicroservices();
  }
  await app.listen(port);
  // B-4: keepAliveTimeout de Node (5 s default) por debajo del keepalive de
  // upstream de Kong (60 s) provoca 502 esporádicos bajo carga: Kong reutiliza
  // un socket que Node acaba de cerrar. Debe ser SIEMPRE mayor que el del proxy.
  const server = app.getHttpServer() as import('node:http').Server;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  const nombre = serviceName.replace('servicio-', '');
  Logger.log(`🚀 Servicio ${nombre} corriendo en: http://localhost:${port}/${globalPrefix}`);
  if (queue) {
    Logger.log(`📡 Microservicio escuchando en la cola: ${queue}`);
  }

  // Apagado graceful con un único dueño (antes competían el handler de
  // OpenTelemetry —que hacía process.exit(0)— y los shutdown hooks de Nest, y
  // quien acabara primero cortaba requests/mensajes en vuelo). Secuencia
  // determinista: dejar de aceptar y drenar HTTP + consumidores RMQ vía
  // `app.close()` (ejecuta los lifecycle hooks de Nest), luego vaciar el tracer,
  // y solo entonces salir. Se atienden SIGTERM (orquestador) y SIGINT (Ctrl-C).
  let apagando = false;
  const apagadoGraceful = async (signal: NodeJS.Signals) => {
    if (apagando) return; // segunda señal durante el drenaje: se ignora
    apagando = true;
    Logger.log(`Señal ${signal} recibida; iniciando apagado graceful…`);
    try {
      await app.close();
    } catch (error) {
      process.stderr.write(`Error cerrando la app durante el apagado: ${String(error)}\n`);
    }
    await shutdownTracing();
    process.exit(0);
  };
  // `void` explícito: el listener de la señal debe devolver void, no la promesa.
  process.once('SIGTERM', (s) => void apagadoGraceful(s));
  process.once('SIGINT', (s) => void apagadoGraceful(s));
}
