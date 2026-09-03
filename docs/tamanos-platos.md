# Tamaños de platos

El tamaño es un dato del catálogo, no parte del nombre del plato. Cada presentación conserva su propio ID de producto y precio: por ejemplo, `Ceviche de pescado` con tamaño `Personal` y el mismo nombre con tamaño `Familiar` son dos productos distintos.

## Gestionar tamaños por sede

En **Carta → Tamaños**, administración, sistema y gerencia pueden crear, renombrar, ordenar, activar o desactivar tamaños de la sede seleccionada. También pueden eliminar un tamaño sin platos asociados.

- El nombre admite de 1 a 60 caracteres. No se permiten duplicados en una misma sede, aunque cambien mayúsculas o espacios de los extremos.
- **Orden** admite enteros de 0 a 10000. Un número menor aparece primero; se pueden intercalar tamaños propios, por ejemplo `Para compartir` con orden 35.
- Los tamaños iniciales de las sedes existentes son Personal (10), Mediano (20), Grande (30) y Familiar (40). En una sede nueva se crean desde este módulo; consultar la lista no escribe datos.
- Desactivar impide nuevas asignaciones, pero conserva los platos ya asociados y permite editar sus demás campos. Para eliminar un tamaño usado, primero hay que reasignar esos platos o dejarlos sin tamaño.
- **Sin tamaño** es válido para guarniciones, bebidas o cualquier producto que no requiera presentación. No crea un tamaño artificial.

Los usuarios de lectura del catálogo pueden consultar tamaños. El servidor resuelve la sede autorizada del usuario y rechaza asignaciones a tamaños de otra sede.

## Usarlo en la carta y los pedidos

1. Al crear o editar un plato en **Carta**, escribe únicamente el nombre base, selecciona **Tamaño** y conserva el precio específico de esa presentación. No agregues `· Personal` manualmente al nombre.
2. Usa **Filtrar por tamaño** y el orden por tamaño o por nombre en Carta. Las etiquetas muestran también las presentaciones inactivas que siguen asignadas.
3. En **Menú del día**, se puede filtrar por tamaño, seleccionar una presentación existente o asignar el tamaño al crear un plato nuevo.
4. En **Nuevo pedido**, abre una tarjeta de categoría y selecciona el filtro **Tamaño**. Los platos se muestran en grupos ordenados por presentación, con precios completos. **Volver a categorías** conserva la comanda y limpia el filtro. El menú del día usa los mismos grupos.
5. En la **carta digital**, un mismo nombre base y categoría muestra sus presentaciones con nombre y precio. El filtro permite todos los tamaños, uno concreto o sin tamaño. Las categorías no se mezclan y ninguna variante pierde su precio aunque existan nombres duplicados.

La comanda y la proyección de productos en Pedidos usan el nombre completo `plato · tamaño`. Cambiar nombre u orden de un tamaño actualiza el catálogo mediante eventos; no reescribe los snapshots de pedidos ni comprobantes anteriores.

La carta digital reúne los eventos consecutivos en una recarga, 200 ms después del último evento. Así, renombrar un tamaño usado por muchos platos no provoca una consulta por cada plato y dispositivo. La consulta periódica sigue disponible como recuperación.

## Contrato y almacenamiento

`servicio-inventario` administra `tamanos_plato` y la relación nullable `productos.tamanoId`. El contrato aditivo de catálogo es versión 2 (`CATALOGO_SCHEMA_VERSION`); las respuestas incluyen `tamanoId` y `tamano`, y los productos anteriores sin estos campos siguen siendo compatibles.

| Operación | Ruta de Inventario |
| --- | --- |
| Listar tamaños | `GET /inventario/tamanos-plato` |
| Crear | `POST /inventario/tamanos-plato` |
| Editar nombre, orden o activo | `PATCH /inventario/tamanos-plato/:id` |
| Eliminar si no está en uso | `DELETE /inventario/tamanos-plato/:id` |
| Filtrar productos | `GET /inventario/productos?tamanoId=<id>` |
| Productos sin tamaño | `GET /inventario/productos?tamanoId=SIN_TAMANO` |
| Orden por categoría, tamaño y nombre | `GET /inventario/productos?ordenPorTamano=true` |

El cliente agrega el prefijo de API configurado y la sede cuando corresponde. El borrado está protegido también por una clave foránea `RESTRICT`. La creación/edición de productos y de menú del día comparte la misma validación de asignación.

