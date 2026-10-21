import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatMoney, invoiceTotals } from '../proposal/money.js';
import { downloadInvoicePdf } from '../proposal/pdf.js';
import { invoiceState, today } from './deals.js';
import { supabase } from './supabase.js';

export default function Invoices() {
    const [invoices, setInvoices] = useState(null);
    const [filter, setFilter] = useState('open');
    const [error, setError] = useState('');

    useEffect(() => {
        supabase
            .from('invoices')
            .select('*')
            .order('issued_on', { ascending: false })
            .order('number', { ascending: false })
            .then(({ data, error: e }) => (e ? setError(e.message) : setInvoices(data)));
    }, []);

    const setPaid = async (invoice, paid) => {
        const { data, error: e } = await supabase
            .from('invoices')
            .update({ status: paid ? 'paid' : 'issued', paid_on: paid ? today() : null })
            .eq('id', invoice.id)
            .select()
            .single();
        if (e) setError(e.message);
        else setInvoices((all) => all.map((inv) => (inv.id === data.id ? data : inv)));
    };

    // Money still to come in, per currency
    const outstanding = useMemo(() => {
        const sums = {};
        (invoices ?? [])
            .filter((inv) => inv.status === 'issued')
            .forEach((inv) => {
                sums[inv.currency] = (sums[inv.currency] ?? 0) + invoiceTotals(inv).total;
            });
        return Object.entries(sums);
    }, [invoices]);

    const overdue = (invoices ?? []).filter((inv) => invoiceState(inv).key === 'overdue').length;
    const shown = (invoices ?? []).filter((inv) => filter === 'all' || ['due', 'overdue'].includes(invoiceState(inv).key));

    return (
        <section>
            <header className="studio-header">
                <div>
                    <h1 className="studio-title">Invoices</h1>
                    <p className="studio-subtitle">Invoices come from accepted proposals. Open a proposal to create one.</p>
                </div>
            </header>
            {error && <p className="studio-error" role="alert">{error}</p>}
            {invoices === null && !error && <p className="studio-help">Loading invoices…</p>}

            {invoices?.length > 0 && (
                <div className="invoice-summary">
                    <div>
                        <span>Waiting to be paid</span>
                        <strong>{outstanding.length ? outstanding.map(([currency, sum]) => formatMoney(sum, currency)).join(' + ') : 'Nothing'}</strong>
                    </div>
                    <div>
                        <span>Overdue</span>
                        <strong className={overdue ? 'is-overdue' : ''}>{overdue}</strong>
                    </div>
                </div>
            )}

            {invoices?.length === 0 && (
                <div className="studio-empty">
                    <h2>No invoices yet.</h2>
                    <p>When a client accepts a proposal, open it and create a deposit or full invoice under Next steps.</p>
                    <Link to="/studio/proposals" className="studio-button is-primary">
                        Go to proposals
                    </Link>
                </div>
            )}

            {invoices?.length > 0 && (
                <>
                    <div className="leads-tools" role="tablist" aria-label="Show">
                        {[
                            ['open', 'Waiting'],
                            ['all', 'All'],
                        ].map(([key, label]) => (
                            <button key={key} type="button" role="tab" aria-selected={filter === key} className="studio-chip" onClick={() => setFilter(key)}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {shown.length === 0 && <p className="studio-help">Everything's paid.</p>}
                    <ul className="proposal-list">
                        {shown.map((inv) => {
                            const state = invoiceState(inv);
                            return (
                                <li key={inv.id} className="invoice-row">
                                    <span className="proposal-list-title">
                                        <strong>
                                            {inv.number} · {inv.label}
                                        </strong>
                                        <span>
                                            {[inv.client?.client_company, inv.client?.client_name].filter(Boolean).join(' · ') || 'Client'} · issued {formatDate(inv.issued_on)}
                                        </span>
                                    </span>
                                    <span className="proposal-list-total">{formatMoney(invoiceTotals(inv).total, inv.currency)}</span>
                                    <span className={`invoice-state is-${state.key}`}>
                                        {state.label}
                                        {state.key === 'paid' ? ` ${formatDate(inv.paid_on)}` : inv.due_on ? ` · due ${formatDate(inv.due_on)}` : ''}
                                    </span>
                                    <span className="deal-actions">
                                        <button type="button" className="studio-link" onClick={() => downloadInvoicePdf(inv)}>
                                            PDF
                                        </button>
                                        {inv.proposal_id && (
                                            <Link className="studio-link" to={`/studio/proposals/${inv.proposal_id}`}>
                                                Proposal
                                            </Link>
                                        )}
                                        {inv.status === 'issued' && (
                                            <button type="button" className="studio-button is-primary" onClick={() => setPaid(inv, true)}>
                                                Mark paid
                                            </button>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </section>
    );
}
