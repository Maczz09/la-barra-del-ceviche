-- CreateEnum
CREATE TYPE "MermaOrigen" AS ENUM ('DESCARTE_MANUAL_INVENTARIO', 'ANULACION_COMANDA_NO_COBRADA', 'ANULACION_COMANDA_COBRADA');

-- AlterTable
ALTER TABLE "mermas" ADD COLUMN     "costoUnitario" DECIMAL(10,2),
ADD COLUMN     "observacion" TEXT,
ADD COLUMN     "origen" "MermaOrigen" NOT NULL DEFAULT 'DESCARTE_MANUAL_INVENTARIO',
ADD COLUMN     "pedidoItemId" TEXT;

-- CreateIndex
CREATE INDEX "mermas_origen_idx" ON "mermas"("origen");
