import { createServer, type Server } from 'node:net';
import { assertPortsAvailable } from './local-runtime';

describe('preflight de puertos del runtime', () => {
  let occupied: Server | undefined;

  afterEach(async () => {
    if (!occupied) return;
    await new Promise<void>((resolve) => occupied?.close(() => resolve()));
    occupied = undefined;
  });

  it('acepta un puerto libre', async () => {
    const reservation = createServer();
    await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const address = reservation.address();
    if (!address || typeof address === 'string') throw new Error('No se obtuvo puerto de prueba');
    const port = address.port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));

    await expect(assertPortsAvailable([{ port, name: 'prueba' }])).resolves.toBeUndefined();
  });

  it('rechaza un puerto ocupado con un mensaje accionable', async () => {
    occupied = createServer();
    await new Promise<void>((resolve) => occupied?.listen(0, '127.0.0.1', resolve));
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('No se obtuvo puerto de prueba');

    await expect(assertPortsAvailable([{ port: address.port, name: 'servicio-prueba' }]))
      .rejects.toThrow(`El puerto interno ${address.port} (servicio-prueba) está ocupado`);
  });
});
