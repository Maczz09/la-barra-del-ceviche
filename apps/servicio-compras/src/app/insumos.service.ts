import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActualizarInsumoCommand, CrearInsumoCommand, ListarInsumosQuery, InsumoListResponse } from '@org/contracts';
import { OperableLog } from '@org/observabilidad';
import { resolveSedeId } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { toInsumoDto } from './compras.mapper';
import { CategoriaInsumo, Insumo, Proveedor } from '../generated/prisma';

type InsumoConRelaciones = Insumo & { proveedor: Proveedor | null; categoria: CategoriaInsumo | null };

@Injectable()
export class InsumosService {
  private readonly logger = new Logger(InsumosService.name);
  constructor(private readonly prisma: PrismaService) {}

  async listar(query: ListarInsumosQuery = {}, usuarioSedeId?: string | null): Promise<InsumoListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const limit = this.normalizeLimit(query.limit);

    // `stockActual <= stockMinimo` compara dos columnas: Prisma no lo soporta
    // en el query builder type-safe. Con el volumen esperado (decenas de
    // insumos por sede, no miles) filtrar en memoria es correcto y simple;
    // evita SQL crudo para un caso de uso de bajo tráfico (T-XX plan Compras).
    const insumos = await this.prisma.insumo.findMany({
      where: {
        sedeId,
        activo: true,
        ...(query.proveedorId ? { proveedorId: query.proveedorId } : {}),
        ...(query.categoriaId ? { categoriaId: query.categoriaId } : {}),
        // El almacen de cocina son SOLO los insumos que no se revenden tal
        // cual: lo que tiene puente a un producto (`productoId`) se administra
        // en el catalogo de venta y no debe duplicarse aca.
        ...(query.soloCocina ? { productoId: null } : {}),
        ...(query.search ? { nombre: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { proveedor: true, categoria: true },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });

    const filtrados = query.bajoMinimo
      ? insumos.filter((i: InsumoConRelaciones) => i.stockActual.lte(i.stockMinimo))
      : insumos;

    const desdeIdx = query.cursor ? filtrados.findIndex((i: InsumoConRelaciones) => i.id === query.cursor) + 1 : 0;
    const pagina = filtrados.slice(desdeIdx, desdeIdx + limit + 1);
    const hasMore = pagina.length > limit;
    const data = pagina.slice(0, limit);

    return {
      data: data.map(toInsumoDto),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  async crear(command: CrearInsumoCommand, usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);

    if (command.proveedorId) {
      const proveedor = await this.prisma.proveedor.findUnique({ where: { id: command.proveedorId } });
      if (!proveedor || proveedor.sedeId !== sedeId) {
        throw new NotFoundException(`Proveedor ${command.proveedorId} no encontrado`);
      }
    }

    if (command.categoriaId) {
      await this.assertCategoriaDeLaSede(command.categoriaId, sedeId);
    }

    let insumo: InsumoConRelaciones;
    try {
      insumo = await this.prisma.insumo.create({
        data: {
          sedeId,
          nombre: command.nombre,
          unidad: command.unidad,
          stockActual: command.stockActual ?? 0,
          stockMinimo: command.stockMinimo ?? 0,
          costoUnitario: command.costoUnitario ?? 0,
          proveedorId: command.proveedorId ?? null,
          categoriaId: command.categoriaId ?? null,
          productoId: command.productoId ?? null,
          factorConversion: command.factorConversion ?? 1,
        },
        include: { proveedor: true, categoria: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya existe un insumo con ese nombre en esta sede');
      }
      throw error;
    }

    this.logger.log({
      operation: 'crear',
      aggregateId: insumo.id,
      message: `Insumo creado: ${insumo.nombre}.`,
    } satisfies OperableLog);
    return { message: 'Insumo creado', insumo: toInsumoDto(insumo) };
  }

  async actualizar(id: string, command: ActualizarInsumoCommand, usuarioSedeId?: string | null) {
    const actual = await this.findOrThrow(id, usuarioSedeId);

    if (command.proveedorId) {
      const proveedor = await this.prisma.proveedor.findUnique({ where: { id: command.proveedorId } });
      if (!proveedor || proveedor.sedeId !== actual.sedeId) {
        throw new NotFoundException(`Proveedor ${command.proveedorId} no encontrado`);
      }
    }

    if (command.categoriaId) {
      await this.assertCategoriaDeLaSede(command.categoriaId, actual.sedeId);
    }

    let insumo: InsumoConRelaciones;
    try {
      insumo = await this.prisma.insumo.update({
        where: { id },
        data: {
          ...(command.nombre !== undefined ? { nombre: command.nombre } : {}),
          ...(command.unidad !== undefined ? { unidad: command.unidad } : {}),
          ...(command.stockMinimo !== undefined ? { stockMinimo: command.stockMinimo } : {}),
          ...(command.costoUnitario !== undefined ? { costoUnitario: command.costoUnitario } : {}),
          ...(command.proveedorId !== undefined ? { proveedorId: command.proveedorId } : {}),
          ...(command.categoriaId !== undefined ? { categoriaId: command.categoriaId } : {}),
          ...(command.productoId !== undefined ? { productoId: command.productoId } : {}),
          ...(command.factorConversion !== undefined ? { factorConversion: command.factorConversion } : {}),
          ...(command.activo !== undefined ? { activo: command.activo } : {}),
        },
        include: { proveedor: true, categoria: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya existe un insumo con ese nombre en esta sede');
      }
      throw error;
    }

    this.logger.log({
      operation: 'actualizar',
      aggregateId: id,
      message: 'Insumo actualizado.',
    } satisfies OperableLog);
    return { message: 'Insumo actualizado', insumo: toInsumoDto(insumo) };
  }

  async eliminar(id: string, usuarioSedeId?: string | null) {
    await this.findOrThrow(id, usuarioSedeId);

    // Soft-delete también si ya tiene kardex: borrarlo en duro se llevaría por
    // cascada el historial de movimientos, que es justamente la evidencia del
    // cuadre. Se desactiva y sale del almacén, pero el historial queda.
    const enOrdenes = await this.prisma.ordenCompraItem.count({ where: { insumoId: id } });
    const conMovimientos = await this.prisma.movimientoInsumo.count({ where: { insumoId: id } });
    if (enOrdenes > 0 || conMovimientos > 0) {
      const insumo = await this.prisma.insumo.update({
        where: { id },
        data: { activo: false },
        include: { proveedor: true, categoria: true },
      });
      const motivo = enOrdenes > 0 ? 'aparece en órdenes de compra' : 'tiene movimientos de almacén';
      this.logger.log({
        operation: 'eliminar',
        aggregateId: id,
        message: `Insumo con historial (${motivo}): desactivado (soft-delete) en vez de borrado.`,
      } satisfies OperableLog);
      return { message: `Insumo desactivado (${motivo})`, insumo: toInsumoDto(insumo) };
    }

    await this.prisma.insumo.delete({ where: { id } });
    this.logger.log({
      operation: 'eliminar',
      aggregateId: id,
      message: 'Insumo eliminado.',
    } satisfies OperableLog);
    return { message: 'Insumo eliminado' };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  private async assertCategoriaDeLaSede(categoriaId: string, sedeId: string): Promise<void> {
    const categoria = await this.prisma.categoriaInsumo.findUnique({ where: { id: categoriaId } });
    if (!categoria || categoria.sedeId !== sedeId) {
      throw new NotFoundException('Categoria de almacen ' + categoriaId + ' no encontrada');
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }

  async findOrThrow(id: string, usuarioSedeId?: string | null): Promise<Insumo> {
    const insumo = await this.prisma.insumo.findUnique({ where: { id } });
    if (!insumo || (usuarioSedeId && insumo.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Insumo ${id} no encontrado`);
    }
    return insumo;
  }
}
