# Task 11: Production hardening

Depends on: 10. Roadmap milestone: 10.

## Goal
The app is safe to give to strangers: monitored, backed up, rate limited, with legal pages, and the webhook survives load.

## Tasks
1. Sentry on api, worker, web with release tagging from the git SHA. Pino logs include request_id (from a middleware generating one per request), workspace_id, user_id, job_id. Log Meta error bodies on every failed call.
2. Health: /v1/health (process alive) and /v1/ready (Postgres and Redis). Railway health check pointed at /v1/ready. External uptime monitor (Better Stack or UptimeRobot) pinging /v1/health every minute with email alert.
3. Rate limiting: @nestjs/throttler global 300 req/min per workspace, 10/min on auth, 60/min on message send per workspace. Return 429 with Retry-After.
4. Security: helmet defaults, CORS strict to WEB_ORIGIN, cookies secure in production, request body limit 1 MB except media upload route (16 MB), file type validation on uploads by magic bytes, signed R2 URLs only, Prisma queries never accept raw user input in $queryRaw.
5. Secrets audit: grep the repo for tokens, rotate the Meta app secret and system user token, confirm access_token_enc encryption key lives only in Railway.
6. Bull Board at /v1/admin/queues behind PlatformAdminGuard. Dead letter handling: failed jobs kept 7 days, a nightly job that emails you the failed count.
7. Backups: Railway Postgres daily backups enabled, plus a weekly pg_dump job in the worker uploading to R2 with 30-day retention. Do one restore drill into a scratch database and document it in docs/restore.md.
8. Migration safety: pre-deploy command runs prisma migrate deploy; CI fails if a migration would drop a column without an explicit allow comment.
9. Load test: a script (k6 or a Node script) posting 500 signed fake webhook payloads in 10 seconds to staging. Confirm 500 events processed, none failed, api p95 under 200 ms.
10. Legal pages in web: /privacy and /terms (write them with a generator and review, Meta requires both to exist). Add a data deletion instructions page (Meta app settings require a URL for it).
11. Email templates through Resend: invitation, password reset, account restricted, failed jobs digest.
12. Staging environment: same three services on Railway from the staging branch, separate Meta app in development mode, separate database.
13. docs/runbook.md: how to restart a service, how to replay a failed webhook event, how to rotate tokens, who to contact at Meta (business support).

## Acceptance
- Uptime monitor sends you an email within 2 minutes when you stop the api on staging.
- A thrown error in the worker shows in Sentry with workspace_id and job_id.
- Restore drill completed and documented.
- Load test numbers recorded in docs/load-test.md.
- Deploy to production happens by merging to main with zero manual steps.

## Ranjot reviews
- The restore drill. Do it yourself, not Claude.
- The webhook replay procedure. You will need it.
