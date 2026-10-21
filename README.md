# Kidus Minyelshowa – Portfolio

Built with [Vite](https://vite.dev) and React.

## Run locally

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
```

## Where things live

- `content/site.json` – name, tagline, availability, short bio, contact details, socials, hero videos
- `content/about.json` – About story, how I work, disciplines, Hager Beqel and the Now list
- `content/playground/*.json` – side work (title, caption, media, order); the section appears once there's at least one
- `content/projects/*.json` – one file per project (title, tags, services, cover, text, gallery, plus optional client, year, role, team, results and story sections). `order` sets its position and `featured: false` keeps a project off the home page (it still shows on the `/work` index).
- `public/assets/` – images and videos, served from `/assets/...`
- `src/` – React components and styles

Each project has its own URL, e.g. `/work/palace-museum`.

## Content manager (Decap CMS)

Edit everything at `/admin` on the live site. Saving commits the change to `main`, and Vercel redeploys within a minute or two. Uploaded images and videos go to `public/assets/uploads/`.

### One-time sign-in setup

1. On GitHub, go to Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage URL: your live site, e.g. `https://kidusminyel.gu.cc`
   - Authorization callback URL: the same domain plus `/api/callback`, e.g. `https://kidusminyel.gu.cc/api/callback`
2. Copy the Client ID, then generate a client secret.
3. In Vercel, open the project → Settings → Environment Variables and add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, then redeploy.
4. Visit `/admin` on that same domain and sign in with GitHub.

Sign-in only works on the domain the callback URL points to; preview deployments can't sign in.

### Editing locally

Run `npx decap-server` in one terminal and `npm run dev` in another, add `local_backend: true` to the top of `public/admin/config.yml` (don't commit it), and open `http://localhost:5173/admin/`. Changes write straight to the files in `content/`.

## Inquiries

"Yes, let's talk" opens a step-by-step form at `/contact`. Submissions are saved to the `inquiries` table in the **portfolio** Supabase project and show up as leads in the studio. The form's wording and options live under Site details → Inquiry form in the CMS.

## Studio (private tools)

`/studio` is a private area for running client work, hidden from search engines and only usable by emails listed in the `studio_owners` table.

- **Today:** what needs you (overdue invoices, change requests, proposals to follow up, leads waiting on a reply or gone quiet, late tasks, projects due soon), your key numbers, and a getting-set-up checklist until it's done.
- **Leads:** every contact-form inquiry, on a board from New to Won or Lost. Open a card to change its stage, add notes, reply or write a proposal, or drag it between columns. Add leads by hand or paste a list from a spreadsheet (first row: `name,email,company,message,budget,timeline`).
- **Prices:** your services and what you charge. The starting list is marked as samples until you save your own.
- **Proposals:** build a quote from your prices, send the client a private link (`/proposal/...`) where they can accept or ask for changes, and download a PDF.
- **Next steps** (on an accepted proposal): create a numbered contract from your terms and mark it signed, raise a deposit and balance invoice (or one for the full amount) and mark them paid, then start the project. Contracts and invoices download as PDFs.
- **Invoices:** everything you've billed, what's still waiting to be paid and what's overdue.
- **Projects:** work you've started, with its status, due date and a task board (To do, Doing, Done). New projects start with five kick-off tasks you can edit.
- **Settings:** business details, currency and VAT (Ethiopia and International presets), bank details, TIN, contract terms and invoice note. Proposals, contracts and invoices use these.

### Daily email

Every morning at 08:00 Addis Ababa time, Vercel runs `api/daily-check.js` and emails the Today list to hello@kidusminyel.xyz through Resend (nothing is sent on a quiet day). It needs these in Vercel → Settings → Environment Variables:

- `CRON_SECRET`: any long random string. Vercel sends it with the scheduled call so nobody else can trigger it.
- `SUPABASE_SECRET_KEY`: a secret key from Supabase → Project Settings → API Keys. It reads the studio tables, so keep it only in Vercel.
- `RESEND_API_KEY`: from Resend, with kidusminyel.xyz verified as a sending domain.
- Optional: `DAILY_EMAIL_TO` and `DAILY_EMAIL_FROM` to change the addresses.

### Signing in

Sign in with email and password. The first time (or after forgetting it), use "Forgot your password, or never set one?" to get an email link, open it on the same device and choose a password. You can change it later under Settings → Password.

The link only works when Supabase knows the site's address. In the **portfolio** Supabase project, open Authentication → URL Configuration, set **Site URL** to the live domain (e.g. `https://kidusminyel.xyz`) and add `https://kidusminyel.xyz/studio` under **Redirect URLs**. Supabase's built-in email sends only a few messages an hour, so if it says the limit was reached, wait a bit and try again.

To let another email in, add it (lowercase) to the `studio_owners` table in the Table Editor. Database changes live in `supabase/migrations/`.
