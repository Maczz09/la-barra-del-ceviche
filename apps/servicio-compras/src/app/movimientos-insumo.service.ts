import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ConteoInsumoDiferenciaDto,
  ConteoInsumosResultadoDto,
  InsumoStockBajoPayload,
  ListarMovimientosInsumoQuery,
  MovimientoInsumoDto,
  MovimientoInsumoListResponse,
  MovimientoInsumoTipo,
  RegistrarConteoInsumosCommand,
  RegistrarMovimientoInsumoCommand,
  RoutingKeys,
} from '@org/contracts';
import { OperableLog } from '@org/observabilidad';
import { resolveSedeId } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { toMovimientoInsumoDto } from './compras.mapper';
import { Insumo, Prisma } from '../generated/prisma';

/** Escala de `Decimal(12,3)`: todo delta se redondea a 3 decimales antes de
 *  persistir, para que el kardex no acumule ruido de punto flotante. */
const ESCALA = 1000;

/** Signo que le corresponde a cada tipo. `AJUSTE_CONTEO` no está: su delta lo
 *  fija el cuadre (contado − sistema) y puede ir en cualquier dirección. */
const SIGNO_POR_TIPO: Record<string, 1 | -1> = {
  [MovimientoInsumoTipo.EntradaCompra]: 1,
  [MovimientoInsumoTipo.EntradaManual]: 1,
  [MovimientoInsumoTipo.EntradaDevolucion]: 1,
  [MovimientoInsumoTipo.SalidaConsumo]: -1,
  [MovimientoInsumoTipo.SalidaMerma]: -1,
};

export function redondear3(valor: number): number {
  return Math.round(valor * ESCALA) / ESCALA;
}

export interface AplicarMovimientoParams {
  insumoId: string;
  tipo: MovimientoInsumoTipo;
  /** CON SIGNO: negativo en salidas, positivo en entradas. */
  delta: number;
  motivo?: string | null;
  observacion?: string | null;
  recepcionId?: string | null;
  usuario?: { id: string; nombre: string } | null;
}

