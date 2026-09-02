# Operación del servidor local — La Barra del Ceviche

Basado en RestoApp del Ingeniero en Sistemas e Informática Max Alessandro García López.

## Instalación y primer inicio

1. Ejecuta el instalador de Windows como administrador. La instalación es por máquina y agrega una regla de firewall para TCP 3210, limitada a la subred local y válida aunque Windows clasifique la red del restaurante como pública.
2. Abre **La Barra del Ceviche**. El primer arranque puede tardar varios minutos: inicializa PostgreSQL, crea 11 bases, aplica migraciones y espera que todos los microservicios estén saludables.
3. Completa **Configuración inicial** con el nombre, correo y contraseña del administrador. Este formulario solo está disponible desde la laptop servidor.
4. En **Administración → Servidor local**, confirma que todos los procesos estén activos.

No se requiere Docker, Node.js, PostgreSQL ni NATS instalados en la laptop.

## Acceso desde celulares y cocina

- Dirección: la URL con IP mostrada en **Servidor local**, por ejemplo `http://192.168.100.5:3210`.
- Los dispositivos deben estar conectados al mismo Wi-Fi privado del restaurante.
- Usa **Copiar dirección** o el QR del módulo. La carta pública no requiere login; meseros, cocina, caja y administración usan sus credenciales y permisos.

Para que la IP no cambie, entra al router y crea una reserva DHCP para la dirección MAC indicada por la aplicación. Después prueba el mismo QR apagando y encendiendo tanto el router como la laptop.

## Cocina e impresión automática

1. Instala la impresora térmica en Windows y verifica una página de prueba.
2. En **Servidor local**, selecciona la impresora, ancho de papel (58 u 80 mm), copias y activa la impresión.
3. Cuando llega `pedido.creado`, JetStream entrega el evento al consumidor durable de cocina.
4. La cola genera una sola comanda por `eventId`; imprime mediante el spooler RAW de Windows y registra pendiente, impresa o fallida.
5. Los productos con área `COCINA` se imprimen; `BAR` y `DIRECTO` no aparecen en la comanda de cocina. Los datos heredados sin área se imprimen por compatibilidad.

Si la impresora está desconectada o sin papel, el trabajo queda fallido con reintento progresivo. Corrige la impresora y usa **Reintentar**. La prueba definitiva debe hacerse con la marca, conexión y corte de papel reales del local.

## Respaldos y datos

- Los datos se guardan fuera de la carpeta del programa, bajo `%LOCALAPPDATA%\pe.restoapp.labarradelceviche`.
- Se crea un respaldo automático todos los días a las 03:00.
- **Crear respaldo** permite generar uno en el momento y consultar el historial.
- Desinstalar o actualizar la aplicación no debe borrar los datos del restaurante.
- Antes del piloto, copia un respaldo a una unidad externa y comprueba su restauración en otra laptop.

## Arranque, bandeja y cierre

- La aplicación puede iniciar con Windows.
- Cerrar la ventana la oculta en la bandeja; el servidor sigue atendiendo a los celulares.
- Usa **Salir** en la bandeja para cerrar limpiamente gateway, servicios, NATS y PostgreSQL.
- Solo puede existir una instancia del servidor.

## Diagnóstico rápido

1. Confirma que Windows marque la red como **Privada**.
2. Revisa que la laptop y el celular estén en la misma red y que no esté activo el aislamiento de clientes del router.
3. Copia exactamente la URL con IP que muestra **Servidor local** y comprueba que responda desde el celular.
4. Revisa en **Servidor local** los estados individuales; reinicia únicamente el servicio que falle.
5. Revisa los logs dentro del directorio de datos y conserva el mensaje exacto del último error.
6. Para impresión, confirma nombre de impresora, papel, cola de Windows y una página de prueba.

Si el runtime no puede iniciarse, la ventana permanece abierta mostrando el error y también lo registra en `%LOCALAPPDATA%\pe.restoapp.labarradelceviche\logs\desktop-runtime.log`.

## Validación de desarrollo

```sh
npm run desktop:prepare
npm run desktop:check
npm run eval:tauri-local
npm exec nx run runtime-local:test -- --skipNxCache
npm run desktop:build
```

La evaluación automatizada verifica 11 builds y migraciones independientes, checksums de Node/PostgreSQL/NATS/runtime, puerto fijo, restricción local de administración, impresión RAW y configuración NSIS/WebView2.
