import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { ServiceTokenService } from '@org/shared-auth';
import { CircuitBreakerOptions, createBulkhead } from '@org/resiliencia';
import axios from 'axios';

export interface ProductoRemotoLote {
  id: string;
  nombre: string;
  precio: number;
  stockActual: number | null;
  categoria?: { nombre: string; area?: string } | null;
  disponible: boolean;
}

/**
 * T-33: cliente HTTP de pedidos→inventario con circuit breaker (mismos umbrales
 * que caja→cuentas). El mapeo fino de errores se conserva como fallback del
 * breaker; los 4xx no cuentan para abrirlo.
 */
@Injectable()
export class InventarioHttpClient {
  private readonly logger = new Logger(InventarioHttpClient.name);
  // R-15: lectura (productos/lote) → timeout corto. Breaker ≥ transporte para que
  // el timeout de axios se dispare (y se cuente) antes que el del breaker.
  private readonly READ_TIMEOUT_MS = Number(process.env['INVENTARIO_TIMEOUT_MS'] ?? 2000);
  private readonly INVENTARIO_URL =
    process.env['INVENTARIO_SERVICE_URL'] ?? 'http://servicio-inventario:3000/api';

  private readonly timeoutCounter = getOrCreateCounter(
    'dependency_timeout_total', 'Timeouts en llamadas a dependencias con breaker', ['dependency'],
  );
  // Bulkhead outbound: pool de sockets/concurrencia aislado para inventario.
  private readonly bulkhead = createBulkhead('inventario', {
    maxConcurrent: Number(process.env['INVENTARIO_POOL_MAX'] ?? 10),
    maxQueue: Number(process.env['INVENTARIO_POOL_MAX'] ?? 10),
  });

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  private getServiceToken(): string {
    return this.serviceTokenService.generateServiceToken('servicio-pedidos', 'servicio-inventario');
  }

  @CircuitBreakerOptions({
    timeout: Number(process.env['INVENTARIO_TIMEOUT_MS'] ?? 2000) + 500,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async fetchProductosLote(ids: string[], token: string): Promise<ProductoRemotoLote[]> {
    const { data } = await axios.post<ProductoRemotoLote[]>(
      `${this.INVENTARIO_URL}/productos/lote`,
      { ids },
      {
        timeout: this.READ_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${token}` },
        httpAgent: this.bulkhead.httpAgent,
        httpsAgent: this.bulkhead.httpsAgent,
      },
    );
    return Array.isArray(data) ? data : ((data as { productos?: ProductoRemotoLote[] }).productos ?? []);
  }

  async obtenerProductosLote(ids: string[]): Promise<ProductoRemotoLote[]> {
    let token: string;
    try {
      token = this.getServiceToken();
    } catch {
      throw new ServiceUnavailableException('No se pudo generar token para inventario. Reintente.');
    }

    const start = Date.now();
    try {
      // Bulkhead por fuera del breaker: aísla el recurso antes de fallar rápido.
      return await this.bulkhead.run(() => this.fetchProductosLote(ids, token));
    } catch (error: unknown) {
      // Shed load del bulkhead (503): propaga tal cual, no lo degrades a 500.
      if (error instanceof ServiceUnavailableException) throw error;
      const axiosError = error as { response?: { status: number }; code?: string; message?: string };
      if (axiosError.code === 'EOPENBREAKER') {
        this.logger.warn({
          operation: 'obtenerProductosLote',
          dependency: 'inventario',
          durationMs: Date.now() - start,
          errorCode: 'CIRCUIT_OPEN',
          circuitBreakerState: 'OPEN',
          message: 'Pedido no pudo validar stock: circuito de inventario abierto.',
        } satisfies OperableLog);
        throw new ServiceUnavailableException('El servicio de inventario no está disponible (circuito abierto).');
      }

      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        this.timeoutCounter.inc({ dependency: 'inventario' });
        // El POST /productos/lote no se reintenta (no idempotente): tras el
        // timeout el pedido se RECHAZA (503), no queda en estado pendiente.
        this.logger.warn({
          operation: 'obtenerProductosLote',
          dependency: 'inventario',
          durationMs: Date.now() - start,
          errorCode: 'DEPENDENCY_TIMEOUT',
          message: 'Timeout consultando inventario; pedido rechazado por dependencia caída.',
        } satisfies OperableLog);
        throw new ServiceUnavailableException('El servicio de inventario no responde. Reintente.');
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
          operation: 'obtenerProductosLote',
          dependency: 'inventario',
          durationMs: Date.now() - start,
          errorCode: axiosError.code,
          message: 'Fallo de red transitorio consultando inventario; dependencia no disponible.',
        } satisfies OperableLog);
        throw new ServiceUnavailableException('El servicio de inventario no está disponible.');
      }
      this.logger.error({
        operation: 'obtenerProductosLote',
        dependency: 'inventario',
        durationMs: Date.now() - start,
        errorCode: axiosError.code ?? 'UNKNOWN',
        message: `Error inesperado consultando inventario: ${axiosError.message}`,
      } satisfies OperableLog);
      throw new InternalServerErrorException('No se pudieron cargar productos desde inventario. Reintente.');
    }
  }
}
