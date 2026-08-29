import { Injectable, NotFoundException, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { resolveSedeId } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoriaDto,
  ProductoDto,
  CrearCategoriaCommand,
  ActualizarCategoriaCommand,
  CrearProductoCommand,
  ActualizarProductoCommand,
  ListarProductosQuery,
  ProductoListResponse,
  RoutingKeys,
  ProductoCreadoPayload,
  ProductoActualizadoPayload,
  StockInsuficientePayload,
  PedidoCreadoPayload,
  MenuDiarioItemDto,
  AgregarAlMenuCommand,
  ActualizarMenuDiarioCommand,
  MermaDto,
  RegistrarMermaCommand,
  ActualizarMermaCommand,
  ListarMermasQuery,
  CompraRecibidaPayload,
  CompraRecibidaLineaPayload,
  PedidoItemAnuladoConMermaPayload,
  StockRestauradoPayload,
  CartaPublicaResponse,
} from '@org/contracts';
import { Prisma, CategoriaArea, MermaOrigen } from '../generated/prisma';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHello(): { message: string; service: string } {
    return { message: 'Servicio de Inventario activo', service: 'servicio-inventario' };
  }

  // --- CATEGORÍAS ---

  async listarCategorias(usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<{ categorias: CategoriaDto[] }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const categorias = await this.prisma.categoria.findMany({
      where: { sedeId },
      orderBy: { nombre: 'asc' }
    });
    return { categorias };
  }

  async crearCategoria(command: CrearCategoriaCommand, usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<{ message: string; categoria: CategoriaDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const nombre = command.nombre.trim();
    await this.assertNombreDisponible(sedeId, nombre);
    if (command.parentId) {
      await this.assertParentValido(command.parentId, sedeId);
    }

    const categoria = await this.crearCategoriaSegura(sedeId, nombre, command.descripcion, command.parentId, command.area);
    return { message: 'Categoría creada exitosamente', categoria };
  }

  async actualizarCategoria(
    id: string,
    command: ActualizarCategoriaCommand,
  ): Promise<{ message: string; categoria: CategoriaDto }> {
    const existente = await this.prisma.categoria.findUnique({
      where: { id },
      include: { _count: { select: { subcategorias: true } } },
    });
    if (!existente) throw new NotFoundException('Categoría no encontrada');

    const nombre = command.nombre?.trim();
    if (nombre !== undefined && nombre !== '') {
      await this.assertNombreDisponible(existente.sedeId, nombre, id);
    }

    if (command.parentId) {
      if (command.parentId === id) {
        throw new BadRequestException('Una categoría no puede ser su propia categoría padre.');
      }
      if (existente._count.subcategorias > 0) {
        throw new BadRequestException(
          'No se puede convertir en subcategoría: ya tiene sus propias subcategorías. Reasígnalas primero.',
        );
      }
      await this.assertParentValido(command.parentId, existente.sedeId);
    }

    if (command.area !== undefined && command.area !== existente.area) {
      await this.assertCambioDeAreaSeguro(id);
    }

    const categoria = await this.actualizarCategoriaSegura(id, {
      ...(nombre ? { nombre } : {}),
      ...(command.descripcion === undefined ? {} : { descripcion: command.descripcion }),
      ...(command.parentId === undefined ? {} : { parentId: command.parentId }),
      ...(command.area === undefined ? {} : { area: command.area }),
    });
    return { message: 'Categoría actualizada', categoria };
  }

  /**
   * Cambiar el área de una categoría con productos ya cambia su ruteo de
   * pedidos retroactivamente (Carta↔Inventario, Cocina↔Barra) — no rompe
   * nada técnicamente, pero mezclaría productos con/sin control de stock bajo
   * la nueva área si no se valida. Se bloquea mientras tenga productos; el
   * dueño primero los reasigna o el área nunca coincidiría con su
   * `stockActual` (ver crearProducto/actualizarProducto).
   */
  private async assertCambioDeAreaSeguro(categoriaId: string): Promise<void> {
    const conProductos = await this.prisma.categoria.findUnique({
      where: { id: categoriaId },
      include: { _count: { select: { productos: true } } },
    });
    if (conProductos && conProductos._count.productos > 0) {
      throw new BadRequestException(
        `No se puede cambiar el área: tiene ${conProductos._count.productos} producto(s) asociado(s). Reasígnalos a otra categoría primero.`,
      );
    }
  }

  async eliminarCategoria(id: string): Promise<{ message: string }> {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id },
      include: { _count: { select: { productos: true, subcategorias: true } } },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');

    if (categoria._count.productos > 0) {
      throw new ConflictException(
        `No se puede eliminar: tiene ${categoria._count.productos} producto(s) asociado(s). Reasígnalos a otra categoría primero.`,
      );
    }
    if (categoria._count.subcategorias > 0) {
      throw new ConflictException(
        `No se puede eliminar: tiene ${categoria._count.subcategorias} subcategoría(s). Reasígnalas o elimínalas primero.`,
      );
    }

    await this.prisma.categoria.delete({ where: { id } });
    return { message: 'Categoría eliminada' };
  }

  /** Una subcategoría no puede a su vez tener padre (un solo nivel de anidación), y debe ser de la misma sede. */
  private async assertParentValido(parentId: string, sedeId: string): Promise<void> {
    const parent = await this.prisma.categoria.findUnique({ where: { id: parentId } });
    if (!parent || parent.sedeId !== sedeId) throw new NotFoundException(`Categoría padre ${parentId} no encontrada.`);
    if (parent.parentId) {
      throw new BadRequestException('No se permite anidar más de un nivel de subcategorías.');
    }
  }

  /** Rechaza un nombre que ya existe EN LA MISMA SEDE (case-insensitive). `excludeId` permite renombrar una categoría a sí misma. */
  private async assertNombreDisponible(sedeId: string, nombre: string, excludeId?: string): Promise<void> {
    const existente = await this.prisma.categoria.findFirst({
      where: {
        sedeId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existente) {
      throw new ConflictException(`Ya existe una categoría llamada "${existente.nombre}"`);
    }
  }

  // El check de arriba no cierra una carrera entre dos requests simultáneos;
  // la constraint UNIQUE de la BD es la garantía real. P2002 aquí es ese
  // caso raro, traducido al mismo 409 que ya usa assertNombreDisponible.
  private async crearCategoriaSegura(sedeId: string, nombre: string, descripcion?: string, parentId?: string, area?: CategoriaArea): Promise<CategoriaDto> {
    try {
      return await this.prisma.categoria.create({ data: { nombre, sedeId, descripcion, parentId, ...(area ? { area } : {}) } });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(`Ya existe una categoría llamada "${nombre}"`);
      }
      throw error;
    }
  }

  private async actualizarCategoriaSegura(
    id: string,
    data: { nombre?: string; descripcion?: string | null; parentId?: string | null; area?: CategoriaArea },
  ): Promise<CategoriaDto> {
    try {
      return await this.prisma.categoria.update({ where: { id }, data });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(`Ya existe una categoría llamada "${data.nombre}"`);
      }
      throw error;
    }
  }

  /**
   * Invariante que mantiene el ruteo de pedidos confiable sin mirar nunca el
   * nombre de la categoría: un producto con control de stock (Inventario)
   * SOLO puede vivir en una categoría de área INVENTARIO, y uno sin stock
   * (Carta/Menú) nunca puede vivir ahí — si no, el área de Categoria dejaría
   * de predecir de verdad si el producto pasa por producción o va directo a
   * cuenta.
   */
  private assertStockCoincideConAreaCategoria(stockActual: number | null, categoriaArea: CategoriaArea): void {
    const esInventario = categoriaArea === CategoriaArea.INVENTARIO;
    if (stockActual != null && !esInventario) {
      throw new BadRequestException(
        'Un producto con stock (Inventario) debe estar en una categoría de área Inventario.',
      );
    }
    if (stockActual == null && esInventario) {
      throw new BadRequestException(
        'Una categoría de área Inventario solo admite productos con control de stock.',
      );
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }

  // --- PRODUCTOS ---

  async listarProductos(query: ListarProductosQuery = {}, usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<ProductoListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const limit = this.normalizeLimit(query.limit);
    const disponible = this.normalizeBoolean(query.disponible);
    const conStock = this.normalizeBoolean(query.conStock);
    const where: Prisma.ProductoWhereInput = {
      sedeId,
      ...(query.categoriaId ? { categoriaId: query.categoriaId } : {}),
      ...(disponible == null ? {} : { disponible }),
      ...(conStock === true ? { stockActual: { not: null } } : {}),
      ...(conStock === false ? { stockActual: null } : {}),
      ...(query.updatedSince
        ? { updatedAt: { gte: new Date(query.updatedSince) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { nombre: { contains: query.search, mode: 'insensitive' } },
              { descripcion: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const productos = await this.prisma.producto.findMany({
      where,
      include: { categoria: true },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });

    const hasMore = productos.length > limit;
    const data = productos.slice(0, limit);

    return {
      data: data.map((producto) => this.toProductoDto(producto)),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 500);
  }

  private normalizeBoolean(value?: boolean): boolean | undefined {
    if (value == null) return undefined;
    if (typeof value === 'boolean') return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    return undefined;
  }

  private toProductoDto(producto: Record<string, unknown>): ProductoDto {
    return {
      id: producto['id'] as string,
      categoriaId: producto['categoriaId'] as string,
      categoria: (producto['categoria'] ?? undefined) as CategoriaDto | undefined,
      nombre: producto['nombre'] as string,
      descripcion: (producto['descripcion'] ?? null) as string | null,
      precio: Number(producto['precio']),
      disponible: producto['disponible'] as boolean,
      stockActual: (producto['stockActual'] ?? null) as number | null,
    };
  }

  // Carta pública/QR (T-XX): SIN autenticación, cualquiera con el link la
  // llama. El filtrado (disponible, área) se hace acá y no en el cliente.
  // Incluye COCINA/BARRA (platos preparados, sin stock — siempre "hay") y
  // también INVENTARIO ("Abarrotes" de cara al cliente, ver
  // PublicCartaScreen.tsx: agua/cerveza/gaseosas con stock real) pero SOLO
  // si les queda stock — a diferencia de Carta, acá si se agotan no se
  // muestran en vez de aparecer como "agotado" clickeable.
  async listarCartaPublica(sedeId: string): Promise<CartaPublicaResponse> {
    const [categorias, productos] = await Promise.all([
      this.prisma.categoria.findMany({
        where: { sedeId, area: { in: [CategoriaArea.COCINA, CategoriaArea.BARRA, CategoriaArea.INVENTARIO] } },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.producto.findMany({
        where: {
          sedeId,
          disponible: true,
          OR: [
            { stockActual: null, categoria: { area: { in: [CategoriaArea.COCINA, CategoriaArea.BARRA] } } },
            { stockActual: { gt: 0 }, categoria: { area: CategoriaArea.INVENTARIO } },
          ],
        },
        include: { categoria: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    return {
      categorias,
      productos: productos.map((producto) => this.toProductoDto(producto)),
    };
  }

  async obtenerProducto(id: string): Promise<ProductoDto> {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      include: { categoria: true }
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return this.toProductoDto(producto);
  }

  async obtenerProductosLote(ids: string[]): Promise<{ productos: ProductoDto[] }> {
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids } },
      include: { categoria: true },
    });
    return { productos: productos.map((producto) => this.toProductoDto(producto)) };
  }

  async crearProducto(command: CrearProductoCommand, usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<{ message: string; producto: ProductoDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const categoria = await this.prisma.categoria.findUnique({ where: { id: command.categoriaId } });
    if (!categoria || categoria.sedeId !== sedeId) {
      throw new NotFoundException(`Categoría con ID ${command.categoriaId} no encontrada`);
    }
    this.assertStockCoincideConAreaCategoria(command.stockActual ?? null, categoria.area);

    const producto = await this.prisma.$transaction(async (prisma) => {
      const p = await prisma.producto.create({
        data: {
          categoriaId: command.categoriaId,
          sedeId,
          nombre: command.nombre,
          descripcion: command.descripcion,
          precio: command.precio,
          disponible: command.disponible ?? true,
          stockActual: command.stockActual ?? null,
        }
      });

      const payload: ProductoCreadoPayload = {
        id: p.id,
        nombre: p.nombre,
        precio: p.precio.toNumber(),
        stockActual: p.stockActual,
        categoriaNombre: categoria.nombre,
        categoriaArea: categoria.area,
        disponible: p.disponible,
      };

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.ProductoCreado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        }
      });

      return p;
    });
    
    return { message: 'Producto creado exitosamente', producto: this.toProductoDto({ ...producto, categoria }) };
  }

  async actualizarProducto(id: string, command: ActualizarProductoCommand): Promise<{ message: string; producto: ProductoDto }> {
    let categoriaDestino: { id: string; sedeId: string; area: CategoriaArea } | null = null;
    if (command.categoriaId) {
      categoriaDestino = await this.prisma.categoria.findUnique({ where: { id: command.categoriaId } });
      if (!categoriaDestino) {
        throw new NotFoundException(`Categoría con ID ${command.categoriaId} no encontrada`);
      }
    }

    const actualizado = await this.prisma.$transaction(async (prisma) => {
      const existente = await prisma.producto.findUnique({ where: { id }, include: { categoria: true } });
      if (!existente) throw new NotFoundException('Producto no encontrado');
      if (categoriaDestino && categoriaDestino.sedeId !== existente.sedeId) {
        throw new NotFoundException(`Categoría con ID ${command.categoriaId} no encontrada`);
      }
      if (categoriaDestino) {
        this.assertStockCoincideConAreaCategoria(existente.stockActual, categoriaDestino.area);
      }

      const p = await prisma.producto.update({
        where: { id },
        data: {
          ...(command.categoriaId == null ? {} : { categoriaId: command.categoriaId }),
          ...(command.nombre == null ? {} : { nombre: command.nombre }),
          ...(command.descripcion === undefined ? {} : { descripcion: command.descripcion }),
          ...(command.precio == null ? {} : { precio: command.precio }),
          ...(command.disponible == null ? {} : { disponible: command.disponible }),
        },
        include: { categoria: true },
      });

      const payload: ProductoActualizadoPayload = {
        id: p.id,
        sedeId: p.sedeId,
        nombre: p.nombre,
        precio: p.precio.toNumber(),
        stockActual: p.stockActual,
        categoriaNombre: p.categoria?.nombre,
        categoriaArea: p.categoria?.area,
        disponible: p.disponible,
      };

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.ProductoActualizado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        }
      });

      return p;
    });

    return { message: 'Producto actualizado', producto: this.toProductoDto(actualizado) };
  }

  async actualizarStock(id: string, cantidad: number): Promise<{ message: string; producto: ProductoDto }> {
    const actualizado = await this.prisma.$transaction(async (prisma) => {
      // classid 1234 compartido entre servicios A PROPOSITO: cada servicio tiene su propia BD (database-per-service), el espacio de locks no se cruza.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${id}), 1, 8))::bit(32)::int)`;

      const producto = await prisma.producto.findUnique({ where: { id }, include: { categoria: true } });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      const stockBase = producto.stockActual ?? 0;
      const nuevoStock = Math.max(0, stockBase + cantidad);
      const disponibleFinal = nuevoStock === 0 ? false : producto.disponible;

      const p = await prisma.producto.update({
        where: { id },
        data: {
          stockActual: nuevoStock,
          disponible: disponibleFinal,
        }
      });

      const payload: ProductoActualizadoPayload = {
        id: p.id,
        sedeId: p.sedeId,
        nombre: p.nombre,
        precio: p.precio.toNumber(),
        stockActual: p.stockActual,
        categoriaNombre: producto.categoria?.nombre,
        categoriaArea: producto.categoria?.area,
        disponible: disponibleFinal,
        stockSyncMode: cantidad > 0 ? 'REPOSICION' : 'CONSUMO_PEDIDO',
        stockDelta: cantidad,
      };

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.ProductoActualizado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        }
      });

      return p;
    });

    return { message: 'Stock actualizado', producto: this.toProductoDto({ ...actualizado, categoria: undefined }) };
  }

  async reducirStockAutomatico(id: string, cantidad: number): Promise<void> {
    await this.reducirStockAutomaticoConPrisma(this.prisma, id, cantidad);
  }

  private async reducirStockAutomaticoConPrisma(
    prisma: Prisma.TransactionClient,
    id: string,
    cantidad: number,
    pedidoId?: string,
  ): Promise<void> {
    if (cantidad <= 0) throw new BadRequestException('Cantidad debe ser mayor a 0');
    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${id}), 1, 8))::bit(32)::int)`;
    const producto = await prisma.producto.findUnique({ where: { id }, include: { categoria: true } });

    if (!producto) {
      this.logger.warn({
        operation: 'reducirStockAutomatico',
        aggregateId: id,
        errorCode: 'PRODUCTO_NO_ENCONTRADO',
        message: 'Producto no encontrado para reducción de stock.',
      } satisfies OperableLog);
      return;
    }

    if (producto.stockActual === null) {
      return;
    }

    const actualizado = await prisma.producto.updateMany({
      where: {
        id,
        stockActual: { gte: cantidad }
      },
      data: {
        stockActual: { decrement: cantidad }
      }
    });

    if (actualizado.count === 0) {
      this.logger.warn({
        operation: 'reducirStockAutomatico',
        aggregateId: id,
        errorCode: 'STOCK_INSUFICIENTE',
        message: `Stock insuficiente — no se pudo decrementar ${cantidad}.`,
      } satisfies OperableLog);
      // Compensación de saga: la proyección de pedidos quedó por delante del stock
      // real (lag de ProductoActualizado), así que el pedido se creó sobre stock
      // inexistente. Emitimos StockInsuficiente en el MISMO $transaction que el
      // resto del consumo para que Pedidos marque el ítem/pedido como rechazado.
      if (pedidoId) {
        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.StockInsuficiente,
            payload: JSON.stringify({
              pedidoId,
              productoId: id,
              solicitado: cantidad,
              disponible: producto.stockActual,
            } satisfies StockInsuficientePayload),
            status: 'PENDING',
          },
        });
      }
      return;
    }

    const productoDespues = await prisma.producto.findUnique({ where: { id } });
    let productoFinal = productoDespues;
    if (productoDespues?.stockActual === 0 && productoDespues.disponible) {
      productoFinal = await prisma.producto.update({
        where: { id },
        data: { disponible: false }
      });
    }

    await prisma.outboxEvent.create({
      data: {
        routingKey: RoutingKeys.ProductoActualizado,
        payload: JSON.stringify({
          id: producto.id,
          sedeId: producto.sedeId,
          nombre: producto.nombre,
          precio: producto.precio.toNumber(),
          stockActual: productoFinal?.stockActual,
          categoriaNombre: producto.categoria?.nombre,
          categoriaArea: producto.categoria?.area,
          disponible: productoFinal?.disponible ?? producto.disponible,
          stockSyncMode: 'CONSUMO_PEDIDO',
          stockDelta: -cantidad,
        } satisfies ProductoActualizadoPayload),
        status: 'PENDING',
      }
    });

    this.logger.log({
      operation: 'reducirStockAutomatico',
      aggregateId: id,
      resultingState: `stockActual=${productoFinal?.stockActual}`,
      message: `Stock reducido para ${productoFinal?.nombre ?? id}.`,
    } satisfies OperableLog);
  }

  // --- MENÚ DEL DÍA (T-20) ---

  private hoyISO(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private toMenuDiarioItemDto(item: {
    id: string;
    fecha: Date;
    productoId: string;
    disponible: boolean;
    producto?: Record<string, unknown>;
  }): MenuDiarioItemDto {
    return {
      id: item.id,
      fecha: item.fecha.toISOString().slice(0, 10),
      productoId: item.productoId,
      producto: item.producto ? this.toProductoDto(item.producto) : undefined,
      disponible: item.disponible,
    };
  }

  async listarMenuDelDia(fecha?: string, usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<{ menu: MenuDiarioItemDto[] }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const items = await this.prisma.menuDiario.findMany({
      where: { fecha: new Date(fecha ?? this.hoyISO()), producto: { sedeId } },
      include: { producto: { include: { categoria: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { menu: items.map((item) => this.toMenuDiarioItemDto(item)) };
  }

  async agregarAlMenu(command: AgregarAlMenuCommand, usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<{ message: string; item: MenuDiarioItemDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    if (!command.productoId && !command.producto) {
      throw new BadRequestException('Se requiere productoId (plato existente) o producto (plato nuevo).');
    }
    if (command.productoId && command.producto) {
      throw new BadRequestException('Indica solo uno: productoId o producto, no ambos.');
    }

    let productoId = command.productoId;
    if (!productoId && command.producto) {
      const { producto } = await this.crearProducto(command.producto, sedeId);
      productoId = producto.id;
    } else {
      const existe = await this.prisma.producto.findUnique({ where: { id: productoId } });
      if (!existe || existe.sedeId !== sedeId) throw new NotFoundException(`Producto con ID ${productoId} no encontrado`);
    }

    const fecha = new Date(command.fecha ?? this.hoyISO());
    // Upsert sobre [fecha, productoId]: agregar un plato que ya estuvo hoy
    // (y se había quitado) lo reactiva en vez de duplicar la fila.
    const item = await this.prisma.menuDiario.upsert({
      where: { fecha_productoId: { fecha, productoId: productoId as string } },
      create: { fecha, productoId: productoId as string, disponible: true },
      update: { disponible: true },
      include: { producto: { include: { categoria: true } } },
    });

    this.logger.log({
      operation: 'agregarAlMenu',
      aggregateId: item.id,
      message: `Producto ${productoId} agregado al menú del ${item.fecha.toISOString().slice(0, 10)}.`,
    } satisfies OperableLog);

    return { message: 'Agregado al menú del día', item: this.toMenuDiarioItemDto(item) };
  }

  async actualizarMenuDiario(id: string, command: ActualizarMenuDiarioCommand): Promise<{ message: string; item: MenuDiarioItemDto }> {
    const existe = await this.prisma.menuDiario.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException('Ítem de menú del día no encontrado');

    const item = await this.prisma.menuDiario.update({
      where: { id },
      data: { disponible: command.disponible },
      include: { producto: { include: { categoria: true } } },
    });

    return { message: command.disponible ? 'Plato activado en el menú' : 'Plato desactivado del menú', item: this.toMenuDiarioItemDto(item) };
  }

  async quitarDelMenu(id: string): Promise<{ message: string }> {
    const existe = await this.prisma.menuDiario.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException('Ítem de menú del día no encontrado');
    await this.prisma.menuDiario.delete({ where: { id } });
    return { message: 'Quitado del menú del día' };
  }

  // --- MERMA DE INVENTARIO (T-22, CU-01..CU-04) ---

  private toMermaDto(merma: {
    id: string;
    productoId: string;
    cantidad: number;
    motivo: string;
    observacion: string | null;
    origen: string;
    costoUnitario: Prisma.Decimal | null;
    pedidoItemId: string | null;
    cuentaCorrelativo?: string | null;
    usuarioId: string | null;
    usuarioNombre: string | null;
    createdAt: Date;
    producto?: Record<string, unknown>;
  }): MermaDto {
    const costoUnitario = merma.costoUnitario == null ? null : merma.costoUnitario.toNumber();
    return {
      id: merma.id,
      productoId: merma.productoId,
      producto: merma.producto ? this.toProductoDto(merma.producto) : undefined,
      cantidad: merma.cantidad,
      motivo: merma.motivo,
      observacion: merma.observacion,
      origen: merma.origen as MermaDto['origen'],
      costoUnitario,
      costoTotal: costoUnitario == null ? null : costoUnitario * merma.cantidad,
      pedidoItemId: merma.pedidoItemId,
      cuentaCorrelativo: merma.cuentaCorrelativo,
      usuarioId: merma.usuarioId,
      usuarioNombre: merma.usuarioNombre,
      createdAt: merma.createdAt.toISOString(),
    };
  }

  async registrarMerma(
    command: RegistrarMermaCommand,
    usuarioId?: string | null,
    usuarioNombre?: string | null,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ): Promise<{ message: string; merma: MermaDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const merma = await this.prisma.$transaction(async (prisma) => {
      // classid 1234 compartido entre servicios A PROPOSITO: cada servicio tiene su propia BD (database-per-service), el espacio de locks no se cruza.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${command.productoId}), 1, 8))::bit(32)::int)`;

      const producto = await prisma.producto.findUnique({ where: { id: command.productoId }, include: { categoria: true } });
      if (!producto || producto.sedeId !== sedeId) throw new NotFoundException('Producto no encontrado');
      // La merma MANUAL (botón en Inventario) es solo para productos con
      // stock — para platos de Carta/Menú ya preparados, la merma nace
      // automática desde la anulación de comanda (ver procesarItemAnuladoConMerma).
      if (producto.stockActual === null) {
        throw new BadRequestException('Este producto no lleva control de stock; no se le puede registrar merma manual. Para un plato ya preparado, anúlalo desde la comanda.');
      }
      if (command.cantidad > producto.stockActual) {
        throw new BadRequestException(`No puedes mermar ${command.cantidad}: solo hay ${producto.stockActual} en stock.`);
      }

      const nuevoStock = producto.stockActual - command.cantidad;
      const productoActualizado = await prisma.producto.update({
        where: { id: command.productoId },
        data: {
          stockActual: nuevoStock,
          disponible: nuevoStock === 0 ? false : producto.disponible,
        },
      });

      const costoUnitario = command.costoUnitario ?? producto.precio.toNumber();
      const m = await prisma.merma.create({
        data: {
          productoId: command.productoId,
          cantidad: command.cantidad,
          motivo: command.motivo,
          observacion: command.observacion,
          origen: MermaOrigen.DESCARTE_MANUAL_INVENTARIO,
          costoUnitario,
          usuarioId: usuarioId ?? undefined,
          usuarioNombre: usuarioNombre ?? undefined,
        },
      });

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.ProductoActualizado,
          payload: JSON.stringify({
            id: productoActualizado.id,
            sedeId,
            nombre: productoActualizado.nombre,
            precio: productoActualizado.precio.toNumber(),
            stockActual: productoActualizado.stockActual,
            categoriaNombre: producto.categoria?.nombre,
            categoriaArea: producto.categoria?.area,
            disponible: productoActualizado.disponible,
            stockSyncMode: 'MERMA',
            stockDelta: -command.cantidad,
          } satisfies ProductoActualizadoPayload),
          status: 'PENDING',
        },
      });

      return { ...m, producto: { ...productoActualizado, categoria: producto.categoria } };
    });

    this.logger.log({
      operation: 'registrarMerma',
      aggregateId: merma.id,
      message: `Merma de ${merma.cantidad} registrada para ${merma.producto.nombre}: ${merma.motivo}`,
    } satisfies OperableLog);

    return { message: 'Merma registrada', merma: this.toMermaDto(merma) };
  }

  async listarMermas(query: ListarMermasQuery = {}, usuarioSedeId?: string | null, sedeIdSolicitado?: string): Promise<{ mermas: MermaDto[] }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const mermas = await this.prisma.merma.findMany({
      where: {
        producto: { sedeId },
        ...(query.productoId ? { productoId: query.productoId } : {}),
        ...(query.origen ? { origen: query.origen } : {}),
        ...(query.desde || query.hasta
          ? {
              createdAt: {
                ...(query.desde ? { gte: new Date(query.desde) } : {}),
                ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
              },
            }
          : {}),
        ...(query.search
          ? { cuentaCorrelativo: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      include: { producto: { include: { categoria: true } } },
      orderBy: { createdAt: 'desc' },
      take: this.normalizeLimit(query.limit),
    });
    return { mermas: mermas.map((m) => this.toMermaDto(m)) };
  }

  /**
   * CU-04 (Update): corrige cantidad/motivo/observación de una merma ya
   * registrada. Si cambia la cantidad y el producto lleva stock, recalcula
   * el stock por la DIFERENCIA (no vuelve a descontar todo) — así el ajuste
   * es idempotente frente al valor anterior, no acumulativo.
   */
  async actualizarMerma(
    id: string,
    command: ActualizarMermaCommand,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ): Promise<{ message: string; merma: MermaDto }> {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const merma = await this.prisma.$transaction(async (prisma) => {
      const existente = await prisma.merma.findUnique({ where: { id }, include: { producto: { include: { categoria: true } } } });
      if (!existente || existente.producto.sedeId !== sedeId) throw new NotFoundException('Merma no encontrada');

      let productoFinal = existente.producto;
      if (command.cantidad !== undefined && command.cantidad !== existente.cantidad && existente.producto.stockActual !== null) {
        await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${existente.productoId}), 1, 8))::bit(32)::int)`;
        const producto = await prisma.producto.findUniqueOrThrow({ where: { id: existente.productoId } });
        // Diferencia respecto a lo YA mermado: si antes se mermaron 3 y ahora
        // se corrige a 5, hay que descontar 2 más (no 5 de nuevo).
        const diferencia = command.cantidad - existente.cantidad;
        const nuevoStock = (producto.stockActual ?? 0) - diferencia;
        if (nuevoStock < 0) {
          throw new BadRequestException(`No hay suficiente stock para aumentar la merma en ${diferencia}: quedarían ${nuevoStock} unidades.`);
        }
        productoFinal = await prisma.producto.update({
          where: { id: existente.productoId },
          data: { stockActual: nuevoStock, disponible: nuevoStock === 0 ? false : producto.disponible },
          include: { categoria: true },
        });

        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.ProductoActualizado,
            payload: JSON.stringify({
              id: productoFinal.id,
              sedeId,
              nombre: productoFinal.nombre,
              precio: productoFinal.precio.toNumber(),
              stockActual: productoFinal.stockActual,
              categoriaNombre: productoFinal.categoria?.nombre,
              categoriaArea: productoFinal.categoria?.area,
              disponible: productoFinal.disponible,
              stockSyncMode: 'MERMA',
              stockDelta: -diferencia,
            } satisfies ProductoActualizadoPayload),
            status: 'PENDING',
          },
        });
      }

      const actualizada = await prisma.merma.update({
        where: { id },
        data: {
          ...(command.cantidad === undefined ? {} : { cantidad: command.cantidad }),
          ...(command.motivo === undefined ? {} : { motivo: command.motivo }),
          ...(command.observacion === undefined ? {} : { observacion: command.observacion }),
        },
      });

      return { ...actualizada, producto: productoFinal };
    });

    this.logger.log({
      operation: 'actualizarMerma',
      aggregateId: merma.id,
      message: `Merma ${merma.id} corregida.`,
    } satisfies OperableLog);

    return { message: 'Merma actualizada', merma: this.toMermaDto(merma) };
  }

  /**
   * CU-04 (Delete): revierte una merma creada por error. Restaura el stock
   * descontado (si el producto lo lleva) y exige justificación — nunca se
   * borra en silencio algo que ya movió inventario.
   */
  async eliminarMerma(
    id: string,
    justificacion: string,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ): Promise<{ message: string }> {
    if (!justificacion || justificacion.trim().length < 3) {
      throw new BadRequestException('La justificación es obligatoria para eliminar una merma.');
    }
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    await this.prisma.$transaction(async (prisma) => {
      const existente = await prisma.merma.findUnique({ where: { id }, include: { producto: { include: { categoria: true } } } });
      if (!existente || existente.producto.sedeId !== sedeId) throw new NotFoundException('Merma no encontrada');

      if (existente.producto.stockActual !== null) {
        await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${existente.productoId}), 1, 8))::bit(32)::int)`;
        const producto = await prisma.producto.findUniqueOrThrow({ where: { id: existente.productoId } });
        const nuevoStock = (producto.stockActual ?? 0) + existente.cantidad;
        const productoActualizado = await prisma.producto.update({
          where: { id: existente.productoId },
          data: { stockActual: nuevoStock, disponible: true },
          include: { categoria: true },
        });

        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.ProductoActualizado,
            payload: JSON.stringify({
              id: productoActualizado.id,
              sedeId,
              nombre: productoActualizado.nombre,
              precio: productoActualizado.precio.toNumber(),
              stockActual: productoActualizado.stockActual,
              categoriaNombre: productoActualizado.categoria?.nombre,
              categoriaArea: productoActualizado.categoria?.area,
              disponible: productoActualizado.disponible,
              stockSyncMode: 'REPOSICION',
              stockDelta: existente.cantidad,
            } satisfies ProductoActualizadoPayload),
            status: 'PENDING',
          },
        });
      }

      await prisma.merma.delete({ where: { id } });

      this.logger.log({
        operation: 'eliminarMerma',
        aggregateId: id,
        message: `Merma ${id} eliminada y stock restaurado. Justificación: ${justificacion}`,
      } satisfies OperableLog);
    });

    return { message: 'Merma eliminada y stock restaurado' };
  }

  /**
   * CU-01/CU-02: consumidor del evento que emite Pedidos cuando se anula un
   * ítem YA preparado/servido. La pérdida es real haya cobro o no (el plato
   * ya salió) — el `origen` solo distingue si además se cobró al cliente.
   * Si el producto no lleva stock (plato de Carta/Menú sin control), no hay
   * ningún contador que tocar: la merma queda solo como registro de costo.
   */
  async procesarItemAnuladoConMerma(payload: PedidoItemAnuladoConMermaPayload): Promise<void> {
    if (!payload?.productoId || !payload.cantidad) {
      this.logger.warn({
        operation: 'procesarItemAnuladoConMerma',
        errorCode: 'PAYLOAD_INVALIDO',
        message: 'Evento PedidoItemAnuladoConMerma sin productoId/cantidad — ignorado.',
      } satisfies OperableLog);
      return;
    }
    const idempotencyKey = `${RoutingKeys.PedidoItemAnuladoConMerma}:${payload.eventId ?? payload.itemId}`;
    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: idempotencyKey } });

        const producto = await prisma.producto.findUnique({ where: { id: payload.productoId }, include: { categoria: true } });
        if (!producto) {
          this.logger.warn({
            operation: 'procesarItemAnuladoConMerma',
            aggregateId: payload.productoId,
            errorCode: 'PRODUCTO_NO_ENCONTRADO',
            message: `Producto ${payload.productoId} no encontrado — se registra la merma sin costoUnitario ni ajuste de stock.`,
          } satisfies OperableLog);
        }

        let stockActual = producto?.stockActual ?? null;
        if (producto && stockActual !== null) {
          await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${payload.productoId}), 1, 8))::bit(32)::int)`;
          const fresco = await prisma.producto.findUniqueOrThrow({ where: { id: payload.productoId } });
          // Ya se había descontado al crear el pedido (todo ítem con stock
          // se reserva en ese momento) — este evento solo registra la
          // merma, no vuelve a tocar el stock.
          stockActual = fresco.stockActual;
        }

        await prisma.merma.create({
          data: {
            productoId: payload.productoId,
            cantidad: payload.cantidad,
            motivo: payload.motivo,
            observacion: payload.observacion,
            origen: payload.cobrado ? MermaOrigen.ANULACION_COMANDA_COBRADA : MermaOrigen.ANULACION_COMANDA_NO_COBRADA,
            costoUnitario: producto?.precio.toNumber() ?? null,
            pedidoItemId: payload.itemId,
            cuentaCorrelativo: payload.cuentaCorrelativo ?? undefined,
            usuarioId: payload.usuarioId ?? undefined,
            usuarioNombre: payload.usuarioNombre ?? undefined,
          },
        });
      });

      this.logger.log({
        operation: 'procesarItemAnuladoConMerma',
        aggregateId: payload.itemId,
        resultingState: payload.cobrado ? 'ANULACION_COMANDA_COBRADA' : 'ANULACION_COMANDA_NO_COBRADA',
        message: `Merma automática registrada para "${payload.productoNombre}" (${payload.cantidad}): ${payload.motivo}`,
      } satisfies OperableLog);
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarItemAnuladoConMerma',
          aggregateId: payload.itemId,
          idempotencyKey,
          message: 'Evento PedidoItemAnuladoConMerma ya procesado — no se duplica la merma (idempotente).',
        } satisfies OperableLog);
        return;
      }
      throw error;
    }
  }

  /**
   * CU-02: un ítem de Inventario se reservó al crear el pedido pero la mesa
   * se anuló antes de consumirlo — se le devuelve el stock (sin merma: no
   * hubo pérdida real).
   */
  async procesarStockRestaurado(payload: StockRestauradoPayload): Promise<void> {
    if (!payload?.productoId || !payload.cantidad) {
      this.logger.warn({
        operation: 'procesarStockRestaurado',
        errorCode: 'PAYLOAD_INVALIDO',
        message: 'Evento StockRestaurado sin productoId/cantidad — ignorado.',
      } satisfies OperableLog);
      return;
    }
    const idempotencyKey = `${RoutingKeys.StockRestaurado}:${payload.eventId ?? `${payload.productoId}:${payload.cantidad}:${Date.now()}`}`;
    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: idempotencyKey } });
        await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${payload.productoId}), 1, 8))::bit(32)::int)`;

        const producto = await prisma.producto.findUnique({ where: { id: payload.productoId }, include: { categoria: true } });
        if (!producto || producto.stockActual === null) {
          this.logger.warn({
            operation: 'procesarStockRestaurado',
            aggregateId: payload.productoId,
            errorCode: 'PRODUCTO_NO_APLICABLE',
            message: 'Producto no existe o no lleva control de stock — se ignora la restauración.',
          } satisfies OperableLog);
          return;
        }

        const nuevoStock = producto.stockActual + payload.cantidad;
        const productoActualizado = await prisma.producto.update({
          where: { id: payload.productoId },
          data: { stockActual: nuevoStock, disponible: true },
        });

        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.ProductoActualizado,
            payload: JSON.stringify({
              id: productoActualizado.id,
              sedeId: producto.sedeId,
              nombre: productoActualizado.nombre,
              precio: productoActualizado.precio.toNumber(),
              stockActual: productoActualizado.stockActual,
              categoriaNombre: producto.categoria?.nombre,
              categoriaArea: producto.categoria?.area,
              disponible: productoActualizado.disponible,
              stockSyncMode: 'REPOSICION',
              stockDelta: payload.cantidad,
            } satisfies ProductoActualizadoPayload),
            status: 'PENDING',
          },
        });
      });

      this.logger.log({
        operation: 'procesarStockRestaurado',
        aggregateId: payload.productoId,
        message: `Stock restaurado (+${payload.cantidad}) por: ${payload.motivo}`,
      } satisfies OperableLog);
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarStockRestaurado',
          aggregateId: payload.productoId,
          idempotencyKey,
          message: 'Evento StockRestaurado ya procesado — idempotente.',
        } satisfies OperableLog);
        return;
      }
      throw error;
    }
  }

  // A2: idempotencia por pedido.id — reclama la clave atómicamente
  async procesarPedidoCreado(pedido: PedidoCreadoPayload['pedido']): Promise<void> {
    if (!pedido?.id || !Array.isArray(pedido.items)) {
      this.logger.warn({
        operation: 'procesarPedidoCreado',
        errorCode: 'PAYLOAD_INVALIDO',
        message: 'Evento PedidoCreado sin id/items — ignorado.',
      } satisfies OperableLog);
      return;
    }
    // Fault-injection para las pruebas de caos: fuerza un fallo del consumidor
    // (→ reintentos → DLQ). Gateado por entorno: NUNCA activo en producción, para
    // que un `notas` con el string mágico no sea un backdoor de DoS por request.
    if (
      process.env.NODE_ENV !== 'production' &&
      pedido.items.some((item) => item?.notas === '__QA_INVENTARIO_FORCE_DLQ__')
    ) {
      throw new Error(`Fallo QA controlado para pedido ${pedido.id}`);
    }
    const key = `pedido.creado:${pedido.id}`;

    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key } });

        await Promise.all(
          pedido.items.map(async (item) => {
            if (item.productoId && item.cantidad) {
              await this.reducirStockAutomaticoConPrisma(prisma, item.productoId, item.cantidad, pedido.id);
            }
          })
        );
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarPedidoCreado',
          aggregateId: pedido.id,
          message: 'Evento PedidoCreado ya procesado — stock no se reduce de nuevo (idempotente).',
        } satisfies OperableLog);
        return;
      }
      throw e;
    }
  }

  // Compras → Inventario: idempotencia por recepcion.id — reclama la clave
  // atómicamente (mismo patrón que procesarPedidoCreado).
  async procesarCompraRecibida(payload: CompraRecibidaPayload): Promise<void> {
    if (!payload?.recepcionId || !Array.isArray(payload.lineas)) {
      this.logger.warn({
        operation: 'procesarCompraRecibida',
        errorCode: 'PAYLOAD_INVALIDO',
        message: 'Evento CompraRecibida sin recepcionId/lineas — ignorado.',
      } satisfies OperableLog);
      return;
    }
    const key = `compra.recibida:${payload.recepcionId}`;

    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key } });

        await Promise.all(
          payload.lineas.map((linea) => this.aplicarCompraRecibidaLinea(prisma, payload.sedeId, linea)),
        );
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarCompraRecibida',
          aggregateId: payload.recepcionId,
          message: 'Evento CompraRecibida ya procesado — stock no se incrementa de nuevo (idempotente).',
        } satisfies OperableLog);
        return;
      }
      throw e;
    }
  }

  private async aplicarCompraRecibidaLinea(
    prisma: Prisma.TransactionClient,
    sedeId: string,
    linea: CompraRecibidaLineaPayload,
  ): Promise<void> {
    // null/undefined = insumo crudo que Compras nunca debió incluir en el
    // payload (no hay puente a un producto vendible); cantidad<=0 no mueve nada.
    if (!linea.productoId || linea.cantidadStockVenta <= 0) return;

    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${linea.productoId}), 1, 8))::bit(32)::int)`;

    const producto = await prisma.producto.findUnique({ where: { id: linea.productoId }, include: { categoria: true } });
    if (!producto || producto.sedeId !== sedeId || producto.stockActual == null) {
      this.logger.warn({
        operation: 'procesarCompraRecibida',
        aggregateId: linea.productoId,
        errorCode: 'PRODUCTO_NO_APLICABLE',
        message: `Insumo "${linea.insumoNombre}" puentea a un producto que no existe, es de otra sede o no lleva stock — se ignora.`,
      } satisfies OperableLog);
      return;
    }

    const nuevoStock = producto.stockActual + linea.cantidadStockVenta;
    // Reactivación explícita (a diferencia de actualizarStock, que nunca
    // reactiva): llegó mercadería, así que un producto que se había
    // auto-desactivado al llegar a stock 0 vuelve a ser vendible.
    const disponibleFinal = nuevoStock > 0 ? true : producto.disponible;

    const actualizado = await prisma.producto.update({
      where: { id: linea.productoId },
      data: { stockActual: nuevoStock, disponible: disponibleFinal },
    });

    const evento: ProductoActualizadoPayload = {
      id: actualizado.id,
      sedeId,
      nombre: actualizado.nombre,
      precio: actualizado.precio.toNumber(),
      stockActual: actualizado.stockActual,
      categoriaNombre: producto.categoria?.nombre,
      categoriaArea: producto.categoria?.area,
      disponible: disponibleFinal,
      stockSyncMode: 'REPOSICION',
      stockDelta: linea.cantidadStockVenta,
    };

    await prisma.outboxEvent.create({
      data: {
        routingKey: RoutingKeys.ProductoActualizado,
        payload: JSON.stringify(evento),
        status: 'PENDING',
      },
    });
  }
}
