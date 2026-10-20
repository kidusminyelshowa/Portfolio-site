import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { about, formatIndex, projects, site } from '../content.js';
import { ArrowIcon } from '../components/Icons.jsx';
import ProjectLink from '../components/ProjectLink.jsx';

const services = about.disciplines.filter((d) => projects.some((p) => p.services?.includes(d)));

export default function Archive() {
    // The filter lives in the URL, so a service on the home page can link straight to it
    const [params, setParams] = useSearchParams();
    const service = params.get('service');
    const shown = service ? projects.filter((p) => p.services?.includes(service)) : projects;
    const setService = (value) => setParams(value ? { service: value } : {}, { replace: true });

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
                <p className="archive-intro">Every project in one list. Filter by service to find what you're after.</p>
            </div>

            <div className="archive-filters" role="group" aria-label="Filter by service">
                <button className="filter-chip" aria-pressed={!service} onClick={() => setService(null)}>
                    All ({projects.length})
                </button>
                {services.map((s) => (
                    <button key={s} className="filter-chip" aria-pressed={service === s} onClick={() => setService(s)}>
                        {s}
                    </button>
                ))}
            </div>

            {shown.length === 0 && <p className="archive-empty">Nothing here yet. Say hello if you've got one in mind.</p>}

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
                            <span className="archive-arrow">
                                <ArrowIcon />
                            </span>
                        </ProjectLink>
                    </li>
                ))}
            </ul>
        </section>
    );
}
