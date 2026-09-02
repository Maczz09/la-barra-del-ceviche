-- La sede puede elegir entre los dos RUC configurados al emitir.
DROP INDEX IF EXISTS "empresas_sedeId_key";

CREATE INDEX IF NOT EXISTS "empresas_sedeId_idx" ON "empresas"("sedeId");
