import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  PedidoDto,
  ActualizarEstadoPedidoCommand,
  ActualizarEstadoItemCommand,
  PedidoEstado,
  EstadoItem,
  ItemArea,
  RoutingKeys,
  StockInsuficientePayload,
  PedidoItemAnuladoPayload,
  PedidoItemAnuladoConMermaPayload,
  StockRestauradoPayload,
  AnularItemPreparadoCommand,
  AnulacionAuditoriaDto,
  ListarAnulacionesQuery,
  ActualizarAnulacionCommand,
  InvalidarAnulacionCommand,
  TipoAnulacion,
  EstadoPlatoAnulacion,
  AnularAtencionMesaCommand,
  AnularAtencionMesaResultado,
  AnularPedidoCommand,
  MesaEstado,
  CuentaAsociadaPayload,
} from '@org/contracts';
import { resolveSedeId } from '@org/shared-auth';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { mapPedidoToDto } from './pedido.mapper';
import { Prisma } from '../generated/prisma';
import { MesasHttpClient } from './mesas-http.client';
import { CuentasHttpClient } from './cuentas-http.client';


/**
 * T-40: transiciones de estado del pedido y compensación de la saga de stock,
 * extraídas del god-service. AppService queda como orquestador de creación,
 * listados y proyecciones locales.
 */
@Injectable()
export class PedidosSagaService {
  private readonly logger = new Logger(PedidosSagaService.name);
  private readonly pedidosRechazadosCounter = getOrCreateCounter(
    'pedidos_rechazados_sin_stock_total', 'Ítems/pedidos rechazados por falta de stock',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly mesasHttp: MesasHttpClient,
    private readonly cuentasHttp: CuentasHttpClient,
  ) {}

  /**
   * Transiciones permitidas del estado *del pedido* vía el endpoint de pedido.
   * "Cocina manda": el tramo de producción (PENDIENTE → EN_PREPARACION → LISTO)
   * se deriva de los ítems (ver `derivarEstadoPedido`), por eso este endpoint
   * existe principalmente para el tramo comercial (LISTO → ENTREGADO → PAGADO) y
   * cancelaciones. Las transiciones de producción quedan disponibles como
   * override manual, pero la UI por defecto no las expone.
   */
  private static readonly TRANSICIONES: Record<PedidoEstado, PedidoEstado[]> = {
    [PedidoEstado.Pendiente]: [PedidoEstado.EnPreparacion, PedidoEstado.Listo, PedidoEstado.Cancelado],
    [PedidoEstado.EnPreparacion]: [PedidoEstado.Pendiente, PedidoEstado.Listo, PedidoEstado.Cancelado],
    [PedidoEstado.Listo]: [PedidoEstado.EnPreparacion, PedidoEstado.Entregado, PedidoEstado.Cancelado],
    [PedidoEstado.Entregado]: [PedidoEstado.Pagado, PedidoEstado.Cancelado],
    [PedidoEstado.Pagado]: [],
    [PedidoEstado.Cancelado]: [],
    // Estado terminal puesto por la compensación de saga; no es destino de
    // ninguna transición manual vía el endpoint de estado.
    [PedidoEstado.RechazadoSinStock]: [],
  };

  private validarTransicion(actual: PedidoEstado, siguiente: PedidoEstado): void {
    if (actual === siguiente) return;
    const permitidas = PedidosSagaService.TRANSICIONES[actual] ?? [];
    if (!permitidas.includes(siguiente)) {
      throw new BadRequestException(
        `Transición de estado inválida: ${actual} → ${siguiente}`,
      );
    }
  }

  /**
   * Deriva el estado de producción del pedido a partir de sus ítems.
   * Fuente de verdad de PENDIENTE / EN_PREPARACION / LISTO ("cocina manda").
   * No decide ENTREGADO/PAGADO/CANCELADO: esos son comerciales.
   */
  private derivarEstadoPedido(
    estadosRaw: string[],
  ): PedidoEstado | null {
    // Los ítems rechazados por falta de stock o anulados no participan en la
    // derivación de producción ("cocina manda"): ni un ítem fantasma ni uno
    // anulado deben impedir que el resto del pedido avance a LISTO.
    const estados = estadosRaw.filter(
      (e) => e !== EstadoItem.RechazadoSinStock && e !== EstadoItem.Cancelado,
    );
    if (estados.length === 0) {
      // Si había ítems y TODOS terminaron cancelados/rechazados, el pedido en
      // sí debe reflejarlo — antes se devolvía null ("no tocar el estado"),
      // que solo es correcto para un pedido recién creado sin ítems todavía;
      // aplicado acá dejaba el pedido congelado para siempre en su último
      // estado de producción (p. ej. EN_PREPARACION) pese a no tener nada
      // que preparar ni cobrar (bug reportado: el pedido anulado seguía
      // en la columna "En preparación" del tablero de Pedidos).
      return estadosRaw.length > 0 ? PedidoEstado.Cancelado : null;
    }
    const todosListos = estados.every(
      (e) => e === EstadoItem.Listo || e === EstadoItem.Entregado,
    );
    if (todosListos) return PedidoEstado.Listo;
    const algunoEnMarcha = estados.some(
      (e) => e === EstadoItem.EnPreparacion || e === EstadoItem.Listo || e === EstadoItem.Entregado,
    );
    if (algunoEnMarcha) return PedidoEstado.EnPreparacion;
    return PedidoEstado.Pendiente;
  }

  private recalcularTotalCobrable(
    items: Array<{ estado: string; precioUnitario: number | { toNumber(): number }; cantidad: number }>,
  ): number {
    return items
      .filter((item) => item.estado !== EstadoItem.RechazadoSinStock && item.estado !== EstadoItem.Cancelado)
      .reduce((total, item) => {
        const precio = typeof item.precioUnitario === 'number'
          ? item.precioUnitario
          : item.precioUnitario.toNumber();
        return total + precio * item.cantidad;
      }, 0);
  }

