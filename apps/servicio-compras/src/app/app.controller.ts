import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { Roles, RolesGuard } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { IdempotencyInterceptor } from '@org/resiliencia';
import {
  ActualizarCategoriaInsumoCommand,
  ActualizarInsumoCommand,
  ActualizarOrdenCompraCommand,
  ActualizarProveedorCommand,
  AnularOrdenCommand,
  CerrarOrdenCommand,
  CrearCategoriaInsumoCommand,
  CrearInsumoCommand,
  CrearOrdenCompraCommand,
  CrearProveedorCommand,
  ListarCategoriasInsumoQuery,
  ListarComprobantesQuery,
  ListarInsumosQuery,
  ListarMovimientosInsumoQuery,
  ListarOrdenesQuery,
  ListarProveedoresQuery,
  RegistrarConteoInsumosCommand,
  RegistrarMovimientoInsumoCommand,
  RegistrarRecepcionCommand,
  SubirComprobanteCommand,
} from '@org/contracts';
import { ProveedoresService } from './proveedores.service';
import { InsumosService } from './insumos.service';
import { CategoriasInsumoService } from './categorias-insumo.service';
import { MovimientosInsumoService } from './movimientos-insumo.service';
import { OrdenesService } from './ordenes.service';
import { RecepcionesService } from './recepciones.service';
import { ArchivoSubido, ComprobantesService } from './comprobantes.service';

// Límite duro del interceptor de multer: la precompresión client-side deja el
// upload típico en ~200 KB, pero un cliente que la salte puede mandar hasta
// esto por 3G desde el local (COMPROBANTE_MAX_BYTES lo vuelve a validar tras
// la descompresión real de sharp).
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function usuarioDe(usuarioId: string | null, usuarioNombre: string | null, usuarioEmail: string | null) {
  return usuarioId ? { id: usuarioId, nombre: usuarioNombre ?? usuarioEmail ?? usuarioId } : null;
}

// Compras: visible para quien decide qué y a quién comprar; no es un módulo
// operativo de piso (mesero/cajero) como pedidos o caja.
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'GERENCIA')
@Controller()
export class AppController {
  constructor(
    private readonly proveedores: ProveedoresService,
    private readonly insumos: InsumosService,
    private readonly categoriasInsumo: CategoriasInsumoService,
    private readonly movimientos: MovimientosInsumoService,
    private readonly ordenes: OrdenesService,
    private readonly recepciones: RecepcionesService,
    private readonly comprobantes: ComprobantesService,
  ) {}

  // ── Proveedores ──
  @Get('proveedores')
  listarProveedores(@Query() query: ListarProveedoresQuery, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.proveedores.listar(query, usuarioSedeId);
  }

  @Post('proveedores')
  crearProveedor(
    @Body() body: CrearProveedorCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.proveedores.crear(body, usuarioSedeId, sedeId);
  }

  @Patch('proveedores/:id')
  actualizarProveedor(
    @Param('id') id: string,
    @Body() body: ActualizarProveedorCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.proveedores.actualizar(id, body, usuarioSedeId);
  }

  @Delete('proveedores/:id')
  eliminarProveedor(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.proveedores.eliminar(id, usuarioSedeId);
  }

  // ── Categorias del almacen de cocina (T-50) ──
  // Taxonomia propia del almacen: nada que ver con las categorias de la carta,
  // que viven en servicio-inventario. COCINA puede leerlas para filtrar.
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @Get('categorias-insumo')
  listarCategoriasInsumo(
    @Query() query: ListarCategoriasInsumoQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.categoriasInsumo.listar(query, usuarioSedeId);
  }

  @Post('categorias-insumo')
  crearCategoriaInsumo(
    @Body() body: CrearCategoriaInsumoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.categoriasInsumo.crear(body, usuarioSedeId, sedeId);
  }

  @Patch('categorias-insumo/:id')
  actualizarCategoriaInsumo(
    @Param('id') id: string,
    @Body() body: ActualizarCategoriaInsumoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.categoriasInsumo.actualizar(id, body, usuarioSedeId);
  }

