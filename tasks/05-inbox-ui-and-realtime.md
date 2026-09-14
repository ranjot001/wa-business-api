# Task 05: Inbox UI and realtime

Depends on: 04. Roadmap milestone: 5.

## Goal
A three-column inbox in the web app with live updates over Socket.io. Two open tabs stay in sync.

## Backend
- Socket.io gateway in apps/api at path /socket. Auth via JWT in the handshake auth field plus workspaceId. On connect, verify membership and join room ws:{workspaceId}. Redis adapter so multiple api instances share rooms.
- Worker publishes to Redis pub/sub channel "realtime" with {workspaceId, event, payload}. The gateway subscribes and emits to the room.
- Events (names in packages/shared/events.ts): message.created {message, conversation}, message.status {message_id, conversation_id, status, error_code}, conversation.updated {conversation}, contact.updated {contact}
- Client to server: conversation.read {conversation_id} (calls the same service as POST /read), typing {conversation_id} (relay only, no persistence)

## Web
Routes: /(app)/inbox and /(app)/inbox/[conversationId]. App shell with left icon rail (inbox, contacts, templates, broadcasts, automations, analytics, settings) and the workspace switcher.

Layout: three columns. List 320px, thread flexible, contact panel 300px collapsible.

Components:
- ConversationList: infinite query on GET /conversations with filters (tabs Mine, Unassigned, All; status select; search debounced 300ms). Items show avatar initial, name or wa_id, preview, relative time, unread badge, assignee chip. Active item highlighted. New message moves the item to the top via cache update.
- MessageThread: infinite query newest first, rendered oldest to newest with reverse scroll and "load older" at the top. Date separators. Inbound left, outbound right. Bubbles per type: text (linkify), image (thumbnail, click to open signed url), video, audio player, document (icon, filename, download), location (static map link), sticker, reaction (small pill under the target message), template (rendered body from components), interactive (buttons shown disabled), unsupported (grey note). Status ticks on outbound: clock, one tick, two ticks, two blue ticks, red for failed with a retry button that calls POST /messages/:id/retry.
- WindowChip in the thread header: green "Reply window: 23h 12m" recomputed every minute, or red "Template required" when closed.
- Composer: textarea with Enter to send and Shift+Enter newline, emoji button, attach button (uploads through /media/upload then sends), template button opens TemplatePicker (task 08 fills this; for now a simple form: template name, language, component variables as text inputs), disabled with tooltip when window closed except the template button.
- Optimistic send: insert a temp message with client_id and status queued into the messages cache, replace on response, mark failed on error.
- ContactPanel: name (editable inline, PATCH contact from task 07 or a minimal PATCH /contacts/:id added here), wa_id copy button, attributes read only for now, opt-out badge.
- Socket provider: connects once per workspace, reconnects with backoff, on each event patches TanStack Query caches. On reconnect, invalidate conversations list.

State: TanStack Query for server data, Zustand for filters, active panel state, composer drafts keyed by conversation id.

## Acceptance
- Two browser tabs open. Text from your phone: both tabs show it instantly and the conversation moves to the top with an unread badge.
- Reply from tab A: tab B shows it, phone receives it, ticks update in both.
- Open the conversation: unread resets in both tabs.
- Kill the api, restart: the socket reconnects and the list refreshes without reload.
- Scroll to load 200 older messages without jank.

## Ranjot reviews
- The cache patching logic in the socket provider. This is where subtle bugs hide.
- Reverse infinite scroll behaviour on the thread
