import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { site } from '../content.js';
import { navLinks } from '../nav.js';

// The section currently under the middle of the screen, or the index page
function useActiveSection() {
    const location = useLocation();
    const page = location.state?.background || location;
    const [active, setActive] = useState(null);

    useEffect(() => {
        if (page.pathname === '/work') {
            setActive('index');
            return undefined;
        }
        const ids = navLinks.map((l) => l.id).filter((id) => id !== 'index');
        let frame = 0;
        const update = () => {
            frame = 0;
            const middle = window.innerHeight / 2;
            let current = null;
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top < middle) current = id;
            });
            setActive(current);
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', onScroll);
        };
    }, [page.pathname]);

    return active;
}

export default function SideNav() {
    const [infoOpen, setInfoOpen] = useState(false);
    const overlayRef = useRef(null);
    const buttonRef = useRef(null);
    const active = useActiveSection();

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
            <nav className="side-navbar" aria-label="Main">
                <div className="nav-contact">
                    <div className="nav-location">{site.location}</div>
                    <a className="nav-email" href={`mailto:${site.email}`}>
                        {site.email}
                    </a>
                </div>
                <div className="side-links">
                    {navLinks.map((link) => (
                        <Link
                            key={link.label}
                            to={link.to}
                            className="side-link"
                            aria-current={active === link.id ? 'true' : undefined}
                        >
                            {link.label}
                        </Link>
                    ))}
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
