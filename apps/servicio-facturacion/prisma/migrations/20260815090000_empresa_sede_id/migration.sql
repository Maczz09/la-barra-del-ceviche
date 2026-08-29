-- AlterTable
ALTER TABLE "empresas" ADD COLUMN "sedeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "empresas_sedeId_key" ON "empresas"("sedeId");