## Migración y actualización instalada

La migración `apps/servicio-inventario/prisma/migrations/20260902120000_tamanos_plato/migration.sql` crea el catálogo por sede y extrae solamente sufijos completos conocidos separados por `·` o entre paréntesis. No distingue mayúsculas y normaliza `Mediana` a `Mediano`.

| Antes | Nombre después | Tamaño |
| --- | --- | --- |
| `Ceviche · Personal` | `Ceviche` | Personal |
| `Ceviche · Mediana` | `Ceviche` | Mediano |
| `Arroz (Familiar)` | `Arroz` | Familiar |
| `Arroz familiar especial` | Sin cambios | Sin tamaño |
| `Plato · Gigante` | Sin cambios | Sin tamaño |

Los nombres ambiguos se revisan manualmente desde Carta. La migración conserva IDs, precios, stock y disponibilidad; no modifica pedidos históricos. Genera eventos `producto.actualizado` para refrescar las proyecciones sin cambiar esos históricos. El seed de pruebas utiliza ahora nombre base y tamaño separado; no debe ejecutarse para actualizar datos reales.

**Estado de esta entrega:** código y migración preparados. Esta documentación no confirma que la migración esté aplicada en la instalación del restaurante. Actualizar la base real requiere autorización y respaldo previo.

Para desplegar, después de la autorización:

1. Respaldar Inventario y los archivos instalados que se reemplazarán. Guardar una comparación de los productos antes y después; confirmar que IDs y precios permanecen iguales.
2. Actualizar los builds de **servicio-inventario**, **servicio-pedidos**, la **PWA** y las migraciones de Inventario del runtime. No basta con sustituir la interfaz.
3. Reiniciar **La Barra del Ceviche** mediante **Salir** de la bandeja y abrirla otra vez. El runtime aplica las migraciones pendientes antes de iniciar los servicios. Esto reinicia también Inventario y Pedidos.
4. Verificar salud de servicios, tamaños y precios de la carta; recargar los navegadores de los dispositivos. No crear pedidos, pagos o comprobantes reales para esta validación.

## Pruebas y evaluaciones

Desde la raíz del repositorio:

```powershell
npm exec nx run pwa-cliente:test -- --skipNxCache
npm exec nx run servicio-inventario:test -- --skipNxCache
npm exec nx run servicio-pedidos:test -- --skipNxCache
npm exec nx run contracts:test -- --skipNxCache
npm exec nx run escritorio:eval -- --skipNxCache
node --test tools/tauri-local/seed-la-barra.test.mjs
```

La validación registrada de esta entrega pasó 1061 pruebas de PWA, 183 de Inventario, 140 de Pedidos y 26 de contratos. Las suites incluyen CRUD, aislamiento por sede, tamaño inactivo, filtros, orden, formularios, comanda y precios de carta digital. Los campos de edición del tamaño aceptan omisión, pero rechazan `null` como entrada inválida; `producto.tamanoId: null` sigue siendo válido para quitar una asignación.

El build y lint de Inventario pasaron. La evaluación estática de escritorio pasó 89 verificaciones de cableado y recursos; no sustituye una prueba de instalación ni una validación SQL.

La revisión visual en navegador con ancho móvil de 393 px y **datos ficticios** comprobó los grupos Personal, Mediano, Grande y Familiar dentro de Arroces, el filtro Familiar y que el carrito conserva tamaño y precio al volver a categorías. En carta digital se verificaron cuatro precios por plato y el filtro Familiar. No se generaron pedidos ni comprobantes en producción.

Para ejecutar la migración real contra una **base PostgreSQL de pruebas aislada**, no la del restaurante:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://size_test@127.0.0.1:55439/postgres'
node apps/servicio-inventario/prisma/eval-tamanos.mjs
Remove-Item Env:TEST_DATABASE_URL
```

La URL es un ejemplo del clúster de pruebas local y debe ajustarse a la base aislada disponible. El script requiere `TEST_DATABASE_URL`, crea un schema aleatorio dentro de una transacción y revierte todo al terminar. No lee ni escribe tablas de la aplicación. Pasó 11 casos de nombres, con ocho tamaños en dos sedes y seis eventos; verificó restricciones de borrado y duplicación, orden, eventos y conservación de precios, stock, disponibilidad e históricos.
