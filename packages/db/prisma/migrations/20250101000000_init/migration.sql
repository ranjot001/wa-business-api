-- Baseline migration.
--
-- Creates nothing of product significance. It exists so the migration history
-- starts from a known point, so `prisma migrate deploy` has something to apply
-- on a fresh database, and so CI can diff against an empty shadow database.
-- Real tables arrive in task 02.

-- gen_random_uuid() lives in pgcrypto on Postgres 16 and every later migration
-- relies on it for uuid primary keys.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "schema_placeholder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_placeholder_pkey" PRIMARY KEY ("id")
);
