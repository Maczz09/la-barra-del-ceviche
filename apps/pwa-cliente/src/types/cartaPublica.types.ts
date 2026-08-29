// types/cartaPublica.types.ts — DTOs de la carta pública/QR (sin auth)

import type {
  SedePublicaDto as ContractSedePublicaDto,
  CartaPublicaResponse as ContractCartaPublicaResponse,
} from '@org/contracts';

export type SedePublicaDto = ContractSedePublicaDto;
export type CartaPublicaResponse = ContractCartaPublicaResponse;
