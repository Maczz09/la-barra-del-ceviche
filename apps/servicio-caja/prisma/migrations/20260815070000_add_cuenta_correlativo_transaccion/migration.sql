-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN "cuentaCorrelativo" TEXT;

-- CreateIndex
CREATE INDEX "transacciones_cuentaCorrelativo_idx" ON "transacciones"("cuentaCorrelativo");
