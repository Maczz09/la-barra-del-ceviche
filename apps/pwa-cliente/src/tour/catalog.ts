import { accesoDeRol, type RutaApp } from '../auth/permisos';

export const GUIDE_VERSION = 1;

export interface GuideStep {
  title: string;
  description: string;
  target: string;
  roles?: readonly string[];
}

export interface Guide {
  route: RutaApp;
  title: string;
  steps: readonly GuideStep[];
}

const step = (title: string, description: string, target = '#contenido .page-h', roles?: readonly string[]): GuideStep => ({ title, description, target, roles });

/** Los recorridos enseñan controles, pero no los activan ni escriben datos. */
export const GUIDES: Record<RutaApp, Guide> = {
  inicio: { route: 'inicio', title: 'Inicio', steps: [
    step('Resumen del negocio', 'Consulta ventas, actividad, salón, cocina, caja y próximas reservas.'),
    step('Carta pública y QR', 'Copia el enlace o descarga el QR para compartir la carta con los comensales.', '#contenido [data-guide="home-qr"]'),
  ] },
  mesas: { route: 'mesas', title: 'Mesas', steps: [
    step('Salón en vivo', 'Toca una mesa para consultar su estado. Si tu rol lo permite, podrás tomar o agregar un pedido.'),
    step('Pisos y zonas', 'Filtra el salón por piso o ubicación.', '#contenido .mesa-zone-filter'),
    step('Unir y separar mesas', 'Selecciona dos o más mesas para una cuenta compartida. Desde el detalle puedes separarlas.', '#contenido .page-h button:nth-of-type(2)'),
    step('Nuevo pedido', 'Abre el comandero para salón, delivery o para llevar. El tutorial no envía pedidos.', '#contenido .page-h .btn-primary', ['ADMIN', 'SISTEMA', 'CAJERO', 'MESERO']),
    step('Administrar mesas', 'Crea mesas y gestiona ubicaciones.', '#contenido .module-side', ['ADMIN', 'SISTEMA']),
  ] },
  pedidos: { route: 'pedidos', title: 'Pedidos', steps: [
    step('Tablero de pedidos', 'Consulta pedidos y sus estados, abre detalles y avanza cada etapa.'),
    step('Tablero o lista', 'Cambia la presentación de los pedidos.', '#contenido .page-h .seg'),
    step('Canales', 'Filtra salón, delivery y para llevar.', '#contenido .canal-tabs'),
    step('Crear comanda', 'Elige canal y mesa; entra a una categoría, selecciona plato y tamaño, ajusta cantidades y envía.', '#contenido .page-h .btn-primary'),
    step('Nuevo', 'Aquí aparecen las comandas recién enviadas. Abre una tarjeta para ver sus platos y estado.', '#contenido .ped-col:first-child'),
    step('En preparación', 'Los pedidos avanzan aquí cuando cocina comienza a trabajar. El mesero recibe el cambio de estado.', '#contenido .ped-col:nth-child(2)'),
    step('Listo', 'Consulta los platos listos para llevar a la mesa, entregar o despachar.', '#contenido .ped-col:nth-child(3)'),
    step('Buscar y refrescar', 'Busca por código de atención y actualiza el tablero.', '#contenido .search-box'),
    step('Avisos sonoros', 'Activa y prueba el audio desde este botón para oír cambios de estado en este dispositivo.', '#contenido [data-guide="sound-alerts"]'),
    step('Anulaciones', 'Desde el detalle de una comanda puedes anular un pedido o un plato con motivo. La guía no realiza anulaciones.', '#contenido .ped-col'),
  ] },
  cocina: { route: 'cocina', title: 'Cocina', steps: [
    step('KDS de cocina', 'Revisa pedidos nuevos, en preparación y listos; abre cada detalle y avanza su estado.'),
    step('Nuevos', 'Los tickets que acaban de entrar esperan aquí. Ábrelos y pásalos a preparación.', '#contenido .kds-col:first-child'),
    step('En preparación', 'Organiza los platos que cocina está preparando y márcalos listos cuando termines.', '#contenido .kds-col:nth-child(2)'),
    step('Listos', 'Consulta los platos terminados y su tiempo en el tablero.', '#contenido .kds-col:nth-child(3)'),
    step('Avisos sonoros', 'Activa y prueba el sonido en esta tablet o laptop para reconocer nuevos tickets y cambios de etapa.', '#contenido [data-guide="sound-alerts"]'),
    step('Pantalla completa', 'Amplía el tablero para la pantalla o tablet de cocina.', '#contenido .page-h button[aria-label="Pantalla completa"]'),
  ] },
  'impresion-cocina': { route: 'impresion-cocina', title: 'Impresión de cocina', steps: [
    step('Impresión automática', 'Activa los tickets al llegar un pedido y elige la impresora conectada a la laptop.'),
    step('Formato', 'Elige papel de 58 u 80 mm y copias; luego pulsa Guardar.', '#contenido .server-form'),
    step('Cola de tickets', 'Consulta pendientes, impresos y fallidos. Reintentar devuelve un ticket fallido a la cola.', '#contenido .server-grid .panel:last-child'),
  ] },
  caja: { route: 'caja', title: 'Caja', steps: [
    step('Turno de caja', 'Abre un turno con monto inicial. Al finalizar, revisa el arqueo y cierra.'),
    step('Cobrar cuenta', 'Selecciona mesa, divide la cuenta si corresponde y combina efectivo, tarjeta, Yape, Plin o transferencia.', '#contenido [data-guide="charge-account"]'),
    step('Movimientos', 'Consulta pagos, importes y detalles de las transacciones del turno.', '#contenido .module-grid > .panel'),
    step('Acciones del turno', 'Desde aquí registra ingresos o egresos, cobra una cuenta y abre el arqueo para cerrar caja.', '#contenido .qa-grid'),
    step('Tickets', 'Consulta el estado de los tickets internos. Para imprimir uno, abre el detalle de la transacción correspondiente.', '#contenido .caja-aside .panel:last-child'),
  ] },
  'historial-caja': { route: 'historial-caja', title: 'Historial de caja', steps: [
    step('Historial de turnos', 'Filtra turnos por fecha y estado.'),
    step('Detalle y cierre Z', 'Consulta arqueo, ventas por método y transacciones; imprime el cierre Z si lo necesitas.', '#contenido .panel'),
  ] },
  reservas: { route: 'reservas', title: 'Reservas', steps: [
    step('Agenda', 'Selecciona una fecha para consultar las reservas.'),
    step('Buscar y confirmar', 'Busca por código; Confirmar y Cancelar modifican el estado de una reserva.', '#contenido .module-grid .panel:first-child'),
    step('Nueva reserva', 'Introduce cliente, teléfono, fecha, hora, mesa y comensales. Consulta disponibilidad antes de guardar.', '#contenido .module-side'),
  ] },
  carta: { route: 'carta', title: 'Carta y menú', steps: [
    step('Carta y menú del día', 'Alterna entre la carta fija y los platos ofrecidos hoy.'),
    step('Categorías y tamaños', 'Filtra por estación y categoría. Usa estos controles para seleccionar tamaño u ordenar los platos.', '#contenido .carta-filtros-tamano'),
    step('Disponibilidad', 'Marca un plato disponible o agotado para controlar si aparece en la comanda.', '#contenido .table-wrap'),
    step('Crear y editar', 'Administra nombre, precio, categoría, tamaño y descripción de cada plato.', '#contenido .page-h', ['ADMIN', 'SISTEMA', 'GERENCIA']),
    step('Tamaños y categorías', 'Los botones superiores llevan a la gestión de tamaños y categorías.', '#contenido .page-h button', ['ADMIN', 'SISTEMA', 'GERENCIA']),
  ] },
  compras: { route: 'compras', title: 'Compras', steps: [
    step('Compras y proveedores', 'Aquí se administran órdenes, insumos y proveedores.'),
    step('Pestañas', 'Cambia entre órdenes de compra, insumos y proveedores.', '#contenido .compras-tabs'),
    step('Órdenes y recepciones', 'Crea una orden, envíala, registra la recepción y adjunta el comprobante.', '#contenido .page-h .btn-primary'),
  ] },
  inventario: { route: 'inventario', title: 'Inventario', steps: [
    step('Existencias', 'Consulta el stock y sus alertas. Cocina solo ve el almacén de insumos.'),
    step('Productos de venta', 'Busca, filtra, repón stock, registra mermas, edita y exporta PDF.', '#contenido .module-toolbar', ['ADMIN', 'SISTEMA', 'GERENCIA']),
    step('Almacén de cocina', 'Consulta stock mínimo y kardex. Registra entradas, consumos y otros movimientos.', '#contenido .panel'),
    step('Gestionar insumos', 'Crea insumos y categorías y realiza conteos físicos.', '#contenido .seg', ['ADMIN', 'SISTEMA', 'GERENCIA']),
  ] },
  mermas: { route: 'mermas', title: 'Mermas', steps: [
    step('Pérdidas y desperdicios', 'Filtra y consulta las mermas de productos e insumos.'),
    step('Editar o eliminar', 'Corrige un registro o elimínalo; eliminar restaura el stock conforme a las reglas del sistema.', '#contenido .panel'),
  ] },
  categorias: { route: 'categorias', title: 'Categorías', steps: [
    step('Organizar categorías', 'Las categorías y subcategorías agrupan platos y productos.'),
    step('Gestionarlas', 'Crea, edita y elimina categorías; revisa tipo y orden antes de guardar.', '#contenido .module-side'),
  ] },
  reportes: { route: 'reportes', title: 'Reportes', steps: [
    step('Resultados', 'Consulta ventas por hora, productos y otros indicadores.'),
    step('Filtros', 'Selecciona un periodo y, si tienes varias sedes, filtra por sede.', '#contenido .page-h + *'),
    step('PDF', 'Exporta el resumen desde el botón superior.', '#contenido .page-h button[title="Exportar PDF"]'),
  ] },
  usuarios: { route: 'usuarios', title: 'Usuarios', steps: [
    step('Equipo y roles', 'Busca y filtra usuarios. Sistema y Gerencia solo pueden consultarlos.'),
    step('Accesos', 'Crea cuentas, cambia roles y contraseñas, edita datos o activa y desactiva usuarios.', '#contenido .module-side', ['ADMIN']),
  ] },
  sedes: { route: 'sedes', title: 'Sedes', steps: [
    step('Sedes', 'Consulta los datos de cada sede. La gestión requiere permisos de Administrador.'),
    step('Administrar sedes', 'Crea, edita, activa, desactiva o elimina sedes.', '#contenido .module-side', ['ADMIN']),
  ] },
  facturacion: { route: 'facturacion', title: 'Facturación', steps: [
    step('Comprobantes SUNAT', 'Consulta pagos disponibles, emitidos, estados SUNAT y notas.'),
    step('Dos RUC', 'Configura hasta dos empresas y selecciona el emisor al facturar cada venta.', '#contenido [data-guide="billing-companies"]'),
    step('Filtrar', 'Filtra por periodo y tipo para encontrar ventas pendientes o comprobantes ya emitidos.', '#contenido .module-toolbar'),
    step('Emitir', 'Abre una venta disponible para emitir boleta o factura con el RUC elegido. Esta guía no enviará documentos.', '#contenido [data-guide="billing-available"]'),
    step('Notas', 'Desde un comprobante emitido puedes crear una nota de crédito o débito e imprimir.', '#contenido [data-guide="billing-issued"]'),
  ] },
  'auditoria-anulaciones': { route: 'auditoria-anulaciones', title: 'Auditoría de anulaciones', steps: [
    step('Auditoría', 'Consulta importes, motivos, estados y atenciones relacionadas.'),
    step('Investigar', 'Filtra por tipo, código y fecha; edita observaciones o invalida un registro.', '#contenido .filters'),
  ] },
  'servidor-local': { route: 'servidor-local', title: 'Servidor local', steps: [
    step('Laptop servidor', 'Este panel administra la laptop servidor; las funciones locales no responden desde otro dispositivo.'),
    step('IP y QR', 'Copia la dirección para el personal. Para conservar el QR, reserva esa IP en el router.', '#contenido .server-hero'),
    step('Red y servicios', 'Consulta salud de los microservicios, reinicios y equipos conectados.', '#contenido .server-grid .panel:first-child'),
    step('Impresión y respaldos', 'Configura la impresora, reintenta fallos y crea o consulta respaldos.', '#contenido .server-grid .panel:last-child'),
  ] },
};

export function guidesForRole(role: string | null | undefined): Guide[] {
  return accesoDeRol(role).rutas.map((route) => GUIDES[route]);
}

export function stepsForRole(route: RutaApp, role: string | null | undefined): GuideStep[] {
  if (!accesoDeRol(role).rutas.includes(route)) return [];
  return GUIDES[route].steps.filter((item) => !item.roles || (role !== null && role !== undefined && item.roles.includes(role)));
}
