# Plan ejecutado: Tauri, servidor local, carta QR y cocina

**Estado al 30 de agosto de 2026:** primera versión funcional implementada y validada localmente. Pendientes del piloto: probar el instalador en una laptop limpia, reservar la IP en el router real y calibrar la impresora física.

## Resultado de la ejecución

- Se conserva el monorepo Nx y los 11 microservicios como procesos y bases independientes.
- Tauri 2 inicia y supervisa PostgreSQL portable, NATS JetStream, los servicios y el gateway/PWA.
- La aplicación publica la URL IP de la laptop en el puerto fijo `3210` y permite copiarla o crear el QR.
- El módulo **Servidor local** informa salud, dispositivos, red, impresora, respaldos y permite reiniciar cada servicio.
- El primer arranque crea de forma local al administrador inicial.
- Los pedidos `pedido.creado` generan una comanda durable; la impresión RAW de Windows evita duplicados por `eventId`, reintenta fallos y excluye ítems de despacho directo.
- El instalador NSIS incluye WebView2, reglas de firewall para red privada, inicio automático, bandeja y el icono oficial entregado.
- La validación portable levantó 13 de 13 procesos saludables: PostgreSQL, NATS y 11 microservicios.

## Objetivo

Entregar La Barra del Ceviche como un instalador de Windows que convierta la laptop principal en el servidor del restaurante. La aplicación debe seguir funcionando sin Internet dentro de la red Wi-Fi local y atender tres tipos de cliente:

- aplicación de escritorio en la laptop principal;
- celulares de meseros y comensales mediante navegador/PWA;
- estación de cocina con pantalla de pedidos e impresión automática.

La base actual usa un monorepo Nx con 11 microservicios, 11 bases PostgreSQL, RabbitMQ y Kong. Se conservarán el monorepo, los límites de cada servicio, sus contratos y la propiedad separada de los datos. Lo que cambiará será la forma de distribución: el instalador final coordinará todo para que el restaurante no tenga que instalar ni operar Docker, Node.js, PostgreSQL o RabbitMQ por separado.

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
              | Supervisor local                      |
              | - gateway + PWA + WebSocket           |
              | - sidecars de los microservicios      |
              | - transporte durable de eventos       |
              | - datos separados por servicio        |
              | - impresión y copias de seguridad     |
              +---------------------------------------+
