# Architecture

```
Browser ──► /team, /price, /price/<slug>   static HTML + JS modules (public/team, public/price), no build step
        ──► /api/team, /api/quotes,         serverless functions (api/*.js) on Vercel,
            /api/price-auth, /api/cron      or the same files run by server.js when self-hosting
                     │
                     ▼
              api/_storage.js ──► Supabase table suite_files (STORAGE=supabase, picked when
                                  SUPABASE_SERVICE_ROLE_KEY is set), Vercel Blob (STORAGE=blob)
                                  or a folder (STORAGE=local)
```

The portfolio itself (React, `src/`) is unrelated to the suite and is built by Vite. Vite copies
`public/team` and `public/price` into `dist/` unchanged. `vercel.json` sends `/team`, `/price`
and `/price/<slug>` to those pages and everything else (except `/api`, `/admin`) to the
portfolio.

## Data (all JSON documents)

Private store (one row per path in Supabase `suite_files`, or `BLOB_READ_WRITE_TOKEN` from connecting a Blob store, or `LEADS_BLOB_TOKEN`, or `<STORAGE_DIR>/private`):

| Path | What |
| --- | --- |
| `team/db.json` | the whole Team app: people, accounts (hashed passwords), settings, tasks, projects, reviews, goals, milestones, skills, leave, notifications, sales leads, push subscriptions |
| `config/brand.json` | Brand & region (name, logo, colours, contact and bank details, currency, time zone, phone code) |
| `config/auth.json` | the Price Builder password (hashed) |
| `pricing/catalog.json` | the price list (missing until first saved: the sample list is used) |
| `quotes/<id>.json` | each quote with its contract, invoices and kick-off |
| `proposals/<slug>.json` | the frozen copy a client sees at `/price/<slug>` |
| `leads/*.json` | client requests from proposal pages, kept as records |

Pictures (profile photos, backgrounds, the logo): on Blob with `MEDIA_BLOB_TOKEN`, a public store the
browser uploads to directly. Otherwise (Supabase, or Blob without it), they go into the private store under
`team/…` through `api/media.js` and are served at `/media/…` (only `team/avatar|background|logo`
can be read there). Self-hosted, they are files in `<STORAGE_DIR>/public`, served at `/media/`.

`config/secret.json` holds the signing key when `SESSION_SECRET` is not set.

Writes to `team/db.json` go through `mutate()` (api/_team-lib.js): it re-reads, applies the
change and saves only if nobody else saved in between (an ETag check), retrying otherwise.
`api/_storage.js` gives the local folder the same ETag behaviour; on Supabase the check runs
inside the database (`suite_put` locks the row, compares the etag, then saves).

The `suite_files` table has row-level security on and no grants for the public keys, so the
browser key used by the contact form cannot read or write it; only the server's secret key can.

## Sign-in

- Team app: email + password per person, an HttpOnly signed cookie (`gz_team`) for 14 days.
- Price Builder: one admin password, cookie `gz_session` for 12 hours.
- First admin: only while no account exists, and only with `SETUP_TOKEN` (the "setup key").
- Cron: `Authorization: Bearer <CRON_SECRET>` (Vercel adds it to its own cron calls).

## Modules

| File | Role |
| --- | --- |
| `api/team.js` | every Team app action (one POST endpoint with an `action` field), state for the signed-in person |
| `api/quotes.js` | Price Builder: quotes, publishing links, client requests, contracts, invoices, kick-off |
| `api/price-auth.js` | Price Builder password |
| `api/cron.js` | the morning, evening and hourly jobs |
| `api/_brand.js` | Brand & region document and the region presets |
| `api/_storage.js` | Supabase, Vercel Blob or a local folder, same functions |
| `api/_team-*.js`, `_sales.js`, `_leads.js`, `_push.js` | team logic, notifications, kick-off routing, sales, web push |
| `api/_price-catalog.js` | the starting (sample) price list and contract clauses |
| `public/price/engine.js`, `deal.js` | quote maths and contract/invoice maths, shared by browser and server |
| `server.js` | self-host server: static files, the API, `vercel.json` rewrites and headers, and the cron jobs |

Money is stored under the original key names (`ETB`, `totalEtb`…). In this edition they mean
"home currency": the currency set in Brand & region. `USD` is the optional second currency a
client can pay in.
