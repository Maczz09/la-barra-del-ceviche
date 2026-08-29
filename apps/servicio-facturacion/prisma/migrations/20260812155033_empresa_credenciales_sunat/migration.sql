-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "certificadoPassCifrada" TEXT,
ADD COLUMN     "certificadoPfxCifrado" BYTEA,
ADD COLUMN     "solClaveCifrada" TEXT,
ADD COLUMN     "solUsuario" TEXT;
