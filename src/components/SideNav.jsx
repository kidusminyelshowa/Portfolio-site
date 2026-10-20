import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { site } from '../content.js';
import { navLinks } from './TopNav.jsx';

export default function SideNav() {
    const [infoOpen, setInfoOpen] = useState(false);
    const overlayRef = useRef(null);
    const buttonRef = useRef(null);

    // Close the info overlay on any click outside it
    useEffect(() => {
        if (!infoOpen) return undefined;
        const onClick = (e) => {
            if (!overlayRef.current.contains(e.target) && !buttonRef.current.contains(e.target)) {
                setInfoOpen(false);
            }
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, [infoOpen]);

    return (
        <>
            <nav className="side-navbar">
                <div className="nav-contact">
                    <div className="nav-location">{site.location}</div>
                    <a className="nav-email" href={`mailto:${site.email}`}>
                        {site.email}
                    </a>
                </div>
                <div className="nav-avatar">
                    <img src={site.avatar} alt="Avatar" className="avatar-img" width="45" height="45" />
                </div>
                <button
                    ref={buttonRef}
                    className="nav-info-btn"
                    aria-label="About Kidus"
                    aria-expanded={infoOpen}
                    aria-controls="info-overlay"
                    onClick={() => setInfoOpen((open) => !open)}
                >
                    <img src="/assets/img/Asset 3.svg" alt="Info icon" className="info-icon" />
                </button>
            </nav>

            <div ref={overlayRef} id="info-overlay" className={`info-overlay${infoOpen ? ' active' : ''}`}>
                <div className="info-overlay-content">
                    <img src={site.avatar} alt="" className="info-portrait" width="96" height="96" />
                    <p className="info-description">{site.bio}</p>
                    <nav className="info-nav" aria-label="Sections">
                        {navLinks.map((link) => (
                            <Link key={link.label} to={link.to} className="info-nav-link" onClick={() => setInfoOpen(false)}>
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="info-socials">
                        {site.socials.map((social) => (
                            <a
                                key={social.url}
                                href={social.url}
                                className="info-link"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {social.label}
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