  /**
   * Correlativo legible por sede ("AN0000001") para AnulacionAuditoria —
   * mismo patrón que siguienteCorrelativo en servicio-cuentas/reservas.
   */
  private async siguienteCorrelativoAnulacion(prisma: Prisma.TransactionClient, sedeId: string): Promise<string> {
    const secuencia = await prisma.secuenciaAnulacion.upsert({
      where: { sedeId },
      create: { sedeId, ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    return `AN${String(secuencia.ultimo).padStart(7, '0')}`;
  }

  /**
   * CU-02 automático: tras anular un ítem uno por uno (o un pedido entero),
   * si TODOS los ítems de TODOS los pedidos de la misma atención (cuentaId)
   * quedaron en un estado terminal no cobrable, la atención se cancela
   * sola — mismo criterio "mantenidos === 0" que el botón manual "Anular
   * atención de mesa" (ver anularAtencionMesa), pero sin que el usuario
   * tenga que presionarlo. Debe llamarse DENTRO de la transacción, después
   * de aplicar el cambio de estado del ítem que la dispara.
   */
  private async cuentaQuedoTotalmenteAnulada(
    prisma: Prisma.TransactionClient,
    cuentaId: string | null | undefined,
  ): Promise<{ mesaId: string } | null> {
    if (!cuentaId) return null;
    const pedidos = await prisma.pedido.findMany({
      where: { cuentaId },
      include: { items: true },
    });
    if (pedidos.length === 0) return null;
    const todoAnulado = pedidos.every((p) =>
      p.items.every((i) => i.estado === EstadoItem.Cancelado || i.estado === EstadoItem.RechazadoSinStock),
    );
    return todoAnulado ? { mesaId: pedidos[0].mesaId } : null;
  }

  /**
   * Ejecuta el efecto de la cascada FUERA de la transacción (llamadas HTTP a
   * otros servicios, mismo criterio que anularAtencionMesa): libera la mesa
   * y cancela la cuenta. Best-effort — un fallo de red no revierte nada, ya
   * quedó anulado en nuestra BD; solo se loguea dentro de cada cliente HTTP.
   */
  private async ejecutarCascadaCancelacion(cuentaId: string, mesaId: string): Promise<void> {
    await Promise.all([
      this.mesasHttp.liberarMesa(mesaId, MesaEstado.Libre),
      this.cuentasHttp.cancelarCuenta(cuentaId),
    ]);
  }

  async actualizarEstado(id: string, command: ActualizarEstadoPedidoCommand): Promise<{ message: string; pedido: PedidoDto }> {
    const pedido = await this.prisma.$transaction(async (prisma) => {
      const actual = await prisma.pedido.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException(`Pedido ${id} no encontrado`);
      }
      this.validarTransicion(actual.estado, command.estado);

      const updateResult = await prisma.pedido.updateMany({
        where: { id, estado: actual.estado },
        data: { estado: command.estado }
      });

      if (updateResult.count === 0) {
        throw new BadRequestException('El estado del pedido cambió concurrentemente.');
      }

      const p = await prisma.pedido.findUnique({
        where: { id },
        include: { items: true }
      });
      if (!p) throw new NotFoundException('Pedido no encontrado tras actualización');

      const pedidoDto = mapPedidoToDto(p);
      const outboxData: Array<{ routingKey: string; payload: string; status: string }> = [];

      if (command.estado === PedidoEstado.Listo) {
        outboxData.push({
          routingKey: RoutingKeys.PedidoListo,
          payload: JSON.stringify({
            pedidoId: p.id,
            mesaId: p.mesaId,
          }),
          status: 'PENDING',
        });
      }

      outboxData.push({
        routingKey: RoutingKeys.PedidoActualizado,
        payload: JSON.stringify({ pedido: pedidoDto }),
        status: 'PENDING',
      });

      await prisma.outboxEvent.createMany({ data: outboxData });

      return p;
    });

    return { message: 'Estado del pedido actualizado', pedido: mapPedidoToDto(pedido) };
  }

  async actualizarEstadoItem(
    itemId: string,
    command: ActualizarEstadoItemCommand,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
  ): Promise<{ message: string }> {
    const resultado = await this.prisma.$transaction(async (prisma) => {
      const item = await prisma.pedidoItem.update({
        where: { id: itemId },
        data: { estado: command.estado }
      });

      const pedidoId = item.pedidoId;

      // Adquirimos un advisory lock por pedidoId para secuenciar transacciones simultáneas del mismo pedido
      await prisma.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${pedidoId}))`
      );

      const pedidoActual = await prisma.pedido.findUnique({
        where: { id: pedidoId },
        include: { items: true },
      });
      if (!pedidoActual) {
        return { message: 'Estado del ítem actualizado exitosamente', cascada: null };
      }


      // "Cocina manda": derivamos el estado de producción del pedido desde sus
      // ítems. Solo lo aplicamos si el pedido sigue en fase de producción; nunca
      // pisamos un estado comercial (ENTREGADO/PAGADO/CANCELADO).
      const estadoActual = pedidoActual.estado;
      const enProduccion =
        estadoActual === PedidoEstado.Pendiente ||
        estadoActual === PedidoEstado.EnPreparacion ||
        estadoActual === PedidoEstado.Listo;
      const derivado = this.derivarEstadoPedido(pedidoActual.items.map((i) => i.estado));

      let pedidoFinal = pedidoActual;
      const cambiaAListo =
        enProduccion && derivado === PedidoEstado.Listo && estadoActual !== PedidoEstado.Listo;

      // Un ítem anulado ya no debe cobrarse — recalculamos el total cobrable
      // del pedido en el mismo movimiento (mismo criterio que la compensación
      // de stock insuficiente).
      const seAnuloItem = command.estado === EstadoItem.Cancelado;
      const nuevoTotal = seAnuloItem ? this.recalcularTotalCobrable(pedidoActual.items) : null;

      const dataUpdate: { estado?: PedidoEstado; total?: number } = {};
      if (enProduccion && derivado && derivado !== estadoActual) dataUpdate.estado = derivado;
      if (nuevoTotal !== null) dataUpdate.total = nuevoTotal;

      if (Object.keys(dataUpdate).length > 0) {
          pedidoFinal =
          (await prisma.pedido.update({
            where: { id: pedidoId },
            data: dataUpdate,
            include: { items: true },
          })) ?? pedidoActual;
      }

      const outboxData: Array<{ routingKey: string; payload: string; status: string }> = [];
      if (cambiaAListo) {
        outboxData.push({
          routingKey: RoutingKeys.PedidoListo,
          payload: JSON.stringify({ pedidoId, mesaId: pedidoFinal.mesaId }),
          status: 'PENDING',
        });
      }
      // Aviso al KDS (Cocina o Barra): solo si el ítem anulado pasaba por
      // producción — uno de Inventario (DIRECTO) ya nació ENTREGADO, el
      // mesero ya lo sirvió, no hay nada que "dejar de preparar".
      if (seAnuloItem && item.area !== ItemArea.Directo) {
        const payload: PedidoItemAnuladoPayload = {
          pedidoId,
          itemId: item.id,
          productoNombre: item.nombre,
          mesaId: pedidoFinal.mesaId,
          motivo: command.motivo,
        };
        outboxData.push({
          routingKey: RoutingKeys.PedidoItemAnulado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        });
      }
      // CU-05 Caso A: un ítem que se anula sin haber salido de cocina/barra
      // (nunca se cobró, nunca se preparó) también queda en la auditoría —
      // no solo el Caso B (ya preparado) de anularItemPreparado.
      let cascada: { cuentaId: string; mesaId: string } | null = null;
      if (seAnuloItem) {
        const correlativoAnulacion = await this.siguienteCorrelativoAnulacion(prisma, pedidoActual.sedeId);
        await prisma.anulacionAuditoria.create({
          data: {
            correlativo: correlativoAnulacion,
            sedeId: pedidoActual.sedeId,
            mesaId: pedidoFinal.mesaId,
            mesaNumero: pedidoFinal.numeroMesa,
            pedidoId,
            cuentaCorrelativo: pedidoFinal.cuentaCorrelativo,
            itemId: item.id,
            tipo: TipoAnulacion.Item,
            productoId: item.productoId,
            productoNombre: item.nombre,
            cantidad: item.cantidad,
            estadoPlato: EstadoPlatoAnulacion.SinPreparar,
            cobrado: false,
            montoAnulado: Number(item.precioUnitario) * item.cantidad,
            motivo: command.motivo?.trim() || 'Sin motivo especificado',
            usuarioId: usuarioId ?? undefined,
            usuarioNombre: usuarioNombre ?? undefined,
            clienteNombre: pedidoFinal.cliente ?? undefined,
          },
        });

        const cuentaAnulada = await this.cuentaQuedoTotalmenteAnulada(prisma, pedidoFinal.cuentaId);
        if (cuentaAnulada) cascada = { cuentaId: pedidoFinal.cuentaId as string, mesaId: cuentaAnulada.mesaId };
      }
      outboxData.push({
        routingKey: RoutingKeys.PedidoActualizado,
        payload: JSON.stringify({ pedido: mapPedidoToDto(pedidoFinal) }),
        status: 'PENDING',
      });
      await prisma.outboxEvent.createMany({ data: outboxData });

      return { message: 'Estado del ítem actualizado exitosamente', cascada };
    });

    if (resultado.cascada) {
      await this.ejecutarCascadaCancelacion(resultado.cascada.cuentaId, resultado.cascada.mesaId);
    }

    return { message: resultado.message };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 50);
    if (!Number.isFinite(parsed)) return 50;
    return Math.min(Math.max(Math.trunc(parsed), 1), 200);
  }

  private toAnulacionDto(a: {
    id: string;
    correlativo?: string | null;
    fecha: Date;
    mesaId: string;
    mesaNumero: number | null;
    pedidoId: string;
    cuentaCorrelativo?: string | null;
    itemId: string | null;
    tipo: string;
    productoId: string | null;
    productoNombre: string | null;
    cantidad: number | null;
    estadoPlato: string;
    cobrado: boolean;
    montoAnulado: Prisma.Decimal;
    motivo: string;
    observacion: string | null;
    usuarioId: string | null;
    usuarioNombre: string | null;
    clienteNombre: string | null;
    invalidada: boolean;
    invalidadaMotivo: string | null;
    invalidadaPorNombre: string | null;
    invalidadaAt: Date | null;
  }): AnulacionAuditoriaDto {
    return {
      id: a.id,
      correlativo: a.correlativo,
      fecha: a.fecha.toISOString(),
      mesaId: a.mesaId,
      mesaNumero: a.mesaNumero,
      pedidoId: a.pedidoId,
      cuentaCorrelativo: a.cuentaCorrelativo,
      itemId: a.itemId,
      tipo: a.tipo as TipoAnulacion,
      productoId: a.productoId,
      productoNombre: a.productoNombre,
      cantidad: a.cantidad,
      estadoPlato: a.estadoPlato as EstadoPlatoAnulacion,
      cobrado: a.cobrado,
      montoAnulado: a.montoAnulado.toNumber(),
      motivo: a.motivo,
      observacion: a.observacion,
      usuarioId: a.usuarioId,
      usuarioNombre: a.usuarioNombre,
      clienteNombre: a.clienteNombre,
      invalidada: a.invalidada,
      invalidadaMotivo: a.invalidadaMotivo,
      invalidadaPorNombre: a.invalidadaPorNombre,
      invalidadaAt: a.invalidadaAt ? a.invalidadaAt.toISOString() : null,
    };
  }

  /**
   * CU-01, Caso B: anula un ítem que YA salió de cocina/barra (o es de
   * Inventario y por lo tanto nació ENTREGADO). Un ítem PENDIENTE debe
   * anularse por el endpoint genérico de estado (CANCELADO), sin merma ni
   * decisión de cobro de por medio — este endpoint es solo para la pérdida
   * ya consumada.
   *
   * "SÍ COBRAR": el ítem se queda en la cuenta tal cual (no cambia de
   * estado) — solo se registra la merma/auditoría del costo perdido.
   * "NO COBRAR": el ítem pasa a CANCELADO (sale del total cobrable, mismo
   * mecanismo que la cancelación genérica) además de la merma/auditoría.
   * Ninguno de los dos casos avisa a cocina (`PedidoItemAnulado`): el plato
   * ya salió, no hay nada que "dejar de preparar".
   */
  async anularItemPreparado(
    itemId: string,
    command: AnularItemPreparadoCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
  ): Promise<{ message: string; pedido: PedidoDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const { pedido: pedidoFinal, cascada } = await this.prisma.$transaction(async (prisma) => {
      const item = await prisma.pedidoItem.findUnique({ where: { id: itemId }, include: { pedido: true } });
      if (!item || item.pedido.sedeId !== sedeId) throw new NotFoundException(`Ítem ${itemId} no encontrado`);
      if (item.estado === EstadoItem.Pendiente) {
        throw new BadRequestException('Este ítem aún no se preparó; usa el cambio de estado a CANCELADO en vez de anular-preparado.');
      }
      if (item.estado === EstadoItem.Cancelado || item.estado === EstadoItem.RechazadoSinStock) {
        throw new BadRequestException(`El ítem ya está en estado ${item.estado}; no se puede anular de nuevo.`);
      }

      await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${item.pedidoId}))`);
      const pedidoActual = await prisma.pedido.findUniqueOrThrow({ where: { id: item.pedidoId }, include: { items: true } });

      let pedido = pedidoActual;
      if (!command.cobrar) {
        const itemCancelado = await prisma.pedidoItem.update({ where: { id: itemId }, data: { estado: EstadoItem.Cancelado } });
        const itemsActualizados = pedidoActual.items.map((i) => (i.id === itemId ? itemCancelado : i));
        const nuevoTotal = this.recalcularTotalCobrable(itemsActualizados);
        // Mismo fix que actualizarEstadoItem/anularAtencionMesa: si este era
        // el último ítem activo del pedido, sin esto el pedido se quedaba
        // congelado en su último estado de producción para siempre.
        const todosCerrados = itemsActualizados.every((i) => i.estado === EstadoItem.Cancelado || i.estado === EstadoItem.RechazadoSinStock);
        pedido = await prisma.pedido.update({
          where: { id: item.pedidoId },
          data: { total: nuevoTotal, ...(todosCerrados ? { estado: PedidoEstado.Cancelado } : {}) },
          include: { items: true },
        });
      }

      const montoAnulado = Number(item.precioUnitario) * item.cantidad;
      const correlativoAnulacion = await this.siguienteCorrelativoAnulacion(prisma, sedeId);
      const auditoria = await prisma.anulacionAuditoria.create({
        data: {
          correlativo: correlativoAnulacion,
          sedeId,
          mesaId: pedido.mesaId,
          mesaNumero: pedido.numeroMesa,
          pedidoId: pedido.id,
          cuentaCorrelativo: pedido.cuentaCorrelativo,
          itemId: item.id,
          tipo: TipoAnulacion.Item,
          productoId: item.productoId,
          productoNombre: item.nombre,
          cantidad: item.cantidad,
          estadoPlato: EstadoPlatoAnulacion.Preparado,
          cobrado: command.cobrar,
          montoAnulado,
          motivo: command.motivo,
          observacion: command.observacion,
          usuarioId: usuarioId ?? undefined,
          usuarioNombre: usuarioNombre ?? undefined,
          clienteNombre: pedido.cliente ?? undefined,
        },
      });

      let cascada: { cuentaId: string; mesaId: string } | null = null;
      if (!command.cobrar) {
        const cuentaAnulada = await this.cuentaQuedoTotalmenteAnulada(prisma, pedido.cuentaId);
        if (cuentaAnulada) cascada = { cuentaId: pedido.cuentaId as string, mesaId: cuentaAnulada.mesaId };
      }

      const mermaPayload: PedidoItemAnuladoConMermaPayload = {
        eventId: auditoria.id,
        pedidoId: pedido.id,
        itemId: item.id,
        productoId: item.productoId,
        productoNombre: item.nombre,
        cantidad: item.cantidad,
        motivo: command.motivo,
        observacion: command.observacion,
        cobrado: command.cobrar,
        usuarioId: usuarioId ?? undefined,
        usuarioNombre: usuarioNombre ?? undefined,
        cuentaCorrelativo: pedido.cuentaCorrelativo,
      };

      const outboxData: Array<{ routingKey: string; payload: string; status: string }> = [
        { routingKey: RoutingKeys.PedidoItemAnuladoConMerma, payload: JSON.stringify(mermaPayload), status: 'PENDING' },
      ];
      if (!command.cobrar) {
        outboxData.push({
          routingKey: RoutingKeys.PedidoActualizado,
          payload: JSON.stringify({ pedido: mapPedidoToDto(pedido) }),
          status: 'PENDING',
        });
      }
      await prisma.outboxEvent.createMany({ data: outboxData });

      return { pedido, cascada };
    });

