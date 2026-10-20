import { useState } from 'react';
import { about, site } from '../content.js';

export default function Footer() {
    const { community } = about;
    const [notNow, setNotNow] = useState(false);

    return (
        <footer id="contact" className="site-footer">
            <div className="footer-contact">
                <p className="footer-heading">{site.contactHeading}</p>
                <div className="contact-answers">
                    <a className="contact-answer is-yes" href={`mailto:${site.email}`}>
                        {site.contactYes ?? 'Yes'}
                    </a>
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
