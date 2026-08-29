import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '@org/shared-auth';
import { AppService } from './app.service';

/**
 * Carta pública/QR (T-XX): SIN autenticación — cualquiera con el link o QR
 * la llama. Controller hermano de AppController (que sí exige RolesGuard a
 * nivel de clase) para no tocar su RBAC ni sus tests; acá no hay
 * @UseGuards(RolesGuard) en absoluto, solo el bypass de JwtAuthGuard vía
 * @Public(). El filtrado de qué se expone vive en AppService.listarCartaPublica.
 */
@Controller()
export class PublicCartaController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('carta-publica')
  cartaPublica(@Query('sedeId') sedeId: string) {
    return this.appService.listarCartaPublica(sedeId);
  }
}
