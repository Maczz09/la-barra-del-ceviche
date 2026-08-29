-- AlterTable
ALTER TABLE "movimientos_caja" ADD COLUMN "cuentaCorrelativo" TEXT;

-- CreateIndex
CREATE INDEX "movimientos_caja_cuentaCorrelativo_idx" ON "movimientos_caja"("cuentaCorrelativo");
