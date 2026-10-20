import { playground } from './content.js';

export const navLinks = [
    { label: 'Work', to: '/#work', id: 'work' },
    { label: 'Services', to: '/#services', id: 'services' },
    { label: 'About', to: '/#about', id: 'about' },
    ...(playground.length > 0 ? [{ label: 'Playground', to: '/#playground', id: 'playground' }] : []),
    { label: 'Index', to: '/work', id: 'index' },
    { label: 'Contact', to: '#contact', id: 'contact' },
];
