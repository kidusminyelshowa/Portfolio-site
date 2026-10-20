import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SUPABASE_KEY, SUPABASE_URL } from '../inquiry.js';
import { formatDate, formatMoney, lineTotal, quantityLabel, totals, usdEstimate } from './money.js';
import { downloadProposalPdf } from './pdf.js';
import '../studio/studio.css';

// Clients reach their proposal through two database functions; the proposals table itself stays private
async function rpc(name, args) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || `Request failed with ${response.status}`);
    return body;
}

export function ProposalDocument({ proposal }) {
    const sums = totals(proposal);
    const usd = usdEstimate(proposal, sums.total);
    const details = proposal.business?.business ?? {};
    const preparedFor = [proposal.client_name, proposal.client_company].filter(Boolean).join(', ');

    return (
        <article className="proposal-doc">
            <header className="proposal-doc-head">
                <p className="proposal-from">{details.name}</p>
                <h1 className="proposal-title">{proposal.title}</h1>
                <p className="proposal-meta">
                    {preparedFor && <span>Prepared for {preparedFor}</span>}
                    {proposal.valid_until && <span>Valid until {formatDate(proposal.valid_until)}</span>}
                </p>
            </header>
            {proposal.intro && <p className="proposal-intro">{proposal.intro}</p>}
            <table className="proposal-items">
                <thead>
                    <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Qty</th>
                        <th scope="col">Price</th>
                        <th scope="col">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {(proposal.items ?? []).map((item, i) => (
                        <tr key={i}>
                            <td data-label="Item">
                                <strong>{item.name}</strong>
                                {item.description && <span>{item.description}</span>}
                            </td>
                            <td data-label="Qty">{quantityLabel(item)}</td>
                            <td data-label="Price">{formatMoney(Number(item.price) || 0, proposal.currency)}</td>
                            <td data-label="Amount">{formatMoney(lineTotal(item), proposal.currency)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <dl className="proposal-totals">
                <div>
                    <dt>Subtotal</dt>
                    <dd>{formatMoney(sums.subtotal, proposal.currency)}</dd>
                </div>
                {sums.discount > 0 && (
                    <div>
                        <dt>Discount ({Number(proposal.discount_pct)}%)</dt>
                        <dd>− {formatMoney(sums.discount, proposal.currency)}</dd>
                    </div>
                )}
                {Number(proposal.vat_rate) > 0 && (
                    <div>
                        <dt>VAT ({Number(proposal.vat_rate)}%)</dt>
                        <dd>{formatMoney(sums.vat, proposal.currency)}</dd>
                    </div>
                )}
                <div className="is-total">
                    <dt>Total</dt>
                    <dd>{formatMoney(sums.total, proposal.currency)}</dd>
                </div>
                {usd && (
                    <div>
                        <dt>About</dt>
                        <dd>{formatMoney(usd, 'USD')}</dd>
                    </div>
                )}
            </dl>
        </article>
    );
}

function Respond({ slug, onAnswered }) {
    const [mode, setMode] = useState(null);
    const [note, setNote] = useState('');
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const send = async (response) => {
        setStatus('sending');
        setError('');
        try {
            await rpc('respond_to_proposal', { p_slug: slug, p_response: response, p_note: note.trim() || null });
            onAnswered();
        } catch (e) {
            setError(e.message);
            setStatus('idle');
        }
    };

    return (
        <section className="proposal-respond" aria-label="Your answer">
            {mode === null && (
                <div className="studio-actions is-start">
                    <button type="button" className="studio-button is-primary" onClick={() => setMode('accepted')}>
                        Accept proposal
                    </button>
                    <button type="button" className="studio-button" onClick={() => setMode('changes requested')}>
                        Ask for changes
                    </button>
                </div>
            )}
            {mode && (
                <div className="studio-form">
                    <label className="studio-field">
                        <span>{mode === 'accepted' ? 'Anything to add? (optional)' : 'What would you like changed?'}</span>
                        <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    {error && <p className="studio-error" role="alert">{error}</p>}
                    <div className="studio-actions is-start">
                        <button
                            type="button"
                            className="studio-button is-primary"
                            disabled={status === 'sending' || (mode === 'changes requested' && !note.trim())}
                            onClick={() => send(mode)}
                        >
                            {status === 'sending' ? 'Sending…' : mode === 'accepted' ? 'Confirm and accept' : 'Send my notes'}
                        </button>
                        <button type="button" className="studio-link" onClick={() => setMode(null)}>
                            Back
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

export default function ProposalPage() {
    const { slug } = useParams();
    const [proposal, setProposal] = useState(undefined);
    const [error, setError] = useState('');

    const load = () =>
        rpc('get_proposal', { p_slug: slug })
            .then(setProposal)
            .catch((e) => setError(e.message));

    useEffect(() => {
        const robots = document.createElement('meta');
        robots.name = 'robots';
        robots.content = 'noindex, nofollow';
        document.head.appendChild(robots);
        document.body.classList.add('is-studio');
        load();
        return () => {
            robots.remove();
            document.body.classList.remove('is-studio');
        };
    }, [slug]);

    useEffect(() => {
        if (proposal?.title) document.title = proposal.title;
    }, [proposal?.title]);

    if (error) return <main className="studio-gate"><p className="studio-error">{error}</p></main>;
    if (proposal === undefined) return <p className="studio-loading">Loading…</p>;
    if (proposal === null) {
        return (
            <main className="studio-gate">
                <h1 className="studio-gate-title">Not found.</h1>
                <p className="studio-gate-text">This proposal link doesn't exist or isn't shared yet.</p>
            </main>
        );
    }

    const expired = proposal.valid_until && new Date(`${proposal.valid_until}T23:59:59`) < new Date();
    const open = ['sent', 'viewed'].includes(proposal.status) && !expired;

    return (
        <main className="proposal-page">
            <ProposalDocument proposal={proposal} />
            <footer className="proposal-footer">
                {proposal.status === 'accepted' && (
                    <p className="proposal-banner is-accepted" role="status">
                        Accepted on {formatDate(proposal.responded_at)}. Thank you, I'll be in touch about next steps.
                    </p>
                )}
                {proposal.status === 'changes requested' && (
                    <p className="proposal-banner" role="status">
                        Thanks for the notes. I'll send an updated version soon.
                    </p>
                )}
                {expired && !['accepted', 'changes requested'].includes(proposal.status) && (
                    <p className="proposal-banner" role="status">
                        This proposal expired on {formatDate(proposal.valid_until)}. Get in touch for an updated one.
                    </p>
                )}
                {open && <Respond slug={slug} onAnswered={load} />}
                <button type="button" className="studio-link" onClick={() => downloadProposalPdf(proposal)}>
                    Download PDF
                </button>
            </footer>
        </main>
    );
}
