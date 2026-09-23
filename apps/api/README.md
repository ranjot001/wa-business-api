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

Auth column:

- **none**: public, no token.
- **jwt**: `Authorization: Bearer <access token>`.
- **jwt + ws**: also `X-Workspace-Id: <uuid>`, and the caller must be a member
  of that workspace. The minimum role is named where it is above agent.

| Method | Path                       | Auth              | Description                                                                                       |
| ------ | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/v1/health`               | none              | Liveness. Always 200 while the process is up. Returns `{ status, uptime, timestamp }`.              |
| GET    | `/v1/ready`                | none              | Readiness. Pings Postgres and Redis. 200 with `{ postgres, redis }`, or 503 if either is `error`.   |
| POST   | `/v1/auth/register`        | none              | `{email, password, name}` -> 201 `{user, access_token}` and the refresh cookie.                     |
| POST   | `/v1/auth/login`           | none              | `{email, password}` -> `{user, access_token}` and the refresh cookie.                                |
| POST   | `/v1/auth/refresh`         | refresh cookie    | Rotates the refresh token and returns `{access_token}`. The old token is revoked.                   |
| POST   | `/v1/auth/logout`          | refresh cookie    | Revokes the refresh token and clears the cookie. 204.                                               |
| POST   | `/v1/auth/forgot-password` | none              | `{email}`. Always 204, whether or not the address is registered.                                    |
| POST   | `/v1/auth/reset-password`  | none              | `{token, password}`. 204. Revokes every other session.                                              |
| GET    | `/v1/me`                   | jwt               | `{user, workspaces: [{id, name, slug, role}]}`.                                                     |
| PATCH  | `/v1/me`                   | jwt               | `{name?, avatar_url?}` -> the updated user.                                                         |
| PATCH  | `/v1/me/password`          | jwt               | `{current_password, new_password}`. 204. Revokes every other session.                               |
| POST   | `/v1/workspaces`           | jwt               | `{name, timezone?}`. Creator becomes owner, trial ends in 14 days. 201.                             |
| GET    | `/v1/workspaces/current`   | jwt + ws          | The workspace named by `X-Workspace-Id`.                                                            |
| PATCH  | `/v1/workspaces/current`   | jwt + ws, admin   | `{name?, timezone?, business_hours?}`.                                                              |
| DELETE | `/v1/workspaces/current`   | jwt + ws, owner   | Soft delete: stamps `deleted_at`. 204. Audited.                                                     |
| GET    | `/v1/members`              | jwt + ws          | Cursor paginated `{data, next_cursor}` of members with their roles.                                 |
| PATCH  | `/v1/members/:userId`      | jwt + ws, admin   | `{role}`. Refuses to demote the last owner. Audited.                                                |
| DELETE | `/v1/members/:userId`      | jwt + ws, admin   | Removes the member. Refuses to remove the last owner. 204. Audited.                                 |
| GET    | `/v1/invitations`          | jwt + ws, admin   | Cursor paginated pending invitations.                                                               |
| POST   | `/v1/invitations`          | jwt + ws, admin   | `{email, role}`. Emails a link good for 7 days. Re-inviting replaces the open invite. 201.          |
| DELETE | `/v1/invitations/:id`      | jwt + ws, admin   | Revokes a pending invitation. 204.                                                                  |
| POST   | `/v1/invitations/accept`   | none              | `{token, name?, password?}`. Creates the account when the email is new, then signs the caller in.   |

Add every new endpoint to this table and to the Bruno collection in `/bruno`.

## Auth model

Access tokens last 15 minutes and are sent as a bearer header. The refresh
token lasts 30 days and lives in an httpOnly, sameSite=lax cookie scoped to
`/v1/auth`, so it is never readable by scripts and is only sent to the routes
that need it. Refreshing rotates: the presented token is revoked as its
replacement is issued, so a token works exactly once and a replayed cookie
gets nothing.

`POST /v1/auth/register`, `POST /v1/workspaces` and `GET /v1/me` take a token
but no `X-Workspace-Id`, because a user can exist before belonging anywhere.
Everything workspace scoped runs behind `WorkspaceGuard`, which loads the
membership and attaches `req.workspace`, `req.member` and `req.role`. Handlers
read the workspace id from `req.workspace`, never from the header.

Roles are ordered owner > admin > agent, and `@Roles('admin')` is a floor
rather than an exact match, so an owner passes every admin check.

The auth routes are rate limited to 10 requests a minute per IP.

## Password reset tokens

The reset token is a JWT signed with `JWT_SECRET` plus the user's current
password hash, not a row in a table. Completing the reset changes the hash,
which makes the same link stop verifying, so it is single use without a
`password_resets` table that the task 02 schema does not list.

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
