# Plan propuesto: Tauri, servidor local, carta QR y cocina

**Estado:** propuesta para revisión. No implementar hasta aprobación.

## Objetivo

Entregar La Barra del Ceviche como un instalador de Windows que convierta la laptop principal en el servidor del restaurante. La aplicación debe seguir funcionando sin Internet dentro de la red Wi-Fi local y atender tres tipos de cliente:

- aplicación de escritorio en la laptop principal;
- celulares de meseros y comensales mediante navegador/PWA;
- estación de cocina con pantalla de pedidos e impresión automática.

La base actual usa 11 microservicios, 11 bases PostgreSQL, RabbitMQ y Kong. Ejecutarla de esa forma en la laptop exigiría Docker Desktop y demasiada operación manual. El instalador final no debe depender de Docker, Node.js, PostgreSQL ni RabbitMQ instalados por el restaurante.

## Arquitectura recomendada

```text
                         Wi-Fi privada del restaurante

  Comensales                 Meseros                 Cocina
  carta pública              PWA operativa           KDS / impresora
       |                          |                         |
       +--------------------------+-------------------------+
                                  |
                    http://IP-FIJA:3210
                                  |
              +---------------------------------------+
              | Laptop servidor, Windows 10/11 x64    |
              |                                       |
              | Tauri 2                               |
              | - ventana de operación                |
              | - módulo Estado del servidor          |
              | - copiar URL y mostrar QR             |
              | - inicio automático y bandeja         |
              |                                       |
              | Sidecar servidor-local                |
              | - PWA + API + WebSocket               |
              | - módulos de negocio NestJS           |
              | - cola durable de impresión           |
              | - SQLite WAL + copias de seguridad    |
              +---------------------------------------+
```

### Decisión central

Crear un **monolito modular local** reutilizando contratos, reglas y pruebas de los servicios actuales. Los límites de identidad, mesas, pedidos, cuentas, caja, inventario, cocina, reportes, facturación y compras se conservan como módulos, pero se ejecutan en un solo proceso.

- RabbitMQ se reemplaza por eventos internos y una outbox durable.
- Kong se reemplaza por un único servidor HTTP con las mismas rutas públicas necesarias.
- Las bases por servicio se consolidan en SQLite con WAL, migraciones versionadas y transacciones cortas.
- El servidor NestJS se compila como binario autocontenido y Tauri lo inicia como sidecar. Tauri documenta oficialmente el empaquetado de un servidor Node.js sin requerir Node en la computadora final: <https://v2.tauri.app/learn/sidecar-nodejs/>.

Esta opción exige más trabajo de migración que envolver Docker, pero produce el resultado correcto para el negocio: instalación simple, menor consumo, respaldo de un solo archivo de datos y arranque automático.

## Fases de ejecución

### Fase 1. Contrato y línea base

1. Congelar los contratos HTTP y WebSocket que usa la PWA.
2. Ejecutar y registrar tests actuales por módulo.
3. Crear pruebas de paridad para mesa → pedido → cocina → cuenta → pago.
4. Definir el formato de datos local, directorio de aplicación y política de respaldo.

**Salida:** matriz de endpoints/eventos y línea base verde. No cambia todavía el comportamiento visible.

### Fase 2. Servidor local único

1. Crear `apps/servidor-local` como aplicación NestJS modular.
2. Reutilizar controladores, servicios, contratos y validaciones actuales.
3. Migrar persistencia a SQLite WAL con una sola cola de escritura.
4. Sustituir RabbitMQ por event bus interno + outbox con reintentos e idempotencia.
5. Servir la PWA compilada, API y WebSocket desde el mismo origen.
6. Añadir migraciones automáticas, health check, logs rotativos y recuperación tras cierre inesperado.

**Gate:** el flujo principal y los módulos críticos deben pasar las pruebas de paridad antes de retirar la pila Docker del instalador.

### Fase 3. Aplicación Tauri para la laptop servidor

1. Crear Tauri 2 sobre la PWA actual y empaquetar `servidor-local` como sidecar.
2. Garantizar una sola instancia, inicio ordenado y cierre limpio.
3. Crear el módulo **Servidor local** con:
   - estado y tiempo activo;
   - IP, puerto y URL completa;
   - botón **Copiar dirección**;
   - QR de acceso;
   - cantidad de dispositivos conectados;
   - diagnóstico de red, base de datos e impresora;
   - iniciar, reiniciar y exportar logs;
   - crear y restaurar respaldo.
4. Configurar arranque con Windows y funcionamiento en bandeja.
5. Crear instalador NSIS `La-Barra-del-Ceviche-Setup.exe`, con iconos de marca y WebView2 disponible sin depender de Internet. Tauri admite instaladores NSIS/MSI y modos de WebView2 para equipos sin conexión: <https://v2.tauri.app/distribute/windows-installer/>.

### Fase 4. Dirección estable y QR único

