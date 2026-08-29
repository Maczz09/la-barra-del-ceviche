-- CreateTable
CREATE TABLE "secuencias_reserva" (
    "sedeId" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secuencias_reserva_pkey" PRIMARY KEY ("sedeId")
);

-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN "correlativo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Reserva_sedeId_correlativo_key" ON "Reserva"("sedeId", "correlativo");