  @Delete('categorias-insumo/:id')
  eliminarCategoriaInsumo(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.categoriasInsumo.eliminar(id, usuarioSedeId);
  }

  // ── Insumos ──
  // COCINA entra acá (y solo acá, más los dos endpoints de movimiento de abajo)
  // porque para descargar del almacén primero tiene que poder elegir el insumo.
  // El resto de Compras — proveedores, órdenes, costos — le sigue vedado.
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @Get('insumos')
  listarInsumos(@Query() query: ListarInsumosQuery, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.insumos.listar(query, usuarioSedeId);
  }

  @Post('insumos')
  crearInsumo(
    @Body() body: CrearInsumoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.insumos.crear(body, usuarioSedeId, sedeId);
  }

  @Patch('insumos/:id')
  actualizarInsumo(
    @Param('id') id: string,
    @Body() body: ActualizarInsumoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.insumos.actualizar(id, body, usuarioSedeId);
  }

  @Delete('insumos/:id')
  eliminarInsumo(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.insumos.eliminar(id, usuarioSedeId);
  }

  // ── Movimientos de insumo (kardex del almacén de cocina, T-50) ──
  // El Idempotency-Key evita que un doble toque en 3G descargue dos veces lo
  // mismo: sin él, cada reintento del cliente sería un consumo real distinto.
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @UseInterceptors(IdempotencyInterceptor)
  @Post('insumos/:id/movimientos')
  registrarMovimientoInsumo(
    @Param('id') id: string,
    @Body() body: RegistrarMovimientoInsumoCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.movimientos.registrar(id, body, usuarioDe(usuarioId, usuarioNombre, usuarioEmail), usuarioSedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @Get('insumos/:id/movimientos')
  listarMovimientosDeInsumo(
    @Param('id') id: string,
    @Query() query: ListarMovimientosInsumoQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.movimientos.listar({ ...query, insumoId: id }, usuarioSedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @Get('movimientos-insumo/:id')
  obtenerMovimientoInsumo(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.movimientos.obtener(id, usuarioSedeId);
  }

  @Get('movimientos-insumo')
  listarMovimientosInsumo(
    @Query() query: ListarMovimientosInsumoQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.movimientos.listar(query, usuarioSedeId);
  }

  // Cuadre físico en lote: lo cierra administración, no cocina — es el momento
  // en que se acepta oficialmente una diferencia contra el sistema.
  @UseInterceptors(IdempotencyInterceptor)
  @Post('insumos/conteo')
  registrarConteoInsumos(
    @Body() body: RegistrarConteoInsumosCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.movimientos.registrarConteo(
      body,
      usuarioDe(usuarioId, usuarioNombre, usuarioEmail),
      usuarioSedeId,
      sedeId,
    );
  }

  // ── Órdenes de compra ──
  @Get('ordenes')
  listarOrdenes(@Query() query: ListarOrdenesQuery, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.ordenes.listar(query, usuarioSedeId);
  }

  @Get('resumen')
  resumen(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.ordenes.resumen(usuarioSedeId, sedeId);
  }

  @Get('ordenes/:id')
  obtenerOrden(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.ordenes.obtener(id, usuarioSedeId);
  }

  @Post('ordenes')
  @UseInterceptors(IdempotencyInterceptor)
  crearOrden(
    @Body() body: CrearOrdenCompraCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.ordenes.crear(body, usuarioDe(usuarioId, usuarioNombre, usuarioEmail), usuarioSedeId, sedeId);
  }

  @Patch('ordenes/:id')
  actualizarOrden(
    @Param('id') id: string,
    @Body() body: ActualizarOrdenCompraCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.ordenes.actualizar(id, body, usuarioSedeId);
  }

  @Delete('ordenes/:id')
  eliminarOrden(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.ordenes.eliminar(id, usuarioSedeId);
  }

  @Post('ordenes/:id/enviar')
  enviarOrden(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.ordenes.enviar(id, usuarioSedeId);
  }

  @Post('ordenes/:id/cerrar')
  cerrarOrden(
    @Param('id') id: string,
    @Body() body: CerrarOrdenCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.ordenes.cerrar(id, body?.motivo, usuarioSedeId);
  }

  @Post('ordenes/:id/anular')
  anularOrden(
    @Param('id') id: string,
    @Body() body: AnularOrdenCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.ordenes.anular(id, body?.motivo, usuarioSedeId);
  }

  // ── Recepciones ──
  @Get('ordenes/:id/recepciones')
  listarRecepciones(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.recepciones.listarPorOrden(id, usuarioSedeId);
  }

  @Post('ordenes/:id/recepciones')
  @UseInterceptors(IdempotencyInterceptor)
  registrarRecepcion(
    @Param('id') id: string,
    @Body() body: RegistrarRecepcionCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.recepciones.registrar(id, body, usuarioDe(usuarioId, usuarioNombre, usuarioEmail), usuarioSedeId);
  }

  // ── Comprobantes (foto de boleta/factura) ──
  @Get('comprobantes')
  listarComprobantes(@Query() query: ListarComprobantesQuery, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.comprobantes.listar(query, usuarioSedeId);
  }

  @Post('comprobantes')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  subirComprobante(
    @UploadedFile() file: ArchivoSubido | undefined,
    @Body() body: SubirComprobanteCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.comprobantes.subir(file, body, usuarioDe(usuarioId, usuarioNombre, usuarioEmail), usuarioSedeId, sedeId);
  }

  @Get('comprobantes/:id/archivo')
  async archivo(
    @Param('id') id: string,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const c = await this.comprobantes.obtenerComprobante(id, usuarioSedeId);
    this.enviarArchivo(c.rutaArchivo, c.mimeType, c.bytes, c.sha256, `${c.id}.webp`, req, res);
  }

  @Get('comprobantes/:id/miniatura')
  async miniatura(
    @Param('id') id: string,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const c = await this.comprobantes.obtenerComprobante(id, usuarioSedeId);
    const ruta = c.rutaMiniatura ?? c.rutaArchivo;
    this.enviarArchivo(ruta, 'image/webp', undefined, `${c.sha256}-thumb`, `${c.id}_thumb.webp`, req, res);
  }

  // PDF generado bajo demanda (no se persiste, ver ComprobantesService.generarPdf).
  // `inline` (no `attachment`): abrir la URL renderiza el PDF en el visor
  // nativo del navegador — descargarlo es una acción aparte del lado del
  // cliente sobre el mismo blob, no algo que el servidor deba forzar.
  @Get('comprobantes/:id/pdf')
  async pdf(
    @Param('id') id: string,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.comprobantes.generarPdf(id, usuarioSedeId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.length),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.end(buffer);
  }

  @Delete('comprobantes/:id')
  eliminarComprobante(@Param('id') id: string, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.comprobantes.eliminar(id, usuarioSedeId);
  }

  // El archivo es INMUTABLE (editar = borrar + subir de nuevo): `immutable` +
  // `max-age` de un año significa que, tras la primera carga, el navegador ni
  // siquiera vuelve a pedirlo — es lo que hace que la miniatura "cargue rápido".
  private enviarArchivo(
    rutaRelativa: string,
    mimeType: string,
    bytes: number | undefined,
    etagValue: string,
    filename: string,
    req: Request,
    res: Response,
  ): void {
    const etag = `"${etagValue}"`;
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.set({
      'Content-Type': mimeType,
      ...(bytes != null ? { 'Content-Length': String(bytes) } : {}),
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: etag,
      'Content-Disposition': `inline; filename="${filename}"`,
      // Neutraliza el CORP same-origin de helmet: la PWA trae la imagen por
      // fetch (modo CORS) para autenticar con la cookie, no por <img src>.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    createReadStream(this.comprobantes.rutaAbsoluta(rutaRelativa)).pipe(res);
  }
}
