-- AlterEnum: ingreso manual (compra del dia en el mercado, sin orden de compra).
ALTER TYPE "MovimientoInsumoTipo" ADD VALUE 'ENTRADA_MANUAL' AFTER 'ENTRADA_COMPRA';

-- CreateTable: taxonomia PROPIA del almacen de cocina, separada de las
-- categorias de venta que viven en servicio-inventario.
CREATE TABLE "categorias_insumo" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_insumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_insumo_sedeId_nombre_key" ON "categorias_insumo"("sedeId", "nombre");

-- CreateIndex
CREATE INDEX "categorias_insumo_sedeId_activo_idx" ON "categorias_insumo"("sedeId", "activo");

-- AlterTable
ALTER TABLE "insumos" ADD COLUMN "categoriaId" TEXT;

-- CreateIndex
CREATE INDEX "insumos_categoriaId_idx" ON "insumos"("categoriaId");

-- AddForeignKey
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
