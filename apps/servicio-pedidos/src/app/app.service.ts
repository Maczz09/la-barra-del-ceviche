import { Injectable, NotFoundException, BadRequestException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  PedidoDto,
  CrearPedidoCommand,
  ActualizarEstadoPedidoCommand,
  ActualizarEstadoItemCommand,
  PedidoItemInput,
  PedidoEstado,
  ListarPedidosQuery,
  PedidoListResponse,
  RoutingKeys,
  PagoRegistradoPayload,
  ProductoCreadoPayload,
  ProductoActualizadoPayload,
  StockInsuficientePayload,
  CuentaAsociadaPayload,
  ItemArea,
  EstadoItem,
  AnularItemPreparadoCommand,
  ListarAnulacionesQuery,
  ActualizarAnulacionCommand,
  InvalidarAnulacionCommand,
  AnularAtencionMesaCommand,
  AnularPedidoCommand,
} from '@org/contracts';
import { Prisma } from '../generated/prisma';
import { resolveSedeId } from '@org/shared-auth';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { MesasHttpClient } from './mesas-http.client';
import { InventarioHttpClient, ProductoRemotoLote } from './inventario-http.client';
import { PedidosSagaService } from './pedidos-saga.service';
import { mapPedidoToDto } from './pedido.mapper';
import {
  PedidoItemMapeado,
  MesaLocalEntity,
  PedidoEntity,
} from './types';

interface MeseroPedido {
  id: string;
  nombre?: string | null;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  // Métricas de negocio (plan 5.2): pedidos/min vía rate(pedidos_creados_total).
  private readonly pedidosCreadosCounter = getOrCreateCounter(
    'pedidos_creados_total', 'Pedidos creados', ['modalidad'],
  );
  // R-08: pedidos rechazados por dependencia caída (503/breaker), hermano de
  // pedidos_rechazados_sin_stock_total. Cierra la tasa de éxito de pedido.
  private readonly pedidosRechazadosDependenciaCounter = getOrCreateCounter(
    'pedidos_rechazados_dependencia_total', 'Pedidos rechazados por dependencia no disponible', ['dependency'],
  );
  constructor(
    private readonly prisma: PrismaService,
    private readonly mesasHttp: MesasHttpClient,
    private readonly inventarioHttp: InventarioHttpClient,
    private readonly saga: PedidosSagaService,
  ) {}

  async crearPedido(command: CrearPedidoCommand, mesero?: MeseroPedido | null): Promise<{ message: string; pedido: PedidoDto }> {
    const mesaLocal = await this.validarMesa(command.mesaId);
    const itemsProcesados = await this.validarYMapearItems(command.items);
    const total = this.calcularTotal(itemsProcesados);
    const pedido = await this.persistirPedido({
      mesaId: command.mesaId,
      // T-23 Fase 2: el pedido hereda la sede de SU MESA (fuente de verdad),
      // no la del usuario que lo crea — validarMesa garantiza que ya está
      // sincronizada (re-sync si MesaLocal.sedeId venía nulo).
      sedeId: mesaLocal.sedeId!,
      numeroMesa: mesaLocal.numero,
      items: itemsProcesados,
      total,
      cliente: command.cliente,
      telefono: command.telefono,
      direccion: command.direccion,
      proveedor: command.proveedor,
      modalidad: command.modalidad,
      mesero,
    });

    this.logger.log({
      operation: 'crearPedido',
      aggregateId: pedido.id,
      message: 'Pedido creado con eventos en Outbox.',
    } satisfies OperableLog);
    this.pedidosCreadosCounter.inc({ modalidad: command.modalidad ?? 'MESA' });
    return {
      message: 'Pedido creado exitosamente',
      pedido: this.mapToDto(pedido)
    };
  }

