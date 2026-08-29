// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { MesasHttpClient } from './mesas-http.client';
import { ServiceTokenService } from '@org/shared-auth';
import { NotFoundException, ServiceUnavailableException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
jest.mock('@org/resiliencia', () => {
  const actual = jest.requireActual('@org/resiliencia') as any;
  return {
    ...actual,
    CircuitBreakerOptions: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  };
});
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MesasHttpClient', () => {
  let client: MesasHttpClient;
  let serviceTokenService: jest.Mocked<ServiceTokenService>;

  beforeEach(async () => {
    serviceTokenService = {
      generateServiceToken: jest.fn(),
    } as unknown as jest.Mocked<ServiceTokenService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MesasHttpClient,
        { provide: ServiceTokenService, useValue: serviceTokenService },
      ],
    }).compile();

    client = module.get<MesasHttpClient>(MesasHttpClient);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(client).toBeDefined();
  });

  describe('obtenerMesa', () => {
    it('should throw ServiceUnavailableException if token generation fails', async () => {
      serviceTokenService.generateServiceToken.mockImplementation(() => {
        throw new Error('Token error');
      });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('No se pudo generar token para consultar mesas. Reintente.')
      );
    });

    it('should fetch mesa successfully', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      const expectedMesa = { id: 'mesa-1', numero: 5 };
      mockedAxios.get.mockResolvedValueOnce({ data: expectedMesa });

      const result = await client.obtenerMesa('mesa-1');
      expect(result).toEqual(expectedMesa);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/mesa-1'),
        expect.objectContaining({ timeout: 2000, headers: { Authorization: 'Bearer mock-token' } })
      );
    });

    it('should throw NotFoundException on 404', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValueOnce({ response: { status: 404 } });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new NotFoundException('La mesa con ID mesa-1 no existe o no está sincronizada.')
      );
    });

    it('should throw ServiceUnavailableException on open breaker', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValue({ code: 'EOPENBREAKER' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('El servicio de mesas no está disponible (circuito abierto).')
      );
    });

    it('should throw ServiceUnavailableException on timeout', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValue({ code: 'ECONNABORTED' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('El servicio de mesas no responde. Reintente.')
      );
    });

    it('should throw ServiceUnavailableException on connection refused', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValue({ code: 'ECONNREFUSED' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('El servicio de mesas no está disponible.')
      );
    });

    it('should throw ServiceUnavailableException on ECONNRESET (H-3)', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValue({ code: 'ECONNRESET' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('El servicio de mesas no está disponible.')
      );
    });

    it('should throw InternalServerErrorException on other errors', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValue({ message: 'Random error' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new InternalServerErrorException('No se pudo cargar la mesa desde mesas. Reintente.')
      );
    });

    // R-16: 1 retry en la lectura GET idempotente.
    it('recupera un 503 transitorio en el 2.º intento', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({ data: { id: 'mesa-1', numero: 7 } });

      await expect(client.obtenerMesa('mesa-1')).resolves.toEqual({ id: 'mesa-1', numero: 7 });
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('un 404 NO se reintenta', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

      await expect(client.obtenerMesa('mesa-x')).rejects.toThrow(NotFoundException);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('liberarMesa (CU-02)', () => {
    it('devuelve false sin llamar a axios si no se puede generar el token', async () => {
      serviceTokenService.generateServiceToken.mockImplementation(() => {
        throw new Error('Token error');
      });

      await expect(client.liberarMesa('mesa-1', 'LIBRE')).resolves.toBe(false);
      expect(mockedAxios.patch).not.toHaveBeenCalled();
    });

    it('libera la mesa exitosamente (PATCH con estado LIBRE y cuentaAsociada null)', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.patch.mockResolvedValueOnce({ data: {} });

      await expect(client.liberarMesa('mesa-1', 'LIBRE')).resolves.toBe(true);
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        expect.stringContaining('/mesa-1/estado'),
        { estado: 'LIBRE', cuentaAsociada: null },
        expect.objectContaining({ headers: { Authorization: 'Bearer mock-token' } }),
      );
    });

    it('devuelve false (sin lanzar) si el servicio de mesas no responde', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.patch.mockRejectedValue({ code: 'ECONNREFUSED' });

      await expect(client.liberarMesa('mesa-1', 'LIBRE')).resolves.toBe(false);
    });

    it('recupera un 503 transitorio en el 2.º intento', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.patch
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({ data: {} });

      await expect(client.liberarMesa('mesa-1', 'LIBRE')).resolves.toBe(true);
      expect(mockedAxios.patch).toHaveBeenCalledTimes(2);
    });
  });
});
