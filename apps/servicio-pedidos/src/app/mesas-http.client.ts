import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { ServiceTokenService } from '@org/shared-auth';
import { CircuitBreakerOptions, createBulkhead, retryAsync, retryAttemptsOf } from '@org/resiliencia';
import { ActualizarEstadoMesaCommand } from '@org/contracts';
import axios from 'axios';

export interface MesaRemota {
  id: string;
  numero: number;
  sedeId: string;
}

/**
 * T-33: cliente HTTP de pedidos→mesas con circuit breaker (mismos umbrales que
 * caja→cuentas). El mapeo fino de errores (404→NotFound, timeout/caída→503) se
 * conserva como fallback del breaker; los 4xx no cuentan para abrirlo.
 */
@Injectable()
export class MesasHttpClient {
  private readonly logger = new Logger(MesasHttpClient.name);
  // R-15: lectura (GET /mesa) → timeout corto. Breaker ≥ transporte.
  private readonly READ_TIMEOUT_MS = Number(process.env['MESAS_TIMEOUT_MS'] ?? 2000);
  private readonly MESAS_URL =
    process.env['MESAS_SERVICE_URL'] ?? 'http://servicio-mesas:3000/api';
  private readonly timeoutCounter = getOrCreateCounter(
    'dependency_timeout_total', 'Timeouts en llamadas a dependencias con breaker', ['dependency'],
  );
  // Bulkhead outbound: pool de sockets/concurrencia aislado para mesas.
  private readonly bulkhead = createBulkhead('mesas', {
    maxConcurrent: Number(process.env['MESAS_POOL_MAX'] ?? 10),
    maxQueue: Number(process.env['MESAS_POOL_MAX'] ?? 10),
  });

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  private getServiceToken(): string {
    return this.serviceTokenService.generateServiceToken('servicio-pedidos', 'servicio-mesas');
  }

