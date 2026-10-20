import { Link } from 'react-router-dom';
import { playground } from '../content.js';

export const navLinks = [
    { label: 'Work', to: '/#work' },
    { label: 'Services', to: '/#services' },
    { label: 'About', to: '/#about' },
    ...(playground.length > 0 ? [{ label: 'Playground', to: '/#playground' }] : []),
    { label: 'Index', to: '/work' },
    { label: 'Contact', to: '#contact' },
];

export default function TopNav() {
    return (
        <nav className="top-nav" aria-label="Main">
            {navLinks.map((link) => (
                <Link key={link.label} to={link.to} className="top-nav-link">
                    {link.label}
                </Link>
            ))}
        </nav>
    );
}
