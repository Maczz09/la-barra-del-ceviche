import { useMemo } from 'react';
import { fmt, elapsedMin, fechaLocalISO } from '../utils/format';
import { useMesasQuery } from './queries/useMesasQuery';
import { usePedidosQuery } from './queries/usePedidosQuery';
import { useCajaQuery } from './queries/useCajaQuery';
import { useReportesQuery } from './queries/useReportesQuery';
import { useSedeActualQuery } from './queries/useSedesQuery';
import { useReservasQuery } from './queries/useReservasQuery';
import { useInventarioQuery } from './queries/useInventarioQuery';
import type { IconName } from '../components/ui/icons';

const COCINA_SLA_MIN = 15;
const STOCK_BAJO = 5;
const ESTADOS_ACTIVOS = new Set(['PENDIENTE', 'EN_PREPARACION']);

export interface ActividadItem {
  key: string;
  t: string;
  d: string;
  at: string;
  ic: IconName;
  c: string;
}

export function useInicioData() {
  const hoy = fechaLocalISO();
  const { mesas } = useMesasQuery();
  const { pedidos } = usePedidosQuery();
  const { resumen: caja } = useCajaQuery();
  const { sede } = useSedeActualQuery();
  const { resumen: reporte } = useReportesQuery({ sedeId: sede?.id });
  const { reservas } = useReservasQuery({ fecha: hoy });
  const { productos } = useInventarioQuery();

  const ventasHora = useMemo(() => reporte?.ventasPorHora ?? [], [reporte]);

  const salon = useMemo(() => {
    const total = mesas.length;
    const ocupadas = mesas.filter((m) => m.estado === 'OCUPADA').length;
    const reservadas = mesas.filter((m) => m.estado === 'RESERVADA').length;
    const libres = mesas.filter((m) => m.estado === 'LIBRE').length;
    return { total, ocupadas, reservadas, libres };
  }, [mesas]);

  const cocina = useMemo(() => {
    const now = Date.now();
    const activos = pedidos.filter((p) => ESTADOS_ACTIVOS.has(p.estado));
    const tiempos = activos.map((p) => elapsedMin(p.createdAt, now));
    const prom = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0;
    const demora = activos.filter((p) => elapsedMin(p.createdAt, now) >= COCINA_SLA_MIN).length;
    return { activos: activos.length, prom, demora };
  }, [pedidos]);

  const items86 = useMemo(
    () => productos.filter((p) => !p.disponible).map((p) => p.nombre),
    [productos],
  );

  const stockAlerts = useMemo(
    () => productos.filter((p) => p.stockActual != null && p.stockActual <= STOCK_BAJO),
    [productos],
  );

  const reservasProx = useMemo(
    () =>
      reservas
        .filter((r) => r.estado !== 'CANCELADA' && r.estado !== 'EXPIRADA')
        .sort((a, b) => a.hora.localeCompare(b.hora))
        .slice(0, 5),
    [reservas],
  );

  const actividad = useMemo<ActividadItem[]>(() => {
    const METAS: Partial<Record<string, { t: string; ic: IconName; c: string }>> = {
      PAGADO: { t: 'Pago registrado', ic: 'Receipt', c: 'var(--ok)' },
      LISTO: { t: 'Pedido listo', ic: 'Check', c: 'var(--ok)' },
      ENTREGADO: { t: 'Pedido entregado', ic: 'Check', c: 'var(--info)' },
      CANCELADO: { t: 'Pedido cancelado', ic: 'Alert', c: 'var(--danger)' },
    };
    const dePedidos: ActividadItem[] = pedidos.map((p) => {
      const meta = METAS[p.estado] ?? { t: 'Pedido a cocina', ic: 'Cocina' as IconName, c: 'var(--accent)' };
      const donde = p.cliente ? p.cliente : `Mesa ${p.mesaNumero}`;
      return { key: `p-${p.id}`, t: meta.t, d: `${donde} · ${p.cantidadItems} ítem(s)`, at: p.createdAt, ic: meta.ic, c: meta.c };
    });
    const deReservas: ActividadItem[] = reservas
      .filter((r) => r.estado === 'CONFIRMADA')
      .map((r) => ({
        key: `r-${r.id}`,
        t: 'Reserva confirmada',
        d: `${r.clienteNombre} · ${r.numComensales} pax · ${r.hora}`,
        at: r.createdAt,
        ic: 'Reservas',
        c: 'var(--info)',
      }));
    return [...dePedidos, ...deReservas]
      .filter((a) => !Number.isNaN(Date.parse(a.at)))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 6);
  }, [pedidos, reservas]);

  return {
    totalVentas: reporte?.ingresosTotales ?? 0,
    cuentas: reporte?.totalVentas ?? 0,
    ticketProm: reporte?.ticketPromedio ?? 0,
    ventasHora,
    propinas: caja?.propinas ?? 0,
    efectivo: caja?.efectivoEsperado ?? 0,
    turnoAbierto: !!caja?.turno,
    salon,
    ocupPct: salon.total ? Math.round((salon.ocupadas / salon.total) * 100) : 0,
    cocina,
    items86,
    stockAlerts,
    reservasProx,
    actividad,
    atencionCount: cocina.demora + items86.length + stockAlerts.length,
    // re-export para los tooltips de stockAlerts
    STOCK_BAJO,
    fmt,
  };
}
