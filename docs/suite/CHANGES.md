# Changes from the original code

Rule for this port: keep every feature as it was. The only changes allowed were
**REMOVE-GEZAT** (taking out the original agency's name, people, contact details, logo,
fonts and private data, and turning what was specific to them into settings) and
**SELF-HOSTING** (making it install and run anywhere, safely, from an empty start).
Each change below is tagged with one of the two.

No live data, secrets or environment values of the original agency were read or copied:
only the source code in the zip. `.vercel/`, `.env` and `node_modules` were not copied.

## Not copied

| Original file | Why | Tag |
| --- | --- | --- |
| `api/_team-setup.js` | held the original team's real names, emails and password hashes | REMOVE-GEZAT |
| `api/leads.js`, `api/upload.js`, `api/content.js` | the original public website's contact form and CMS, not part of the tools (this site has its own) | REMOVE-GEZAT |
| website pages, `gezat-*.js`, `/assets/gezat-mark.png`, Söhne font files | the original agency's site, logo and a font licensed only to them | REMOVE-GEZAT |
| one-off data migrations in `api/_team-lib.js` (moving the founder, Ethiopian quarter ids, old leave year, review sign-off backfill) | they rewrote the original agency's live database; a fresh install starts with the current format | REMOVE-GEZAT |

`api/_team-seed.js` (the fictional demo team) was kept.

## New files

