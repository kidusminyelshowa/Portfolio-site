import { useEffect, useRef, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { formatIndex, getNeighbours, getProject, isVideo, projects, site } from '../content.js';

const defaultTitle = document.title;

function GalleryItem({ item }) {
    const [loaded, setLoaded] = useState(isVideo(item.src));
    const style = item.background ? { backgroundColor: item.background } : undefined;

    return (
        <figure className={`case-media${loaded ? ' loaded' : ''}`} style={style}>
            {isVideo(item.src) ? (
                <video src={item.src} autoPlay loop muted playsInline aria-label={item.alt || undefined} />
            ) : (
                <img
                    src={item.src}
                    alt={item.alt}
                    loading="lazy"
                    decoding="async"
                    ref={(img) => {
                        // Cached images can finish before onLoad is attached
                        if (img?.complete && !loaded) setLoaded(true);
                    }}
                    onLoad={() => setLoaded(true)}
                />
            )}
        </figure>
    );
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
    );
}

export default function ProjectModal() {
    const location = useLocation();
    const slug = matchPath('/work/:slug', location.pathname)?.params.slug;
    const navigate = useNavigate();
    const routeProject = slug ? getProject(slug) : null;
    const isOpen = Boolean(routeProject);

    // Keep the last project rendered while the modal fades out
    const [shown, setShown] = useState(routeProject);
    const [fading, setFading] = useState(false);
    const contentRef = useRef(null);

    useEffect(() => {
        if (routeProject) {
            setShown(routeProject);
            if (contentRef.current) {
                contentRef.current.scrollTop = 0;
                contentRef.current.focus({ preventScroll: true });
            }
        }
    }, [routeProject]);

    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        document.title = isOpen ? `${routeProject.title} – ${site.name}` : defaultTitle;
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen, routeProject]);

    const close = () => {
        // Return to the page underneath when we came from it, so Back still works as expected
        if (location.state?.background) navigate(-1);
        else navigate('/', { replace: true, preventScrollReset: true });
    };

    const goTo = (project) => {
        setFading(true);
        setTimeout(() => {
            navigate(`/work/${project.slug}`, { replace: true, state: location.state, preventScrollReset: true });
            setFading(false);
        }, 200);
    };

    const neighbours = shown ? getNeighbours(shown.slug) : null;

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowRight') goTo(neighbours.next);
            if (e.key === 'ArrowLeft') goTo(neighbours.prev);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    return (
        <div id="project-modal" className={`modal${isOpen ? ' active' : ''}`} aria-hidden={!isOpen}>
            <div className="modal-backdrop" onClick={close}></div>
            <div
                className="modal-content"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                <div className="modal-topbar">
                    <span className="modal-counter">
                        {neighbours && `${formatIndex(neighbours.index)} / ${formatIndex(projects.length - 1)}`}
                    </span>
                    <span className="modal-esc-hint">Esc to close · ← → to browse</span>
                    <button className="close-modal" aria-label="Close project" onClick={close}>
                        <CloseIcon />
                    </button>
                </div>

                {/* Scrolls under the top bar, with the scrollbar kept clear of the rounded corners */}
                <div className="modal-scroll" ref={contentRef} tabIndex={-1}>
                    {shown && (
                        <article className={`modal-body${fading ? ' fading' : ''}`}>
                            <header className="case-header">
                                <h2 id="modal-title" className="case-title">
                                    {shown.title}
                                </h2>
                                <ul className="case-tags">
                                    {shown.tags.map((tag) => (
                                        <li key={tag}>{tag}</li>
                                    ))}
                                </ul>
                            </header>

                            <div className="case-intro">
                                <p className="case-context">{shown.context}</p>
                                {(shown.approach || shown.outcome) && (
                                    <div className="case-details">
                                        {shown.approach && (
                                            <div className="case-detail">
                                                <h3 className="case-detail-label">Approach</h3>
                                                <p>{shown.approach}</p>
                                            </div>
                                        )}
                                        {shown.outcome && (
                                            <div className="case-detail">
                                                <h3 className="case-detail-label">Outcome</h3>
                                                <p>{shown.outcome}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="case-gallery">
                                {shown.gallery.map((item) => (
                                    <GalleryItem key={`${shown.slug}-${item.src}`} item={item} />
                                ))}
                            </div>

                            <nav className="case-nav" aria-label="More projects">
                                <button className="case-nav-link prev" onClick={() => goTo(neighbours.prev)}>
                                    <span className="case-nav-label">← Previous</span>
                                    <span className="case-nav-title">{neighbours.prev.title}</span>
                                </button>
                                <button className="case-nav-link next" onClick={() => goTo(neighbours.next)}>
                                    <span className="case-nav-label">Next →</span>
                                    <span className="case-nav-title">{neighbours.next.title}</span>
                                </button>
                            </nav>
                        </article>
                    )}
                </div>
            </div>
        </div>
    );
}
