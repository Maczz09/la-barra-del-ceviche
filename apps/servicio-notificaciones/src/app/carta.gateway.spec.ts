// @ts-nocheck
import { CartaGateway } from './carta.gateway';
import { Socket } from 'socket.io';

function createClient({ sedeId }: { sedeId?: string } = {}) {
  return {
    id: 'socket-1',
    handshake: {
      query: sedeId ? { sedeId } : {},
    },
    disconnect: jest.fn(),
    join: jest.fn(),
  } as unknown as Socket;
}

describe('CartaGateway (carta pública/QR — sin auth)', () => {
  const gateway = new CartaGateway();

  it('desconecta conexiones sin sedeId', () => {
    const client = createClient();
    gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('une al cliente al room sede:<id> sin exigir ningún token', () => {
    const client = createClient({ sedeId: 'sede-1' });
    gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('sede:sede-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  describe('emitDisponibilidadCambiada', () => {
    function gatewayWithServerSpy() {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      const gw = new CartaGateway();
      (gw as unknown as { server: unknown }).server = { to };
      return { gw, to, emit };
    }

    it('emite solo {productoId, disponible} al room de la sede correspondiente', () => {
      const { gw, to, emit } = gatewayWithServerSpy();
      gw.emitDisponibilidadCambiada('sede-1', { productoId: 'p1', disponible: false });
      expect(to).toHaveBeenCalledWith('sede:sede-1');
      expect(emit).toHaveBeenCalledWith('disponibilidad:cambiada', { productoId: 'p1', disponible: false });
    });

    it('servidor WS no inicializado: no lanza', () => {
      const gw = new CartaGateway();
      expect(() => gw.emitDisponibilidadCambiada('sede-1', { productoId: 'p1', disponible: true })).not.toThrow();
    });
  });
});
