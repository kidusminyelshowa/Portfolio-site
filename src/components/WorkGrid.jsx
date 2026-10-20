import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { featuredProjects, formatIndex, projects, site } from '../content.js';
import { ArrowIcon } from './Icons.jsx';
import ProjectLink from './ProjectLink.jsx';
import SectionIntro from './SectionIntro.jsx';

// Cards stick and stack; each one sinks back a little as the next slides over it
function useStackDepth(listRef) {
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        const cards = [...listRef.current.children];
        let frame = 0;

        const update = () => {
            frame = 0;
            cards.forEach((card, i) => {
                const next = cards[i + 1];
                if (!next) return;
                const { top, height } = card.getBoundingClientRect();
                const gap = next.getBoundingClientRect().top - top;
                const depth = Math.min(Math.max(1 - gap / height, 0), 1);
                card.style.setProperty('--depth', depth.toFixed(3));
            });
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };

        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [listRef]);
}

export default function WorkGrid() {
    const listRef = useRef(null);
    const hiddenCount = projects.length - featuredProjects.length;
    useStackDepth(listRef);

    return (
        <section id="work" className="section work">
            <SectionIntro label="Selected work" text={site.intros?.work}>
                <Link to="/work" className="section-link">
                    Index ({String(projects.length).padStart(2, '0')})
                </Link>
            </SectionIntro>
            <ul className="work-stack" ref={listRef}>
                {featuredProjects.map((project, i) => (
                    <li key={project.slug} className="stack-item">
                        <ProjectLink slug={project.slug} className="stack-card">
                            <img src={project.cover} alt="" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                            <div className="stack-card-info">
                                <h3 className="stack-card-title">{project.title}</h3>
                                <ul className="stack-card-chips">
                                    <li className="is-index">{formatIndex(projects.indexOf(project))}</li>
                                    {project.tags.map((tag) => (
                                        <li key={tag}>{tag}</li>
                                    ))}
                                </ul>
                            </div>
                            <span className="stack-card-arrow" aria-hidden="true">
                                <ArrowIcon />
                            </span>
                        </ProjectLink>
                    </li>
                ))}
            </ul>
            <Link to="/work" className="work-more">
                {hiddenCount > 0 ? `See all ${projects.length} projects` : 'See the full index'} <ArrowIcon size={18} />
            </Link>
        </section>
    );
}
