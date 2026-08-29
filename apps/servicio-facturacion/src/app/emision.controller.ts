import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { EmisionService } from './emision.service';
import { NotasService } from './notas.service';
import { EmitirComprobanteDto } from './dto/emitir-comprobante.dto';
import { EmitirNotaDto } from './dto/emitir-nota.dto';

// Solo caja/admin deciden qué comprobante de pago sube como boleta o factura
// electrónica (y con qué RUC emisor, cuando hay dos empresas operando).
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO')
@Controller('comprobantes')
export class EmisionController {
  constructor(
    private readonly emisionService: EmisionService,
    private readonly notasService: NotasService,
  ) {}

  @Post(':cuentaId/emitir')
  emitir(
    @Param('cuentaId') cuentaId: string,
    @Body() dto: EmitirComprobanteDto,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.emisionService.emitir(cuentaId, dto, usuarioSedeId);
  }

  // :comprobanteId acá es el id del Comprobante (boleta/factura) que se
  // corrige — no el cuentaId de :cuentaId/emitir arriba.
  @Post(':comprobanteId/nota-credito')
  emitirNotaCredito(
    @Param('comprobanteId') comprobanteId: string,
    @Body() dto: EmitirNotaDto,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.notasService.emitirNotaCredito(comprobanteId, dto, usuarioSedeId);
  }

  @Post(':comprobanteId/nota-debito')
  emitirNotaDebito(
    @Param('comprobanteId') comprobanteId: string,
    @Body() dto: EmitirNotaDto,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
  ) {
    return this.notasService.emitirNotaDebito(comprobanteId, dto, usuarioSedeId);
  }
}