    if (cascada) {
      await this.ejecutarCascadaCancelacion(cascada.cuentaId, cascada.mesaId);
    }

    this.logger.log({
      operation: 'anularItemPreparado',
      aggregateId: itemId,
      resultingState: command.cobrar ? 'ANULADO_COBRADO' : 'ANULADO_NO_COBRADO',
      message: `Ítem ${itemId} anulado (${command.cobrar ? 'se cobra' : 'no se cobra'}): ${command.motivo}`,
    } satisfies OperableLog);

    return {
      message: command.cobrar ? 'Ítem anulado; se mantiene en la cuenta' : 'Ítem anulado y retirado de la cuenta',
      pedido: mapPedidoToDto(pedidoFinal),
    };
  }

  /**
   * Núcleo compartido de "cancelar todos los ítems vivos de UN pedido"
   * (extraído de anularAtencionMesa para reusarlo en anularPedido — CU-02
   * anula por MESA, la versión nueva anula por PEDIDO puntual). Cancela
   * ítem por ítem según el mismo criterio de siempre (¿ya salió?, ¿es
   * Inventario confirmado?), deja el pedido en el estado correcto (nunca
   * congelado — ver fix del bug de Pedido.estado), y devuelve todo lo
   * necesario para que el caller arme su propio registro de auditoría
   * (por pedido individual o agregado por mesa) y flushee los eventos.
   */
  private async cancelarItemsDePedido(
    prisma: Prisma.TransactionClient,
    pedido: { id: string; mesaId: string; estado: PedidoEstado; cuentaCorrelativo?: string | null; items: Array<{ id: string; productoId: string; nombre: string; cantidad: number; precioUnitario: number | { toNumber(): number }; area: string | null; estado: string }> },
    itemsConsumidos: Set<string>,
    motivo: string,
    usuarioId: string | null | undefined,
    usuarioNombre: string | null | undefined,
    eventoOrigen: string,
  ): Promise<{
    itemsFinal: typeof pedido.items;
    cancelados: number;
    conMerma: number;
    mantenidos: number;
    montoAnulado: number;
    outboxData: Array<{ routingKey: string; payload: string; status: string }>;
    mermaPayloads: PedidoItemAnuladoConMermaPayload[];
    stockRestauradoPayloads: StockRestauradoPayload[];
    itemsCanceladosLimpios: typeof pedido.items;
    itemsConMermaDetalle: typeof pedido.items;
    estadoForzado: boolean;
  }> {
    const itemsFinal: typeof pedido.items = [];
    const itemsCanceladosLimpios: typeof pedido.items = [];
    const itemsConMermaDetalle: typeof pedido.items = [];
    let pedidoCambio = false;
    let cancelados = 0;
    let conMerma = 0;
    let mantenidos = 0;
    let montoAnulado = 0;
    const outboxData: Array<{ routingKey: string; payload: string; status: string }> = [];
    const mermaPayloads: PedidoItemAnuladoConMermaPayload[] = [];
    const stockRestauradoPayloads: StockRestauradoPayload[] = [];

    for (const item of pedido.items) {
      if (item.estado === EstadoItem.Cancelado || item.estado === EstadoItem.RechazadoSinStock) {
        itemsFinal.push(item);
        continue;
      }

      const esDirecto = item.area === ItemArea.Directo;

      if (esDirecto && itemsConsumidos.has(item.id)) {
        // Confirmado por el cajero: sí se abrió/sirvió — se mantiene, se cobra normal.
        mantenidos++;
        itemsFinal.push(item);
        continue;
      }

      if (esDirecto) {
        // Nunca se abrió: se cancela y se devuelve el stock que ya se había reservado.
        const actualizado = await prisma.pedidoItem.update({ where: { id: item.id }, data: { estado: EstadoItem.Cancelado } });
        itemsFinal.push(actualizado);
        itemsCanceladosLimpios.push(actualizado);
        cancelados++;
        pedidoCambio = true;
        stockRestauradoPayloads.push({
          eventId: `${item.id}:${eventoOrigen}`,
          productoId: item.productoId,
          cantidad: item.cantidad,
          motivo: `Anulación: ${motivo}`,
        });
        continue;
      }

      // COCINA/BARRA:
      const actualizado = await prisma.pedidoItem.update({ where: { id: item.id }, data: { estado: EstadoItem.Cancelado } });
      itemsFinal.push(actualizado);
      pedidoCambio = true;
      const monto = Number(item.precioUnitario) * item.cantidad;

      if (item.estado === EstadoItem.Entregado) {
        // Ya se sirvió: pérdida real, no se cobra.
        conMerma++;
        montoAnulado += monto;
        itemsConMermaDetalle.push(actualizado);
        mermaPayloads.push({
          eventId: `${item.id}:${eventoOrigen}`,
          pedidoId: pedido.id,
          itemId: item.id,
          productoId: item.productoId,
          productoNombre: item.nombre,
          cantidad: item.cantidad,
          motivo,
          cobrado: false,
          usuarioId: usuarioId ?? undefined,
          usuarioNombre: usuarioNombre ?? undefined,
          cuentaCorrelativo: pedido.cuentaCorrelativo,
        });
      } else {
        // Aún no sale de cocina/barra: cancelación limpia, se avisa al KDS.
        cancelados++;
        itemsCanceladosLimpios.push(actualizado);
        const payload: PedidoItemAnuladoPayload = {
          pedidoId: pedido.id,
          itemId: item.id,
          productoNombre: item.nombre,
          mesaId: pedido.mesaId,
        };
        outboxData.push({ routingKey: RoutingKeys.PedidoItemAnulado, payload: JSON.stringify(payload), status: 'PENDING' });
      }
    }

    const todosCerrados = itemsFinal.every((i) => i.estado === EstadoItem.Cancelado || i.estado === EstadoItem.RechazadoSinStock);
    // Ítems que ya estaban cerrados ANTES de esta corrida (p. ej. anulados
    // en una pasada previa que se interrumpió) dejan `pedidoCambio` en
    // false porque este loop no tocó ningún ítem — pero el pedido puede
    // seguir congelado en un estado de producción viejo. Se autocorrige
    // aunque no haya nada nuevo que cancelar, para que un pedido huérfano
    // siempre pueda salir del tablero.
    const estadoForzado = !pedidoCambio && todosCerrados && pedido.estado !== PedidoEstado.Cancelado;

    if (pedidoCambio || estadoForzado) {
      const nuevoTotal = this.recalcularTotalCobrable(itemsFinal);
      // Si NO todos los ítems se cerraron (p. ej. quedó un ítem de
      // Inventario "mantenido" para cobro), el pedido no debe quedarse
      // congelado en el estado de producción que tenía antes de la
      // anulación — recalculamos igual que actualizarEstadoItem
      // ("cocina manda") a partir de lo que sobrevive.
      let nuevoEstado: PedidoEstado | undefined;
      if (todosCerrados) {
        nuevoEstado = PedidoEstado.Cancelado;
      } else {
        const enProduccion =
          pedido.estado === PedidoEstado.Pendiente ||
          pedido.estado === PedidoEstado.EnPreparacion ||
          pedido.estado === PedidoEstado.Listo;
        if (enProduccion) {
          const derivado = this.derivarEstadoPedido(itemsFinal.map((i) => i.estado));
          if (derivado && derivado !== pedido.estado) nuevoEstado = derivado;
        }
      }
      const pedidoActualizado = await prisma.pedido.update({
        where: { id: pedido.id },
        data: { total: nuevoTotal, ...(nuevoEstado ? { estado: nuevoEstado } : {}) },
        include: { items: true },
      });
      outboxData.push({
        routingKey: RoutingKeys.PedidoActualizado,
        payload: JSON.stringify({ pedido: mapPedidoToDto(pedidoActualizado) }),
        status: 'PENDING',
      });
    }

    return { itemsFinal, cancelados, conMerma, mantenidos, montoAnulado, outboxData, mermaPayloads, stockRestauradoPayloads, itemsCanceladosLimpios, itemsConMermaDetalle, estadoForzado };
  }

  /**
   * CU-02: el cliente abandona/desiste de la mesa antes de que termine su
   * atención. Cancela TODOS los pedidos activos de la mesa, ítem por ítem,
   * con la misma distinción de fondo que CU-01 (¿ya salió o no?) más el
   * caso propio de Inventario (DIRECTO): nace ENTREGADO aunque nunca se
   * haya abierto, así que solo `itemsConsumidos` (confirmado por el
   * cajero) dice si de verdad se consumió.
   *
   *  - COCINA/BARRA sin entregar  → se cancela limpio, avisa a cocina (nada perdido).
   *  - COCINA/BARRA ya entregado  → merma (pérdida real, no se cobra).
   *  - DIRECTO confirmado consumido → se mantiene tal cual, sigue siendo cobrable.
   *  - DIRECTO no confirmado       → se cancela y se restaura el stock reservado.
   *
   * La mesa solo se libera (HTTP a servicio-mesas) si no queda NADA
   * pendiente de cobro — si sobrevive algo cobrable (ítems de Inventario
   * confirmados), la mesa se queda con su cuenta abierta para que caja cierre.
   */
  async anularAtencionMesa(
    mesaId: string,
    command: AnularAtencionMesaCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
  ): Promise<{ message: string; resultado: AnularAtencionMesaResultado }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const itemsConsumidos = new Set(command.itemsConsumidos ?? []);

    const { itemsCancelados, itemsConMerma, itemsMantenidosParaCobro, debeLiberarMesa, cuentaIdParaCancelar } =
      await this.prisma.$transaction(async (prisma) => {
        await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${mesaId}))`);

        const pedidos = await prisma.pedido.findMany({
          where: {
            mesaId,
            sedeId,
            estado: { notIn: [PedidoEstado.Pagado, PedidoEstado.Cancelado, PedidoEstado.RechazadoSinStock] },
          },
          include: { items: true },
        });
        if (pedidos.length === 0) {
          throw new NotFoundException(`No hay atención activa para la mesa ${mesaId}.`);
        }

        let cancelados = 0;
        let conMerma = 0;
        let mantenidos = 0;
        let montoAnulado = 0;
        // Al menos un pedido de la mesa ya tenía TODOS sus ítems cerrados de
        // antes (p. ej. anulados uno por uno en llamadas previas) y quedó
        // congelado sin pasar a CANCELADO — cancelarItemsDePedido lo
        // autocorrige igual que en anularPedido, aunque no haya nada nuevo
        // que cancelar en ESTE pedido puntual. Sin este flag, una mesa cuyos
        // pedidos ya están todos así nunca podría anularse/liberarse.
        let algunEstadoForzado = false;
        const outboxData: Array<{ routingKey: string; payload: string; status: string }> = [];
        const mermaPayloads: PedidoItemAnuladoConMermaPayload[] = [];
        const stockRestauradoPayloads: StockRestauradoPayload[] = [];

        for (const pedido of pedidos) {
          const r = await this.cancelarItemsDePedido(
            prisma, pedido, itemsConsumidos, command.motivo, usuarioId, usuarioNombre, 'anulacion-mesa',
          );
          cancelados += r.cancelados;
          conMerma += r.conMerma;
          mantenidos += r.mantenidos;
          montoAnulado += r.montoAnulado;
          if (r.estadoForzado) algunEstadoForzado = true;
          outboxData.push(...r.outboxData);
          mermaPayloads.push(...r.mermaPayloads);
          stockRestauradoPayloads.push(...r.stockRestauradoPayloads);
        }

        if (cancelados === 0 && conMerma === 0 && !algunEstadoForzado) {
          throw new BadRequestException('No hay ningún ítem pendiente o preparado que anular en esta mesa (todo ya está cancelado o confirmado como consumido).');
        }

        const primero = pedidos[0];
        const correlativoAnulacion = await this.siguienteCorrelativoAnulacion(prisma, sedeId);
        const auditoria = await prisma.anulacionAuditoria.create({
          data: {
            correlativo: correlativoAnulacion,
            sedeId,
            mesaId,
            mesaNumero: primero.numeroMesa,
            pedidoId: primero.id,
            cuentaCorrelativo: primero.cuentaCorrelativo,
            tipo: TipoAnulacion.Mesa,
            estadoPlato: conMerma > 0 ? EstadoPlatoAnulacion.Preparado : EstadoPlatoAnulacion.SinPreparar,
            cobrado: false,
            montoAnulado,
            motivo: command.motivo,
            usuarioId: usuarioId ?? undefined,
            usuarioNombre: usuarioNombre ?? undefined,
            clienteNombre: primero.cliente ?? undefined,
          },
        });

        for (const merma of mermaPayloads) {
          outboxData.push({ routingKey: RoutingKeys.PedidoItemAnuladoConMerma, payload: JSON.stringify(merma), status: 'PENDING' });
        }
        for (const restauracion of stockRestauradoPayloads) {
          outboxData.push({ routingKey: RoutingKeys.StockRestaurado, payload: JSON.stringify(restauracion), status: 'PENDING' });
        }
        await prisma.outboxEvent.createMany({ data: outboxData });

        this.logger.log({
          operation: 'anularAtencionMesa',
          aggregateId: auditoria.id,
          resultingState: mantenidos === 0 ? 'MESA_LIBERADA' : 'MESA_CON_CUENTA_PENDIENTE',
          message: `Atención de mesa ${mesaId} anulada: ${command.motivo}`,
        } satisfies OperableLog);

        return {
          itemsCancelados: cancelados,
          itemsConMerma: conMerma,
          itemsMantenidosParaCobro: mantenidos,
          debeLiberarMesa: mantenidos === 0,
          cuentaIdParaCancelar: mantenidos === 0 ? (primero.cuentaId ?? null) : null,
        };
      });

    // La liberación de la mesa y la cancelación de la cuenta son llamadas
    // HTTP a otros servicios: fuera de la transacción a propósito (no se
    // puede/debe hacer 2PC con otra BD). Si fallan, el pedido ya quedó
    // cancelado correctamente en nuestra BD — solo queda logueado para
    // liberación/cancelación manual. Sin cancelar la cuenta, quedaba
    // ABIERTA con total 0 para siempre y bloqueaba el cierre de turno en
    // caja (verificarSinCuentasAbiertas).
    const [mesaLiberada] = await Promise.all([
      debeLiberarMesa ? this.mesasHttp.liberarMesa(mesaId, MesaEstado.Libre) : Promise.resolve(false),
      cuentaIdParaCancelar ? this.cuentasHttp.cancelarCuenta(cuentaIdParaCancelar) : Promise.resolve(false),
    ]);

    return {
      message: itemsMantenidosParaCobro > 0
        ? 'Atención de mesa anulada; quedan ítems de inventario pendientes de cobro.'
        : 'Atención de mesa anulada y mesa liberada.',
      resultado: { itemsCancelados, itemsConMerma, itemsMantenidosParaCobro, mesaLiberada },
    };
  }

  /**
   * Anular UN pedido puntual (no toda la mesa) directamente desde el
   * tablero de Pedidos — pedido explícito del dueño tras el bug de
   * Pedido.estado congelado: "poder gestionar también la anulación del
   * pedido desde pedidos para poder librar un poco la vista", y como
   * salvavidas operativo si un pedido vuelve a quedar atascado por
   * cualquier otro motivo, sin depender de un desarrollador con SQL.
   * A diferencia de anularAtencionMesa (agrega TODOS los pedidos activos
   * de la mesa en un solo registro tipo MESA, sin detalle por ítem — la
   * limitación que bloqueó la reversión real en invalidarAnulacion), acá
   * cada ítem cancelado/con merma queda con su propio registro tipo ITEM
   * (mismo criterio que actualizarEstadoItem/anularItemPreparado) — así
   * que una anulación creada por este endpoint SÍ se puede revertir de
   * verdad más adelante desde "Invalidar anulación".
   */
  async anularPedido(
    pedidoId: string,
    command: AnularPedidoCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
  ): Promise<{ message: string; pedido: PedidoDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const itemsConsumidos = new Set(command.itemsConsumidos ?? []);

    const { pedido: pedidoFinal, cascada } = await this.prisma.$transaction(async (prisma) => {
      const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { items: true } });
      if (!pedido || pedido.sedeId !== sedeId) throw new NotFoundException(`Pedido ${pedidoId} no encontrado`);
      if (pedido.estado === PedidoEstado.Pagado || pedido.estado === PedidoEstado.Cancelado || pedido.estado === PedidoEstado.RechazadoSinStock) {
        throw new BadRequestException(`El pedido ya está en estado ${pedido.estado}; no se puede anular.`);
      }

      await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${pedido.id}))`);

      const r = await this.cancelarItemsDePedido(
        prisma, pedido, itemsConsumidos, command.motivo, usuarioId, usuarioNombre, 'anulacion-pedido',
      );

      if (r.cancelados === 0 && r.conMerma === 0 && !r.estadoForzado) {
        throw new BadRequestException('No hay ningún ítem pendiente o preparado que anular en este pedido (todo ya está cancelado o confirmado como consumido).');
      }

      const itemsAnulados = [
        ...r.itemsCanceladosLimpios.map((item) => ({ item, estadoPlato: EstadoPlatoAnulacion.SinPreparar })),
        ...r.itemsConMermaDetalle.map((item) => ({ item, estadoPlato: EstadoPlatoAnulacion.Preparado })),
      ];
      const auditoriaData = [];
      for (const { item, estadoPlato } of itemsAnulados) {
        auditoriaData.push({
          correlativo: await this.siguienteCorrelativoAnulacion(prisma, sedeId),
          sedeId, mesaId: pedido.mesaId, mesaNumero: pedido.numeroMesa, pedidoId: pedido.id, cuentaCorrelativo: pedido.cuentaCorrelativo, itemId: item.id,
          tipo: TipoAnulacion.Item, productoId: item.productoId, productoNombre: item.nombre, cantidad: item.cantidad,
          estadoPlato, cobrado: false,
          montoAnulado: Number(item.precioUnitario) * item.cantidad,
          motivo: command.motivo, usuarioId: usuarioId ?? undefined, usuarioNombre: usuarioNombre ?? undefined,
          clienteNombre: pedido.cliente ?? undefined,
        });
      }
      await prisma.anulacionAuditoria.createMany({ data: auditoriaData });

      const outboxData = [...r.outboxData];
      for (const merma of r.mermaPayloads) {
        outboxData.push({ routingKey: RoutingKeys.PedidoItemAnuladoConMerma, payload: JSON.stringify(merma), status: 'PENDING' });
      }
      for (const restauracion of r.stockRestauradoPayloads) {
        outboxData.push({ routingKey: RoutingKeys.StockRestaurado, payload: JSON.stringify(restauracion), status: 'PENDING' });
      }
      await prisma.outboxEvent.createMany({ data: outboxData });

      const pedidoActualizado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } });

      let cascada: { cuentaId: string; mesaId: string } | null = null;
      if (r.mantenidos === 0) {
        const cuentaAnulada = await this.cuentaQuedoTotalmenteAnulada(prisma, pedido.cuentaId);
        if (cuentaAnulada) cascada = { cuentaId: pedido.cuentaId as string, mesaId: cuentaAnulada.mesaId };
      }

      this.logger.log({
        operation: 'anularPedido',
        aggregateId: pedido.id,
        resultingState: pedidoActualizado.estado,
        message: `Pedido ${pedido.id} anulado: ${command.motivo}`,
      } satisfies OperableLog);

      return { pedido: pedidoActualizado, cascada };
    });

    if (cascada) {
      await this.ejecutarCascadaCancelacion(cascada.cuentaId, cascada.mesaId);
    }

    return { message: 'Pedido anulado.', pedido: mapPedidoToDto(pedidoFinal) };
  }

  // ─── CU-05: Auditoría de Anulaciones ────────────────────────────────────

  async listarAnulaciones(
    query: ListarAnulacionesQuery = {},
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ): Promise<{ anulaciones: AnulacionAuditoriaDto[] }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const anulaciones = await this.prisma.anulacionAuditoria.findMany({
      where: {
        sedeId,
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.usuarioId ? { usuarioId: query.usuarioId } : {}),
        ...(query.desde || query.hasta
          ? {
              fecha: {
                ...(query.desde ? { gte: new Date(query.desde) } : {}),
                ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
              },
            }
          : {}),
        // Busca por el código propio de la anulación ("AN0000001") o por el
        // de la atención a la que pertenece ("A0000001") — cualquiera de
        // los dos identifica el registro para quien está reclamando.
        ...(query.search
          ? {
              OR: [
                { correlativo: { contains: query.search, mode: 'insensitive' } },
                { cuentaCorrelativo: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { fecha: 'desc' },
      take: this.normalizeLimit(query.limit),
    });
    return { anulaciones: anulaciones.map((a) => this.toAnulacionDto(a)) };
  }

  /**
   * Solo motivo/observación son editables (a propósito, ver
   * ActualizarAnulacionCommand): monto/cobrado/producto quedan congelados
   * para no permitir maquillar cifras que ya afectaron caja/inventario.
   */
  async actualizarAnulacion(
    id: string,
    command: ActualizarAnulacionCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ): Promise<{ message: string; anulacion: AnulacionAuditoriaDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const existente = await this.prisma.anulacionAuditoria.findUnique({ where: { id } });
    if (!existente || existente.sedeId !== sedeId) throw new NotFoundException('Anulación no encontrada');
    if (existente.invalidada) throw new BadRequestException('Esta anulación fue invalidada; ya no se puede editar.');

    const actualizada = await this.prisma.anulacionAuditoria.update({
      where: { id },
      data: {
        motivo: command.motivo,
        ...(command.observacion === undefined ? {} : { observacion: command.observacion }),
      },
    });

    this.logger.log({
      operation: 'actualizarAnulacion',
      aggregateId: id,
      message: `Anulación ${id} corregida (motivo/observación).`,
    } satisfies OperableLog);

    return { message: 'Anulación actualizada', anulacion: this.toAnulacionDto(actualizada) };
  }

  /**
   * Delete lógico únicamente: el registro nunca se borra físicamente (es
   * evidencia de una pérdida/merma ya efectuada) — se marca INVÁLIDA con
   * motivo, para que caja sepa que fue corregida sin perder el rastro.
   */
  async invalidarAnulacion(
    id: string,
    command: InvalidarAnulacionCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
    usuarioNombre?: string | null,
  ): Promise<{ message: string; anulacion: AnulacionAuditoriaDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const existente = await this.prisma.anulacionAuditoria.findUnique({ where: { id } });
    if (!existente || existente.sedeId !== sedeId) throw new NotFoundException('Anulación no encontrada');
    if (existente.invalidada) throw new BadRequestException('Esta anulación ya estaba invalidada.');

    // Bug reportado: "invalidar" solo marcaba el registro de auditoría —
    // nunca tocaba el PedidoItem/Pedido real ni emitía eventos, así que el
    // plato/ítem se quedaba anulado en cuenta actual para siempre pese a
    // que la auditoría ya decía "Inválida". Para tipo ITEM (itemId
    // conocido) sí podemos revertir el estado real. Para tipo MESA, el
    // registro de auditoría hoy solo guarda un único pedidoId "primero de
    // la lista" (ver anularAtencionMesa) — no hay forma de saber qué
    // ítems específicos tocó esa anulación, así que reversión real ahí
    // requiere extender el modelo primero. Se rechaza explícitamente en
    // vez de fingir que revirtió algo.
    if (existente.tipo === TipoAnulacion.Mesa) {
      throw new BadRequestException(
        'Todavía no se puede revertir una anulación de mesa completa (falta guardar qué ítems afectó). Se puede corregir el motivo/observación, pero el ítem/pedido no se restaura automáticamente.',
      );
    }

    const actualizada = await this.prisma.$transaction(async (prisma) => {
      const anulacion = await prisma.anulacionAuditoria.update({
        where: { id },
        data: {
          invalidada: true,
          invalidadaMotivo: command.motivo,
          invalidadaPorNombre: usuarioNombre ?? undefined,
          invalidadaAt: new Date(),
        },
      });

      if (existente.itemId) {
        const item = await prisma.pedidoItem.findUnique({ where: { id: existente.itemId } });
        // Si el ítem ya no existe, o algo más lo cambió desde la anulación
        // (ya no está CANCELADO), no lo pisamos a ciegas — se deja como
        // corrección de auditoría únicamente y se loguea la discrepancia.
        if (item && item.estado === EstadoItem.Cancelado) {
          await prisma.$executeRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${item.pedidoId}))`,
          );
          // SIN_PREPARAR (CU-01 Caso A) vuelve a la cola; PREPARADO (Caso B,
          // anularItemPreparado) solo aplica a ítems que ya estaban
          // ENTREGADO — se restaura ahí, no al principio de la cola.
          const estadoRestaurado =
            existente.estadoPlato === EstadoPlatoAnulacion.Preparado ? EstadoItem.Entregado : EstadoItem.Pendiente;
          const itemRestaurado = await prisma.pedidoItem.update({
            where: { id: item.id },
            data: { estado: estadoRestaurado },
          });

          const pedidoActual = await prisma.pedido.findUnique({
            where: { id: item.pedidoId },
            include: { items: true },
          });
          if (pedidoActual) {
            const itemsActualizados = pedidoActual.items.map((i) => (i.id === item.id ? itemRestaurado : i));
            const nuevoTotal = this.recalcularTotalCobrable(itemsActualizados);
            const enProduccion =
              pedidoActual.estado === PedidoEstado.Pendiente ||
              pedidoActual.estado === PedidoEstado.EnPreparacion ||
              pedidoActual.estado === PedidoEstado.Listo;
            let nuevoEstadoPedido: PedidoEstado | undefined;
            if (enProduccion) {
              const derivado = this.derivarEstadoPedido(itemsActualizados.map((i) => i.estado));
              if (derivado && derivado !== pedidoActual.estado) nuevoEstadoPedido = derivado;
            }
            const pedidoFinal = await prisma.pedido.update({
              where: { id: item.pedidoId },
              data: { total: nuevoTotal, ...(nuevoEstadoPedido ? { estado: nuevoEstadoPedido } : {}) },
              include: { items: true },
            });
            await prisma.outboxEvent.create({
              data: {
                routingKey: RoutingKeys.PedidoActualizado,
                payload: JSON.stringify({ pedido: mapPedidoToDto(pedidoFinal) }),
                status: 'PENDING',
              },
            });
          }
        } else {
          this.logger.warn({
            operation: 'invalidarAnulacion',
            aggregateId: id,
            errorCode: 'ITEM_NO_REVERTIBLE',
            message: item
              ? `Ítem ${existente.itemId} ya no está CANCELADO (estado actual: ${item.estado}) — se invalida solo el registro de auditoría, no se toca el ítem.`
              : `Ítem ${existente.itemId} ya no existe — se invalida solo el registro de auditoría.`,
          } satisfies OperableLog);
        }
      }

      return anulacion;
    });

    this.logger.log({
      operation: 'invalidarAnulacion',
      aggregateId: id,
      resultingState: 'INVALIDADA',
      message: `Anulación ${id} invalidada: ${command.motivo}`,
    } satisfies OperableLog);

    return {
      message: existente.itemId
        ? 'Anulación invalidada: el ítem vuelve a la cuenta actual.'
        : 'Anulación invalidada (el registro se conserva para auditoría)',
      anulacion: this.toAnulacionDto(actualizada),
    };
  }

  /**
   * Compensación de la saga de stock. Inventario no pudo descontar el stock real
   * de un producto (la proyección local iba por delante), así que marcamos el/los
   * ítem(s) afectados como RECHAZADO_SIN_STOCK y, si el pedido entero quedó sin
   * stock, el pedido completo. Emite PedidoActualizado para que la UI y demás
   * proyecciones reflejen el rechazo. Idempotente por (pedidoId, productoId).
   */
  /**
   * Backfill del correlativo de la atención ("A0000001") hacia el pedido —
   * ver CuentaAsociadaPayload. `updateMany` en vez de `update`: no hay nada
   * que hacer (ni que reventar) si el pedido todavía no existiera por algún
   * reordenamiento de red — simplemente no actualiza nada.
   */
  async procesarCuentaAsociada(payload: CuentaAsociadaPayload): Promise<void> {
    if (!payload.pedidoId || !payload.cuentaId) return;
    await this.prisma.pedido.updateMany({
      where: { id: payload.pedidoId },
      data: { cuentaId: payload.cuentaId, ...(payload.correlativo ? { cuentaCorrelativo: payload.correlativo } : {}) },
    });
  }

  async procesarStockInsuficiente(payload: StockInsuficientePayload): Promise<void> {
    const { pedidoId, productoId } = payload;
    if (!pedidoId || !productoId) {
      this.logger.warn({
        operation: 'procesarStockInsuficiente',
        errorCode: 'PAYLOAD_INVALIDO',
        message: 'Evento StockInsuficiente sin pedidoId/productoId — ignorado.',
      } satisfies OperableLog);
      return;
    }
    const idempotencyKey = `${RoutingKeys.StockInsuficiente}:${pedidoId}:${productoId}`;
    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: idempotencyKey } });

        const rechazados = await prisma.pedidoItem.updateMany({
          where: { pedidoId, productoId, estado: { not: EstadoItem.RechazadoSinStock } },
          data: { estado: EstadoItem.RechazadoSinStock },
        });

        const pedido = await prisma.pedido.findUnique({
          where: { id: pedidoId },
          include: { items: true },
        });
        if (!pedido) {
          this.logger.warn({
            operation: 'procesarStockInsuficiente',
            aggregateId: pedidoId,
            errorCode: 'PEDIDO_NO_ENCONTRADO',
            message: 'Pedido no encontrado al procesar StockInsuficiente.',
          } satisfies OperableLog);
          return;
        }

        // Si TODOS los ítems quedaron rechazados, el pedido entero pasa a
        // RECHAZADO_SIN_STOCK (salvo que ya sea terminal comercial).
        const terminalComercial =
          pedido.estado === PedidoEstado.Pagado || pedido.estado === PedidoEstado.Cancelado;
        const todosRechazados =
          pedido.items.length > 0 &&
          pedido.items.every((i) => i.estado === EstadoItem.RechazadoSinStock);

        const nuevoTotal = this.recalcularTotalCobrable(pedido.items);
        let pedidoFinal;
        if (todosRechazados && !terminalComercial && pedido.estado !== PedidoEstado.RechazadoSinStock) {
          pedidoFinal = await prisma.pedido.update({
            where: { id: pedidoId },
            data: { estado: PedidoEstado.RechazadoSinStock, total: nuevoTotal },
            include: { items: true },
          });
        } else {
          pedidoFinal = await prisma.pedido.update({
            where: { id: pedidoId },
            data: { total: nuevoTotal },
            include: { items: true },
          });
        }

        this.logger.warn({
          operation: 'procesarStockInsuficiente',
          aggregateId: pedidoId,
          dependency: 'inventario',
          errorCode: 'STOCK_VALIDATION_FAILED',
          resultingState: 'RECHAZADO_SIN_STOCK',
          message: `Validación de stock falló para el producto ${productoId}; ítems del pedido marcados como rechazados.`,
        } satisfies OperableLog);
        if (rechazados.count > 0) this.pedidosRechazadosCounter.inc(rechazados.count);

        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.PedidoActualizado,
            payload: JSON.stringify({ pedido: mapPedidoToDto(pedidoFinal) }),
            status: 'PENDING',
          },
        });
      });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarStockInsuficiente',
          aggregateId: pedidoId,
          idempotencyKey,
          message: 'Evento StockInsuficiente ya procesado — sin cambios (idempotente).',
        } satisfies OperableLog);
        return;
      }
      throw error;
    }
  }
}