  @CircuitBreakerOptions({
    timeout: Number(process.env['MESAS_TIMEOUT_MS'] ?? 2000) + 500,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async fetchMesaRemota(mesaId: string, token: string): Promise<MesaRemota> {
    // R-16: GET idempotente → 1 retry ante 5xx/red transitorio (nunca 4xx).
    // Retry dentro del breaker: éste cuenta el resultado final, no cada intento.
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

  async obtenerMesa(mesaId: string): Promise<MesaRemota> {
    let token: string;
    try {
      token = this.getServiceToken();
    } catch {
      throw new ServiceUnavailableException('No se pudo generar token para consultar mesas. Reintente.');
    }

    const start = Date.now();
    try {
      // Bulkhead por fuera del breaker: aísla el recurso antes de fallar rápido.
      return await this.bulkhead.run(() => this.fetchMesaRemota(mesaId, token));
    } catch (error: unknown) {
      // Shed load del bulkhead (503): propaga tal cual.
      if (error instanceof ServiceUnavailableException) throw error;
      const axiosError = error as { response?: { status: number }; code?: string; message?: string };
      if (axiosError.response?.status === 404) {
        throw new NotFoundException(`La mesa con ID ${mesaId} no existe o no está sincronizada.`);
      }
      if (axiosError.code === 'EOPENBREAKER') {
        // El breaker rechazó sin llamar: la dependencia ya está marcada caída.
        this.logger.warn({
          operation: 'obtenerMesa',
          aggregateId: mesaId,
          dependency: 'mesas',
          durationMs: Date.now() - start,
          errorCode: 'CIRCUIT_OPEN',
          circuitBreakerState: 'OPEN',
          message: 'Pedido no pudo validar la mesa: circuito de mesas abierto.',
        } satisfies OperableLog);
        throw new ServiceUnavailableException('El servicio de mesas no está disponible (circuito abierto).');
      }
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        this.timeoutCounter.inc({ dependency: 'mesas' });
        this.logger.warn({
          operation: 'obtenerMesa',
          aggregateId: mesaId,
          dependency: 'mesas',
          durationMs: Date.now() - start,
          errorCode: 'DEPENDENCY_TIMEOUT',
          retryAttempt: retryAttemptsOf(error),
          message: 'Timeout consultando mesa; pedido rechazado por dependencia caída.',
        } satisfies OperableLog);
        throw new ServiceUnavailableException('El servicio de mesas no responde. Reintente.');
      }
      // H-3: junto a ECONNREFUSED, los fallos de red transitorios (reset de
      // conexión, pipe roto, DNS temporal, host inalcanzable) son "dependencia
      // cayéndose" → 503 transitorio, no "error inesperado" 500.
      if (
        axiosError.code === 'ECONNREFUSED' ||
        axiosError.code === 'ECONNRESET' ||
        axiosError.code === 'EPIPE' ||
        axiosError.code === 'EAI_AGAIN' ||
        axiosError.code === 'EHOSTUNREACH'
      ) {
        this.logger.warn({
          operation: 'obtenerMesa',
          aggregateId: mesaId,
          dependency: 'mesas',
          durationMs: Date.now() - start,
          errorCode: axiosError.code,
          message: 'Fallo de red transitorio consultando mesa; dependencia no disponible.',
        } satisfies OperableLog);
        throw new ServiceUnavailableException('El servicio de mesas no está disponible.');
      }
      this.logger.error({
        operation: 'obtenerMesa',
        aggregateId: mesaId,
        dependency: 'mesas',
        durationMs: Date.now() - start,
        errorCode: axiosError.code ?? 'UNKNOWN',
        message: `Error inesperado consultando mesa: ${axiosError.message}`,
      } satisfies OperableLog);
      throw new InternalServerErrorException('No se pudo cargar la mesa desde mesas. Reintente.');
    }
  }

  @CircuitBreakerOptions({
    timeout: Number(process.env['MESAS_TIMEOUT_MS'] ?? 2000) + 500,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async patchEstadoMesa(mesaId: string, command: ActualizarEstadoMesaCommand, token: string): Promise<void> {
    // Idempotente en destino: si mesas ya está en el estado pedido, el
    // servicio devuelve "sin cambios" en vez de 409 — seguro reintentar.
    await retryAsync(
      () =>
        axios.patch(`${this.MESAS_URL}/${mesaId}/estado`, command, {
          timeout: this.READ_TIMEOUT_MS,
          headers: { Authorization: `Bearer ${token}` },
          httpAgent: this.bulkhead.httpAgent,
          httpsAgent: this.bulkhead.httpsAgent,
        }),
      { retries: 1, baseMs: 250 },
    );
  }

  /**
   * CU-02: libera la mesa (LIBRE, sin cuenta asociada) tras anular su
   * atención completa. No lanza si la mesa está caída/no responde — el
   * pedido ya quedó cancelado en nuestra BD; solo se loguea para que alguien
   * libere la mesa a mano si hace falta.
   */
  async liberarMesa(mesaId: string, estado: ActualizarEstadoMesaCommand['estado']): Promise<boolean> {
    let token: string;
    try {
      token = this.getServiceToken();
    } catch {
      this.logger.warn({
        operation: 'liberarMesa',
        aggregateId: mesaId,
        dependency: 'mesas',
        errorCode: 'TOKEN_GENERATION_FAILED',
        message: 'No se pudo generar token para liberar la mesa; requiere liberación manual.',
      } satisfies OperableLog);
      return false;
    }

    const start = Date.now();
    try {
      await this.bulkhead.run(() => this.patchEstadoMesa(mesaId, { estado, cuentaAsociada: null }, token));
      return true;
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number }; code?: string; message?: string };
      this.logger.warn({
        operation: 'liberarMesa',
        aggregateId: mesaId,
        dependency: 'mesas',
        durationMs: Date.now() - start,
        errorCode: axiosError.code ?? String(axiosError.response?.status ?? 'UNKNOWN'),
        message: `No se pudo liberar la mesa automáticamente: ${axiosError.message}. Requiere liberación manual.`,
      } satisfies OperableLog);
      return false;
    }
  }
}
