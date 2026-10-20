import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { about, site } from '../content.js';

export default function Footer() {
    const { community } = about;
    const [notNow, setNotNow] = useState(false);
    // The inquiry page is already the contact form, so skip the prompt there
    const onContactPage = useLocation().pathname === '/contact';

    return (
        <footer id="contact" className="site-footer">
            {!onContactPage && (
                <div className="footer-contact">
                    <p className="footer-heading">{site.contactHeading}</p>
                    <div className="contact-answers">
                        <Link className="contact-answer is-yes" to="/contact">
                            {site.contactYes ?? 'Yes'}
                        </Link>
                        {!notNow && (
                            <button type="button" className="contact-answer" onClick={() => setNotNow(true)}>
                                {site.contactNo ?? 'Not now'}
                            </button>
                        )}
                    </div>
                    <p className="contact-reply" aria-live="polite">
                        {notNow && site.contactNoReply}
                    </p>
                    <a className="footer-email" href={`mailto:${site.email}`}>
                        {site.email}
                    </a>
                    <div className="footer-socials">
                        {site.socials.map((social) => (
                            <a key={social.url} href={social.url} className="info-link" target="_blank" rel="noopener noreferrer">
                                {social.label}
                            </a>
                        ))}
                    </div>
                </div>
            )}
            <div className="footer-notes">
                {site.availability && (
                    <p className="footer-note">
                        <span className="now-dot" aria-hidden="true"></span>
                        {site.availability}
                    </p>
                )}
                {community && (
                    <p className="footer-note">
                        {community.role} of{' '}
                        {community.url ? (
                            <a href={community.url} target="_blank" rel="noopener noreferrer">
                                {community.name}
                            </a>
                        ) : (
                            community.name
                        )}
                        , {community.summary}
                    </p>
                )}
                <p className="footer-copyright">{site.footer}</p>
            </div>
        </footer>
    );
}
