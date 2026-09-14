# Bruno collection

API requests for the WhatsApp CRM, checked into the repo so they version with
the endpoints they call.

## Use it

Install Bruno (`brew install --cask bruno`), then **Open Collection** and pick
this `bruno` folder. Choose an environment in the top right before sending
anything.

| Environment  | base_url                          |
| ------------ | --------------------------------- |
| `local`      | `http://localhost:4000`           |
| `production` | placeholder, see below            |

`base_url` is the host only. Each request spells out the `/v1` prefix itself,
the same way the web app builds URLs from `NEXT_PUBLIC_API_URL`.

## Production URL is still a placeholder

`environments/production.bru` points at `https://REPLACE_ME.up.railway.app`.
Replace it with the real Railway domain for the api service once that exists
(task 01 step 11). Nothing else needs to change.

## Command line

The same collection runs headless, which is handy for a smoke test after a
deploy:

```bash
cd bruno
npx --yes @usebruno/cli run --env local
```

Use `npx`, not `pnpm dlx`: pnpm's resolver stalls on this package's dependency
tree. A passing run prints one line per request plus its assertions.

## Adding requests

One folder per resource, `seq` ordering requests inside it. Every request
carries an `assert` block so a run fails on a wrong status or a changed body
rather than just printing one. When you add an endpoint, add it here and to the
table in `apps/api/README.md`.
