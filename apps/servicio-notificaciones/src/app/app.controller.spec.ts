// @ts-nocheck
import 'reflect-metadata';
import { RoutingKeys } from '@org/contracts';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsGateway } from './notifications.gateway';
import { CartaGateway } from './carta.gateway';

// Contexto RMQ simulado con la cabecera x-event-id que el publisher propaga.
const mkCtx = (eventId?: string) => ({
  getMessage: () => ({ properties: { headers: eventId ? { 'x-event-id': eventId } : {} } }),
});

describe('AppController - Notificaciones', () => {
  let controller: AppController;
  let appService: { obtenerNotificaciones: ReturnType<typeof jest.fn>; registrarNotificacion: ReturnType<typeof jest.fn> };
  let gateway: { emitPedidoUpdate: ReturnType<typeof jest.fn> };
  let cartaGateway: { emitDisponibilidadCambiada: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    appService = {
      obtenerNotificaciones: jest.fn(),
      registrarNotificacion: jest.fn(),
    };
    gateway = { emitPedidoUpdate: jest.fn() };
    cartaGateway = { emitDisponibilidadCambiada: jest.fn() };
    controller = new AppController(
      appService as unknown as AppService,
      gateway as unknown as NotificationsGateway,
      cartaGateway as unknown as CartaGateway,
    );
  });

  describe('obtenerNotificaciones', () => {
    it('should return notifications list', async () => {
      const mockNotifs = [{ id: 'n1', contenido: 'Test' }];
      appService.obtenerNotificaciones.mockResolvedValue(mockNotifs);

      const result = await controller.obtenerNotificaciones();

      expect(result).toEqual(mockNotifs);
      expect(appService.obtenerNotificaciones).toHaveBeenCalled();
    });
  });

  describe('handlePedidoCreado', () => {
    it('persiste (con el eventId de la cabecera) y emite el payload enriquecido', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'notif-1', contenido: 'Nuevo pedido' });
      const payload = {
        pedido: { id: 'pedido-1', mesaId: 'mesa-1', items: [], total: 0, estado: 'PENDIENTE', createdAt: new Date().toISOString() },
      };

      await controller.handlePedidoCreado(payload as any, mkCtx('evt-1') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.PedidoCreado, payload, 'evt-1');
      expect(gateway.emitPedidoUpdate).toHaveBeenCalledWith({
        pattern: RoutingKeys.PedidoCreado,
        data: { ...payload, notificacionId: 'notif-1', contenido: 'Nuevo pedido' },
      });
    });

    it('evento duplicado (registrarNotificacion → null): NO re-emite por WS', async () => {
      appService.registrarNotificacion.mockResolvedValue(null);
      await controller.handlePedidoCreado({ estado: 'TEST' } as any, mkCtx('evt-dup') as any);
      expect(gateway.emitPedidoUpdate).not.toHaveBeenCalled();
    });

    it('sin cabecera x-event-id pasa eventId=undefined al servicio', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n0', contenido: 'x' });
      await controller.handlePedidoCreado({ estado: 'TEST' } as any, mkCtx() as any);
      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.PedidoCreado, expect.any(Object), undefined);
    });
  });

  describe('handlePedidoActualizado', () => {
    it('persiste y emite evento pedido actualizado', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n2', contenido: 'act' });
      const payload = { estado: 'EN_PREPARACION', mesaId: 'mesa-1' };

      await controller.handlePedidoActualizado(payload as any, mkCtx('evt-2') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.PedidoActualizado, payload, 'evt-2');
    });
  });

  describe('handlePedidoListo', () => {
    it('persiste y emite evento pedido listo', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n3', contenido: 'listo' });
      const payload = { pedidoId: 'ped-1', mesaId: 'mesa-2' };

      await controller.handlePedidoListo(payload as any, mkCtx('evt-3') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.PedidoListo, payload, 'evt-3');
    });
  });

  describe('handleTicketGenerado', () => {
    it('persiste y emite evento ticket generado', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n4', contenido: 'ticket' });
      const payload = { ticketId: 'tick-1', cuentaId: 'c-1' };

      await controller.handleTicketGenerado(payload as any, mkCtx('evt-4') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.TicketGenerado, payload, 'evt-4');
    });
  });

  describe('handleCuentaAbierta', () => {
    it('persiste y emite evento cuenta abierta', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n5', contenido: 'cuenta' });
      const payload = { cuentaId: 'c-1', mesaId: 'mesa-1' };

      await controller.handleCuentaAbierta(payload as any, mkCtx('evt-5') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.CuentaAbierta, payload, 'evt-5');
    });
  });

  describe('handleCuentaCerrada', () => {
    it('persiste y emite evento cuenta cerrada', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n6', contenido: 'cerrada' });
      const payload = { cuentaId: 'c-1', mesaId: 'mesa-1', total: 150 };

      await controller.handleCuentaCerrada(payload as any, mkCtx('evt-6') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.CuentaCerrada, payload, 'evt-6');
    });
  });

  describe('handleMesaActualizada', () => {
    it('persiste y emite evento mesa actualizada', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n7', contenido: 'mesa' });
      const payload = { mesa: { id: 'mesa-1', estado: 'OCUPADA' } };

      await controller.handleMesaActualizada(payload as any, mkCtx('evt-7') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.MesaActualizada, payload, 'evt-7');
    });
  });

  describe('handleReservaCreada', () => {
    it('persiste y emite evento reserva creada', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n8', contenido: 'reserva creada' });
      const payload = { reserva: { id: 'r-1', clienteNombre: 'Ana' } };

      await controller.handleReservaCreada(payload as any, mkCtx('evt-8') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.ReservaCreada, payload, 'evt-8');
    });
  });

  describe('handleReservaCancelada', () => {
    it('persiste y emite evento reserva cancelada', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n9', contenido: 'reserva cancelada' });
      const payload = { reservaId: 'r-1', motivo: 'Cliente no llegó' };

      await controller.handleReservaCancelada(payload as any, mkCtx('evt-9') as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.ReservaCancelada, payload, 'evt-9');
    });
  });

  describe('handleProductoActualizadoParaCartaPublica', () => {
    it('retransmite solo {productoId, disponible} al room de la sede, sin persistir notificación', () => {
      const payload = {
        id: 'prod-1',
        sedeId: 'sede-1',
        nombre: 'Ceviche de Filete',
        precio: 30,
        disponible: false,
      };

      controller.handleProductoActualizadoParaCartaPublica(payload as any);

      expect(cartaGateway.emitDisponibilidadCambiada).toHaveBeenCalledWith('sede-1', {
        productoId: 'prod-1',
        disponible: false,
      });
      expect(appService.registrarNotificacion).not.toHaveBeenCalled();
      expect(gateway.emitPedidoUpdate).not.toHaveBeenCalled();
    });
  });
});
