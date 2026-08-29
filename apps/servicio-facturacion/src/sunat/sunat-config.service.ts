import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { CredencialesCryptoService } from './credenciales-crypto.service';

export interface CredencialesSunat {
  pfxBuffer: Buffer;
  pfxPass: string;
  solUsuario: string;
  solClave: string;
}

/**
 * Lee las credenciales SUNAT (certificado .pfx + SOL) de una de las dos
 * empresas por "slot" (1 o 2 — ver Empresa.slot), en dos posibles fuentes:
 *
 * 1. Empresa en la BD (cargadas por el formulario "Configurar SUNAT" de
 *    Facturación, cifradas — ver CredencialesCryptoService). Prioridad si
 *    existen.
 * 2. Variables de entorno / Docker secrets (SUNAT_*_EMPRESA_<slot>_*), el
 *    mecanismo original — sigue funcionando para el despliegue que ya lo usa
 *    así, sin tocar nada.
 *
 * Mientras el cajero/admin no haya configurado el certificado de una empresa
 * por ninguna de las dos vías, `credencialesParaSlot` lanza un error claro en
 * vez de dejar caer todo el servicio: emitir() y EnvioProcessor lo capturan
 * y devuelven "no configurado" sin tumbar el resto de comprobantes.
 */
@Injectable()
export class SunatConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredencialesCryptoService,
  ) {}

  /**
   * Cada valor admite dos formas: `<VAR>` en claro (dev) o `<VAR>_FILE`
   * apuntando a un Docker secret (prod — ver
   * infra/docker-compose.secrets.yml). Mismo idiom que `<VAR>_FILE` en
   * infra/entrypoint.sh, pero autocontenido aquí: no hace falta tocar el
   * entrypoint compartido por los otros 10 servicios para sumar estas 6 vars.
   */
  private leerSecreto(nombreVar: string): string | undefined {
    const archivo = process.env[`${nombreVar}_FILE`];
    if (archivo) {
      try {
        return readFileSync(archivo, 'utf8').trim();
      } catch (error) {
        throw new Error(`No se pudo leer ${nombreVar}_FILE (${archivo}): ${(error as Error).message}`);
      }
    }
    return process.env[nombreVar];
  }

  private async credencialesDesdeBd(slot: number): Promise<CredencialesSunat | null> {
    if (!this.crypto.configurada()) return null;
    const empresa = await this.prisma.empresa.findUnique({ where: { slot } });
    if (!empresa?.solUsuario || !empresa.solClaveCifrada || !empresa.certificadoPfxCifrado || !empresa.certificadoPassCifrada) {
      return null;
    }
    return {
      pfxBuffer: this.crypto.desencriptar(Buffer.from(empresa.certificadoPfxCifrado)),
      pfxPass: this.crypto.desencriptarTexto(empresa.certificadoPassCifrada),
      solUsuario: empresa.solUsuario,
      solClave: this.crypto.desencriptarTexto(empresa.solClaveCifrada),
    };
  }

  private credencialesDesdeEnv(slot: number): CredencialesSunat {
    const pfxFile = process.env[`SUNAT_PFX_EMPRESA_${slot}_FILE`];
    const pfxPass = this.leerSecreto(`SUNAT_PFX_EMPRESA_${slot}_PASS`);
    const solUsuario = this.leerSecreto(`SUNAT_SOL_USER_EMPRESA_${slot}`);
    const solClave = this.leerSecreto(`SUNAT_SOL_PASS_EMPRESA_${slot}`);

    const faltantes = [
      !pfxFile && `SUNAT_PFX_EMPRESA_${slot}_FILE`,
      !pfxPass && `SUNAT_PFX_EMPRESA_${slot}_PASS`,
      !solUsuario && `SUNAT_SOL_USER_EMPRESA_${slot}`,
      !solClave && `SUNAT_SOL_PASS_EMPRESA_${slot}`,
    ].filter(Boolean);

    if (faltantes.length > 0) {
      throw new Error(`Credenciales SUNAT no configuradas para la empresa (slot ${slot}). Faltan: ${faltantes.join(', ')}`);
    }

    let pfxBuffer: Buffer;
    try {
      pfxBuffer = readFileSync(pfxFile as string);
    } catch (error) {
      throw new Error(`No se pudo leer el certificado SUNAT (slot ${slot}) en ${pfxFile}: ${(error as Error).message}`);
    }

    return { pfxBuffer, pfxPass: pfxPass as string, solUsuario: solUsuario as string, solClave: solClave as string };
  }

  async credencialesParaSlot(slot: number): Promise<CredencialesSunat> {
    const desdeBd = await this.credencialesDesdeBd(slot);
    if (desdeBd) return desdeBd;
    return this.credencialesDesdeEnv(slot);
  }

  async tieneCredenciales(slot: number): Promise<boolean> {
    try {
      await this.credencialesParaSlot(slot);
      return true;
    } catch {
      return false;
    }
  }
}
