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

## Set it up on Vercel (once, about 15 minutes)

1. **Two Blob stores.** Vercel → your project → Storage → Create → Blob.
   - Make one **private** store (for the team database, quotes, leads and settings). Copy its
     read-write token.
   - Make one **public** store (for profile photos, backgrounds and your logo). Copy its token.
2. **Environment variables.** Vercel → Settings → Environment Variables. Add:
   - `LEADS_BLOB_TOKEN`: the private store's token
   - `MEDIA_BLOB_TOKEN`: the public store's token
   - `SESSION_SECRET`: any long random text (32+ characters)
   - `SETUP_TOKEN`: a "setup key" of your choice (12+ characters). You type it once below.
   - `CRON_SECRET`: any random text; Vercel uses it for the daily jobs
   - Optional, for phone notifications: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (run
     `npx web-push generate-vapid-keys` once to get a pair) and `VAPID_SUBJECT`
     (e.g. `mailto:hello@kidusminyel.xyz`)
   Every name is listed with an explanation in [`.env.example`](../../.env.example).
3. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables apply.
4. **Create your account.** Open `https://<your-domain>/team`. Because nobody has signed up
   yet it shows **Set up**: enter the setup key, your name, email and a password. The same
   password also opens the Price Builder at `/price` (you can change either later).
   After this, setup is closed: nobody can create another first admin, even with the key.
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

### Scheduled jobs and the Vercel plan

| Job | When | What it does | Runs on |
| --- | --- | --- | --- |
| morning | daily 05:00 UTC | tasks due today, scheduled team messages, holidays and work anniversaries | Vercel (any plan) |
| evening | Mon–Sat 14:30 UTC | "clean sweep" achievements; on Fridays, zero-overdue weeks | Vercel (any plan) |
| hourly | every hour at :05 | due-date reminders (a day before, on the day, 6 h and 2 h before) | **self-hosting** or Vercel Pro |

Vercel's free Hobby plan only allows jobs that run once a day, so the hourly reminders are not
scheduled there. On Vercel Pro you can add `{ "path": "/api/cron?run=hourly", "schedule": "5 * * * *" }`
to `crons` in `vercel.json`. When self-hosting, `server.js` runs all three by itself.

## Self-hosting instead of Vercel

Needs Node 20+ (or Docker). Data is kept in a folder instead of Vercel Blob.

```bash
cp .env.example .env      # fill in SESSION_SECRET, SETUP_TOKEN, CRON_SECRET; set STORAGE=local
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