  private async validarMesa(mesaId: string): Promise<MesaLocalEntity> {
    const mesa = await this.prisma.mesaLocal.findUnique({ where: { id: mesaId } });
    // T-23 Fase 2: un MesaLocal sin sedeId es una fila pre-multi-sede (nunca
    // se backfilleó a ciegas — ver migración) o un cold-start incompleto;
    // en ambos casos hay que re-sincronizar contra servicio-mesas.
    if (mesa?.sedeId) {
      return mesa;
    }

    return this.sincronizarMesaLocal(mesaId);
  }

  private async sincronizarMesaLocal(mesaId: string): Promise<MesaLocalEntity> {
    // T-33: la llamada remota (token + axios + breaker + mapeo de errores) vive
    // en MesasHttpClient; aquí solo queda la proyección local.
    const data = await this.mesasHttp.obtenerMesa(mesaId);

    return this.prisma.mesaLocal.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        sedeId: data.sedeId,
        numero: data.numero,
      },
      update: {
        sedeId: data.sedeId,
        numero: data.numero,
      },
    });
  }

  private async asegurarProductosLocales(productoIds: string[]): Promise<void> {
    const existentes = await this.prisma.productoLocal.findMany({
      where: { id: { in: productoIds } }
    });
    const existentesIds = new Set(existentes.map(p => p.id));
    const faltantes = productoIds.filter(id => !existentesIds.has(id));

    if (faltantes.length > 0) {
      this.logger.warn({
        operation: 'asegurarProductosLocales',
        dependency: 'inventario',
        resultingState: `${faltantes.length} productos en cold-start`,
        message: 'Productos no están en proyección local; cargando desde inventario.',
      } satisfies OperableLog);
      // T-33: la llamada remota vive en InventarioHttpClient (breaker incluido).
      let productos: ProductoRemotoLote[];
      try {
        productos = await this.inventarioHttp.obtenerProductosLote(faltantes);
      } catch (error) {
        // Dependencia caída (timeout/breaker/refused → 503): cuenta el rechazo
        // para la tasa de éxito de pedido y propaga.
        if (error instanceof ServiceUnavailableException) {
          this.pedidosRechazadosDependenciaCounter.inc({ dependency: 'inventario' });
        }
        throw error;
      }
      await Promise.all(productos.map(p =>
        this.prisma.productoLocal.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            nombre: p.nombre,
            precio: p.precio,
            stockActual: p.stockActual ?? null,
            categoriaNombre: p.categoria?.nombre ?? 'COCINA',
            categoriaArea: p.categoria?.area ?? 'COCINA',
            disponible: p.disponible ?? true,
          },
          update: {
            nombre: p.nombre,
            precio: p.precio,
            stockActual: p.stockActual ?? null,
            categoriaNombre: p.categoria?.nombre ?? 'COCINA',
            categoriaArea: p.categoria?.area ?? 'COCINA',
            disponible: p.disponible ?? true,
          },
        })
      ));
    }
  }

  /** Mapea el área de la categoría del producto (COCINA/BARRA/INVENTARIO) al
   * área de ítem de pedido: COCINA/BARRA pasan por producción (KDS), un valor
   * desconocido/legado cae en Cocina por seguridad — nunca al revés
   * (INVENTARIO por defecto ocultaría un plato de la vista de cocina). */
  private mapearAreaCategoriaAItemArea(categoriaArea: string | null | undefined): ItemArea {
    if (categoriaArea === 'BARRA') return ItemArea.Bar;
    if (categoriaArea === 'INVENTARIO') return ItemArea.Directo;
    return ItemArea.Cocina;
  }

  private async validarYMapearItems(itemsToProcess: PedidoItemInput[]): Promise<PedidoItemMapeado[]> {
    const ids = itemsToProcess.map(i => i.productoId);
    await this.asegurarProductosLocales(ids);

    const productos = await this.prisma.productoLocal.findMany({
      where: { id: { in: ids } }
    });
    const mapa = new Map(productos.map(p => [p.id, p]));

    return itemsToProcess.map(item => {
      const p = mapa.get(item.productoId);
      if (!p) throw new NotFoundException(`Producto ${item.productoId} no encontrado`);
      if (item.cantidad < 1) {
        throw new BadRequestException(`La cantidad para ${p.nombre} debe ser al menos 1.`);
      }
      if (p.stockActual !== null && p.stockActual < item.cantidad) {
        throw new BadRequestException(`Stock insuficiente para ${p.nombre}. Disponible: ${p.stockActual}`);
      }

      return {
        productoId: p.id,
        nombre: p.nombre,
        cantidad: item.cantidad,
        precioUnitario: Number(p.precio),
        stockActual: p.stockActual,
        // El área la elige el dueño en la categoría (nunca se infiere del
        // nombre) — Cocina/Barra pasan por producción, Inventario va directo
        // a cuenta (ver persistirPedido).
        area: this.mapearAreaCategoriaAItemArea(p.categoriaArea),
        notas: item.notas,
        comensal: item.identificadorComensal || 1,
      } satisfies PedidoItemMapeado;
    });
  }

  private calcularTotal(items: PedidoItemMapeado[]): Prisma.Decimal {
    return items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.precioUnitario).times(item.cantidad)),
      new Prisma.Decimal(0),
    );
  }

  private async persistirPedido({
    mesaId,
    sedeId,
    numeroMesa,
    items,
    total,
    cliente,
    telefono,
    direccion,
    proveedor,
    modalidad,
    mesero,
  }: {
    mesaId: string;
    sedeId: string;
    numeroMesa: number;
    items: PedidoItemMapeado[];
    total: Prisma.Decimal;
    cliente?: string;
    telefono?: string;
    direccion?: string;
    proveedor?: string;
    modalidad?: string;
    mesero?: MeseroPedido | null;
  }): Promise<PedidoEntity> {
    return this.prisma.$transaction(async (prisma) => {
      const itemsConStockControlado = items.filter((item) => typeof item.stockActual === 'number');
      const cantidadesPorProducto = itemsConStockControlado.reduce((acc, item) => {
        acc.set(item.productoId, (acc.get(item.productoId) ?? 0) + item.cantidad);
        return acc;
      }, new Map<string, number>());

      const productoIds = Array.from(cantidadesPorProducto.keys()).sort((a, b) => a.localeCompare(b));
      for (const productoId of productoIds) {
        const cantidad = cantidadesPorProducto.get(productoId)!;
        await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${productoId}))`);
        const reservado = await prisma.$queryRaw<{ stockActual: number }[]>(Prisma.sql`
          UPDATE productos_locales
          SET "stockActual" = "stockActual" - ${cantidad}
          WHERE id = ${productoId}
            AND "stockActual" IS NOT NULL
            AND "stockActual" >= ${cantidad}
          RETURNING "stockActual"
        `);

        if (reservado.length === 0) {
          const producto = items.find((item) => item.productoId === productoId);
          throw new BadRequestException(`Stock insuficiente para ${producto?.nombre ?? productoId}.`);
        }
      }

      // "Cocina manda": un ítem de Inventario (DIRECTO) no necesita
      // preparación — el mesero lo sirve directo, así que nace ENTREGADO.
      // Cocina Y Barra sí pasan por producción. Si el pedido no tiene NINGÚN
      // ítem de producción, no hay nada que derive luego (nunca se llama a
      // actualizarEstadoItem), así que el pedido entero arranca ya ENTREGADO
      // en vez de quedar PENDIENTE para siempre.
      const tieneItemDeProduccion = items.some((item) => item.area !== ItemArea.Directo);
      const estadoInicialPedido = tieneItemDeProduccion ? PedidoEstado.Pendiente : PedidoEstado.Entregado;

      const pedido = await prisma.pedido.create({
        data: {
          mesaId,
          sedeId,
          numeroMesa,
          estado: estadoInicialPedido,
          total,
          cliente,
          telefono,
          direccion,
          proveedor,
          modalidad: modalidad ?? 'MESA',
          meseroId: mesero?.id,
          meseroNombre: mesero?.nombre ?? mesero?.id,
          items: {
            create: items.map(item => ({
              productoId: item.productoId,
              nombre: item.nombre,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              area: item.area,
              estado: item.area === ItemArea.Directo ? EstadoItem.Entregado : EstadoItem.Pendiente,
              notas: item.notas,
              comensal: item.comensal,
              meseroId: mesero?.id,
              meseroNombre: mesero?.nombre ?? mesero?.id,
            }))
          }
        },
        include: {
          items: true
        }
      });

      const pedidoDto = this.mapToDto(pedido);

      await prisma.outboxEvent.createMany({
        data: [
          {
            routingKey: RoutingKeys.PedidoCreado,
            payload: JSON.stringify({ pedido: pedidoDto }),
            status: 'PENDING',
          },
          {
            routingKey: RoutingKeys.PedidoActualizado,
            payload: JSON.stringify({ pedido: pedidoDto }),
            status: 'PENDING',
          }
        ]
      });

      return pedido;
    });
  }


  async listarPedidos(query: ListarPedidosQuery = {}, usuarioSedeId?: string | null): Promise<PedidoListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const limit = this.normalizeLimit(query.limit);
    const where: Prisma.PedidoWhereInput = {
      sedeId,
      ...(query.mesaId ? { mesaId: query.mesaId } : {}),
      ...(query.estado
        ? { estado: query.estado }
        // Buscar por correlativo típicamente apunta a un pedido ya cerrado
        // (cross-referencing desde Mermas/Auditoría) — no tiene sentido
        // aplicarle el filtro "solo activos" por defecto.
        : !query.search
          ? { estado: { notIn: [PedidoEstado.Pagado, PedidoEstado.Cancelado] } }
          : {}),
      ...(query.updatedSince
        ? { updatedAt: { gte: new Date(query.updatedSince) } }
        : {}),
      ...(query.search
        ? { cuentaCorrelativo: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const pedidos = await this.prisma.pedido.findMany({
      where,
      include: {
        items: true
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    const hasMore = pedidos.length > limit;
    const data = pedidos.slice(0, limit);

    return {
      data: data.map(p => this.mapToDto(p)),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  // T-40: transiciones de estado y saga delegadas en PedidosSagaService.
  async actualizarEstado(id: string, command: ActualizarEstadoPedidoCommand): Promise<{ message: string; pedido: PedidoDto }> {
    return this.saga.actualizarEstado(id, command);
  }

  async actualizarEstadoItem(
    itemId: string,
    command: ActualizarEstadoItemCommand,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
  ): Promise<{ message: string }> {
    return this.saga.actualizarEstadoItem(itemId, command, usuarioId, usuarioNombre);
  }

  // CU-01/CU-05: anulación de ítems ya preparados y su auditoría, delegadas
  // en PedidosSagaService (misma dueña de las transiciones de estado y del
  // recálculo de total cobrable que ya usaba actualizarEstadoItem).
  async anularItemPreparado(
    itemId: string,
    command: AnularItemPreparadoCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
  ) {
    return this.saga.anularItemPreparado(itemId, command, usuarioSedeId, sedeIdSolicitado, usuarioId, usuarioNombre);
  }

  // CU-02: delegada también en PedidosSagaService (necesita las mismas
  // primitivas de cancelación/recálculo de total, más el HTTP client de mesas).
  async anularAtencionMesa(
    mesaId: string,
    command: AnularAtencionMesaCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
  ) {
    return this.saga.anularAtencionMesa(mesaId, command, usuarioSedeId, sedeIdSolicitado, usuarioId, usuarioNombre);
  }

  // Anular UN pedido puntual desde el tablero de Pedidos — delegada también
  // en PedidosSagaService, mismo criterio que anularAtencionMesa.
  async anularPedido(
    pedidoId: string,
    command: AnularPedidoCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
  ) {
    return this.saga.anularPedido(pedidoId, command, usuarioSedeId, sedeIdSolicitado, usuarioId, usuarioNombre);
  }

  async listarAnulaciones(query: ListarAnulacionesQuery, usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    return this.saga.listarAnulaciones(query, usuarioSedeId, sedeIdSolicitado);
  }

  async actualizarAnulacion(id: string, command: ActualizarAnulacionCommand, usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    return this.saga.actualizarAnulacion(id, command, usuarioSedeId, sedeIdSolicitado);
  }

  async invalidarAnulacion(
    id: string,
    command: InvalidarAnulacionCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    usuarioNombre?: string | null,
  ) {
    return this.saga.invalidarAnulacion(id, command, usuarioSedeId, sedeIdSolicitado, usuarioNombre);
  }

  async upsertMesaLocal(mesa: { id: string; numero: number; sedeId: string }): Promise<void> {
    await this.prisma.mesaLocal.upsert({
      where: { id: mesa.id },
      update: { numero: mesa.numero, sedeId: mesa.sedeId },
      create: { id: mesa.id, numero: mesa.numero, sedeId: mesa.sedeId }
    });
  }

  async upsertProductoLocal(producto: {
    id: string;
    nombre: string;
    precio: number;
    stockActual: number | null;
    categoriaNombre: string;
    categoriaArea?: string;
    disponible: boolean;
    allowStockIncrease?: boolean;
    stockDelta?: number;
    stockSyncMode?: 'REPOSICION' | 'CONSUMO_PEDIDO' | 'MERMA';
  }): Promise<void> {
    await this.upsertProductoLocalConPrisma(this.prisma, producto);
  }

  async procesarProductoCreado(payload: ProductoCreadoPayload): Promise<void> {
    await this.procesarEventoProducto(
      RoutingKeys.ProductoCreado,
      payload,
      (prisma) => this.upsertProductoLocalConPrisma(prisma, {
        id: payload.id,
        nombre: payload.nombre,
        precio: payload.precio,
        stockActual: payload.stockActual ?? null,
        categoriaNombre: payload.categoriaNombre ?? 'COCINA',
        categoriaArea: payload.categoriaArea ?? 'COCINA',
        disponible: payload.disponible,
        allowStockIncrease: false,
      }),
    );
  }

  async procesarProductoActualizado(payload: ProductoActualizadoPayload): Promise<void> {
    await this.procesarEventoProducto(
      RoutingKeys.ProductoActualizado,
      payload,
      (prisma) => this.upsertProductoLocalConPrisma(prisma, {
        id: payload.id,
        nombre: payload.nombre,
        precio: payload.precio,
        stockActual: payload.stockActual ?? null,
        stockDelta: payload.stockDelta,
        stockSyncMode: payload.stockSyncMode,
        categoriaNombre: payload.categoriaNombre ?? 'COCINA',
        categoriaArea: payload.categoriaArea ?? 'COCINA',
        disponible: payload.disponible,
        allowStockIncrease: payload.stockSyncMode === 'REPOSICION' && (payload.stockDelta ?? 0) > 0,
      }),
    );
  }

  /** T-40: compensación de la saga de stock delegada en PedidosSagaService. */
  async procesarStockInsuficiente(payload: StockInsuficientePayload): Promise<void> {
    return this.saga.procesarStockInsuficiente(payload);
  }

  async procesarCuentaAsociada(payload: CuentaAsociadaPayload): Promise<void> {
    return this.saga.procesarCuentaAsociada(payload);
  }

  private async procesarEventoProducto(
    routingKey: string,
    payload: { id: string; eventId?: string; stockSyncMode?: string; stockDelta?: number; stockActual?: number | null },
    apply: (prisma: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    const fallbackKey = routingKey === RoutingKeys.ProductoActualizado
      ? `${payload.id}:${payload.stockSyncMode ?? 'SIN_MODO'}:${payload.stockDelta ?? 'SIN_DELTA'}:${payload.stockActual ?? 'SIN_STOCK'}`
      : payload.id;
    const idempotencyKey = `${routingKey}:${payload.eventId ?? fallbackKey}`;
    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: idempotencyKey } });
        await apply(prisma);
      });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarEventoProducto',
          aggregateId: payload.id,
          idempotencyKey,
          message: 'Evento ya procesado — proyección de productos no se aplica de nuevo (idempotente).',
        } satisfies OperableLog);
        return;
      }
      throw error;
    }
  }

  private async upsertProductoLocalConPrisma(prisma: Prisma.TransactionClient, producto: {
    id: string;
    nombre: string;
    precio: number;
    stockActual: number | null;
    stockDelta?: number;
    stockSyncMode?: 'REPOSICION' | 'CONSUMO_PEDIDO' | 'MERMA';
    categoriaNombre: string;
    categoriaArea?: string;
    disponible: boolean;
    allowStockIncrease?: boolean;
  }): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${producto.id}))`);
    const existente = await prisma.productoLocal.findUnique({ where: { id: producto.id } });
    let stockActual = producto.stockActual;

    if (existente) {
      stockActual = existente.stockActual;
      if (
        producto.stockSyncMode === 'REPOSICION' &&
        producto.allowStockIncrease &&
        Number.isFinite(producto.stockDelta) &&
        (producto.stockDelta ?? 0) > 0
      ) {
        stockActual = existente.stockActual === null
          ? producto.stockActual
          : existente.stockActual + (producto.stockDelta ?? 0);
      }
    }

    await prisma.productoLocal.upsert({
      where: { id: producto.id },
      update: {
        nombre: producto.nombre,
        precio: producto.precio,
        stockActual,
        categoriaNombre: producto.categoriaNombre,
        categoriaArea: producto.categoriaArea ?? 'COCINA',
        disponible: producto.disponible,
      },
      create: {
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        stockActual,
        categoriaNombre: producto.categoriaNombre,
        categoriaArea: producto.categoriaArea ?? 'COCINA',
        disponible: producto.disponible,
      },
    });
  }

  private mapToDto(p: PedidoEntity): PedidoDto {
    return mapPedidoToDto(p);
  }

  async procesarPagoRecibido(payload: PagoRegistradoPayload): Promise<void> {
    // T-16 (pagos divididos): un pago parcial no marca los pedidos como
    // pagados — solo el pago que deja la cuenta en 0 pendiente lo hace.
    if (payload.pendiente > 0.01) {
      this.logger.log({
        operation: 'procesarPagoRecibido',
        aggregateId: payload.cuentaId,
        message: `Pago parcial (transacción ${payload.transaccionId}); pedidos de la mesa ${payload.mesaId} no se marcan pagados aún.`,
      } satisfies OperableLog);
      return;
    }

    this.logger.log({
      operation: 'procesarPagoRecibido',
      aggregateId: payload.cuentaId,
      message: `Procesando pago recibido para la mesa ${payload.mesaId}.`,
    } satisfies OperableLog);

    try {
      await this.prisma.$transaction(async (prisma) => {
        // Clave por transacción (no por cuenta): con pagos divididos puede
        // haber varios eventos PagoRegistrado legítimos para la misma
        // cuenta — uno por parte — y solo el último (pendiente=0) llega aquí.
        await prisma.idempotencyKey.create({ data: { key: `pago:${payload.transaccionId}` } });
        await prisma.pedido.updateMany({
          where: {
            mesaId: payload.mesaId,
            estado: {
              notIn: [
                PedidoEstado.Pagado,
                PedidoEstado.Cancelado,
                PedidoEstado.RechazadoSinStock,
              ],
            },
          },
          data: { estado: PedidoEstado.Pagado },
        });
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
         this.logger.warn({
           operation: 'procesarPagoRecibido',
           aggregateId: payload.cuentaId,
           message: 'Evento PagoRegistrado ya procesado — idempotente.',
         } satisfies OperableLog);
         return;
      }
      throw e;
    }
  }
}
