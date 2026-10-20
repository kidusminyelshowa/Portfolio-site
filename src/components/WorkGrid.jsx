import { Link } from 'react-router-dom';
import { formatIndex, projects } from '../content.js';

function ArrowIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function WorkGrid() {
    return (
        <section id="work" className="section work">
            <div className="section-header">
                <h2 className="section-label">Selected Work</h2>
                <span className="section-count">({String(projects.length).padStart(2, '0')})</span>
            </div>
            <div className="work-grid">
                {projects.map((project, i) => (
                    <Link
                        key={project.slug}
                        to={`/work/${project.slug}`}
                        state={{ fromHome: true }}
                        preventScrollReset
                        className="work-card"
                    >
                        <div className="work-card-media">
                            <img
                                src={project.cover}
                                alt=""
                                loading={i < 2 ? 'eager' : 'lazy'}
                                decoding="async"
                            />
                        </div>
                        <div className="work-card-info">
                            <span className="work-card-index">{formatIndex(i)}</span>
                            <div className="work-card-text">
                                <h3 className="work-card-title">{project.title}</h3>
                                <p className="work-card-tags">{project.tags.join(' · ')}</p>
                            </div>
                            <span className="work-card-arrow">
                                <ArrowIcon />
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
