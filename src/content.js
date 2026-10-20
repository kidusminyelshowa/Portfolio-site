import site from '../content/site.json';

// Each project is its own JSON file so the CMS can add, edit and remove them.
const projectModules = import.meta.glob('../content/projects/*.json', { eager: true, import: 'default' });

export const projects = Object.values(projectModules).sort((a, b) => a.order - b.order);
export const getProject = (slug) => projects.find((p) => p.slug === slug);

// Previous and next project, wrapping around the list
export const getNeighbours = (slug) => {
    const index = projects.findIndex((p) => p.slug === slug);
    const count = projects.length;
    return {
        index,
        prev: projects[(index - 1 + count) % count],
        next: projects[(index + 1) % count],
    };
};

export const isVideo = (src) => src.toLowerCase().endsWith('.webm') || src.toLowerCase().endsWith('.mp4');

export const formatIndex = (index) => String(index + 1).padStart(2, '0');

export { site };
