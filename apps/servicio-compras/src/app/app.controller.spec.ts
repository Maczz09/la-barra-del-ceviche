// @ts-nocheck

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(() => ({ pipe: jest.fn() })),
}));

import { createReadStream } from 'node:fs';
import { AppController } from './app.controller';

function mockRes() {
  return { set: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn() };
}

describe('AppController (servicio-compras)', () => {
  let controller: AppController;
  let proveedores: any;
  let insumos: any;
  let movimientos: any;
  let categoriasInsumo: any;
  let ordenes: any;
  let recepciones: any;
  let comprobantes: any;

  beforeEach(() => {
    proveedores = { listar: jest.fn(), crear: jest.fn(), actualizar: jest.fn(), eliminar: jest.fn() };
    insumos = { listar: jest.fn(), crear: jest.fn(), actualizar: jest.fn(), eliminar: jest.fn() };
    movimientos = { registrar: jest.fn(), listar: jest.fn(), obtener: jest.fn(), registrarConteo: jest.fn() };
    categoriasInsumo = { listar: jest.fn(), crear: jest.fn(), actualizar: jest.fn(), eliminar: jest.fn() };
    ordenes = {
      listar: jest.fn(), obtener: jest.fn(), crear: jest.fn(), actualizar: jest.fn(), eliminar: jest.fn(),
      enviar: jest.fn(), cerrar: jest.fn(), anular: jest.fn(), resumen: jest.fn(),
    };
    recepciones = { listarPorOrden: jest.fn(), registrar: jest.fn() };
    comprobantes = { listar: jest.fn(), subir: jest.fn(), obtenerComprobante: jest.fn(), eliminar: jest.fn(), rutaAbsoluta: jest.fn((r: string) => `/data/comprobantes/${r}`) };

    controller = new AppController(proveedores, insumos, categoriasInsumo, movimientos, ordenes, recepciones, comprobantes);
    jest.clearAllMocks();
  });

  it('listarProveedores delega en ProveedoresService con la sede del usuario', async () => {
    await controller.listarProveedores({}, 'sede-001');
    expect(proveedores.listar).toHaveBeenCalledWith({}, 'sede-001');
  });

  it('crearInsumo delega en InsumosService con el sedeId del query', async () => {
    await controller.crearInsumo({ nombre: 'X', unidad: 'kg' }, null, 'sede-002');
    expect(insumos.crear).toHaveBeenCalledWith({ nombre: 'X', unidad: 'kg' }, null, 'sede-002');
  });

  describe('crearOrden', () => {
    it('resuelve el usuario autenticado (id + nombre) antes de delegar', async () => {
      const body = { proveedorNombre: 'X', items: [] };
      await controller.crearOrden(body, 'u-1', 'Ana', null, 'sede-001', undefined);
      expect(ordenes.crear).toHaveBeenCalledWith(body, { id: 'u-1', nombre: 'Ana' }, 'sede-001', undefined);
    });

    it('cae a email y luego a usuarioId si falta el nombre', async () => {
      const body = { proveedorNombre: 'X', items: [] };
      await controller.crearOrden(body, 'u-1', null, 'a@x.pe', 'sede-001');
      expect(ordenes.crear).toHaveBeenCalledWith(body, { id: 'u-1', nombre: 'a@x.pe' }, 'sede-001', undefined);

      await controller.crearOrden(body, 'svc', null, null, null);
      expect(ordenes.crear).toHaveBeenCalledWith(body, { id: 'svc', nombre: 'svc' }, null, undefined);
    });

    it('usuario null cuando no hay sesión autenticada', async () => {
      const body = { proveedorNombre: 'X', items: [] };
      await controller.crearOrden(body, null, null, null, 'sede-001');
      expect(ordenes.crear).toHaveBeenCalledWith(body, null, 'sede-001', undefined);
    });
  });

  it('enviarOrden / cerrarOrden / anularOrden delegan con id y motivo', async () => {
    await controller.enviarOrden('oc-1', 'sede-001');
    expect(ordenes.enviar).toHaveBeenCalledWith('oc-1', 'sede-001');

    await controller.cerrarOrden('oc-1', { motivo: 'faltante' }, 'sede-001');
    expect(ordenes.cerrar).toHaveBeenCalledWith('oc-1', 'faltante', 'sede-001');

    await controller.anularOrden('oc-1', {}, 'sede-001');
    expect(ordenes.anular).toHaveBeenCalledWith('oc-1', undefined, 'sede-001');
  });

  it('registrarRecepcion resuelve el usuario y delega en RecepcionesService', async () => {
    const body = { items: [{ ordenItemId: 'it-1', cantidadRecibida: 5 }] };
    await controller.registrarRecepcion('oc-1', body, 'u-1', 'Ana', null, 'sede-001');
    expect(recepciones.registrar).toHaveBeenCalledWith('oc-1', body, { id: 'u-1', nombre: 'Ana' }, 'sede-001');
  });

  it('subirComprobante delega el archivo y el body en ComprobantesService', async () => {
    const file = { buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', size: 1 };
    await controller.subirComprobante(file, { tipo: 'BOLETA' }, 'u-1', 'Ana', null, 'sede-001', undefined);
    expect(comprobantes.subir).toHaveBeenCalledWith(file, { tipo: 'BOLETA' }, { id: 'u-1', nombre: 'Ana' }, 'sede-001', undefined);
  });

  describe('archivo / miniatura', () => {
    it('transmite el archivo con headers de caché inmutable y ETag', async () => {
      comprobantes.obtenerComprobante.mockResolvedValue({ id: 'cp-1', rutaArchivo: 'sede-001/2026/06/cp-1.webp', mimeType: 'image/webp', bytes: 1234, sha256: 'abc123' });
      const req = { headers: {} };
      const res = mockRes();

      await controller.archivo('cp-1', 'sede-001', req, res);

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'image/webp',
          'Content-Length': '1234',
          ETag: '"abc123"',
          'Cache-Control': expect.stringContaining('immutable'),
        }),
      );
      expect(createReadStream).toHaveBeenCalledWith('/data/comprobantes/sede-001/2026/06/cp-1.webp');
    });

    it('responde 304 sin volver a leer el disco cuando If-None-Match coincide', async () => {
      comprobantes.obtenerComprobante.mockResolvedValue({ id: 'cp-1', rutaArchivo: 'x.webp', mimeType: 'image/webp', bytes: 10, sha256: 'abc123' });
      const req = { headers: { 'if-none-match': '"abc123"' } };
      const res = mockRes();

      await controller.archivo('cp-1', 'sede-001', req, res);

      expect(res.status).toHaveBeenCalledWith(304);
      expect(res.end).toHaveBeenCalled();
      expect(createReadStream).not.toHaveBeenCalled();
    });

    it('miniatura usa rutaMiniatura cuando existe', async () => {
      comprobantes.obtenerComprobante.mockResolvedValue({ id: 'cp-1', rutaArchivo: 'x.webp', rutaMiniatura: 'x_thumb.webp', mimeType: 'image/webp', sha256: 'abc123' });
      const req = { headers: {} };
      const res = mockRes();

      await controller.miniatura('cp-1', 'sede-001', req, res);

      expect(createReadStream).toHaveBeenCalledWith('/data/comprobantes/x_thumb.webp');
    });
  });

  it('eliminarComprobante delega en ComprobantesService', async () => {
    await controller.eliminarComprobante('cp-1', 'sede-001');
    expect(comprobantes.eliminar).toHaveBeenCalledWith('cp-1', 'sede-001');
  });
});
