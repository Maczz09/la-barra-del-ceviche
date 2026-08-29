// @ts-nocheck

jest.mock('node:fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('webp-original')),
  },
  constants: { W_OK: 2 },
}));

jest.mock('sharp', () => {
  const chain = {
    rotate: jest.fn().mockReturnThis(),
    metadata: jest.fn(),
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn(),
  };
  const sharpMock: any = jest.fn(() => chain);
  sharpMock.cache = jest.fn();
  sharpMock.concurrency = jest.fn();
  sharpMock.__chain = chain;
  return { __esModule: true, default: sharpMock };
});

import sharp from 'sharp';
import { promises as fsp } from 'node:fs';
import { ComprobantesService } from './comprobantes.service';
import { PrismaService } from '../prisma/prisma.service';

const chain = (sharp as unknown as { __chain: Record<string, jest.Mock> }).__chain;

const SEDE = 'sede-001';
const OTRA_SEDE = 'sede-002';

function mockArchivo(overrides: Record<string, unknown> = {}) {
  return {
    buffer: Buffer.from('foto-original-simulada'),
    originalname: 'boleta.jpg',
    mimetype: 'image/jpeg',
    size: 23,
    ...overrides,
  };
}

function setImagenValida(fullBytes = 'webp-comprimido', ancho = 800, alto = 600) {
  chain.metadata.mockResolvedValue({ format: 'jpeg' });
  chain.toBuffer
    .mockResolvedValueOnce({ data: Buffer.from(fullBytes), info: { width: ancho, height: alto } })
    .mockResolvedValueOnce(Buffer.from('thumb-comprimido'));
}

