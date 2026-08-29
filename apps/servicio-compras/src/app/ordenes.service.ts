import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActualizarOrdenCompraCommand,
  CrearOrdenCompraCommand,
  ListarOrdenesQuery,
  OrdenCompraEstado,
  OrdenCompraListResponse,
  ResumenComprasDto,
} from '@org/contracts';
import { OperableLog } from '@org/observabilidad';
import { resolveSedeId } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { toComprobanteCompraDto, toOrdenCompraDto, toRecepcionCompraDto } from './compras.mapper';
import { OrdenCompra } from '../generated/prisma';

const ESTADOS_EDITABLES = new Set<string>([OrdenCompraEstado.Borrador]);
const ESTADOS_ANULABLES = new Set<string>([OrdenCompraEstado.Borrador, OrdenCompraEstado.Enviada, OrdenCompraEstado.Parcial]);
const ESTADOS_CERRABLES = new Set<string>([OrdenCompraEstado.Enviada, OrdenCompraEstado.Parcial]);
const ESTADOS_ABIERTOS = new Set<string>([OrdenCompraEstado.Borrador, OrdenCompraEstado.Enviada, OrdenCompraEstado.Parcial]);
const ESTADOS_POR_RECIBIR = new Set<string>([OrdenCompraEstado.Enviada, OrdenCompraEstado.Parcial]);
const ESTADOS_CON_GASTO = new Set<string>([OrdenCompraEstado.Parcial, OrdenCompraEstado.Recibida]);

@Injectable()
export class OrdenesService {
  private readonly logger = new Logger(OrdenesService.name);
  constructor(private readonly prisma: PrismaService) {}

  async listar(query: ListarOrdenesQuery = {}, usuarioSedeId?: string | null): Promise<OrdenCompraListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const limit = this.normalizeLimit(query.limit);

