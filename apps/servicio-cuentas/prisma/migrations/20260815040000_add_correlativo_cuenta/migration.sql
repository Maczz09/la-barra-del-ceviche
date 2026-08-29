-- CreateTable
CREATE TABLE "secuencias_cuenta" (
    "sedeId" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secuencias_cuenta_pkey" PRIMARY KEY ("sedeId")
);

-- AlterTable
ALTER TABLE "cuentas" ADD COLUMN "correlativo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_sedeId_correlativo_key" ON "cuentas"("sedeId", "correlativo");
