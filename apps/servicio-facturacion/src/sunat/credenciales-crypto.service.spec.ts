import { randomBytes } from 'node:crypto';
import { CredencialesCryptoService } from './credenciales-crypto.service';

// Generada en cada corrida (no hardcodeada) — evita cualquier error de
// transcripción de un hex de 64 caracteres y prueba con una clave real.
const CLAVE_VALIDA = randomBytes(32).toString('hex');

describe('CredencialesCryptoService', () => {
  const envOriginal = process.env.FACTURACION_CRED_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.FACTURACION_CRED_ENCRYPTION_KEY = envOriginal;
  });

  describe('sin clave configurada', () => {
    beforeEach(() => {
      delete process.env.FACTURACION_CRED_ENCRYPTION_KEY;
    });

    it('configurada() devuelve false', () => {
      expect(new CredencialesCryptoService().configurada()).toBe(false);
    });

    it('encriptar lanza en vez de tumbar el servicio', () => {
      const service = new CredencialesCryptoService();
      expect(() => service.encriptarTexto('secreto')).toThrow('FACTURACION_CRED_ENCRYPTION_KEY');
    });
  });

  describe('con clave inválida (no hex de 64)', () => {
    beforeEach(() => {
      process.env.FACTURACION_CRED_ENCRYPTION_KEY = 'no-es-hex-valido';
    });

    it('configurada() devuelve false', () => {
      expect(new CredencialesCryptoService().configurada()).toBe(false);
    });
  });

  describe('con clave válida', () => {
    beforeEach(() => {
      process.env.FACTURACION_CRED_ENCRYPTION_KEY = CLAVE_VALIDA;
    });

    it('configurada() devuelve true', () => {
      expect(new CredencialesCryptoService().configurada()).toBe(true);
    });

    it('encripta y desencripta texto (SOL clave / contraseña del certificado) de ida y vuelta', () => {
      const service = new CredencialesCryptoService();
      const cifrado = service.encriptarTexto('MiClaveSol123!');
      expect(cifrado).not.toContain('MiClaveSol123');
      expect(service.desencriptarTexto(cifrado)).toBe('MiClaveSol123!');
    });

    it('encripta y desencripta bytes binarios (el .p12) de ida y vuelta', () => {
      const service = new CredencialesCryptoService();
      const pfxSimulado = Buffer.from([0x30, 0x82, 0x01, 0x02, 0x00, 0xff, 0x7f]);
      const cifrado = service.encriptar(pfxSimulado);
      expect(cifrado).not.toEqual(pfxSimulado);
      expect(service.desencriptar(cifrado)).toEqual(pfxSimulado);
    });

    it('dos cifrados del mismo texto dan resultados distintos (IV aleatorio) pero ambos descifran igual', () => {
      const service = new CredencialesCryptoService();
      const a = service.encriptarTexto('igual');
      const b = service.encriptarTexto('igual');
      expect(a).not.toBe(b);
      expect(service.desencriptarTexto(a)).toBe('igual');
      expect(service.desencriptarTexto(b)).toBe('igual');
    });

    it('rechaza un ciphertext manipulado (autenticación GCM)', () => {
      const service = new CredencialesCryptoService();
      const cifrado = service.encriptar(Buffer.from('dato sensible'));
      const manipulado = Buffer.from(cifrado);
      manipulado[manipulado.length - 1] ^= 0xff; // voltea el último byte del ciphertext
      expect(() => service.desencriptar(manipulado)).toThrow();
    });
  });
});