describe('ComprobantesService', () => {
  let service: ComprobantesService;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = {
      ordenCompra: { findUnique: jest.fn() },
      recepcionCompra: { findUnique: jest.fn() },
      comprobanteCompra: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    };
    service = new ComprobantesService(mockPrisma as unknown as PrismaService);
  });

  describe('subir', () => {
    it('rechaza si no llega ningún archivo', async () => {
      await expect(service.subir(undefined, {}, null, SEDE)).rejects.toThrow('Sube una foto');
    });

    it('rechaza un archivo que no es una imagen válida', async () => {
      chain.metadata.mockResolvedValue({ format: 'pdf' });
      await expect(service.subir(mockArchivo(), {}, null, SEDE)).rejects.toThrow('no es una imagen válida');
    });

    it('guarda siempre como image/webp, sin importar el formato de entrada', async () => {
      setImagenValida();
      mockPrisma.comprobanteCompra.create.mockImplementation(({ data }: any) => ({ id: 'cp-001', ...data, createdAt: new Date() }));

      const result = await service.subir(mockArchivo({ mimetype: 'image/png' }), { tipo: 'BOLETA' }, null, SEDE);

      expect(result.comprobante.mimeType).toBe('image/webp');
      expect(mockPrisma.comprobanteCompra.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mimeType: 'image/webp', bytes: Buffer.from('webp-comprimido').length, ancho: 800, alto: 600 }) }),
      );
    });

    it('deriva la ruta como <sede>/<año>/<mes>/<id>.webp, sin usar el nombre original del archivo', async () => {
      setImagenValida();
      mockPrisma.comprobanteCompra.create.mockImplementation(({ data }: any) => ({ id: 'cp-002', ...data, createdAt: new Date() }));

      await service.subir(mockArchivo({ originalname: '../../etc/passwd' }), {}, null, SEDE);

      const llamada = mockPrisma.comprobanteCompra.create.mock.calls[0][0];
      expect(llamada.data.rutaArchivo).toMatch(
        new RegExp(`^${SEDE}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.webp$`),
      );
      expect(llamada.data.nombreOriginal).toBe('../../etc/passwd');
      expect(llamada.data.rutaArchivo).not.toContain('..');
    });

    it('valida que ordenId pertenezca a la sede resuelta', async () => {
      setImagenValida();
      mockPrisma.ordenCompra.findUnique.mockResolvedValue({ id: 'oc-1', sedeId: OTRA_SEDE });
      await expect(service.subir(mockArchivo(), { ordenId: 'oc-1' }, null, SEDE)).rejects.toThrow('no encontrada');
    });

    it('borra los archivos escritos en disco si la fila de la BD falla', async () => {
      setImagenValida();
      mockPrisma.comprobanteCompra.create.mockRejectedValue(new Error('db down'));

      await expect(service.subir(mockArchivo(), {}, null, SEDE)).rejects.toThrow('db down');
      expect(fsp.unlink).toHaveBeenCalledTimes(2);
    });
  });

  describe('obtenerComprobante', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.comprobanteCompra.findUnique.mockResolvedValue(null);
      await expect(service.obtenerComprobante('inexistente', SEDE)).rejects.toThrow('no encontrado');
    });

    it('un usuario pineado no puede leer un comprobante de otra sede', async () => {
      mockPrisma.comprobanteCompra.findUnique.mockResolvedValue({ id: 'cp-1', sedeId: OTRA_SEDE });
      await expect(service.obtenerComprobante('cp-1', SEDE)).rejects.toThrow('no encontrado');
    });
  });

  describe('eliminar', () => {
    it('borra la fila y ambos archivos del disco', async () => {
      mockPrisma.comprobanteCompra.findUnique.mockResolvedValue({
        id: 'cp-1', sedeId: SEDE, rutaArchivo: `${SEDE}/2026/06/cp-1.webp`, rutaMiniatura: `${SEDE}/2026/06/cp-1_thumb.webp`,
      });
      const result = await service.eliminar('cp-1', SEDE);
      expect(mockPrisma.comprobanteCompra.delete).toHaveBeenCalledWith({ where: { id: 'cp-1' } });
      expect(fsp.unlink).toHaveBeenCalledTimes(2);
      expect(result.message).toBe('Comprobante eliminado');
    });
  });

  describe('generarPdf', () => {
    // sharp está mockeado a nivel de archivo para el resto del describe;
    // pdf-lib sí valida los bytes reales del header JPEG (SOI) al embeberlos,
    // así que el "JPEG transcodificado" que devuelve el mock necesita ser un
    // JPEG de verdad — se genera una vez con el sharp real (jest.requireActual,
    // sin pasar por el mock del módulo). Buffer.from(...) al final es
    // necesario, no cosmético: sharp es un módulo nativo y el Buffer que
    // devuelve no pasa los `instanceof Uint8Array` de pdf-lib a través del
    // sandbox de VM de Jest (Buffer.isBuffer sí lo reconoce, instanceof no) —
    // Buffer.from() lo reconstruye con el Buffer del realm de este archivo.
    let jpegReal: Buffer;
    beforeAll(async () => {
      const sharpReal = jest.requireActual<typeof sharp>('sharp');
      const bytes = await sharpReal({ create: { width: 2, height: 2, channels: 3, background: { r: 200, g: 40, b: 40 } } })
        .jpeg()
        .toBuffer();
      jpegReal = Buffer.from(bytes);
    });

    // chain.toBuffer es compartido con los tests de subir() de arriba, que
    // encolan respuestas con .mockResolvedValueOnce(...) — jest.clearAllMocks()
    // del beforeEach de todo el describe NO vacía esa cola (solo mockReset()
    // lo hace), así que sin este mockReset() estos tests podían terminar
    // consumiendo un valor encolado y no consumido de un test anterior en vez
    // del jpegReal que se les pide acá.
    beforeEach(() => {
      chain.toBuffer.mockReset();
    });

    it('lee el WebP del disco, lo transcodifica a JPEG y arma un PDF válido del tamaño de la imagen', async () => {
      mockPrisma.comprobanteCompra.findUnique.mockResolvedValue({
        id: 'cp-1', sedeId: SEDE, rutaArchivo: `${SEDE}/2026/06/cp-1.webp`, ancho: 100, alto: 60, serie: 'F001', numero: '123',
      });
      (fsp.readFile as jest.Mock).mockResolvedValue(Buffer.from('webp-original'));
      chain.toBuffer.mockResolvedValue(jpegReal);

      const { buffer, filename } = await service.generarPdf('cp-1', SEDE);

      // path.join normaliza al separador nativo del SO (\ en Windows, / en
      // Linux/CI) — se compara por componentes, no por string exacto.
      expect(fsp.readFile).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${SEDE}[\\\\/]2026[\\\\/]06[\\\\/]cp-1\\.webp$`)) as unknown as string);
      expect(chain.jpeg).toHaveBeenCalledWith({ quality: 85 });
      expect(filename).toBe('comprobante-F001-123.pdf');
      // %PDF-1.x es el header estándar de cualquier PDF válido.
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('usa los primeros 8 caracteres del id como nombre de archivo si no hay serie/número', async () => {
      mockPrisma.comprobanteCompra.findUnique.mockResolvedValue({
        id: 'cp-sin-serie-1234', sedeId: SEDE, rutaArchivo: `${SEDE}/2026/06/x.webp`, ancho: 50, alto: 50, serie: null, numero: null,
      });
      chain.toBuffer.mockResolvedValue(jpegReal);

      const { filename } = await service.generarPdf('cp-sin-serie-1234', SEDE);

      expect(filename).toBe('comprobante-cp-sin-s.pdf');
    });

    it('un usuario pineado no puede generar el PDF de un comprobante de otra sede', async () => {
      mockPrisma.comprobanteCompra.findUnique.mockResolvedValue({ id: 'cp-1', sedeId: OTRA_SEDE });
      await expect(service.generarPdf('cp-1', SEDE)).rejects.toThrow('no encontrado');
    });
  });
});
