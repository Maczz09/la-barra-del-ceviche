import { Injectable, Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { SEDE_PRINCIPAL_ID } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { CuentaCerradaPayload, ItemArea, PedidoSnapshotItem } from '@org/contracts';
import { calcularEstadisticasTicket } from './estadisticas';

const MENOS_VENDIDOS_LIMITE = 5;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrarVenta(data: CuentaCerradaPayload) {
    this.logger.log({
      operation: 'registrarVenta',
      aggregateId: data.cuentaId,
      message: `Registrando venta para mesa ${data.mesaId} por total S/ ${data.total}.`,
    } satisfies OperableLog);

    // T-23 Fase 2: los eventos RMQ no pasan por el ValidationPipe global — un
    // productor legado (rollout en curso) puede publicar sin sedeId.
    if (!data.sedeId) {
      this.logger.warn({
        operation: 'registrarVenta',
        aggregateId: data.cuentaId,
        errorCode: 'EVENTO_SIN_SEDE',
        message: 'Evento CuentaCerrada sin sedeId; se asigna Sede Principal.',
      } satisfies OperableLog);
    }
    const sedeId = data.sedeId ?? SEDE_PRINCIPAL_ID;

    await this.prisma.ventaDiaria.upsert({
      where: { cuentaId: data.cuentaId },
      create: {
        cuentaId: data.cuentaId,
        sedeId,
        mesaId: data.mesaId,
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
        meseroId: data.meseroId ?? null,
        meseroNombre: data.meseroNombre ?? null,
      },
      // No se rescribe sedeId en el update: una re-entrega no debe reasignar
      // la sede de una venta ya registrada.
      update: {
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
        meseroId: data.meseroId ?? null,
        meseroNombre: data.meseroNombre ?? null,
      },
    });
  }

  /**
   * T-23 Fase 2 — LENIENTE (mismo criterio que identidad.listarUsuarios):
   * usuario pineado → siempre su sede; admin general → la que pida, o TODAS
   * (ausente = combinado). A propósito NO usa resolveSedeId (que exige una
   * sede sí o sí) — el punto de este módulo es permitir la vista combinada.
   */
  private filtroSede(usuarioSedeId?: string | null, sedeIdSolicitado?: string): { sedeId?: string } {
    const sedeId = usuarioSedeId ?? sedeIdSolicitado;
    return sedeId ? { sedeId } : {};
  }

  // Perú no tiene horario de verano: -05:00 es fijo todo el año.
  private static readonly SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

  // Los presets del frontend (utils/periodos.ts) mandan "YYYY-MM-DD" sin hora
  // — un día calendario de Lima, no un instante UTC. `new Date('2026-08-11')`
  // cae en medianoche UTC, 5 horas ANTES de que empiece ese día en Lima; si
  // además "hasta" usa la misma fecha que "desde" (rango "Hoy"), gte y lte
  // quedan en el mismo instante y el filtro no matchea ninguna venta real.
  // Anclamos explícitamente al inicio/fin de ese día en -05:00.
  private parseFechaLimite(value: string, limite: 'inicio' | 'fin'): Date {
    if (AppService.SOLO_FECHA.test(value)) {
      const hora = limite === 'inicio' ? '00:00:00.000' : '23:59:59.999';
      return new Date(`${value}T${hora}-05:00`);
    }
    return new Date(value);
  }

  /** Rango de fechas: usa desde/hasta si vienen, si no el día de hoy. */
  private rango(query?: { desde?: string; hasta?: string }): { gte: Date; lte: Date } {
    if (query?.desde || query?.hasta) {
      return {
        gte: query.desde ? this.parseFechaLimite(query.desde, 'inicio') : new Date(0),
        lte: query.hasta ? this.parseFechaLimite(query.hasta, 'fin') : new Date(),
      };
    }
    // "Hoy" tiene que anclarse al mismo día calendario de Lima que usa
    // parseFechaLimite arriba. hoy.setHours(0,0,0,0) usaba la zona horaria
    // del contenedor (UTC en Docker) — medianoche UTC son las 19:00 de AYER
    // en Lima, así que el rango "de hoy" arrancaba 5 horas antes de tiempo y
    // arrastraba ventas de la noche anterior.
    const hoyLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    return { gte: this.parseFechaLimite(hoyLima, 'inicio'), lte: new Date() };
  }

  // fecha.getHours() usa la zona horaria del contenedor (UTC en Docker,
  // igual que el bug ya documentado arriba en rango()) — una venta de las
  // 16:00 Lima queda leída como las 21:00. Mismo remedio: leer la hora vía
  // Intl con el timezone anclado explícitamente en vez de confiar en el TZ
  // del proceso.
  private horaLima(fecha: Date): number {
    const horaStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      hour12: false,
    }).format(fecha);
    return Number(horaStr) % 24;
  }

  /** Deriva el turno a partir de la hora de la venta (plan 6.3). */
  private turnoDe(fecha: Date): 'ALMUERZO' | 'CENA' | 'OTRO' {
    const h = this.horaLima(fecha);
    if (h >= 12 && h < 17) return 'ALMUERZO';
    if (h >= 18) return 'CENA';
    return 'OTRO';
  }

  /** Reporte por producto en un rango: cantidad e ingresos, ordenado por ingresos. */
  async obtenerPorProducto(query?: { desde?: string; hasta?: string; sedeId?: string }, usuarioSedeId?: string | null) {
    const { gte, lte } = this.rango(query);
    const ventas = await this.prisma.ventaDiaria.findMany({
      where: { fecha: { gte, lte }, ...this.filtroSede(usuarioSedeId, query?.sedeId) },
    });
    const stats = new Map<string, { nombre: string; cantidad: number; ingresos: number }>();
    for (const v of ventas) {
      if (!Array.isArray(v.items)) continue;
      for (const item of v.items as PedidoSnapshotItem[]) {
        const pid = item.productoId;
        if (!pid) continue;
        const cur = stats.get(pid) ?? { nombre: item.nombre ?? pid, cantidad: 0, ingresos: 0 };
        cur.cantidad += Number(item.cantidad ?? 0);
        cur.ingresos += Number(item.cantidad ?? 0) * Number(item.precioUnitario ?? 0);
        stats.set(pid, cur);
      }
    }
    return {
      desde: gte,
      hasta: lte,
      productos: Array.from(stats.entries())
        .map(([productoId, s]) => ({ productoId, ...s }))
        .sort((a, b) => b.ingresos - a.ingresos),
    };
  }

  /** Reporte por turno (ALMUERZO/CENA/OTRO) en un rango. */
  async obtenerPorTurno(query?: { desde?: string; hasta?: string; sedeId?: string }, usuarioSedeId?: string | null) {
    const { gte, lte } = this.rango(query);
    const ventas = await this.prisma.ventaDiaria.findMany({
      where: { fecha: { gte, lte }, ...this.filtroSede(usuarioSedeId, query?.sedeId) },
    });
    const turnos = new Map<string, { totalVentas: number; ingresos: number }>();
    for (const v of ventas) {
      const t = this.turnoDe(new Date(v.fecha));
      const cur = turnos.get(t) ?? { totalVentas: 0, ingresos: 0 };
      cur.totalVentas += 1;
      cur.ingresos += Number(v.total);
      turnos.set(t, cur);
    }
    return {
      desde: gte,
      hasta: lte,
      turnos: Array.from(turnos.entries()).map(([turno, s]) => ({ turno, ...s })),
    };
  }

  /** Reporte por mesero en un rango (agrupa lo sin asignar aparte). */
  async obtenerPorMesero(query?: { desde?: string; hasta?: string; sedeId?: string }, usuarioSedeId?: string | null) {
    const { gte, lte } = this.rango(query);
    const ventas = await this.prisma.ventaDiaria.findMany({
      where: { fecha: { gte, lte }, ...this.filtroSede(usuarioSedeId, query?.sedeId) },
    });
    const meseros = new Map<string, { meseroNombre: string; totalVentas: number; ingresos: number }>();
    for (const v of ventas) {
      const key = v.meseroId ?? '(sin asignar)';
      const cur = meseros.get(key) ?? {
        meseroNombre: v.meseroNombre ?? '(sin asignar)',
        totalVentas: 0,
        ingresos: 0,
      };
      cur.totalVentas += 1;
      cur.ingresos += Number(v.total);
      meseros.set(key, cur);
    }
    return {
      desde: gte,
      hasta: lte,
      meseros: Array.from(meseros.entries())
        .map(([meseroId, s]) => ({ meseroId, ...s }))
        .sort((a, b) => b.ingresos - a.ingresos),
    };
  }

  async obtenerResumenDiario(query?: { desde?: string; hasta?: string; sedeId?: string }, usuarioSedeId?: string | null) {
    const { gte, lte } = this.rango(query);

    const ventas = await this.prisma.ventaDiaria.findMany({
      where: {
        fecha: { gte, lte },
        ...this.filtroSede(usuarioSedeId, query?.sedeId),
      },
    });

    const totalIngresos = ventas.reduce((acc, v) => acc + Number(v.total), 0);

    // 1. Agrupar Ventas por Hora reales del día
    const horasMap = new Map<string, number>();
    // Inicializar horas comunes de almuerzo y cena
    for (let h = 12; h <= 22; h++) {
      horasMap.set(`${String(h).padStart(2, '0')}:00`, 0);
    }
    
    for (const v of ventas) {
      const hora = this.horaLima(new Date(v.fecha));
      const horaKey = `${String(hora).padStart(2, '0')}:00`;

      horasMap.set(horaKey, (horasMap.get(horaKey) || 0) + Number(v.total));
    }

    const ventasPorHora = Array.from(horasMap.entries()).map(([hora, total]) => ({
      hora,
      total,
    }));

    // 2. Ranking de ventas determinista, separado por origen: un plato de
    // Carta/Menú (área COCINA o BARRA, pasa por producción) es un negocio
    // distinto de un producto de Inventario (área DIRECTO, reventa sin
    // preparación) — mezclarlos en un solo ranking no le sirve al dueño para
    // decidir qué cocinar más ni qué reponer más.
    const platoStats = new Map<string, { nombre: string; cantidad: number; ingresos: number }>();
    const inventarioStats = new Map<string, { nombre: string; cantidad: number; ingresos: number }>();

    for (const v of ventas) {
      if (Array.isArray(v.items)) {
        for (const item of v.items as PedidoSnapshotItem[]) {
          const pid = item.productoId;
          if (!pid) continue;
          const stats = item.area === ItemArea.Directo ? inventarioStats : platoStats;
          const current = stats.get(pid) || { nombre: item.nombre || pid, cantidad: 0, ingresos: 0 };
          current.cantidad += Number(item.cantidad || 0);
          current.ingresos += Number(item.cantidad || 0) * Number(item.precioUnitario || 0);
          stats.set(pid, current);
        }
      }
    }

    const ordenarStats = (stats: Map<string, { nombre: string; cantidad: number; ingresos: number }>) =>
      Array.from(stats.entries())
        .map(([productoId, s]) => ({ productoId, nombre: s.nombre, cantidad: s.cantidad, ingresos: s.ingresos }))
        .filter((p) => p.cantidad > 0);

    const platosOrdenados = ordenarStats(platoStats);
    const inventarioOrdenado = ordenarStats(inventarioStats);

    const topPlatos = [...platosOrdenados].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
    const topProductos = [...inventarioOrdenado].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
    // Menos vendidos: solo entre platos que SÍ se vendieron al menos una vez —
    // uno que nunca se pidió no está en platoStats (viene de ventas reales,
    // no del catálogo completo de la carta), así que esto no reemplaza un
    // reporte de "platos sin ninguna venta". Queda acotado a Carta/Menú
    // (igual que antes de separar los rankings): es la lista que sirve para
    // decidir qué sacar de la carta, no para decidir stock de inventario.
    const productosMenosVendidos = [...platosOrdenados].sort((a, b) => a.cantidad - b.cantidad).slice(0, MENOS_VENDIDOS_LIMITE);

    const estadisticasTicket = calcularEstadisticasTicket(ventas.map((v) => Number(v.total)));

    return {
      fecha: gte,
      hasta: lte,
      totalVentas: ventas.length,
      ingresosTotales: totalIngresos,
      ventasPorHora,
      productosMenosVendidos,
      estadisticasTicket,
      topPlatos,
      topProductos,
    };
  }

}
