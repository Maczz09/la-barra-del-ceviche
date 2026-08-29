// @ts-nocheck

import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriasInsumoService } from './categorias-insumo.service';
import { PrismaService } from '../prisma/prisma.service';

const SEDE = 'sede-001';

function categoria(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ci-001',
    sedeId: SEDE,
    nombre: 'Abarrotes',
    descripcion: null,
    activo: true,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    _count: { insumos: 0 },
    ...overrides,
  };
}

describe('CategoriasInsumoService', () => {
  let service: CategoriasInsumoService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      categoriaInsumo: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      insumo: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new CategoriasInsumoService(mockPrisma as unknown as PrismaService);
  });

  describe('listar', () => {
    it('devuelve las categorías de la sede con su conteo de insumos', async () => {
      mockPrisma.categoriaInsumo.findMany.mockResolvedValue([categoria({ _count: { insumos: 12 } })]);

      const res = await service.listar({}, SEDE);

      expect(res.data[0].nombre).toBe('Abarrotes');
      expect(res.data[0].insumosCount).toBe(12);
      expect(mockPrisma.categoriaInsumo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE }) }),
      );
    });

    it('filtra por búsqueda de nombre', async () => {
      mockPrisma.categoriaInsumo.findMany.mockResolvedValue([]);

      await service.listar({ search: 'carn' }, SEDE);

      expect(mockPrisma.categoriaInsumo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ nombre: { contains: 'carn', mode: 'insensitive' } }),
        }),
      );
    });
  });

  describe('crear', () => {
    it('crea la categoría recortando espacios', async () => {
      mockPrisma.categoriaInsumo.create.mockResolvedValue(categoria());

      await service.crear({ nombre: '  Abarrotes  ', descripcion: '  seco  ' }, SEDE);

      expect(mockPrisma.categoriaInsumo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sedeId: SEDE, nombre: 'Abarrotes', descripcion: 'seco' }),
        }),
      );
    });

    it('409 si el nombre ya existe en la sede', async () => {
      mockPrisma.categoriaInsumo.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.crear({ nombre: 'Abarrotes' }, SEDE)).rejects.toThrow(ConflictException);
    });
  });

  describe('actualizar', () => {
    it('renombra la categoría', async () => {
      mockPrisma.categoriaInsumo.findUnique.mockResolvedValue(categoria());
      mockPrisma.categoriaInsumo.update.mockResolvedValue(categoria({ nombre: 'Abarrotes secos' }));

      const res = await service.actualizar('ci-001', { nombre: 'Abarrotes secos' }, SEDE);

      expect(res.categoria.nombre).toBe('Abarrotes secos');
    });

    it('404 si la categoría es de otra sede', async () => {
      mockPrisma.categoriaInsumo.findUnique.mockResolvedValue(categoria({ sedeId: 'sede-999' }));

      await expect(service.actualizar('ci-001', { nombre: 'X' }, SEDE)).rejects.toThrow(NotFoundException);
    });
  });

  describe('eliminar', () => {
    it('borra la categoría y avisa cuántos insumos quedaron sin categoría', async () => {
      mockPrisma.categoriaInsumo.findUnique.mockResolvedValue(categoria());
      mockPrisma.insumo.count.mockResolvedValue(3);

      const res = await service.eliminar('ci-001', SEDE);

      // La FK es SetNull: los insumos NO se borran, quedan sueltos en el almacén.
      expect(mockPrisma.categoriaInsumo.delete).toHaveBeenCalledWith({ where: { id: 'ci-001' } });
      expect(res.insumosLiberados).toBe(3);
      expect(res.message).toContain('3 insumos');
    });

    it('sin insumos asociados el mensaje es el simple', async () => {
      mockPrisma.categoriaInsumo.findUnique.mockResolvedValue(categoria());
      mockPrisma.insumo.count.mockResolvedValue(0);

      const res = await service.eliminar('ci-001', SEDE);

      expect(res.insumosLiberados).toBe(0);
      expect(res.message).toBe('Categoría eliminada');
    });

    it('404 si no existe', async () => {
      mockPrisma.categoriaInsumo.findUnique.mockResolvedValue(null);

      await expect(service.eliminar('ci-404', SEDE)).rejects.toThrow(NotFoundException);
    });
  });
});
