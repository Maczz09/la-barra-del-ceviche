import 'reflect-metadata';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriaArea, Prisma } from '../generated/prisma';
import { ROLES_KEY } from '@org/shared-auth';

const SEDE = 'sede-1';
const tamano = { id: 't1', sedeId: SEDE, nombre: 'Personal', orden: 10, activo: true };
const categoria = { id: 'c1', sedeId: SEDE, nombre: 'Ceviches', area: CategoriaArea.COCINA };
const producto = { id: 'p1', sedeId: SEDE, categoriaId: 'c1', categoria, tamanoId: 't1', tamano, nombre: 'Ceviche de pescado', precio: new Prisma.Decimal(15), disponible: true, stockActual: null };

function mocks() {
  const prisma = {
    tamanoPlato: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    producto: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    categoria: { findMany: jest.fn(), findUnique: jest.fn() },
    menuDiario: { findMany: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (db: typeof prisma) => Promise<unknown>) => cb(prisma));
  prisma.tamanoPlato.findUnique.mockResolvedValue(tamano);
  prisma.tamanoPlato.findFirst.mockResolvedValue(null);
  prisma.tamanoPlato.findMany.mockResolvedValue([tamano]);
  prisma.tamanoPlato.create.mockResolvedValue(tamano);
  prisma.tamanoPlato.update.mockResolvedValue(tamano);
  prisma.producto.findUnique.mockResolvedValue(producto);
  prisma.producto.findMany.mockResolvedValue([producto]);
  prisma.producto.create.mockResolvedValue(producto);
  prisma.producto.update.mockResolvedValue(producto);
  prisma.categoria.findUnique.mockResolvedValue(categoria);
  prisma.categoria.findMany.mockResolvedValue([categoria]);
  return prisma;
}

