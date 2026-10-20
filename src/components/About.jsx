import { about, site } from '../content.js';

export default function About() {
    return (
        <section id="about" className="section about">
            <div className="section-header">
                <h2 className="section-label">About</h2>
            </div>
            <div className="about-grid">
                <div className="about-portrait">
                    <img src={site.avatar} alt="Illustrated portrait of Kidus" loading="lazy" />
                </div>
                <div className="about-text">
                    <h3 className="about-heading">{about.heading}</h3>
                    <p className="about-lead">{about.story}</p>
                    <p>{about.approach}</p>
                    <ul className="pill-list" aria-label="What I do">
                        {about.disciplines.map((discipline) => (
                            <li key={discipline}>{discipline}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}
