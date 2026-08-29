import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { ServiceTokenService } from '@org/shared-auth';
import { CircuitBreakerOptions, createBulkhead, retryAsync, retryAttemptsOf } from '@org/resiliencia';
import axios from 'axios';

/**
 * Cliente HTTP de pedidos→cuentas (mismo patrón que MesasHttpClient) — hoy
 * solo para la cascada de auto-cancelación: cuando todos los ítems de la
 * atención quedan anulados, se cancela la Cuenta correspondiente para que no
 * se quede ABIERTA para siempre (eso bloquearía el cierre de turno en caja,
 * ver verificarSinCuentasAbiertas en servicio-caja).
 */
@Injectable()
export class CuentasHttpClient {
  private readonly logger = new Logger(CuentasHttpClient.name);
  private readonly TIMEOUT_MS = Number(process.env['CUENTAS_TIMEOUT_MS'] ?? 2000);
  private readonly CUENTAS_URL =
    process.env['CUENTAS_SERVICE_URL'] ?? 'http://servicio-cuentas:3000/api';
  private readonly timeoutCounter = getOrCreateCounter(
    'dependency_timeout_total', 'Timeouts en llamadas a dependencias con breaker', ['dependency'],
  );
  private readonly bulkhead = createBulkhead('cuentas', {
    maxConcurrent: Number(process.env['CUENTAS_POOL_MAX'] ?? 10),
    maxQueue: Number(process.env['CUENTAS_POOL_MAX'] ?? 10),
  });

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  private getServiceToken(): string {
    return this.serviceTokenService.generateServiceToken('servicio-pedidos', 'servicio-cuentas');
  }

  @CircuitBreakerOptions({
    timeout: Number(process.env['CUENTAS_TIMEOUT_MS'] ?? 2000) + 500,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async postCancelarCuenta(cuentaId: string, token: string): Promise<void> {
    // Idempotente en destino (ver AppService.cancelarCuenta): una cuenta ya
    // CANCELADA no falla, solo no repite el evento — seguro reintentar.
    await retryAsync(
      () =>
        axios.post(`${this.CUENTAS_URL}/${cuentaId}/cancelar`, undefined, {
          timeout: this.TIMEOUT_MS,
          headers: { Authorization: `Bearer ${token}` },
          httpAgent: this.bulkhead.httpAgent,
          httpsAgent: this.bulkhead.httpsAgent,
        }),
      { retries: 1, baseMs: 250 },
    );
  }

  /**
   * Best-effort: el ítem/pedido ya quedó anulado en nuestra BD antes de
   * llamar acá, así que un fallo de red no debe revertir nada — solo se
   * loguea para que alguien cancele la cuenta a mano si hace falta (o quede
   * "abierta con total 0" hasta que un caso paralelo la cierre/cancele).
   */
  async cancelarCuenta(cuentaId: string): Promise<boolean> {
    let token: string;
    try {
      token = this.getServiceToken();
    } catch {
      this.logger.warn({
        operation: 'cancelarCuenta',
        aggregateId: cuentaId,
        dependency: 'cuentas',
        errorCode: 'TOKEN_GENERATION_FAILED',
        message: 'No se pudo generar token para cancelar la cuenta; requiere cancelación manual.',
      } satisfies OperableLog);
      return false;
    }

    const start = Date.now();
    try {
      await this.bulkhead.run(() => this.postCancelarCuenta(cuentaId, token));
      return true;
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        this.logger.warn({
          operation: 'cancelarCuenta',
          aggregateId: cuentaId,
          dependency: 'cuentas',
          durationMs: Date.now() - start,
          errorCode: 'CIRCUIT_OPEN',
          message: 'No se pudo cancelar la cuenta: circuito de cuentas abierto.',
        } satisfies OperableLog);
        return false;
      }
      const axiosError = error as { response?: { status: number }; code?: string; message?: string };
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        this.timeoutCounter.inc({ dependency: 'cuentas' });
      }
      this.logger.warn({
        operation: 'cancelarCuenta',
        aggregateId: cuentaId,
        dependency: 'cuentas',
        durationMs: Date.now() - start,
        errorCode: axiosError.code ?? String(axiosError.response?.status ?? 'UNKNOWN'),
        retryAttempt: retryAttemptsOf(error),
        message: `No se pudo cancelar la cuenta automáticamente: ${axiosError.message}. Requiere cancelación manual.`,
      } satisfies OperableLog);
      return false;
    }
  }
}
