import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CompraRecibidaLineaPayload,
  CompraRecibidaPayload,
  MovimientoInsumoTipo,
  OrdenCompraEstado,
  RegistrarRecepcionCommand,
  RoutingKeys,
} from '@org/contracts';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { toOrdenCompraDto, toRecepcionCompraDto } from './compras.mapper';
import { OrdenesService } from './ordenes.service';
import { MovimientosInsumoService } from './movimientos-insumo.service';

const ESTADOS_RECIBIBLES = new Set<string>([OrdenCompraEstado.Enviada, OrdenCompraEstado.Parcial]);
// Margen para el redondeo de Decimal↔number en la comparación de "cantidad
// pendiente"; evita rechazar por ruido de punto flotante una recepción que
// en realidad completa exactamente el ítem.
const EPSILON = 1e-9;

@Injectable()
export class RecepcionesService {
  private readonly logger = new Logger(RecepcionesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordenes: OrdenesService,
    private readonly movimientos: MovimientosInsumoService,
  ) {}

  async listarPorOrden(ordenId: string, usuarioSedeId?: string | null) {
    await this.ordenes.findOrThrow(ordenId, usuarioSedeId);
    const recepciones = await this.prisma.recepcionCompra.findMany({
      where: { ordenId },
      include: { items: true },
      orderBy: { fecha: 'asc' },
    });
    return { data: recepciones.map(toRecepcionCompraDto) };
  }

  async registrar(
    ordenId: string,
    command: RegistrarRecepcionCommand,
    usuario?: { id: string; nombre: string } | null,
    usuarioSedeId?: string | null,
  ) {
    const ordenActual = await this.ordenes.findOrThrow(ordenId, usuarioSedeId);
    if (!ESTADOS_RECIBIBLES.has(ordenActual.estado)) {
      throw new ConflictException('Solo se puede recibir mercadería de una orden enviada o con recepción parcial');
    }

    const resultado = await this.prisma.$transaction(async (prisma) => {
      // classid 5678 distinto del 1234 de servicio-inventario A PROPOSITO: cada
      // servicio tiene su propia BD (database-per-service), pero por claridad se
      // evita reutilizar el mismo classid entre dominios. Serializa recepciones
      // concurrentes de la MISMA orden.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(5678, ('x' || substr(md5(${ordenId}), 1, 8))::bit(32)::int)`;

      const items = await prisma.ordenCompraItem.findMany({ where: { ordenId }, include: { insumo: true } });
      const itemPorId = new Map(items.map((i) => [i.id, i]));

      const recepcionItemsData: { ordenItemId: string; cantidadRecibida: number; costoUnitario: number }[] = [];
      const lineasEvento: CompraRecibidaLineaPayload[] = [];
      // El stock del insumo se mueve DESPUÉS de crear la recepción (ver abajo):
      // así cada entrada del kardex apunta a la recepción que la originó.
      const entradasStock: { insumoId: string; cantidad: number }[] = [];

      for (const linea of command.items) {
        const item = itemPorId.get(linea.ordenItemId);
        if (!item) {
          throw new NotFoundException(`Ítem de orden ${linea.ordenItemId} no encontrado`);
        }
        const pendiente = item.cantidadPedida.toNumber() - item.cantidadRecibida.toNumber();
        if (linea.cantidadRecibida > pendiente + EPSILON) {
          throw new BadRequestException(
            `Recibiste ${linea.cantidadRecibida} ${item.unidad} de "${item.insumoNombre}" pero solo quedaban ${pendiente} pendientes`,
          );
        }

        const costoUnitario = linea.costoUnitario ?? item.costoUnitario.toNumber();
        recepcionItemsData.push({ ordenItemId: item.id, cantidadRecibida: linea.cantidadRecibida, costoUnitario });

        await prisma.ordenCompraItem.update({
          where: { id: item.id },
          data: { cantidadRecibida: { increment: linea.cantidadRecibida } },
        });

        // Stock propio del insumo (unidad de compra, p. ej. kg): sube con
        // CUALQUIER recepción, tenga o no puente a un producto vendible.
        entradasStock.push({ insumoId: item.insumoId, cantidad: linea.cantidadRecibida });

        if (item.insumo.productoId) {
          const cantidadStockVenta = Math.trunc(linea.cantidadRecibida * item.insumo.factorConversion.toNumber());
          if (cantidadStockVenta > 0) {
            lineasEvento.push({
              insumoId: item.insumoId,
              insumoNombre: item.insumoNombre,
              productoId: item.insumo.productoId,
              cantidadRecibida: linea.cantidadRecibida,
              cantidadStockVenta,
            });
          }
        }
      }

      const recepcion = await prisma.recepcionCompra.create({
        data: {
          sedeId: ordenActual.sedeId,
          ordenId,
          observaciones: command.observaciones ?? null,
          usuarioId: usuario?.id ?? null,
          usuarioNombre: usuario?.nombre ?? null,
          items: { create: recepcionItemsData },
        },
        include: { items: true },
      });

      // T-50: la entrada por compra pasa por la MISMA puerta que el consumo de
      // cocina. Si siguiera haciendo su propio `increment`, el kardex nacería
      // incompleto y "sumar deltas == stockActual" no cuadraría nunca.
      for (const entrada of entradasStock) {
        await this.movimientos.aplicarMovimiento(prisma, {
          insumoId: entrada.insumoId,
          tipo: MovimientoInsumoTipo.EntradaCompra,
          delta: entrada.cantidad,
          motivo: `Recepción de orden ${ordenActual.codigo}`,
          recepcionId: recepcion.id,
          usuario,
        });
      }

      // Derivado por ítem, NO por suma total: la sobre-entrega de un ítem no
      // debe tapar el faltante de otro.
      const itemsActualizados = await prisma.ordenCompraItem.findMany({ where: { ordenId } });
      const completos = itemsActualizados.every((i) => i.cantidadRecibida.gte(i.cantidadPedida));
      const nuevoEstado = completos ? OrdenCompraEstado.Recibida : OrdenCompraEstado.Parcial;

      const orden = await prisma.ordenCompra.update({
        where: { id: ordenId },
        data: { estado: nuevoEstado, fechaCierre: completos ? new Date() : null },
        include: { items: true },
      });

      // Si ninguna línea tiene productoId (insumos crudos), no hay nada que
      // sincronizar con Inventario: sin fila de outbox.
      if (lineasEvento.length > 0) {
        const payload: CompraRecibidaPayload = {
          recepcionId: recepcion.id,
          ordenId,
          sedeId: ordenActual.sedeId,
          lineas: lineasEvento,
        };
        await prisma.outboxEvent.create({
          data: { routingKey: RoutingKeys.CompraRecibida, payload: JSON.stringify(payload), status: 'PENDING' },
        });
      }

      return { recepcion, orden };
    });

    this.logger.log({
      operation: 'registrar',
      aggregateId: resultado.recepcion.id,
      resultingState: resultado.orden.estado,
      message: `Recepción registrada para orden ${resultado.orden.codigo} (estado resultante: ${resultado.orden.estado}).`,
    } satisfies OperableLog);

    return {
      message: resultado.orden.estado === OrdenCompraEstado.Recibida ? 'Recepción registrada — orden completa' : 'Recepción parcial registrada',
      recepcion: toRecepcionCompraDto(resultado.recepcion),
      orden: toOrdenCompraDto(resultado.orden),
    };
  }
}
