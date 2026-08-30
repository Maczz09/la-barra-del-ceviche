# La Barra del Ceviche — sistema de gestión

Proyecto basado en **RestoApp**, del **Ingeniero en Sistemas e Informática Max Alessandro García López**.

Esta base fue preparada para La Barra del Ceviche y conserva la arquitectura funcional de RestoApp: monorepo **Nx**, microservicios event-driven en NestJS y una PWA React + Vite. Cada servicio es dueño de su base de datos y se comunica de forma asíncrona vía RabbitMQ; todo el tráfico del cliente entra por Kong.

El perfil de escritorio Tauri ya está implementado: empaqueta los 11 microservicios, PostgreSQL, NATS JetStream, la PWA y el gateway local en un único instalador para Windows. El despliegue Docker/Kong se conserva como perfil distribuido.

```
┌──────────────┐      :8000 (Kong)        ┌────────────────────────────────────────┐
│  PWA cliente │ ───────────────────────► │  API Gateway Kong                        │
│ (React/Vite) │   cookie httpOnly JWT     │  jwt · cors · rate-limit · jwt-cache     │
└──────────────┘   + X-CSRF-Token          └───────────────┬──────────────────────────┘
        ▲  WebSocket (/notificaciones/socket.io)            │ /{dominio} → http://servicio:3000/api
        │                                                   ▼
        │                         ┌─────────────────────────────────────────────────┐
        └──── eventos en vivo ────│ identidad · mesas · pedidos · cuentas · reservas │
                                  │ inventario · notificaciones · caja · reportes    │
                                  │ facturacion · compras                            │
                                  └───────┬───────────────────────┬──────────────────┘
                                          │ Outbox transaccional  │ Postgres por servicio
                                          ▼
                                   ┌──────────────┐
                                   │  RabbitMQ    │  nachopps_exchange (topic)
                                   └──────────────┘
```

## Estructura

| Carpeta | Contenido |
|---------|-----------|
| `apps/servicio-*` | 11 microservicios NestJS + sus suites e2e (`*-e2e`) |
| `apps/pwa-cliente` | Frontend PWA (React 19, Vite, React Query, React Router v7) |
| `apps/runtime-local` | Supervisor portable, gateway LAN, mDNS, onboarding, respaldos y cola de impresión |
| `apps/escritorio` | Aplicación e instalador Tauri 2 para Windows |
| `libs/contracts` | Contratos compartidos: comandos/queries por dominio, routing keys, envelope de eventos |
| `libs/shared-auth` | Guard JWT + estrategia Passport + validación CSRF (double-submit) |
| `libs/shared-prisma` | `PrismaService` con hooks de apagado |
| `libs/shared-rabbitmq` | Publicador AMQP (fail-fast si falta `RABBITMQ_URI`) |
| `libs/resiliencia` | `@CircuitBreaker` (opossum) y `RabbitMQRetryInterceptor` |
| `libs/observabilidad` | `initTracing` (OpenTelemetry) |
| `infra` | `docker-compose.yml` (dev), `docker-compose.prod.yml`, Kong, Prometheus |

## Servicios y dominios

| Servicio | Puerto host (dev) | Responsabilidad | Eventos que consume |
|----------|------------------|-----------------|---------------------|
| identidad | 3001 | Auth JWT, usuarios, roles | — |
| mesas | 3002 | Mesas y su estado | CuentaAbierta, CuentaCerrada |
| pedidos | 3004 | Pedidos e ítems, comandero | Mesa*, Producto*, PagoRegistrado |
| cuentas | 3005 | Cuentas, tickets | PedidoCreado/Actualizado, PagoRegistrado |
| reservas | 3006 | Reservas con anti-doble-booking | — |
| inventario | 3007 | Productos y stock | PedidoCreado (descuento idempotente) |
| notificaciones | 3008 | WebSocket en vivo (socket.io) | la mayoría de eventos de dominio |
| caja | 3009 | Turnos, pagos, arqueo, cierre Z | CuentaAbierta, CuentaCerrada |
| reportes | 3010 | Reportes de ventas | CuentaCerrada |
| facturacion | 3011 | Boletas/facturas electrónicas SUNAT (firma XMLDSig, multi-RUC) | CuentaCerrada |
| compras | 3012 | Proveedores, insumos, órdenes de compra, comprobantes (foto → WebP + PDF) | — |

> **Frontend ↔ backend:** todos los módulos de la PWA consumen el backend real a través de Kong (`:8000`) — no queda ningún módulo mock.

## Patrones clave

