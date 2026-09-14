# Task 12: Keyword automations and analytics

Depends on: 11. Roadmap milestone: 12.

## Goal
Rule-based auto replies (no AI) and a simple analytics page.

## Schema
- automations: id, workspace_id, whatsapp_account_id, name, enabled bool, trigger_type enum (keyword, new_contact, outside_hours, no_reply), trigger_config jsonb, action_type enum (send_text, send_template, assign, add_tag, set_status), action_config jsonb, priority int, stop_after bool (stop evaluating further rules if this fires), created_by, timestamps
- automation_runs: id, workspace_id, automation_id, conversation_id, message_id, result enum (fired, skipped, failed), detail, created_at
- daily_stats (materialised nightly): workspace_id, date, inbound_count, outbound_count, new_contacts, broadcasts_sent, first_response_seconds_p50, unique (workspace_id, date)

Trigger configs:
- keyword: {keywords: ["hours","timing"], match: "contains"|"exact"|"starts_with", case_insensitive: true}
- new_contact: {} fires on the first inbound message from a contact with no prior messages
- outside_hours: {} fires when inbound arrives outside workspace business_hours; cooldown 12h per contact
- no_reply: {after_minutes: 30} fires when an inbound has no outbound reply after N minutes (a delayed job scheduled on inbound, cancelled if an outbound is sent)

Action configs:
- send_text: {text} with {{name}} substitution
- send_template: {template_id, variable_mapping}
- assign: {user_id} or {strategy: "round_robin"}
- add_tag: {tag_id}
- set_status: {status}

## Endpoints
```
GET   /v1/automations
POST  /v1/automations               admin+, PlanGuard.assertCanCreateAutomation
PATCH /v1/automations/:id
DELETE /v1/automations/:id          admin+
POST  /v1/automations/:id/toggle    {enabled}
GET   /v1/automations/:id/runs      ?cursor=
POST  /v1/automations/test          {message_text, contact_id?} -> dry run listing which rules would fire and why

GET   /v1/analytics/overview        ?from=&to=   series per day: inbound, outbound, new contacts; totals; median first response
GET   /v1/analytics/agents          admin+, per member: conversations assigned, resolved, median response
GET   /v1/analytics/broadcasts      per day sent, delivered, read; overall rates
GET   /v1/analytics/templates       usage count and read rate per template
```

## Worker
- In webhook.process after an inbound message is stored, enqueue automations:automation.run {messageId}. The processor loads enabled automations for the account ordered by priority, evaluates keyword, new_contact, outside_hours in order, records a run row for each evaluated rule, executes the action of matches (respecting stop_after), sends replies through the shared sender with sent_by_automation_id set.
- no_reply: on inbound, add a delayed job keyed automation:noreply:{conversationId} with the configured delay; on outbound, remove that job. On fire, re-check that no outbound exists after the inbound.
- Nightly stats.rollup job computing daily_stats for yesterday for every workspace. Analytics endpoints read daily_stats for ranges and compute today live.

## Web
- /(app)/automations: list with toggle, priority drag ordering, runs count today. AutomationForm dialog with trigger and action sections that change by type, a test box that shows which rules fire for a sample message.
- /(app)/analytics: date range picker, four cards (conversations, messages in/out, new contacts, median first response), line chart of messages per day (recharts), broadcasts table with rates, agents table.
- Automation replies render in the thread with a small "Auto" label.

## Acceptance
- Rule: keyword "hours" contains -> send_text with business hours. A new contact texts "what are your hours": reply arrives within 3 seconds, thread shows the Auto label, runs page shows fired.
- outside_hours fires once, and not again within 12 hours for the same contact.
- no_reply 5 minutes: text in, no reply, at 5 minutes the template is sent. Text in, reply within 1 minute, nothing fires.
- Analytics numbers match a manual count for one day.

## Ranjot reviews
- Rule evaluation order and stop_after. Customers will create conflicting rules.
