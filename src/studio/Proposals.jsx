import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDate, formatMoney, lineTotal, totals, units, usdEstimate } from '../proposal/money.js';
import { downloadProposalPdf } from '../proposal/pdf.js';
import DealPanel from './Deal.jsx';
import { useSettings } from './settings.js';
import { supabase } from './supabase.js';

export const proposalStatuses = {
    draft: 'Draft',
    sent: 'Sent',
    viewed: 'Viewed',
    accepted: 'Accepted',
    'changes requested': 'Changes requested',
    declined: 'Declined',
};

const clientLink = (slug) => `${window.location.origin}/proposal/${slug}`;

const inDays = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
};

function StatusChip({ status }) {
    return <span className={`proposal-status is-${status.replace(' ', '-')}`}>{proposalStatuses[status] ?? status}</span>;
}

export function ProposalList() {
    const [proposals, setProposals] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        supabase
            .from('proposals')
            .select('id, title, client_name, client_company, status, items, discount_pct, vat_rate, currency, updated_at')
            .order('updated_at', { ascending: false })
            .then(({ data, error: loadError }) => (loadError ? setError(loadError.message) : setProposals(data)));
    }, []);

    return (
        <section>
            <header className="studio-header">
                <div>
                    <h1 className="studio-title">Proposals</h1>
                    <p className="studio-subtitle">Build a quote from your prices, send the client a private link, and see when they accept.</p>
                </div>
                <div className="studio-header-actions">
                    <Link to="/studio/proposals/new" className="studio-button is-primary">
                        New proposal
                    </Link>
                </div>
            </header>
            {error && <p className="studio-error" role="alert">{error}</p>}
            {proposals === null && !error && <p className="studio-help">Loading proposals…</p>}
            {proposals?.length === 0 && (
                <div className="studio-empty">
                    <h2>No proposals yet.</h2>
                    <p>Start one here, or open a lead and choose "Write a proposal" to fill in the client for you.</p>
                    <Link to="/studio/proposals/new" className="studio-button is-primary">
                        Write your first proposal
                    </Link>
                </div>
            )}
            {proposals?.length > 0 && (
                <ul className="proposal-list">
                    {proposals.map((p) => (
                        <li key={p.id}>
                            <Link to={`/studio/proposals/${p.id}`} className="proposal-list-row">
                                <span className="proposal-list-title">
                                    <strong>{p.title}</strong>
                                    <span>{[p.client_name, p.client_company].filter(Boolean).join(', ') || 'No client yet'}</span>
                                </span>
                                <span className="proposal-list-total">{formatMoney(totals(p).total, p.currency)}</span>
                                <StatusChip status={p.status} />
                                <span className="proposal-list-date">{formatDate(p.updated_at)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function ItemsEditor({ items, currency, services, onChange }) {
    const update = (index, field, value) => onChange(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    const remove = (index) => onChange(items.filter((_, i) => i !== index));
    const addService = (e) => {
        const service = services.find((s) => String(s.id) === e.target.value);
        e.target.value = '';
        if (service) onChange([...items, { name: service.name, description: service.description ?? '', qty: 1, unit: service.unit, price: Number(service.price) }]);
    };

    return (
        <div className="builder-items">
            {items.length === 0 && <p className="studio-help">Add services from your price list, or a custom line.</p>}
            {items.map((item, i) => (
                <div key={i} className="builder-item">
                    <label className="studio-field builder-item-name">
                        <span>Item</span>
                        <input required value={item.name} onChange={(e) => update(i, 'name', e.target.value)} />
                    </label>
                    <label className="studio-field builder-item-qty">
                        <span>Qty</span>
                        <input type="number" min="0" step="any" value={item.qty} onChange={(e) => update(i, 'qty', e.target.value)} />
                    </label>
                    <label className="studio-field builder-item-unit">
                        <span>Per</span>
                        <select value={item.unit} onChange={(e) => update(i, 'unit', e.target.value)}>
                            {[...new Set([item.unit, ...units])].map((u) => (
                                <option key={u} value={u}>
                                    {u}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="studio-field builder-item-price">
                        <span>Price</span>
                        <input type="number" min="0" step="any" value={item.price} onChange={(e) => update(i, 'price', e.target.value)} />
                    </label>
                    <p className="builder-item-total" aria-label="Line total">
                        {formatMoney(lineTotal(item), currency)}
                    </p>
                    <button type="button" className="studio-close builder-item-remove" aria-label={`Remove ${item.name || 'line'}`} onClick={() => remove(i)}>
                        ×
                    </button>
                    <label className="studio-field builder-item-description">
                        <span>Description</span>
                        <input value={item.description ?? ''} onChange={(e) => update(i, 'description', e.target.value)} />
                    </label>
                </div>
            ))}
            <div className="builder-add">
                <label className="studio-field">
                    <span>Add from your prices</span>
                    <select defaultValue="" onChange={addService}>
                        <option value="" disabled>
                            Pick a service…
                        </option>
                        {services.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} · {formatMoney(Number(s.price), currency)} / {s.unit}
                                {s.is_sample ? ' (sample)' : ''}
                            </option>
                        ))}
                    </select>
                </label>
                <button type="button" className="studio-button" onClick={() => onChange([...items, { name: '', description: '', qty: 1, unit: 'project', price: 0 }])}>
                    Add a custom line
                </button>
            </div>
        </div>
    );
}

function ShareBox({ proposal }) {
    const [copied, setCopied] = useState(false);
    const link = clientLink(proposal.slug);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
        } catch {
            window.prompt('Copy this link', link);
        }
    };
    const subject = encodeURIComponent(proposal.title);
    const body = encodeURIComponent(`Hi ${proposal.client_name || ''},\n\nHere's the proposal we talked about:\n${link}\n\nYou can accept it or ask for changes right on the page.\n`);

    return (
        <div className="builder-share">
            <p className="builder-share-label">Client link</p>
            <p className="builder-share-link">{link}</p>
            <div className="studio-actions is-start">
                <button type="button" className="studio-button" onClick={copy}>
                    {copied ? 'Copied' : 'Copy link'}
                </button>
                {proposal.client_email && (
                    <a className="studio-button" href={`mailto:${proposal.client_email}?subject=${subject}&body=${body}`}>
                        Email it
                    </a>
                )}
                <a className="studio-link" href={link} target="_blank" rel="noreferrer">
                    Open client page
                </a>
            </div>
        </div>
    );
}

export function ProposalEditor() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { settings } = useSettings();
    const [proposal, setProposal] = useState(null);
    const [services, setServices] = useState([]);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const isNew = id === 'new';

    useEffect(() => {
        supabase
            .from('studio_services')
            .select('*')
            .order('sort')
            .then(({ data }) => setServices(data ?? []));
    }, []);

    // A new proposal starts from Settings, plus the client from a lead when there is one
    useEffect(() => {
        if (!isNew) {
            supabase
                .from('proposals')
                .select('*')
                .eq('id', id)
                .single()
                .then(({ data, error: loadError }) => (loadError ? setError(loadError.message) : setProposal(data)));
            return;
        }
        if (!settings) return;
        const base = {
            status: 'draft',
            title: 'Proposal',
            client_name: '',
            client_email: '',
            client_company: '',
            intro: '',
            items: [],
            discount_pct: 0,
            currency: settings.money.currency || 'ETB',
            vat_rate: settings.money.vatEnabled ? Number(settings.money.vatRate) || 0 : 0,
            usd_rate: Number(settings.money.usdRate) || null,
            valid_until: inDays(30),
            lead_id: null,
        };
        const leadId = params.get('lead');
        if (!leadId) {
            setProposal(base);
            return;
        }
        supabase
            .from('inquiries')
            .select('*')
            .eq('id', leadId)
            .single()
            .then(({ data: lead }) => {
                if (!lead) return setProposal(base);
                return setProposal({
                    ...base,
                    lead_id: lead.id,
                    title: `Proposal for ${lead.company || lead.name}`,
                    client_name: lead.name,
                    client_email: lead.email,
                    client_company: lead.company ?? '',
                    intro: lead.project_types?.length ? `Here's what I'd suggest for your ${lead.project_types.join(', ').toLowerCase()} project.` : '',
                });
            });
    }, [id, isNew, settings]);

    const sums = useMemo(() => (proposal ? totals(proposal) : null), [proposal]);

    if (error && !proposal) return <p className="studio-error">{error}</p>;
    if (!proposal || !settings) return <p className="studio-help">Loading…</p>;

    const set = (field) => (e) => setProposal((p) => ({ ...p, [field]: e.target.value }));
    const usd = usdEstimate(proposal, sums.total);

    const clean = (extra = {}) => ({
        title: proposal.title.trim() || 'Proposal',
        client_name: proposal.client_name.trim(),
        client_email: proposal.client_email?.trim() || null,
        client_company: proposal.client_company?.trim() || null,
        intro: proposal.intro?.trim() || null,
        items: proposal.items.map((item) => ({ ...item, name: item.name.trim(), qty: Number(item.qty) || 0, price: Number(item.price) || 0 })),
        discount_pct: Number(proposal.discount_pct) || 0,
        currency: proposal.currency.trim().toUpperCase() || 'ETB',
        vat_rate: Number(proposal.vat_rate) || 0,
        usd_rate: Number(proposal.usd_rate) || null,
        valid_until: proposal.valid_until || null,
        lead_id: proposal.lead_id,
        ...extra,
    });

    const save = async (extra) => {
        setStatus('saving');
        setError('');
        const row = clean(extra);
        const query = isNew ? supabase.from('proposals').insert(row) : supabase.from('proposals').update(row).eq('id', id);
        const { data, error: saveError } = await query.select().single();
        if (saveError) {
            setError(saveError.message);
            setStatus('idle');
            return null;
        }
        setProposal(data);
        setStatus('saved');
        if (isNew) navigate(`/studio/proposals/${data.id}`, { replace: true });
        return data;
    };

    const send = async () => {
        if (!proposal.client_name.trim() || proposal.items.length === 0) {
            setError('Add the client and at least one item before sending.');
            return;
        }
        const saved = await save({ status: 'sent', sent_at: new Date().toISOString(), business: settings, client_note: null, responded_at: null });
        if (saved?.lead_id) {
            await supabase.from('inquiries').update({ status: 'proposal sent' }).eq('id', saved.lead_id).in('status', ['new', 'replied', 'in progress']);
        }
    };

    const remove = async () => {
        if (!window.confirm(`Delete "${proposal.title}"? The client link will stop working.`)) return;
        const { error: deleteError } = await supabase.from('proposals').delete().eq('id', id);
        if (deleteError) setError(deleteError.message);
        else navigate('/studio/proposals');
    };

    const isDraft = proposal.status === 'draft';
    const isLive = !isDraft && !isNew;

    return (
        <section className="builder">
            <header className="studio-header">
                <div>
                    <Link to="/studio/proposals" className="studio-link">
                        ← All proposals
                    </Link>
                    <h1 className="studio-title">{isNew ? 'New proposal' : proposal.title}</h1>
                    {!isNew && (
                        <p className="studio-subtitle">
                            <StatusChip status={proposal.status} />
                            {proposal.sent_at && ` Sent ${formatDate(proposal.sent_at)}`}
                            {proposal.viewed_at && ` · Opened ${formatDate(proposal.viewed_at)}`}
                        </p>
                    )}
                </div>
            </header>

            {proposal.status === 'accepted' && (
                <p className="proposal-banner is-accepted">
                    Accepted on {formatDate(proposal.responded_at)}.{proposal.client_note && ` Their note: "${proposal.client_note}"`}
                </p>
            )}
            {proposal.status === 'changes requested' && (
                <p className="proposal-banner">
                    The client asked for changes: "{proposal.client_note}". Edit below, then send it again.
                </p>
            )}
            {isLive && proposal.status !== 'accepted' && <p className="studio-help">The client sees saved changes on their page right away.</p>}

            {proposal.status === 'accepted' && !isNew && <DealPanel proposal={proposal} settings={settings} />}

            <div className="builder-grid">
                <div className="builder-main">
                    <fieldset className="studio-card">
                        <legend>Client</legend>
                        <div className="studio-grid">
                            <label className="studio-field">
                                <span>Name</span>
                                <input value={proposal.client_name} onChange={set('client_name')} />
                            </label>
                            <label className="studio-field">
                                <span>Company</span>
                                <input value={proposal.client_company ?? ''} onChange={set('client_company')} />
                            </label>
                            <label className="studio-field">
                                <span>Email</span>
                                <input type="email" value={proposal.client_email ?? ''} onChange={set('client_email')} />
                            </label>
                        </div>
                    </fieldset>

                    <fieldset className="studio-card">
                        <legend>Proposal</legend>
                        <div className="studio-form">
                            <label className="studio-field">
                                <span>Title</span>
                                <input value={proposal.title} onChange={set('title')} />
                            </label>
                            <label className="studio-field">
                                <span>Intro</span>
                                <textarea rows={4} value={proposal.intro ?? ''} onChange={set('intro')} placeholder="A few lines on the project and your approach" />
                            </label>
                        </div>
                    </fieldset>

                    <fieldset className="studio-card">
                        <legend>Items</legend>
                        <ItemsEditor items={proposal.items} currency={proposal.currency} services={services} onChange={(items) => setProposal((p) => ({ ...p, items }))} />
                    </fieldset>
                </div>

                <aside className="builder-side">
                    <div className="studio-card builder-summary">
                        <div className="studio-grid is-tight">
                            <label className="studio-field">
                                <span>Discount %</span>
                                <input type="number" min="0" max="100" step="any" value={proposal.discount_pct} onChange={set('discount_pct')} />
                            </label>
                            <label className="studio-field">
                                <span>VAT %</span>
                                <input type="number" min="0" max="100" step="any" value={proposal.vat_rate} onChange={set('vat_rate')} />
                            </label>
                            <label className="studio-field">
                                <span>Currency</span>
                                <input value={proposal.currency} maxLength={3} onChange={set('currency')} />
                            </label>
                            <label className="studio-field">
                                <span>Valid until</span>
                                <input type="date" value={proposal.valid_until ?? ''} onChange={set('valid_until')} />
                            </label>
                        </div>
                        <dl className="proposal-totals is-compact">
                            <div>
                                <dt>Subtotal</dt>
                                <dd>{formatMoney(sums.subtotal, proposal.currency)}</dd>
                            </div>
                            {sums.discount > 0 && (
                                <div>
                                    <dt>Discount</dt>
                                    <dd>− {formatMoney(sums.discount, proposal.currency)}</dd>
                                </div>
                            )}
                            {sums.vat > 0 && (
                                <div>
                                    <dt>VAT</dt>
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
                        {error && <p className="studio-error" role="alert">{error}</p>}
                        {status === 'saved' && <p className="studio-success" role="status">Saved.</p>}
                        <div className="builder-buttons">
                            {(isDraft || proposal.status === 'changes requested') && (
                                <button type="button" className="studio-button is-primary" disabled={status === 'saving'} onClick={send}>
                                    {isDraft ? 'Send to client' : 'Send again'}
                                </button>
                            )}
                            <button type="button" className="studio-button" disabled={status === 'saving'} onClick={() => save()}>
                                {status === 'saving' ? 'Saving…' : isDraft ? 'Save draft' : 'Save changes'}
                            </button>
                            <button type="button" className="studio-link" onClick={() => downloadProposalPdf({ ...clean(), business: proposal.business?.business ? proposal.business : settings, status: proposal.status, sent_at: proposal.sent_at, responded_at: proposal.responded_at })}>
                                Download PDF
                            </button>
                        </div>
                        {isLive && <ShareBox proposal={proposal} />}
                        {!isNew && (
                            <button type="button" className="studio-link is-danger" onClick={remove}>
                                Delete proposal
                            </button>
                        )}
                    </div>
                </aside>
            </div>
        </section>
    );
}
