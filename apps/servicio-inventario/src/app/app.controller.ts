import { Controller, Get, Post, Body, Param, Patch, Delete, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { AppService } from './app.service';
import { CrearCategoriaCommand, ActualizarCategoriaCommand, CrearProductoCommand, ActualizarProductoCommand, ActualizarDisponibilidadCommand, ListarProductosQuery, ObtenerProductosLoteCommand, AgregarAlMenuCommand, ActualizarMenuDiarioCommand, RegistrarMermaCommand, ListarMermasQuery } from '@org/contracts';

// Lectura del catálogo: la usan inventario/carta (admin, sistema, gerencia) y
// también el comandero del PWA (cajero, mesero) al armar pedidos. La gestión
// del catálogo (mutaciones) queda restringida a administración por método.
// T-23 (multi-sede): listar/crear reciben `sedeId` por query — el servicio la
// resuelve contra `req.user.sedeId` (usuario pineado gana siempre; el admin
// general debe indicarla).
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'CAJERO', 'MESERO')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    return this.appService.getHello();
  }

  // --- CATEGORÍAS ---

  @Get('categorias')
  listarCategorias(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.appService.listarCategorias(usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('categorias')
  crearCategoria(
    @Body() body: CrearCategoriaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.crearCategoria(body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('categorias/:id')
  actualizarCategoria(@Param('id') id: string, @Body() body: ActualizarCategoriaCommand) {
    return this.appService.actualizarCategoria(id, body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Delete('categorias/:id')
  eliminarCategoria(@Param('id') id: string) {
    return this.appService.eliminarCategoria(id);
  }

  // --- PRODUCTOS ---

  @Get('productos')
  listarProductos(
    @Query() query: ListarProductosQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.listarProductos(query, usuarioSedeId, sedeId);
  }

  @Get('productos/:id')
  obtenerProducto(@Param('id') id: string) {
    return this.appService.obtenerProducto(id);
  }

  // Consulta por lote: la invoca servicio-pedidos con token SISTEMA (cold-start).
  @Post('productos/lote')
  obtenerProductosLote(@Body() body: ObtenerProductosLoteCommand) {
    return this.appService.obtenerProductosLote(body.ids);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('productos')
  crearProducto(
    @Body() body: CrearProductoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.crearProducto(body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('productos/:id/stock')
  actualizarStock(@Param('id') id: string, @Body('stock') stock: number) {
    return this.appService.actualizarStock(id, stock);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('productos/:id')
  actualizarProducto(@Param('id') id: string, @Body() body: ActualizarProductoCommand) {
    return this.appService.actualizarProducto(id, body);
  }

  // Acotado a solo el flag `disponible` (a diferencia de PATCH productos/:id,
  // que también acepta nombre/precio/categoría) para que COCINA pueda marcar
  // 86 (agotado) sin poder editar el resto del plato.
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @Patch('productos/:id/disponibilidad')
  actualizarDisponibilidadProducto(@Param('id') id: string, @Body() body: ActualizarDisponibilidadCommand) {
    return this.appService.actualizarProducto(id, { disponible: body.disponible });
  }

  // --- MENÚ DEL DÍA ---
  // Lectura abierta al comandero (mesero/cajero); gestión restringida a admin,
  // igual que el resto del catálogo.

  @Get('menu-diario')
  listarMenuDelDia(
    @Query('fecha') fecha: string | undefined,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.listarMenuDelDia(fecha, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('menu-diario')
  agregarAlMenu(
    @Body() body: AgregarAlMenuCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.agregarAlMenu(body, usuarioSedeId, sedeId);
  }

  // ActualizarMenuDiarioCommand ya es disponible-only, así que COCINA puede
  // usar el mismo endpoint sin abrir superficie de edición extra.
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @Patch('menu-diario/:id')
  actualizarMenuDiario(@Param('id') id: string, @Body() body: ActualizarMenuDiarioCommand) {
    return this.appService.actualizarMenuDiario(id, body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Delete('menu-diario/:id')
  quitarDelMenu(@Param('id') id: string) {
    return this.appService.quitarDelMenu(id);
  }

  // --- MERMA DE INVENTARIO ---

  @Get('mermas')
  listarMermas(
    @Query() query: ListarMermasQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.listarMermas(query, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('mermas')
  registrarMerma(
    @Body() body: RegistrarMermaCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.registrarMerma(body, usuarioId, usuarioNombre, usuarioSedeId, sedeId);
  }
}
