# Task 10: Beta customer onboarding without Embedded Signup

Depends on: 09. Roadmap milestone: 8 (beta version) and 11.

## Goal
Onboard the first customers by hand: their phone number lives under your WABA, mapped to their workspace. Add the settings screens they need and a manual plan switch for billing by invoice.

## Backend
- Manual account endpoint from task 03 stays owner-of-platform only. Add a platform admin concept: users.is_platform_admin boolean, PlatformAdminGuard. Only you.
- Endpoints (platform admin):
```
GET   /v1/admin/workspaces                        list with plan, status, account status, member count, usage
POST  /v1/admin/workspaces/:id/whatsapp-account   {waba_id, phone_number_id, display_phone, verified_name}   token comes from the platform system user token env META_SYSTEM_USER_TOKEN, encrypted per account
PATCH /v1/admin/workspaces/:id/plan               {plan: trial|starter|growth|pro, subscription_status, trial_ends_at}
POST  /v1/admin/workspaces/:id/impersonate        returns a short-lived access token for support (audit logged)
```
- Plan limits config: packages/shared/plans.ts with seats, contacts_limit, monthly_broadcast_limit, automations_limit per plan code. PlanGuard service with assertCanInvite, assertCanAddContacts(n), assertCanBroadcast(n), assertCanCreateAutomation, each throwing 402 LIMIT_REACHED {limit, current, plan}. Wire into invitations (task 02), contacts create and import (07), broadcasts send (09).
- Business profile endpoints:
```
GET   /v1/whatsapp/profile        about, address, description, email, websites, vertical, profile_picture_url
PATCH /v1/whatsapp/profile        admin+, pushes to Meta
GET   /v1/whatsapp/account        add quality_rating, messaging_tier, status, webhook health (last event received at)
```
- Handle phone_number_quality_update and account_update webhook fields: update account fields, and if status becomes banned or restricted set account status error and email the workspace owner.

## Web
- /(app)/settings/whatsapp: connection card (number, verified name, quality, tier, last webhook), business profile form, and if no account connected a "Contact us to connect your number" state (Embedded Signup replaces this in task 13).
- /(app)/settings/workspace: name, timezone, business hours editor (per day open and close).
- /(app)/settings/billing: current plan, usage bars (contacts, broadcasts this month, seats), "Contact us to change plan" (Stripe replaces this in task 14).
- Onboarding flow: register, verify email, create workspace, invite team, land in inbox with an empty state explaining the number will be connected by the team.
- Minimal /admin page (platform admin only) listing workspaces with the plan switch and the attach-number form.

## Manual onboarding runbook (for you, put in docs/onboarding.md)
1. Customer registers and creates a workspace. Get the workspace id from /admin.
2. In Meta Business Manager under your WABA, add a phone number: customer receives the OTP on that number, reads it to you, or you do it together on a call. The number must not be active on the WhatsApp app; they must delete the account there first (warn them and back up their chats).
3. Register the number for Cloud API (POST /{phone_number_id}/register with a 6-digit PIN) and set the display name. Display name review takes a few hours.
4. Attach the number to the workspace via /admin.
5. Import their contacts with them on the call, create their first template, send the first broadcast together.
6. Set plan manually, send an invoice (Stripe payment link or Wise) monthly.

## Acceptance
- A second workspace with a second number receives and sends independently from the first. A message to number A never appears in workspace B.
- Agent invite blocked at seat limit with a clear banner.
- Quality rating and tier shown in settings and updated by a webhook.

## Ranjot reviews
- Webhook routing by phone_number_id across two accounts. This is the multi-tenant boundary.
