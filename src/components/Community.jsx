import { about } from '../content.js';
import { ArrowIcon } from './Icons.jsx';

export default function Community() {
    const { community, now } = about;

    return (
        <section id="community" className="section community">
            <div className="community-grid">
                <article className="community-card">
                    <span className="eyebrow">{community.role}</span>
                    <h3 className="community-name">{community.name}</h3>
                    <p>{community.description}</p>
                    {community.highlight && <p className="community-highlight">{community.highlight}</p>}
                    {community.url && (
                        <a href={community.url} className="community-link" target="_blank" rel="noopener noreferrer">
                            Visit {community.name} <ArrowIcon size={18} />
                        </a>
                    )}
                </article>
                <article className="now-card">
                    <span className="eyebrow">
                        <span className="now-dot" aria-hidden="true"></span>Now
                    </span>
                    <ul className="now-list">
                        {now.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </article>
            </div>
        </section>
    );
}
