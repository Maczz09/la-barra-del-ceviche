import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { CuentasHttpClient } from './cuentas-http.client';

/**
 * H-2: reconciliación automática del único hueco residual de la ruta de dinero.
 * Un pago se persiste en caja pero el cierre remoto de la cuenta puede degradarse
 * (evento `pago.registrado` FAILED / cuentas caído): la Transaccion queda escrita
 * y la CuentaAbierta sigue ABIERTA (estado PAGO_SIN_CIERRE_CONFIRMADO).
 *
 * Este cron reintenta el cierre remoto de esas cuentas. Como CuentaAbierta no
 * tiene timestamps, la antigüedad se toma de su Transaccion (sin migración). Si
 * cuentas sigue caído, el breaker del cliente hace fail-fast y el ciclo lo
 * reintenta al siguiente tick — sin reintentos propios.
 */
@Injectable()
export class CierreReconciliacionService {
  private readonly logger = new Logger(CierreReconciliacionService.name);
  // Solo cuentas cuya transacción es más vieja que este umbral: descarta pagos
  // en curso normal cuyo cierre asíncrono todavía puede llegar.
  private readonly UMBRAL_MS = 5 * 60 * 1000;
  private readonly LIMITE_POR_TICK = 20;

  private readonly reconciliadoCounter = getOrCreateCounter(
    'pagos_cierre_reconciliado_total',
    'Cierres remotos de cuenta reconciliados por el cron tras una degradación',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly cuentasHttp: CuentasHttpClient,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconciliarCierresPendientes(): Promise<void> {
    const cutoff = new Date(Date.now() - this.UMBRAL_MS);

    // La antigüedad viene de la Transaccion (CuentaAbierta no tiene timestamps).
    // Esta primera consulta solo acota candidatos; debajo se suman TODOS sus
    // pagos y se verifica el saldo. Un pago parcial viejo no es un cierre
    // degradado y jamás debe cerrar una cuenta que todavía tiene deuda.
    const transaccionesViejas = await this.prisma.transaccion.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { cuentaId: true },
      distinct: ['cuentaId'],
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const cuentaIds = transaccionesViejas.map((t) => t.cuentaId);
    if (cuentaIds.length === 0) return;

    const agregados = await this.prisma.transaccion.groupBy({
      by: ['cuentaId'],
      where: { cuentaId: { in: cuentaIds } },
      _sum: { monto: true },
      _max: { descuento: true, createdAt: true },
    });
    const agregadoPorCuenta = new Map(agregados.map((a) => [a.cuentaId, a]));

    const abiertas = await this.prisma.cuentaAbierta.findMany({
      where: { cuentaId: { in: cuentaIds }, estado: 'ABIERTA' },
    });
    const pendientes = abiertas.filter((cuenta) => {
      const agregado = agregadoPorCuenta.get(cuenta.cuentaId);
      if (!agregado?._max.createdAt || agregado._max.createdAt >= cutoff) return false;
      const pagado = Number(agregado._sum.monto ?? 0);
      const descuento = Number(agregado._max.descuento ?? 0);
      const totalConDescuento = Math.max(0, Number(cuenta.total) - descuento);
      return pagado + 0.01 >= totalConDescuento;
    }).slice(0, this.LIMITE_POR_TICK);

    for (const cuenta of pendientes) {
      const agregado = agregadoPorCuenta.get(cuenta.cuentaId);
      const descuento = Number(agregado?._max.descuento ?? 0);
      try {
        await this.cuentasHttp.cerrarCuenta(cuenta.cuentaId, descuento);
        await this.prisma.cuentaAbierta.update({
          where: { cuentaId: cuenta.cuentaId },
          data: { estado: 'CERRADA' },
        });
        this.reconciliadoCounter.inc();
        this.logger.log({
          operation: 'reconciliarCierre',
          aggregateId: cuenta.cuentaId,
          dependency: 'cuentas',
          resultingState: 'CERRADA',
          message: `Cierre remoto reconciliado para cuenta ${cuenta.cuentaId}.`,
        } satisfies OperableLog);
      } catch (error) {
        // cuentas sigue caído (breaker fail-fast) → se reintenta al próximo tick.
        this.logger.warn({
          operation: 'reconciliarCierre',
          aggregateId: cuenta.cuentaId,
          dependency: 'cuentas',
          resultingState: 'PAGO_SIN_CIERRE_CONFIRMADO',
          errorCode: 'CIERRE_RECONCILIACION_PENDIENTE',
          message: `No se pudo reconciliar el cierre de ${cuenta.cuentaId}: ${(error as Error).message}`,
        } satisfies OperableLog);
      }
    }
  }
}
