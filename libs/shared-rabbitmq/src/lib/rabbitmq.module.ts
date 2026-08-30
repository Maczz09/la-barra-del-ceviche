import { DynamicModule, Logger, Module } from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import { RABBITMQ_CONNECTION } from './rabbitmq.constants';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service';
import { connectLocalJetStream } from './local-jetstream';

const logger = new Logger('RabbitMQConnection');

export interface RabbitMQModuleOptions {
  uri?: string;
  queue?: string;
  bindings?: string[];
}

@Module({})
export class RabbitMQModule {
  static forRoot(options: RabbitMQModuleOptions | string | undefined): DynamicModule {
    const moduleOptions = typeof options === 'string' ? { uri: options } : (options || {});
    const { uri, queue, bindings = [] } = moduleOptions;

    const connectionProvider = {
      provide: RABBITMQ_CONNECTION,
      useFactory: async () => {
        const localBrokerUrl = process.env['LOCAL_BROKER_URL'];
        if (localBrokerUrl) {
          logger.log(`Conectando al transporte local durable en ${localBrokerUrl}`);
          return connectLocalJetStream(localBrokerUrl);
        }
        if (!uri) {
          throw new Error('RABBITMQ_URI environment variable is required');
        }

        const connection = amqp.connect([uri]);
        // AmqpConnectionManager no emite 'error' (solo 'disconnect', que ya
        // maneja la reconexión internamente) — el 'error' que sí tumbaba el
        // proceso es el del ChannelWrapper, manejado en
        // RabbitMQPublisherService.onModuleInit(). Estos listeners son solo
        // para observabilidad de la conexión.
        connection.on('connect', () => logger.log('Conectado a RabbitMQ'));
        connection.on('disconnect', ({ err }: { err: Error }) => {
          logger.warn(`Desconectado de RabbitMQ, reintentando: ${err?.message}`);
        });

        return connection;
      },
    };

    const optionsProvider = {
      provide: 'RABBITMQ_OPTIONS',
      useValue: { queue, bindings },
    };

    return {
      module: RabbitMQModule,
      providers: [connectionProvider, optionsProvider, RabbitMQPublisherService],
      exports: [connectionProvider, RabbitMQPublisherService],
      global: true,
    };
  }
}
