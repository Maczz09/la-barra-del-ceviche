-- Tamaños por sede. No se reescriben precios, identidades ni históricos.
CREATE TABLE "tamanos_plato" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tamanos_plato_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tamanos_plato_orden_check" CHECK ("orden" BETWEEN 0 AND 10000),
    CONSTRAINT "tamanos_plato_nombre_check" CHECK (length(btrim("nombre")) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX "tamanos_plato_sedeId_nombre_key" ON "tamanos_plato"("sedeId", "nombre");
CREATE UNIQUE INDEX "tamanos_plato_sedeId_nombre_ci_key" ON "tamanos_plato"("sedeId", lower(btrim("nombre")));
CREATE INDEX "tamanos_plato_sedeId_orden_idx" ON "tamanos_plato"("sedeId", "orden");
ALTER TABLE "productos" ADD COLUMN "tamanoId" TEXT;
CREATE INDEX "productos_tamanoId_idx" ON "productos"("tamanoId");
ALTER TABLE "productos" ADD CONSTRAINT "productos_tamanoId_fkey"
  FOREIGN KEY ("tamanoId") REFERENCES "tamanos_plato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "tamanos_plato" ("id", "sedeId", "nombre", "orden", "updatedAt")
SELECT md5('tamano-plato:' || s."sedeId" || ':' || t.nombre)::uuid::text,
       s."sedeId", t.nombre, t.orden, CURRENT_TIMESTAMP
FROM (SELECT "sedeId" FROM "categorias" UNION SELECT "sedeId" FROM "productos") s
CROSS JOIN (VALUES ('Personal', 10), ('Mediano', 20), ('Grande', 30), ('Familiar', 40)) AS t(nombre, orden);

-- Solo sufijos completos separados por · o entre paréntesis. Nombres como
-- "Arroz familiar especial" quedan intactos; Mediana se normaliza a Mediano.
WITH reconocidos AS (
  SELECT p."id", p."sedeId",
    regexp_replace(p."nombre", '\s*(·\s*(Personal|Mediana|Mediano|Grande|Familiar)|\((Personal|Mediana|Mediano|Grande|Familiar)\))\s*$', '', 'i') AS base,
    lower(substring(p."nombre" FROM '(?i)(Personal|Mediana|Mediano|Grande|Familiar)\)?\s*$')) AS etiqueta
  FROM "productos" p
  WHERE p."nombre" ~* '(·\s*(Personal|Mediana|Mediano|Grande|Familiar)|\((Personal|Mediana|Mediano|Grande|Familiar)\))\s*$'
), actualizados AS (
  UPDATE "productos" p
  SET "tamanoId" = t."id", "nombre" = btrim(r.base), "updatedAt" = CURRENT_TIMESTAMP
  FROM reconocidos r, "tamanos_plato" t
  WHERE p."id" = r."id" AND t."sedeId" = r."sedeId" AND length(btrim(r.base)) > 0
    AND lower(t."nombre") = CASE WHEN r.etiqueta = 'mediana' THEN 'mediano' ELSE r.etiqueta END
  RETURNING p.*
)
-- Refresca la proyección de productos, no los snapshots de pedidos anteriores.
INSERT INTO "outbox_events" ("id", "routingKey", "payload", "status", "attempts", "createdAt", "updatedAt")
SELECT md5('migracion-tamanos:' || p."id")::uuid::text, 'producto.actualizado',
  json_build_object('id', p."id", 'sedeId', p."sedeId", 'nombre', p."nombre" || ' · ' || t."nombre",
    'precio', p."precio", 'stockActual', p."stockActual", 'categoriaNombre', c."nombre",
    'categoriaArea', c."area", 'disponible', p."disponible")::text,
  'PENDING', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM actualizados p JOIN "tamanos_plato" t ON t."id" = p."tamanoId"
JOIN "categorias" c ON c."id" = p."categoriaId";
