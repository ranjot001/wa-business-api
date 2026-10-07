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
| GET    | `/v1/webhooks/whatsapp`    | verify token      | Meta's subscription handshake. Echoes `hub.challenge` when `hub.verify_token` matches.              |
| POST   | `/v1/webhooks/whatsapp`    | HMAC signature    | Delivery endpoint. Verifies `X-Hub-Signature-256`, stores the envelope, enqueues, returns 200 fast. |
| POST   | `/v1/whatsapp/accounts/manual` | jwt + ws, owner | `{waba_id, phone_number_id, display_phone, access_token, verified_name?}`. Token stored encrypted.  |
| GET    | `/v1/whatsapp/account`     | jwt + ws          | The workspace's connected number. Returns only a 4 character hint of the token, never the token.    |
| GET    | `/v1/conversations`        | jwt + ws          | Cursor paginated, most recent first. `?status=&assigned=me\|unassigned\|all&q=&cursor=&limit=`. Includes contact and assignee. |
| GET    | `/v1/conversations/:id`    | jwt + ws          | With contact and number, plus `window_expires_at` for the 24 hour window countdown.                 |
| POST   | `/v1/conversations`        | jwt + ws          | `{contact_id}`. Find or create the open conversation on the workspace's number; reopens a resolved one. 200. |
| POST   | `/v1/conversations/:id/read` | jwt + ws        | Sets `unread_count` to 0. Returns the conversation.                                                 |
| GET    | `/v1/conversations/:id/messages` | jwt + ws    | Newest first, `?cursor=&limit=` (default 50). The cursor is the last message id of the page.        |
| POST   | `/v1/conversations/:id/messages` | jwt + ws    | Send. Body is a union on `type`: text, image/video/audio/document, template, interactive. Stored queued, sent by the worker. 201. 409 `WINDOW_CLOSED` outside the window except for templates. |
| GET    | `/v1/messages/:id`         | jwt + ws          | One message, with its status and, when failed, Meta's `error_code` and `error_message`.            |
| POST   | `/v1/messages/:id/retry`   | jwt + ws          | Failed outbound only, else 409 `MESSAGE_NOT_RETRYABLE`. Requeues it. Window rule applies again.     |
| POST   | `/v1/media/upload`         | jwt + ws          | Multipart, one file in `file`, max 16 MB. Stores to R2, returns `{media_id, mime_type, size_bytes}`. 201. 503 without R2. |
| GET    | `/v1/media/:id/url`        | jwt + ws          | `{url, expires_at}`: a signed R2 url valid for 15 minutes.                                          |

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

## The WhatsApp webhook

Both webhook routes are public in the JWT sense, because Meta has no account
here. Authenticity comes from two different mechanisms:

- **GET** is the one time subscription handshake. Meta sends `hub.mode`,
  `hub.verify_token` and `hub.challenge`; the challenge is echoed back as a
  bare string only when the token equals `META_WEBHOOK_VERIFY_TOKEN`.
- **POST** carries `X-Hub-Signature-256`, an HMAC-SHA256 of the request body
  keyed with `META_APP_SECRET`. `MetaSignatureGuard` verifies it.

The signature is computed over the **exact bytes Meta sent**, so `main.ts`
keeps the raw buffer on the request through the `express.json` verify hook and
the guard hashes that. Hashing a re-serialised `req.body` would pass in
development and then fail in production on the first contact whose name
contains an emoji. The comparison uses `timingSafeEqual`, and the digest length
is checked first because `timingSafeEqual` throws on a length mismatch.

The handler does the minimum: one insert into `webhook_events`, one enqueue,
then 200. No Meta call is made in the request, per CLAUDE.md, and anything slow
or non-200 makes Meta redeliver.

### Idempotency

The inbound pipeline is replay safe at two levels, which matters because both
Meta and BullMQ retry:

1. A `webhook_events` row is only processed while its status is not yet
   `processed`, so a duplicate job for a finished event exits immediately.
2. `messages.wa_message_id` is unique. A replayed payload loses the insert and
   is skipped, so the conversation's `unread_count` does not inflate either.

Replaying the same body three times therefore produces exactly one message row.

Note that `upsert` in Prisma is a select followed by an insert, not one atomic
statement, so concurrent jobs for the first message from a new contact can both
try to insert. That unique violation is caught and the winner's row is read
instead, rather than failing the job.

## Sending messages

`POST /v1/conversations/:id/messages` takes one of these bodies, validated by
the zod schema `sendMessageSchema` in `@crm/shared` rather than class-validator,
because a union keyed on one field is what zod expresses natively:

```jsonc
{ "type": "text", "text": "..." }
{ "type": "image" | "video" | "audio" | "document", "media_id": "<our media uuid>", "caption"?: "...", "filename"?: "..." }
{ "type": "template", "template_name": "hello_world", "language": "en_US", "components"?: [] }
{ "type": "interactive", "interactive": { "type": "button" | "list", ... } }   // Meta's shape
```

Meta's own limits (3 reply buttons, 10 list rows, 20 character button titles,
no caption on audio, filename on documents only) are checked here, so a send
that Meta would reject later fails now with a 400 the agent can read.

### The 24 hour window

`isWindowOpen(contact)` in `src/conversations/window.ts` is
`last_inbound_at != null && now - last_inbound_at < 24h`. Text, media and
interactive sends outside it get 409 `WINDOW_CLOSED` with
`details: { last_inbound_at, expires_at }`. Templates are always allowed, since
reopening a closed window is what templates are for. A retry is checked again.

### What happens after the 201

1. The api stores the message as `queued`, moves the conversation's
   `last_message_at` and preview in the same transaction, enqueues
   `messages:message.send {messageId}` and publishes `message.created`. If
   Redis refuses the job, the row is marked failed so it can be retried, and
   the response is 503.
2. The worker builds the Meta payload. For media it uploads the R2 object to
   `POST /{phone_number_id}/media` on first use and caches Meta's id on the
   media row (re-uploading after 29 days, since Meta keeps them for 30).
3. Success sets `wa_message_id`, status `sent` and the contact's
   `last_outbound_at`, and publishes `message.status`.
4. The task 03 status webhooks move it on to `delivered`, `read` or `failed`,
   forward only.

Only a `queued` row is ever sent, so a duplicate job, or a retry of a job whose
send already went through, sends nothing.

### Retry classification

In `apps/worker/src/whatsapp/send-errors.ts`:

| Failure | Retried | Why |
| ------- | ------- | --- |
| Meta 5xx | yes, up to 3 times with backoff | Meta's own outage |
| Meta 429 | yes | throttled: the same request works later |
| Network error (fetch threw) | yes | Meta never answered |
| Meta other 4xx | no | bad template, invalid number, closed window (131047), bad token: resending fails the same way |
| Our own checks (missing media, R2 not configured) | no | nothing a retry can change |

A message that will not be retried, or has used its last attempt, is marked
`failed` with Meta's `error_code` and `error_message` (including Meta's
`error_data.details`, which usually names the actual problem). A non retryable
failure throws BullMQ's `UnrecoverableError`, which skips the remaining
attempts.

If Meta accepts the message but writing `sent` to the database then fails, the
job is not retried, because the row would still be `queued` and a retry would
send the customer the message twice. That case is logged with Meta's message
id.

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
