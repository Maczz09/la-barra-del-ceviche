// @ts-nocheck

import { NotFoundException } from '@nestjs/common';
import { EmisionService } from './emision.service';
import { PrismaService } from '../prisma/prisma.service';
import { CorrelativoService } from '../sunat/correlativo.service';
import { CertificadoService } from '../sunat/certificado.service';

describe('EmisionService — sede (T-23 Fase 2)', () => {
  const prisma = {
    comprobantePago: { findUnique: jest.fn() },
    empresa: { findUnique: jest.fn() },
  };

  let service: EmisionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmisionService(
      prisma as unknown as PrismaService,
      {} as unknown as CorrelativoService,
      {} as unknown as CertificadoService,
    );
  });

  it('rechaza con NotFound si el comprobante de pago es de otra sede (cajero pineado)', async () => {
    prisma.comprobantePago.findUnique.mockResolvedValue({
      id: 'cp-1', cuentaId: 'c-1', sedeId: 'sede-002', estado: 'DISPONIBLE',
    });

    await expect(
      service.emitir('c-1', { tipoComprobante: 'BOLETA' } as never, 'sede-001'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.empresa.findUnique).not.toHaveBeenCalled();
  });

  it('permite emitir cuando el comprobante de pago es de la sede del cajero', async () => {
    prisma.comprobantePago.findUnique.mockResolvedValue({
      id: 'cp-1', cuentaId: 'c-1', sedeId: 'sede-001', estado: 'DISPONIBLE',
    });
    prisma.empresa.findUnique.mockResolvedValue(null);

    // Falla más adelante (empresa no configurada) pero YA pasó el guard de sede.
    await expect(
      service.emitir('c-1', { tipoComprobante: 'BOLETA', empresaRuc: '20123456789' } as never, 'sede-001'),
    ).rejects.toThrow('no está configurada');
  });

  it('el admin general (sin sede fija) puede emitir para cualquier sede', async () => {
    prisma.comprobantePago.findUnique.mockResolvedValue({
      id: 'cp-1', cuentaId: 'c-1', sedeId: 'sede-002', estado: 'DISPONIBLE',
    });
    prisma.empresa.findUnique.mockResolvedValue(null);

    await expect(
      service.emitir('c-1', { tipoComprobante: 'BOLETA', empresaRuc: '20123456789' } as never, null),
    ).rejects.toThrow('no está configurada');
  });

  it('rechaza un RUC enlazado a otra sede aunque el usuario sea admin general', async () => {
    prisma.comprobantePago.findUnique.mockResolvedValue({
      id: 'cp-1', cuentaId: 'c-1', sedeId: 'sede-001', estado: 'DISPONIBLE',
    });
    prisma.empresa.findUnique.mockResolvedValue({
      id: 'e-2', ruc: '20999999999', sedeId: 'sede-002', activo: true,
    });

    await expect(
      service.emitir('c-1', { tipoComprobante: 'BOLETA', empresaRuc: '20999999999' } as never, null),
    ).rejects.toThrow(/debe estar enlazado a la sede/);
  });
});
