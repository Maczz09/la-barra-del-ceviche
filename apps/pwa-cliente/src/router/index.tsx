/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
// router/index.tsx — React Router v7, rutas protegidas

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { useAuthStore } from '../store/auth.store';
import { homeDeRol, puedeAcceder, type RutaApp } from '../auth/permisos';

const LoginScreen = lazy(() => import('../screens/login/LoginScreen').then(m => ({ default: m.LoginScreen })));
const InicioScreen = lazy(() => import('../screens/inicio/InicioScreen').then(m => ({ default: m.InicioScreen })));
const MesasScreen = lazy(() => import('../screens/ops/MesasScreen').then(m => ({ default: m.MesasScreen })));
const PedidosScreen = lazy(() => import('../screens/ops/PedidosScreen').then(m => ({ default: m.PedidosScreen })));
const CocinaScreen = lazy(() => import('../screens/ops/CocinaScreen').then(m => ({ default: m.CocinaScreen })));
const CajaScreen = lazy(() => import('../screens/caja/CajaScreen').then(m => ({ default: m.CajaScreen })));
const HistorialCajaScreen = lazy(() => import('../screens/caja/HistorialCajaScreen').then(m => ({ default: m.HistorialCajaScreen })));
const ReservasScreen = lazy(() => import('../screens/reservas/ReservasScreen').then(m => ({ default: m.ReservasScreen })));
const InventarioScreen = lazy(() => import('../screens/inventario/InventarioScreen').then(m => ({ default: m.InventarioScreen })));
const MermasScreen = lazy(() => import('../screens/inventario/MermasScreen').then(m => ({ default: m.MermasScreen })));
const CategoriasScreen = lazy(() => import('../screens/categorias/CategoriasScreen').then(m => ({ default: m.CategoriasScreen })));
const ReportesScreen = lazy(() => import('../screens/reportes/ReportesScreen').then(m => ({ default: m.ReportesScreen })));
const UsuariosScreen = lazy(() => import('../screens/admin/UsuariosScreen').then(m => ({ default: m.UsuariosScreen })));
const AuditoriaAnulacionesScreen = lazy(() => import('../screens/admin/AuditoriaAnulacionesScreen').then(m => ({ default: m.AuditoriaAnulacionesScreen })));
const SedesScreen = lazy(() => import('../screens/sedes/SedesScreen').then(m => ({ default: m.SedesScreen })));
const CartaScreen = lazy(() => import('../screens/carta/CartaScreen').then(m => ({ default: m.CartaScreen })));
const ComprasScreen = lazy(() => import('../screens/compras/ComprasScreen').then(m => ({ default: m.ComprasScreen })));
const FacturacionScreen = lazy(() => import('../screens/facturacion/FacturacionScreen').then(m => ({ default: m.FacturacionScreen })));
const TicketPrintPage = lazy(() => import('../screens/print/TicketPrintPage').then(m => ({ default: m.TicketPrintPage })));
const ComprobantePrintPage = lazy(() => import('../screens/print/ComprobantePrintPage').then(m => ({ default: m.ComprobantePrintPage })));
const ZTicketPrintPage = lazy(() => import('../screens/print/ZTicketPrintPage').then(m => ({ default: m.ZTicketPrintPage })));
const PublicCartaScreen = lazy(() => import('../screens/carta-publica/PublicCartaScreen').then(m => ({ default: m.PublicCartaScreen })));
import { Shell } from '../components/layout/Shell';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';



