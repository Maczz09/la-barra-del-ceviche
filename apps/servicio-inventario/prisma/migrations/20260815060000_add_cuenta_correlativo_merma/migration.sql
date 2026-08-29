-- AlterTable
ALTER TABLE "mermas" ADD COLUMN "cuentaCorrelativo" TEXT;

-- CreateIndex
CREATE INDEX "mermas_cuentaCorrelativo_idx" ON "mermas"("cuentaCorrelativo");
