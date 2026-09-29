# Bruno collection

API requests for local and production. Open the `/bruno` folder in
[Bruno](https://www.usebruno.com) and pick an environment in the top right.

## Environments

| Variable      | local                   | production                 |
| ------------- | ----------------------- | -------------------------- |
| `base_url`    | `http://localhost:4000` | the public Railway api URL |
| `email`       | the seeded user         | set it yourself            |
| `password`    | `SEED_PASSWORD`         | set it yourself            |

Every request spells out the `/v1` prefix itself, matching how the web app
builds URLs from `API_URL`.

## Order to run things in

1. **auth / Login** (or **Register** for a new account). Both capture
   `access_token` into the environment, and every later request sends it.
2. **me / Get Me**. Captures `workspace_id` from the first workspace, which is
   what the workspace scoped requests send as `X-Workspace-Id`.
3. Anything else. **workspaces / Create Workspace** also sets `workspace_id`,
   so run it instead of step 2 when starting from an account with no workspace.

Variables marked with `~` are placeholders you fill in from a response:
`invitation_token` comes from the link the api logs, `member_user_id` from
**members / List Members**, and `reset_token` from the forgot-password link.

`access_token` is a secret variable, so it is not written to the environment
file when Bruno saves it.

## The WhatsApp webhook

`webhooks / Receive Webhook` cannot be sent from Bruno as is: Meta signs the
exact request bytes with `META_APP_SECRET` and Bruno cannot compute that for
you. The request's docs tab carries a curl snippet that signs and sends in one
step, which is the practical way to replay a payload locally.

`webhooks / Verify Webhook` does work from Bruno and is a quick way to confirm
`META_WEBHOOK_VERIFY_TOKEN` matches what the Meta dashboard has.

To register a number locally, run `whatsapp / Connect Manual Account` with
`meta_access_token` set to a real Meta token. It is owner only.

## Notes

- **auth / Refresh** works once per cookie. Running it twice in a row fails the
  second time, because refreshing revokes the token it was given.
- Password reset and invitation emails are only sent when the api has
  `RESEND_API_KEY`. Without it the api logs the link, which is what local
  development runs on.
