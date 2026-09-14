# Task 03: WhatsApp account model, webhook receiver, inbound pipeline

Depends on: 02. Roadmap milestone: 3.

## Goal
Inbound WhatsApp messages become contact, conversation, and message rows, tied to the right workspace, with no duplicates, processed by the worker.

## Schema
- whatsapp_accounts: id, workspace_id, waba_id, phone_number_id unique, display_phone, verified_name, access_token_enc bytea, quality_rating, messaging_tier, status enum (connected, disconnected, error), connected_at
- contacts: id, workspace_id, wa_id (digits only), name, profile_name, attributes jsonb default '{}', opted_out bool, opted_out_at, last_inbound_at, last_outbound_at, source enum (inbound, import, manual, api), unique (workspace_id, wa_id), index (workspace_id, last_inbound_at)
- conversations: id, workspace_id, contact_id, whatsapp_account_id, status enum (open, pending, resolved) default open, assigned_to nullable, last_message_at, last_message_preview, unread_count int default 0, unique (workspace_id, contact_id, whatsapp_account_id), index (workspace_id, status, last_message_at desc), index (workspace_id, assigned_to, status)
- messages: id, workspace_id, conversation_id, contact_id, direction enum (inbound, outbound), wa_message_id unique nullable, type enum (text, image, video, audio, document, sticker, location, contacts, template, interactive, reaction, button, unsupported), content jsonb, status enum (queued, sent, delivered, read, failed), error_code int, error_message, sent_by_user_id, sent_by_automation_id, broadcast_id, reply_to_message_id, wa_timestamp, timestamps, index (conversation_id, created_at desc)
- media: id, workspace_id, message_id, wa_media_id, mime_type, size_bytes, storage_key, status enum (pending, ready, failed)
- webhook_events: id, provider enum (meta, stripe), external_id, payload jsonb, status enum (received, processed, failed), error, processed_at, created_at, index (provider, status)

## Endpoints
```
GET  /v1/webhooks/whatsapp    hub.mode, hub.verify_token, hub.challenge  -> returns challenge if token matches META_WEBHOOK_VERIFY_TOKEN
POST /v1/webhooks/whatsapp    verifies X-Hub-Signature-256 with META_APP_SECRET, inserts webhook_events, enqueues webhooks:webhook.process {eventId}, returns 200
POST /v1/whatsapp/accounts/manual   {waba_id, phone_number_id, display_phone, access_token}   owner only, for beta customers added by hand (see task 10)
GET  /v1/whatsapp/account
```
For local dev, the manual endpoint is how you register your Meta test number to the Demo workspace.

## Worker: webhook.process
1. Load event. If status != received, exit.
2. For each entry.changes[]:
   - field == "messages": for each messages[] item, find whatsapp_accounts by metadata.phone_number_id. If none, mark processed with note "unknown phone_number_id" and continue.
   - Upsert contact by (workspace_id, wa_id) with profile_name from contacts[0].profile.name, set last_inbound_at = message timestamp, source inbound.
   - Find or create the open conversation for (workspace, contact, account). If the latest conversation is resolved, reopen it (set status open).
   - Insert message. wa_message_id unique index. On unique violation, skip silently (this is the retry case).
   - Map types: text -> {text}; image/video/audio/document/sticker -> {media_id, mime_type, sha256, caption, filename} and create media row status pending and enqueue media:media.download; location -> {lat, lng, name, address}; contacts -> raw; reaction -> {emoji, reacted_to_wa_message_id}; button and interactive -> {payload, title}; anything else -> unsupported with raw.
   - Update conversation last_message_at, last_message_preview, unread_count + 1.
   - Publish realtime event message.created (task 05 consumes it; for now publish to Redis channel "ws:{workspaceId}").
   - statuses[]: update messages by wa_message_id set status (respect ordering: never downgrade read to delivered), error_code and error_message from errors[0]. Publish message.status.
   - field == "message_template_status_update", "phone_number_quality_update", "account_update": log and store for now, handled in tasks 08 and 11.
3. Mark event processed. On any thrown error mark failed with error text, rethrow so BullMQ retries.

## Worker: media.download
GET https://graph.facebook.com/v20.0/{media_id} with the account token to get the URL, download the binary with the token, put to R2 at ws/{workspaceId}/media/{mediaId}, set media.status ready and storage_key. Retry 3 times.

## Meta client (packages/shared or apps/api/src/whatsapp/meta.client.ts, reused by worker)
Typed wrapper: getMedia(id), downloadMedia(url), later sendMessage. Base URL and version from env META_GRAPH_VERSION. Logs request id and Meta error body on failure.

## Acceptance
- Register your test number via the manual endpoint. Text it from your phone: text, image, location, emoji reaction. Rows appear correctly.
- Replay the same webhook body with curl three times: one message row.
- Kill the worker, send 5 messages, start the worker: all 5 are processed from the queue.
- Unit tests for the payload mapper with fixture payloads for each type (save real payloads from the Meta docs as fixtures).

## Ranjot reviews
- Signature verification code
- The upsert plus unique index dedupe pattern. This is the core idempotency guarantee.
