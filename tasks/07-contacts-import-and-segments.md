# Task 07: Contacts page, CSV import, segments

Depends on: 06. Roadmap milestone: 7 (part 1).

## Goal
Manage contacts in bulk: search, filter, import from CSV, export, and preview a segment count for broadcasts.

## Schema
- contact_imports: id, workspace_id, created_by, file_key, status enum (pending, processing, completed, failed), total_rows, imported, updated, skipped, errors jsonb (array of {row, reason}), mapping jsonb, timestamps
- contacts.attributes stays jsonb. Add attribute_definitions: id, workspace_id, key, label, type enum (text, number, date, boolean), unique (workspace_id, key) so the UI knows which custom fields exist.

## Endpoints
```
GET  /v1/contacts                    ?q=&tag_ids=&opted_out=&sort=name|last_inbound_at&cursor=   q matches name, profile_name, wa_id prefix
POST /v1/contacts                    {wa_id, name, attributes, tag_ids}   normalise wa_id to digits; 409 if exists
GET  /v1/contacts/:id                with tags, open conversation id, message counts
PATCH /v1/contacts/:id               {name, attributes}
DELETE /v1/contacts/:id              admin+, audit log, deletes conversations and messages (confirm in UI)
POST /v1/contacts/:id/opt-out
POST /v1/contacts/:id/opt-in         admin+

POST /v1/contacts/import             multipart csv up to 10 MB -> stores file to R2, returns {import_id, headers, sample_rows}
POST /v1/contacts/import/:id/start   {mapping: {wa_id: "Phone", name: "Name", attributes: {city: "City"}}, tag_ids, default_country_code}   enqueues contacts:import.process
GET  /v1/contacts/import/:id         progress and errors
POST /v1/contacts/export             {filters} -> enqueues export, returns {export_id}; GET /v1/contacts/export/:id returns signed url when ready
POST /v1/contacts/segment/preview    {tag_ids, attribute_filters:[{key, op, value}], exclude_opted_out:true} -> {count}

GET  /v1/attribute-definitions
POST /v1/attribute-definitions       {key, label, type}
DELETE /v1/attribute-definitions/:id admin+
```

## Worker: import.process
Stream the CSV with csv-parse. For each row: normalise phone (strip spaces, plus, dashes; prepend default country code if length suggests local number; validate with libphonenumber-js), skip with reason if invalid or duplicate in file, upsert contact (update name and attributes only if provided, never overwrite opted_out), apply tags. Batch 500 rows per transaction. Update progress counters every batch. Cap 50,000 rows per import.

## Segment resolver (shared service, used by preview and by broadcasts in task 09)
resolveSegment(workspaceId, segment) returns a Prisma where clause. Supports tag any-of, attribute filters (eq, neq, contains, gt, lt, exists), exclude opted out, exclude contacts with last_outbound_at within N hours (optional frequency cap).

## Web
- /(app)/contacts: table with search, tag filter, opted-out filter, columns name, phone, tags, last message, actions. Row click opens /contacts/[id]. Bulk select with add tag and export.
- /(app)/contacts/[id]: profile header, attributes form driven by attribute_definitions, tags, conversation link, opt-out toggle.
- CsvImportWizard: step 1 upload, step 2 map columns (auto-detect Phone and Name), step 3 preview first 5 rows and the segment tags to apply, step 4 progress with live counts and a downloadable error report.
- New contact dialog.
- Settings page for attribute definitions.

## Acceptance
- Import a 1,000-row CSV with some bad numbers: correct imported and skipped counts, error rows listed with reasons.
- Re-import the same file: 0 imported, 1,000 updated, no duplicates.
- Segment preview count matches the table filter count.
- Opt out a contact, preview with exclude_opted_out: count drops by one.

## Ranjot reviews
- Phone normalisation rules. Wrong here means broadcasts to the wrong people.
