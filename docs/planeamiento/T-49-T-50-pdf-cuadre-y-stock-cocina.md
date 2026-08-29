# Planteamiento — T-49 (PDF de cuadre de inventario) + T-50 (stock interno de cocina)

> Generado el 2026-08-24 sobre `main` (limpio, `aba2a29`).
>
> **ESTADO: T-49 y T-50 Fase 1 IMPLEMENTADOS** (2026-08-24). Decisiones tomadas
> por el dueño: solo Fase 1, pestaña dentro de Inventario, y **cocina sí registra
> sus propias salidas**. La Fase 2 (recetas) queda documentada más abajo sin
> ejecutar. Ver "Lo que quedó implementado" al final.
>
> Esfuerzo: **S** ≤ medio día · **M** ≤ 2 días · **L** ≥ 3 días.

---

## 0. Qué encontré en el proyecto (estado real verificado)

### 0.1 Lo que hoy se vende: `Producto` (servicio-inventario)

- `apps/servicio-inventario/prisma/schema.prisma` → `Producto.stockActual Int?`.
- Invariante duro ya existente (`app.service.ts:208`, `assertStockCoincideConAreaCategoria`):
  **`stockActual != null` ⟺ la categoría es de área `INVENTARIO`**. Un plato de
  `COCINA`/`BARRA` tiene `stockActual = null` y *no lleva control de stock*.
- El stock de `INVENTARIO` sí se mueve solo: se descuenta en `pedido.creado`
  (`reducirStockAutomatico`, `app.service.ts:493`), se restaura en
  `stock.restaurado`, y baja por merma manual.
- La pantalla es `apps/pwa-cliente/src/screens/inventario/InventarioScreen.tsx`
  (filtra `conStock: true` y categorías `area === 'INVENTARIO'`), con tabla
  `components/inventario/ProductoTable.tsx` y **paginación por cursor** (`limit` 50).

### 0.2 Lo que hoy se compra: `Insumo` (servicio-compras)

- `apps/servicio-compras/prisma/schema.prisma` → `Insumo` con `unidad`,
  `stockActual Decimal(12,3)`, `stockMinimo`, `costoUnitario`,
  `factorConversion`, `proveedorId`, y `productoId` como **puente opcional sin FK**
  para lo que además se revende tal cual (cervezas, gaseosas, pisco).
- UI actual: pestaña *Insumos* dentro de `screens/compras/ComprasScreen.tsx`
  (+ `InsumoDrawer.tsx`), rol `ADMIN | SISTEMA | GERENCIA`.

### 0.3 El hueco real (esto es lo que pides como "stock interno de cocina")

**`Insumo.stockActual` solo SUBE. Nunca baja.** El único lugar del código que lo
toca es `apps/servicio-compras/src/app/recepciones.service.ts:86`:

```ts
data: { stockActual: { increment: linea.cantidadRecibida } }
```

Consecuencias medibles hoy:

| Falta | Efecto |
|---|---|
| Salida por consumo de cocina | El arroz/aceite/gas se usa y el sistema sigue diciendo que está entero |
| Merma de insumo | Lo que se echa a perder no se registra en ningún lado |
| Ajuste por conteo físico | No hay forma de cuadrar lo contado contra lo del sistema |
| Kardex / movimientos | No hay historial: `stockActual` es un número sin auditoría detrás |
| Recetas (insumo↔plato) | No existe el concepto: vender 1 ceviche no consume nada |

Además `servicio-compras` **es solo productor** de eventos (outbox, sin `queue`
en el bootstrap ni `EventsController`), a diferencia de `servicio-inventario`
que sí consume (`main.ts` con `queue: 'inventario_queue'`).

### 0.4 Lo que ya está listo para reutilizar

- **PDF**: `jspdf ^4.2.1` + `jspdf-autotable ^5.0.8` ya en `package.json`, con
  patrón de import diferido en `apps/pwa-cliente/src/utils/reportePdf.ts` (y su
  spec). **No hace falta instalar nada** → no se toca `package-lock.json`.
- **Idempotencia HTTP**: `IdempotencyInterceptor` ya montado en `servicio-compras`.
- **Sede activa**: `useSedeActualQuery()` da el nombre de sede para el encabezado.
- **Límite del listado de productos**: `Max(500)` en el DTO **y** clamp a 500 en
  el servicio — coherentes, así que el PDF puede pedir `limit=500` sin sorpresas.

---

