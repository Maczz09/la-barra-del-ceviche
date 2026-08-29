#!/usr/bin/env bash
#
# Guard de drift de migraciones (plan 1.2).
#
# Para cada servicio con Prisma, comprueba que `schema.prisma` coincide con lo
# que producen sus migraciones. Si alguien edita un schema sin generar la
# migración correspondiente, este script falla (exit 1) y rompe el build —
# justo el problema que provocó el drift histórico.
#
# Prisma 7 replica las migraciones en una "shadow database" temporal que crea
# en el servidor apuntado por DATABASE_URL. Usa un Postgres vacío y descartable:
# en CI lo provee un service container; en local, exporta SHADOW_DATABASE_URL.
# NUNCA apuntes a una BD real: Prisma crea y borra una BD shadow en ese servidor.
#
set -uo pipefail

SHADOW_URL="${SHADOW_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/drift_shadow}"

services=(
  servicio-reservas
  servicio-pedidos
  servicio-identidad
  servicio-cuentas
  servicio-caja
  servicio-mesas
  servicio-inventario
  servicio-reportes
  servicio-notificaciones
  servicio-compras
  servicio-facturacion
)

drift_found=0

for svc in "${services[@]}"; do
  dir="apps/$svc"
  schema="$dir/prisma/schema.prisma"
  migrations="$dir/prisma/migrations"

  if [[ ! -f "$schema" ]]; then
    echo "↷ $svc: sin schema.prisma, omitido"
    continue
  fi
  if [[ ! -d "$migrations" ]]; then
    echo "✗ $svc: tiene schema pero no carpeta de migraciones"
    drift_found=1
    continue
  fi

  echo "▶ Comprobando drift en $svc…"
  # Se ejecuta desde el directorio del servicio para que Prisma descubra su
  # prisma.config.ts; DATABASE_URL (la shadow) gana sobre el .env porque dotenv
  # no pisa variables ya definidas.
  # DATABASE_URL es un placeholder no conectado (migrate diff --from-migrations
  # solo toca la shadow DB); debe diferir de la shadow para que Prisma no se
  # queje de que coinciden.
  (
    cd "$dir" && \
    DATABASE_URL="postgresql://placeholder:placeholder@127.0.0.1:1/placeholder" \
    SHADOW_DATABASE_URL="$SHADOW_URL" npx prisma migrate diff \
      --from-migrations prisma/migrations \
      --to-schema prisma/schema.prisma \
      --exit-code
  )
  code=$?

  if [[ $code -eq 0 ]]; then
    echo "✓ $svc: schema y migraciones en sync"
  elif [[ $code -eq 2 ]]; then
    echo "✗ $svc: DRIFT — schema.prisma no coincide con las migraciones."
    echo "         Genera la migración que falta (prisma migrate dev) y commitéala."
    drift_found=1
  else
    echo "✗ $svc: error ejecutando 'prisma migrate diff' (exit $code)"
    drift_found=1
  fi
done

echo ""
if [[ $drift_found -ne 0 ]]; then
  echo "❌ Drift de migraciones detectado. El build se detiene."
  exit 1
fi
echo "✅ Sin drift: todos los schemas coinciden con sus migraciones."
