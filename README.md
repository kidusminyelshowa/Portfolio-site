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

"Yes, let's talk" opens a step-by-step form at `/contact`. Submissions are saved to the `inquiries` table in the **portfolio** Supabase project (Table Editor → inquiries). Visitors can only add rows; use the `status` column (new, replied, in progress, won, lost, archived) and `notes` to track each one. The form's wording and options live under Site details → Inquiry form in the CMS.

## Studio (private tools)

`/studio` is a private area for running client work, hidden from search engines and only usable by emails listed in the `studio_owners` table (starts with `kidusminyel@gmail.com`).

- **Leads:** every contact-form inquiry, on a board from New to Won or Lost. Open a card to change its stage, add notes or reply, or drag it between columns. Add leads by hand or paste a list from a spreadsheet (first row: `name,email,company,message,budget,timeline`).
- **Settings:** business details, currency and VAT (Ethiopia and International presets), bank details, TIN, contract terms and invoice note. Proposals, contracts and invoices use these.

### One-time sign-in setup

Sign-in is a link sent by email through Supabase. In the **portfolio** Supabase project, open Authentication → URL Configuration:

1. Set **Site URL** to the live domain, e.g. `https://kidusminyel.xyz`.
2. Under **Redirect URLs**, add `https://kidusminyel.xyz/studio` (and `http://localhost:5173/studio` for local work).

To let another email in, add it (lowercase) to the `studio_owners` table in the Table Editor. Database changes live in `supabase/migrations/`.

