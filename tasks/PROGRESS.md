# Progress

- 2026-09-22 Task 01 done. Prod live on Railway (api: https://crmapi-production-60ad.up.railway.app, web: https://crmweb-production-416a.up.railway.app). Gotchas: pnpm deploy is a built-in so use pnpm --filter @crm/db run deploy; NEXT_PUBLIC_ vars are baked in at build so the server reads API_URL at request time; each app's build script builds its own workspace deps with ^... so Railway's bare build command works.
