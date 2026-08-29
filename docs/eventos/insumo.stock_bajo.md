---
tipo: evento
routing_key: insumo.stock_bajo
constante: RoutingKeys.InsumoStockBajo
fuente: [libs/contracts/src/events/routing-keys.ts:53]
revisado: 2026-08-24
---

# insumo.stock_bajo

**Definicion.** `RoutingKeys.InsumoStockBajo` = `insumo.stock_bajo` (T-50).
Un movimiento del almacen de cocina dejo a un insumo en o por debajo de su
`stockMinimo`.

**Semantica del disparo.** Se emite SOLO en el cruce hacia abajo:
`stockAntes > stockMinimo && stockDespues <= stockMinimo`. Mientras el insumo
siga bajo el minimo, los movimientos siguientes NO re-emiten — si no, cada
salida de un insumo ya agotado spamearia la cola.

**Payload.** `InsumoStockBajoPayload` — `sedeId`, `insumoId`, `insumoNombre`,
`unidad`, `stockActual`, `stockMinimo`.

**Productores detectados.**

- apps/servicio-compras/src/app/movimientos-insumo.service.ts (`aplicarMovimiento`,
  fila de outbox en la MISMA transaccion que el movimiento).

**Consumidores detectados.**

- Sin consumidor `@EventPattern` todavia. Destinatario previsto:
  servicio-notificaciones.

**Estado.** producido-sin-consumidor.