## T-49 — PDF de inventario para cuadre manual · S

### Objetivo
Un botón en Inventario que baje un PDF imprimible con el stock del sistema, con
columnas en blanco para anotar el conteo físico a mano y firmar el cuadre.

### Diseño

**Ubicación del botón**: `page-h` de `InventarioScreen.tsx`, junto a
*Ver mermas* / *Refrescar*.

**Modal de opciones** (`components/inventario/ExportarInventarioModal.tsx`),
porque un solo PDF fijo no cubre los dos usos reales:

| Opción | Valores | Default |
|---|---|---|
| Tipo | **Cuadre físico** (columnas en blanco) · **Valorizado** (precio × stock) | Cuadre físico |
| Alcance | **Todo el inventario** · **Solo lo filtrado en pantalla** (categoría + búsqueda) | Todo |
| Extra | ☐ Solo stock bajo o agotado | off |

**Traer TODO el inventario, no la página en pantalla.** Hoy la tabla está
paginada (50 por página): un PDF de cuadre con la mitad de los productos es peor
que no tenerlo. Se añade a `api/inventario.api.ts`:

```ts
export async function getTodosLosProductos(query: ProductoListQuery = {}): Promise<ProductoDto[]>
```

que itera el cursor con `limit: 500` y **corta a las 20 páginas (10 000 productos)**
como tope de seguridad, para no colgar el navegador si el cursor se rompiera.

**Contenido del PDF** (`utils/inventarioPdf.ts`, mismo patrón lazy que `reportePdf.ts`):

- Encabezado: `La Barra del Ceviche — Inventario · Cuadre físico`, nombre de sede, fecha y
  hora en `America/Lima`, usuario que exportó, y el filtro aplicado — para que no
  se confunda un PDF parcial con uno completo.
- KPIs: total, disponibles, stock bajo (≤5), agotados; reutilizando
  `computeInventarioKpis` de `domain/inventario.ts` (misma cifra que la pantalla).
- Tabla agrupada por categoría con subtotal de unidades por grupo:
  - **Cuadre físico** (horizontal): `Producto | Stock sistema | Stock físico ▢ | Diferencia ▢ | Observación ▢`
  - **Valorizado** (vertical): `Producto | Stock | Precio unit. | Valor total` + total general en PEN
- Pie: `Página X de Y` (hook `didDrawPage` de autotable) y dos líneas de firma
  (*Contó* / *Revisó*), solo en el modo cuadre.
- Nombre de archivo: `inventario-cuadre_2026-08-24.pdf` /
  `inventario-valorizado_2026-08-24.pdf`.

**Sin conexión**: el botón queda deshabilitado con `title` explicativo. El PDF
necesita recorrer todas las páginas del listado, y prefiero eso a emitir en
silencio un cuadre incompleto.

### Archivos

| Archivo | Acción |
|---|---|
| `apps/pwa-cliente/src/utils/inventarioPdf.ts` | **nuevo** — generación (lazy `jspdf`) |
| `apps/pwa-cliente/src/utils/inventarioPdf.spec.ts` | **nuevo** — test con `jspdf` mockeado |
| `apps/pwa-cliente/src/components/inventario/ExportarInventarioModal.tsx` | **nuevo** |
| `apps/pwa-cliente/src/api/inventario.api.ts` | `getTodosLosProductos` |
| `apps/pwa-cliente/src/screens/inventario/InventarioScreen.tsx` | botón + estado del modal |
| `apps/pwa-cliente/src/screens/inventario/InventarioScreen.test.tsx` | caso del botón |

**Backend: cero cambios. Contracts: cero cambios.** Solo se reconstruye la imagen
de la PWA.

---

## T-50 — Stock interno para lo que se usa en cocina · M/L por fases

### Decisión de arquitectura (la más importante del documento)

**El stock de cocina se queda en `servicio-compras`, sobre el `Insumo` que ya
existe. No se crea un modelo paralelo en `servicio-inventario`.**

Por qué: `Insumo` ya tiene exactamente lo que necesita un almacén de cocina
(unidad, stock fraccionario, mínimo, costo, proveedor). Duplicarlo en otra base
de datos crearía **dos dueños del mismo número físico** — el bug más caro posible
en inventario, y sin FK entre bases nadie lo reconciliaría.

Lo que sí cambia es **dónde lo ve el dueño**: se expone como pestaña nueva en la
pantalla **Inventario** (`Productos de venta` | `Almacén de cocina`), leyendo
`/compras/insumos*`. El dueño piensa "inventario", no "compras".

