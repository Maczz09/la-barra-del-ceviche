import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getOrCreateCounter, getOrCreateHistogram, OperableLog } from '@org/observabilidad';
import { resolveSedeId, SEDE_PRINCIPAL_ID } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListarTransaccionesQuery,
  ListarTurnosQuery,
  PagoRegistradoPayload,
  RoutingKeys,
  TransaccionDto,
  TransaccionListResponse,
  TurnoCajaAbiertoPayload,
  TurnoCajaCerradoPayload,
  TurnoListResponse,
} from '@org/contracts';
import { Prisma } from '../generated/prisma';
import {
  AbrirTurnoCajaCommand,
  ActualizarTransaccionCommand,
  CerrarTurnoCajaCommand,
  CrearMovimientoCajaCommand,
  PagarCuentaCajaCommand,
  RegistrarArqueoCajaCommand,
} from './caja.dto';
import { CuentasHttpClient, CuentaRemota } from './cuentas-http.client';

const METODOS = ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'TRANSFERENCIA'] as const;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  // Métricas de negocio (plan 5.2): pagos/min y distribución de montos.
  private readonly pagosCounter = getOrCreateCounter(
    'pagos_registrados_total', 'Pagos registrados en caja', ['metodo'],
  );
  private readonly pagoMontoHistogram = getOrCreateHistogram(
    'pago_monto_soles', 'Distribución del monto de los pagos (soles)',
    [10, 25, 50, 100, 200, 500, 1000],
    ['metodo'],
  );
  // Análogo de PAYMENT_UNKNOWN: el pago quedó registrado en caja pero el
  // cierre remoto de la cuenta (HTTP a servicio-cuentas) falló, así que la
  // cuenta puede seguir figurando ABIERTA aunque el cliente ya pagó.
  private readonly pagosCierrePendienteCounter = getOrCreateCounter(
    'pagos_cierre_remoto_pendiente_total', 'Pagos registrados cuyo cierre remoto de cuenta falló',
  );
  constructor(
    private readonly prisma: PrismaService,
    private readonly cuentasHttp: CuentasHttpClient,
  ) {}

  private usuario(usuarioId?: string | null) {
    return usuarioId ?? 'sistema';
  }

  private n(value: unknown): number {
    return Number(value ?? 0);
  }

  private money(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value);
  }

  async abrirTurno(
    command: AbrirTurnoCajaCommand,
    usuarioId?: string | null,
    usuarioSedeId?: string | null,
    sedeIdSolicitado?: string,
  ) {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const abierto = await this.prisma.turnoCaja.findFirst({
      where: { estado: 'ABIERTA', sedeId },
      orderBy: { abiertoAt: 'desc' },
    });

    if (abierto) {
      await this.procesarPagosPendientes(sedeId);
      return this.mapTurno(abierto);
    }

    const fondoInicial = this.money(command.fondoInicial ?? 0);
    let turno;
    try {
      turno = await this.prisma.$transaction(async (prisma: import('../generated/prisma').Prisma.TransactionClient) => {
        const creado = await prisma.turnoCaja.create({
          data: {
            sedeId,
            cajaId: command.cajaId ?? 'T01',
            cajaNombre: command.cajaNombre ?? 'Terminal 01',
            usuarioId: this.usuario(usuarioId),
            cajeroNombre: command.cajeroNombre,
            fondoInicial,
            estado: 'ABIERTA',
          },
        });

        await prisma.movimientoCaja.create({
          data: {
            turnoId: creado.id,
            tipo: 'APERTURA',
            donde: 'Fondo inicial',
            metodo: 'EFECTIVO',
            monto: fondoInicial,
          },
        });

        // Identidad activa automáticamente al personal MESERO de esta sede
        // al abrir turno (y los desactiva al cerrar — ver cerrarTurno).
        const payload: TurnoCajaAbiertoPayload = { turnoId: creado.id, sedeId };
        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.TurnoCajaAbierto,
            payload: JSON.stringify(payload),
            status: 'PENDING',
          },
        });

        return creado;
      });
    } catch (error) {
      // T-25: carrera con otra apertura concurrente — el índice único parcial
      // `turnos_caja_un_abierto_por_sede` rechaza el segundo INSERT con P2002.
      // Devolver el turno ya abierto DE ESTA SEDE (misma semántica que "si ya
      // hay uno, devolverlo") — sin el filtro por sedeId, la recuperación le
      // entregaría a esta sede el turno abierto de otra.
      if (this.isUniqueConstraintViolation(error)) {
        const existente = await this.prisma.turnoCaja.findFirst({
          where: { estado: 'ABIERTA', sedeId },
          orderBy: { abiertoAt: 'desc' },
        });
        if (existente) {
          await this.procesarPagosPendientes(sedeId);
          return this.mapTurno(existente);
        }
      }
      throw error;
    }

    this.logger.log({
      operation: 'abrirTurno',
      aggregateId: turno.id,
      message: 'Turno de caja abierto.',
    } satisfies OperableLog);
    await this.procesarPagosPendientes(sedeId);
    return this.mapTurno(turno);
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }

  /**
   * Bloquea el cierre de turno si queda alguna cuenta ABIERTA (sin cobrar)
   * en la sede — el cajero debe cobrarla primero. Si la verificación misma
   * falla (cuentas caída), NO se bloquea el cierre por eso: una caída
   * transitoria de una dependencia no debe impedir cerrar la caja del día.
   */
  private async verificarSinCuentasAbiertas(sedeId: string): Promise<void> {
    let abiertas: Array<{ id: string; mesaId: string; numeroMesa?: number; total: number }>;
    try {
      abiertas = await this.cuentasHttp.listarCuentasAbiertas(sedeId);
    } catch (error) {
      this.logger.warn({
        operation: 'cerrarTurno',
        aggregateId: sedeId,
        dependency: 'cuentas',
        errorCode: 'VERIFICACION_CUENTAS_ABIERTAS_FALLIDA',
        message: `No se pudo verificar cuentas abiertas antes de cerrar turno: ${(error as Error).message}`,
      } satisfies OperableLog);
      return;
    }
    if (abiertas.length === 0) return;
    const mesas = abiertas.map((c) => (c.numeroMesa != null ? `Mesa ${c.numeroMesa}` : c.mesaId)).join(', ');
    throw new BadRequestException(
      `No se puede cerrar el turno: hay ${abiertas.length} cuenta(s) sin cobrar (${mesas}). Cóbralas antes de cerrar caja.`,
    );
  }

  /**
   * Reintenta cada cobro que quedó en espera de esta sede (ver el brazo
   * "sin turno" de registrarPago) ahora que hay un turno abierto. Cada fila
   * se reclama con un UPDATE condicional (PENDIENTE → PROCESANDO) antes de
   * procesarla, para que dos aperturas concurrentes de la misma sede no
   * paguen la misma fila dos veces. Un fallo individual (la cuenta ya se
   * cerró por otra vía, el monto ya no cuadra, etc.) NO debe tumbar la
   * apertura de turno — se marca FALLIDO y se sigue con las demás.
   */
  private async procesarPagosPendientes(sedeId: string): Promise<void> {
    const pendientes = await this.prisma.pagoPendiente.findMany({
      where: { sedeId, estado: 'PENDIENTE' },
      orderBy: { createdAt: 'asc' },
    });

    for (const p of pendientes) {
      const reclamado = await this.prisma.pagoPendiente.updateMany({
        where: { id: p.id, estado: 'PENDIENTE' },
        data: { estado: 'PROCESANDO' },
      });
      if (reclamado.count === 0) continue; // otra apertura concurrente ya se la llevó

      const command: PagarCuentaCajaCommand = {
        cuentaId: p.cuentaId,
        montoRecibido: this.n(p.montoRecibido),
        metodo: p.metodo as PagarCuentaCajaCommand['metodo'],
        descuento: p.descuento != null ? this.n(p.descuento) : undefined,
        propina: p.propina != null ? this.n(p.propina) : undefined,
        mesaNumero: p.mesaNumero ?? undefined,
        mesaUnidaCon: p.mesaUnidaCon ?? undefined,
        referencia: p.referencia ?? undefined,
        notas: p.notas ?? undefined,
        tipoComprobante: (p.tipoComprobante as PagarCuentaCajaCommand['tipoComprobante']) ?? undefined,
        clienteDocumento: p.clienteDocumento ?? undefined,
      };

      try {
        const resultado = await this.registrarPago(command, p.usuarioId, p.cajeroNombre, sedeId);
        if (resultado.queued) {
          // No debería ocurrir (el turno se acaba de confirmar abierto),
          // pero por seguridad: no la marques PROCESADO ni la dejes
          // atascada en PROCESANDO — vuelve a PENDIENTE para el próximo intento.
          await this.prisma.pagoPendiente.update({ where: { id: p.id }, data: { estado: 'PENDIENTE' } });
          continue;
        }
        await this.prisma.pagoPendiente.update({
          where: { id: p.id },
          data: { estado: 'PROCESADO', transaccionId: resultado.transaccion?.id, procesadoAt: new Date() },
        });
        this.logger.log({
          operation: 'procesarPagosPendientes',
          aggregateId: p.id,
          resultingState: 'PROCESADO',
          message: `Pago en espera ${p.id} (cuenta ${p.cuentaId}) registrado al abrir turno.`,
        } satisfies OperableLog);
      } catch (error) {
        await this.prisma.pagoPendiente.update({
          where: { id: p.id },
          data: { estado: 'FALLIDO', error: (error as Error).message, procesadoAt: new Date() },
        });
        this.logger.warn({
          operation: 'procesarPagosPendientes',
          aggregateId: p.id,
          errorCode: 'PAGO_PENDIENTE_FALLIDO',
          resultingState: 'FALLIDO',
          message: `Pago en espera ${p.id} (cuenta ${p.cuentaId}) no se pudo registrar al abrir turno: ${(error as Error).message}`,
        } satisfies OperableLog);
      }
    }
  }

  async obtenerTurnoActivo(usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { estado: 'ABIERTA', sedeId },
      orderBy: { abiertoAt: 'desc' },
    });
    return turno ? this.mapTurno(turno) : null;
  }

  async obtenerResumenTurnoActivo(usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { estado: 'ABIERTA', sedeId },
      orderBy: { abiertoAt: 'desc' },
    });

    if (!turno) {
      return {
        turno: null,
        movimientos: [],
        ventas: [],
        totalVentas: 0,
        totalEgresos: 0,
        totalIngresos: 0,
        propinas: 0,
        porMetodo: this.emptyMetodoTotals(),
        efectivoEsperado: 0,
        comprobantes: 0,
        pendientes: 0,
        arqueo: null,
        cierre: null,
      };
    }

    return this.obtenerResumenTurno(turno.id);
  }

  // Micro-caché TTL single-flight del resumen (hallazgo pruebas de carga
  // 2026-07-13): el resumen trae TODOS los movimientos del turno y agrega en
  // JS por request; bajo consulta concurrente masiva degrada a timeouts. Se
  // cachea la PROMESA (no el valor): al expirar el TTL solo el primer caller
  // recomputa y el resto espera esa misma promesa — sin estampida (medido:
  // cachear el valor dejaba un p99 de timeout por la manada de misses en cada
  // ventana). Dato de dashboard: segundos de staleness aceptables. Opt-in por
  // env (CAJA_RESUMEN_TTL_MS>0) para no alterar tests ni semántica por defecto.
  // ponytail: stopgap; el fix real (SUM en SQL o caché con invalidación) tiene tarea propia.
  private readonly resumenCache = new Map<string, { at: number; promise: Promise<unknown> }>();

  async obtenerResumenTurno(id: string, usuarioSedeId?: string | null) {
    // GUARD antes del caché: una respuesta cacheada no debe servirse cruzando
    // el chequeo de sede.
    await this.assertTurnoDeSede(id, usuarioSedeId);

    const ttl = Number(process.env.CAJA_RESUMEN_TTL_MS ?? 0);
    if (ttl <= 0) return this.computeResumenTurno(id);

    const hit = this.resumenCache.get(id);
    if (hit && Date.now() - hit.at < ttl) {
      return hit.promise as ReturnType<AppService['computeResumenTurno']>;
    }
    const promise = this.computeResumenTurno(id);
    this.resumenCache.set(id, { at: Date.now(), promise });
    // Un fallo no debe quedar cacheado como resultado del resto de la ventana.
    promise.catch(() => this.resumenCache.delete(id));
    return promise;
  }

  private async computeResumenTurno(id: string) {
    const turno = await this.prisma.turnoCaja.findUnique({
      where: { id },
      include: {
        movimientos: { orderBy: { createdAt: 'desc' } },
        arqueos: { orderBy: { createdAt: 'desc' }, take: 1 },
        cierre: true,
        transacciones: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!turno) throw new NotFoundException(`Turno ${id} no encontrado`);
    return this.buildResumen(turno);
  }

  /** GUARD (T-23 Fase 2): 404 si el turno existe pero es de otra sede. */
  private async assertTurnoDeSede(id: string, usuarioSedeId?: string | null) {
    if (!usuarioSedeId) return;
    const turno = await this.prisma.turnoCaja.findUnique({ where: { id }, select: { sedeId: true } });
    if (!turno || turno.sedeId !== usuarioSedeId) {
      throw new NotFoundException(`Turno ${id} no encontrado`);
    }
  }

  async listarMovimientosTurno(id: string, usuarioSedeId?: string | null, search?: string) {
    await this.assertTurnoDeSede(id, usuarioSedeId);
    const movimientos = await this.prisma.movimientoCaja.findMany({
      where: {
        turnoId: id,
        // Busca por el código de la atención ("A0000001" o un fragmento).
        ...(search ? { cuentaCorrelativo: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: movimientos.map((m) => this.mapMovimiento(m)) };
  }

  async crearMovimiento(id: string, command: CrearMovimientoCajaCommand, usuarioSedeId?: string | null) {
    const turno = await this.prisma.turnoCaja.findUnique({ where: { id } });
    if (!turno || (usuarioSedeId && turno.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Turno ${id} no encontrado`);
    }
    if (turno.estado !== 'ABIERTA') {
      throw new BadRequestException('El turno ya está cerrado.');
    }

    const absMonto = Math.abs(command.monto);
    const monto = command.tipo === 'EGRESO' ? -absMonto : absMonto;
    const movimiento = await this.prisma.movimientoCaja.create({
      data: {
        turnoId: id,
        tipo: command.tipo,
        donde: command.donde,
        metodo: 'EFECTIVO',
        monto: this.money(monto),
        motivo: command.motivo,
      },
    });

    return this.mapMovimiento(movimiento);
  }

  async registrarArqueo(
    id: string,
    command: RegistrarArqueoCajaCommand,
    usuarioId?: string | null,
    usuarioSedeId?: string | null,
  ) {
    const turno = await this.prisma.turnoCaja.findUnique({
      where: { id },
      include: { movimientos: true },
    });
    if (!turno || (usuarioSedeId && turno.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Turno ${id} no encontrado`);
    }

    const efectivoEsperado = this.computeEfectivoEsperado(turno.movimientos);
    const efectivoContado = this.sumDenominaciones(command.denominaciones);
    const diferencia = efectivoContado.minus(efectivoEsperado);

    const arqueo = await this.prisma.arqueoCaja.create({
      data: {
        turnoId: id,
        denominaciones: command.denominaciones,
        efectivoEsperado,
        efectivoContado,
        diferencia,
        usuarioId: this.usuario(usuarioId),
      },
    });

    return this.mapArqueo(arqueo);
  }

  async cerrarTurno(
    id: string,
    command: CerrarTurnoCajaCommand,
    usuarioId?: string | null,
    usuarioSedeId?: string | null,
  ) {
    // Chequeo previo, FUERA de la transacción (igual que registrarPago hace
    // fetchCuenta antes de su $transaction): no tiene sentido tener abierta
    // una transacción de Postgres mientras se espera una llamada HTTP.
    const turnoPrevio = await this.prisma.turnoCaja.findUnique({ where: { id } });
    if (!turnoPrevio || (usuarioSedeId && turnoPrevio.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Turno ${id} no encontrado`);
    }
    if (turnoPrevio.estado !== 'ABIERTA') {
      throw new BadRequestException('El turno ya está cerrado.');
    }
    await this.verificarSinCuentasAbiertas(turnoPrevio.sedeId);

    const cierre = await this.prisma.$transaction(async (prisma: import('../generated/prisma').Prisma.TransactionClient) => {
      const turno = await prisma.turnoCaja.findUnique({
        where: { id },
        include: {
          movimientos: { orderBy: { createdAt: 'desc' } },
          arqueos: { orderBy: { createdAt: 'desc' }, take: 1 },
          cierre: true,
          transacciones: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!turno || (usuarioSedeId && turno.sedeId !== usuarioSedeId)) {
        throw new NotFoundException(`Turno ${id} no encontrado`);
      }
      if (turno.estado !== 'ABIERTA') {
        throw new BadRequestException('El turno ya está cerrado.');
      }

      const efectivoEsperado = this.computeEfectivoEsperado(turno.movimientos);
      const efectivoContado = this.sumDenominaciones(command.denominaciones);
      const diferencia = efectivoContado.minus(efectivoEsperado);

      const arqueo = await prisma.arqueoCaja.create({
        data: {
          turnoId: id,
          denominaciones: command.denominaciones,
          efectivoEsperado,
          efectivoContado,
          diferencia,
          usuarioId: this.usuario(usuarioId),
        },
      });

      const resumen = this.buildResumen({
        ...turno,
        arqueos: [arqueo],
        cierre: null,
      });

      const cierreCreado = await prisma.cierreCaja.create({
        data: {
          turnoId: id,
          montoEsperado: efectivoEsperado,
          montoReal: efectivoContado,
          diferencia,
          usuarioId: this.usuario(usuarioId),
          // El resumen ahora incluye ventasDetalle (TransaccionDto[], una
          // clase de @org/contracts) — Prisma tipa Json de forma más
          // estricta para instancias de clase que para objetos planos.
          resumen: resumen as unknown as Prisma.InputJsonValue,
        },
      });

      const turnoCerrado = await prisma.turnoCaja.update({
        where: { id },
        data: { estado: 'CERRADA', cerradoAt: new Date() },
      });

      // Identidad desactiva automáticamente al personal MESERO de esta sede
      // al cerrar turno — contraparte de TurnoCajaAbierto en abrirTurno.
      const payload: TurnoCajaCerradoPayload = { turnoId: id, sedeId: turno.sedeId };
      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.TurnoCajaCerrado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        },
      });

      return { turno: turnoCerrado, arqueo, cierre: cierreCreado, resumen };
    });

    this.logger.log({
      operation: 'cerrarTurno',
      aggregateId: id,
      message: 'Turno de caja cerrado.',
    } satisfies OperableLog);
    return {
      turno: this.mapTurno(cierre.turno),
      arqueo: this.mapArqueo(cierre.arqueo),
      cierre: this.mapCierre(cierre.cierre),
      resumen: cierre.resumen,
    };
  }

  // Tolerancia de 1 céntimo: absorbe el redondeo de dividir un total entre N
  // partes (p.ej. 100/3 = 33.33+33.33+33.34 puede dejar ±0.01 de residuo).
  private static readonly TOLERANCIA_CENTAVO = new Prisma.Decimal(0.01);

  async registrarPago(
    command: PagarCuentaCajaCommand,
    usuarioId?: string | null,
    cajeroNombre?: string | null,
    usuarioSedeId?: string | null,
  ): Promise<{ message?: string; queued?: boolean; transaccion?: TransaccionDto; ticket?: unknown; turno: unknown; pendiente: number }> {
    // T-23 Fase 2: la sede de la operación la determina LA CUENTA, no el
    // usuario — se necesita para encontrar el turno abierto correcto. Por
    // eso fetchCuenta va antes del lookup de turno (orden invertido respecto
    // a la versión pre-multi-sede).
    let cuentaRemota: CuentaRemota;
    try {
      cuentaRemota = await this.cuentasHttp.fetchCuenta(command.cuentaId);
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number }; code?: string };
      if (axiosError.response?.status === 404) {
        throw new NotFoundException(`Cuenta ${command.cuentaId} no encontrada.`);
      }
      throw new ServiceUnavailableException('No se pudo obtener la cuenta. Reintente.');
    }

    const sedeId = cuentaRemota.sedeId ?? SEDE_PRINCIPAL_ID;
    if (usuarioSedeId && usuarioSedeId !== sedeId) {
      throw new ForbiddenException('La cuenta pertenece a otra sede.');
    }

    const turno = await this.prisma.turnoCaja.findFirst({
      where: { estado: 'ABIERTA', sedeId },
      orderBy: { abiertoAt: 'desc' },
    });
    if (!turno) {
      // En vez de rechazar el cobro, se guarda tal cual el comando que el
      // cajero ya llenó (mesa, monto, método, comprobante...) y se reintenta
      // solo en cuanto abra el próximo turno de esta sede — ver
      // procesarPagosPendientes, llamado desde abrirTurno.
      const pendiente = await this.prisma.pagoPendiente.create({
        data: {
          sedeId,
          cuentaId: command.cuentaId,
          montoRecibido: this.money(command.montoRecibido),
          metodo: command.metodo,
          descuento: command.descuento != null ? this.money(command.descuento) : undefined,
          propina: command.propina != null ? this.money(command.propina) : undefined,
          mesaNumero: command.mesaNumero,
          mesaUnidaCon: command.mesaUnidaCon,
          referencia: command.referencia,
          notas: command.notas,
          tipoComprobante: command.tipoComprobante,
          clienteDocumento: command.clienteDocumento,
          usuarioId: usuarioId ?? undefined,
          cajeroNombre: cajeroNombre ?? undefined,
        },
      });
      this.logger.log({
        operation: 'registrarPago',
        aggregateId: command.cuentaId,
        resultingState: 'EN_ESPERA_DE_TURNO',
        message: `Pago ${pendiente.id} puesto en cola: no hay turno de caja abierto en la sede ${sedeId}.`,
      } satisfies OperableLog);
      return {
        message: 'La caja está cerrada: el pago quedó en espera y se registrará automáticamente en cuanto se abra un turno.',
        queued: true,
        turno: null,
        pendiente: this.money(command.montoRecibido).toNumber(),
      };
    }

    const descuento = this.money(command.descuento ?? 0);
    const montoRecibido = this.money(command.montoRecibido);
    const totalConDescuento = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      this.money(cuentaRemota.total).minus(descuento),
    );

    // Pagos divididos (T-16): varias transacciones pueden cubrir una misma
    // cuenta — cada llamada paga una "parte" (posiblemente con método
    // distinto). El descuento debe venir IGUAL en todas las partes de un
    // mismo cobro dividido: totalConDescuento se recalcula en cada llamada
    // desde cuentaRemota.total (que no cambia hasta el cierre), así que un
    // descuento inconsistente entre partes correría el total pendiente.
    const { tx: transaccion, montoPendienteDespues } = await this.prisma.$transaction(async (prisma: import('../generated/prisma').Prisma.TransactionClient) => {
      // classid 1234 compartido entre servicios A PROPOSITO: cada servicio tiene su propia BD (database-per-service), el espacio de locks no se cruza.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${command.cuentaId}), 1, 8))::bit(32)::int)`;

      const cuenta = await prisma.cuentaAbierta.upsert({
        where: { cuentaId: command.cuentaId },
        create: {
          cuentaId: cuentaRemota.id,
          mesaId: cuentaRemota.mesaId,
          sedeId,
          total: cuentaRemota.total,
          estado: cuentaRemota.estado,
        },
        update: {
          total: cuentaRemota.total,
          estado: cuentaRemota.estado,
          mesaId: cuentaRemota.mesaId,
          sedeId,
        },
      });

      if (cuenta.estado !== 'ABIERTA') {
        throw new BadRequestException(`La cuenta ya está ${cuenta.estado.toLowerCase()}.`);
      }

      const pagosPrevios = await prisma.transaccion.aggregate({
        where: { cuentaId: command.cuentaId },
        _sum: { monto: true },
      });
      const montoTotalPagado = this.money(pagosPrevios._sum.monto ?? 0);
      const montoPendienteAntes = Prisma.Decimal.max(new Prisma.Decimal(0), totalConDescuento.minus(montoTotalPagado));

      if (montoPendienteAntes.lessThanOrEqualTo(AppService.TOLERANCIA_CENTAVO)) {
        throw new BadRequestException('La cuenta ya fue cobrada por completo.');
      }
      if (montoRecibido.greaterThan(montoPendienteAntes.plus(AppService.TOLERANCIA_CENTAVO))) {
        throw new BadRequestException(
          `El pago (${montoRecibido.toNumber()}) supera lo pendiente de la cuenta (${montoPendienteAntes.toNumber()}).`,
        );
      }

      const tx = await prisma.transaccion.create({
        data: {
          cuentaId: command.cuentaId,
          sedeId,
          turnoId: turno.id,
          mesaId: cuenta.mesaId,
          monto: montoRecibido,
          descuento,
          metodo: command.metodo,
          referencia: command.referencia,
          notas: command.notas,
          usuarioId: usuarioId ?? undefined,
          cajeroNombre: cajeroNombre ?? undefined,
          // Auditoría de caja (quién atendió vs. quién cobró): mesero
          // dominante de la cuenta al momento del pago, no del cierre —
          // así también queda en pagos parciales (T-16), no solo el final.
          meseroId: cuentaRemota.meseroId ?? undefined,
          meseroNombre: cuentaRemota.meseroNombre ?? undefined,
          // Código legible de la atención ("A0000001"), denormalizado desde
          // la cuenta remota al momento del cobro.
          cuentaCorrelativo: cuentaRemota.correlativo ?? undefined,
          // Número de mesa legible (y hermanas si estaba unida) al momento
          // del cobro — mismo dato confiado del cliente que ya se usa para
          // MovimientoCaja.donde, ahora también en la Transaccion.
          mesaNumero: command.mesaNumero ?? undefined,
          mesaUnidaCon: command.mesaUnidaCon ?? undefined,
          tipoComprobante: command.tipoComprobante ?? 'BOLETA',
          clienteDocumento: command.clienteDocumento ?? undefined,
        },
      });

      await prisma.movimientoCaja.create({
        data: {
          turnoId: turno.id,
          tipo: 'VENTA',
          cuentaId: command.cuentaId,
          transaccionId: tx.id,
          mesaId: cuenta.mesaId,
          donde: command.mesaNumero ? `Mesa ${command.mesaNumero}` : `Mesa ${cuenta.mesaId}`,
          metodo: command.metodo,
          monto: montoRecibido,
          descuento,
          propina: this.money(command.propina ?? 0),
          motivo: command.notas,
          cuentaCorrelativo: cuentaRemota.correlativo ?? undefined,
        },
      });

      const montoPendienteDespues = Prisma.Decimal.max(new Prisma.Decimal(0), montoPendienteAntes.minus(montoRecibido));

      const payload: PagoRegistradoPayload = {
        transaccionId: tx.id,
        cuentaId: command.cuentaId,
        mesaId: cuenta.mesaId,
        monto: montoRecibido.toNumber(),
        metodo: command.metodo,
        pendiente: montoPendienteDespues.toNumber(),
      };

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.PagoRegistrado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        },
      });

      return { tx, montoPendienteDespues };
    });

    let ticket: unknown;
    const cierreCompleta = montoPendienteDespues.lessThanOrEqualTo(AppService.TOLERANCIA_CENTAVO);
    if (cierreCompleta) {
      const cierreStart = Date.now();
      try {
        const cierre = await this.cuentasHttp.cerrarCuenta(command.cuentaId, descuento.toNumber());
        ticket = (cierre as Record<string, unknown>)?.ticket;
        await this.prisma.cuentaAbierta.update({
          where: { cuentaId: command.cuentaId },
          data: { estado: 'CERRADA', total: totalConDescuento },
        });
      } catch (error) {
        this.pagosCierrePendienteCounter.inc();
        // Ruta de dinero: el pago SÍ se persistió, la cuenta queda en un estado
        // degradado real (PAGO_SIN_CIERRE_CONFIRMADO) → resultingState es fiel y
        // dispara la reconciliación. aggregateId=cuentaId es la clave de búsqueda
        // de soporte; el id de transacción queda en el message.
        this.logger.warn({
          operation: 'cerrarCuenta',
          aggregateId: command.cuentaId,
          dependency: 'cuentas',
          durationMs: Date.now() - cierreStart,
          errorCode: 'CIERRE_REMOTO_FAILED',
          resultingState: 'PAGO_SIN_CIERRE_CONFIRMADO',
          message: `Pago ${transaccion.id} registrado; cierre remoto de cuenta pendiente: ${(error as Error).message}`,
        } satisfies OperableLog);
      }
    }

    const transaccionDto = this.mapTransaccion(transaccion);
    this.pagosCounter.inc({ metodo: command.metodo });
    this.pagoMontoHistogram.observe({ metodo: command.metodo }, montoRecibido.toNumber());
    this.logger.log({
      operation: 'registrarPago',
      aggregateId: command.cuentaId,
      message: cierreCompleta ? 'Pago registrado para la cuenta (completa el total).' : `Pago parcial registrado; pendiente ${montoPendienteDespues.toNumber()}.`,
    } satisfies OperableLog);
    return {
      message: !cierreCompleta
        ? `Pago parcial registrado. Falta ${montoPendienteDespues.toNumber()} por cobrar.`
        : ticket ? 'Pago registrado, cuenta cerrada y ticket generado' : 'Pago registrado; cierre de cuenta en proceso',
      transaccion: transaccionDto,
      ticket,
      turno: this.mapTurno(turno),
      pendiente: montoPendienteDespues.toNumber(),
    };
  }

  async listarTransacciones(query: ListarTransaccionesQuery = {}, usuarioSedeId?: string | null): Promise<TransaccionListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const limit = this.normalizeLimit(query.limit);
    const where: Prisma.TransaccionWhereInput = {
      sedeId,
      ...(query.metodo ? { metodo: query.metodo } : {}),
      ...(query.updatedSince
        ? { createdAt: { gte: new Date(query.updatedSince) } }
        : {}),
    };

    const transacciones = await this.prisma.transaccion.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = transacciones.length > limit;
    const data = transacciones.slice(0, limit);

    return {
      data: data.map((t) => this.mapTransaccion(t)),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  async obtenerTransaccion(id: string, usuarioSedeId?: string | null): Promise<TransaccionDto> {
    const transaccion = await this.prisma.transaccion.findUnique({ where: { id } });
    if (!transaccion || (usuarioSedeId && transaccion.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Transacción ${id} no encontrada.`);
    }
    return this.mapTransaccion(transaccion);
  }

  /**
   * Edición acotada a método de pago y notas — el monto/descuento de una
   * transacción ya cerrada queda fijo a propósito (cambiar el monto después
   * de cerrada rompería el cuadre de caja del turno). Si cambia el método,
   * también se corrige el MovimientoCaja vinculado: "Ingresos por método" y
   * "Efectivo esperado" en el resumen del turno se calculan desde ahí, no
   * desde la Transacción — sin este paso el cambio se vería pero no cuadraría.
   */
  async actualizarTransaccion(
    id: string,
    command: ActualizarTransaccionCommand,
    usuarioSedeId?: string | null,
  ): Promise<{ message: string; transaccion: TransaccionDto }> {
    const existente = await this.prisma.transaccion.findUnique({ where: { id } });
    if (!existente || (usuarioSedeId && existente.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Transacción ${id} no encontrada.`);
    }

    const data: { metodo?: string; notas?: string | null } = {};
    if (command.metodo !== undefined) data.metodo = command.metodo;
    if (command.notas !== undefined) data.notas = command.notas;

    const transaccion = await this.prisma.$transaction(async (prisma) => {
      const actualizada = await prisma.transaccion.update({ where: { id }, data });
      if (command.metodo !== undefined) {
        await prisma.movimientoCaja.updateMany({
          where: { transaccionId: id },
          data: { metodo: command.metodo },
        });
      }
      return actualizada;
    });

    this.logger.log({
      operation: 'actualizarTransaccion',
      aggregateId: id,
      message: `Transacción actualizada (metodo=${command.metodo ?? 'sin cambio'}).`,
    } satisfies OperableLog);

    return { message: 'Transacción actualizada', transaccion: this.mapTransaccion(transaccion) };
  }

  /** Historial de turnos (p.ej. cierres de caja pasados). Sin filtro de estado, lista todos. */
  async listarTurnos(query: ListarTurnosQuery = {}, usuarioSedeId?: string | null): Promise<TurnoListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const limit = this.normalizeLimit(query.limit);
    const where: Prisma.TurnoCajaWhereInput = {
      sedeId,
      ...(query.estado ? { estado: query.estado } : {}),
      ...(query.desde || query.hasta
        ? {
            cerradoAt: {
              ...(query.desde ? { gte: new Date(query.desde) } : {}),
              ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
            },
          }
        : {}),
    };

    const turnos = await this.prisma.turnoCaja.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ abiertoAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = turnos.length > limit;
    const data = turnos.slice(0, limit);

    return {
      data: data.map((t) => this.mapTurno(t)),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private buildResumen(turno: import('../generated/prisma').TurnoCaja & { movimientos?: import('../generated/prisma').MovimientoCaja[], arqueos?: import('../generated/prisma').ArqueoCaja[], cierre?: import('../generated/prisma').CierreCaja | null, transacciones?: import('../generated/prisma').Transaccion[] }) {
    const movimientos = Array.isArray(turno.movimientos) ? turno.movimientos : [];
    const ventas = movimientos.filter((m: import('../generated/prisma').MovimientoCaja) => m.tipo === 'VENTA');
    const ingresos = movimientos.filter((m: import('../generated/prisma').MovimientoCaja) => m.tipo === 'INGRESO');
    const egresos = movimientos.filter((m: import('../generated/prisma').MovimientoCaja) => m.tipo === 'EGRESO');
    const totalVentas = this.sum(ventas.map((m: import('../generated/prisma').MovimientoCaja) => m.monto));
    const totalIngresos = this.sum(ingresos.map((m: import('../generated/prisma').MovimientoCaja) => m.monto));
    const totalEgresos = this.sum(egresos.map((m: import('../generated/prisma').MovimientoCaja) => m.monto));
    const propinas = this.sum(movimientos.map((m: import('../generated/prisma').MovimientoCaja) => m.propina ?? 0));
    const porMetodo = this.emptyMetodoTotals();

    ventas.forEach((m: import('../generated/prisma').MovimientoCaja) => {
      if (m.metodo in porMetodo) porMetodo[m.metodo] += this.n(m.monto);
    });

    return {
      turno: this.mapTurno(turno),
      movimientos: movimientos.map((m: import('../generated/prisma').MovimientoCaja) => this.mapMovimiento(m)),
      ventas: ventas.map((m: import('../generated/prisma').MovimientoCaja) => this.mapMovimiento(m)),
      // Auditoría venta-por-venta (quién atendió + quién cobró), a diferencia
      // de `ventas` (agregado desde movimientos, sin cajero/mesero). Fuente:
      // Transaccion, que sí lleva usuarioId/cajeroNombre/meseroId/meseroNombre.
      ventasDetalle: (Array.isArray(turno.transacciones) ? turno.transacciones : []).map((t) => this.mapTransaccion(t)),
      totalVentas: totalVentas.toNumber(),
      totalEgresos: totalEgresos.toNumber(),
      totalIngresos: totalIngresos.toNumber(),
      propinas: propinas.toNumber(),
      porMetodo,
      efectivoEsperado: this.computeEfectivoEsperado(movimientos).toNumber(),
      comprobantes: ventas.length,
      pendientes: 0,
      arqueo: turno.arqueos?.[0] ? this.mapArqueo(turno.arqueos[0]) : null,
      cierre: turno.cierre ? this.mapCierre(turno.cierre) : null,
    };
  }

  private computeEfectivoEsperado(movimientos: import('../generated/prisma').MovimientoCaja[]) {
    return this.sum(
      movimientos
        .filter((m) => m.metodo === 'EFECTIVO')
        .map((m) => this.money(m.monto).plus(this.money(m.propina ?? 0))),
    );
  }

  private sum(values: unknown[]) {
    return values.reduce(
      (acc: Prisma.Decimal, value) => acc.plus(this.money(value as never)),
      new Prisma.Decimal(0),
    );
  }

  private sumDenominaciones(denominaciones: Record<string, number>) {
    return Object.entries(denominaciones).reduce((acc, [denom, count]) => {
      const d = Number(denom);
      const q = Number(count);
      if (!Number.isFinite(d) || !Number.isFinite(q) || q < 0) return acc;
      return acc.plus(new Prisma.Decimal(d).times(q));
    }, new Prisma.Decimal(0));
  }

  private emptyMetodoTotals() {
    return METODOS.reduce((acc, metodo) => {
      acc[metodo] = 0;
      return acc;
    }, {} as Record<string, number>);
  }

  private mapTransaccion(t: import('../generated/prisma').Transaccion): TransaccionDto {
    return {
      id: t.id,
      cuentaId: t.cuentaId,
      sedeId: t.sedeId,
      monto: this.n(t.monto),
      descuento: this.n(t.descuento),
      metodo: t.metodo,
      referencia: t.referencia || undefined,
      notas: t.notas || undefined,
      usuarioId: t.usuarioId || undefined,
      cajeroNombre: t.cajeroNombre || undefined,
      mesaId: t.mesaId || undefined,
      turnoId: t.turnoId || undefined,
      meseroId: t.meseroId || undefined,
      meseroNombre: t.meseroNombre || undefined,
      mesaNumero: t.mesaNumero || undefined,
      mesaUnidaCon: t.mesaUnidaCon || undefined,
      tipoComprobante: t.tipoComprobante,
      clienteDocumento: t.clienteDocumento || undefined,
      cuentaCorrelativo: t.cuentaCorrelativo || undefined,
      createdAt: t.createdAt.toISOString(),
    };
  }

  private mapTurno(t: import('../generated/prisma').TurnoCaja) {
    return {
      id: t.id,
      sedeId: t.sedeId,
      cajaId: t.cajaId,
      cajaNombre: t.cajaNombre,
      usuarioId: t.usuarioId,
      cajeroNombre: t.cajeroNombre ?? null,
      fondoInicial: this.n(t.fondoInicial),
      estado: t.estado,
      abiertoAt: t.abiertoAt.toISOString(),
      cerradoAt: t.cerradoAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private mapMovimiento(m: import('../generated/prisma').MovimientoCaja) {
    return {
      id: m.id,
      turnoId: m.turnoId,
      tipo: m.tipo,
      cuentaId: m.cuentaId ?? null,
      transaccionId: m.transaccionId ?? null,
      mesaId: m.mesaId ?? null,
      donde: m.donde,
      metodo: m.metodo,
      monto: this.n(m.monto),
      descuento: this.n(m.descuento),
      propina: this.n(m.propina),
      motivo: m.motivo ?? null,
      cuentaCorrelativo: m.cuentaCorrelativo ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private mapArqueo(a: import('../generated/prisma').ArqueoCaja) {
    return {
      id: a.id,
      turnoId: a.turnoId,
      denominaciones: a.denominaciones,
      efectivoEsperado: this.n(a.efectivoEsperado),
      efectivoContado: this.n(a.efectivoContado),
      diferencia: this.n(a.diferencia),
      usuarioId: a.usuarioId,
      createdAt: a.createdAt.toISOString(),
    };
  }

  private mapCierre(c: import('../generated/prisma').CierreCaja) {
    return {
      id: c.id,
      turnoId: c.turnoId ?? null,
      montoEsperado: this.n(c.montoEsperado),
      montoReal: this.n(c.montoReal),
      diferencia: this.n(c.diferencia),
      usuarioId: c.usuarioId,
      resumen: c.resumen ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