    const ordenes = await this.prisma.ordenCompra.findMany({
      where: {
        sedeId,
        ...(query.estado ? { estado: query.estado } : {}),
        ...(query.proveedorId ? { proveedorId: query.proveedorId } : {}),
        ...(query.desde || query.hasta
          ? {
              fechaEmision: {
                ...(query.desde ? { gte: new Date(query.desde) } : {}),
                ...(query.hasta ? { lte: new Date(`${query.hasta}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      include: { items: true, _count: { select: { comprobantes: true } } },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ fechaEmision: 'desc' }, { id: 'asc' }],
    });

    const hasMore = ordenes.length > limit;
    const data = ordenes.slice(0, limit);

    return {
      data: data.map(toOrdenCompraDto),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  async obtener(id: string, usuarioSedeId?: string | null) {
    const orden = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: {
        items: true,
        recepciones: { include: { items: true }, orderBy: { fecha: 'asc' } },
        comprobantes: true,
      },
    });
    if (!orden || (usuarioSedeId && orden.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Orden de compra ${id} no encontrada`);
    }
    return {
      orden: toOrdenCompraDto(orden),
      recepciones: orden.recepciones.map(toRecepcionCompraDto),
      comprobantes: orden.comprobantes.map(toComprobanteCompraDto),
    };
  }

  async crear(
    command: CrearOrdenCompraCommand,
    usuario?: { id: string; nombre: string } | null,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ) {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);

    const insumoIds = [...new Set(command.items.map((i) => i.insumoId))];
    const insumos = await this.prisma.insumo.findMany({ where: { id: { in: insumoIds }, sedeId } });
    const insumoPorId = new Map(insumos.map((i) => [i.id, i]));
    for (const item of command.items) {
      if (!insumoPorId.has(item.insumoId)) {
        throw new NotFoundException(`Insumo ${item.insumoId} no encontrado`);
      }
    }

    let proveedorNombre = command.proveedorNombre?.trim();
    if (command.proveedorId) {
      const proveedor = await this.prisma.proveedor.findUnique({ where: { id: command.proveedorId } });
      if (!proveedor || proveedor.sedeId !== sedeId) {
        throw new NotFoundException(`Proveedor ${command.proveedorId} no encontrado`);
      }
      proveedorNombre = proveedor.nombre;
    }
    if (!proveedorNombre) {
      throw new BadRequestException('Indica el proveedor (existente o el nombre de la compra ad-hoc)');
    }

    const orden = await this.prisma.$transaction(async (prisma) => {
      // INSERT ... ON CONFLICT DO UPDATE es atómico: el correlativo por sede
      // no colisiona aunque dos órdenes se creen en paralelo.
      const secuencia = await prisma.secuenciaOrden.upsert({
        where: { sedeId },
        create: { sedeId, ultimo: 1001 },
        update: { ultimo: { increment: 1 } },
      });
      const codigo = `OC-${secuencia.ultimo}`;

      const itemsData = command.items.map((item) => {
        const insumo = insumoPorId.get(item.insumoId)!;
        return {
          insumoId: insumo.id,
          insumoNombre: insumo.nombre,
          unidad: insumo.unidad,
          cantidadPedida: item.cantidadPedida,
          costoUnitario: item.costoUnitario ?? insumo.costoUnitario.toNumber(),
        };
      });
      const total = itemsData.reduce((acc, i) => acc + i.cantidadPedida * i.costoUnitario, 0);

      return prisma.ordenCompra.create({
        data: {
          sedeId,
          codigo,
          proveedorId: command.proveedorId ?? null,
          proveedorNombre,
          estado: OrdenCompraEstado.Borrador,
          fechaEntregaEsperada: command.fechaEntregaEsperada ? new Date(command.fechaEntregaEsperada) : null,
          notas: command.notas ?? null,
          total,
          usuarioId: usuario?.id ?? null,
          usuarioNombre: usuario?.nombre ?? null,
          items: { create: itemsData },
        },
        include: { items: true },
      });
    });

    this.logger.log({
      operation: 'crear',
      aggregateId: orden.id,
      resultingState: OrdenCompraEstado.Borrador,
      message: `Orden de compra ${orden.codigo} creada (${proveedorNombre}).`,
    } satisfies OperableLog);
    return { message: 'Orden de compra creada', orden: toOrdenCompraDto(orden) };
  }

  async actualizar(id: string, command: ActualizarOrdenCompraCommand, usuarioSedeId?: string | null) {
    const actual = await this.findOrThrow(id, usuarioSedeId);
    if (!ESTADOS_EDITABLES.has(actual.estado)) {
      throw new ConflictException('Solo se puede editar una orden en borrador');
    }

    const orden = await this.prisma.$transaction(async (prisma) => {
      if (command.items) {
        const insumoIds = [...new Set(command.items.map((i) => i.insumoId))];
        const insumos = await prisma.insumo.findMany({ where: { id: { in: insumoIds }, sedeId: actual.sedeId } });
        const insumoPorId = new Map(insumos.map((i) => [i.id, i]));
        for (const item of command.items) {
          if (!insumoPorId.has(item.insumoId)) {
            throw new NotFoundException(`Insumo ${item.insumoId} no encontrado`);
          }
        }

        await prisma.ordenCompraItem.deleteMany({ where: { ordenId: id } });
        await prisma.ordenCompraItem.createMany({
          data: command.items.map((item) => {
            const insumo = insumoPorId.get(item.insumoId)!;
            return {
              ordenId: id,
              insumoId: insumo.id,
              insumoNombre: insumo.nombre,
              unidad: insumo.unidad,
              cantidadPedida: item.cantidadPedida,
              costoUnitario: item.costoUnitario ?? insumo.costoUnitario.toNumber(),
            };
          }),
        });
      }

      const itemsActuales = await prisma.ordenCompraItem.findMany({ where: { ordenId: id } });
      const total = itemsActuales.reduce((acc, i) => acc + i.cantidadPedida.toNumber() * i.costoUnitario.toNumber(), 0);

      return prisma.ordenCompra.update({
        where: { id },
        data: {
          ...(command.notas !== undefined ? { notas: command.notas } : {}),
          ...(command.fechaEntregaEsperada !== undefined
            ? { fechaEntregaEsperada: command.fechaEntregaEsperada ? new Date(command.fechaEntregaEsperada) : null }
            : {}),
          total,
        },
        include: { items: true },
      });
    });

    this.logger.log({
      operation: 'actualizar',
      aggregateId: id,
      message: `Orden de compra ${orden.codigo} actualizada.`,
    } satisfies OperableLog);
    return { message: 'Orden de compra actualizada', orden: toOrdenCompraDto(orden) };
  }

  async eliminar(id: string, usuarioSedeId?: string | null) {
    const actual = await this.findOrThrow(id, usuarioSedeId);
    if (!ESTADOS_EDITABLES.has(actual.estado)) {
      throw new ConflictException('Solo se puede eliminar una orden en borrador');
    }
    await this.prisma.ordenCompra.delete({ where: { id } });
    this.logger.log({
      operation: 'eliminar',
      aggregateId: id,
      message: `Orden de compra ${actual.codigo} eliminada.`,
    } satisfies OperableLog);
    return { message: 'Orden de compra eliminada' };
  }

  async enviar(id: string, usuarioSedeId?: string | null) {
    const actual = await this.findOrThrow(id, usuarioSedeId);
    if (actual.estado !== OrdenCompraEstado.Borrador) {
      throw new ConflictException('Solo se puede enviar una orden en borrador');
    }
    const orden = await this.prisma.ordenCompra.update({
      where: { id },
      data: { estado: OrdenCompraEstado.Enviada, fechaEnvio: new Date() },
      include: { items: true },
    });
    this.logger.log({
      operation: 'enviar',
      aggregateId: id,
      resultingState: OrdenCompraEstado.Enviada,
      message: `Orden de compra ${orden.codigo} enviada al proveedor.`,
    } satisfies OperableLog);
    return { message: 'Orden de compra enviada', orden: toOrdenCompraDto(orden) };
  }

  async cerrar(id: string, motivo: string | undefined, usuarioSedeId?: string | null) {
    const actual = await this.findOrThrow(id, usuarioSedeId);
    if (!ESTADOS_CERRABLES.has(actual.estado)) {
      throw new ConflictException('Solo se puede cerrar una orden enviada o con recepción parcial');
    }
    const notas = motivo
      ? `${actual.notas ? `${actual.notas} — ` : ''}Cerrada con faltante: ${motivo}`
      : actual.notas;
    const orden = await this.prisma.ordenCompra.update({
      where: { id },
      data: { estado: OrdenCompraEstado.Recibida, fechaCierre: new Date(), notas },
      include: { items: true },
    });
    this.logger.log({
      operation: 'cerrar',
      aggregateId: id,
      resultingState: OrdenCompraEstado.Recibida,
      message: `Orden de compra ${orden.codigo} cerrada con faltante${motivo ? `: ${motivo}` : ''}.`,
    } satisfies OperableLog);
    return { message: 'Orden cerrada con faltante', orden: toOrdenCompraDto(orden) };
  }

  async anular(id: string, motivo: string | undefined, usuarioSedeId?: string | null) {
    const actual = await this.findOrThrow(id, usuarioSedeId);
    if (!ESTADOS_ANULABLES.has(actual.estado)) {
      throw new ConflictException('No se puede anular una orden recibida o ya anulada');
    }
    const notas = motivo
      ? `${actual.notas ? `${actual.notas} — ` : ''}Anulada: ${motivo}`
      : actual.notas;
    const orden = await this.prisma.ordenCompra.update({
      where: { id },
      data: { estado: OrdenCompraEstado.Anulada, notas },
      include: { items: true },
    });
    this.logger.log({
      operation: 'anular',
      aggregateId: id,
      resultingState: OrdenCompraEstado.Anulada,
      message: `Orden de compra ${orden.codigo} anulada${motivo ? `: ${motivo}` : ''}.`,
    } satisfies OperableLog);
    return { message: 'Orden anulada', orden: toOrdenCompraDto(orden) };
  }

  async resumen(usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<ResumenComprasDto> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const [ordenes, insumos] = await Promise.all([
      this.prisma.ordenCompra.findMany({ where: { sedeId }, include: { items: true } }),
      this.prisma.insumo.findMany({ where: { sedeId, activo: true } }),
    ]);

    const ordenesAbiertas = ordenes.filter((o) => ESTADOS_ABIERTOS.has(o.estado)).length;
    const porRecibir = ordenes.filter((o) => ESTADOS_POR_RECIBIR.has(o.estado));
    const montoPorRecibir = porRecibir.reduce(
      (acc, o) =>
        acc +
        o.items.reduce(
          (s, i) => s + (i.cantidadPedida.toNumber() - i.cantidadRecibida.toNumber()) * i.costoUnitario.toNumber(),
          0,
        ),
      0,
    );
    const gastoRecibido = ordenes
      .filter((o) => ESTADOS_CON_GASTO.has(o.estado))
      .reduce((acc, o) => acc + o.items.reduce((s, i) => s + i.cantidadRecibida.toNumber() * i.costoUnitario.toNumber(), 0), 0);
    const insumosBajoMinimo = insumos.filter((i) => i.stockActual.lte(i.stockMinimo)).length;

    return {
      ordenesAbiertas,
      ordenesPorRecibir: porRecibir.length,
      montoPorRecibir: Math.round(montoPorRecibir * 100) / 100,
      gastoRecibido: Math.round(gastoRecibido * 100) / 100,
      insumosBajoMinimo,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  async findOrThrow(id: string, usuarioSedeId?: string | null): Promise<OrdenCompra> {
    const orden = await this.prisma.ordenCompra.findUnique({ where: { id } });
    if (!orden || (usuarioSedeId && orden.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Orden de compra ${id} no encontrada`);
    }
    return orden;
  }
}