### Fase 1 — Movimientos, kardex y cuadre (M) ← lo que recomiendo ejecutar

#### Modelo nuevo (`servicio-compras`)

```prisma
enum MovimientoInsumoTipo {
  ENTRADA_COMPRA       // recepción de OC (hoy ya pasa, ahora queda auditado)
  ENTRADA_DEVOLUCION   // vuelve al almacén algo que no se usó
  SALIDA_CONSUMO       // cocina saca del almacén
  SALIDA_MERMA         // se malogró / se rompió / venció
  AJUSTE_CONTEO        // cuadre físico contra lo contado
}

model MovimientoInsumo {
  id            String   @id @default(uuid())
  sedeId        String
  insumoId      String
  insumo        Insumo   @relation(fields: [insumoId], references: [id])
  tipo          MovimientoInsumoTipo
  // delta CON SIGNO: stockDespues == stockAntes + delta, siempre.
  // Un solo campo firmado, en vez de cantidad + signo derivado del tipo: hace
  // el kardex auto-verificable (sumar deltas debe dar el stock actual).
  delta         Decimal  @db.Decimal(12, 3)
  stockAntes    Decimal  @db.Decimal(12, 3)
  stockDespues  Decimal  @db.Decimal(12, 3)
  // Snapshot del costo al momento del movimiento: valoriza la salida aunque el
  // costo del insumo cambie después (mismo criterio que Merma.costoUnitario).
  costoUnitario Decimal? @db.Decimal(12, 4)
  motivo        String?
  observacion   String?
  recepcionId   String?  // trazabilidad de la entrada por compra (sin FK dura)
  usuarioId     String?
  usuarioNombre String?
  createdAt     DateTime @default(now())

  @@index([sedeId, createdAt])
  @@index([insumoId, createdAt])
  @@index([tipo])
  @@map("movimientos_insumo")
}
```

#### Invariantes que impone el servicio (no el schema)

1. **`stockActual` nunca negativo.** Consumir más de lo que hay devuelve `400`
   con el número real: *"No puedes consumir 8 kg: solo hay 3.5 kg."* No se
   clampa en silencio — a diferencia de `Producto.actualizarStock`, que hace
   `Math.max(0, …)` porque ahí es reposición; acá es una salida física que no cuadra.
2. **Toda escritura a `Insumo.stockActual` pasa por un único método**
   (`InsumosService.aplicarMovimiento`) dentro de un `$transaction` que escribe
   la fila del kardex en el mismo commit. **Incluye refactorizar
   `recepciones.service.ts:86`** para que entre por ahí: si la recepción sigue
   por un camino aparte, el kardex nace incompleto y no cuadra nunca.
3. `stockDespues = stockAntes + delta` verificado antes de persistir.
4. Todo scopeado por `sedeId` con el `resolveSedeId` que ya usan los demás endpoints.

#### Endpoints nuevos (`servicio-compras`)

| Método | Ruta | Roles | Nota |
|---|---|---|---|
| `POST` | `/compras/insumos/:id/movimientos` | ADMIN, SISTEMA, GERENCIA, **COCINA** | consumo / merma / devolución. Con `Idempotency-Key` (interceptor ya montado) para que un doble toque en 3G no descuente dos veces |
| `GET` | `/compras/insumos/:id/movimientos` | ADMIN, SISTEMA, GERENCIA, COCINA | kardex del insumo, cursor + `limit` |
| `GET` | `/compras/movimientos-insumo` | ADMIN, SISTEMA, GERENCIA | kardex general (`desde`, `hasta`, `tipo`) — alimenta el PDF y reportes |
| `POST` | `/compras/insumos/conteo` | ADMIN, SISTEMA, GERENCIA | **cuadre en lote**: `{ fecha, items: [{ insumoId, stockContado }], observacion? }` → calcula `delta = contado − sistema`, escribe un `AJUSTE_CONTEO` solo por los que difieren, y responde el resumen (cuántos cuadraron, cuántos no, valor de la diferencia) |

> `POST /compras/insumos/:id/movimientos` sería el primer endpoint de compras que
> abre el rol **COCINA**: hoy el controller entero es `ADMIN|SISTEMA|GERENCIA` a
> nivel de clase. Se abre **solo ese método** con `@Roles(...)`, más el
> `GET /insumos` para poder elegir el insumo. Nada más.

