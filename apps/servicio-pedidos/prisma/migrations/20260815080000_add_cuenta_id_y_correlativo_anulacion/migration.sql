-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "cuentaId" TEXT;

-- AlterTable
ALTER TABLE "anulaciones_auditoria" ADD COLUMN "correlativo" TEXT;

-- CreateTable
CREATE TABLE "secuencias_anulacion" (
    "sedeId" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secuencias_anulacion_pkey" PRIMARY KEY ("sedeId")
);

-- CreateIndex
CREATE INDEX "pedidos_cuentaId_idx" ON "pedidos"("cuentaId");

-- CreateIndex
CREATE INDEX "anulaciones_auditoria_correlativo_idx" ON "anulaciones_auditoria"("correlativo");
