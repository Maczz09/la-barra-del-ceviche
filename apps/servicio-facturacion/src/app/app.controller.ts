import { Body, Controller, Get, Logger, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles, RolesGuard } from '@org/shared-auth';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { OperableLog, UsuarioActual } from '@org/observabilidad';
import { AppService } from './app.service';
import { CrearEmpresaDto } from './dto/crear-empresa.dto';
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto';
import { CambiarEstadoEmpresaDto } from './dto/cambiar-estado-empresa.dto';
import { CuentaCerradaPayload, RoutingKeys } from '@org/contracts';

// El .p12 de un certificado SUNAT real pesa unos pocos KB — 2 MB es margen
// generoso, no un límite real que alguien vaya a rozar.
const MAX_CERTIFICADO_BYTES = 2 * 1024 * 1024;

// RBAC por método: el controller también atiende el evento RMQ (@EventPattern),
// por eso el guard de roles no va a nivel de clase (mismo patrón que reportes).
@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  healthCheck() {
    return { status: 'OK', service: 'Facturacion' };
  }

  // Listado para el selector de caja/admin: "¿qué comprobante de pago subo
  // como boleta o factura?".
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO')
  @Get('comprobantes-pago')
  listarDisponibles(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.appService.listarDisponibles(usuarioSedeId, sedeId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO')
  @Get('comprobantes-pago/todos')
  listarTodos(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.appService.listarTodos(usuarioSedeId, sedeId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO')
  @Get('notas')
  listarNotas(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.appService.listarNotas(usuarioSedeId, sedeId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO')
  @Get('empresas')
  listarEmpresas() {
    return this.appService.listarEmpresas();
  }

  // Configurar SUNAT (RUC + credenciales SOL + certificado): solo admin —
  // más sensible que emitir un comprobante, por eso no incluye CAJERO acá
  // (a diferencia de EmisionController).
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA')
  @Post('empresas')
  @UseInterceptors(FileInterceptor('certificado', { storage: memoryStorage(), limits: { fileSize: MAX_CERTIFICADO_BYTES, files: 1 } }))
  crearEmpresa(@Body() dto: CrearEmpresaDto, @UploadedFile() certificado?: { buffer: Buffer }) {
    return this.appService.crearEmpresa(dto, certificado?.buffer ?? Buffer.alloc(0));
  }

  // Edición de una empresa ya configurada: datos de negocio, Clave SOL y/o
  // certificado (todo opcional/parcial). El RUC no viaja acá — no es
  // editable, ver ActualizarEmpresaDto.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA')
  @Patch('empresas/:id')
  @UseInterceptors(FileInterceptor('certificado', { storage: memoryStorage(), limits: { fileSize: MAX_CERTIFICADO_BYTES, files: 1 } }))
  actualizarEmpresa(
    @Param('id') id: string,
    @Body() dto: ActualizarEmpresaDto,
    @UploadedFile() certificado?: { buffer: Buffer },
  ) {
    return this.appService.actualizarEmpresa(id, dto, certificado?.buffer);
  }

  // Activar/desactivar sin borrar — endpoint angosto y separado del PATCH de
  // arriba (mismo criterio que CambiarEstadoUsuarioCommand en identidad):
  // no es multipart, se puede togglear desde una fila de tabla sin abrir el
  // modal de edición completo.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA')
  @Patch('empresas/:id/estado')
  cambiarEstadoEmpresa(@Param('id') id: string, @Body() dto: CambiarEstadoEmpresaDto) {
    return this.appService.cambiarEstadoEmpresa(id, dto.activo);
  }

  @EventPattern(RoutingKeys.CuentaCerrada)
  async handleCuentaCerrada(@Payload() payload: CuentaCerradaPayload) {
    this.logger.log({
      operation: RoutingKeys.CuentaCerrada,
      aggregateId: payload.cuentaId,
      message: 'Comprobante de pago recibido.',
    } satisfies OperableLog);
    await this.appService.registrarComprobantePago(payload);
  }
}
