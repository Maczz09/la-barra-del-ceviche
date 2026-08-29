import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fsp } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ComprobanteListResponse, ListarComprobantesQuery, SubirComprobanteCommand } from '@org/contracts';
import { OperableLog } from '@org/observabilidad';
import { resolveSedeId } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { toComprobanteCompraDto } from './compras.mapper';
import { ComprobanteCompra } from '../generated/prisma';

// libvips asigna memoria FUERA del heap de V8: sin esto, bajo el cgroup de
// 512m del contenedor, el arena nativo compite con --max-old-space-size y
// puede terminar en OOM-kill al procesar una foto grande.
sharp.cache(false);
sharp.concurrency(1);

const FORMATOS_VALIDOS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff', 'gif']);

/** `@types/multer` no se carga (tsconfig.app.json fija `types: ["node"]`);
 * se tipa el archivo subido con la forma real que entrega FileInterceptor. */
export interface ArchivoSubido {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class ComprobantesService implements OnModuleInit {
  private readonly logger = new Logger(ComprobantesService.name);
  private readonly dir = process.env.COMPROBANTES_DIR ?? './.data/comprobantes';
  private readonly maxBytes = Number(process.env.COMPROBANTE_MAX_BYTES ?? 12 * 1024 * 1024);
  private readonly maxLado = Number(process.env.COMPROBANTE_MAX_LADO ?? 1600);
  private readonly calidad = Number(process.env.COMPROBANTE_WEBP_QUALITY ?? 72);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.access(this.dir, fsConstants.W_OK);
  }

  rutaAbsoluta(rutaRelativa: string): string {
    return join(this.dir, rutaRelativa);
  }

