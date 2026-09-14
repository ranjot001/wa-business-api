# Task 06: Team features

Depends on: 05. Roadmap milestone: 6.

## Goal
Assignment, statuses, notes, canned replies, and tags so a small team can share the inbox.

## Schema
- notes: id, workspace_id, conversation_id, author_id, body, timestamps
- canned_replies: id, workspace_id, shortcut, title, body, unique (workspace_id, shortcut)
- tags: id, workspace_id, name, color, unique (workspace_id, name)
- contact_tags: contact_id, tag_id, primary key (contact_id, tag_id)

## Endpoints
```
PATCH /v1/conversations/:id             {status?, assigned_to?}   any member; assigning to a non-member -> 422
GET   /v1/conversations/:id/notes
POST  /v1/conversations/:id/notes       {body}
DELETE /v1/notes/:id                    author or admin

GET   /v1/canned-replies
POST  /v1/canned-replies                {shortcut, title, body}   shortcut is lowercase, no spaces
PATCH /v1/canned-replies/:id
DELETE /v1/canned-replies/:id           admin+

GET   /v1/tags
POST  /v1/tags                          {name, color}
PATCH /v1/tags/:id
DELETE /v1/tags/:id                     admin+, cascades contact_tags
POST  /v1/contacts/:id/tags             {tag_ids}   adds
DELETE /v1/contacts/:id/tags/:tagId
GET   /v1/conversations                 add filter tag_ids= (contacts having any of the tags)
```
Realtime: conversation.updated on status or assignment change. contact.updated on tag change.

## Web
- Thread header: assign dropdown (members list with avatars, "Unassign"), status segmented control (Open, Pending, Resolved). Resolving hides it from Open tab and shows a toast with undo.
- Filter tabs use assigned=me|unassigned|all. Add a tag filter multi-select.
- Composer: "Note" toggle switches the composer to yellow background and posts to notes instead of messages. Notes render in the thread as yellow cards with author and time, never sent to WhatsApp.
- Canned replies: typing "/" in the composer opens a picker filtered by shortcut, Enter inserts the body. Settings page /settings/canned-replies with a table and dialog form.
- Tags: chip input in the ContactPanel, settings page /settings/tags with colours.
- Team settings page /settings/team: members table with role select, remove, pending invitations, invite dialog (uses task 02 endpoints).

## Acceptance
- Invite a second account. Assign it a conversation. Its Mine tab shows only that one.
- Add a note as user A. User B sees it live, it does not reach the phone.
- Create shortcut "hours" and insert it with /hours.
- Tag a contact "vip", filter inbox by vip.
- Agent role cannot delete tags or canned replies (403).

## Ranjot reviews
- Notes and messages share the thread view. Check the discriminated rendering so a note can never be sent.
