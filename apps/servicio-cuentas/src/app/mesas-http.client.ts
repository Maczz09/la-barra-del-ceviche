import { Injectable, Logger } from '@nestjs/common';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { ServiceTokenService } from '@org/shared-auth';
import { CircuitBreakerOptions, createBulkhead, retryAsync, retryAttemptsOf } from '@org/resiliencia';
import axios from 'axios';

export interface MesaRemota {
  id: string;
  estado: string;
  cuentaAsociada?: string | null;
}

/**
 * cuentas→mesas, usado solo por CuentaMesaReconciliacionService (barrido de
 * respaldo del cron): consulta el estado real de una mesa para detectar
 * cuentas ABIERTA que quedaron huérfanas. Mismo patrón (breaker + bulkhead)
 * que MesasHttpClient de servicio-pedidos, recortado a la única lectura que
 * necesita este servicio.
 */
@Injectable()
export class MesasHttpClient {
  private readonly logger = new Logger(MesasHttpClient.name);
  private readonly READ_TIMEOUT_MS = Number(process.env['MESAS_TIMEOUT_MS'] ?? 2000);
  private readonly MESAS_URL =
    process.env['MESAS_SERVICE_URL'] ?? 'http://servicio-mesas:3000/api';
  private readonly timeoutCounter = getOrCreateCounter(
    'dependency_timeout_total', 'Timeouts en llamadas a dependencias con breaker', ['dependency'],
  );
  private readonly bulkhead = createBulkhead('mesas', {
    maxConcurrent: Number(process.env['MESAS_POOL_MAX'] ?? 10),
    maxQueue: Number(process.env['MESAS_POOL_MAX'] ?? 10),
  });

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  @CircuitBreakerOptions({
    timeout: Number(process.env['MESAS_TIMEOUT_MS'] ?? 2000) + 500,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async fetchMesaRemota(mesaId: string, token: string): Promise<MesaRemota> {
    const { data } = await retryAsync(
      () =>
        axios.get<MesaRemota>(`${this.MESAS_URL}/${mesaId}`, {
          timeout: this.READ_TIMEOUT_MS,
          headers: { Authorization: `Bearer ${token}` },
          httpAgent: this.bulkhead.httpAgent,
          httpsAgent: this.bulkhead.httpsAgent,
        }),
      { retries: 1, baseMs: 250 },
    );
    return data;
  }

  /**
   * Best-effort a propósito: es un barrido periódico, no un camino de
   * request de usuario. Cualquier fallo (mesa no encontrada, timeout,
   * circuito abierto, red caída) devuelve null — esa cuenta simplemente
   * se revisa de nuevo en el próximo tick del cron.
   */
  async obtenerMesa(mesaId: string): Promise<MesaRemota | null> {
    let token: string;
    try {
      token = this.serviceTokenService.generateServiceToken('servicio-cuentas', 'servicio-mesas');
    } catch {
      return null;
    }

    const start = Date.now();
    try {
      return await this.bulkhead.run(() => this.fetchMesaRemota(mesaId, token));
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number }; code?: string; message?: string };
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        this.timeoutCounter.inc({ dependency: 'mesas' });
      }
      this.logger.warn({
        operation: 'obtenerMesa',
        aggregateId: mesaId,
        dependency: 'mesas',
        durationMs: Date.now() - start,
        errorCode: axiosError.code ?? String(axiosError.response?.status ?? 'UNKNOWN'),
        retryAttempt: retryAttemptsOf(error),
        message: `No se pudo consultar la mesa ${mesaId} para reconciliación: ${axiosError.message}`,
      } satisfies OperableLog);
      return null;
    }
  }
}
