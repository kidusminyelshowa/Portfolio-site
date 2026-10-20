import site from '../content/site.json';
import about from '../content/about.json';

// Each project and playground piece is its own JSON file so the CMS can add, edit and remove them.
const projectModules = import.meta.glob('../content/projects/*.json', { eager: true, import: 'default' });
const playgroundModules = import.meta.glob('../content/playground/*.json', { eager: true, import: 'default' });

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

export const projects = Object.values(projectModules).sort(byOrder);
export const featuredProjects = projects.filter((p) => p.featured !== false);
export const playground = Object.values(playgroundModules).sort(byOrder);
export const projectTags = [...new Set(projects.flatMap((p) => p.tags))];

export const getProject = (slug) => projects.find((p) => p.slug === slug);

// Previous and next project, wrapping around the full list
export const getNeighbours = (slug) => {
    const index = projects.findIndex((p) => p.slug === slug);
    const count = projects.length;
    return {
        index,
        prev: projects[(index - 1 + count) % count],
        next: projects[(index + 1) % count],
    };
};

export const isVideo = (src) => /\.(webm|mp4)$/i.test(src);

export const formatIndex = (index) => String(index + 1).padStart(2, '0');

export { site, about };