  async listar(query: ListarComprobantesQuery = {}, usuarioSedeId?: string | null): Promise<ComprobanteListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const comprobantes = await this.prisma.comprobanteCompra.findMany({
      where: {
        sedeId,
        ...(query.ordenId ? { ordenId: query.ordenId } : {}),
        ...(query.recepcionId ? { recepcionId: query.recepcionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: comprobantes.map(toComprobanteCompraDto) };
  }

  async obtenerComprobante(id: string, usuarioSedeId?: string | null): Promise<ComprobanteCompra> {
    const comprobante = await this.prisma.comprobanteCompra.findUnique({ where: { id } });
    if (!comprobante || (usuarioSedeId && comprobante.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Comprobante ${id} no encontrado`);
    }
    return comprobante;
  }

  /**
   * Convierte el WebP guardado a PDF, bajo demanda (no se persiste — el
   * archivo en disco sigue siendo el WebP, que pesa una fracción de lo que
   * pesaría guardar el PDF; regenerarlo en cada pedido es barato: una foto
   * de comprobante son unos pocos cientos de KB).
   *
   * PDF no soporta WebP en ninguno de sus filtros de imagen, así que primero
   * se transcodifica a JPEG con sharp (server-side, ya es dependencia de este
   * servicio); pdf-lib (no jsPDF — pensada para navegador, en Node su
   * addImage() enruta hasta un cargador de archivos que exige permiso de
   * filesystem incluso para bytes en memoria, y su sniffing de formato no
   * reconoce un Buffer/Uint8Array real) arma una página del tamaño exacto de
   * la imagen — sin márgenes ni A4 vacío alrededor.
   */
  async generarPdf(id: string, usuarioSedeId?: string | null): Promise<{ buffer: Buffer; filename: string }> {
    const c = await this.obtenerComprobante(id, usuarioSedeId);
    const webp = await fsp.readFile(this.rutaAbsoluta(c.rutaArchivo));

    const ancho = c.ancho;
    const alto = c.alto;
    const jpeg = await sharp(webp).jpeg({ quality: 85 }).toBuffer();

    const pdfDoc = await PDFDocument.create();
    // Buffer chico → Node lo asigna dentro de su pool compartido de 8 KB
    // (jpeg.byteOffset != 0, jpeg.buffer es TODO el pool, no solo estos
    // bytes). pdf-lib no respeta ese byteOffset al leer el header JPEG y
    // termina mirando bytes de otra asignación — "SOI not found" con un
    // JPEG perfectamente válido. new Uint8Array(jpeg) copia a un buffer
    // propio (byteOffset 0) y lo evita.
    const imagenEmbebida = await pdfDoc.embedJpg(new Uint8Array(jpeg));
    const pagina = pdfDoc.addPage([ancho, alto]);
    pagina.drawImage(imagenEmbebida, { x: 0, y: 0, width: ancho, height: alto });
    const buffer = Buffer.from(await pdfDoc.save());

    const etiqueta = c.serie && c.numero ? `${c.serie}-${c.numero}` : c.id.slice(0, 8);
    return { buffer, filename: `comprobante-${etiqueta}.pdf` };
  }

  async subir(
    archivo: ArchivoSubido | undefined,
    command: SubirComprobanteCommand,
    usuario?: { id: string; nombre: string } | null,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ): Promise<{ message: string; comprobante: ReturnType<typeof toComprobanteCompraDto> }> {
    if (!archivo || !archivo.buffer || archivo.buffer.length === 0) {
      throw new BadRequestException('Sube una foto de la boleta o factura (campo "file")');
    }
    if (archivo.size > this.maxBytes) {
      throw new BadRequestException(`El archivo supera el máximo permitido (${Math.round(this.maxBytes / 1024 / 1024)} MB)`);
    }

    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);

    if (command.ordenId) {
      const orden = await this.prisma.ordenCompra.findUnique({ where: { id: command.ordenId } });
      if (!orden || orden.sedeId !== sedeId) {
        throw new NotFoundException(`Orden de compra ${command.ordenId} no encontrada`);
      }
    }
    if (command.recepcionId) {
      const recepcion = await this.prisma.recepcionCompra.findUnique({ where: { id: command.recepcionId } });
      if (!recepcion || recepcion.sedeId !== sedeId) {
        throw new NotFoundException(`Recepción ${command.recepcionId} no encontrada`);
      }
    }

    const { full, thumb, ancho, alto } = await this.procesarImagen(archivo.buffer);
    const sha256 = createHash('sha256').update(full).digest('hex');

    const id = randomUUID();
    const ahora = new Date();
    // Ruta SIEMPRE con '/': se guarda en la BD y debe ser portable entre el
    // host de desarrollo (Windows) y el contenedor (Linux). `join()` de Node
    // acepta '/' como separador de entrada en ambos sistemas al reconstruirla.
    const carpeta = `${sedeId}/${ahora.getUTCFullYear()}/${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
    const rutaArchivo = `${carpeta}/${id}.webp`;
    const rutaMiniatura = `${carpeta}/${id}_thumb.webp`;

    await fsp.mkdir(this.rutaAbsoluta(carpeta), { recursive: true });
    await fsp.writeFile(this.rutaAbsoluta(rutaArchivo), full);
    await fsp.writeFile(this.rutaAbsoluta(rutaMiniatura), thumb);

    let comprobante: ComprobanteCompra;
    try {
      comprobante = await this.prisma.comprobanteCompra.create({
        data: {
          sedeId,
          ordenId: command.ordenId ?? null,
          recepcionId: command.recepcionId ?? null,
          tipo: command.tipo ?? 'BOLETA',
          serie: command.serie ?? null,
          numero: command.numero ?? null,
          fechaEmision: command.fechaEmision ? new Date(command.fechaEmision) : null,
          montoTotal: command.montoTotal ?? null,
          rutaArchivo,
          rutaMiniatura,
          mimeType: 'image/webp',
          bytes: full.length,
          ancho,
          alto,
          sha256,
          nombreOriginal: archivo.originalname ?? null,
          usuarioId: usuario?.id ?? null,
          usuarioNombre: usuario?.nombre ?? null,
        },
      });
    } catch (error) {
      // Si la fila falla, no dejar huérfanos en disco.
      await fsp.unlink(this.rutaAbsoluta(rutaArchivo)).catch(() => undefined);
      await fsp.unlink(this.rutaAbsoluta(rutaMiniatura)).catch(() => undefined);
      throw error;
    }

    this.logger.log({
      operation: 'subir',
      aggregateId: comprobante.id,
      message: `Comprobante subido (${(full.length / 1024).toFixed(0)} KB, ${ancho}x${alto}).`,
    } satisfies OperableLog);

    return { message: 'Comprobante subido', comprobante: toComprobanteCompraDto(comprobante) };
  }

  async eliminar(id: string, usuarioSedeId?: string | null): Promise<{ message: string }> {
    const comprobante = await this.obtenerComprobante(id, usuarioSedeId);
    await this.prisma.comprobanteCompra.delete({ where: { id } });
    await fsp.unlink(this.rutaAbsoluta(comprobante.rutaArchivo)).catch(() => undefined);
    if (comprobante.rutaMiniatura) {
      await fsp.unlink(this.rutaAbsoluta(comprobante.rutaMiniatura)).catch(() => undefined);
    }
    this.logger.log({
      operation: 'eliminar',
      aggregateId: id,
      message: 'Comprobante eliminado.',
    } satisfies OperableLog);
    return { message: 'Comprobante eliminado' };
  }

  private async procesarImagen(
    buffer: Buffer,
  ): Promise<{ full: Buffer; thumb: Buffer; ancho: number; alto: number }> {
    const base = sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate();

    const meta = await base.metadata().catch(() => null);
    if (!meta?.format || !FORMATOS_VALIDOS.has(meta.format)) {
      throw new BadRequestException('El archivo no es una imagen válida');
    }

    const { data, info } = await base
      .resize({ width: this.maxLado, height: this.maxLado, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: this.calidad, effort: 5, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    const thumb = await sharp(data)
      .resize({ width: 320, height: 320, fit: 'inside' })
      .webp({ quality: 60, effort: 4 })
      .toBuffer();

    return { full: data, thumb, ancho: info.width, alto: info.height };
  }
}
