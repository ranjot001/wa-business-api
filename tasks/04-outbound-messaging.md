# Task 04: Sending messages and status tracking

Depends on: 03. Roadmap milestone: 4.

## Goal
Agents can send text, media, and templates from the API. Messages are queued, sent by the worker, and their status updates live from Meta webhooks.

## Endpoints
```
GET  /v1/conversations                      ?status=&assigned=me|unassigned|all&q=&cursor=&limit=   sorted last_message_at desc, includes contact {id, name, wa_id}, assignee {id, name}
GET  /v1/conversations/:id                  with contact and account
POST /v1/conversations                      {contact_id}   find or create open conversation
POST /v1/conversations/:id/read             sets unread_count 0
GET  /v1/conversations/:id/messages         ?cursor=&limit=50   newest first, cursor on created_at+id
POST /v1/conversations/:id/messages         body is a discriminated union on type:
       {type:"text", text}
       {type:"image"|"video"|"audio"|"document", media_id, caption?, filename?}
       {type:"template", template_name, language, components}
       {type:"interactive", interactive}   (buttons or list, pass-through Meta shape, validated by zod)
POST /v1/messages/:id/retry                 failed outbound only
GET  /v1/messages/:id
POST /v1/media/upload                       multipart, max 16 MB, stores to R2, creates media row with status ready, returns {media_id}
GET  /v1/media/:id/url                      signed R2 url, 15 min
```

## Window rule
Service-side function isWindowOpen(contact) = contact.last_inbound_at != null && now - last_inbound_at < 24h. Text, media, interactive: if closed, throw 409 WINDOW_CLOSED with details {last_inbound_at, expires_at}. Template: always allowed. Compute expires_at and return it on GET /conversations/:id as window_expires_at so the UI can show a countdown.

## Send flow
1. API validates DTO and window, inserts message with direction outbound, status queued, sent_by_user_id, content. Updates conversation last_message_at and preview. Publishes message.created. Returns the message.
2. Enqueue messages:message.send {messageId}.
3. Worker loads message and account, builds the Meta payload:
   - text: {messaging_product:"whatsapp", to, type:"text", text:{body, preview_url:false}}
   - media: upload the R2 object to Meta with POST /{phone_number_id}/media if media.wa_media_id is null, cache wa_media_id on the media row, then send {type:"image", image:{id, caption}}
   - template: {type:"template", template:{name, language:{code}, components}}
   - interactive: pass through
4. On success set wa_message_id and status sent, contact.last_outbound_at. Publish message.status.
5. On Meta error: status failed, error_code, error_message. Do not retry on 4xx (bad template, invalid number, window closed 131047). Retry on 5xx and network errors up to 3 times.
6. Status webhooks from task 03 move it to delivered, read, or failed.

## Meta client
Add sendMessage(account, payload) and uploadMedia(account, buffer, mime). Throw a typed MetaApiError {code, subcode, message, fbtrace_id}.

## Acceptance
- Send a text through Bruno, it arrives on your phone, row goes queued -> sent -> delivered -> read as you open it.
- Send an image uploaded through /media/upload.
- Send hello_world template with the window closed: succeeds. Send text with the window closed: 409.
- Send to an invalid number: message ends failed with Meta's error code stored, job not retried.
- Tests: window rule unit tests with fake clocks, payload builder tests.

## Ranjot reviews
- The status ordering guard (never downgrade read to delivered)
- The retry classification in the worker