**Paginación**: `limit` con `Max(100)` en el DTO de contracts **y** el mismo clamp
en el servicio — los dos lados, como el resto del repo.

#### Contracts (`libs/contracts/src/domains/compras.ts`)

`MovimientoInsumoTipo`, `MovimientoInsumoDto`, `RegistrarMovimientoInsumoCommand`,
`ListarMovimientosInsumoQuery`, `MovimientoInsumoListResponse`,
`RegistrarConteoInsumosCommand`, `ConteoInsumosResultadoDto`.

#### Eventos

`RoutingKeys.InsumoStockBajo = 'insumo.stock_bajo'`, emitido por outbox cuando un
movimiento cruza `stockActual <= stockMinimo` **de arriba hacia abajo** (solo en
el cruce, no en cada salida: si no, cada consumo de un insumo ya bajo spamea la
cola). Consumidor: `servicio-notificaciones`.

> `servicio-compras` sigue siendo solo productor en esta fase: **no** necesita
> `queue` ni `EventsController` todavía. Eso entra solo en la Fase 2.

#### UI (PWA)

- `InventarioScreen.tsx` pasa a tener pestañas: **Productos de venta** (lo de hoy,
  intacto) y **Almacén de cocina** (nueva).
- `components/inventario/AlmacenCocinaTab.tsx`: tabla de insumos con
  `Insumo | Unidad | Stock | Mínimo | Costo | Valor`, fila roja bajo mínimo, y por
  fila los botones **Consumo**, **Merma**, **Kardex**.
- `MovimientoInsumoModal.tsx` (tipo + cantidad + motivo) y
  `KardexInsumoDrawer.tsx` (historial con `delta` firmado y stock resultante).
- `ConteoFisicoModal.tsx`: lista los insumos con un input "contado" por fila,
  muestra la diferencia en vivo y manda el lote a `/compras/insumos/conteo`.
- `hooks/queries/useMovimientosInsumoQuery.ts`, tipos en `types/compras.types.ts`,
  llamadas en `api/compras.api.ts`.
- **PDF de almacén** reutilizando `utils/inventarioPdf.ts`: mismo cuadre físico,
  con `Unidad` y `Stock mínimo`. Es el papel que se lleva a la despensa antes de
  usar `ConteoFisicoModal`.
- `auth/permisos.ts`: `COCINA` gana la ruta `inventario` (hoy tiene solo `cocina`
  y `carta`) y aterriza en la pestaña de almacén.

### Fase 2 — Recetas y descuento automático (L) — decidir aparte

Que vender 1 ceviche descuente 0.2 kg de pescado. Es la parte cara y con más
supuestos de negocio, y **no hace falta para cuadrar**; por eso va separada.

```prisma
model RecetaItem {
  id             String  @id @default(uuid())
  sedeId         String
  productoId     String  // producto de venta (otra BD: sin FK, referencia laxa)
  productoNombre String  // denormalizado, para listar sin llamada cross-servicio
  insumoId       String
  insumo         Insumo  @relation(fields: [insumoId], references: [id])
  cantidad       Decimal @db.Decimal(12, 4) // por 1 unidad vendida, en la unidad del insumo
  @@unique([productoId, insumoId])
  @@map("receta_items")
}
```

**Disparador** — dos opciones, y aquí necesito tu decisión:

- **(a) `pedido.creado`** *(recomendada)*: el payload ya trae el `PedidoDto`
  completo con ítems y cantidades. `servicio-compras` pasa a consumidor
  (`queue: 'compras_queue'` + `EventsController`), cero cambios en contracts, y el
  momento coincide con el descuento de `Producto` que ya existe. Contra: si la
  comanda se anula antes de cocinar hay que devolver los insumos — se refleja
  `stock.restaurado`, que ya existe para el caso gemelo.
- **(b) `pedido.listo`**: físicamente más exacto (se consume al cocinar), pero
  `PedidoListoPayload` **solo lleva `pedidoId` y `mesaId`**
  (`libs/contracts/src/domains/pedidos.ts:281`). Habría que enriquecer el payload
  con los ítems: cambio de contrato que obliga a redespliegue coordinado de
  pedidos + compras.

Riesgo propio de esta fase: sin recetas completas y bien medidas, el stock
automático miente con confianza. Recomiendo activarla **por insumo** (flag
`descuentoAutomatico`), empezando por 3-4 insumos caros y fáciles de medir.

---

## Orden de ejecución propuesto

