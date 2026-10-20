import { Fragment } from 'react';

// Words wrapped in *asterisks* get a highlight, so the CMS can mark them in plain text
export function highlight(text) {
    return text.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith('*') && part.endsWith('*') ? (
            <mark key={i}>{part.slice(1, -1)}</mark>
        ) : (
            <Fragment key={i}>{part}</Fragment>
        ),
    );
}

// The section name stays for screen readers; the intro sentence does the talking
export default function SectionIntro({ label, text, children }) {
    return (
        <div className="section-intro">
            <h2 className="visually-hidden">{label}</h2>
            {text && <p className="section-intro-text">{highlight(text)}</p>}
            {children}
        </div>
    );
}
