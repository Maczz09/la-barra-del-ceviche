-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN     "tipoComprobante" TEXT NOT NULL DEFAULT 'BOLETA',
ADD COLUMN     "clienteDocumento" TEXT;
