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

- `content/site.json` – name, tagline, bio, contact details, socials, hero videos
- `content/projects/*.json` – one file per project (title, tags, cover, text, gallery). `order` sets its position; the first project gets the large card.
- `public/assets/` – images and videos, served from `/assets/...`
- `src/` – React components and styles

Each project has its own URL, e.g. `/work/palace-museum`.
