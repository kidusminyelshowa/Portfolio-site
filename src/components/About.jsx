import { about, site } from '../content.js';

export default function About() {
    return (
        <section id="about" className="section about">
            <div className="about-grid">
                <div className="about-portrait">
                    <img src={site.avatar} alt="Illustrated portrait of Kidus" loading="lazy" />
                </div>
                <div className="about-text">
                    <h2 className="about-heading">{about.heading}</h2>
                    <p className="about-lead">{about.story}</p>
                    <p>{about.approach}</p>
                    {about.now.length > 0 && (
                        <div className="about-now">
                            <p className="about-now-label">Right now</p>
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