- **Transactional Outbox** en los 11 servicios: el evento se persiste en la misma transacción que el cambio de estado y un `OutboxProcessor` (cron 1s) lo publica con reintentos (5 → `FAILED`), purga e idempotencia.
- **Idempotencia de consumidores:** claim atómico de `idempotencyKey` (p.ej. por `pedido.id`) antes de procesar.
- **Resiliencia:** retry interceptor en consumidores + circuit breaker en llamadas síncronas (pedidos→mesas, pedidos→inventario, caja→cuentas).
- **Seguridad:** JWT en cookie `httpOnly`, CSRF double-submit (`X-CSRF-Token`), `helmet`, CORS restrictivo, `ValidationPipe` whitelist, `GlobalExceptionFilter`, Swagger solo fuera de producción, fail-fast sin `RABBITMQ_URI`/`CORS_ORIGIN` en prod, graceful shutdown.

## Desarrollo

```sh
# Primera vez en esta máquina: genera infra/secrets/jwt-dev.env (par de claves
# JWT RS256 de desarrollo) — sin esto, el compose falla porque Kong exige ese
# env_file y no viene en el repo (son credenciales, van gitignored).
npm run dev:keys

# Infra (RabbitMQ, Postgres x11, Kong, Jaeger, Prometheus, Grafana)
docker compose -f infra/docker-compose.yml --profile infra up -d

# Servicio individual
npm exec nx serve servicio-pedidos
npm exec nx serve pwa-cliente

# Calidad (lo que valida CI)
npm exec nx run-many -- --target=lint --all
npm exec nx run-many -- --target=typecheck --all
npm exec nx run-many -- --target=build --all
npm exec nx run @org/source:test   # vitest raíz: *.spec de pwa + shared-auth (los servicios NestJS corren su propia suite Jest vía su target `test` de nx, no acá)
npm exec nx run-many -- --target=e2e --all --parallel=1   # contra stack Docker/Kong levantado
```

## Aplicación de escritorio y servidor local

El perfil `tauri-local` mantiene los 11 microservicios como procesos separados, pero los opera como una sola aplicación. La laptop sirve la PWA por el puerto fijo `3210`; meseros, cocina y comensales acceden con `http://la-barra-del-ceviche.local:3210` o con la dirección IP mostrada en el módulo **Servidor local**.

```sh
npm run desktop:prepare    # compila y reúne el runtime portable
npm run desktop:check      # valida el backend Rust/Tauri
npm run eval:tauri-local   # comprueba arquitectura y recursos empaquetados
npm run desktop:build      # genera el instalador NSIS de Windows
```

El primer inicio crea las 11 bases, aplica migraciones y solicita el administrador inicial. Para que un único QR sobreviva cambios y reinicios del router, configura una reserva DHCP para la MAC que muestra la aplicación. Consulta [la guía de operación](docs/operacion-servidor-local.md).

> `build` empaqueta artefactos, pero no reemplaza `typecheck`. CI ejecuta `typecheck build test`; localmente corre ambos antes de cerrar cambios.
> Los e2e locales validan la pila Docker/Kong existente; levanta primero `docker compose -f infra/docker-compose.yml --profile infra up -d`.

> **Estado actual de Calidad:** 100% de tests exitosos en backend y PWA. Quality Gate de SonarQube certificado en **Excellence** (0 bugs, 0 code smells, 81% de cobertura). La cobertura tiene **pisos anti-regresión** en `vitest.config.mts` (objetivo: mantener sobre 80%).

## Despliegue distribuido conservado

**CI/CD:** `.github/workflows/deploy.yml` construye y publica las 13 imágenes
(11 servicios + Kong + PWA) a GHCR en cada push a `main`. `docker-compose.prod.yml`
las consume por tag (`${REGISTRY}/<servicio>:latest`) y un `watchtower` con
`--label-enable` las jala y reinicia automáticamente en el host. Este flujo se
conserva como alternativa al instalador local.

Resumen de lo que hay que preparar antes del primer `up -d`:

1. Copiar `.env.example` → `.env` y rellenar **todas** las variables obligatorias. El compose de prod usa `${VAR:?}` y **falla rápido** si faltan secretos.
2. Variables clave: `DB_PASS`, `RABBITMQ_PASS`, las claves JWT RS256 (`JWT_PRIVATE_KEY` solo en identidad, `JWT_PUBLIC_KEY` + `KONG_JWT_PUBLIC_KEY` en todos), `SERVICE_JWT_SECRET` (tokens S2S), `CORS_ORIGIN` y `KONG_CORS_ORIGINS` (dominio https real de la PWA). Genera el par con `node scripts/generate-jwt-keys.mjs`.
3. En GitHub → Settings → Actions → Variables, definir `VITE_API_BASE_URL` con el dominio https real: Vite lo hornea en el bundle **al construir la imagen** (no es algo que se lea en runtime ni un `.env.production` que edites a mano — ver `apps/pwa-cliente/Dockerfile`).
4. `docker login ghcr.io` en el host de destino (los packages son privados) — Watchtower reusa esa misma sesión para los pulls automáticos.
5. Las migraciones se aplican solas al arrancar cada contenedor vía `prisma migrate deploy` (ver `infra/entrypoint.sh`). **Nunca** usar `db push --accept-data-loss` en prod.

