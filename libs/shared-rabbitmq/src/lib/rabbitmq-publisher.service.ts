import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import {
  NACHOPPS_EXCHANGE,
  RoutingKey,
} from '@org/contracts';
import * as amqp from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { RABBITMQ_CONNECTION } from './rabbitmq.constants';
import { context, propagation } from '@opentelemetry/api';
import { StringCodec } from 'nats';
import {
  localPublishHeaders,
  toLocalSubject,
  type LocalJetStreamConnection,
} from './local-jetstream';

type BrokerConnection = amqp.AmqpConnectionManager | LocalJetStreamConnection;

function isLocalConnection(connection: BrokerConnection): connection is LocalJetStreamConnection {
  return 'mode' in connection && connection.mode === 'jetstream';
}

@Injectable()
export class RabbitMQPublisherService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMQPublisherService.name);
  private channelWrapper!: amqp.ChannelWrapper;

  constructor(
    @Inject(RABBITMQ_CONNECTION)
    private readonly connection: BrokerConnection,
    @Optional()
    @Inject('RABBITMQ_OPTIONS')
    private readonly options?: { queue?: string, bindings?: string[] }
  ) {}

  onModuleInit() {
    if (isLocalConnection(this.connection)) {
      this.logger.log('Publicador conectado a JetStream local durable');
      return;
    }
    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange('NACHOPPS_DLX', 'topic', { durable: true });
        this.logger.log(`Exchange "NACHOPPS_DLX" declarado`);

        await channel.assertExchange(NACHOPPS_EXCHANGE, 'topic', { durable: true });
        this.logger.log(`Exchange "${NACHOPPS_EXCHANGE}" declarado`);

        if (this.options?.queue && this.options?.bindings?.length) {
          const dlq = `dlq.${this.options.queue}`;
          await channel.assertQueue(dlq, { durable: true });
          await channel.bindQueue(dlq, 'NACHOPPS_DLX', dlq);

          await channel.assertQueue(this.options.queue, { 
            durable: true,
            arguments: {
              'x-dead-letter-exchange': 'NACHOPPS_DLX',
              'x-dead-letter-routing-key': dlq,
            }
          });
          
          for (const routingKey of this.options.bindings) {
            await channel.bindQueue(this.options.queue, NACHOPPS_EXCHANGE, routingKey);
            this.logger.log(`Cola "${this.options.queue}" atada a "${routingKey}"`);
          }
        }
      },
    });

    // Sin este listener, un 'error' del ChannelWrapper (p. ej. heartbeat
    // timeout con el broker) lo trata Node como excepción fatal no capturada
    // y tumba el proceso entero — no solo el canal. amqp-connection-manager
    // ya reconecta el canal solo; loguear basta para que el evento no sea fatal.
    this.channelWrapper.on('error', (err: Error, info: { name: string }) => {
      this.logger.error(`Error de canal RabbitMQ (${info?.name ?? 'sin nombre'}): ${err.message}`, err.stack);
    });
  }

  /**
   * H-4: ¿hay conexión viva con el broker? (API pública de
   * amqp-connection-manager). El outbox la consulta para pausar su tick mientras
   * RabbitMQ está caído, en vez de quemar `attempts` publicando al vacío.
   */
  isConnected(): boolean {
    if (isLocalConnection(this.connection)) {
      return !this.connection.connection.isClosed();
    }
    return this.connection.isConnected();
  }

  async publish<TPayload>(
    routingKey: RoutingKey,
    data: TPayload,
    producer?: string,
    eventId?: string,
  ): Promise<void> {
    const ctx = context.active();
    const carrier: Record<string, string> = {};
    propagation.inject(ctx, carrier);
    if (producer) {
      carrier['x-producer'] = producer;
    }
    // Timestamp de publicación (epoch ms): permite medir en el consumidor cuánto
    // tiempo pasó un mensaje en el broker antes de ser procesado (broker_consumer_lag_seconds).
    carrier['x-published-at'] = String(Date.now());
    // Identidad estable del evento para deduplicación en el consumidor
    // (entrega at-least-once). El productor del outbox pasa el id del evento del
    // outbox → una redelivery o un reintento republican el MISMO id, y el
    // consumidor lo descarta. Si no se pasa, se genera uno (publicación directa):
    // así el consumidor siempre tiene una clave con la que deduplicar.
    carrier['x-event-id'] = eventId ?? randomUUID();

    if (isLocalConnection(this.connection)) {
      await this.connection.client.publish(
        toLocalSubject(routingKey),
        StringCodec().encode(JSON.stringify({ pattern: routingKey, data })),
        {
          msgID: carrier['x-event-id'],
          headers: localPublishHeaders(carrier),
        },
      );
    } else {
      await this.channelWrapper.publish(NACHOPPS_EXCHANGE, routingKey, {
        pattern: routingKey,
        data,
      }, {
        headers: carrier,
        persistent: true,
      });
    }
    this.logger.log(`Evento publicado: ${routingKey}`);
  }
}
