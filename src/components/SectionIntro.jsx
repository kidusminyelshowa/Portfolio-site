import { Fragment } from 'react';

// Words wrapped in *asterisks* get a highlight, so the CMS can mark them in plain text
function highlight(text) {
    return text.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith('*') && part.endsWith('*') ? (
            <mark key={i}>{part.slice(1, -1)}</mark>
        ) : (
            <Fragment key={i}>{part}</Fragment>
        ),
    );
}

export default function SectionIntro({ label, text, children }) {
    return (
        <div className="section-intro">
            <div className="section-intro-top">
                <h2 className="chip">
                    <span className="chip-dot" aria-hidden="true"></span>
                    {label}
                </h2>
                {children}
            </div>
            {text && <p className="section-intro-text">{highlight(text)}</p>}
        </div>
    );
}