```sh
docker compose -f infra/docker-compose.prod.yml --env-file .env pull
docker compose -f infra/docker-compose.prod.yml --env-file .env up -d
```

### Escalado horizontal del outbox
El `OutboxProcessor` (en `libs/resiliencia`) reclama cada lote con un `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` que marca los eventos como `PUBLISHING`: **varias réplicas por microservicio son seguras** — cada una salta las filas bloqueadas por las demás, sin publicar duplicados en el happy path (T-08). Un cron de rescate devuelve a `PENDING` los `PUBLISHING` huérfanos (réplica caída a mitad de lote) tras 60s, preservando la entrega at-least-once. Configurar `terminationGracePeriodSeconds` ≥ 30s para el apagado graceful.

## Observabilidad
Jaeger (trazas OTEL), Prometheus (métricas en `/api/telemetry/metrics`) y Grafana. Todos los servicios exportan a `OTEL_EXPORTER_OTLP_ENDPOINT`. En producción Jaeger no publica `16686`; usar túnel SSH/red interna (`docs/operacion/jaeger-prod.md`).

## Flujo principal

Caso central **mesa → pedido → cuenta → pago** (la apertura de cuenta es asíncrona vía outbox→RabbitMQ):

```sh
POST /mesas          # 201 → mesaId (mesa LIBRE)
POST /pedidos        # 201 → pedidoId + correlationId; mesa OCUPADA; evento pedido.creado
#                    → (async) cuenta.abierta → cuenta ABIERTA
POST /caja/pagos     # 201 → pago.registrado; cuenta CERRADA; mesa LIBRE; ticket
```

Implementado y ejecutado en CI: `stress-tests/run-all-stress-tests.js` (`testFullFlowConcurrent`) + suites `*-e2e`. Detalle y estados en [docs/ficha-validacion-operativa-s33.md](docs/ficha-validacion-operativa-s33.md).

## Prueba de resiliencia

Cada escenario de falla tiene un script ejecutable (requiere el stack levantado):

```sh
node stress-tests/run-chaos-db-down.js --db inventario   # dependencia caída
node stress-tests/run-stock-idempotency-dlq.js           # 503→retry→DLQ, duplicados, compensación
node stress-tests/run-security-limits.js                 # 429 rate limit (Kong)
node stress-tests/run-chaos-suite.js                     # suite completa de caos
```

Health en vivo por servicio: `GET /api/health/live · /ready · /dependencies`. Mapa falla→mecanismo→evidencia en [docs/matriz-resiliencia.md](docs/matriz-resiliencia.md).

## Brechas conocidas

- El arranque requiere `-f infra/docker-compose.yml --profile all` (no `docker compose up` pelado).
- Jaeger no publica `16686` en producción (usar túnel — `docs/operacion/jaeger-prod.md`).
- Alertmanager sin receiver activo.
- Métricas de resiliencia sin el nombre canónico exacto del material (`webhook_duplicates_total`, etc.); la señal existe con otros nombres.

Lista viva con owner y acción: [docs/ficha-validacion-operativa-s33.md §10](docs/ficha-validacion-operativa-s33.md).

## Desarrollo local solamente
`infra/docker-compose.yml` y `scripts/poblar-datos.ts` son solo para desarrollo: contienen credenciales demo y datos de prueba. Producción usa `infra/docker-compose.prod.yml` con `.env` real.

## Documentación
- `docs/plan-tauri-servidor-local.md` — arquitectura y estado de ejecución del perfil de escritorio.
- `docs/operacion-servidor-local.md` — instalación, primer arranque, red, QR, impresora, respaldo y diagnóstico.
- `docs/ficha-validacion-operativa-s33.md` — **ficha de validación operativa (S33)**: gates, fitness functions y brechas.
- `docs/catalogo-servicios.md` — catálogo de los 11 servicios (puertos, BD, eventos, health).
- `docs/matriz-resiliencia.md` — falla → mecanismo → evidencia → script.
- `docs/matriz-auditoria.md` — evento crítico → correlationId → estado → actor → eventId.
- `docs/operacion/` — levantar el sistema, base de datos, RabbitMQ, resiliencia, runbooks.
- `docs/decisiones/` — ADRs.
