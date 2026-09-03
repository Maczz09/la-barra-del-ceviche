# Carta digital y tamaños

La carta pública recibe los tamaños de cada producto (`tamanoId` y `tamano`)
desde inventario. Agrupa productos con el mismo nombre base y categoría y
muestra una variante por ID de producto, con el nombre de tamaño y su precio.
El orden visual corresponde a `tamano.orden`, incluso para tamaños propios.
Dos productos con igual nombre y tamaño conservan ambos precios; no se
sobrescriben ni se mezclan entre categorías.

En una categoría se puede elegir un tamaño, todos o los productos sin tamaño.
Cambiar de categoría limpia el filtro. Disponibilidad y stock se actualizan por
socket y consulta periódica; si el tamaño elegido desaparece, se muestra el
resto de la categoría. La grilla de precios se ajusta al ancho de pantalla.

El socket agrupa ráfagas de `disponibilidad:cambiada`: recarga una sola vez
200 ms después del último evento. Renombrar un tamaño asociado a muchos
platos no dispara una consulta por cada evento. El temporizador se cancela al
desmontar o cambiar de sede, y se usa siempre el callback vigente. La prueba
incluye ráfagas de 1, 25, 50 y 200 eventos.

Un tamaño nulo explícito significa sin tamaño. Solo las respuestas legadas sin
ambos campos admiten compatibilidad con sufijos conocidos `· Personal` o
`(Familiar)`. Los datos explícitos siempre tienen prioridad. Un producto cuyo
tamaño no vino cargado conserva su precio único, sin inventar una presentación.

Pruebas y evaluación determinista:

```powershell
npm exec nx test pwa-cliente -- --skipNxCache --args="src/screens/carta-publica"
```

La suite verifica navegación, filtros, stock/disponibilidad, actualización por
socket y precios. La evaluación permuta orden, categorías, tamaños propios y
duplicados y exige conservar todos los IDs y precios disponibles.
