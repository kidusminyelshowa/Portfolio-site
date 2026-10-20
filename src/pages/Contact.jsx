import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowIcon } from '../components/Icons.jsx';
import { site } from '../content.js';
import { submitInquiry } from '../inquiry.js';

const copy = site.inquiry;

const emptyInquiry = { projectTypes: [], message: '', company: '', timeline: '', budget: '', name: '', email: '', website: '' };

// One question per screen; steps with no options in the CMS are skipped
const steps = [
    {
        key: 'type',
        question: 'What are we making?',
        hint: 'Pick as many as fit.',
        valid: (d) => d.projectTypes.length > 0,
    },
    {
        key: 'brief',
        question: 'Tell me about it.',
        hint: "What it is, who it's for, and where you're at.",
        valid: (d) => d.message.trim().length >= 10,
    },
    copy.timelines?.length > 0 || copy.budgets?.length > 0
        ? { key: 'plan', question: 'When, and roughly how much?', hint: 'Best guesses are fine.', valid: () => true }
        : null,
    {
        key: 'contact',
        question: 'Who should I reply to?',
        hint: null,
        valid: (d) => d.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()),
    },
].filter(Boolean);

function Choices({ options, selected, onToggle, multiple, label }) {
    return (
        <div className="inquiry-choices" role="group" aria-label={label}>
            {options.map((option) => {
                const active = multiple ? selected.includes(option) : selected === option;
                return (
                    <button key={option} type="button" className="inquiry-choice" aria-pressed={active} onClick={() => onToggle(option)}>
                        {option}
                    </button>
                );
            })}
        </div>
    );
}

export default function Contact() {
    const [data, setData] = useState(emptyInquiry);
    const [index, setIndex] = useState(0);
    const [status, setStatus] = useState('idle');
    const questionRef = useRef(null);
    const step = steps[index];
    const isLast = index === steps.length - 1;

    useEffect(() => {
        const previous = document.title;
        document.title = `Start a project – ${site.name}`;
        return () => {
            document.title = previous;
        };
    }, []);

    // Move focus to each new question so keyboard and screen reader users follow along
    useEffect(() => {
        if (index > 0 || status === 'sent') questionRef.current?.focus();
    }, [index, status]);

    const set = (field, value) => setData((d) => ({ ...d, [field]: value }));
    const toggleType = (type) =>
        set('projectTypes', data.projectTypes.includes(type) ? data.projectTypes.filter((t) => t !== type) : [...data.projectTypes, type]);
    const pick = (field) => (value) => set(field, data[field] === value ? '' : value);

    const next = async (e) => {
        e.preventDefault();
        if (!step.valid(data)) return;
        if (!isLast) {
            setIndex(index + 1);
            return;
        }
        if (data.website) {
            // Bots fill the hidden field; pretend it worked
            setStatus('sent');
            return;
        }
        setStatus('sending');
        try {
            const { website, ...inquiry } = data;
            await submitInquiry(inquiry);
            setStatus('sent');
        } catch {
            setStatus('error');
        }
    };

    if (status === 'sent') {
        return (
            <section className="section inquiry">
                <h1 className="inquiry-question" tabIndex={-1} ref={questionRef}>
                    {copy.thanks}
                </h1>
                <Link to="/" className="contact-answer inquiry-home">
                    Back to the work
                </Link>
            </section>
        );
    }

    return (
        <section className="section inquiry">
            {index === 0 && (
                <header className="inquiry-header">
                    <h1 className="inquiry-title">{copy.heading}</h1>
                    <p className="inquiry-intro">{copy.intro}</p>
                </header>
            )}

            <form className="inquiry-form" onSubmit={next} noValidate>
                <div className="inquiry-progress" aria-hidden="true">
                    {steps.map((s, i) => (
                        <span key={s.key} className={i <= index ? 'is-done' : undefined}></span>
                    ))}
                </div>
                <p className="inquiry-count">
                    Question {index + 1} of {steps.length}
                </p>

                <h2 className="inquiry-question" tabIndex={-1} ref={questionRef}>
                    {step.question}
                </h2>
                {step.hint && <p className="inquiry-hint">{step.hint}</p>}

                {step.key === 'type' && (
                    <Choices options={copy.projectTypes} selected={data.projectTypes} onToggle={toggleType} multiple label="Project type" />
                )}

                {step.key === 'brief' && (
                    <div className="inquiry-fields">
                        <label className="inquiry-field">
                            <span>Your project</span>
                            <textarea rows={5} value={data.message} onChange={(e) => set('message', e.target.value)} required />
                        </label>
                        <label className="inquiry-field">
                            <span>Company or brand (optional)</span>
                            <input
                                type="text"
                                value={data.company}
                                onChange={(e) => set('company', e.target.value)}
                                autoComplete="organization"
                            />
                        </label>
                    </div>
                )}

                {step.key === 'plan' && (
                    <div className="inquiry-fields">
                        {copy.timelines?.length > 0 && (
                            <div className="inquiry-group">
                                <span className="inquiry-group-label">Timeline</span>
                                <Choices options={copy.timelines} selected={data.timeline} onToggle={pick('timeline')} label="Timeline" />
                            </div>
                        )}
                        {copy.budgets?.length > 0 && (
                            <div className="inquiry-group">
                                <span className="inquiry-group-label">Budget</span>
                                <Choices options={copy.budgets} selected={data.budget} onToggle={pick('budget')} label="Budget" />
                            </div>
                        )}
                    </div>
                )}

                {step.key === 'contact' && (
                    <div className="inquiry-fields">
                        <label className="inquiry-field">
                            <span>Your name</span>
                            <input
                                type="text"
                                value={data.name}
                                onChange={(e) => set('name', e.target.value)}
                                autoComplete="name"
                                required
                            />
                        </label>
                        <label className="inquiry-field">
                            <span>Email</span>
                            <input
                                type="email"
                                value={data.email}
                                onChange={(e) => set('email', e.target.value)}
                                autoComplete="email"
                                required
                            />
                        </label>
                        <label className="inquiry-trap" aria-hidden="true">
                            Website
                            <input
                                type="text"
                                tabIndex={-1}
                                autoComplete="off"
                                value={data.website}
                                onChange={(e) => set('website', e.target.value)}
                            />
                        </label>
                    </div>
                )}

                {status === 'error' && (
                    <p className="inquiry-error" role="alert">
                        That didn't go through. Try again, or email me at <a href={`mailto:${site.email}`}>{site.email}</a>.
                    </p>
                )}

                <div className="inquiry-actions">
                    {index > 0 && (
                        <button type="button" className="inquiry-back" onClick={() => setIndex(index - 1)}>
                            ← Back
                        </button>
                    )}
                    <button
                        type="submit"
                        className="contact-answer is-yes inquiry-next"
                        disabled={!step.valid(data) || status === 'sending'}
                    >
                        {isLast ? (status === 'sending' ? 'Sending…' : 'Send') : 'Next'} <ArrowIcon size={18} />
                    </button>
                </div>
            </form>
        </section>
    );
}
