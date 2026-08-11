import { Injectable, Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  async obtenerNotificaciones() {
    return this.prisma.notificacion.findMany({
      orderBy: {
        timestamp: 'desc',
      },
      take: 50,
    });
  }

  /**
   * Persiste la notificación de un evento. Idempotente por `eventId` (la
   * identidad estable que el publisher propaga en `x-event-id`): con entrega
   * at-least-once —redelivery del broker, republicación del outbox, reintento
   * in-process del interceptor— el MISMO evento llega varias veces y aquí se
   * inserta una sola notificación.
   *
   * - Duplicado (evento ya procesado) → devuelve `null`; el llamador NO re-emite.
   * - Fallo real de BD → RELANZA (antes lo tragaba y devolvía null mientras el
   *   mensaje se ACKeaba igual → notificación perdida en silencio). Al relanzar,
   *   el interceptor reintenta y, si persiste, va a la DLQ: sin pérdidas.
   */
  async registrarNotificacion(pattern: string, data: unknown, eventId?: string) {
    const contenido = this.formatContenido(pattern, data);
    this.logger.log({
      operation: pattern,
      message: 'Guardando notificación en BD para el evento.',
    } satisfies OperableLog);

    const notifData = {
      eventoOrigen: pattern,
      destinatario: 'TODOS',
      canal: 'UI',
      contenido,
      estado: 'PENDIENTE',
    };

    // Sin eventId (publicación sin cabecera, p. ej. mensajes antiguos en vuelo):
    // no se puede deduplicar, pero tampoco se traga el error → se crea y, si
    // falla, se relanza para que el mensaje reintente/DLQ.
    if (!eventId) {
      return this.prisma.notificacion.create({ data: notifData });
    }

    try {
      return await this.prisma.$transaction(async (prisma) => {
        // Reclama la clave del evento; el índice único la rechaza (P2002) si ya
        // se procesó, abortando la transacción sin insertar la notificación.
        await prisma.idempotencyKey.create({ data: { key: `notif:${eventId}` } });
        return prisma.notificacion.create({ data: notifData });
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        this.logger.log({
          operation: pattern,
          idempotencyKey: `notif:${eventId}`,
          message: 'Evento ya notificado — sin cambios (idempotente).',
        } satisfies OperableLog);
        return null;
      }
      // Fallo real de persistencia: se loguea y se RELANZA (no se traga).
      this.logger.error({
        operation: pattern,
        errorCode: 'PERSISTENCIA_FALLIDA',
        message: `Error al persistir notificación: ${err instanceof Error ? err.message : String(err)}`,
      } satisfies OperableLog);
      throw err;
    }
  }

  /** Texto seguro para interpolar: solo strings/números del payload; nunca '[object Object]'. */
  private texto(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return fallback;
  }

  private resolveMesa(data: Record<string, unknown>): string {
    if (data['numeroMesa'] != null) return `Mesa ${this.texto(data['numeroMesa'], '??')}`;
    if (data['mesaNumero'] != null) return `Mesa ${this.texto(data['mesaNumero'], '??')}`;
    return `Mesa ${this.texto(data['mesaId'], '??')}`;
  }

  private formatPedidoCreado(data: Record<string, unknown>): string {
    const mesa = this.resolveMesa(data);
    return `Nuevo pedido registrado para la ${mesa} por un total de S/ ${Number(data['total'] || 0).toFixed(2)}.`;
  }

  private formatPedidoActualizado(data: Record<string, unknown>): string {
    const mesa = this.resolveMesa(data);
    const estadoStr = this.texto(data['estado']).replaceAll('_', ' ').toLowerCase();
    return `El pedido de la ${mesa} ha cambiado al estado ${estadoStr}.`;
  }

  private formatContenido(pattern: string, data: unknown): string {
    try {
      if (!data) return `Actualización de ${pattern}`;
      const d = data as Record<string, unknown>;
      if (pattern.includes('pedido.creado') || pattern.includes('creado')) return this.formatPedidoCreado(d);
      if (pattern.includes('pedido.actualizado') || pattern.includes('actualizado')) return this.formatPedidoActualizado(d);
      if (pattern.includes('pedido.item_anulado')) {
        return `El mesero anuló el ítem "${this.texto(d['productoNombre'], 'un plato')}" — cocina debe descartarlo.`;
      }
      if (pattern.includes('reserva.cancelada')) {
        return `La reserva a nombre de ${this.texto(d['clienteNombre'], 'Cliente')} ha sido cancelada.`;
      }
      if (pattern.includes('reserva.creada') || pattern.includes('reserva')) {
        return `Nueva reserva registrada a nombre de ${this.texto(d['clienteNombre'], 'Cliente')} para el ${this.texto(d['fecha'])} a las ${this.texto(d['hora'])}.`;
      }
      return typeof data === 'object' ? JSON.stringify(data) : this.texto(data);
    } catch {
      return `Actualización de ${pattern} recibida.`;
    }
  }
}
