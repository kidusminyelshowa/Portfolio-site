import { isVideo, playground, site } from '../content.js';
import SectionIntro from './SectionIntro.jsx';

// Side work: type, lettering, sketches and motion tests, added through the CMS
export default function Playground() {
    if (playground.length === 0) return null;

    return (
        <section id="playground" className="section playground">
            <SectionIntro label="Playground" text={site.intros?.playground} />
            <div className="playground-grid">
                {playground.map((item) => (
                    <figure key={item.media} className="playground-item">
                        <div className="playground-media">
                            {isVideo(item.media) ? (
                                <video src={item.media} autoPlay loop muted playsInline aria-label={item.title} />
                            ) : (
                                <img src={item.media} alt={item.title} loading="lazy" decoding="async" />
                            )}
                        </div>
                        <figcaption>
                            <span className="playground-title">{item.title}</span>
                            {item.caption && <span className="playground-caption">{item.caption}</span>}
                        </figcaption>
                    </figure>
                ))}
            </div>
        </section>
    );
}