@Injectable()
export class MovimientosInsumoService {
  private readonly logger = new Logger(MovimientosInsumoService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ÚNICA puerta de escritura de `Insumo.stockActual` en todo el servicio.
   * Debe llamarse SIEMPRE dentro de una transacción: el update del stock y la
   * fila del kardex tienen que entrar en el mismo commit, o el kardex deja de
   * cuadrar contra el saldo.
   *
   * classid 9012 del advisory lock: distinto del 5678 que usa la recepción
   * (que serializa por ORDEN) — acá se serializa por INSUMO, que es el recurso
   * en disputa entre dos cocineros descargando lo mismo a la vez.
   */
  async aplicarMovimiento(
    tx: Prisma.TransactionClient,
    params: AplicarMovimientoParams,
  ): Promise<{ movimiento: MovimientoInsumoDto; insumo: Insumo }> {
    const { insumoId } = params;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9012, ('x' || substr(md5(${insumoId}), 1, 8))::bit(32)::int)`;

    const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
    if (!insumo) {
      throw new NotFoundException(`Insumo ${insumoId} no encontrado`);
    }

    const delta = redondear3(params.delta);
    if (delta === 0) {
      throw new BadRequestException('Un movimiento de stock no puede ser de cantidad 0.');
    }

    const stockAntes = insumo.stockActual.toNumber();
    const stockDespues = redondear3(stockAntes + delta);

    // No se clampa a 0 en silencio (a diferencia de la reposición de Producto
    // en servicio-inventario): una salida mayor que el saldo significa que el
    // stock del sistema ya estaba mal, y taparlo con un 0 borra la evidencia.
    if (stockDespues < 0) {
      throw new BadRequestException(
        `No puedes descargar ${Math.abs(delta)} ${insumo.unidad} de "${insumo.nombre}": solo hay ${stockAntes} ${insumo.unidad}.`,
      );
    }

    const actualizado = await tx.insumo.update({
      where: { id: insumoId },
      data: { stockActual: stockDespues },
    });

    const movimiento = await tx.movimientoInsumo.create({
      data: {
        sedeId: insumo.sedeId,
        insumoId,
        tipo: params.tipo,
        delta,
        stockAntes,
        stockDespues,
        costoUnitario: insumo.costoUnitario,
        motivo: params.motivo ?? null,
        observacion: params.observacion ?? null,
        recepcionId: params.recepcionId ?? null,
        usuarioId: params.usuario?.id ?? null,
        usuarioNombre: params.usuario?.nombre ?? null,
      },
    });

    // Solo en el CRUCE hacia abajo: si se emitiera mientras siga bajo mínimo,
    // cada cucharada de arroz de un insumo ya agotado spamearía la cola.
    const stockMinimo = insumo.stockMinimo.toNumber();
    if (stockAntes > stockMinimo && stockDespues <= stockMinimo) {
      const payload: InsumoStockBajoPayload = {
        sedeId: insumo.sedeId,
        insumoId,
        insumoNombre: insumo.nombre,
        unidad: insumo.unidad,
        stockActual: stockDespues,
        stockMinimo,
      };
      await tx.outboxEvent.create({
        data: { routingKey: RoutingKeys.InsumoStockBajo, payload: JSON.stringify(payload), status: 'PENDING' },
      });
    }

    return {
      movimiento: toMovimientoInsumoDto({ ...movimiento, insumo: actualizado }),
      insumo: actualizado,
    };
  }

  /** Movimiento manual desde el almacén: consumo, merma o devolución. */
  async registrar(
    insumoId: string,
    command: RegistrarMovimientoInsumoCommand,
    usuario?: { id: string; nombre: string } | null,
    usuarioSedeId?: string | null,
  ) {
    const insumo = await this.prisma.insumo.findUnique({ where: { id: insumoId } });
    if (!insumo || (usuarioSedeId && insumo.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Insumo ${insumoId} no encontrado`);
    }

    const signo = SIGNO_POR_TIPO[command.tipo];
    if (!signo) {
      throw new BadRequestException(`Tipo de movimiento no permitido acá: ${command.tipo}`);
    }

    const resultado = await this.prisma.$transaction((tx) =>
      this.aplicarMovimiento(tx, {
        insumoId,
        tipo: command.tipo,
        delta: signo * command.cantidad,
        motivo: command.motivo ?? null,
        observacion: command.observacion ?? null,
        usuario,
      }),
    );

    this.logger.log({
      operation: 'registrarMovimientoInsumo',
      aggregateId: insumoId,
      resultingState: `stockActual=${resultado.insumo.stockActual.toString()}`,
      message: `${command.tipo} de ${command.cantidad} ${insumo.unidad} en "${insumo.nombre}".`,
    } satisfies OperableLog);

    return { message: 'Movimiento registrado', movimiento: resultado.movimiento };
  }

  /** Detalle de UN movimiento. La lista ya trae todo, pero un enlace directo
   *  al hecho concreto es lo que hace auditable el cuadre. */
  async obtener(id: string, usuarioSedeId?: string | null): Promise<MovimientoInsumoDto> {
    const movimiento = await this.prisma.movimientoInsumo.findUnique({
      where: { id },
      include: { insumo: true },
    });
    if (!movimiento || (usuarioSedeId && movimiento.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Movimiento ${id} no encontrado`);
    }
    return toMovimientoInsumoDto(movimiento);
  }

  /** Kardex: general, o de un insumo si viene `insumoId`. */
  async listar(
    query: ListarMovimientosInsumoQuery = {},
    usuarioSedeId?: string | null,
  ): Promise<MovimientoInsumoListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const limit = this.normalizeLimit(query.limit);

    const movimientos = await this.prisma.movimientoInsumo.findMany({
      where: {
        sedeId,
        ...(query.insumoId ? { insumoId: query.insumoId } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.desde || query.hasta
          ? {
              createdAt: {
                ...(query.desde ? { gte: new Date(query.desde) } : {}),
                ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
              },
            }
          : {}),
      },
      include: { insumo: true },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = movimientos.length > limit;
    const data = movimientos.slice(0, limit);

    return {
      data: data.map(toMovimientoInsumoDto),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  /**
   * Cuadre físico en lote: llega lo CONTADO y acá se calcula la diferencia
   * contra el sistema. Los insumos que cuadran no generan movimiento — un
   * AJUSTE_CONTEO de delta 0 solo ensuciaría el kardex.
   */
  async registrarConteo(
    command: RegistrarConteoInsumosCommand,
    usuario?: { id: string; nombre: string } | null,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ): Promise<{ message: string; resultado: ConteoInsumosResultadoDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);

    const ids = command.items.map((i) => i.insumoId);
    const idsUnicos = new Set(ids);
    if (idsUnicos.size !== ids.length) {
      throw new BadRequestException('El conteo trae el mismo insumo más de una vez.');
    }

    const motivo = command.observacion?.trim()
      ? `Conteo físico — ${command.observacion.trim()}`
      : 'Conteo físico';

    const diferencias: ConteoInsumoDiferenciaDto[] = [];
    let ajustados = 0;

    await this.prisma.$transaction(async (tx) => {
      // Dentro de la transacción: si se leyera afuera, entre la lectura y el
      // ajuste podría colarse un consumo y la diferencia calculada quedaría
      // vieja.
      const insumos = await tx.insumo.findMany({ where: { id: { in: ids }, sedeId } });
      const porId = new Map(insumos.map((i) => [i.id, i]));
      const faltante = ids.find((id) => !porId.has(id));
      if (faltante) {
        throw new NotFoundException(`Insumo ${faltante} no encontrado en esta sede`);
      }

      for (const item of command.items) {
        const insumo = porId.get(item.insumoId) as Insumo;
        const stockSistema = insumo.stockActual.toNumber();
        // Se aplica la DIFERENCIA, no el valor absoluto contado: si mientras se
        // transcribía el conteo alguien consumió algo, ese consumo debe seguir
        // restando. Fijar el absoluto lo borraría en silencio.
        const diferencia = redondear3(item.stockContado - stockSistema);

        diferencias.push({
          insumoId: insumo.id,
          insumoNombre: insumo.nombre,
          unidad: insumo.unidad,
          stockSistema,
          stockContado: item.stockContado,
          diferencia,
          valorDiferencia: redondear3(diferencia * insumo.costoUnitario.toNumber()),
        });

        if (diferencia === 0) continue;

        await this.aplicarMovimiento(tx, {
          insumoId: insumo.id,
          tipo: MovimientoInsumoTipo.AjusteConteo,
          delta: diferencia,
          motivo,
          observacion: `Contado: ${item.stockContado} ${insumo.unidad} · sistema: ${stockSistema} ${insumo.unidad}`,
          usuario,
        });
        ajustados++;
      }
    });

    const resultado: ConteoInsumosResultadoDto = {
      insumosContados: command.items.length,
      cuadraron: command.items.length - ajustados,
      ajustados,
      valorDiferenciaTotal: redondear3(diferencias.reduce((suma, d) => suma + d.valorDiferencia, 0)),
      diferencias,
    };

    this.logger.log({
      operation: 'registrarConteoInsumos',
      aggregateId: sedeId,
      resultingState: `ajustados=${ajustados}`,
      message: `Conteo físico de ${command.items.length} insumos: ${ajustados} con diferencia.`,
    } satisfies OperableLog);

    return {
      message: ajustados === 0 ? 'Conteo registrado — todo cuadró' : `Conteo registrado — ${ajustados} insumos ajustados`,
      resultado,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }
}
