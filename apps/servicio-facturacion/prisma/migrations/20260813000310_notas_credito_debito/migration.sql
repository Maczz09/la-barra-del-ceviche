-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoComprobante" ADD VALUE 'NOTA_CREDITO';
ALTER TYPE "TipoComprobante" ADD VALUE 'NOTA_DEBITO';

-- DropForeignKey
ALTER TABLE "comprobantes" DROP CONSTRAINT "comprobantes_comprobantePagoId_fkey";

-- AlterTable
ALTER TABLE "comprobantes" ADD COLUMN     "comprobanteAfectadoId" TEXT,
ADD COLUMN     "motivoCodigo" TEXT,
ADD COLUMN     "motivoDescripcion" TEXT,
ALTER COLUMN "comprobantePagoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "correlativoNotaCreditoBoleta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "correlativoNotaCreditoFactura" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "correlativoNotaDebitoBoleta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "correlativoNotaDebitoFactura" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serieNotaCreditoBoleta" TEXT NOT NULL DEFAULT 'BC01',
ADD COLUMN     "serieNotaCreditoFactura" TEXT NOT NULL DEFAULT 'FC01',
ADD COLUMN     "serieNotaDebitoBoleta" TEXT NOT NULL DEFAULT 'BD01',
ADD COLUMN     "serieNotaDebitoFactura" TEXT NOT NULL DEFAULT 'FD01';

-- CreateIndex
CREATE INDEX "comprobantes_comprobanteAfectadoId_idx" ON "comprobantes"("comprobanteAfectadoId");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_comprobanteAfectadoId_fkey" FOREIGN KEY ("comprobanteAfectadoId") REFERENCES "comprobantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_comprobantePagoId_fkey" FOREIGN KEY ("comprobantePagoId") REFERENCES "comprobantes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;
