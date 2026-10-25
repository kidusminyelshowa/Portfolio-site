# Test results

Run on 23 October 2026 against `server.js` with `STORAGE=local` and an **empty** data folder,
Chromium (Playwright) at 1440×900 and 375×812. Every line below was observed, not assumed.

## First run and security

| Check | Result |
| --- | --- |
| Fresh install: `/`, `/team`, `/price`, `/price/<slug>`, `/work`, `/api/team?state=1`, `/api/price-auth`, `/api/quotes?brand=1` | all 200, no crash; state says "not configured" |
| Setup with a wrong setup key | refused: "The setup key is wrong, or SETUP_TOKEN is not set on the server." (403) |
| Setup with the right key | admin created, signed in; Price Builder password set by the same form |
| Second setup (team and price), even with the key | refused (409) |
| `/api/cron?run=morning|evening|hourly` without the secret | 401 each |
| …with `Authorization: Bearer <CRON_SECRET>` | 200 each (morning sent 2 digests to the demo team) |

## Team app

| Check | Result |
| --- | --- |
| Brand & region: name, email, website, accent colour, Save brand | sidebar, sign-in, page title and accent colour changed at once |
| Load demo team | 10 people |
| Every screen (23 routes: dashboard, tasks, goals, milestones, skills, reviews, career, leave, timeline, music, overview, sales, people, projects, team tasks, insights, team reviews, team goals, leave requests, reports, approvals, messages, settings) at 1440 and 375 wide | no "Something broke", no sideways scrolling, no browser errors |
| Give a task → hand in → mark done with quality 4 | done, rated 4/5 |
| Monthly review saved | 200 |
| Import 2 leads (CSV rows) | 2 added, 0 skipped |
| Apply **International** preset | brand USD and UTC, review year from 1 January, international holidays, price list VAT off and home currency USD; brand name kept |
| Apply **Ethiopia** preset again | ETB, year from 11 September, quarter id back to Y2026-Q1 |

## Price Builder and client

| Check | Result |
| --- | --- |
| Sign in at `/price` with the setup password | brand name in the header and tab title |
| Price list | "SAMPLE prices" banner shown |
| New quote: client, company, project, type Branding, tick a category, Review & send, Generate client link | link created |
| Client page `/price/<slug>` at 1440 and 375 (no sign-in) | brand name, logo initial, footer email and website from Brand & region; no sideways scrolling |
| Unknown link | "We couldn't find this proposal… write to hello@kidusminyel.xyz" |
| Client switches an item off and sends a request | request shows on the quote with the changed scope |
| Create contract from the request, save | CTR-2026-001 |
| Contract PDF, proposal PDF, invoice PDF | downloaded (9.4 KB, 6.6 KB, 5.8 KB), named "Kidus-Studio-…"; text checked: brand name, email, website, "ETB"; no original-agency names; governing law "laws of Ethiopia… courts of the city where the studio is registered" |
| Mark contract signed → deposit invoice (46,000 ETB) → mark paid | INV-2026-0001 paid |
| Kick off project | project "Brand identity" in Team with 4 planned tasks, status "plan in review" |
| Start the project in Team | 4 tasks created |
| Sales pipeline | lists the proposals |

## Found and fixed during testing

- Brand settings showed the word "null" next to the logo button when no logo was set.
- The invoice form and two PDF lines still said "ETB" instead of the home currency.

## Supabase storage (25 October)

| Check | Result |
| --- | --- |
| `suite_put` / `suite_get` on the real portfolio database (in a transaction that was rolled back) | save and read back the same text and etag; save with the current etag works; save with an old etag refused (`precondition_failed`); no-overwrite save of an existing file refused (`already_exists`); etag on a missing file refused |
| Table and functions with the public keys | anon cannot read the table or call `suite_get`; signed-in users cannot call `suite_put`; only the secret key can |
| Whole app with `SUPABASE_SERVICE_ROLE_KEY` set, against a local stand-in for Supabase's REST API with the same rules | 22 of 22: fresh install empty, wrong setup key refused, setup, Price Builder setup, both sign-ins, preset save, leads import, price list, quotes list, photo upload and read back byte for byte, documents not readable through `/media`, photo saved to profile, all three crons, second setup refused |
| 8 saves to the team database at the same moment | all 8 succeed and all 8 changes are kept |
| Wrong secret key / Supabase unreachable | clear message: "File storage is not working (… the secret key was refused …)" |
| Local-folder mode, same 22 checks | 22 of 22 |

Not tested: the app against the real Supabase REST API with the secret key (the key is not
available here). Check after the first deploy: setup at `/team`, then upload a profile photo.

## Not tested here

- **Vercel Blob** (needs the real tokens): the same code path as before the port, behind
  `api/_storage.js`. Check after the first deploy (sign-up, upload a profile photo).
- **Docker image**: the sandbox has no Docker daemon. The Dockerfile runs the same
  `npm ci`, `npm run build` and `node server.js` steps that were tested directly.
- **Push notifications to a real phone** (needs VAPID keys and a device).
- **jsPDF from the CDN**: the sandbox cannot reach the CDN, so the test served the identical
  npm release (same integrity hash) to the browser.

## UI/UX pass (25 October)

Full results, with before/after screenshots, are in UX-RESULTS.md. In short: every role at
1440 and 375 has no page errors, no sideways scrolling, AA text contrast and visible keyboard
focus; two very different brands re-theme the Team app, the proposal and the PDFs; the 22 checks
above pass again on a fresh install; and the quote → request → contract → invoice → kick-off →
Team project flow passes with the new timeline. The 375 px sideways scrolling in the Price
Builder's price list and contract editor is fixed.
