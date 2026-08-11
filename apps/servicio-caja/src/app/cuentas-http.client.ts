import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { ServiceTokenService } from '@org/shared-auth';
import { CircuitBreakerOptions, createBulkhead, retryAsync } from '@org/resiliencia';
import axios from 'axios';

// H-3: fallos de red transitorios (dependencia cayéndose) que deben mapearse a
// 503 transitorio, no a un 500 "error inesperado".
const CODIGOS_RED_TRANSITORIA = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'EAI_AGAIN', 'EHOSTUNREACH',
]);

export interface CuentaRemota {
  id: string;
  mesaId: string;
  sedeId: string;
  total: number;
  estado: string;
  // Mesero dominante de la cuenta (auditoría de caja: quién atendió, no solo
  // quién cobró). Opcional: cuentas antiguas/sin pedido con mesero no lo traen.
  meseroId?: string;
  meseroNombre?: string;
}

/**
 * T-40: cliente HTTP de caja→cuentas extraído del god-service. Encapsula el
 * token de servicio y las llamadas axios; el breaker conserva los umbrales que
 * ya tenía fetchCuenta dentro de AppService.
 *
 * R-12: cada llamada pasa por un bulkhead outbound (pool aislado). Orden:
 * bulkhead por fuera del breaker — los métodos públicos hacen bulkhead.run(...)
 * de los métodos privados con breaker.
 */
@Injectable()
export class CuentasHttpClient {
  private readonly logger = new Logger(CuentasHttpClient.name);
  private readonly CUENTAS_URL =
    process.env['CUENTAS_SERVICE_URL'] ?? 'http://servicio-cuentas:3000/api';
  // R-15: lectura corta vs dinero (cierre) más holgado. Breaker ≥ transporte.
  private readonly READ_TIMEOUT_MS = Number(process.env['CUENTAS_TIMEOUT_MS'] ?? 2000);
  private readonly CIERRE_TIMEOUT_MS = Number(process.env['CUENTAS_CIERRE_TIMEOUT_MS'] ?? 4000);
  private readonly timeoutCounter = getOrCreateCounter(
    'dependency_timeout_total', 'Timeouts en llamadas a dependencias con breaker', ['dependency'],
  );
  // Bulkhead outbound: pool de sockets/concurrencia aislado para cuentas.
  private readonly bulkhead = createBulkhead('cuentas', {
    maxConcurrent: Number(process.env['CUENTAS_POOL_MAX'] ?? 10),
    maxQueue: Number(process.env['CUENTAS_POOL_MAX'] ?? 10),
  });

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  private getServiceToken(): string {
    // Caja solo llama a cuentas → audiencia fija (T-17).
    return this.serviceTokenService.generateServiceToken('servicio-caja', 'servicio-cuentas');
  }

  private contarTimeout(error: unknown): void {
    const code = (error as { code?: string }).code;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      this.timeoutCounter.inc({ dependency: 'cuentas' });
    }
  }

  // H-3: un reset de conexión (o pipe roto/DNS temporal/host inalcanzable)
  // durante una caída es una dependencia transitoriamente no disponible → 503,
  // no un 500 "error inesperado". El breaker (por dentro) ya contó el fallo con
  // el error crudo; aquí, en el borde, se traduce el código a 503 para el caller.
  // Se preservan intactos EOPENBREAKER y los timeouts (los mapea app.service).
  private throwSiRedTransitoria(error: unknown, operation: string, aggregateId: string): void {
    const code = (error as { code?: string }).code;
    if (code && CODIGOS_RED_TRANSITORIA.has(code)) {
      this.logger.warn({
        operation,
        aggregateId,
        dependency: 'cuentas',
        errorCode: code,
        message: 'Fallo de red transitorio hacia cuentas; dependencia no disponible.',
      } satisfies OperableLog);
      throw new ServiceUnavailableException('El servicio de cuentas no está disponible.');
    }
  }

  async fetchCuenta(cuentaId: string): Promise<CuentaRemota> {
    try {
      return await this.bulkhead.run(() => this.fetchCuentaConBreaker(cuentaId));
    } catch (error) {
      this.throwSiRedTransitoria(error, 'fetchCuenta', cuentaId);
      throw error;
    }
  }

  async cerrarCuenta(cuentaId: string, descuento: number) {
    try {
      return await this.bulkhead.run(() => this.cerrarCuentaConBreaker(cuentaId, descuento));
    } catch (error) {
      this.throwSiRedTransitoria(error, 'cerrarCuenta', cuentaId);
      throw error;
    }
  }

  @CircuitBreakerOptions({
    timeout: Number(process.env['CUENTAS_TIMEOUT_MS'] ?? 2000) + 500,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
  })
  private async fetchCuentaConBreaker(cuentaId: string): Promise<CuentaRemota> {
    try {
      // R-16: GET idempotente → 1 retry ante 5xx/red transitorio (nunca 4xx).
      const res = await retryAsync(
        () =>
          axios.get<CuentaRemota>(`${this.CUENTAS_URL}/${cuentaId}`, {
            timeout: this.READ_TIMEOUT_MS,
            headers: { Authorization: `Bearer ${this.getServiceToken()}` },
            httpAgent: this.bulkhead.httpAgent,
            httpsAgent: this.bulkhead.httpsAgent,
          }),
        { retries: 1, baseMs: 250 },
      );
      return res.data;
    } catch (error) {
      this.contarTimeout(error);
      throw error;
    }
  }

  // Ruta de dinero: breaker con timeout "pago" (4 s). Los 4xx no abren el
  // circuito; si abre, el catch de app.service degrada a PAGO_SIN_CIERRE_CONFIRMADO.
  @CircuitBreakerOptions({
    timeout: Number(process.env['CUENTAS_CIERRE_TIMEOUT_MS'] ?? 4000) + 500,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async cerrarCuentaConBreaker(cuentaId: string, descuento: number) {
    try {
      const res = await axios.post(
        `${this.CUENTAS_URL}/${cuentaId}/cerrar`,
        { descuento },
        {
          timeout: this.CIERRE_TIMEOUT_MS,
          headers: { Authorization: `Bearer ${this.getServiceToken()}` },
          httpAgent: this.bulkhead.httpAgent,
          httpsAgent: this.bulkhead.httpsAgent,
        },
      );
      return res.data as never;
    } catch (error) {
      this.contarTimeout(error);
      throw error;
    }
  }
}
