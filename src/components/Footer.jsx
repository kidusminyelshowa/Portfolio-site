import { site } from '../content.js';

export default function Footer() {
    return (
        <footer className="site-footer">
            <div className="footer-contact">
                <p className="footer-heading">{site.contactHeading}</p>
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
            <div className="footer-copyright">{site.footer}</div>
        </footer>
    );
}
