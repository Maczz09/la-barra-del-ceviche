import { Injectable } from '@nestjs/common';
import { SunatConfigService } from './sunat-config.service';
import { extraerClavesDesdePfx, ClavesFirma } from './certificado';

/** Cachea las claves ya extraídas por slot: parsear el .pfx en cada emisión es innecesario. */
@Injectable()
export class CertificadoService {
  private readonly cache = new Map<number, ClavesFirma>();

  constructor(private readonly config: SunatConfigService) {}

  async clavesParaSlot(slot: number): Promise<ClavesFirma> {
    const cached = this.cache.get(slot);
    if (cached) return cached;
    const creds = await this.config.credencialesParaSlot(slot);
    const claves = extraerClavesDesdePfx(creds.pfxBuffer, creds.pfxPass);
    this.cache.set(slot, claves);
    return claves;
  }
}
