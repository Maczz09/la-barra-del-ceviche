---
tipo: catalogo-servicios
fuente: [apps/*/project.json, apps/*/src/main.ts, infra/docker-compose.yml, README.md]
revisado: 2026-08-12
sesion: S33 (Despliegue y operación)
---

# Catálogo de servicios — NachoPps

Inventario de los 11 microservicios NestJS + la PWA. Cada servicio es dueño de su
base de datos (database-per-service), arranca con `apps/<servicio>/src/main.ts`
y entra al cliente por el API Gateway **Kong** (`:8000`). La fuente de verdad
del inventario es el código: `nx show projects --type=app`.

## Servicios

| Servicio | Puerto host (dev) | Responsabilidad | Base de datos | Consume (eventos) | Publica (eventos) | Health |
|----------|------------------|-----------------|---------------|-------------------|-------------------|--------|
| **identidad** | 3001 | Auth JWT RS256, usuarios, roles, auditoría | `identidad_db` | — | — | `/api/health/*` |
| **mesas** | 3002 | Mesas y su estado | `mesas_db` | `cuenta.abierta`, `cuenta.cerrada` | `mesa.creada`, `mesa.actualizada` | `/api/health/*` |
| **pedidos** | 3004 | Pedidos, ítems, comandero, saga de stock | `pedidos_db` | `mesa.*`, `producto.*`, `stock.insuficiente`, `pago.registrado` | `pedido.creado`, `pedido.actualizado`, `pedido.listo` | `/api/health/*` |
| **cuentas** | 3005 | Cuentas y tickets | `cuentas_db` | `pedido.creado/actualizado`, `pago.registrado` | `cuenta.abierta`, `cuenta.cerrada`, `ticket.generado` | `/api/health/*` |
| **reservas** | 3006 | Reservas anti-doble-booking | `reservas_db` | — | `reserva.creada`, `reserva.cancelada` | `/api/health/*` |
| **inventario** | 3007 | Productos y stock (descuento idempotente) | `inventario_db` | `pedido.creado` | `producto.creado/actualizado`, `stock.insuficiente` | `/api/health/*` |
| **notificaciones** | 3008 | WebSocket en vivo (socket.io) | `notificaciones_db` | la mayoría de eventos de dominio | — | `/api/health/*` |
| **caja** | 3009 | Turnos, pagos, arqueo, cierre Z | `caja_db` | `cuenta.abierta`, `cuenta.cerrada` | `pago.registrado` | `/api/health/*` |
| **reportes** | 3010 | Reportes de ventas | `reportes_db` | `cuenta.cerrada` | — | `/api/health/*` |
| **facturacion** | 3011 | Boletas/facturas electrónicas SUNAT (firma XMLDSig, multi-RUC) | `facturacion_db` | `cuenta.cerrada` | `comprobante.emitido` | `/api/health/*` |
| **compras** | 3012 | Proveedores, insumos, órdenes de compra, comprobantes (foto → WebP + PDF) | `compras_db` | — | `compra.recibida` | `/api/health/*` |
| **pwa-cliente** | 4200 (dev) | Frontend PWA (React 19 + Vite) | — | — (WebSocket) | — | — |

> Los puertos internos de contenedor son todos `3000`; el mapeo host de arriba
> aplica a `infra/docker-compose.yml`. En runtime real el cliente **no** usa esos
> puertos: entra por Kong (`:8000`) → `http://<servicio>:3000/api`.

## Dependencias de infraestructura

| Dependencia | Rol | Declarada en |
|-------------|-----|--------------|
| RabbitMQ (`nachopps_exchange`, topic) | Bus de eventos asíncrono | `infra/docker-compose.yml`, `libs/shared-rabbitmq` |
| PostgreSQL ×11 | Una BD por servicio | `infra/docker-compose.yml`, `apps/*/prisma/schema.prisma` |
| Kong | API Gateway (jwt, cors, rate-limit) | `infra/kong/kong.yml.template` |
| Jaeger / Prometheus / Grafana | Trazas, métricas, dashboards | `infra/{prometheus,grafana}` |

## Integraciones síncronas (HTTP con circuit breaker)

| Origen → Destino | Motivo | Timeout | Código |
|------------------|--------|---------|--------|
| pedidos → mesas | resolver la mesa del pedido | 2 s, 1 retry | `apps/servicio-pedidos/src/app/mesas-http.client.ts` |
| pedidos → inventario | validar stock al crear pedido | 2 s, sin retry | `apps/servicio-pedidos/src/app/inventario-http.client.ts` |
| caja → cuentas | leer/cerrar la cuenta a cobrar | 2–4 s | `apps/servicio-caja/src/app/cuentas-http.client.ts` |

Ver también: [catálogo de eventos](eventos/_catalogo.md) ·
[matriz de resiliencia](matriz-resiliencia.md) ·
[matriz de auditoría](matriz-auditoria.md) ·
[trazabilidad](gobierno/trazabilidad.md).
