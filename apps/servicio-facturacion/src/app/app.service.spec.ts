// @ts-nocheck

jest.mock('../sunat/certificado', () => ({
  extraerClavesDesdePfx: jest.fn(),
}));

import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredencialesCryptoService } from '../sunat/credenciales-crypto.service';
import { extraerClavesDesdePfx } from '../sunat/certificado';

describe('AppService — Facturación', () => {
  const prisma = {
    comprobantePago: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    comprobante: {
      findMany: jest.fn(),
    },
    empresa: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const crypto = {
    configurada: jest.fn().mockReturnValue(true),
    encriptar: jest.fn((buf: Buffer) => Buffer.concat([Buffer.from('enc:'), buf])),
    encriptarTexto: jest.fn((texto: string) => `enc:${texto}`),
  };

  let service: AppService;

  beforeEach(() => {
    jest.clearAllMocks();
    crypto.configurada.mockReturnValue(true);
    service = new AppService(prisma as unknown as PrismaService, crypto as unknown as CredencialesCryptoService);
  });

  describe('registrarComprobantePago', () => {
    it('cae a Sede Principal cuando el evento no trae sedeId (rollout)', async () => {
      await service.registrarComprobantePago({
        cuentaId: 'c-legado', mesaId: 'm-1', total: 50, items: [],
      });

      expect(prisma.comprobantePago.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ sedeId: '00000000-0000-0000-0000-000000000001' }),
        }),
      );
    });

    it('usa el sedeId del evento cuando viene presente', async () => {
      await service.registrarComprobantePago({
        cuentaId: 'c-1', mesaId: 'm-1', sedeId: 'sede-002', total: 50, items: [],
      });

      expect(prisma.comprobantePago.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ sedeId: 'sede-002' }),
        }),
      );
    });

    it('no rescribe sedeId al actualizar (una re-entrega no reasigna la sede)', async () => {
      await service.registrarComprobantePago({
        cuentaId: 'c-1', mesaId: 'm-1', sedeId: 'sede-002', total: 50, items: [],
      });

      expect(prisma.comprobantePago.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.not.objectContaining({ sedeId: expect.anything() }),
        }),
      );
    });
  });

  describe('listarDisponibles — LENIENTE', () => {
    it('usuario pineado: su sede manda, un sedeIdSolicitado distinto se ignora', async () => {
      prisma.comprobantePago.findMany.mockResolvedValue([]);
      await service.listarDisponibles('sede-001', 'sede-otra');
      expect(prisma.comprobantePago.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estado: 'DISPONIBLE', sedeId: 'sede-001' } }),
      );
    });

    it('admin general sin sede → sin filtro de sede (todas)', async () => {
      prisma.comprobantePago.findMany.mockResolvedValue([]);
      await service.listarDisponibles(null);
      expect(prisma.comprobantePago.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estado: 'DISPONIBLE' } }),
      );
    });

    it('admin general con sedeId explícito → filtra por esa sede', async () => {
      prisma.comprobantePago.findMany.mockResolvedValue([]);
      await service.listarDisponibles(null, 'sede-002');
      expect(prisma.comprobantePago.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estado: 'DISPONIBLE', sedeId: 'sede-002' } }),
      );
    });
  });

  describe('listarNotas', () => {
    it('filtra por tipo NOTA_CREDITO/NOTA_DEBITO y ordena por más reciente', async () => {
      prisma.comprobante.findMany.mockResolvedValue([]);
      await service.listarNotas(null);
      expect(prisma.comprobante.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tipo: { in: ['NOTA_CREDITO', 'NOTA_DEBITO'] } },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('usuario pineado: filtra por su sede viajando por el comprobante afectado', async () => {
      prisma.comprobante.findMany.mockResolvedValue([]);
      await service.listarNotas('sede-001');
      expect(prisma.comprobante.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tipo: { in: ['NOTA_CREDITO', 'NOTA_DEBITO'] },
            comprobanteAfectado: { comprobantePago: { sedeId: 'sede-001' } },
          },
        }),
      );
    });

    it('admin general sin sede → sin filtro de sede (todas)', async () => {
      prisma.comprobante.findMany.mockResolvedValue([]);
      await service.listarNotas(null);
      const where = prisma.comprobante.findMany.mock.calls.at(-1)[0].where;
      expect(where).not.toHaveProperty('comprobanteAfectado');
    });
  });

  describe('crearEmpresa', () => {
    const dto = {
      ruc: '20123456786', razonSocial: 'Empresa Demo S.A.C.', nombreComercial: undefined,
      direccion: undefined, ubigeo: undefined, codigoEstablecimiento: undefined,
      solUsuario: 'MODDATOS', solClave: 'clave-sol-secreta', certificadoPass: 'clave-cert-secreta',
    };
    const pfxBuffer = Buffer.from('contenido-p12-simulado');

    it('rechaza si la clave de cifrado del servidor no está configurada', async () => {
      crypto.configurada.mockReturnValue(false);
      await expect(service.crearEmpresa(dto, pfxBuffer)).rejects.toThrow('FACTURACION_CRED_ENCRYPTION_KEY');
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza si no llega el archivo del certificado', async () => {
      await expect(service.crearEmpresa(dto, Buffer.alloc(0))).rejects.toThrow('certificado digital');
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza si ya existe una empresa con ese RUC', async () => {
      prisma.empresa.findUnique.mockResolvedValue({ id: 'e-existente', ruc: dto.ruc });
      await expect(service.crearEmpresa(dto, pfxBuffer)).rejects.toThrow(/Ya existe una empresa/);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza si los 2 slots ya están ocupados', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([{ slot: 1 }, { slot: 2 }]);
      await expect(service.crearEmpresa(dto, pfxBuffer)).rejects.toThrow(/tercera/);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza si el certificado o la contraseña no son válidos', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([]);
      (extraerClavesDesdePfx as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid password / mac verify failure');
      });
      await expect(service.crearEmpresa(dto, pfxBuffer)).rejects.toThrow(/certificado o su contraseña/);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('asigna el slot 1 cuando no hay ninguna empresa, cifra las credenciales y nunca devuelve secretos', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([]);
      (extraerClavesDesdePfx as jest.Mock).mockReturnValue({ privateKeyPem: 'pem', certPem: 'pem' });
      prisma.empresa.create.mockImplementation(({ data }) => ({
        id: 'e-nueva', slot: data.slot, ruc: data.ruc, razonSocial: data.razonSocial, activo: true,
      }));

      const resultado = await service.crearEmpresa(dto, pfxBuffer);

      expect(prisma.empresa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slot: 1,
            ruc: dto.ruc,
            solUsuario: dto.solUsuario,
            solClaveCifrada: 'enc:clave-sol-secreta',
            certificadoPassCifrada: 'enc:clave-cert-secreta',
            codigoEstablecimiento: '0000',
          }) as unknown,
          select: {
            id: true, slot: true, ruc: true, sedeId: true, razonSocial: true, nombreComercial: true,
            direccion: true, ubigeo: true, codigoEstablecimiento: true, solUsuario: true, activo: true,
          },
        }),
      );
      // El .p12 va cifrado (Uint8Array), nunca los bytes en claro.
      const dataEnviada = prisma.empresa.create.mock.calls[0][0].data;
      expect(Buffer.from(dataEnviada.certificadoPfxCifrado).toString()).toBe('enc:contenido-p12-simulado');
      // La respuesta al front no lleva ningún campo cifrado/secreto.
      expect(resultado).toEqual({ id: 'e-nueva', slot: 1, ruc: dto.ruc, razonSocial: dto.razonSocial, activo: true });
    });

    it('rechaza si la sede pedida ya tiene otra empresa enlazada', async () => {
      prisma.empresa.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.sedeId ? { id: 'e-otra', sedeId: 'sede-1' } : null),
      );
      await expect(
        service.crearEmpresa({ ...dto, sedeId: 'sede-1' }, pfxBuffer),
      ).rejects.toThrow(/ya tiene una empresa emisora enlazada/);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('guarda la sede cuando viene y no está ocupada', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([]);
      (extraerClavesDesdePfx as jest.Mock).mockReturnValue({ privateKeyPem: 'pem', certPem: 'pem' });
      prisma.empresa.create.mockImplementation(({ data }) => ({ id: 'e-nueva', ...data }));

      await service.crearEmpresa({ ...dto, sedeId: 'sede-1' }, pfxBuffer);

      expect(prisma.empresa.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sedeId: 'sede-1' }) }),
      );
    });

    it('asigna el slot 2 cuando el slot 1 ya está ocupado', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([{ slot: 1 }]);
      (extraerClavesDesdePfx as jest.Mock).mockReturnValue({ privateKeyPem: 'pem', certPem: 'pem' });
      prisma.empresa.create.mockImplementation(({ data }) => ({ ...data, id: 'e-2' }));

      await service.crearEmpresa(dto, pfxBuffer);

      expect(prisma.empresa.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slot: 2 }) as unknown }),
      );
    });
  });

  describe('listarEmpresas', () => {
    it('lista todas, activas e inactivas — el frontend filtra al elegir con cuál emitir', async () => {
      prisma.empresa.findMany.mockResolvedValue([]);
      await service.listarEmpresas();
      const args = prisma.empresa.findMany.mock.calls.at(-1)[0];
      expect(args.where).toBeUndefined();
      expect(args.orderBy).toEqual({ slot: 'asc' });
    });
  });

  describe('actualizarEmpresa', () => {
    const empresaExistente = { id: 'e-1', ruc: '20123456786', razonSocial: 'Empresa Demo S.A.C.', activo: true };

    it('lanza NotFoundException si la empresa no existe', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(service.actualizarEmpresa('inexistente', {})).rejects.toThrow('Empresa no encontrada');
      expect(prisma.empresa.update).not.toHaveBeenCalled();
    });

    it('actualiza solo los campos de negocio enviados, sin tocar credenciales', async () => {
      prisma.empresa.findUnique.mockResolvedValue(empresaExistente);
      prisma.empresa.update.mockResolvedValue({ ...empresaExistente, razonSocial: 'Nuevo nombre' });

      await service.actualizarEmpresa('e-1', { razonSocial: 'Nuevo nombre' });

      expect(prisma.empresa.update).toHaveBeenCalledWith({
        where: { id: 'e-1' },
        data: { razonSocial: 'Nuevo nombre' },
        select: expect.objectContaining({ id: true, solUsuario: true }) as unknown,
      });
      expect(crypto.encriptarTexto).not.toHaveBeenCalled();
    });

    it('re-cifra la Clave SOL cuando llega solClave', async () => {
      prisma.empresa.findUnique.mockResolvedValue(empresaExistente);
      prisma.empresa.update.mockResolvedValue(empresaExistente);

      await service.actualizarEmpresa('e-1', { solClave: 'clave-nueva' });

      expect(crypto.encriptarTexto).toHaveBeenCalledWith('clave-nueva');
      expect(prisma.empresa.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { solClaveCifrada: 'enc:clave-nueva' } }),
      );
    });

    it('rechaza certificadoPass sin un archivo nuevo', async () => {
      prisma.empresa.findUnique.mockResolvedValue(empresaExistente);
      await expect(
        service.actualizarEmpresa('e-1', { certificadoPass: 'clave-cert' }, Buffer.alloc(0)),
      ).rejects.toThrow(/certificado/);
      expect(prisma.empresa.update).not.toHaveBeenCalled();
    });

    it('rechaza un archivo nuevo sin certificadoPass', async () => {
      prisma.empresa.findUnique.mockResolvedValue(empresaExistente);
      await expect(
        service.actualizarEmpresa('e-1', {}, Buffer.from('contenido-p12')),
      ).rejects.toThrow(/certificado/);
      expect(prisma.empresa.update).not.toHaveBeenCalled();
    });

    it('rechaza un certificado nuevo inválido y no guarda nada', async () => {
      prisma.empresa.findUnique.mockResolvedValue(empresaExistente);
      (extraerClavesDesdePfx as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid password / mac verify failure');
      });

      await expect(
        service.actualizarEmpresa('e-1', { certificadoPass: 'mal' }, Buffer.from('contenido-p12')),
      ).rejects.toThrow(/certificado o su contraseña/);
      expect(prisma.empresa.update).not.toHaveBeenCalled();
    });

    it('valida, cifra y reemplaza el certificado cuando llega uno nuevo junto con su contraseña', async () => {
      prisma.empresa.findUnique.mockResolvedValue(empresaExistente);
      prisma.empresa.update.mockResolvedValue(empresaExistente);
      (extraerClavesDesdePfx as jest.Mock).mockReturnValue({ privateKeyPem: 'pem', certPem: 'pem' });

      await service.actualizarEmpresa('e-1', { certificadoPass: 'clave-cert-nueva' }, Buffer.from('contenido-p12-nuevo'));

      expect(extraerClavesDesdePfx).toHaveBeenCalledWith(Buffer.from('contenido-p12-nuevo'), 'clave-cert-nueva');
      const dataEnviada = prisma.empresa.update.mock.calls[0][0].data;
      expect(dataEnviada.certificadoPassCifrada).toBe('enc:clave-cert-nueva');
      expect(Buffer.from(dataEnviada.certificadoPfxCifrado).toString()).toBe('enc:contenido-p12-nuevo');
    });

    it('enlaza una sede libre a la empresa', async () => {
      prisma.empresa.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.id ? empresaExistente : null),
      );
      prisma.empresa.update.mockResolvedValue({ ...empresaExistente, sedeId: 'sede-1' });

      await service.actualizarEmpresa('e-1', { sedeId: 'sede-1' });

      expect(prisma.empresa.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { sedeId: 'sede-1' } }),
      );
    });

    it('rechaza si la sede pedida ya tiene OTRA empresa enlazada', async () => {
      prisma.empresa.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.id ? empresaExistente : { id: 'e-otra', sedeId: 'sede-1' }),
      );
      await expect(service.actualizarEmpresa('e-1', { sedeId: 'sede-1' })).rejects.toThrow(/ya tiene una empresa emisora enlazada/);
      expect(prisma.empresa.update).not.toHaveBeenCalled();
    });

    it('permite "reenlazar" la misma sede que ya tenía (no choca consigo misma)', async () => {
      const conSede = { ...empresaExistente, sedeId: 'sede-1' };
      prisma.empresa.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.id ? conSede : conSede),
      );
      prisma.empresa.update.mockResolvedValue(conSede);

      await expect(service.actualizarEmpresa('e-1', { sedeId: 'sede-1' })).resolves.toBeDefined();
      expect(prisma.empresa.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { sedeId: 'sede-1' } }),
      );
    });

    it('desvincula la sede cuando llega vacío', async () => {
      prisma.empresa.findUnique.mockResolvedValue(empresaExistente);
      prisma.empresa.update.mockResolvedValue({ ...empresaExistente, sedeId: null });

      await service.actualizarEmpresa('e-1', { sedeId: '' });

      expect(prisma.empresa.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { sedeId: null } }),
      );
    });

    it('rechaza si la clave de cifrado del servidor no está configurada y se intenta cambiar credenciales', async () => {
      prisma.empresa.findUnique.mockResolvedValue(empresaExistente);
      crypto.configurada.mockReturnValue(false);
      await expect(service.actualizarEmpresa('e-1', { solClave: 'x' })).rejects.toThrow('FACTURACION_CRED_ENCRYPTION_KEY');
      expect(prisma.empresa.update).not.toHaveBeenCalled();
    });
  });

  describe('cambiarEstadoEmpresa', () => {
    it('lanza NotFoundException si la empresa no existe', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(service.cambiarEstadoEmpresa('inexistente', false)).rejects.toThrow('Empresa no encontrada');
      expect(prisma.empresa.update).not.toHaveBeenCalled();
    });

    it('desactiva una empresa sin borrar su historial', async () => {
      prisma.empresa.findUnique.mockResolvedValue({ id: 'e-1', ruc: '20123456786', razonSocial: 'Empresa Demo S.A.C.', activo: true });
      prisma.empresa.update.mockResolvedValue({ id: 'e-1', activo: false });

      await service.cambiarEstadoEmpresa('e-1', false);

      expect(prisma.empresa.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'e-1' }, data: { activo: false } }),
      );
    });
  });
});
