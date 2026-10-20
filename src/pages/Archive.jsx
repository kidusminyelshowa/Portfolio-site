import { useEffect, useState } from 'react';
import { formatIndex, projects, projectTags, site } from '../content.js';
import { ArrowIcon } from '../components/Icons.jsx';
import ProjectLink from '../components/ProjectLink.jsx';

export default function Archive() {
    const [tag, setTag] = useState(null);
    const shown = tag ? projects.filter((p) => p.tags.includes(tag)) : projects;

    useEffect(() => {
        const previous = document.title;
        document.title = `Index – ${site.name}`;
        return () => {
            document.title = previous;
        };
    }, []);

    return (
        <section className="section archive">
            <div className="archive-header">
                <h1 className="archive-title">Index</h1>
                <p className="archive-intro">Every project in one list. Filter by discipline to find what you're after.</p>
            </div>

            <div className="archive-filters" role="group" aria-label="Filter by discipline">
                <button className="filter-chip" aria-pressed={tag === null} onClick={() => setTag(null)}>
                    All ({projects.length})
                </button>
                {projectTags.map((t) => (
                    <button key={t} className="filter-chip" aria-pressed={tag === t} onClick={() => setTag(t)}>
                        {t}
                    </button>
                ))}
            </div>

            <ul className="archive-list">
                {shown.map((project) => (
                    <li key={project.slug}>
                        <ProjectLink slug={project.slug} className="archive-row">
                            <span className="archive-index">{formatIndex(projects.indexOf(project))}</span>
                            <span className="archive-thumb">
                                <img src={project.cover} alt="" loading="lazy" decoding="async" />
                            </span>
                            <span className="archive-name">{project.title}</span>
                            <span className="archive-tags">{project.tags.join(' · ')}</span>
                            <span className="work-card-arrow">
                                <ArrowIcon />
                            </span>
                        </ProjectLink>
                    </li>
                ))}
            </ul>
        </section>
    );
}
