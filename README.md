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
- `content/projects/*.json` – one file per project (title, tags, cover, text, gallery). `order` sets its position and `featured: false` keeps a project off the home page (it still shows on the `/work` index).
- `public/assets/` – images and videos, served from `/assets/...`
- `src/` – React components and styles

Each project has its own URL, e.g. `/work/palace-museum`.
