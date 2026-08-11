// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RolesGuard } from '@org/shared-auth';
import { CrearCategoriaCommand, ActualizarCategoriaCommand, CrearProductoCommand, ActualizarProductoCommand, ListarProductosQuery, ObtenerProductosLoteCommand } from '@org/contracts';

describe('AppController (Inventario)', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const mockAppService = {
      getHello: jest.fn(),
      listarCategorias: jest.fn(),
      crearCategoria: jest.fn(),
      actualizarCategoria: jest.fn(),
      eliminarCategoria: jest.fn(),
      listarProductos: jest.fn(),
      obtenerProducto: jest.fn(),
      obtenerProductosLote: jest.fn(),
      crearProducto: jest.fn(),
      actualizarStock: jest.fn(),
      actualizarProducto: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  it('debe estar definido', () => {
    expect(appController).toBeDefined();
  });

  it('getData debe devolver hello', () => {
    jest.spyOn(appService, 'getHello').mockReturnValue({ message: 'Hello API', service: 'inventario' });
    expect(appController.getData()).toEqual({ message: 'Hello API', service: 'inventario' });
  });

  it('listarCategorias debe llamar a appService.listarCategorias', async () => {
    const expected = [{ id: '1', nombre: 'cat1' }];
    jest.spyOn(appService, 'listarCategorias').mockResolvedValue(expected as any);
    expect(await appController.listarCategorias()).toEqual(expected);
    expect(appService.listarCategorias).toHaveBeenCalled();
  });

  it('crearCategoria debe llamar a appService.crearCategoria', async () => {
    const command: CrearCategoriaCommand = { nombre: 'cat1' };
    const expected = { id: '1', nombre: 'cat1' };
    jest.spyOn(appService, 'crearCategoria').mockResolvedValue(expected as any);
    expect(await appController.crearCategoria(command)).toEqual(expected);
    expect(appService.crearCategoria).toHaveBeenCalledWith(command, undefined, undefined);
  });

  it('actualizarCategoria debe llamar a appService.actualizarCategoria', async () => {
    const command: ActualizarCategoriaCommand = { nombre: 'cat1-renombrada' };
    const expected = { id: '1', nombre: 'cat1-renombrada' };
    jest.spyOn(appService, 'actualizarCategoria').mockResolvedValue(expected as any);
    expect(await appController.actualizarCategoria('1', command)).toEqual(expected);
    expect(appService.actualizarCategoria).toHaveBeenCalledWith('1', command);
  });

  it('eliminarCategoria debe llamar a appService.eliminarCategoria', async () => {
    const expected = { message: 'Categoría eliminada' };
    jest.spyOn(appService, 'eliminarCategoria').mockResolvedValue(expected as any);
    expect(await appController.eliminarCategoria('1')).toEqual(expected);
    expect(appService.eliminarCategoria).toHaveBeenCalledWith('1');
  });

  it('listarProductos debe llamar a appService.listarProductos', async () => {
    const query: ListarProductosQuery = { limit: 10 };
    const expected = { data: [], nextCursor: null };
    jest.spyOn(appService, 'listarProductos').mockResolvedValue(expected as any);
    expect(await appController.listarProductos(query)).toEqual(expected);
    expect(appService.listarProductos).toHaveBeenCalledWith(query, undefined, undefined);
  });

  it('obtenerProducto debe llamar a appService.obtenerProducto', async () => {
    const expected = { id: 'p1', nombre: 'prod' };
    jest.spyOn(appService, 'obtenerProducto').mockResolvedValue(expected as any);
    expect(await appController.obtenerProducto('p1')).toEqual(expected);
    expect(appService.obtenerProducto).toHaveBeenCalledWith('p1');
  });

  it('obtenerProductosLote debe llamar a appService.obtenerProductosLote', async () => {
    const body: ObtenerProductosLoteCommand = { ids: ['p1'] };
    const expected = [{ id: 'p1', nombre: 'prod' }];
    jest.spyOn(appService, 'obtenerProductosLote').mockResolvedValue(expected as any);
    expect(await appController.obtenerProductosLote(body)).toEqual(expected);
    expect(appService.obtenerProductosLote).toHaveBeenCalledWith(body.ids);
  });

  it('crearProducto debe llamar a appService.crearProducto', async () => {
    const command: CrearProductoCommand = { nombre: 'prod', precio: 10, categoriaId: '1', disponible: true };
    const expected = { id: 'p1', ...command };
    jest.spyOn(appService, 'crearProducto').mockResolvedValue(expected as any);
    expect(await appController.crearProducto(command)).toEqual(expected);
    expect(appService.crearProducto).toHaveBeenCalledWith(command, undefined, undefined);
  });

  it('actualizarStock debe llamar a appService.actualizarStock', async () => {
    const expected = { id: 'p1', stockActual: 20 };
    jest.spyOn(appService, 'actualizarStock').mockResolvedValue(expected as any);
    expect(await appController.actualizarStock('p1', 20)).toEqual(expected);
    expect(appService.actualizarStock).toHaveBeenCalledWith('p1', 20);
  });

  it('actualizarProducto debe llamar a appService.actualizarProducto', async () => {
    const command: ActualizarProductoCommand = { precio: 15 };
    const expected = { id: 'p1', precio: 15 };
    jest.spyOn(appService, 'actualizarProducto').mockResolvedValue(expected as any);
    expect(await appController.actualizarProducto('p1', command)).toEqual(expected);
    expect(appService.actualizarProducto).toHaveBeenCalledWith('p1', command);
  });

  it('actualizarDisponibilidadProducto debe llamar a appService.actualizarProducto solo con disponible (rol COCINA)', async () => {
    const expected = { id: 'p1', disponible: false };
    jest.spyOn(appService, 'actualizarProducto').mockResolvedValue(expected as any);
    expect(await appController.actualizarDisponibilidadProducto('p1', { disponible: false })).toEqual(expected);
    expect(appService.actualizarProducto).toHaveBeenCalledWith('p1', { disponible: false });
  });
});
