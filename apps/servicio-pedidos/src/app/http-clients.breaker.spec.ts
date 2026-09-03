// @ts-nocheck
/* eslint-disable */

import axios from 'axios';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CIRCUIT_BREAKER_REGISTRY } from '@org/resiliencia';
import { MesasHttpClient } from './mesas-http.client';
import { InventarioHttpClient } from './inventario-http.client';

/**
 * P-55 (T-33): el circuit breaker de pedidos→mesas/inventario se abre tras una
 * racha de fallos y responde 503 inmediato sin tocar la red; el mapeo fino de
 * errores (404→NotFound) se conserva y los 4xx no abren el circuito.
 */

const tokenService = { generateServiceToken: jest.fn().mockReturnValue('service-token') } as any;

function limpiarBreakers() {
  for (const [name, breaker] of CIRCUIT_BREAKER_REGISTRY) {
    breaker.shutdown();
    CIRCUIT_BREAKER_REGISTRY.delete(name);
  }
}

describe('Clientes HTTP de pedidos — circuit breaker (P-55)', () => {
  it('inventario: conserva tamaño en los nombres de la proyección de pedidos', async () => {
    const client = new InventarioHttpClient(tokenService);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { productos: [
      { id: 'p1', nombre: 'Ceviche', precio: 25, tamano: { nombre: 'Personal' } },
      { id: 'p2', nombre: 'Ceviche', precio: 45, tamano: { nombre: 'Familiar' } },
      { id: 'p3', nombre: 'Cancha', precio: 2, tamano: null },
    ] } });
    const productos = await client.obtenerProductosLote(['p1', 'p2', 'p3']);
    expect(productos.map((p) => p.nombre)).toEqual(['Ceviche · Personal', 'Ceviche · Familiar', 'Cancha']);
    expect(productos.map((p) => p.precio)).toEqual([25, 45, 2]);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    limpiarBreakers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    limpiarBreakers();
  });

  it('mesas: abre el circuito tras N fallos 5xx/red y responde 503 sin tocar la red', async () => {
    const client = new MesasHttpClient(tokenService);
    const getSpy = jest.spyOn(axios, 'get')
      .mockRejectedValue(Object.assign(new Error('conexión rechazada'), { code: 'ECONNREFUSED' }));

    // Racha de fallos para superar errorThresholdPercentage (volumen mínimo de opossum: 10)
    for (let i = 0; i < 12; i++) {
      await expect(client.obtenerMesa('mesa-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    }

    const llamadasAntes = getSpy.mock.calls.length;
    await expect(client.obtenerMesa('mesa-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    // Circuito abierto: la última petición no llegó a axios
    expect(getSpy.mock.calls.length).toBe(llamadasAntes);

    const breaker = CIRCUIT_BREAKER_REGISTRY.get('MesasHttpClient.fetchMesaRemota');
    expect(breaker?.opened).toBe(true);
  });

  it('mesas: un 404 se mapea a NotFound y NO abre el circuito', async () => {
    const client = new MesasHttpClient(tokenService);
    jest.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('not found'), { response: { status: 404 } }),
    );

    for (let i = 0; i < 12; i++) {
      await expect(client.obtenerMesa('mesa-x')).rejects.toBeInstanceOf(NotFoundException);
    }

    const breaker = CIRCUIT_BREAKER_REGISTRY.get('MesasHttpClient.fetchMesaRemota');
    expect(breaker?.opened).toBe(false);
  });

  it('inventario: abre el circuito tras N fallos y responde 503 sin tocar la red', async () => {
    const client = new InventarioHttpClient(tokenService);
    const postSpy = jest.spyOn(axios, 'post')
      .mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));

    for (let i = 0; i < 12; i++) {
      await expect(client.obtenerProductosLote(['p-1'])).rejects.toBeInstanceOf(ServiceUnavailableException);
    }

    const llamadasAntes = postSpy.mock.calls.length;
    await expect(client.obtenerProductosLote(['p-1'])).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(postSpy.mock.calls.length).toBe(llamadasAntes);

    const breaker = CIRCUIT_BREAKER_REGISTRY.get('InventarioHttpClient.fetchProductosLote');
    expect(breaker?.opened).toBe(true);
  });

  it('inventario: un ECONNRESET (red transitoria) se mapea a 503 (H-3)', async () => {
    const client = new InventarioHttpClient(tokenService);
    jest.spyOn(axios, 'post').mockRejectedValue(
      Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    );

    await expect(client.obtenerProductosLote(['p-1'])).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('mesas: un ECONNRESET (red transitoria) se mapea a 503 (H-3)', async () => {
    const client = new MesasHttpClient(tokenService);
    jest.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    );

    await expect(client.obtenerMesa('mesa-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('mesas: respuesta exitosa atraviesa el breaker y devuelve la mesa remota', async () => {
    const client = new MesasHttpClient(tokenService);
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { id: 'mesa-1', numero: 4 } });

    await expect(client.obtenerMesa('mesa-1')).resolves.toEqual({ id: 'mesa-1', numero: 4 });
  });
});
