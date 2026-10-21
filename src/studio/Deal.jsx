import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatMoney, invoiceTotals } from '../proposal/money.js';
import { downloadContractPdf, downloadInvoicePdf } from '../proposal/pdf.js';
import { addDays, invoiceState, nextNumber, today } from './deals.js';
import { seedTasks } from './Projects.jsx';
import { sampleClauses } from './settings.js';
import { supabase } from './supabase.js';

function Step({ number, title, done, children }) {
    return (
        <li className={`deal-step${done ? ' is-done' : ''}`}>
            <span className="deal-step-number" aria-hidden="true">
                {done ? '✓' : number}
            </span>
            <div className="deal-step-body">
                <h3>{title}</h3>
                {children}
            </div>
        </li>
    );
}

// Accepted proposal → contract → invoices → project, in that order but never locked to it
export default function DealPanel({ proposal, settings }) {
    const [contract, setContract] = useState(undefined);
    const [invoices, setInvoices] = useState([]);
    const [project, setProject] = useState(undefined);
    const [signedOn, setSignedOn] = useState(today());
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const id = proposal.id;
        Promise.all([
            supabase.from('contracts').select('*').eq('proposal_id', id).maybeSingle(),
            supabase.from('invoices').select('*').eq('proposal_id', id).order('created_at'),
            supabase.from('projects').select('*').eq('proposal_id', id).maybeSingle(),
        ]).then(([c, i, p]) => {
            const failed = [c, i, p].find((r) => r.error);
            if (failed) setError(failed.error.message);
            setContract(c.data ?? null);
            setInvoices(i.data ?? []);
            setProject(p.data ?? null);
        });
    }, [proposal.id]);

    const invoiced = invoices.filter((inv) => inv.status !== 'void').reduce((sum, inv) => sum + Number(inv.share_pct), 0);
    const remaining = Math.max(0, Math.round((100 - invoiced) * 100) / 100);

    useEffect(() => {
        if (contract === undefined) return;
        setDraft(
            invoiced === 0
                ? { label: 'Deposit', share_pct: 50, due_days: settings.documents.paymentTermsDays ?? 14 }
                : { label: 'Balance', share_pct: remaining, due_days: settings.documents.paymentTermsDays ?? 14 },
        );
    }, [contract, invoices.length]);

    const run = async (task) => {
        setBusy(true);
        setError('');
        try {
            await task();
        } catch (e) {
            setError(e.message);
        }
        setBusy(false);
    };

    const createContract = () =>
        run(async () => {
            const number = await nextNumber('contracts', 'A');
            const { data, error: e } = await supabase
                .from('contracts')
                .insert({ proposal_id: proposal.id, number, clauses: settings.documents.contractClauses || sampleClauses })
                .select()
                .single();
            if (e) throw e;
            setContract(data);
        });

    const setSigned = (value) =>
        run(async () => {
            const { data, error: e } = await supabase.from('contracts').update({ signed_on: value }).eq('id', contract.id).select().single();
            if (e) throw e;
            setContract(data);
        });

    const createInvoice = (e) => {
        e.preventDefault();
        return run(async () => {
            const number = await nextNumber('invoices', 'INV');
            const issued = today();
            const { data, error: err } = await supabase
                .from('invoices')
                .insert({
                    proposal_id: proposal.id,
                    number,
                    label: draft.label.trim() || 'Payment',
                    share_pct: Number(draft.share_pct),
                    issued_on: issued,
                    due_on: addDays(issued, draft.due_days),
                    client: { client_name: proposal.client_name, client_company: proposal.client_company, client_email: proposal.client_email },
                    items: proposal.items,
                    discount_pct: proposal.discount_pct,
                    vat_rate: proposal.vat_rate,
                    currency: proposal.currency,
                    business: settings,
                })
                .select()
                .single();
            if (err) throw err;
            setInvoices((all) => [...all, data]);
        });
    };

    const setPaid = (invoice, paid) =>
        run(async () => {
            const { data, error: e } = await supabase
                .from('invoices')
                .update({ status: paid ? 'paid' : 'issued', paid_on: paid ? today() : null })
                .eq('id', invoice.id)
                .select()
                .single();
            if (e) throw e;
            setInvoices((all) => all.map((inv) => (inv.id === data.id ? data : inv)));
        });

    const startProject = () =>
        run(async () => {
            const { data, error: e } = await supabase
                .from('projects')
                .insert({ proposal_id: proposal.id, lead_id: proposal.lead_id, name: proposal.title, client_name: proposal.client_company || proposal.client_name })
                .select()
                .single();
            if (e) throw e;
            const seeded = await seedTasks(data.id);
            if (seeded.error) throw seeded.error;
            setProject(data);
        });

    if (contract === undefined) return <p className="studio-help">Loading the deal…</p>;

    const paidAny = invoices.some((inv) => inv.status === 'paid');

    return (
        <section className="studio-card deal" aria-label="Deal">
            <h2 className="studio-card-title">Next steps</h2>
            {error && <p className="studio-error" role="alert">{error}</p>}
            <ol className="deal-steps">
                <Step number="1" title="Contract" done={Boolean(contract?.signed_on)}>
                    {!contract && (
                        <>
                            <p className="studio-help">Turns this proposal and your contract terms from Settings into an agreement to sign.</p>
                            <button type="button" className="studio-button is-primary" disabled={busy} onClick={createContract}>
                                Create contract
                            </button>
                        </>
                    )}
                    {contract && (
                        <div className="deal-row">
                            <span>
                                <strong>{contract.number}</strong> {contract.signed_on ? `· Signed ${formatDate(contract.signed_on)}` : '· Not signed yet'}
                            </span>
                            <div className="deal-actions">
                                <button type="button" className="studio-button" onClick={() => downloadContractPdf(contract, proposal)}>
                                    Download PDF
                                </button>
                                {contract.signed_on ? (
                                    <button type="button" className="studio-link" disabled={busy} onClick={() => setSigned(null)}>
                                        Undo signed
                                    </button>
                                ) : (
                                    <>
                                        <label className="studio-field deal-date">
                                            <span className="visually-hidden">Signed on</span>
                                            <input type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
                                        </label>
                                        <button type="button" className="studio-button is-primary" disabled={busy || !signedOn} onClick={() => setSigned(signedOn)}>
                                            Mark signed
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </Step>

                <Step number="2" title="Invoices" done={invoices.length > 0 && remaining === 0 && invoices.every((inv) => inv.status !== 'issued')}>
                    {invoices.map((invoice) => {
                        const state = invoiceState(invoice);
                        return (
                            <div key={invoice.id} className="deal-row">
                                <span>
                                    <strong>{invoice.number}</strong> · {invoice.label} ({Number(invoice.share_pct)}%) · {formatMoney(invoiceTotals(invoice).total, invoice.currency)}{' '}
                                    <span className={`invoice-state is-${state.key}`}>
                                        {state.label}
                                        {state.key === 'paid' && invoice.paid_on ? ` ${formatDate(invoice.paid_on)}` : ''}
                                        {state.key !== 'paid' && invoice.due_on ? ` · due ${formatDate(invoice.due_on)}` : ''}
                                    </span>
                                </span>
                                <div className="deal-actions">
                                    <button type="button" className="studio-button" onClick={() => downloadInvoicePdf(invoice)}>
                                        Download PDF
                                    </button>
                                    {invoice.status === 'paid' ? (
                                        <button type="button" className="studio-link" disabled={busy} onClick={() => setPaid(invoice, false)}>
                                            Undo paid
                                        </button>
                                    ) : (
                                        <button type="button" className="studio-button is-primary" disabled={busy} onClick={() => setPaid(invoice, true)}>
                                            Mark paid
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {remaining > 0 && draft && (
                        <form className="deal-invoice-form" onSubmit={createInvoice}>
                            <label className="studio-field">
                                <span>Invoice for</span>
                                <input required value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                            </label>
                            <label className="studio-field">
                                <span>Share of total %</span>
                                <input type="number" min="1" max={remaining} step="any" required value={draft.share_pct} onChange={(e) => setDraft({ ...draft, share_pct: e.target.value })} />
                            </label>
                            <label className="studio-field">
                                <span>Due in (days)</span>
                                <input type="number" min="0" value={draft.due_days} onChange={(e) => setDraft({ ...draft, due_days: e.target.value })} />
                            </label>
                            <button type="submit" className="studio-button is-primary" disabled={busy || !(Number(draft.share_pct) > 0 && Number(draft.share_pct) <= remaining)}>
                                Create invoice
                            </button>
                        </form>
                    )}
                    {remaining > 0 && invoices.length > 0 && <p className="studio-help">{remaining}% of the total isn't invoiced yet.</p>}
                </Step>

                <Step number="3" title="Kick-off" done={Boolean(project)}>
                    {project ? (
                        <div className="deal-row">
                            <span>
                                Project started {formatDate(project.created_at)} · <strong>{project.status}</strong>
                            </span>
                            <Link className="studio-button" to="/studio/projects">
                                Open projects
                            </Link>
                        </div>
                    ) : (
                        <>
                            <p className="studio-help">
                                {contract?.signed_on && paidAny
                                    ? 'The contract is signed and money is in. Time to start.'
                                    : 'Usually you start once the contract is signed and the first invoice is paid, but it’s up to you.'}
                            </p>
                            <button type="button" className={`studio-button${contract?.signed_on && paidAny ? ' is-primary' : ''}`} disabled={busy} onClick={startProject}>
                                Start project
                            </button>
                        </>
                    )}
                </Step>
            </ol>
        </section>
    );
}
