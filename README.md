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

### Signing in

Sign in with email and password. The first time (or after forgetting it), use "Forgot your password, or never set one?" to get an email link, open it on the same device and choose a password. You can change it later under Settings → Password.

The link only works when Supabase knows the site's address. In the **portfolio** Supabase project, open Authentication → URL Configuration, set **Site URL** to the live domain (e.g. `https://kidusminyel.xyz`) and add `https://kidusminyel.xyz/studio` under **Redirect URLs**. Supabase's built-in email sends only a few messages an hour, so if it says the limit was reached, wait a bit and try again.

To let another email in, add it (lowercase) to the `studio_owners` table in the Table Editor. Database changes live in `supabase/migrations/`.

