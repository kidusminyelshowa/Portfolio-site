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
- `content/projects/*.json` – one file per project (title, cover, text, gallery). Set `featured: true` to show it under Recent Work; `order` sets its position.
- `public/assets/` – images and videos, served from `/assets/...`
- `src/` – React components and styles

Each featured project has its own URL, e.g. `/work/palace-museum`.
