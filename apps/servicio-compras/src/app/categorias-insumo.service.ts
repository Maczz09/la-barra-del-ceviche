import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActualizarCategoriaInsumoCommand,
  CategoriasInsumoListResponse,
  CrearCategoriaInsumoCommand,
  ListarCategoriasInsumoQuery,
} from '@org/contracts';
import { OperableLog } from '@org/observabilidad';
import { resolveSedeId } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { toCategoriaInsumoDto } from './compras.mapper';

/**
 * Taxonomía PROPIA del almacén de cocina. No se reutilizan las `Categoria` de
 * servicio-inventario a propósito: viven en otra base de datos y responden a
 * otra pregunta (cómo se ordena la carta vs. cómo se ordena la despensa).
 */
@Injectable()
export class CategoriasInsumoService {
  private readonly logger = new Logger(CategoriasInsumoService.name);
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    query: ListarCategoriasInsumoQuery = {},
    usuarioSedeId?: string | null,
  ): Promise<CategoriasInsumoListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const categorias = await this.prisma.categoriaInsumo.findMany({
      where: {
        sedeId,
        ...(query.search ? { nombre: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      // El conteo va siempre: la UI necesita avisar "tiene 12 insumos" ANTES de
      // que alguien pulse eliminar.
      include: { _count: { select: { insumos: true } } },
      orderBy: [{ nombre: 'asc' }],
    });
    return { data: categorias.map(toCategoriaInsumoDto) };
  }

  async crear(command: CrearCategoriaInsumoCommand, usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    try {
      const categoria = await this.prisma.categoriaInsumo.create({
        data: {
          sedeId,
          nombre: command.nombre.trim(),
          descripcion: command.descripcion?.trim() || null,
        },
        include: { _count: { select: { insumos: true } } },
      });
      this.logger.log({
        operation: 'crearCategoriaInsumo',
        aggregateId: categoria.id,
        message: `Categoría de almacén creada: ${categoria.nombre}.`,
      } satisfies OperableLog);
      return { message: 'Categoría creada', categoria: toCategoriaInsumoDto(categoria) };
    } catch (error) {
      if (this.esViolacionDeUnicidad(error)) {
        throw new ConflictException('Ya existe una categoría de almacén con ese nombre en esta sede');
      }
      throw error;
    }
  }

  async actualizar(id: string, command: ActualizarCategoriaInsumoCommand, usuarioSedeId?: string | null) {
    await this.findOrThrow(id, usuarioSedeId);
    try {
      const categoria = await this.prisma.categoriaInsumo.update({
        where: { id },
        data: {
          ...(command.nombre !== undefined ? { nombre: command.nombre.trim() } : {}),
          ...(command.descripcion !== undefined ? { descripcion: command.descripcion?.trim() || null } : {}),
          ...(command.activo !== undefined ? { activo: command.activo } : {}),
        },
        include: { _count: { select: { insumos: true } } },
      });
      this.logger.log({
        operation: 'actualizarCategoriaInsumo',
        aggregateId: id,
        message: 'Categoría de almacén actualizada.',
      } satisfies OperableLog);
      return { message: 'Categoría actualizada', categoria: toCategoriaInsumoDto(categoria) };
    } catch (error) {
      if (this.esViolacionDeUnicidad(error)) {
        throw new ConflictException('Ya existe una categoría de almacén con ese nombre en esta sede');
      }
      throw error;
    }
  }

  /**
   * Borrar una categoría con insumos NO borra los insumos: la FK es
   * `SetNull`, así que quedan "sin categoría" y siguen en el almacén. Se
   * responde cuántos quedaron sueltos para que la UI lo diga.
   */
  async eliminar(id: string, usuarioSedeId?: string | null) {
    const categoria = await this.findOrThrow(id, usuarioSedeId);
    const enUso = await this.prisma.insumo.count({ where: { categoriaId: id } });

    await this.prisma.categoriaInsumo.delete({ where: { id } });

    this.logger.log({
      operation: 'eliminarCategoriaInsumo',
      aggregateId: id,
      resultingState: `insumosSinCategoria=${enUso}`,
      message: `Categoría de almacén "${categoria.nombre}" eliminada.`,
    } satisfies OperableLog);

    return {
      message: enUso > 0
        ? `Categoría eliminada — ${enUso} insumos quedaron sin categoría`
        : 'Categoría eliminada',
      insumosLiberados: enUso,
    };
  }

  private async findOrThrow(id: string, usuarioSedeId?: string | null) {
    const categoria = await this.prisma.categoriaInsumo.findUnique({ where: { id } });
    if (!categoria || (usuarioSedeId && categoria.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Categoría de almacén ${id} no encontrada`);
    }
    return categoria;
  }

  private esViolacionDeUnicidad(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
