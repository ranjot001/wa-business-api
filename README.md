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
| `pnpm build`       | build everything, one package at a time             |
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
- Each app's own `build` script also builds its workspace dependencies first,
  via `pnpm --filter "@crm/<app>^..." run build`. The `^...` prefix selects the
  dependencies without the app itself. That makes a plain
  `pnpm --filter @crm/api build` work on any host, including one that ignores
  this file and runs the bare command.
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
| `REFRESH_COOKIE_PATH` | no | `/`         | `/` (the web app proxies the api)             |
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

| Variable              | Required | Default                 | Production value                    |
| --------------------- | -------- | ----------------------- | ----------------------------------- |
| `API_URL`             | no       | `http://localhost:4000` | the public api URL, no `/v1` suffix |
| `NEXT_PUBLIC_API_URL` | no       | unset                   | leave unset                         |
| `PORT`                | no       | `3000`                  | injected by Railway, do not set it  |

There is no zod schema in web. `API_URL` is read on the server, at request
time, so changing it takes a restart and not a rebuild. Set that one.

`NEXT_PUBLIC_API_URL` is only a fallback and nothing uses it today. It is
inlined into the browser bundle at build time, which makes it the wrong place
for this value: a bundle built without it ships the localhost default and no
amount of restarting fixes it.

### How the browser reaches the api

It does not, directly. Every browser side fetch goes to the relative
`/api/v1/...` path on the web domain, and `apps/web/app/api/v1/[...path]/route.ts`
forwards it to `API_URL` server side.

That proxy is load bearing for two reasons:

- No api hostname is baked into the client bundle, so `API_URL` can change
  after a build.
- The refresh cookie stays same site. `crmweb-production-416a.up.railway.app`
  and `crmapi-production-60ad.up.railway.app` are separate sites, so a
  `SameSite=lax` cookie set on the api's own domain would never be sent back
  from the web app. Proxied, the cookie belongs to the web domain.

It is a route handler rather than a `rewrites()` entry because a rewrite
destination is resolved during `next build` and frozen into
`routes-manifest.json`: `next start` would keep proxying to whatever `API_URL`
was at build time, which is exactly the build time baking the proxy exists to
avoid.

Because of the proxy, `REFRESH_COOKIE_PATH` on the api must stay `/`. The
browser matches the path it sees, which is `/api/v1/auth/refresh`, so a cookie
scoped to the api's own `/v1/auth` would never be sent.

`SHADOW_DATABASE_URL` is only needed by `prisma migrate dev` and the CI drift
check. The api pre-deploy command runs `migrate deploy`, which does not use it.

`pnpm deploy` is a built-in pnpm command, so the migrate script is invoked as
`pnpm --filter @crm/db run deploy`. Dropping the `run` makes pnpm try to deploy
the package and fail with `ERR_PNPM_INVALID_DEPLOY_TARGET`.
