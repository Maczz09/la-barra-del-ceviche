import { consumerOpts, RetentionPolicy, StorageType, StringCodec, type JetStreamClient, type JetStreamSubscription, type NatsConnection } from 'nats';
import type { PrinterConfig } from './runtime-config';
import { DurablePrintQueue, type KitchenTicket } from './print-queue';

interface PedidoCreadoPacket {
  pattern: string;
  data: { pedido?: KitchenTicket & { id?: string; modalidad?: string } };
}

export class KitchenPrintSubscriber {
  private connection?: NatsConnection;
  private subscription?: JetStreamSubscription;

  constructor(
    private readonly brokerUrl: string,
    private readonly queue: DurablePrintQueue,
    private readonly printer: () => PrinterConfig,
  ) {}

  async start(): Promise<void> {
    const { connect } = await import('nats');
    this.connection = await connect({ servers: [this.brokerUrl], name: 'impresion-cocina-local' });
    const manager = await this.connection.jetstreamManager();
    try {
      await manager.streams.info('RESTOAPP_LOCAL_EVENTS');
    } catch {
      try {
        await manager.streams.add({
          name: 'RESTOAPP_LOCAL_EVENTS', subjects: ['restoapp.>'], retention: RetentionPolicy.Limits,
          storage: StorageType.File, max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
          duplicate_window: 2 * 60 * 1_000_000_000,
        });
      } catch { await manager.streams.info('RESTOAPP_LOCAL_EVENTS'); }
    }
    const client: JetStreamClient = this.connection.jetstream();
    const opts = consumerOpts();
    opts.durable('impresion_cocina_pedido_creado_v1');
    opts.deliverTo('_INBOX.RESTOAPP.impresion_cocina_pedido_creado_v1');
    opts.manualAck();
    opts.ackExplicit();
    opts.deliverAll();
    opts.filterSubject('restoapp.pedido.creado');
    opts.maxDeliver(10);
    this.subscription = await client.subscribe('restoapp.pedido.creado', opts);
    void this.consume(this.subscription);
  }

  private async consume(subscription: JetStreamSubscription): Promise<void> {
    for await (const message of subscription) {
      try {
        const packet = JSON.parse(StringCodec().decode(message.data)) as PedidoCreadoPacket;
        const pedido = packet.data?.pedido;
        if (!pedido) {
          message.term();
          continue;
        }
        const eventId = message.headers?.get('x-event-id') || `${pedido.id ?? pedido.pedidoId}:creado`;
        this.queue.enqueue(eventId, {
          ...pedido,
          pedidoId: pedido.pedidoId ?? pedido.id ?? eventId,
          canal: pedido.canal ?? pedido.modalidad,
          items: pedido.items ?? [],
        }, this.printer());
        message.ack();
      } catch {
        message.nak(1_000);
      }
    }
  }

  async close(): Promise<void> {
    this.subscription?.unsubscribe();
    await this.connection?.drain();
  }
}
