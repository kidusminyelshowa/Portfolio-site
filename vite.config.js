import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static hosts without rewrites (e.g. GitHub Pages) serve 404.html for unknown
// paths, so a copy of index.html keeps deep links like /work/eec working.
const spaFallback = () => ({
    name: 'spa-fallback',
    closeBundle() {
        const dist = resolve(import.meta.dirname, 'dist');
        copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
    },
});

export default defineConfig({
    plugins: [react(), spaFallback()],
    // Keep bundled files apart from the site's own /assets media folder
    build: { assetsDir: 'static' },
});