| File | What | Tag |
| --- | --- | --- |
| `api/_brand.js` | Brand & region document (`config/brand.json`): name, logo, colours, contact, bank, currency, time zone, phone code, country, city; Ethiopia and International presets | REMOVE-GEZAT |
| `api/_storage.js` | the same storage functions over Vercel Blob or a local folder (ETags, conditional writes, signed uploads) | SELF-HOSTING |
| `server.js` | self-host server: static files, API, `vercel.json` rewrites/headers/redirects, cron jobs, local uploads | SELF-HOSTING |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example` | install anywhere | SELF-HOSTING |
| `public/team/icons/*.png` | new generic app icons replacing the original logo icons | REMOVE-GEZAT |
| `docs/suite/*` | these docs | – |

## Server changes

| File | Change | Tag |
| --- | --- | --- |
| `api/_lib.js` | imports storage from `_storage.js` instead of `@vercel/blob`; adds `setupTokenOk()` | SELF-HOSTING |
| `api/auth.js` → `api/price-auth.js` | renamed: this site already has `/api/auth` (CMS sign-in); first password needs `SETUP_TOKEN` | SELF-HOSTING |
| `api/team.js` | first admin needs `SETUP_TOKEN`; sends the brand with the state; new admin actions `saveBrand` and `applyPreset`; `logo` upload kind; accepts local `/media/` links; the original setup/migration import removed | REMOVE-GEZAT, SELF-HOSTING |
| `api/quotes.js` | company details come from Brand & region (saving them in the price list writes them back there); home currency from the brand; public `GET ?brand=1`; request notes use the site's own address and brand name; kick-off message points to `/team` | REMOVE-GEZAT |
| `api/_price-catalog.js` | company block removed (now Brand & region); `samplePrices: true`; governing-law clause uses `{{country}}` and `{{city}}` | REMOVE-GEZAT |
| `api/_team-lib.js` | review/leave year start comes from Settings → Leave (`setYearStart`) instead of a fixed 11 September; quarter labels drop "/27" for calendar years; migrations above removed; comments | REMOVE-GEZAT |
| `api/_team-notify.js` | greetings use the brand name; reminders use the brand's time zone instead of fixed UTC+3; holiday lists by preset (Ethiopia, International, none) plus custom days | REMOVE-GEZAT |
| `api/_team-config.js` | default holiday setting; wording | REMOVE-GEZAT |
| `api/_sales.js`, `api/_leads.js` | default sales owner is the first manager instead of a named person | REMOVE-GEZAT |
| `api/_push.js` | push contact from `VAPID_SUBJECT` instead of the original agency's email | REMOVE-GEZAT |
| `api/_team-seed.js` | comments only | REMOVE-GEZAT |
| `vercel.json` | merged with the portfolio's; the hourly cron moved to `server.js` (Vercel Hobby allows daily jobs only) | SELF-HOSTING |

## Browser changes

| File | Change | Tag |
| --- | --- | --- |
| `public/team/ui.js` | `brand()`, `brandName()`, `brandMark()`, `applyBrand()` (accent colours, title), `cur()` home currency, `brandZone()`; review quarters follow the configured year start | REMOVE-GEZAT |
| `public/team/app.js` | setup form asks for the setup key and also sets the Price Builder password; brand name and logo on the sign-in screens | REMOVE-GEZAT, SELF-HOSTING |
| `public/team/team.js` | new **Brand & region** and **Holidays** cards in Settings; leave year start month/day fields; texts no longer fixed to 11 September; placeholder email | REMOVE-GEZAT |
| `public/team/index.html`, `manifest.webmanifest`, `sw.js` | neutral names; Figtree instead of Söhne; logo from settings | REMOVE-GEZAT |
| `public/team/insights.js` | brand time zone instead of Addis Ababa; export prompt and file name use the brand; currency label | REMOVE-GEZAT |
| `public/team/leads.js` | phone country code from the brand; the "Get leads from Claude" prompt uses the brand's name, services, city and country | REMOVE-GEZAT |
| `public/team/sales.js`, `studio.js` | currency label from the brand; links use the site's own address; no named sales owner | REMOVE-GEZAT |
| `public/team/social.js`, `me.js`, `projects.js` | brand name instead of "Gezat" | REMOVE-GEZAT |
| `public/price/engine.js` | `setHomeCurrency()`, `homeCurrency()`, `currencyLabel()`; amounts print in the home currency; first theme renamed Classic | REMOVE-GEZAT |
| `public/price/builder.js` | password endpoint `/api/price-auth`; brand name, logo and accent; home-currency labels; site's own address in links; sample-prices banner; neutral placeholders | REMOVE-GEZAT, SELF-HOSTING |
| `public/price/proposal.html`, `proposal.js` | logo, name, footer contacts and "not found" contacts from the brand; theme id `classic`; Figtree; original agency's phone, emails and social link removed | REMOVE-GEZAT |
| `public/price/pdf.js` | letterhead logo/initial, name, website and accent colour from the brand; file names start with the brand name; "Amounts in <home currency>" | REMOVE-GEZAT |
| `public/price/deal.js` | fallbacks "the studio" / "the <name> team"; `{{country}}`, `{{city}}` | REMOVE-GEZAT |
| `public/price/index.html` | neutral title; Figtree; brand mark | REMOVE-GEZAT |

## Portfolio changes (this site, not the original code)

- Removed the earlier home-made `/studio` and `/proposal/<slug>` pages (`src/studio`,
  `src/proposal`) and their packages (`@supabase/supabase-js`, `jspdf`). The contact form
  still saves to Supabase.
- `package.json`: `@vercel/blob`, `web-push`, `npm start`.

## What the leftover-name search still finds (on purpose)

Searching the code for the original agency's names, people, phone and emails finds nothing.
These remain because they are generic or are the Ethiopia preset itself:

- `Africa/Addis_Ababa`, `251`, `Ethiopia`, `ETB`, 11 September and the Ethiopian holiday list
  in `api/_brand.js` and `api/_team-notify.js`: the **Ethiopia preset** values.
- `instagram`, `linkedin` in `api/_leads.js` and `public/team/leads.js`: the names of contact
  fields on a lead.
- Data keys `etb`, `totalEtb`, `'ETB'`: storage names kept so the maths is untouched; they mean
  "home currency".
- `gz_team`, `gz_session`, `gz-…` cookie and local-storage names: internal, never shown.
- "Addis Ababa", Instagram and LinkedIn in `index.html` and `content/site.json`: the
  portfolio owner's own location and profiles, not the original agency's.
