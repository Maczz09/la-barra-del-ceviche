-- CreateTable
CREATE TABLE "pagos_pendientes" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "montoRecibido" DECIMAL(10,2) NOT NULL,
    "metodo" TEXT NOT NULL,
    "descuento" DECIMAL(10,2),
    "propina" DECIMAL(10,2),
    "mesaNumero" TEXT,
    "mesaUnidaCon" TEXT,
    "referencia" TEXT,
    "notas" TEXT,
    "tipoComprobante" TEXT,
    "clienteDocumento" TEXT,
    "usuarioId" TEXT,
    "cajeroNombre" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "transaccionId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoAt" TIMESTAMP(3),

    CONSTRAINT "pagos_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_pendientes_sedeId_estado_idx" ON "pagos_pendientes"("sedeId", "estado");
