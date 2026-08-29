import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { CuentaEstado } from '@org/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { MesasHttpClient } from './mesas-http.client';
import { AppService } from './app.service';

/**
 * Red de seguridad del bug de cuentas huérfanas (mesa↔cuenta desincronizadas
 * entre dos bases de datos independientes sin integridad referencial — ver
 * AppService.procesarMesaActualizada, que reconcilia en cada evento
 * MesaActualizada). Ese camino solo reacciona a un evento NUEVO: una cuenta
 * que ya quedó huérfana (ej. carrera de despliegue: una versión vieja del
 * código procesó el evento que la habría enganchado a la cascada de
 * cancelación) se queda huérfana para siempre si nadie vuelve a tocar esa
 * mesa. Este cron es el barrido de respaldo: revisa cada cuenta ABIERTA
 * contra el estado real de su mesa en servicio-mesas.
 *
 * UMBRAL_MS evita falsos positivos: una cuenta recién creada (abrirCuenta/
 * procesarPedidoCreado) todavía no fue reflejada en la mesa — ese enganche
 * llega async vía el evento CuentaAbierta que consume servicio-mesas. Sin el
 * umbral, este cron podría cancelar una cuenta legítima creada segundos
 * antes (mismo criterio que CierreReconciliacionService en servicio-caja).
 */
@Injectable()
export class CuentaMesaReconciliacionService {
  private readonly logger = new Logger(CuentaMesaReconciliacionService.name);
  private readonly UMBRAL_MS = 2 * 60 * 1000;
  private readonly LIMITE_POR_TICK = 50;

  private readonly reconciliadoCounter = getOrCreateCounter(
    'cuentas_huerfanas_reconciliadas_total',
    'Cuentas ABIERTA canceladas por el cron de reconciliación mesa↔cuenta',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly mesasHttp: MesasHttpClient,
    private readonly appService: AppService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconciliarCuentasHuerfanas(): Promise<void> {
    const cutoff = new Date(Date.now() - this.UMBRAL_MS);

    const cuentasAbiertas = await this.prisma.cuenta.findMany({
      where: { estado: CuentaEstado.Abierta, createdAt: { lt: cutoff } },
      take: this.LIMITE_POR_TICK,
    });
    if (cuentasAbiertas.length === 0) return;

    for (const cuenta of cuentasAbiertas) {
      const mesa = await this.mesasHttp.obtenerMesa(cuenta.mesaId);
      if (!mesa) continue; // mesa no encontrada/servicio caído — se reintenta en el próximo tick
      if (mesa.cuentaAsociada === cuenta.id) continue; // sigue vigente

      this.logger.warn({
        operation: 'reconciliarCuentasHuerfanas',
        aggregateId: cuenta.id,
        errorCode: 'CUENTA_HUERFANA',
        message: `Cuenta ${cuenta.id} (ABIERTA desde ${cuenta.createdAt.toISOString()}) ya no coincide con la mesa ${cuenta.mesaId} (cuentaAsociada actual: ${mesa.cuentaAsociada ?? 'null'}) — se cancela.`,
      } satisfies OperableLog);

      try {
        await this.appService.cancelarCuenta(cuenta.id);
        this.reconciliadoCounter.inc();
      } catch (error: unknown) {
        this.logger.warn({
          operation: 'reconciliarCuentasHuerfanas',
          aggregateId: cuenta.id,
          errorCode: 'RECONCILIACION_FALLIDA',
          message: `No se pudo cancelar la cuenta huérfana ${cuenta.id}: ${(error as Error)?.message}`,
        } satisfies OperableLog);
      }
    }
  }
}
