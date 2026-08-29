import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { resolveWsCorsOrigins } from './notifications.gateway';

/**
 * Carta pública/QR (T-XX): WebSocket SIN autenticación para que la
 * disponibilidad de los platos se vea "en tiempo real" en la carta pública,
 * sin depender solo del poll de 45s.
 *
 * Deliberadamente un `path` propio (no un namespace del gateway del KDS):
 * Kong aplica el plugin `jwt` a TODO el route `/notificaciones` y no
 * entiende namespaces de socket.io (van multiplexados sobre la misma
 * conexión/path) — un namespace público sobre `/api/socket.io` quedaría
 * bloqueado por Kong antes de llegar al handleConnection. Con un `path`
 * distinto, Kong sí puede diferenciarlo por path literal y darle su propio
 * carve-out sin JWT (ver infra/kong/kong.yml.template), igual que las
 * rutas REST públicas de la sesión anterior. El gateway del KDS
 * (`notifications.gateway.ts`) no se toca — sigue exigiendo JWT.
 *
 * Solo transmite `{productoId, disponible}` — nunca precio, stock ni
 * nombre, para no filtrar más de lo que la carta pública ya expone por REST.
 */
@WebSocketGateway({
  cors: { origin: resolveWsCorsOrigins() },
  path: '/api/carta-socket.io',
})
export class CartaGateway implements OnGatewayConnection {
  private readonly logger = new Logger(CartaGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const sedeId = client.handshake.query['sedeId'];
    if (typeof sedeId !== 'string' || sedeId.length === 0) {
      client.disconnect(true);
      return;
    }
    void client.join(`sede:${sedeId}`);
    this.logger.log({
      operation: 'handleConnection',
      aggregateId: sedeId,
      message: 'Cliente de carta pública conectado.',
    } satisfies OperableLog);
  }

  emitDisponibilidadCambiada(sedeId: string, payload: { productoId: string; disponible: boolean }) {
    if (!this.server) {
      this.logger.warn({
        operation: 'emitDisponibilidadCambiada',
        aggregateId: sedeId,
        errorCode: 'WS_SERVER_NO_LISTO',
        message: 'Servidor WebSocket de carta no inicializado; cambio de disponibilidad no emitido en tiempo real.',
      } satisfies OperableLog);
      return;
    }
    this.server.to(`sede:${sedeId}`).emit('disponibilidad:cambiada', payload);
  }
}