```

### Decisión central

Mantener el **monorepo y la separación lógica y ejecutable de los microservicios**, pero empaquetarlos para que operativamente se comporten como una sola aplicación de escritorio. Así se conserva la arquitectura de RestoApp sin trasladar su complejidad operativa al restaurante.

- Nx seguirá administrando aplicaciones, librerías compartidas, contratos, pruebas y tareas de compilación.
- Identidad, mesas, pedidos, cuentas, caja, inventario, cocina, reportes, facturación y compras conservarán sus propios límites y procesos; no se fusionarán en un monolito.
- Tauri no contendrá reglas de negocio. Actuará como interfaz, instalador y supervisor: iniciará los servicios en orden, comprobará su salud, reiniciará únicamente el que falle y realizará un cierre limpio.
- Cada microservicio se compilará como sidecar autocontenido, sin requerir Node.js instalado en la laptop. Tauri documenta oficialmente este patrón: <https://v2.tauri.app/learn/sidecar-nodejs/>.
- Un gateway local mantendrá una sola URL pública y ocultará los puertos internos. Los celulares nunca tendrán que conocer la dirección individual de cada servicio.
- Los contratos de eventos seguirán desacoplados. Para el perfil local se incorporará un transporte durable empaquetado y una outbox por servicio; el código de dominio no dependerá directamente de RabbitMQ ni de otro servicio.
- Se conservará la propiedad de datos por servicio. Ningún microservicio accederá directamente a las tablas o archivos de otro. El perfil local podrá usar almacenamiento embebido separado por servicio, mientras el perfil servidor conservará PostgreSQL/RabbitMQ mediante adaptadores.
- El repositorio seguirá permitiendo el despliegue distribuido actual. Tauri será un perfil adicional de ejecución y distribución, no una reescritura que elimine la arquitectura existente.

Esta opción requiere construir un supervisor, perfiles de infraestructura y empaquetado reproducible, pero ofrece instalación simple, arranque automático y recuperación controlada sin dejar de ser un monorepo de microservicios.

## Fases de ejecución

### Fase 1. Contrato y línea base

1. Inventariar los 11 microservicios, sus puertos, dependencias, eventos, bases y orden de arranque.
2. Congelar los contratos HTTP, eventos y WebSocket que usa la PWA.
3. Documentar como invariantes que cada servicio mantiene proceso, API y propiedad de datos independientes.
4. Ejecutar y registrar tests actuales por servicio.
5. Crear pruebas de paridad para mesa → pedido → cocina → cuenta → pago.
6. Definir perfiles de infraestructura `servidor` y `tauri-local`, directorios de aplicación y política de respaldo.

**Salida:** matriz de endpoints/eventos y línea base verde. No cambia todavía el comportamiento visible.

### Fase 2. Runtime local de microservicios

1. Crear un perfil `tauri-local` para compilar y ejecutar cada microservicio como sidecar independiente.
2. Mantener los controladores, servicios, contratos y validaciones en sus aplicaciones actuales; no crear un `servidor-local` monolítico.
3. Incorporar adaptadores de persistencia local respetando una base o archivo independiente por servicio, migraciones versionadas y transacciones cortas.
4. Incorporar transporte durable local compatible con los contratos de eventos, outbox, reintentos e idempotencia.
5. Empaquetar un gateway local que sirva la PWA y enrute API/WebSocket a los servicios sin exponer puertos internos.
6. Añadir health checks por servicio, logs rotativos identificados por origen y recuperación individual tras un cierre inesperado.
7. Medir tiempo de arranque, memoria, CPU y espacio para decidir qué infraestructura embebida cumple el perfil de la laptop real.

**Gate:** el flujo principal debe pasar las pruebas de paridad y debe demostrarse que siguen existiendo procesos y datos aislados por servicio antes de retirar la pila Docker del instalador.

### Fase 3. Aplicación Tauri para la laptop servidor

1. Crear Tauri 2 sobre la PWA actual y empaquetar el gateway, el transporte local y los microservicios como sidecars.
2. Garantizar una sola instancia del supervisor, inicio por dependencias y cierre limpio de todos los procesos.
3. Vigilar health checks y reiniciar de forma aislada el servicio que falle, con límite de intentos y diagnóstico visible.
4. Crear el módulo **Servidor local** con:
   - estado y tiempo activo;
   - IP, puerto y URL completa;
   - botón **Copiar dirección**;
   - QR de acceso;
   - cantidad de dispositivos conectados;
   - diagnóstico de red, base de datos e impresora;
   - iniciar, reiniciar y exportar logs;
   - crear y restaurar respaldo.
5. Configurar arranque con Windows y funcionamiento en bandeja.
6. Crear instalador NSIS `La-Barra-del-Ceviche-Setup.exe`, con iconos de marca y WebView2 disponible sin depender de Internet. Tauri admite instaladores NSIS/MSI y modos de WebView2 para equipos sin conexión: <https://v2.tauri.app/distribute/windows-installer/>.

### Fase 4. Dirección estable y QR único

Una aplicación no puede obligar por sí sola al router a entregar siempre la misma IP. La garantía real será una **reserva DHCP por MAC en el router**. El instalador detectará IP, MAC, adaptador y perfil de red, y el módulo mostrará si la reserva está pendiente o validada.

1. Usar el puerto fijo `3210` y aceptar conexiones LAN; el firewall limita el acceso a la subred local.
2. Crear la regla de Windows Firewall durante la instalación.
3. Reservar una IP para la laptop en el router del restaurante.
4. Generar un QR por sede con la ruta estable `http://IP-FIJA:3210/carta/<sedeId>`.
5. Mostrar y copiar únicamente la URL con IP, sin depender de nombres `.local` ni mDNS.
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
8. Mantener aislamiento de credenciales, datos, migraciones y logs por microservicio.

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
- El supervisor inicia y vigila los microservicios como procesos separados; la caída de uno no obliga a reiniciar todos.
- Cada servicio conserva su API, contratos y propiedad exclusiva de datos dentro del monorepo Nx.
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
