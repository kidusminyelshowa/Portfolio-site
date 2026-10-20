import { about, site } from '../content.js';
import { ArrowIcon } from './Icons.jsx';
import SectionIntro from './SectionIntro.jsx';

export default function Services() {
    return (
        <section id="services" className="section services">
            <SectionIntro label="What I do" text={site.intros?.services} />
            <ul className="services-list">
                {about.disciplines.map((discipline, i) => (
                    <li key={discipline}>
                        <a href="#contact" className="service-row">
                            <span className="service-index">{String(i + 1).padStart(2, '0')}</span>
                            <span className="service-name">{discipline}</span>
                            <span className="service-circle" aria-hidden="true">
                                <ArrowIcon />
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
