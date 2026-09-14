# Task 01: Repo setup, local infra, first deploy

Depends on: nothing. Roadmap milestone: 2 (part).

## Goal
A pnpm monorepo with three runnable apps, Postgres and Redis in Docker, Prisma wired, and the empty API deployed to a public Railway URL responding at /v1/health.

## Tasks
1. Init pnpm workspace with apps/api, apps/worker, apps/web, packages/db, packages/shared, packages/config. Node 22 pinned in .nvmrc and package.json engines.
2. docker-compose.yml with postgres:16 (port 5432, volume) and redis:7 (port 6379). Add a Makefile or root scripts: up, down, reset.
3. packages/config: shared tsconfig.base.json (strict, noUncheckedIndexedAccess), eslint flat config, prettier.
4. packages/db: Prisma init, datasource from DATABASE_URL, a single empty migration, exported PrismaClient singleton, seed script placeholder.
5. apps/api: NestJS with ConfigModule (zod-validated env), Pino logger via nestjs-pino, global exception filter producing { error: { code, message, details } }, global ValidationPipe (whitelist, transform), Helmet, CORS from WEB_ORIGIN env. Routes: GET /v1/health (200 ok), GET /v1/ready (checks Prisma $queryRaw select 1 and Redis ping).
6. apps/worker: entry that connects to Redis, registers one no-op queue "system" with a "ping" job, logs on process. Graceful shutdown on SIGTERM.
7. apps/web: Next.js 15 App Router, Tailwind, shadcn/ui init, one page at / that fetches /v1/health from NEXT_PUBLIC_API_URL and displays the status.
8. Root scripts: dev (concurrently), build, lint, typecheck, test, db:migrate, db:studio.
9. .env.example for every app with every variable and a comment.
10. GitHub Actions: on PR run install, lint, typecheck, test, prisma migrate diff against an empty shadow db.
11. Railway: three services from the same repo with root directory and start command per app, plus Railway Postgres and Redis. Set variables. Migrations run in the api service pre-deploy command.
12. Bruno collection at /bruno with the health request and an environment file for local and production.

## Files expected
- pnpm-workspace.yaml, package.json, .nvmrc, docker-compose.yml, .github/workflows/ci.yml
- packages/db/prisma/schema.prisma, packages/db/src/index.ts
- apps/api/src/main.ts, app.module.ts, common/filters/http-exception.filter.ts, config/env.ts, health/health.controller.ts
- apps/worker/src/main.ts
- apps/web/app/page.tsx
- railway.json or per-service config

## Acceptance
- `pnpm up && pnpm dev` from a fresh clone brings all three apps up in under 3 minutes
- GET http://localhost:4000/v1/ready returns { postgres: "ok", redis: "ok" }
- https://api.<yourdomain>/v1/health returns 200 from Railway
- CI is green on a trivial PR

## Ranjot reviews
- env.ts: understand how zod validation fails fast on a missing variable
- The exception filter: this is the shape every error will have forever
