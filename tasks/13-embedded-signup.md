# Task 13: Embedded Signup (self-serve WhatsApp connection)

Depends on: 10, Meta app review approved for whatsapp_business_management and whatsapp_business_messaging, Meta Tech Provider status. Roadmap milestone: 8 (full).

## Goal
A customer clicks "Connect WhatsApp", completes Meta's popup, and their number works in their workspace with no manual step.

## Before coding
- Meta app: switch to live mode, add the Embedded Signup configuration in the WhatsApp product settings, note the config id.
- Set META_APP_ID, META_APP_SECRET, META_EMBEDDED_SIGNUP_CONFIG_ID, META_SYSTEM_USER_TOKEN (used for subscribing the WABA to your app).

## Endpoints
```
POST /v1/whatsapp/connect        owner+, {code, waba_id, phone_number_id}
     1. exchange code: GET /oauth/access_token?client_id&client_secret&code -> business token
     2. GET /{phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier
     3. POST /{waba_id}/subscribed_apps to subscribe webhooks
     4. POST /{phone_number_id}/register {messaging_product, pin} (generate and store the 6-digit PIN encrypted)
     5. store whatsapp_accounts with the token encrypted, status connected
     6. enqueue templates.sync and profile.sync
POST /v1/whatsapp/disconnect     owner, unsubscribes app, marks disconnected, keeps history
POST /v1/whatsapp/reconnect      when token invalid (webhook or API error 190), starts the flow again
```
Only one account per workspace in this version. A second connect replaces the first after confirmation.

## Web
- ConnectWhatsAppButton: loads the Facebook JS SDK with your app id, calls FB.login with the config id, extra {setup: {}, featureType: "", sessionInfoVersion: "3"}, listens to the message event from the popup to capture waba_id and phone_number_id, then posts to /connect. Shows step progress and a clear error state with a retry.
- Onboarding step 3 uses it. Settings/whatsapp shows the connected state with a disconnect button.
- Persistent top banner when no account is connected or the token is invalid.

## Token health
- Nightly job calling GET /debug_token for each account. If invalid or expiring, email the owner and set status error.
- Any Meta API error code 190 from send or sync sets status error and emails the owner.

## Acceptance
- A friend with a fresh SIM signs up, connects their own new WhatsApp Business account through the popup, and sends and receives in their inbox within 5 minutes with no action from you.
- Disconnect, then reconnect the same number: history intact, new token stored.

## Ranjot reviews
- The whole connect sequence. Meta's flow changes; know each step's failure mode.
