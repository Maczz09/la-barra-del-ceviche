-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "cuentaCorrelativo" TEXT;

-- CreateIndex
CREATE INDEX "pedidos_cuentaCorrelativo_idx" ON "pedidos"("cuentaCorrelativo");

-- AlterTable
ALTER TABLE "anulaciones_auditoria" ADD COLUMN "cuentaCorrelativo" TEXT;
