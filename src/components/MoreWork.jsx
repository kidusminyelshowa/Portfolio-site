import { useRef, useState } from 'react';
import { isVideo, moreProjects } from '../content.js';
import { usePlayInView } from '../hooks.js';

function WorkBlock({ item }) {
    const videoRef = useRef(null);
    usePlayInView(videoRef);

    return (
        <div className="work-block">
            {isVideo(item.src) ? (
                <video ref={videoRef} src={item.src} loop muted playsInline preload="metadata" className="lazy-video" />
            ) : (
                <img src={item.src} alt={item.alt} loading="lazy" />
            )}
        </div>
    );
}

function WorkItem({ project, active, noHover, onToggle, onMouseLeave }) {
    const [before, after] = project.hoverImages;
    const className = ['work-item', active && 'active', noHover && 'no-hover'].filter(Boolean).join(' ');

    return (
        <div className={className} onClick={onToggle} onMouseLeave={onMouseLeave}>
            <div className="work-item-header">
                <h3 className="work-title">{project.title}</h3>
                <p className="work-desc">{project.summary}</p>
            </div>
            {before && (
                <div className="work-hover-card hover-before">
                    <img src={before.src} alt={before.alt} loading="lazy" width="155" height="180" />
                </div>
            )}
            {after && (
                <div className="work-hover-card hover-after">
                    <img src={after.src} alt={after.alt} loading="lazy" width="155" height="180" />
                </div>
            )}
            <div className="work-item-content">
                <div className="work-visual-grid">
                    {project.gallery.slice(0, 4).map((item) => (
                        <WorkBlock key={item.src} item={item} />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function MoreWork() {
    const [activeSlug, setActiveSlug] = useState(null);
    // Items just closed suppress their hover cards until the mouse leaves
    const [noHover, setNoHover] = useState(() => new Set());

    const toggle = (slug) => {
        if (activeSlug) setNoHover((set) => new Set(set).add(activeSlug));
        if (activeSlug === slug) {
            setActiveSlug(null);
        } else {
            setActiveSlug(slug);
            setNoHover((set) => {
                const next = new Set(set);
                next.delete(slug);
                return next;
            });
        }
    };

    const clearNoHover = (slug) =>
        setNoHover((set) => {
            if (!set.has(slug)) return set;
            const next = new Set(set);
            next.delete(slug);
            return next;
        });

    if (moreProjects.length === 0) return null;

    return (
        <section id="more-work" className="section more-work">
            <div className="section-header">
                <h2 className="section-label">MORE WORK</h2>
            </div>
            <div className="work-list">
                {moreProjects.map((project) => (
                    <WorkItem
                        key={project.slug}
                        project={project}
                        active={activeSlug === project.slug}
                        noHover={noHover.has(project.slug)}
                        onToggle={() => toggle(project.slug)}
                        onMouseLeave={() => clearNoHover(project.slug)}
                    />
                ))}
            </div>
        </section>
    );
}
