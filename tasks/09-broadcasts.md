# Task 09: Broadcasts

Depends on: 08. Roadmap milestone: 7 (part 3).

## Goal
Send a template to a segment, now or scheduled, with rate limiting, per-recipient status, and live stats.

## Schema
- broadcasts: id, workspace_id, whatsapp_account_id, name, template_id, variable_mapping jsonb ({"body.1":"contact.name","body.2":"static:Friday","header.media":"media:<id>"}), segment jsonb, status enum (draft, scheduled, sending, completed, cancelled, failed), scheduled_at, started_at, completed_at, total_recipients int, created_by, timestamps
- broadcast_recipients: id, broadcast_id, contact_id, message_id nullable, status enum (pending, sent, delivered, read, failed, skipped), error_code, error_message, sent_at, unique (broadcast_id, contact_id), index (broadcast_id, status)
- usage_counters: id, workspace_id, period text (YYYY-MM), broadcast_messages int, unique (workspace_id, period)

## Endpoints
```
GET  /v1/broadcasts                ?status=&cursor=
POST /v1/broadcasts                admin+, {name, template_id (must be APPROVED), variable_mapping, segment, scheduled_at?} -> draft (or scheduled if scheduled_at)
GET  /v1/broadcasts/:id            with counts {pending, sent, delivered, read, failed, skipped} from one grouped query, cached 10s in Redis while sending
PATCH /v1/broadcasts/:id           draft or scheduled only
POST /v1/broadcasts/:id/send       admin+, resolves segment now, creates recipients, checks monthly limit (plan limit from a static config map for now, keyed by workspaces.plan), enqueues broadcasts:broadcast.start immediately or with delay until scheduled_at
POST /v1/broadcasts/:id/cancel     sets cancelled; workers skip remaining pending recipients
DELETE /v1/broadcasts/:id          draft only
GET  /v1/broadcasts/:id/recipients ?status=&cursor=  with contact name and phone
POST /v1/broadcasts/:id/test       {contact_id}   sends to one contact, does not create a recipient or count usage
```

## Worker
- broadcast.start {broadcastId}: if cancelled, exit. Set status sending, started_at. For recipients in batches of 1,000, add one broadcast.send_recipient job per recipient to the "broadcast-send" queue. That queue has a BullMQ rate limiter: max META_BROADCAST_RATE_PER_SEC (default 20) per second per account (use group by account id or a limiter per queue named by account). When all jobs are enqueued, add broadcast.finalize with a delay that re-checks every 30s until no pending recipients remain.
- broadcast.send_recipient {recipientId}: skip if broadcast cancelled or contact opted out (status skipped). Build components with buildSendComponents using variable_mapping and the contact. Find or create the conversation. Create an outbound message row with broadcast_id and status queued, send through the same send path as task 04 (call the shared sender directly, do not enqueue again). On success set recipient sent, sent_at, message_id. On failure set failed with error. Increment usage_counters.broadcast_messages.
- Status webhooks: when a message with broadcast_id changes status, mirror it onto the recipient row (update webhook.process in task 03).
- broadcast.finalize: when no pending remain set completed and completed_at, publish broadcast.progress final.
- Publish broadcast.progress {broadcast_id, counts} at most every 2 seconds per broadcast (debounce via Redis key).

## Web
- /(app)/broadcasts: table with name, template, recipients, status, sent and read rates, created, scheduled time.
- /(app)/broadcasts/new BroadcastWizard: 1 pick template (approved only, preview), 2 map variables (static or contact field, media header upload), 3 audience (tags, attribute filters, live count via segment preview, exclude opted out locked on, optional "skip contacts messaged in last 24h"), 4 review with a rendered sample for the first matching contact, send now or schedule (workspace timezone), plus a "send test to me" button.
- /(app)/broadcasts/[id]: progress bar and count cards updating via broadcast.progress socket event with a 5s poll fallback, recipients table with status filter, cancel button while sending, download failed as CSV.
- Plan limit error (402 LIMIT_REACHED) shows a PlanLimitBanner component with the limit hit.

## Acceptance
- Import 50 test contacts (numbers you control or consenting friends), tag 10, broadcast to the tag. Stats reach 10 sent within seconds and delivered/read follow as phones receive.
- Cancel a 50-recipient broadcast after 5 sent: remaining are skipped, none sent after cancel.
- Schedule for 2 minutes from now: it starts on time.
- Rate limit: 200 recipients at 20/sec takes about 10 seconds, never faster.
- A failed recipient (invalid number) shows the Meta error message.

## Ranjot reviews
- The rate limiter configuration and what happens when Meta returns 130429 (throughput exceeded): back off, do not fail the recipient.
