// @ts-nocheck

import { InsumosService } from './insumos.service';
import { PrismaService } from '../prisma/prisma.service';

function dec(n: number) {
  return {
    toNumber: () => n,
    lte: (other: { toNumber: () => number } | number) => n <= (typeof other === 'number' ? other : other.toNumber()),
    gte: (other: { toNumber: () => number } | number) => n >= (typeof other === 'number' ? other : other.toNumber()),
  };
}

function createMockPrismaService(overrides: Record<string, unknown> = {}) {
  return { ...overrides } as unknown as PrismaService;
}

const SEDE = 'sede-001';
const OTRA_SEDE = 'sede-002';

describe('InsumosService', () => {
  let service: InsumosService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  function insumo(overrides: Record<string, unknown> = {}) {
    return {
      id: 'i-001',
      sedeId: SEDE,
      nombre: 'Pescado (lenguado)',
      unidad: 'kg',
      stockActual: dec(8),
      stockMinimo: dec(10),
      costoUnitario: dec(28),
      proveedorId: null,
      proveedor: null,
      productoId: null,
      factorConversion: dec(1),
      activo: true,
      createdAt: new Date('2026-06-01'),
      updatedAt: new Date('2026-06-01'),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockPrisma = createMockPrismaService({
      insumo: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      proveedor: { findUnique: jest.fn() },
      movimientoInsumo: { count: jest.fn().mockResolvedValue(0) },
      categoriaInsumo: { findUnique: jest.fn() },
      ordenCompraItem: { count: jest.fn() },
    });
    service = new InsumosService(mockPrisma);
  });

  describe('listar', () => {
    it('lista insumos activos de la sede', async () => {
      mockPrisma.insumo.findMany.mockResolvedValue([insumo()]);
      const result = await service.listar({}, SEDE);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].stockActual).toBe(8);
    });

    it('filtra por bajoMinimo comparando stockActual vs stockMinimo', async () => {
      mockPrisma.insumo.findMany.mockResolvedValue([
        insumo({ id: 'i-bajo', stockActual: dec(1), stockMinimo: dec(3) }),
        insumo({ id: 'i-ok', stockActual: dec(40), stockMinimo: dec(20) }),
      ]);
      const result = await service.listar({ bajoMinimo: true }, SEDE);
      expect(result.data.map((i) => i.id)).toEqual(['i-bajo']);
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.listar({}, null)).rejects.toThrow('Indica la sede');
    });
  });

  describe('crear', () => {
    it('crea un insumo con valores por defecto', async () => {
      mockPrisma.insumo.create.mockResolvedValue(insumo());
      const result = await service.crear({ nombre: 'Pescado (lenguado)', unidad: 'kg' }, SEDE);
      expect(result.message).toBe('Insumo creado');
      expect(mockPrisma.insumo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sedeId: SEDE, stockActual: 0, stockMinimo: 0, factorConversion: 1 }),
        }),
      );
    });

    it('valida que el proveedor exista en la misma sede', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue({ id: 'pr-1', sedeId: OTRA_SEDE });
      await expect(
        service.crear({ nombre: 'X', unidad: 'kg', proveedorId: 'pr-1' }, SEDE),
      ).rejects.toThrow('no encontrado');
    });

    it('traduce P2002 (nombre duplicado en la sede) a ConflictException', async () => {
      mockPrisma.insumo.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.crear({ nombre: 'Pescado (lenguado)', unidad: 'kg' }, SEDE)).rejects.toThrow(
        'Ya existe un insumo',
      );
    });
  });

  describe('eliminar', () => {
    it('borra un insumo que no aparece en ninguna orden', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo());
      mockPrisma.ordenCompraItem.count.mockResolvedValue(0);
      const result = await service.eliminar('i-001', SEDE);
      expect(mockPrisma.insumo.delete).toHaveBeenCalledWith({ where: { id: 'i-001' } });
      expect(result.message).toBe('Insumo eliminado');
    });

    it('desactiva (soft-delete) un insumo referenciado en órdenes en vez de borrarlo', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo());
      mockPrisma.ordenCompraItem.count.mockResolvedValue(3);
      mockPrisma.insumo.update.mockResolvedValue(insumo({ activo: false }));
      const result = await service.eliminar('i-001', SEDE);
      expect(mockPrisma.insumo.delete).not.toHaveBeenCalled();
      expect(result.insumo.activo).toBe(false);
    });

    it('un usuario pineado no puede eliminar un insumo de otra sede', async () => {
      mockPrisma.insumo.findUnique.mockResolvedValue(insumo());
      await expect(service.eliminar('i-001', OTRA_SEDE)).rejects.toThrow('no encontrado');
    });
  });
});
