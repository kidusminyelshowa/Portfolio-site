import { Link } from 'react-router-dom';
import { featuredProjects } from '../content.js';

export default function FeaturedWork() {
    return (
        <section id="featured-work" className="section featured-work">
            <div className="section-header">
                <h2 className="section-label">RECENT WORK</h2>
                <span className="header-subtitle"></span>
            </div>
            <div className="project-grid-wrapper">
                <div className="project-grid">
                    {featuredProjects.map((project, i) => (
                        <Link
                            key={project.slug}
                            to={`/work/${project.slug}`}
                            state={{ fromHome: true }}
                            className="project-item"
                            preventScrollReset
                        >
                            <div className={`project-card ${project.cardColor}-border`}>
                                <div className="project-image-container">
                                    <img
                                        src={project.cover}
                                        alt={project.title}
                                        className="project-image"
                                        loading={i === 0 ? 'eager' : 'lazy'}
                                        decoding="async"
                                        width="580"
                                        height="435"
                                    />
                                </div>
                            </div>
                            <div className="project-title-pill">
                                <span className="play-icon"></span>
                                <h3 className="project-title">{project.title}</h3>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
