# Task 14: Stripe subscriptions

Depends on: 10. Roadmap milestone: 9.

## Goal
Self-serve plans with Stripe Checkout and Customer Portal, USD and INR, limits enforced from the subscription.

## Schema
- plans: id, code unique (trial, starter, growth, pro), name, price_usd_cents, price_inr_paise, stripe_price_id_usd, stripe_price_id_inr, seats, contacts_limit, monthly_broadcast_limit, automations_limit, features jsonb, active bool. Seed from packages/shared/plans.ts and make PlanGuard read from the table.
- workspaces: add stripe_customer_id, stripe_subscription_id, plan_id fk, subscription_status enum (trialing, active, past_due, canceled, unpaid), current_period_end, grace_until
- webhook_events already handles provider stripe

## Endpoints
```
GET  /v1/billing                  admin+, plan, status, period end, usage vs limits, next invoice amount from Stripe
GET  /v1/billing/plans            public, active plans with both currencies
POST /v1/billing/checkout         owner, {plan_code, currency} -> creates or reuses Stripe customer, Checkout session in subscription mode with trial_from_plan false, success and cancel URLs, returns {url}
POST /v1/billing/portal           owner -> Customer Portal session url (update payment, change plan, cancel)
GET  /v1/billing/invoices         owner, from Stripe
POST /v1/webhooks/stripe          verify signature with STRIPE_WEBHOOK_SECRET, store event (dedupe by event id), enqueue billing:stripe.process
```

## Worker: stripe.process
- checkout.session.completed: link customer and subscription to the workspace (metadata.workspace_id on the session)
- customer.subscription.created / updated: set plan_id from the price id, subscription_status, current_period_end
- customer.subscription.deleted: plan trial, status canceled, workspace read-only after current_period_end
- invoice.payment_failed: status past_due, grace_until = now + 7d, email owner
- invoice.paid: status active, clear grace_until

## Enforcement
- PlanGuard reads plan limits from plans and usage from usage_counters and live counts.
- ReadOnlyGuard: if status is canceled or unpaid past grace, allow GET routes and block mutations with 402 SUBSCRIPTION_INACTIVE.
- Trial: 14 days on the trial plan limits, banner counting down, hard stop to read-only when it ends unless subscribed.

## Web
- /(app)/settings/billing: current plan card, usage bars, plan grid with monthly toggle USD/INR, "Upgrade" opens Checkout, "Manage" opens the Portal, invoices table.
- PlanLimitBanner and the upgrade modal wired to 402 responses app-wide.
- Public /pricing page on the marketing site reading /billing/plans.

## Acceptance
- Stripe test mode: subscribe to Growth with card 4242, workspace limits change immediately after the webhook, invite the 3rd, 4th, 5th agent succeeds, 6th is blocked.
- Cancel in the Portal: at period end (use Stripe test clocks) the workspace goes read-only.
- Failed payment card: status past_due, email received, still usable for 7 days.

## Ranjot reviews
- Every subscription state transition in stripe.process. Money bugs are the worst bugs.
