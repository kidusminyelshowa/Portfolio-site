import { Link } from 'react-router-dom';
import { about, projects, site } from '../content.js';
import { ArrowIcon } from './Icons.jsx';
import SectionIntro from './SectionIntro.jsx';

// Each service opens the index filtered to the projects that used it
export default function Services() {
    return (
        <section id="services" className="section services">
            <SectionIntro label="What I do" text={site.intros?.services} />
            <ul className="services-list">
                {about.disciplines.map((discipline, i) => {
                    const count = projects.filter((p) => p.services?.includes(discipline)).length;
                    return (
                        <li key={discipline}>
                            <Link to={`/work?service=${encodeURIComponent(discipline)}`} className="service-row">
                                <span className="service-index">{String(i + 1).padStart(2, '0')}</span>
                                <span className="service-name">{discipline}</span>
                                <span className="service-count">
                                    {count} {count === 1 ? 'project' : 'projects'}
                                </span>
                                <span className="service-circle" aria-hidden="true">
                                    <ArrowIcon />
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
