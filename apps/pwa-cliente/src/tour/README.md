# Guías de uso de La Barra del Ceviche

El botón `?` de la barra superior abre la guía inicial y una guía por cada módulo autorizado para el usuario. Las mismas guías funcionan en Tauri (laptop servidor) y en el frontend de celulares/tablets. Las definiciones viven en `catalog.ts`; `permisos.ts` sigue siendo la fuente de verdad para qué módulos ve cada rol.

Se usa Driver.js 1.8 (MIT), no Shepherd. `spotlight.ts` coloca cuatro paneles con `backdrop-filter` alrededor del control señalado. Así el fondo se desenfoca en **cada paso**, mientras el control y el texto permanecen nítidos. Al avanzar, desplazar, redimensionar o cerrar, los paneles se actualizan o retiran. En celular se sale con el botón × o tocando el fondo. El catálogo nunca pulsa controles: cobrar, emitir a SUNAT, anular y cerrar caja requieren acción explícita del usuario.

Para agregar un módulo: añadir su contenido a `GUIDES`, seleccionar objetivos visibles y estables, y actualizar `catalog.test.ts`. Para un control que solo existe en una modalidad o con datos, el motor espera hasta 2,5 s y salta el paso si falta. Los pasos exclusivos de un rol indican `roles`. El progreso se guarda por usuario y versión en `localStorage`; cambiar `GUIDE_VERSION` inicia una nueva edición de las guías.

Limitaciones intencionales:

- La bandeja nativa de Windows no pertenece al DOM; la guía puede explicar su uso, pero no resaltarla.
- `Servidor local` administra procesos y respaldos solo desde la laptop. En un celular se verá la explicación inicial, pero las acciones locales no estarán disponibles.
- Los roles disponibles son fijos. Si se añade un rol nuevo, primero actualizar `permisos.ts` y sus recorridos.
