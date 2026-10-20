import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { featuredProjects, getProject, isVideo } from '../content.js';

function GalleryBlock({ item, index }) {
    const [loaded, setLoaded] = useState(isVideo(item.src));
    const style = item.background ? { backgroundColor: item.background } : undefined;

    if (isVideo(item.src)) {
        return (
            <div className={`bento-block block-${index + 1} loaded`} style={{ ...style, overflow: 'hidden', position: 'relative' }}>
                <video
                    src={item.src}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        pointerEvents: 'none',
                    }}
                />
            </div>
        );
    }

    return (
        <div className={`bento-block block-${index + 1}${loaded ? ' loaded' : ''}`} style={style}>
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
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
        </div>
    );
}

export default function ProjectModal() {
    const { slug } = useParams();
    const location = useLocation();
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
            if (contentRef.current) contentRef.current.scrollTop = 0;
        }
    }, [routeProject]);

    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        document.title = isOpen ? `${routeProject.title} – Kidus' Portfolio` : "Kidus' Portfolio";
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen, routeProject]);

    const close = () => {
        // Return to the page underneath when we came from it, so Back still works as expected
        if (location.state?.fromHome) navigate(-1);
        else navigate('/', { replace: true, preventScrollReset: true });
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const goNext = () => {
        const index = featuredProjects.findIndex((p) => p.slug === shown.slug);
        const next = featuredProjects[(index + 1) % featuredProjects.length];
        setFading(true);
        setTimeout(() => {
            navigate(`/work/${next.slug}`, { replace: true, state: location.state, preventScrollReset: true });
            setFading(false);
        }, 250);
    };

    return (
        <div id="project-modal" className={`modal${isOpen ? ' active' : ''}`}>
            <div className="modal-backdrop" onClick={close}></div>
            <div className="modal-esc-hint">Press Esc to go back</div>
            <button className="close-modal" aria-label="Close modal" onClick={close}>
                <img src="/assets/img/Asset 5.svg" alt="Close icon" className="close-icon" />
            </button>
            <div className="modal-content" ref={contentRef}>
                <div className="modal-body" style={{ opacity: fading ? 0 : 1 }}>
                    <h2 id="modal-title" className="modal-project-title">{shown?.title}</h2>
                    <p id="modal-statement" className="modal-statement">{shown?.context}</p>
                    <div className="modal-visuals-container">
                        <div className="modal-visuals" id="modal-visuals">
                            {shown?.gallery.map((item, index) => (
                                <GalleryBlock key={`${shown.slug}-${item.src}`} item={item} index={index} />
                            ))}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button id="next-project-btn" className="next-project-btn" onClick={goNext}>
                            NEXT PROJECT
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
