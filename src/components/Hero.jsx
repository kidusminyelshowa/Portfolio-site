import { Fragment, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { site } from '../content.js';
import { usePlayInView } from '../hooks.js';

function HeroSquare({ square, onPointer, onLeave }) {
    const videoRef = useRef(null);
    usePlayInView(videoRef);

    const play = () => videoRef.current?.play().catch(() => {});
    const reset = () => {
        const video = videoRef.current;
        if (video) {
            video.pause();
            video.currentTime = 0;
        }
    };

    return (
        <div
            className={`square ${square.color}-square`}
            data-label={square.label}
            onMouseEnter={(e) => {
                onPointer(e, square);
                play();
            }}
            onMouseMove={(e) => onPointer(e, square)}
            onMouseLeave={() => {
                onLeave();
                reset();
            }}
            onTouchStart={(e) => {
                onPointer(e, square);
                play();
            }}
            onTouchMove={(e) => onPointer(e, square)}
            onTouchEnd={() => {
                onLeave();
                reset();
            }}
            onTouchCancel={onLeave}
        >
            <video ref={videoRef} src={square.video} loop muted playsInline preload="metadata" className="square-video" />
        </div>
    );
}

export default function Hero() {
    const [pill, setPill] = useState(null);

    const onPointer = (e, square) => {
        const point = e.touches ? e.touches[0] : e;
        if (!point) return;
        setPill({ label: square.label, color: square.color, x: point.clientX, y: point.clientY });
    };
    const onLeave = () => setPill((current) => current && { ...current, hidden: true });

    const taglineLines = site.tagline.split('\n');

    return (
        <section id="hero" className="section hero">
            <div className="hero-content">
                <h1 className="hero-title">{site.heroTitle}</h1>

                <div className="visual-blocks">
                    {site.heroSquares.map((square) => (
                        <HeroSquare key={square.label} square={square} onPointer={onPointer} onLeave={onLeave} />
                    ))}
                </div>

                <p className="hero-subtitle">
                    {taglineLines.map((line, i) => (
                        <Fragment key={i}>
                            {i > 0 && <br />}
                            {line}
                        </Fragment>
                    ))}
                </p>
            </div>

            {createPortal(
                <div
                    id="hero-floating-pill"
                    className={`hero-floating-pill${pill && !pill.hidden ? ` active ${pill.color}` : ''}`}
                    style={pill ? { left: pill.x, top: pill.y } : undefined}
                >
                    {pill?.label}
                </div>,
                document.body
            )}
        </section>
    );
}