// ─── Guard: redirige a /login si no está autenticado ────────────
function ProtectedRoute() {
  const authenticated = useAuthStore((s) => s.authenticated);
  if (!authenticated) return <Navigate to="/login" replace />;
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

// ─── Guard: redirige a /app si ya está autenticado ──────────────
function PublicRoute() {
  const authenticated = useAuthStore((s) => s.authenticated);
  if (authenticated) return <Navigate to="/app" replace />;
  return <Outlet />;
}

// ─── Índice de /app: aterriza cada rol en su vista "home" ───────
function IndicePorRol() {
  const rol = useAuthStore((s) => s.user?.rol);
  return <Navigate to={homeDeRol(rol)} replace />;
}

// ─── Guard por rol: bloquea rutas no permitidas para el rol ─────
// Si el rol no puede abrir esta ruta (p. ej. la escribió en la URL),
// se le redirige silenciosamente a su vista "home".
function RutaPorRol({ ruta, children }: Readonly<{ ruta: RutaApp; children: ReactNode }>) {
  const rol = useAuthStore((s) => s.user?.rol);
  if (!puedeAcceder(rol, ruta)) return <Navigate to={`/app/${homeDeRol(rol)}`} replace />;
  return <>{children}</>;
}

function ScreenLoading() {
  return (
    <output className="screen-loading" aria-label="Cargando módulo">
      <div className="loading-head">
        <div className="skel loading-title" />
        <div className="skel loading-action" />
      </div>
      <div className="loading-grid">
        {Array.from({ length: 4 }).map((_) => (
          <div className="stat" key={crypto.randomUUID()}>
            <div className="skel stat-skel-title" />
            <div className="skel stat-skel-value" />
          </div>
        ))}
      </div>
      <div className="panel loading-panel">
        {Array.from({ length: 5 }).map((_) => (
          <div className="skeleton-row" key={crypto.randomUUID()}>
            <div className="skel" />
          </div>
        ))}
      </div>
    </output>
  );
}

function ScreenBoundary({ modulo, children }: Readonly<{ modulo: string; children: ReactNode }>) {
  return (
    <ErrorBoundary moduleName={modulo}>
      <Suspense fallback={<ScreenLoading />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

// ─── Router principal ──────────────────────────────────────────
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pestaña de impresión dedicada: sin Shell, sin auth (lee su payload
            de localStorage, ver utils/ticketPrint.ts) — así Chrome imprime
            solo el ticket, no el layout completo de la app alrededor. */}
        <Route path="/imprimir/boleta" element={<Suspense fallback={null}><TicketPrintPage /></Suspense>} />
        <Route path="/imprimir/comprobante" element={<Suspense fallback={null}><ComprobantePrintPage /></Suspense>} />
        <Route path="/imprimir/cierre" element={<Suspense fallback={null}><ZTicketPrintPage /></Suspense>} />

        {/* Carta pública/QR (T-XX): sin auth, sin Shell — cualquiera con el
            link o que escanee el QR de Inicio la ve. */}
        <Route path="/carta/:sedeId" element={<Suspense fallback={null}><PublicCartaScreen /></Suspense>} />

        {/* Rutas públicas */}
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<Suspense fallback={<ScreenLoading />}><LoginScreen /></Suspense>} />
        </Route>

        {/* Rutas protegidas */}
        <Route path="/app" element={<ProtectedRoute />}>
          <Route index element={<IndicePorRol />} />
          <Route path="inicio" element={<RutaPorRol ruta="inicio"><ScreenBoundary modulo="Inicio"><InicioScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="mesas" element={<RutaPorRol ruta="mesas"><ScreenBoundary modulo="Mesas"><MesasScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="pedidos" element={<RutaPorRol ruta="pedidos"><ScreenBoundary modulo="Pedidos"><PedidosScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="cocina" element={<RutaPorRol ruta="cocina"><ScreenBoundary modulo="Cocina"><CocinaScreen /></ScreenBoundary></RutaPorRol>} />
          {/* "delivery" y "crear-pedido" se fusionaron en el hub Pedidos + Comandero */}
          <Route path="delivery" element={<Navigate to="/app/pedidos" replace />} />
          <Route path="crear-pedido" element={<Navigate to="/app/pedidos" replace />} />
          <Route path="caja" element={<RutaPorRol ruta="caja"><ScreenBoundary modulo="Caja"><CajaScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="historial-caja" element={<RutaPorRol ruta="historial-caja"><ScreenBoundary modulo="Historial de caja"><HistorialCajaScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="reservas" element={<RutaPorRol ruta="reservas"><ScreenBoundary modulo="Reservas"><ReservasScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="inventario" element={<RutaPorRol ruta="inventario"><ScreenBoundary modulo="Inventario"><InventarioScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="mermas" element={<RutaPorRol ruta="mermas"><ScreenBoundary modulo="Mermas"><MermasScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="categorias" element={<RutaPorRol ruta="categorias"><ScreenBoundary modulo="Categorías"><CategoriasScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="reportes" element={<RutaPorRol ruta="reportes"><ScreenBoundary modulo="Reportes"><ReportesScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="usuarios" element={<RutaPorRol ruta="usuarios"><ScreenBoundary modulo="Usuarios"><UsuariosScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="auditoria-anulaciones" element={<RutaPorRol ruta="auditoria-anulaciones"><ScreenBoundary modulo="Auditoría de anulaciones"><AuditoriaAnulacionesScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="sedes" element={<RutaPorRol ruta="sedes"><ScreenBoundary modulo="Sedes"><SedesScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="carta" element={<RutaPorRol ruta="carta"><ScreenBoundary modulo="Carta"><CartaScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="compras" element={<RutaPorRol ruta="compras"><ScreenBoundary modulo="Compras"><ComprasScreen /></ScreenBoundary></RutaPorRol>} />
          <Route path="facturacion" element={<RutaPorRol ruta="facturacion"><ScreenBoundary modulo="Facturación"><FacturacionScreen /></ScreenBoundary></RutaPorRol>} />
        </Route>


        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
