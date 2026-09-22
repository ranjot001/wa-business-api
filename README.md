# WhatsApp CRM

Multi tenant WhatsApp Business CRM on the Meta WhatsApp Cloud API. See
`CLAUDE.md` for the stack and conventions, and `/tasks` for the build order.

## Layout

```
apps/api        NestJS, REST under /v1
apps/worker     BullMQ processors
apps/web        Next.js 15 App Router
packages/db     Prisma schema, client singleton, migrations, seed
packages/shared types, event names, error codes shared by all apps
packages/config tsconfig, eslint and prettier presets
```

## First run

Requires Node 22 (see `.nvmrc`), pnpm, and a running Docker daemon.

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local

pnpm up          # postgres 16 and redis 7 in docker
pnpm db:migrate  # apply migrations
pnpm dev         # api, worker and web together
```

- api: http://localhost:4000/v1/health
- web: http://localhost:3000
- worker: logs to stdout, enqueues one `system:ping` job on boot

If something else on your machine already listens on 5432 or 6379, set
`POSTGRES_PORT` or `REDIS_PORT` in the root `.env` and match the port in the
`DATABASE_URL` / `REDIS_URL` of each app's env file.

## Scripts

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `pnpm up` / `down` | start / stop the docker services                    |
| `pnpm reset`       | drop the volumes, recreate, migrate                 |
| `pnpm dev`         | build the workspace packages, then run all three apps |
| `pnpm build`       | build everything                                    |
| `pnpm lint`        | eslint across the workspace                         |
| `pnpm typecheck`   | tsc --noEmit in every package                       |
| `pnpm test`        | vitest in every package                             |
| `pnpm db:migrate`  | prisma migrate dev                                  |
| `pnpm db:deploy`   | prisma migrate deploy (what production runs)        |
| `pnpm db:studio`   | prisma studio                                       |
| `pnpm db:seed`     | run the seed script                                 |

`pnpm dev` builds `@crm/shared` and `@crm/db` first because the apps import
their compiled output.

## Deploy (Railway)

Three services, one repo. Each service reads its own config file, committed at
`apps/<app>/railway.json`.

### Dashboard settings per service

| Setting                 | api                    | worker                    | web                    |
| ----------------------- | ---------------------- | ------------------------- | ---------------------- |
| Root Directory          | `/`                    | `/`                       | `/`                    |
| Config-as-code path     | `apps/api/railway.json`| `apps/worker/railway.json`| `apps/web/railway.json`|
| Public networking       | on                     | off                       | on                     |

Root Directory stays `/` on all three. Setting it to `apps/api` cuts
`packages/` and `pnpm-lock.yaml` out of the build context, and the pnpm
workspace install fails before any of this config is read.

Everything else (build command, start command, pre-deploy, healthcheck, watch
paths) comes from the JSON files. Clear the matching dashboard fields so they
do not override the committed values.

### What each config does

- Build is `pnpm --filter @crm/<app>... run build`. The `...` suffix selects the
  app and its workspace dependencies, so `@crm/shared` and `@crm/db` (including
  `prisma generate`) build first, in order.
- The builder is Railpack, which resolved Node 22 and pnpm 10.18.0 correctly
  from `.nvmrc` and the `packageManager` field. It runs its own
  `pnpm install --frozen-lockfile` before the build command, so the build
  command does not repeat it.
- Watch paths include `/packages/**`, so a change to the shared types or the
  Prisma schema redeploys all three services.
- api runs `prisma migrate deploy` as its pre-deploy command. The `prisma` CLI
  is a runtime dependency of `@crm/db` so it survives dev dependency pruning.
- api and worker start with `node apps/<app>/dist/main.js` rather than through
  pnpm, so Railway's SIGTERM reaches the process directly. The worker's
  graceful shutdown depends on it. web starts through pnpm because `next start`
  needs `apps/web` as its working directory.
- The worker declares no healthcheck path. It serves no HTTP, so a healthcheck
  would fail every deploy.

### Environment variables

Required means the process refuses to boot without it. api and worker validate
with zod at boot (`apps/api/src/config/env.ts`, `apps/worker/src/env.ts`) and
name the offending key on failure.

api:

| Variable       | Required | Default       | Production value                              |
| -------------- | -------- | ------------- | --------------------------------------------- |
| `DATABASE_URL` | yes      | none          | `${{Postgres.DATABASE_URL}}`                  |
| `REDIS_URL`    | yes      | none          | `${{Redis.REDIS_URL}}`                        |
| `NODE_ENV`     | no       | `development` | `production`                                  |
| `WEB_ORIGIN`   | no       | `http://localhost:3000` | the public web URL, comma separated |
| `LOG_LEVEL`    | no       | `info`        | `info`                                        |
| `PORT`         | no       | `4000`        | injected by Railway, do not set it            |

`DATABASE_URL` and `REDIS_URL` must parse as URLs. `WEB_ORIGIN` defaults to
localhost, so leaving it unset makes every browser request from the deployed
web app fail CORS.

worker:

| Variable             | Required | Default       | Production value             |
| -------------------- | -------- | ------------- | ---------------------------- |
| `DATABASE_URL`       | yes      | none          | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL`          | yes      | none          | `${{Redis.REDIS_URL}}`       |
| `NODE_ENV`           | no       | `development` | `production`                 |
| `LOG_LEVEL`          | no       | `info`        | `info`                       |
| `WORKER_CONCURRENCY` | no       | `5`           | `5`                          |

The worker has no `PORT`.

web:

| Variable              | Required | Default                 | Production value                   |
| --------------------- | -------- | ----------------------- | ---------------------------------- |
| `NEXT_PUBLIC_API_URL` | no       | `http://localhost:4000` | the public api URL, no `/v1` suffix |
| `PORT`                | no       | `3000`                  | injected by Railway, do not set it  |

There is no zod schema in web. `NEXT_PUBLIC_API_URL` is inlined into the bundle
at build time, so changing it requires a rebuild, not just a restart, and the
localhost default ships silently if it is missing.

`SHADOW_DATABASE_URL` is only needed by `prisma migrate dev` and the CI drift
check. The api pre-deploy command runs `migrate deploy`, which does not use it.

`pnpm deploy` is a built-in pnpm command, so the migrate script is invoked as
`pnpm --filter @crm/db run deploy`. Dropping the `run` makes pnpm try to deploy
the package and fail with `ERR_PNPM_INVALID_DEPLOY_TARGET`.