1. **T-49** (PDF, solo PWA) — entrega algo imprimible el mismo día, sin migración ni backend.
2. **T-50 Fase 1** — modelo + kardex + endpoints + pestaña de almacén + conteo físico.
3. **T-50 Fase 2** — recetas, solo si apruebas el disparador.

## Checklist operativo (según cómo despliega este repo)

- Migración nueva en `servicio-compras`: `DATABASE_URL` **inline en el comando**,
  nunca heredado del entorno.
- Nuevos exports en `libs/contracts` → reconstruir el `dist/*.d.ts` de esa lib a
  mano antes del typecheck de las apps (no tiene target de build en Nx).
- T-50 toca FE **y** BE → **rebuild de las dos imágenes** (PWA y servicio-compras).
  Reconstruir solo una da errores confusos de API desestabilizada.
- Sin dependencias nuevas: `jspdf`/`jspdf-autotable` ya están → `package-lock.json` intacto.
- El job de CI `migration-drift` sigue roto desde el upgrade a Prisma 7 (afecta a
  los 11 servicios, no es culpa de este cambio): la migración se valida a mano con
  `prisma migrate diff` contra una BD limpia.
- Tests: `npx vitest run` (los umbrales de cobertura solo suben, nunca bajan) +
  `pnpm nx run-many --target=test` para lo tocado en compras.

## Decisiones que necesito de ti

1. **Alcance de T-50**: ¿solo Fase 1 (movimientos + kardex + cuadre), o también Fase 2 (recetas)?
2. **Ubicación de la UI**: ¿pestaña *Almacén de cocina* dentro de Inventario
   (mi recomendación), o dejarlo donde está hoy, en Compras?
3. **Rol COCINA**: ¿la cocina registra sus propias salidas, o solo
   administración/gerencia descarga del almacén?
4. **Si va Fase 2**: disparador **(a) `pedido.creado`** o **(b) `pedido.listo`**
   con cambio de contrato.

---

## Lo que quedó implementado (2026-08-24)

### T-49 — PDF de inventario
- `apps/pwa-cliente/src/utils/inventarioPdf.ts` — cuadre físico (horizontal, con
  columnas en blanco y firmas), valorizado, y el cuadre del almacén de cocina.
- `apps/pwa-cliente/src/api/inventario.api.ts` — `getTodosLosProductos()`: recorre
  el cursor con `limit=500` y corta a 20 páginas como seguro anti-cuelgue.
- `apps/pwa-cliente/src/components/inventario/ExportarInventarioModal.tsx`.
- Botón *PDF* en la cabecera de Inventario, deshabilitado sin conexión.

### T-50 Fase 1 — Almacén de cocina
- `apps/servicio-compras/prisma/schema.prisma` + migración
  `20260824120000_movimientos_insumo` (con backfill del saldo inicial). **Aplicada
  y verificada** contra `nachopps-db-compras`.
- `apps/servicio-compras/src/app/movimientos-insumo.service.ts` —
  `aplicarMovimiento` como única puerta de escritura de `Insumo.stockActual`
  (advisory lock classid 9012 por insumo), kardex, y cuadre en lote.
- `recepciones.service.ts` refactorizado: la entrada por compra pasa por esa
  misma puerta, así el kardex cuadra desde la primera fila.
- Endpoints: `POST/GET /compras/insumos/:id/movimientos`,
  `GET /compras/movimientos-insumo`, `POST /compras/insumos/conteo`.
- Evento `insumo.stock_bajo` (solo en el cruce hacia abajo del mínimo).
- PWA: pestañas en Inventario (*Productos de venta* / *Almacén de cocina*),
  `AlmacenCocinaTab`, `MovimientoInsumoModal`, `KardexInsumoDrawer`,
  `ConteoFisicoModal`, `useMovimientosInsumoQuery`.
- `auth/permisos.ts`: COCINA gana la ruta `inventario` y aterriza en el almacén;
  no ve la pestaña de productos de venta (el backend le rechaza esas mutaciones).

### Cambios adicionales pedidos en la misma sesión
- `ProductoTable.tsx`: editar un producto dejó de ser un clic sobre la fila y
  pasó a un botón **Editar** explícito, junto a *Merma*, en la columna *Acciones*.
  Se quitó la clase muerta `.dt-row-click` de `styles.css`.
