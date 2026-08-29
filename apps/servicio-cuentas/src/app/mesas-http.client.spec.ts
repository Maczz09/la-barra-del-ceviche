// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { MesasHttpClient } from './mesas-http.client';
import { ServiceTokenService } from '@org/shared-auth';
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

// A diferencia de MesasHttpClient de servicio-pedidos (camino de request de
// usuario, propaga excepciones mapeadas), este cliente es best-effort a
// propósito: solo lo usa el cron de reconciliación, así que cualquier fallo
// devuelve null en vez de lanzar — nunca debe tumbar el tick del cron.
describe('MesasHttpClient (servicio-cuentas)', () => {
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

  it('devuelve la mesa cuando la consulta tiene éxito', async () => {
    serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
    const mesa = { id: 'm-1', estado: 'LIBRE', cuentaAsociada: null };
    mockedAxios.get.mockResolvedValueOnce({ data: mesa });

    await expect(client.obtenerMesa('m-1')).resolves.toEqual(mesa);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/m-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer mock-token' } }),
    );
  });

  it('devuelve null (sin lanzar) si no se puede generar el token', async () => {
    serviceTokenService.generateServiceToken.mockImplementation(() => {
      throw new Error('Token error');
    });

    await expect(client.obtenerMesa('m-1')).resolves.toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('devuelve null (sin lanzar) en un 404', async () => {
    serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
    mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

    await expect(client.obtenerMesa('m-1')).resolves.toBeNull();
  });

  it('devuelve null (sin lanzar) con el circuito abierto', async () => {
    serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
    mockedAxios.get.mockRejectedValue({ code: 'EOPENBREAKER' });

    await expect(client.obtenerMesa('m-1')).resolves.toBeNull();
  });

  it('devuelve null (sin lanzar) en timeout', async () => {
    serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
    mockedAxios.get.mockRejectedValue({ code: 'ECONNABORTED' });

    await expect(client.obtenerMesa('m-1')).resolves.toBeNull();
  });

  it('recupera un 503 transitorio en el 2.º intento', async () => {
    serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
    mockedAxios.get
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { id: 'm-1', estado: 'LIBRE', cuentaAsociada: null } });

    await expect(client.obtenerMesa('m-1')).resolves.toEqual({ id: 'm-1', estado: 'LIBRE', cuentaAsociada: null });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });
});
