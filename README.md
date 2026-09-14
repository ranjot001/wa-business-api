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
