import { Logger } from '@nestjs/common';
import { RmqContext, Server, type CustomTransportStrategy } from '@nestjs/microservices';
import {
  AckPolicy,
  DeliverPolicy,
  RetentionPolicy,
  StorageType,
  connect,
  consumerOpts,
  headers,
  StringCodec,
  type JetStreamClient,
  type JetStreamManager,
  type JetStreamSubscription,
  type JsMsg,
  type NatsConnection,
} from 'nats';
import { createHash } from 'node:crypto';

export const LOCAL_STREAM_NAME = 'RESTOAPP_LOCAL_EVENTS';
export const LOCAL_SUBJECT_PREFIX = 'restoapp';

export interface LocalJetStreamOptions {
  servers: string[];
  queue: string;
}

export interface LocalJetStreamConnection {
  readonly mode: 'jetstream';
  readonly connection: NatsConnection;
  readonly manager: JetStreamManager;
  readonly client: JetStreamClient;
}

export function toLocalSubject(routingKey: string): string {
  return `${LOCAL_SUBJECT_PREFIX}.${routingKey}`;
}

export function durableConsumerName(queue: string, pattern: string): string {
  const base = `${queue}_${pattern}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const digest = createHash('sha256').update(`${queue}:${pattern}`).digest('hex').slice(0, 10);
  return `${base}_${digest}`;
}

export async function ensureLocalStream(manager: JetStreamManager): Promise<void> {
  try {
    await manager.streams.info(LOCAL_STREAM_NAME);
    return;
  } catch {
    // La creación es idempotente en la práctica. Si dos servicios compiten,
    // el segundo confirma el stream después del error de "ya existe".
  }

  try {
    await manager.streams.add({
      name: LOCAL_STREAM_NAME,
      subjects: [`${LOCAL_SUBJECT_PREFIX}.>`],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
      duplicate_window: 2 * 60 * 1_000_000_000,
    });
  } catch {
    await manager.streams.info(LOCAL_STREAM_NAME);
  }
}

export async function connectLocalJetStream(server: string): Promise<LocalJetStreamConnection> {
  const connection = await connect({ servers: [server], name: process.env.SERVICE_NAME });
  const manager = await connection.jetstreamManager();
  await ensureLocalStream(manager);
  return { mode: 'jetstream', connection, manager, client: connection.jetstream() };
}

interface LocalPacket<T = unknown> {
  pattern: string;
  data: T;
}

interface LocalMessageState {
  settled: boolean;
}

function headersRecord(message: JsMsg): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, values] of message.headers ?? []) result[key] = values.join(',');
  return result;
}

/**
 * Transporte durable para el perfil Tauri. Conserva los @EventPattern y el
 * contexto de ack/nack que ya usan los servicios, pero persiste en JetStream.
 */
export class LocalJetStreamServer extends Server implements CustomTransportStrategy {
  private readonly localLogger = new Logger(LocalJetStreamServer.name);
  private connection?: NatsConnection;
  private client?: JetStreamClient;
  private readonly subscriptions: JetStreamSubscription[] = [];
  private closing = false;

  constructor(private readonly options: LocalJetStreamOptions) {
    super();
  }

  async listen(callback: (error?: Error) => void): Promise<void> {
    try {
      const local = await connectLocalJetStream(this.options.servers[0]);
      this.connection = local.connection;
      this.client = local.client;

      for (const pattern of this.messageHandlers.keys()) {
        await this.subscribe(pattern);
      }
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async subscribe(pattern: string): Promise<void> {
    const client = this.client;
    if (!client) throw new Error('JetStream no está conectado');

    const subject = toLocalSubject(pattern);
    const opts = consumerOpts();
    const durable = durableConsumerName(this.options.queue, pattern);
    opts.durable(durable);
    opts.deliverTo(`_INBOX.RESTOAPP.${durable}`);
    opts.manualAck();
    opts.ackExplicit();
    opts.deliverAll();
    opts.filterSubject(subject);
    opts.maxDeliver(10);
    opts.ackWait(30_000);

    const subscription = await client.subscribe(subject, opts);
    this.subscriptions.push(subscription);
    void this.consume(pattern, subscription);
  }

  private async consume(pattern: string, subscription: JetStreamSubscription): Promise<void> {
    for await (const message of subscription) {
      if (this.closing) break;
      await this.handleLocalMessage(pattern, message);
    }
  }

  private async handleLocalMessage(pattern: string, message: JsMsg): Promise<void> {
    const handler = this.getHandlerByPattern(pattern) as
      | ((data: unknown, context: RmqContext) => unknown)
      | null;
    if (!handler) {
      this.localLogger.error(`No existe handler local para ${pattern}`);
      message.term();
      return;
    }

    let packet: LocalPacket;
    try {
      packet = JSON.parse(StringCodec().decode(message.data)) as LocalPacket;
    } catch (error) {
      this.localLogger.error(`Evento local inválido (${pattern}): ${String(error)}`);
      message.term();
      return;
    }

    const state: LocalMessageState = { settled: false };
    const originalMessage = { properties: { headers: headersRecord(message) } };
    const channel = {
      ack: () => {
        if (state.settled) return;
        state.settled = true;
        message.ack();
      },
      nack: (_msg: unknown, _all: boolean, requeue: boolean) => {
        if (state.settled) return;
        state.settled = true;
        if (requeue) message.nak();
        else void this.deadLetter(pattern, message);
      },
    };
    const context = new RmqContext([originalMessage, channel, pattern]);

    try {
      const result = await handler(packet.data, context);
      await new Promise<void>((resolve, reject) => {
        this.transformToObservable(result).subscribe({
          error: reject,
          complete: resolve,
        });
      });
      if (!state.settled) channel.ack();
    } catch (error) {
      if (!state.settled) message.nak(1_000);
      this.localLogger.error(`Falló consumidor local ${pattern}: ${String(error)}`);
    }
  }

  private async deadLetter(pattern: string, message: JsMsg): Promise<void> {
    try {
      if (!this.client) throw new Error('JetStream no está conectado');
      await this.client.publish(`${LOCAL_SUBJECT_PREFIX}.dlq.${this.options.queue}`, message.data, {
        headers: message.headers,
        msgID: `${message.info.streamSequence}-${durableConsumerName(this.options.queue, pattern)}`,
      });
      message.term();
    } catch (error) {
      this.localLogger.error(`No se pudo persistir DLQ local ${pattern}: ${String(error)}`);
      message.nak(5_000);
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    if (this.connection) await this.connection.drain();
  }

  unwrap<T>(): T {
    if (!this.connection) throw new Error('JetStream local no está conectado');
    return this.connection as T;
  }

  on(): void {
    // Nest requiere el método para CustomTransportStrategy. El supervisor
    // obtiene el estado desde health checks HTTP, no mediante este callback.
  }
}

export function localPublishHeaders(values: Record<string, string>) {
  const result = headers();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

export const LOCAL_CONSUMER_DEFAULTS = {
  ackPolicy: AckPolicy.Explicit,
  deliverPolicy: DeliverPolicy.All,
} as const;
