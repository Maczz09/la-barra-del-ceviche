import { Controller, Get, Post, Body, Param, Patch, Query, UseInterceptors, UseGuards } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Roles, RolesGuard } from '@org/shared-auth';
import { AppService } from './app.service';
import {
  CrearPedidoCommand,
  ActualizarEstadoPedidoCommand,
  ActualizarEstadoItemCommand,
  RoutingKeys,
  PagoRegistradoPayload,
  ListarPedidosQuery,
  AnularItemPreparadoCommand,
  ListarAnulacionesQuery,
  ActualizarAnulacionCommand,
  InvalidarAnulacionCommand,
  AnularAtencionMesaCommand,
  AnularPedidoCommand,
} from '@org/contracts';
import { RabbitMQRetryInterceptor, IdempotencyInterceptor } from '@org/resiliencia';
import { UsuarioActual } from '@org/observabilidad';

// RBAC por método: este controller también atiende eventos RMQ (@EventPattern),
// así que el guard de roles NO se aplica a nivel de clase para no afectarlos.
@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Crean pedidos meseros y cajeros (comandero); cocina solo despacha.
  // Idempotencia HTTP (plan 1.3): doble-click/retry con la misma Idempotency-Key
  // devuelve el mismo pedido en vez de crear duplicados.
  @UseInterceptors(IdempotencyInterceptor)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO')
  @Post()
  crearPedido(
    @Body() body: CrearPedidoCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
  ) {
    return this.appService.crearPedido(
      body,
      usuarioId
        ? { id: usuarioId, nombre: usuarioNombre ?? usuarioEmail ?? usuarioId }
        : null,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA')
  @Get()
  listarPedidos(@Query() query: ListarPedidosQuery, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.appService.listarPedidos(query, usuarioSedeId);
  }

  // Cocina (KDS) actualiza el estado de pedidos e ítems.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA')
  @Patch(':id/estado')
  actualizarEstado(@Param('id') id: string, @Body() body: ActualizarEstadoPedidoCommand) {
    return this.appService.actualizarEstado(id, body);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA')
  @Patch('items/:itemId/estado')
  actualizarEstadoItem(
    @Param('itemId') itemId: string,
    @Body() body: ActualizarEstadoItemCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
  ) {
    return this.appService.actualizarEstadoItem(itemId, body, usuarioId, usuarioNombre);
  }

  // CU-01 (Caso B): anular un ítem ya preparado/servido — cobrar o no al
  // cliente. Lo hace quien atiende la mesa, no cocina (ya no tiene nada que
  // preparar sobre este ítem).
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO')
  @Post('items/:itemId/anular-preparado')
  anularItemPreparado(
    @Param('itemId') itemId: string,
    @Body() body: AnularItemPreparadoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.anularItemPreparado(itemId, body, usuarioSedeId, sedeId, usuarioId, usuarioNombre);
  }

  // CU-02: desistimiento/abandono de mesa — lo dispara quien atiende (cajero/mesero).
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO')
  @Post('mesas/:mesaId/anular-atencion')
  anularAtencionMesa(
    @Param('mesaId') mesaId: string,
    @Body() body: AnularAtencionMesaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.anularAtencionMesa(mesaId, body, usuarioSedeId, sedeId, usuarioId, usuarioNombre);
  }

  // Anular UN pedido puntual desde el tablero de Pedidos (no toda la
  // mesa) — salvavidas operativo para pedidos atascados, sin depender de
  // un desarrollador con acceso a la base de datos.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO')
  @Post(':id/anular')
  anularPedido(
    @Param('id') id: string,
    @Body() body: AnularPedidoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.anularPedido(id, body, usuarioSedeId, sedeId, usuarioId, usuarioNombre);
  }

  // CU-05: panel de fiscalización — solo administración/gerencia.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Get('anulaciones')
  listarAnulaciones(
    @Query() query: ListarAnulacionesQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.listarAnulaciones(query, usuarioSedeId, sedeId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('anulaciones/:id')
  actualizarAnulacion(
    @Param('id') id: string,
    @Body() body: ActualizarAnulacionCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.actualizarAnulacion(id, body, usuarioSedeId, sedeId);
  }

  // POST en vez de DELETE: es un soft-delete (marca INVÁLIDA) que exige
  // motivo — el registro físico nunca se borra, ver InvalidarAnulacionCommand.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('anulaciones/:id/invalidar')
  invalidarAnulacion(
    @Param('id') id: string,
    @Body() body: InvalidarAnulacionCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.invalidarAnulacion(id, body, usuarioSedeId, sedeId, usuarioNombre);
  }

  @EventPattern(RoutingKeys.PagoRegistrado)
  async procesarPago(@Payload() payload: PagoRegistradoPayload) {
    await this.appService.procesarPagoRecibido(payload);
  }
}
