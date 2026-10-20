import { site } from '../content.js';

export default function Footer() {
    return (
        <footer className="site-footer">
            <div className="footer-copyright">{site.footer}</div>
        </footer>
    );
}
