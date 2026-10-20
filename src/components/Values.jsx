import { site } from '../content.js';

// A band of the things I work by, scrolling past like a ticker
export default function Values() {
    const values = site.values ?? [];
    if (values.length === 0) return null;

    const row = (hidden) => (
        <ul className="values-row" aria-hidden={hidden || undefined}>
            {values.map((value) => (
                <li key={value}>
                    {value}
                    <span className="values-mark" aria-hidden="true"></span>
                </li>
            ))}
        </ul>
    );

    return (
        <section className="values" aria-label="How I work">
            <div className="values-track">
                {row(false)}
                {row(true)}
            </div>
        </section>
    );
}
