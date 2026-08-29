-- CreateEnum
CREATE TYPE "TipoAnulacion" AS ENUM ('ITEM', 'MESA');

-- CreateEnum
CREATE TYPE "EstadoPlatoAnulacion" AS ENUM ('SIN_PREPARAR', 'PREPARADO');

-- CreateTable
CREATE TABLE "anulaciones_auditoria" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mesaId" TEXT NOT NULL,
    "mesaNumero" INTEGER,
    "pedidoId" TEXT NOT NULL,
    "itemId" TEXT,
    "tipo" "TipoAnulacion" NOT NULL,
    "productoId" TEXT,
    "productoNombre" TEXT,
    "cantidad" INTEGER,
    "estadoPlato" "EstadoPlatoAnulacion" NOT NULL,
    "cobrado" BOOLEAN NOT NULL,
    "montoAnulado" DECIMAL(10,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "observacion" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "clienteNombre" TEXT,
    "invalidada" BOOLEAN NOT NULL DEFAULT false,
    "invalidadaMotivo" TEXT,
    "invalidadaPorNombre" TEXT,
    "invalidadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anulaciones_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anulaciones_auditoria_sedeId_idx" ON "anulaciones_auditoria"("sedeId");

-- CreateIndex
CREATE INDEX "anulaciones_auditoria_pedidoId_idx" ON "anulaciones_auditoria"("pedidoId");

-- CreateIndex
CREATE INDEX "anulaciones_auditoria_fecha_idx" ON "anulaciones_auditoria"("fecha");

-- CreateIndex
CREATE INDEX "anulaciones_auditoria_tipo_idx" ON "anulaciones_auditoria"("tipo");
