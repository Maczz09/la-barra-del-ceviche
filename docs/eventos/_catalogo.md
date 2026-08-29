---
tipo: catalogo-eventos
fuente: [libs/contracts/src/events/routing-keys.ts:5]
revisado: 2026-06-02
commit: 53877c8
---

# Catalogo de eventos

| Routing key | Productores | Consumidores | Estado |
|---|---|---|---|
| [reserva.creada](reserva.creada.md) | apps/servicio-reservas/src/app/reservas.service.ts:85 | servicio-notificaciones:handleReservaCreada [apps/servicio-notificaciones/src/app/app.controller.ts:72] | usado |
| [reserva.cancelada](reserva.cancelada.md) | apps/servicio-reservas/src/app/reservas.service.ts:130 | servicio-notificaciones:handleReservaCancelada [apps/servicio-notificaciones/src/app/app.controller.ts:80] | usado |
| [reserva.confirmada](reserva.confirmada.md) | definido sin productor detectado | definido sin consumidor detectado | definido-no-usado |
| [mesa.creada](mesa.creada.md) | apps/servicio-mesas/src/app/app.service.ts:37 | servicio-pedidos:handleMesaCreada [apps/servicio-pedidos/src/app/events.controller.ts:13] | usado |
| [mesa.actualizada](mesa.actualizada.md) | apps/servicio-mesas/src/app/app.service.ts:81 | servicio-notificaciones:handleMesaActualizada [apps/servicio-notificaciones/src/app/app.controller.ts:64]<br>servicio-pedidos:handleMesaActualizada [apps/servicio-pedidos/src/app/events.controller.ts:18] | usado |
| [mesa.asignada](mesa.asignada.md) | definido sin productor detectado | definido sin consumidor detectado | definido-no-usado |
| [mesa.liberada](mesa.liberada.md) | definido sin productor detectado | definido sin consumidor detectado | definido-no-usado |
| [pedido.creado](pedido.creado.md) | apps/servicio-pedidos/src/app/app.service.ts:258 | servicio-cuentas:handlePedidoCreado [apps/servicio-cuentas/src/app/events.controller.ts:15]<br>servicio-inventario:handlePedidoCreado [apps/servicio-inventario/src/app/events.controller.ts:12]<br>servicio-notificaciones:handlePedidoCreado [apps/servicio-notificaciones/src/app/app.controller.ts:32] | usado |
| [pedido.listo](pedido.listo.md) | apps/servicio-pedidos/src/app/app.service.ts:326<br>apps/servicio-pedidos/src/app/app.service.ts:376 | definido sin consumidor detectado | usado |
| [pedido.actualizado](pedido.actualizado.md) | apps/servicio-pedidos/src/app/app.service.ts:263<br>apps/servicio-pedidos/src/app/app.service.ts:336<br>apps/servicio-pedidos/src/app/app.service.ts:384<br>apps/servicio-pedidos/src/app/app.service.ts:399 | servicio-cuentas:handlePedidoActualizado [apps/servicio-cuentas/src/app/events.controller.ts:22]<br>servicio-notificaciones:handlePedidoActualizado [apps/servicio-notificaciones/src/app/app.controller.ts:40] | usado |
| [cuenta.abierta](cuenta.abierta.md) | apps/servicio-cuentas/src/app/app.service.ts:69<br>apps/servicio-cuentas/src/app/app.service.ts:113 | servicio-caja:handleCuentaAbierta [apps/servicio-caja/src/app/events.controller.ts:16]<br>servicio-notificaciones:handleCuentaAbierta [apps/servicio-notificaciones/src/app/app.controller.ts:48]<br>servicio-mesas:handleCuentaAbierta [apps/servicio-mesas/src/app/events.controller.ts:16] | usado |
| [cuenta.cerrada](cuenta.cerrada.md) | apps/servicio-cuentas/src/app/app.service.ts:287 | servicio-caja:handleCuentaCerrada [apps/servicio-caja/src/app/events.controller.ts:29]<br>servicio-notificaciones:handleCuentaCerrada [apps/servicio-notificaciones/src/app/app.controller.ts:56]<br>servicio-reportes:handleCuentaCerrada [apps/servicio-reportes/src/app/app.controller.ts:24]<br>servicio-mesas:handleCuentaCerrada [apps/servicio-mesas/src/app/events.controller.ts:29] | usado |
| [ticket.generado](ticket.generado.md) | apps/servicio-cuentas/src/app/app.service.ts:292 | definido sin consumidor detectado | usado |
| [pago.registrado](pago.registrado.md) | apps/servicio-caja/src/app/app.service.ts:110 | servicio-cuentas:handlePagoRegistrado [apps/servicio-cuentas/src/app/events.controller.ts:29]<br>servicio-pedidos:procesarPago [apps/servicio-pedidos/src/app/app.controller.ts:32] | usado |
| [arqueo.realizado](arqueo.realizado.md) | definido sin productor detectado | definido sin consumidor detectado | definido-no-usado |
| [stock.bajo](stock.bajo.md) | definido sin productor detectado | definido sin consumidor detectado | definido-no-usado |
| [stock.descontado](stock.descontado.md) | definido sin productor detectado | definido sin consumidor detectado | definido-no-usado |
| [producto.creado](producto.creado.md) | apps/servicio-inventario/src/app/app.service.ts:155 | servicio-pedidos:handleProductoCreado [apps/servicio-pedidos/src/app/events.controller.ts:23] | usado |
| [producto.actualizado](producto.actualizado.md) | apps/servicio-inventario/src/app/app.service.ts:199<br>apps/servicio-inventario/src/app/app.service.ts:253 | servicio-pedidos:handleProductoActualizado [apps/servicio-pedidos/src/app/events.controller.ts:28] | usado |
| [insumo.stock_bajo](insumo.stock_bajo.md) | apps/servicio-compras/src/app/movimientos-insumo.service.ts:126 | definido sin consumidor detectado | producido-sin-consumidor |
