import { Link } from 'react-router-dom';
import { featuredProjects, formatIndex, projects } from '../content.js';
import { ArrowIcon } from './Icons.jsx';
import ProjectLink from './ProjectLink.jsx';

export default function WorkGrid() {
    const hiddenCount = projects.length - featuredProjects.length;

    return (
        <section id="work" className="section work">
            <div className="section-header">
                <h2 className="section-label">Selected Work</h2>
                <Link to="/work" className="section-link">
                    Index ({String(projects.length).padStart(2, '0')})
                </Link>
            </div>
            <div className="work-grid">
                {featuredProjects.map((project, i) => (
                    <ProjectLink key={project.slug} slug={project.slug} className="work-card">
                        <div className="work-card-media">
                            <img src={project.cover} alt="" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                        </div>
                        <div className="work-card-info">
                            <span className="work-card-index">{formatIndex(projects.indexOf(project))}</span>
                            <div className="work-card-text">
                                <h3 className="work-card-title">{project.title}</h3>
                                <p className="work-card-tags">{project.tags.join(' · ')}</p>
                            </div>
                            <span className="work-card-arrow">
                                <ArrowIcon />
                            </span>
                        </div>
                    </ProjectLink>
                ))}
            </div>
            {hiddenCount > 0 && (
                <Link to="/work" className="work-more">
                    See all {projects.length} projects <ArrowIcon size={18} />
                </Link>
            )}
        </section>
    );
}
