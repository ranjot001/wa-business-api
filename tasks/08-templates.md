# Task 08: Message templates

Depends on: 07. Roadmap milestone: 7 (part 2).

## Goal
Sync approved templates from Meta, create new ones from the app, and pick them with variable filling in the composer and broadcasts.

## Schema
- templates: id, workspace_id, whatsapp_account_id, meta_template_id, name, language, category enum (MARKETING, UTILITY, AUTHENTICATION), status enum (APPROVED, PENDING, REJECTED, PAUSED, DISABLED), components jsonb, rejected_reason, synced_at, timestamps, unique (whatsapp_account_id, name, language)

## Endpoints
```
GET  /v1/templates                ?status=&category=&q=
POST /v1/templates/sync           admin+, enqueues sync:templates.sync
POST /v1/templates                admin+, {name, language, category, components} -> submits to Meta POST /{waba_id}/message_templates, stores PENDING with meta_template_id
DELETE /v1/templates/:id          admin+, DELETE at Meta by name, then locally
GET  /v1/templates/:id/preview    ?vars=... renders body text with {{1}} replaced, returns {header, body, footer, buttons}
```

## Worker: templates.sync
GET /{waba_id}/message_templates?fields=id,name,language,status,category,components,rejected_reason&limit=100 with paging. Upsert by (account, name, language). Mark local templates missing from Meta as DISABLED. Set synced_at.

## Webhook: message_template_status_update
Update status and rejected_reason by meta_template_id (handle in webhook.process now).

## Shared template renderer (packages/shared/templates.ts)
- extractVariables(components) -> {header: n, body: n, buttons: [...]}
- render(components, values) -> text preview
- buildSendComponents(template, values, mediaHeaderId?) -> Meta components array for the send API

## Web
- /(app)/templates: table with name, category, language, status badge, last synced, sync button. Row expands to a preview.
- /(app)/templates/new: builder form. Category, name (lowercase, underscores, validated), language select, header (none, text, image, video, document), body with variable inserter ({{1}}, {{2}}) and live preview phone mockup, footer, buttons (quick reply, url, phone) up to 3. Submit shows PENDING and a note that Meta approval usually takes minutes to a day.
- TemplatePicker (replaces the placeholder from task 05): search approved templates, choose, fill each variable with either a static value or a contact field (name, phone, or an attribute key), media header uploader, live preview, send.

## Acceptance
- Sync pulls hello_world and any templates you made in Meta Business Manager.
- Create a MARKETING template with two body variables and a URL button from the app. It appears as PENDING then APPROVED after the webhook fires.
- Send it from the composer with variables filled from the contact name. It renders correctly on the phone.

## Ranjot reviews
- Meta's template component format. It is fiddly and every future feature reuses buildSendComponents.
