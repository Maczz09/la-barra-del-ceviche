// @ts-nocheck

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotasService } from './notas.service';
import { PrismaService } from '../prisma/prisma.service';
import { CorrelativoService } from '../sunat/correlativo.service';
import { CertificadoService } from '../sunat/certificado.service';

// Lo que se prueba acá es la lógica de NotasService (validación, resolución
// del comprobante afectado, asignación de correlativo, persistencia) — la
// firma XMLDSig real (xml-crypto + certificado) es responsabilidad de
// firma.ts, ya cubierta indirectamente por la prueba manual contra SUNAT
// beta. Mockearla evita depender de un par de claves real solo para esto.
jest.mock('../sunat/firma', () => ({
  firmarComprobante: jest.fn((xml: string) => `${xml}<!-- firmado -->`),
}));

function empresaBase() {
  return {
    id: 'e-1', slot: 1, ruc: '20123456789', razonSocial: 'La Barra del Ceviche 1 SAC',
    nombreComercial: null, direccion: 'Sede Central', ubigeo: null, codigoEstablecimiento: '0000',
  };
}

function comprobanteAfectadoBase(overrides = {}) {
  return {
    id: 'cf-1', empresaId: 'e-1', tipo: 'FACTURA', serie: 'F001', correlativo: 5,
    estado: 'ACEPTADO', comprobantePagoId: 'cp-1',
    clienteRuc: '20111111111', clienteDni: null, clienteRazonSocial: 'Cliente SAC', clienteNombre: null,
    empresa: empresaBase(),
    ...overrides,
  };
}

describe('NotasService', () => {
  const prisma = {
    comprobante: { findUnique: jest.fn(), create: jest.fn() },
    comprobantePago: { findUnique: jest.fn() },
  };
  const correlativo = { siguienteNota: jest.fn() };
  const certificado = { clavesParaSlot: jest.fn() };

  let service: NotasService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotasService(
      prisma as unknown as PrismaService,
      correlativo as unknown as CorrelativoService,
      certificado as unknown as CertificadoService,
    );
    certificado.clavesParaSlot.mockResolvedValue({ privateKeyPem: 'x', certPem: 'y' });
    correlativo.siguienteNota.mockResolvedValue({ serie: 'FC01', correlativo: 1 });
    prisma.comprobante.create.mockImplementation(({ data }) => Promise.resolve({ id: 'nota-1', ...data }));
  });

  const dtoValido = {
    motivoCodigo: '01',
    items: [{ descripcion: 'Anulación total', cantidad: 1, precioUnitarioConIgv: 70 }],
  };

  it('rechaza motivoCodigo que no existe en el catálogo 09 (nota de crédito)', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase());
    await expect(service.emitirNotaCredito('cf-1', { ...dtoValido, motivoCodigo: '99' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza motivoCodigo que no existe en el catálogo 10 (nota de débito)', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase());
    await expect(service.emitirNotaDebito('cf-1', { ...dtoValido, motivoCodigo: '99' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza si el comprobante afectado no existe', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(null);
    await expect(service.emitirNotaCredito('no-existe', dtoValido)).rejects.toThrow(NotFoundException);
  });

  it('rechaza si el comprobante afectado es de otra sede', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase());
    prisma.comprobantePago.findUnique.mockResolvedValue({ id: 'cp-1', sedeId: 'sede-002' });
    await expect(service.emitirNotaCredito('cf-1', dtoValido, 'sede-001')).rejects.toThrow(NotFoundException);
  });

  it('permite cuando el comprobante afectado es de la sede del cajero', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase());
    prisma.comprobantePago.findUnique.mockResolvedValue({ id: 'cp-1', sedeId: 'sede-001' });
    await expect(service.emitirNotaCredito('cf-1', dtoValido, 'sede-001')).resolves.toBeDefined();
  });

  it('rechaza notar otra nota (solo boleta/factura son notables)', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase({ tipo: 'NOTA_CREDITO' }));
    await expect(service.emitirNotaCredito('cf-1', dtoValido)).rejects.toThrow('otra nota');
  });

  it('rechaza notar un comprobante que SUNAT todavía no aceptó', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase({ estado: 'ENVIADO' }));
    await expect(service.emitirNotaCredito('cf-1', dtoValido)).rejects.toThrow('todavía no fue aceptado');
  });

  it('emite la nota de crédito: usa el tipo de documento afectado (FACTURA) para el correlativo', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase());
    const r = await service.emitirNotaCredito('cf-1', dtoValido);

    expect(correlativo.siguienteNota).toHaveBeenCalledWith('e-1', 'NOTA_CREDITO', 'FACTURA');
    expect(certificado.clavesParaSlot).toHaveBeenCalledWith(1);
    expect(r).toEqual({ id: 'nota-1', tipo: 'NOTA_CREDITO', serie: 'FC01', correlativo: 1 });

    const dataCreada = prisma.comprobante.create.mock.calls[0][0].data;
    expect(dataCreada.comprobanteAfectadoId).toBe('cf-1');
    expect(dataCreada.motivoCodigo).toBe('01');
    expect(dataCreada.motivoDescripcion).toBe('Anulación de la operación');
    expect(dataCreada.estado).toBe('FIRMADO');
    expect(dataCreada.comprobantePagoId).toBeUndefined();
  });

  it('emite la nota de débito con su propio motivo (catálogo 10)', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase());
    correlativo.siguienteNota.mockResolvedValue({ serie: 'FD01', correlativo: 1 });

    const r = await service.emitirNotaDebito('cf-1', { motivoCodigo: '02', items: [{ descripcion: 'Aumento de valor', cantidad: 1, precioUnitarioConIgv: 15 }] });

    expect(correlativo.siguienteNota).toHaveBeenCalledWith('e-1', 'NOTA_DEBITO', 'FACTURA');
    expect(r.tipo).toBe('NOTA_DEBITO');
    const dataCreada = prisma.comprobante.create.mock.calls[0][0].data;
    expect(dataCreada.motivoCodigo).toBe('02');
    expect(dataCreada.motivoDescripcion).toBe('Aumento en el valor');
  });

  it('usa BOLETA como tipo de documento afectado cuando la nota corrige una boleta', async () => {
    prisma.comprobante.findUnique.mockResolvedValue(comprobanteAfectadoBase({ tipo: 'BOLETA', serie: 'B001' }));
    await service.emitirNotaCredito('cf-1', dtoValido);
    expect(correlativo.siguienteNota).toHaveBeenCalledWith('e-1', 'NOTA_CREDITO', 'BOLETA');
  });
});
