# @crm/api

NestJS HTTP API. Every route is served under the global `/v1` prefix.

## Run it

```bash
pnpm --filter @crm/api dev     # watch mode on PORT (default 4000)
pnpm --filter @crm/api build
pnpm --filter @crm/api test
```

Environment variables are listed in `.env.example` and validated by
`src/config/env.ts` at boot. A missing or malformed variable stops the process
before anything is wired, with the offending key named.

## Endpoints

| Method | Path         | Auth | Description                                                                                     |
| ------ | ------------ | ---- | ----------------------------------------------------------------------------------------------- |
| GET    | `/v1/health` | none | Liveness. Always 200 while the process is up. Returns `{ status, uptime, timestamp }`.            |
| GET    | `/v1/ready`  | none | Readiness. Pings Postgres and Redis. 200 with `{ postgres, redis }`, or 503 if either is `error`. |

Add every new endpoint to this table and to the Bruno collection in `/bruno`.

## Error shape

Every non 2xx response has the same body:

```json
{ "error": { "code": "NOT_FOUND", "message": "Contact not found", "details": null } }
```

`code` is SCREAMING_SNAKE. `details` is omitted unless there is something
structured to say, for example the list of failing fields on a validation
error. Throwing an `HttpException` with an object response sets the code
explicitly:

```ts
throw new BadRequestException({ code: 'WINDOW_CLOSED', message: 'The 24 hour window has closed' });
```

Anything thrown that is not an `HttpException` becomes a 500 `INTERNAL_ERROR`
with the real cause logged and not leaked to the client.
