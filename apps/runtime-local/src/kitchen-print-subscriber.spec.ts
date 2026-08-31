import type { NatsConnection } from 'nats';
import { closeNatsConnection } from './kitchen-print-subscriber';

describe('cierre del suscriptor de impresión', () => {
  afterEach(() => jest.useRealTimers());

  it('cierra forzosamente la conexión cuando drain queda colgado', async () => {
    jest.useFakeTimers();
    const close = jest.fn().mockResolvedValue(undefined);
    const connection = {
      drain: jest.fn(() => new Promise<void>(() => undefined)),
      close,
    } as unknown as NatsConnection;

    const closing = closeNatsConnection(connection, 3_000);
    await jest.advanceTimersByTimeAsync(3_000);
    await closing;

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('no fuerza close cuando drain termina normalmente', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const connection = {
      drain: jest.fn().mockResolvedValue(undefined),
      close,
    } as unknown as NatsConnection;

    await closeNatsConnection(connection, 3_000);

    expect(close).not.toHaveBeenCalled();
  });
});