describe('Tamaños de plato por sede', () => {
  let prisma: ReturnType<typeof mocks>;
  let service: AppService;
  beforeEach(() => { prisma = mocks(); service = new AppService(prisma as unknown as PrismaService); });

  it('lista ordenados, respeta sede fija y no crea datos en GET', async () => {
    expect(await service.listarTamanosPlato(SEDE, 'otra')).toEqual({ tamanos: [tamano] });
    expect(prisma.tamanoPlato.findMany).toHaveBeenCalledWith({ where: { sedeId: SEDE }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }, { id: 'asc' }] });
    expect(prisma.tamanoPlato.create).not.toHaveBeenCalled();
  });

  it('exige sede seleccionada al administrador general', async () => {
    await expect(service.listarTamanosPlato()).rejects.toThrow('Indica la sede');
  });

  it('crea y normaliza espacios sin inferir tamaños del nombre', async () => {
    await service.crearTamanoPlato({ nombre: '  Para dos  ', orden: 25 }, SEDE);
    expect(prisma.tamanoPlato.create).toHaveBeenCalledWith({ data: { sedeId: SEDE, nombre: 'Para dos', orden: 25, activo: true } });
  });

  it('rechaza nombres vacíos', async () => {
    await expect(service.crearTamanoPlato({ nombre: '   ' }, SEDE)).rejects.toThrow('entre 1 y 60');
  });

  it('rechaza duplicado case-insensitive', async () => {
    prisma.tamanoPlato.findFirst.mockResolvedValue(tamano);
    await expect(service.crearTamanoPlato({ nombre: 'personal' }, SEDE)).rejects.toThrow('Ya existe');
    expect(prisma.tamanoPlato.create).not.toHaveBeenCalled();
  });

  it('traduce colisión simultánea de unique a conflicto', async () => {
    prisma.tamanoPlato.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.crearTamanoPlato({ nombre: 'Personal' }, SEDE)).rejects.toThrow('Ya existe');
  });

  it('renombrar emite nombre compuesto para todas las proyecciones, no toca históricos', async () => {
    prisma.tamanoPlato.update.mockResolvedValue({ ...tamano, nombre: 'Individual', orden: 5 });
    await service.actualizarTamanoPlato('t1', { nombre: 'Individual', orden: 5 }, SEDE);
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({ data: { routingKey: 'producto.actualizado', payload: expect.any(String), status: 'PENDING' } });
    const payload = JSON.parse(prisma.outboxEvent.create.mock.calls[0][0].data.payload as string);
    expect(payload).toMatchObject({ id: 'p1', sedeId: SEDE, nombre: 'Ceviche de pescado · Individual', precio: 15 });
    expect(prisma.producto.update).not.toHaveBeenCalled();
  });

  it.each(['actualizar', 'eliminar'])('%s no permite acceder a tamaño ajeno', async (operacion) => {
    prisma.tamanoPlato.findUnique.mockResolvedValue({ ...tamano, sedeId: 'otra', _count: { productos: 0 } });
    const resultado = operacion === 'actualizar' ? service.actualizarTamanoPlato('t1', { activo: false }, SEDE) : service.eliminarTamanoPlato('t1', SEDE);
    await expect(resultado).rejects.toThrow('Tamaño no encontrado');
    expect(prisma.tamanoPlato.update).not.toHaveBeenCalled();
    expect(prisma.tamanoPlato.delete).not.toHaveBeenCalled();
  });

  it('permite desactivar un tamaño usado conservando sus productos', async () => {
    prisma.tamanoPlato.update.mockResolvedValue({ ...tamano, activo: false });
    const result = await service.actualizarTamanoPlato('t1', { activo: false }, SEDE);
    expect(result.tamano.activo).toBe(false);
    expect(prisma.producto.update).not.toHaveBeenCalled();
  });

  it('bloquea eliminar tamaño usado y permite eliminar uno libre', async () => {
    prisma.tamanoPlato.findUnique.mockResolvedValueOnce({ ...tamano, _count: { productos: 2 } }).mockResolvedValueOnce({ ...tamano, _count: { productos: 0 } });
    await expect(service.eliminarTamanoPlato('t1', SEDE)).rejects.toThrow('platos asociados');
    expect(prisma.tamanoPlato.delete).not.toHaveBeenCalled();
    await expect(service.eliminarTamanoPlato('t1', SEDE)).resolves.toEqual({ message: 'Tamaño eliminado' });
  });

  it('la FK protege eliminaciones concurrentes', async () => {
    prisma.tamanoPlato.findUnique.mockResolvedValue({ ...tamano, _count: { productos: 0 } });
    prisma.tamanoPlato.delete.mockRejectedValue({ code: 'P2003' });
    await expect(service.eliminarTamanoPlato('t1', SEDE)).rejects.toThrow('platos asociados');
  });

  it('crear plato incluye relación y publica presentación completa', async () => {
    const result = await service.crearProducto({ nombre: producto.nombre, categoriaId: 'c1', tamanoId: 't1', precio: 15 }, SEDE);
    expect(result.producto).toMatchObject({ nombre: producto.nombre, tamanoId: 't1', tamano: { nombre: 'Personal' }, precio: 15 });
    expect(prisma.producto.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tamanoId: 't1' }), include: { categoria: true, tamano: true } }));
    expect(JSON.parse(prisma.outboxEvent.create.mock.calls[0][0].data.payload as string).nombre).toBe('Ceviche de pescado · Personal');
  });

  it.each(['inactivo', 'ajeno', 'inexistente'])('no asigna un tamaño %s al crear', async (caso) => {
    prisma.tamanoPlato.findUnique.mockResolvedValue(caso === 'inexistente' ? null : { ...tamano, activo: caso !== 'inactivo', sedeId: caso === 'ajeno' ? 'otra' : SEDE });
    await expect(service.crearProducto({ nombre: producto.nombre, categoriaId: 'c1', tamanoId: 't1', precio: 15 }, SEDE)).rejects.toThrow(caso === 'inactivo' ? 'inactivo' : 'no encontrado');
    expect(prisma.producto.create).not.toHaveBeenCalled();
  });

  it('editar permite conservar tamaño inactivo, pero no asignarlo a otro plato', async () => {
    prisma.tamanoPlato.findUnique.mockResolvedValue({ ...tamano, activo: false });
    await expect(service.actualizarProducto('p1', { tamanoId: 't1', precio: 20 }, SEDE)).resolves.toBeDefined();
    prisma.producto.findUnique.mockResolvedValue({ ...producto, tamanoId: null, tamano: null });
    await expect(service.actualizarProducto('p1', { tamanoId: 't1' }, SEDE)).rejects.toThrow('inactivo');
  });

  it('editar null quita tamaño y omitirlo lo conserva', async () => {
    await service.actualizarProducto('p1', { tamanoId: null }, SEDE);
    expect(prisma.producto.update.mock.calls[0][0].data).toEqual({ tamanoId: null });
    await service.actualizarProducto('p1', { precio: 17 }, SEDE);
    expect(prisma.producto.update.mock.calls[1][0].data).toEqual({ precio: 17 });
    expect(prisma.tamanoPlato.findUnique).not.toHaveBeenCalled();
  });

  it('edición y consulta de producto rechazan sede ajena', async () => {
    await expect(service.actualizarProducto('p1', { tamanoId: null }, 'otra')).rejects.toThrow('Producto no encontrado');
    await expect(service.obtenerProducto('p1', 'otra')).rejects.toThrow('Producto no encontrado');
    expect(prisma.producto.update).not.toHaveBeenCalled();
  });

  it('filtro SIN_TAMANO es null y orden respeta tamaño antes de nombre', async () => {
    await service.listarProductos({ tamanoId: 'SIN_TAMANO', ordenPorTamano: true }, SEDE);
    expect(prisma.producto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE, tamanoId: null }), orderBy: [{ categoria: { nombre: 'asc' } }, { tamano: { orden: 'asc' } }, { nombre: 'asc' }, { id: 'asc' }] }));
    await service.listarProductos({ tamanoId: 't1' }, SEDE);
    expect(prisma.producto.findMany.mock.calls[1][0].where.tamanoId).toBe('t1');
  });

  it('lote, pública y menú transportan tamaño; lote respeta sede fija', async () => {
    const lote = await service.obtenerProductosLote(['p1'], SEDE, 'otra');
    expect(lote.productos[0].tamano?.nombre).toBe('Personal');
    expect(prisma.producto.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['p1'] }, sedeId: SEDE });
    expect((await service.listarCartaPublica(SEDE)).productos[0].tamanoId).toBe('t1');
    prisma.menuDiario.findMany.mockResolvedValue([{ id: 'm1', productoId: 'p1', producto, fecha: new Date('2026-09-02'), disponible: true }]);
    expect((await service.listarMenuDelDia('2026-09-02', SEDE)).menu[0].producto?.tamano?.nombre).toBe('Personal');
    expect(prisma.menuDiario.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: { producto: { include: { categoria: true, tamano: true } } } }));
  });
});

describe('RBAC tamaños', () => {
  it.each(['crearTamanoPlato', 'actualizarTamanoPlato', 'eliminarTamanoPlato'] as const)('%s exige administración', (metodo) => {
    expect(Reflect.getMetadata(ROLES_KEY, AppController.prototype[metodo])).toEqual(['ADMIN', 'SISTEMA', 'GERENCIA']);
  });
  it('la lectura hereda roles de comanda/cocina', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AppController)).toEqual(expect.arrayContaining(['CAJERO', 'MESERO', 'COCINA']));
    expect(Reflect.getMetadata(ROLES_KEY, AppController.prototype.listarTamanosPlato)).toBeUndefined();
  });
});
