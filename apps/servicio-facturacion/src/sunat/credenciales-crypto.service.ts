import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * Cifra/descifra las credenciales SUNAT que un admin sube por el formulario
 * de Facturación (SOL usuario/clave, certificado .p12 y su contraseña) antes
 * de guardarlas en Empresa — nunca en claro en la BD.
 *
 * La clave sale de FACTURACION_CRED_ENCRYPTION_KEY (32 bytes en hex, 64
 * caracteres — generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
 * Deliberadamente NO se valida en el constructor: si no está configurada, el
 * servicio arranca igual (mismo criterio que SunatConfigService con
 * "no configurado") y solo falla si alguien intenta de verdad cifrar/descifrar
 * — no debe tumbar un despliegue que solo usa el mecanismo viejo de secretos
 * de infraestructura y nunca toca este formulario.
 */
@Injectable()
export class CredencialesCryptoService {
  private cachedKey: Buffer | null | undefined;

  private clave(): Buffer {
    if (this.cachedKey !== undefined) {
      if (this.cachedKey === null) {
        throw new Error('FACTURACION_CRED_ENCRYPTION_KEY no configurada o inválida (debe ser hex de 64 caracteres / 32 bytes)');
      }
      return this.cachedKey;
    }
    const raw = process.env.FACTURACION_CRED_ENCRYPTION_KEY;
    if (!raw || !/^[0-9a-f]{64}$/i.test(raw)) {
      this.cachedKey = null;
      throw new Error('FACTURACION_CRED_ENCRYPTION_KEY no configurada o inválida (debe ser hex de 64 caracteres / 32 bytes)');
    }
    this.cachedKey = Buffer.from(raw, 'hex');
    return this.cachedKey;
  }

  configurada(): boolean {
    try {
      this.clave();
      return true;
    } catch {
      return false;
    }
  }

  /** iv (12) + authTag (16) + ciphertext, todo concatenado en un solo Buffer. */
  encriptar(plano: Buffer): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITMO, this.clave(), iv);
    const ciphertext = Buffer.concat([cipher.update(plano), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  desencriptar(payload: Buffer): Buffer {
    const iv = payload.subarray(0, IV_BYTES);
    const authTag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
    const ciphertext = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);
    const decipher = createDecipheriv(ALGORITMO, this.clave(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  encriptarTexto(plano: string): string {
    return this.encriptar(Buffer.from(plano, 'utf8')).toString('base64');
  }

  desencriptarTexto(cifradoBase64: string): string {
    return this.desencriptar(Buffer.from(cifradoBase64, 'base64')).toString('utf8');
  }
}
