# contracts

This library was generated with [Nx](https://nx.dev).

## Building

Run `nx build contracts` to build the library.

## Catálogo v2: tamaños de plato

`CATALOGO_SCHEMA_VERSION = 2` añade `TamanoPlatoDto {id,nombre,orden,activo}`
y `ProductoDto.tamanoId`/`tamano` opcionales y anulables. Los clientes anteriores
siguen validando los eventos: su campo `nombre` conserva la presentación
`nombre base · tamaño`. REST entrega el nombre base y el tamaño por separado.
Los consumidores que crean snapshots desde REST deben unir ambos antes de
registrar el ítem; nunca modificar snapshots de pedidos ya emitidos.

`CrearProductoCommand` y `ActualizarProductoCommand` admiten `tamanoId`;
en PATCH omitirlo conserva el tamaño y `null` lo quita. La relación es por sede.
Un tamaño inactivo puede conservarse en sus productos actuales, pero no
asignarse a otro. Eliminarlo está prohibido mientras tenga productos.

Rutas de inventario: `GET/POST tamanos-plato`, `PATCH/DELETE tamanos-plato/:id`.
Reciben `sedeId` por query; la sede fija del usuario prevalece. GET devuelve
`{tamanos}`, POST/PATCH `{tamano,message}`, DELETE `{message}`. La lectura
respeta roles de catálogo y las escrituras exigen ADMIN, SISTEMA o GERENCIA.
GET no crea datos. La migración inicializa Personal, Mediano, Grande y Familiar
en sedes existentes; en nuevas sedes el administrador crea sus tamaños.

`ListarProductosQuery.tamanoId` filtra por ID; `SIN_TAMANO` significa NULL.
`ordenPorTamano=true` ordena por categoría, orden del tamaño (NULL al final en
PostgreSQL ASC), nombre de producto e ID como desempate de paginación.
La carta pública usa ese orden y expone la misma metadata de tamaño.
