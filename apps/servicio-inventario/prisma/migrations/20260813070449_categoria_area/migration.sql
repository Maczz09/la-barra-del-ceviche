-- CreateEnum
CREATE TYPE "CategoriaArea" AS ENUM ('COCINA', 'BARRA', 'INVENTARIO');

-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "area" "CategoriaArea" NOT NULL DEFAULT 'COCINA';

-- CreateIndex
CREATE INDEX "categorias_area_idx" ON "categorias"("area");

-- Backfill: categorías cuyos productos ya tienen control de stock (Inventario)
-- pasan a área INVENTARIO. Todo lo demás queda en el default COCINA — no hay
-- forma de inferir BARRA desde datos existentes, el dueño la asigna a mano
-- cuando cree una categoría de tragos/licores.
UPDATE "categorias" c SET "area" = 'INVENTARIO'
WHERE EXISTS (
  SELECT 1 FROM "productos" p
  WHERE p."categoriaId" = c.id AND p."stockActual" IS NOT NULL
);
