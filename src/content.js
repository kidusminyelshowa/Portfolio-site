import site from '../content/site.json';

// Each project is its own JSON file so the CMS can add, edit and remove them.
const projectModules = import.meta.glob('../content/projects/*.json', { eager: true, import: 'default' });

export const projects = Object.values(projectModules).sort((a, b) => a.order - b.order);
export const featuredProjects = projects.filter((p) => p.featured);
export const moreProjects = projects.filter((p) => !p.featured);
export const getProject = (slug) => projects.find((p) => p.slug === slug);

export const isVideo = (src) => src.toLowerCase().endsWith('.webm') || src.toLowerCase().endsWith('.mp4');

export { site };
