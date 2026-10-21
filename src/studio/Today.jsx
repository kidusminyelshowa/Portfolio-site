import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney, invoiceTotals } from '../proposal/money.js';
import { needsAttention } from './checks.js';
import { today } from './deals.js';
import { sampleClauses } from './settings.js';
import { supabase } from './supabase.js';

const closedStages = ['won', 'lost', 'archived'];

async function loadEverything() {
    const results = await Promise.all([
        supabase.from('inquiries').select('id, name, company, email, status, created_at, updated_at').neq('status', 'archived'),
        supabase.from('proposals').select('id, title, status, client_name, client_company, client_note, sent_at, viewed_at'),
        supabase.from('invoices').select('*'),
        supabase.from('projects').select('*'),
        supabase.from('project_tasks').select('*'),
        supabase.from('studio_services').select('id').eq('is_sample', false).limit(1),
        supabase.from('studio_settings').select('data').eq('id', 1).maybeSingle(),
    ]);
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
    const [leads, proposals, invoices, projects, tasks, ownPrices, settings] = results.map((r) => r.data);
    return { leads, proposals, invoices, projects, tasks, hasOwnPrices: ownPrices.length > 0, savedSettings: settings?.data ?? null };
}

function Setup({ data }) {
    const saved = data.savedSettings;
    const steps = [
        { done: Boolean(saved?.payment?.accountNumber), label: 'Add your business and bank details', to: '/studio/settings' },
        { done: data.hasOwnPrices, label: 'Replace the sample prices with your own', to: '/studio/prices' },
        {
            done: Boolean(saved?.documents?.contractClauses) && saved.documents.contractClauses !== sampleClauses,
            label: 'Rewrite the sample contract terms',
            to: '/studio/settings',
        },
        { done: data.proposals.some((p) => p.sent_at), label: 'Send your first proposal', to: '/studio/proposals/new' },
    ];
    const left = steps.filter((s) => !s.done).length;
    if (left === 0) return null;

    return (
        <section className="studio-card today-setup" aria-labelledby="setup-title">
            <h2 className="studio-card-title" id="setup-title">
                Getting set up · {steps.length - left} of {steps.length} done
            </h2>
            <ol className="today-setup-list">
                {steps.map((step) => (
                    <li key={step.label} className={step.done ? 'is-done' : ''}>
                        <span className="today-setup-mark" aria-hidden="true">
                            {step.done ? '✓' : ''}
                        </span>
                        {step.done ? (
                            <span>
                                {step.label}
                                <span className="visually-hidden"> (done)</span>
                            </span>
                        ) : (
                            <Link to={step.to}>{step.label}</Link>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
}

export default function Today() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        loadEverything()
            .then(setData)
            .catch((e) => setError(e.message));
    }, []);

    const attention = useMemo(() => (data ? needsAttention(data) : []), [data]);

    const numbers = useMemo(() => {
        if (!data) return null;
        const month = today().slice(0, 7);
        const sum = (rows) => {
            const by = {};
            rows.forEach((inv) => (by[inv.currency] = (by[inv.currency] ?? 0) + invoiceTotals(inv).total));
            const list = Object.entries(by).map(([currency, total]) => formatMoney(total, currency));
            return list.length ? list.join(' + ') : '0';
        };
        return [
            { label: 'Waiting to be paid', value: sum(data.invoices.filter((inv) => inv.status === 'issued')), to: '/studio/invoices' },
            { label: 'Paid this month', value: sum(data.invoices.filter((inv) => inv.status === 'paid' && inv.paid_on?.startsWith(month))), to: '/studio/invoices' },
            { label: 'Open leads', value: data.leads.filter((l) => !closedStages.includes(l.status)).length, to: '/studio/leads' },
            { label: 'Active projects', value: data.projects.filter((p) => p.status !== 'done').length, to: '/studio/projects' },
        ];
    }, [data]);

    return (
        <section>
            <header className="studio-header">
                <div>
                    <h1 className="studio-title">Today</h1>
                    <p className="studio-subtitle">What needs you, and how the studio is doing.</p>
                </div>
            </header>
            {error && <p className="studio-error" role="alert">{error}</p>}
            {!data && !error && <p className="studio-help">Loading…</p>}
            {data && (
                <div className="today">
                    <Setup data={data} />

                    <section aria-labelledby="attention-title">
                        <h2 className="today-heading" id="attention-title">
                            Needs attention {attention.length > 0 && <span className="today-count">{attention.length}</span>}
                        </h2>
                        {attention.length === 0 ? (
                            <p className="today-clear">Nothing waiting on you. Nice.</p>
                        ) : (
                            <ul className="today-list">
                                {attention.map((item) => (
                                    <li key={item.key}>
                                        <Link to={item.to} className={`today-item${item.urgent ? ' is-urgent' : ''}`}>
                                            <span className="today-kind">{item.kind}</span>
                                            <strong>{item.title}</strong>
                                            <span className="today-detail">{item.detail}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section aria-label="Numbers" className="invoice-summary today-numbers">
                        {numbers.map((n) => (
                            <Link key={n.label} to={n.to}>
                                <span>{n.label}</span>
                                <strong>{n.value}</strong>
                            </Link>
                        ))}
                    </section>
                </div>
            )}
        </section>
    );
}
