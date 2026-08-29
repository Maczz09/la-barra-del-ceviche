import { SunatConfigService } from './sunat-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredencialesCryptoService } from './credenciales-crypto.service';

describe('SunatConfigService', () => {
  const prisma = { empresa: { findUnique: jest.fn() } };
  const crypto = {
    configurada: jest.fn(),
    desencriptar: jest.fn(),
    desencriptarTexto: jest.fn(),
  };
  const envOriginal = { ...process.env };

  let service: SunatConfigService;

  const VARS_SUNAT = [1, 2].flatMap((slot) => [
    `SUNAT_PFX_EMPRESA_${slot}_FILE`, `SUNAT_PFX_EMPRESA_${slot}_PASS`,
    `SUNAT_SOL_USER_EMPRESA_${slot}`, `SUNAT_SOL_PASS_EMPRESA_${slot}`,
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...envOriginal };
    // Base limpia y determinista: nada de SUNAT_* por variables de entorno,
    // sin depender de qué haya (o no) en el ambiente real donde corre el test.
    for (const v of VARS_SUNAT) delete process.env[v];
    service = new SunatConfigService(prisma as unknown as PrismaService, crypto as unknown as CredencialesCryptoService);
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  describe('prioridad: BD sobre variables de entorno', () => {
    it('usa las credenciales de la BD cuando la empresa las tiene y la clave del servidor está configurada', async () => {
      crypto.configurada.mockReturnValue(true);
      prisma.empresa.findUnique.mockResolvedValue({
        solUsuario: 'MODDATOS',
        solClaveCifrada: 'cif-clave-sol',
        certificadoPfxCifrado: Buffer.from('pfx-cifrado'),
        certificadoPassCifrada: 'cif-clave-cert',
      });
      crypto.desencriptar.mockReturnValue(Buffer.from('pfx-real'));
      crypto.desencriptarTexto.mockImplementation((v: string) => (v === 'cif-clave-sol' ? 'clave-sol-real' : 'clave-cert-real'));

      const creds = await service.credencialesParaSlot(1);

      expect(creds).toEqual({
        pfxBuffer: Buffer.from('pfx-real'),
        pfxPass: 'clave-cert-real',
        solUsuario: 'MODDATOS',
        solClave: 'clave-sol-real',
      });
      expect(prisma.empresa.findUnique).toHaveBeenCalledWith({ where: { slot: 1 } });
    });

    it('cae a variables de entorno si la clave de cifrado del servidor no está configurada, aunque la empresa tenga credenciales en la BD', async () => {
      crypto.configurada.mockReturnValue(false);

      await expect(service.credencialesParaSlot(1)).rejects.toThrow('Credenciales SUNAT no configuradas');
      // Nunca llegó a consultar la empresa: corta apenas ve que no hay clave de cifrado.
      expect(prisma.empresa.findUnique).not.toHaveBeenCalled();
    });

    it('cae a variables de entorno si la empresa no tiene credenciales en la BD (solo alguna columna, no todas)', async () => {
      crypto.configurada.mockReturnValue(true);
      prisma.empresa.findUnique.mockResolvedValue({
        solUsuario: 'MODDATOS',
        solClaveCifrada: null, // incompleto
        certificadoPfxCifrado: null,
        certificadoPassCifrada: null,
      });

      await expect(service.credencialesParaSlot(2)).rejects.toThrow('Credenciales SUNAT no configuradas');
      expect(crypto.desencriptar).not.toHaveBeenCalled();
    });

    it('cae a variables de entorno si no existe ninguna empresa para ese slot', async () => {
      crypto.configurada.mockReturnValue(true);
      prisma.empresa.findUnique.mockResolvedValue(null);

      await expect(service.credencialesParaSlot(2)).rejects.toThrow('Credenciales SUNAT no configuradas');
    });
  });

  describe('tieneCredenciales', () => {
    it('devuelve true si hay credenciales (BD o env) y false si ninguna fuente las tiene', async () => {
      crypto.configurada.mockReturnValue(true);
      prisma.empresa.findUnique.mockResolvedValue({
        solUsuario: 'MODDATOS', solClaveCifrada: 'x', certificadoPfxCifrado: Buffer.from('y'), certificadoPassCifrada: 'z',
      });
      crypto.desencriptar.mockReturnValue(Buffer.from('pfx'));
      crypto.desencriptarTexto.mockReturnValue('valor');

      expect(await service.tieneCredenciales(1)).toBe(true);

      crypto.configurada.mockReturnValue(false);
      prisma.empresa.findUnique.mockResolvedValue(null);
      expect(await service.tieneCredenciales(2)).toBe(false);
    });
  });
});