- **Todos los PDFs salen en A4 VERTICAL** (el cuadre había arrancado apaisado).
  Columnas reajustadas para caber en los ~182 mm útiles: en el cuadre de
  productos el nombre se queda con 76 mm, y en el del almacén —7 columnas— con
  58 mm. Medido con jsPDF real: página 210×297 mm, sin desborde.
- **Corrección de encoding y desborde en la cabecera del PDF.** El `≤` de
  "Stock bajo (≤5)" salía como `"d5` y, peor, descuadraba el espaciado de toda
  esa línea (jsPDF con fuentes estándar escribe en WinAnsi/CP1252; un carácter
  fuera de ese juego rompe el text run). Además la línea de KPIs se salía de la
  hoja por la derecha. Se añadió `sanitizarTextoPdf()` —que mapea `≤ ≥ · → — " "`
  a ASCII y descarta lo que quede fuera de Latin-1, conservando tildes y ñ— y un
  helper `escribir()` que pasa TODO el texto por `splitTextToSize` para ajustar
  al ancho. Los KPIs ahora van en dos líneas cortas ("Stock bajo (5 o menos)").
  Las celdas de tabla también se sanitizan.

### Verificación
- `servicio-compras`: 93/93 Jest verde (9 suites).
- PWA: 961/961 vitest verde (109 archivos).
- Cobertura raíz: los 4 umbrales pasan (stmts 43.61 · branches 41.13 ·
  functions 33.37 · lines 43.21). **Ojo:** en `main` limpio los cuatro estaban
  POR DEBAJO del piso (38.83 / 37.3 / 30.37 / 38.16) — era una deuda previa que
  este cambio dejó en verde, no algo que este cambio hubiera roto.
- Migración aplicada con `prisma migrate deploy` y tabla verificada con `\d`.
  El `migrate diff` de drift sigue sin correr por el cambio de flags de Prisma 7.

---

## Ampliación: el almacén como catálogo propio (2026-08-25)

**Problema detectado al ver la pestaña con datos reales.** Los 48 insumos de la
BD tenían TODOS `productoId` no nulo: eran espejos del catálogo de venta creados
por el seed. La pestaña «Almacén de cocina» estaba mostrando exactamente los
productos de venta, que es lo contrario de lo que debe ser.

**Regla que ahora implementa el código:** el almacén de cocina son SOLO los
insumos sin puente a un producto (`productoId IS NULL`). El listado se pide con
`soloCocina=true`. Lo que se revende tal cual —cervezas, gaseosas— pertenece al
catálogo de venta y no aparece en el almacén.

### Lo que se agregó

**Backend (`servicio-compras`), migración `20260825000000_categorias_insumo`:**
- `CategoriaInsumo`: taxonomía **propia** del almacén (Abarrotes, Carnes,
  Limpieza, Gas), separada de las `Categoria` de servicio-inventario. CRUD
  completo en `categorias-insumo.service.ts`. Borrarla NO borra sus insumos: la
  FK es `SetNull` y la respuesta dice cuántos quedaron sueltos.
- `Insumo.categoriaId` + filtros `categoriaId` y `soloCocina` en el listado.
- Tipo de movimiento nuevo **`ENTRADA_MANUAL`**: el ingreso del día sin orden de
  compra detrás, que es como entra la mercadería fresca.
- `GET /compras/movimientos-insumo/:id` — detalle de un movimiento.
- Endpoints `GET/POST/PATCH/DELETE /compras/categorias-insumo`.
- Eliminar un insumo con kardex hace **soft-delete**: borrarlo en duro se
  llevaría por cascada el historial, que es la evidencia del cuadre.

**Frontend:**
- `InsumoAlmacenDrawer` — alta y edición. El stock inicial **solo se pide al
  crear**: después el saldo se mueve por movimientos, para que el kardex cuadre.
- `CategoriasAlmacenModal` — CRUD de categorías, con aviso de cuántos insumos
  se sueltan al borrar una.
- `MovimientoDetalleModal` — ficha completa de un movimiento (quién, cuándo,
  saldo antes/después, costo, motivo, recepción origen). Se abre desde el kardex.
- Pestaña con filtro por categoría, botón **+ Stock** (abre el movimiento ya en
  Ingreso), Movimiento, Kardex y Editar por fila.
- Cocina registra salidas e ingresos pero **no administra el catálogo** ni cierra
  el cuadre: la prop pasó de `puedeCuadrar` a `puedeAdministrar`.

**Verificación:** compras 102/102 Jest · PWA 975/975 vitest.
