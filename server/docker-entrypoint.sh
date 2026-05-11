#!/bin/sh
set -e

echo "[entrypoint] waiting for postgres: ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}"
until nc -z "${POSTGRES_HOST:-postgres}" "${POSTGRES_PORT:-5432}" 2>/dev/null; do
  sleep 1
done
echo "[entrypoint] postgres up"

echo "[entrypoint] running prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] running seed (idempotent)..."
npx ts-node prisma/seed.ts || echo "[entrypoint] seed failed (ignored)"

echo "[entrypoint] starting NestJS..."
exec node dist/main.js