Una aplicación no puede obligar por sí sola al router a entregar siempre la misma IP. La garantía real será una **reserva DHCP por MAC en el router**. El instalador detectará IP, MAC, adaptador y perfil de red, y el módulo mostrará si la reserva está pendiente o validada.

1. Usar un puerto fijo, propuesto `3210`, y escuchar solo en red privada.
2. Crear la regla de Windows Firewall durante la instalación.
3. Reservar una IP para la laptop en el router del restaurante.
4. Generar un QR por sede con la ruta estable `http://IP-FIJA:3210/carta/<sedeId>`.
5. Mantener `barra-ceviche.local` como alias mDNS de apoyo, no como única garantía.
6. Añadir un asistente que pruebe la URL desde otro dispositivo antes de dar el QR por definitivo.

**Gate:** apagar y encender router y laptop; el mismo QR debe abrir la carta sin regenerarse.

### Fase 5. Meseros y comensales

1. Mantener la carta pública sin login y el resto protegido por rol.
2. Permitir que los meseros abran la URL en Android/iPhone y opcionalmente instalen la PWA en la pantalla de inicio.
3. Añadir enrolamiento de dispositivo o login corto por PIN, sesiones revocables y lista de equipos conectados.
4. Conservar idempotencia al enviar pedidos y una cola local breve para cortes momentáneos de Wi-Fi.
5. Mostrar claramente cuando el celular quedó fuera de la red del restaurante.

### Fase 6. Cocina e impresión automática

Primero se entregará el KDS web en tiempo real. La modalidad de impresión depende de dónde esté conectada la impresora:

- **Impresora conectada a la laptop servidor:** el servidor imprime directamente.
- **Impresora conectada a otra laptop de cocina:** instalar el mismo Tauri en modo **Estación de cocina**, con un agente local de impresión.
- **Tablet Android en cocina:** crear APK solo para esa tablet. Una laptop Windows no usa APK; usa el instalador `.exe`.

La cola de impresión debe guardar `pedidoId`, versión y estado; impedir duplicados automáticos; reintentar fallos; permitir reimpresión manual auditada; y mostrar papel, conexión y último error. Se probarán ESC/POS y el spooler de Windows según el modelo real de impresora.

Tauri 2 permite compartir frontend con Android, pero la compilación móvil requiere Android Studio, SDK y NDK: <https://v2.tauri.app/start/prerequisites/#android>. La APK será una fase separada para no retrasar el servidor Windows.

### Fase 7. Seguridad, respaldo y operación

1. Exponer el servicio únicamente en redes marcadas como privadas.
2. Mantener carta pública de solo lectura y separar permisos de mesero, cocina, caja y administración.
3. No exponer comandos nativos de Tauri a páginas servidas por la LAN.
4. Guardar secretos con protección del sistema operativo, no en archivos versionados.
5. Crear respaldo diario automático de base y adjuntos, retención configurable y restauración probada.
6. Registrar arranque, migración, conexión, pedido, impresión, reintento y restauración con correlation ID.
7. Añadir exportación de diagnóstico en ZIP sin contraseñas ni datos sensibles.

### Fase 8. Validación e instalación piloto

1. Probar el instalador en Windows 10 y 11 limpios, sin herramientas de desarrollo.
2. Probar arranque sin Internet, reinicio inesperado, suspensión y reanudación.
3. Probar al menos 10 celulares simultáneos, carga de carta y envío concurrente de pedidos.
4. Probar caída y retorno del Wi-Fi sin pedidos duplicados.
5. Probar impresora desconectada, sin papel, reconectada y reimpresión manual.
6. Probar respaldo, corrupción simulada y restauración.
7. Hacer piloto en el local, corregir hallazgos y recién después firmar el instalador final.

## Criterios de aceptación

- Doble clic inicia la aplicación y el servidor sin consola ni Docker.
- El módulo muestra una URL copiable y un QR verificable.
- El QR sigue funcionando después de reiniciar router y laptop.
- Meseros crean pedidos desde sus celulares y cocina los recibe en tiempo real.
- Cada pedido imprime una sola vez de forma automática; los reintentos quedan auditados.
- El negocio funciona sin Internet mientras la red local esté activa.
- Un respaldo puede restaurarse en una laptop limpia.
- El instalador, desinstalador y actualización conservan los datos del restaurante.

## Datos que deben confirmarse antes de implementar

1. Windows y arquitectura de la laptop principal.
2. Si cocina usará la misma laptop, otra laptop Windows o una tablet Android.
3. Marca/modelo de la impresora, ancho de papel y conexión USB/Ethernet/Wi-Fi.
4. Modelo del router y acceso para crear la reserva DHCP.
5. Cantidad máxima esperada de meseros, dispositivos y pedidos por hora.
6. Si la aplicación deberá funcionar solo dentro del local o también desde Internet.

## Orden de aprobación sugerido

1. Aprobar o ajustar esta arquitectura.
2. Ejecutar Fases 1 a 3 y entregar una primera instalación local.
3. Validar dirección fija y QR en el router real.
4. Conectar cocina e impresora real.
5. Decidir la APK únicamente si cocina usará Android.
