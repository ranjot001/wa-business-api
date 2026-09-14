# Project context (copy this file to the repo root as CLAUDE.md)

## What this is
A multi-tenant WhatsApp Business CRM (shared team inbox, contacts, templates, broadcasts, keyword automations) built on the Meta WhatsApp Cloud API. Product name: TBD. Owner: Ranjot. This file is read by Claude Code on every session. Keep it accurate.

## Stack (fixed, do not substitute)
- Runtime: Node 22, TypeScript 5 strict mode, pnpm workspaces
- API: NestJS 10 (apps/api), REST under /v1, class-validator DTOs, Passport JWT
- Worker: standalone Node process using BullMQ (apps/worker), shares packages/db
- Web: Next.js 15 App Router (apps/web), Tailwind, shadcn/ui, TanStack Query v5, Zustand, react-hook-form + zod
- Database: Postgres 16 via Prisma 5 (packages/db). One schema, one migration history
- Queue and cache: Redis 7, BullMQ 5
- Realtime: Socket.io 4 with @socket.io/redis-adapter
- Storage: Cloudflare R2 through @aws-sdk/client-s3
- Email: Resend
- Logging: Pino. Errors: Sentry
- Testing: Vitest for unit, Supertest for API, Playwright later
- Hosting: Railway (api, worker, web as separate services), Railway Postgres and Redis

## Repo layout
```
apps/api        NestJS
apps/worker     BullMQ processors
apps/web        Next.js
packages/db     Prisma schema, client, migrations, seed
packages/shared types shared by all apps (DTOs, event names, enums), zod schemas
packages/config eslint, tsconfig, prettier presets
docker-compose.yml   postgres + redis for local
```

## Conventions
- Every business table has workspace_id. Every query filters by it. Use the WorkspaceScopedRepository base class in apps/api/src/common.
- IDs are uuid. Timestamps are timestamptz. Column names snake_case in Postgres, camelCase in TypeScript via Prisma @map.
- All list endpoints are cursor paginated: { data, next_cursor }.
- Errors return { error: { code, message, details } }. Codes are SCREAMING_SNAKE (WINDOW_CLOSED, LIMIT_REACHED, NOT_FOUND).
- Webhooks return 200 fast and enqueue. No Meta API calls inside a webhook request handler.
- Every outbound Meta call goes through apps/api/src/whatsapp/meta.client.ts or the worker equivalent. Never call fetch to graph.facebook.com anywhere else.
- Secrets only in .env (gitignored) and Railway variables. Access tokens encrypted with AES-256-GCM before storage (packages/shared/crypto.ts).
- Socket event names live in packages/shared/events.ts and nowhere else.
- No em dashes in any user-facing copy.

## Commands
- pnpm dev            runs api, worker, web concurrently
- pnpm db:migrate     prisma migrate dev
- pnpm db:studio
- pnpm test
- pnpm lint && pnpm typecheck

## Working rules for Claude Code
- Read the task file I give you fully before writing code. Do only what that task says. Do not add features from later tasks.
- Before finishing, run pnpm lint, pnpm typecheck, and pnpm test. Fix what fails.
- When you create a new endpoint, add it to apps/api/README.md endpoint table and to the Bruno collection in /bruno.
- Explain any decision that deviates from the task file, and ask before installing a new dependency not listed in the stack.
- Prefer small commits with a one-line message per task step.

## Reference docs to consult
- Meta Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
- Webhook payloads: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
- Templates: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- NestJS: https://docs.nestjs.com
- Prisma: https://www.prisma.io/docs
- BullMQ: https://docs.bullmq.io
