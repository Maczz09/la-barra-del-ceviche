import { Controller, Get, Post, Body, Param, ParseUUIDPipe, HttpCode, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { AppService } from './app.service';
import {
  AbrirCuentaCommand,
  CerrarCuentaCommand,
  DividirCuentaCommand
} from '@org/contracts';

// Cuentas: abiertas/consultadas desde el salón (mesero, recepción) y cobradas
// en caja; servicio-caja también las consulta/cierra con token SISTEMA.
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'RECEPCION')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  healthCheck() {
    return { status: 'OK', service: 'Cuentas' };
  }

  @Post()
  abrirCuenta(
    @Body() command: AbrirCuentaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.abrirCuenta(command, usuarioSedeId, sedeId);
  }

  @Get('mesa/:mesaId')
  obtenerCuentaPorMesa(@Param('mesaId', ParseUUIDPipe) mesaId: string) {
    return this.appService.obtenerCuentaPorMesa(mesaId);
  }

  // Uso interno (servicio-caja, token SISTEMA): registrado antes de ':id'
  // para que 'abiertas' no se intente parsear como UUID de cuenta.
  @Get('abiertas')
  listarCuentasAbiertasPorSede(@Query('sedeId') sedeId: string) {
    return this.appService.listarCuentasAbiertasPorSede(sedeId);
  }

  @Get(':id')
  obtenerCuenta(@Param('id', ParseUUIDPipe) id: string) {
    return this.appService.obtenerCuenta(id);
  }

  @HttpCode(200)
  @Post(':id/dividir')
  dividirCuenta(@Param('id', ParseUUIDPipe) id: string, @Body() command: DividirCuentaCommand) {
    return this.appService.dividirCuenta(id, command);
  }

  @Post(':id/cerrar')
  cerrarCuenta(@Param('id', ParseUUIDPipe) id: string, @Body() command: CerrarCuentaCommand) {
    return this.appService.cerrarCuenta(id, command);
  }

  // Uso interno (servicio-pedidos, token SISTEMA): cascada cuando todos los
  // ítems de la atención quedan anulados sin cobro (ver AppService.cancelarCuenta).
  @Post(':id/cancelar')
  cancelarCuenta(@Param('id', ParseUUIDPipe) id: string) {
    return this.appService.cancelarCuenta(id);
  }
}
