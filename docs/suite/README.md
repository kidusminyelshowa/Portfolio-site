# Studio suite: Team app, Price Builder and client proposals

This site carries a white-label copy of a working agency's internal tools. Nothing here
needs coding to use. It has three parts:

| Address | What it is | Who uses it |
| --- | --- | --- |
| `/team` | **Team app**: tasks, projects, timeline, sales pipeline and leads, monthly and quarterly reviews, goals, milestones, skills, leave, insights, team messages, music. Installs on phones like an app. | You and your team (each with their own sign-in) |
| `/price` | **Price Builder**: quotes from your price list, client links, contract → invoice → kick-off, PDFs. | You (one admin password) |
| `/price/<link>` | **Client proposal**: the client switches options on and off, sees the price update, and sends a request. | Your clients (private link) |

Your name, logo, colours, contact and bank details, currency, time zone and holidays are
**settings**, not code: Team → Settings → **Brand & region**.

## Set it up on Vercel (once, about 5 minutes)

1. **Storage: one setting.** Everything is kept in your Supabase project (the same one the
   contact form uses; its table `suite_files` is already created). In Supabase → Project
   Settings → **API Keys**, copy the **secret key** (`sb_secret_…`; the older `service_role`
   key also works). In Vercel → Settings → Environment Variables, add it as
   `SUPABASE_SERVICE_ROLE_KEY` (all environments). Keep it secret: it is never sent to browsers.
2. **Setup key: one setting.** In the same place add `SETUP_TOKEN` with any phrase you make up
   (12+ characters). You type it once in step 4.
3. **Redeploy** (Deployments → ⋯ → Redeploy). Settings only reach deployments made after
   they were added.
4. **Create your account.** Open `https://<your-domain>/team`. It shows **Set up**: enter the
   setup key, your name, email and a password. The same password also opens the Price
   Builder at `/price`. After this, setup is closed for good.
5. **Brand & region.** Team → Settings → Brand & region. Fill in your name, logo, colours,
   email, phone, address, bank details and what you sell. Pick a region preset
   (**Ethiopia**: ETB, 15% VAT, review year from 11 September, Ethiopian holidays; or
   **International**: USD, no VAT, calendar year) and press **Apply region preset**.
   Every value the preset fills in stays editable.
6. **Prices.** `/price` → Price list. The starting list holds **sample prices** (a banner
   says so until you save). Change them to yours and press **Save price list**.
7. **Team.** Team → People → Add person for each manager, team member and creative partner.
   Or press "Load demo team" in Settings to try everything with fictional people first
   (and "Remove all demo people" afterwards).

If `/team` says "File storage is not working", the message says why: usually the key was
pasted wrong, or the deployment is older than the setting. Fix it and redeploy.

Using another Supabase project? Run
[`supabase/migrations/20261025120000_suite_files_storage.sql`](../../supabase/migrations/20261025120000_suite_files_storage.sql)
in its SQL editor once and add `SUPABASE_URL` (`https://<ref>.supabase.co`). Vercel Blob also
still works: leave `SUPABASE_SERVICE_ROLE_KEY` out and connect a private Blob store instead.

### Optional settings

| Setting | What it adds |
| --- | --- |
| `CRON_SECRET` (any random text) | turns on the daily jobs below on Vercel. Without it, everything works except those notifications. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | notifications on phones' lock screens. Run `npx web-push generate-vapid-keys` once for the pair; the subject is e.g. `mailto:hello@kidusminyel.xyz`. |
| `SESSION_SECRET` | your own signing key. Without it the server makes one and keeps it in storage. |
| `SUPABASE_URL` | only for a Supabase project other than the portfolio one. |

All of them are explained in [`.env.example`](../../.env.example).

### Scheduled jobs and the Vercel plan

| Job | When | What it does | Runs on |
| --- | --- | --- | --- |
| morning | daily 05:00 UTC | tasks due today, scheduled team messages, holidays and work anniversaries | Vercel (any plan, needs `CRON_SECRET`) |
| evening | Mon–Sat 14:30 UTC | "clean sweep" achievements; on Fridays, zero-overdue weeks | Vercel (any plan, needs `CRON_SECRET`) |
| hourly | every hour at :05 | due-date reminders (a day before, on the day, 6 h and 2 h before) | **self-hosting** or Vercel Pro |

Vercel's free Hobby plan only allows jobs that run once a day, so the hourly reminders are not
scheduled there. On Vercel Pro you can add `{ "path": "/api/cron?run=hourly", "schedule": "5 * * * *" }`
to `crons` in `vercel.json`. When self-hosting, `server.js` runs all three by itself.

## Self-hosting instead of Vercel

Needs Node 20+ (or Docker). Data is kept in a folder, or in Supabase if you set `SUPABASE_SERVICE_ROLE_KEY`.

```bash
cp .env.example .env      # set SETUP_TOKEN and STORAGE=local; nothing else is needed
npm ci && npm run build
npm start                 # http://localhost:3000
```

or with Docker: `docker compose up -d` (data lives in the `suite-data` volume).

Put it behind HTTPS (Caddy, nginx or a Cloudflare Tunnel). The sign-in cookies are marked
Secure, so browsers only keep them on `https://` addresses or on `localhost`.

Back up the data folder (or the Docker volume) regularly: it holds everything.

## More

- [ARCHITECTURE.md](ARCHITECTURE.md): how the pieces fit
- [OPERATIONS.md](OPERATIONS.md): backups, passwords, moving between Vercel and self-hosting
- [KNOWN-ISSUES.md](KNOWN-ISSUES.md)
- [CHANGES.md](CHANGES.md): every change made to the original code, and why
- [THIRD-PARTY.md](THIRD-PARTY.md)
- [TEST-RESULTS.md](TEST-RESULTS.md)
