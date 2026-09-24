# Carta digital y tamaños

La carta pública recibe los tamaños de cada producto (`tamanoId` y `tamano`)
desde inventario. Agrupa productos con el mismo nombre base y categoría y
muestra una variante por ID de producto, con el nombre de tamaño y su precio.
El orden visual corresponde a `tamano.orden`, incluso para tamaños propios.
Dos productos con igual nombre y tamaño conservan ambos precios; no se
sobrescriben ni se mezclan entre categorías.

La ruta pública `/carta/:sedeId`, tanto en navegador como en el servidor local
que abre la aplicación Tauri, usa `BookCartaScreen`. La portada, índice y
páginas de platos conservan el formato de libro. Los tamaños y precios aparecen
juntos en cada plato. El libro usa el logo local y la paleta blanco/negro de
La Barra del Ceviche. `PublicCartaScreen` permanece como implementación
anterior y conserva sus pruebas, pero ya no recibe tráfico desde la ruta.

La lista de categorías y los platos tienen scroll táctil propio. `page-flip`
reescribe el `display` de cada página durante el giro; por eso el contenido
desplazable vive dentro de `.cb-page-content`. Cambios de stock o
disponibilidad llegan por socket o consulta periódica. `updateFromHtml`
actualiza el mismo libro y conserva la categoría y la parte abierta. Si hay un
giro activo, la actualización espera a que termine.

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

La suite verifica navegación, scroll táctil, stock/disponibilidad,
actualización sin reiniciar el libro y precios. La evaluación permuta orden,
categorías, tamaños propios y duplicados y exige conservar todos los IDs y
precios disponibles. Las pruebas del visor de libro están en
`BookCartaScreen.spec.tsx`, `bookModel.spec.ts` y `e2e/carta-libro.spec.ts`.
