import { about, site } from '../content.js';
import SectionIntro from './SectionIntro.jsx';

export default function About() {
    return (
        <section id="about" className="section about">
            <SectionIntro label="About" />
            <div className="about-grid">
                <div className="about-portrait">
                    <img src={site.avatar} alt="Illustrated portrait of Kidus" loading="lazy" />
                </div>
                <div className="about-text">
                    <h3 className="about-heading">{about.heading}</h3>
                    <p className="about-lead">{about.story}</p>
                    <p>{about.approach}</p>
                    {about.now.length > 0 && (
                        <div className="about-now">
                            <span className="eyebrow">Currently</span>
                            <ul>
                                {about.now.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
