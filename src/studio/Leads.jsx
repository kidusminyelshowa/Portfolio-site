import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './supabase.js';

// The inquiries table's status, in pipeline order
export const stages = [
    { value: 'new', label: 'New' },
    { value: 'replied', label: 'Replied' },
    { value: 'in progress', label: 'Talking' },
    { value: 'proposal sent', label: 'Proposal sent' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
];
const archived = { value: 'archived', label: 'Archived' };
const allStages = [...stages, archived];

const sourceLabels = { form: 'Contact form', manual: 'Added by hand', import: 'Imported' };
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// A small CSV/TSV reader: header row first, quotes allowed around values
export function parseRows(text) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const split = (line) => {
        const cells = [];
        let cell = '';
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
            const char = line[i];
            if (char === '"' && quoted && line[i + 1] === '"') {
                cell += '"';
                i += 1;
            } else if (char === '"') {
                quoted = !quoted;
            } else if (char === delimiter && !quoted) {
                cells.push(cell.trim());
                cell = '';
            } else {
                cell += char;
            }
        }
        cells.push(cell.trim());
        return cells;
    };
    const header = split(lines[0]).map((h) => h.toLowerCase());
    return lines.slice(1).map((line) => {
        const cells = split(line);
        return Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']));
    });
}

function Dialog({ title, onClose, children }) {
    const ref = useRef(null);
    useEffect(() => {
        const dialog = ref.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);
    return (
        <dialog ref={ref} className="studio-dialog" onCancel={onClose} onClick={(e) => e.target === ref.current && onClose()}>
            <div className="studio-dialog-body">
                <header className="studio-dialog-header">
                    <h2>{title}</h2>
                    <button type="button" className="studio-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </header>
                {children}
            </div>
        </dialog>
    );
}

function LeadDetail({ lead, onSave, onDelete, onClose }) {
    const [status, setStatus] = useState(lead.status);
    const [notes, setNotes] = useState(lead.notes ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const save = async (changes) => {
        setSaving(true);
        setError('');
        try {
            await onSave(lead.id, changes);
            onClose();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!window.confirm(`Delete ${lead.name}? This can't be undone.`)) return;
        try {
            await onDelete(lead.id);
            onClose();
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <Dialog title={lead.name} onClose={onClose}>
            <dl className="studio-facts">
                <div>
                    <dt>Email</dt>
                    <dd>
                        <a href={`mailto:${lead.email}`}>{lead.email}</a>
                    </dd>
                </div>
                {lead.company && (
                    <div>
                        <dt>Company</dt>
                        <dd>{lead.company}</dd>
                    </div>
                )}
                {lead.project_types?.length > 0 && (
                    <div>
                        <dt>Making</dt>
                        <dd>{lead.project_types.join(', ')}</dd>
                    </div>
                )}
                {lead.timeline && (
                    <div>
                        <dt>Timeline</dt>
                        <dd>{lead.timeline}</dd>
                    </div>
                )}
                {lead.budget && (
                    <div>
                        <dt>Budget</dt>
                        <dd>{lead.budget}</dd>
                    </div>
                )}
                <div>
                    <dt>Came in</dt>
                    <dd>
                        {formatDate(lead.created_at)} · {sourceLabels[lead.source] ?? lead.source}
                    </dd>
                </div>
            </dl>
            <p className="studio-message">{lead.message}</p>
            <label className="studio-field">
                <span>Stage</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {allStages.map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
            </label>
            <label className="studio-field">
                <span>Notes</span>
                <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Calls, next steps, anything to remember" />
            </label>
            {error && <p className="studio-error" role="alert">{error}</p>}
            <div className="studio-actions">
                <button type="button" className="studio-link is-danger" onClick={remove}>
                    Delete
                </button>
                <a className="studio-button" href={`mailto:${lead.email}?subject=${encodeURIComponent('Re: your project')}`}>
                    Reply by email
                </a>
                <Link className="studio-button" to={`/studio/proposals/new?lead=${lead.id}`}>
                    Write a proposal
                </Link>
                <button type="button" className="studio-button is-primary" disabled={saving} onClick={() => save({ status, notes: notes.trim() || null })}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </Dialog>
    );
}

const emptyLead = { name: '', email: '', company: '', message: '', budget: '' };

function AddLead({ onAdd, onClose }) {
    const [lead, setLead] = useState(emptyLead);
    const [error, setError] = useState('');
    const set = (field) => (e) => setLead((l) => ({ ...l, [field]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        try {
            await onAdd([{ ...lead, source: 'manual' }]);
            onClose();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <Dialog title="Add a lead" onClose={onClose}>
            <form onSubmit={submit} className="studio-form">
                <label className="studio-field">
                    <span>Name</span>
                    <input required value={lead.name} onChange={set('name')} />
                </label>
                <label className="studio-field">
                    <span>Email</span>
                    <input type="email" required value={lead.email} onChange={set('email')} />
                </label>
                <label className="studio-field">
                    <span>Company (optional)</span>
                    <input value={lead.company} onChange={set('company')} />
                </label>
                <label className="studio-field">
                    <span>What they need (optional)</span>
                    <textarea rows={3} value={lead.message} onChange={set('message')} />
                </label>
                <label className="studio-field">
                    <span>Budget (optional)</span>
                    <input value={lead.budget} onChange={set('budget')} />
                </label>
                {error && <p className="studio-error" role="alert">{error}</p>}
                <div className="studio-actions">
                    <button type="submit" className="studio-button is-primary">
                        Add lead
                    </button>
                </div>
            </form>
        </Dialog>
    );
}

function ImportLeads({ onAdd, onClose }) {
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const rows = useMemo(() => parseRows(text), [text]);
    const valid = rows.filter((r) => r.name && isEmail(r.email ?? ''));

    const submit = async () => {
        try {
            await onAdd(valid.map((r) => ({ ...r, source: 'import' })));
            onClose();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <Dialog title="Import leads" onClose={onClose}>
            <p className="studio-help">
                Paste rows from a spreadsheet or a CSV file. The first row names the columns: <code>name</code> and <code>email</code> are
                needed, and <code>company</code>, <code>message</code>, <code>budget</code> and <code>timeline</code> are optional.
            </p>
            <label className="studio-field">
                <span>Rows</span>
                <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'name,email,company\nAbebe Kebede,abebe@example.com,Kebede Coffee'} />
            </label>
            {rows.length > 0 && (
                <p className="studio-help">
                    {valid.length} of {rows.length} rows ready.
                    {valid.length < rows.length && ' Rows without a name or a valid email are skipped.'}
                </p>
            )}
            {error && <p className="studio-error" role="alert">{error}</p>}
            <div className="studio-actions">
                <button type="button" className="studio-button is-primary" disabled={valid.length === 0} onClick={submit}>
                    Import {valid.length || ''} {valid.length === 1 ? 'lead' : 'leads'}
                </button>
            </div>
        </Dialog>
    );
}

function LeadCard({ lead, onOpen }) {
    return (
        <button
            type="button"
            className="lead-card"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(lead.id))}
            onClick={() => onOpen(lead)}
        >
            <span className="lead-name">{lead.name}</span>
            {lead.company && <span className="lead-company">{lead.company}</span>}
            {lead.project_types?.length > 0 && <span className="lead-tags">{lead.project_types.join(' · ')}</span>}
            <span className="lead-meta">
                {formatDate(lead.created_at)}
                {lead.budget && ` · ${lead.budget}`}
            </span>
        </button>
    );
}

export default function Leads() {
    const [leads, setLeads] = useState(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [phoneStage, setPhoneStage] = useState('new');
    const [open, setOpen] = useState(null);
    const [dialog, setDialog] = useState(null);

    const load = async () => {
        const { data, error: loadError } = await supabase.from('inquiries').select('*').order('created_at', { ascending: false });
        if (loadError) setError(loadError.message);
        else setLeads(data);
    };

    useEffect(() => {
        load();
    }, []);

    const update = async (id, changes) => {
        const { error: saveError } = await supabase.from('inquiries').update(changes).eq('id', id);
        if (saveError) throw saveError;
        setLeads((all) => all.map((l) => (l.id === id ? { ...l, ...changes } : l)));
    };

    const remove = async (id) => {
        const { error: deleteError } = await supabase.from('inquiries').delete().eq('id', id);
        if (deleteError) throw deleteError;
        setLeads((all) => all.filter((l) => l.id !== id));
    };

    const add = async (rows) => {
        const clean = rows.map((r) => ({
            name: r.name.trim(),
            email: r.email.trim(),
            company: r.company?.trim() || null,
            message: r.message?.trim() || 'Added by hand.',
            budget: r.budget?.trim() || null,
            timeline: r.timeline?.trim() || null,
            source: r.source,
        }));
        const { error: addError } = await supabase.from('inquiries').insert(clean);
        if (addError) throw addError;
        await load();
    };

    const drop = (stage) => (e) => {
        e.preventDefault();
        const id = Number(e.dataTransfer.getData('text/plain'));
        const lead = leads.find((l) => l.id === id);
        if (lead && lead.status !== stage) update(id, { status: stage }).catch((err) => setError(err.message));
    };

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!leads) return [];
        if (!q) return leads;
        return leads.filter((l) => [l.name, l.email, l.company, l.message].some((v) => v?.toLowerCase().includes(q)));
    }, [leads, query]);

    const columns = showArchived ? allStages : stages;
    const count = (stage) => visible.filter((l) => l.status === stage).length;

    return (
        <section className="leads">
            <header className="studio-header">
                <div>
                    <h1 className="studio-title">Leads</h1>
                    <p className="studio-subtitle">Every inquiry from the contact form lands in New. Open a card to change its stage, or drag it to another column.</p>
                </div>
                <div className="studio-header-actions">
                    <button type="button" className="studio-button" onClick={() => setDialog('import')}>
                        Import
                    </button>
                    <button type="button" className="studio-button is-primary" onClick={() => setDialog('add')}>
                        Add lead
                    </button>
                </div>
            </header>

            <div className="leads-tools">
                <label className="studio-search">
                    <span className="visually-hidden">Search leads</span>
                    <input type="search" placeholder="Search name, email, company or message" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
                <label className="studio-check">
                    <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                    Show archived
                </label>
            </div>

            {error && <p className="studio-error" role="alert">{error}</p>}

            {leads === null && !error && <p className="studio-help">Loading leads…</p>}

            {leads?.length === 0 && (
                <div className="studio-empty">
                    <h2>No leads yet.</h2>
                    <p>When someone fills in the form at /contact, they show up here. You can also add one by hand or import a list.</p>
                    <button type="button" className="studio-button is-primary" onClick={() => setDialog('add')}>
                        Add your first lead
                    </button>
                </div>
            )}

            {leads?.length > 0 && (
                <>
                    <div className="leads-stage-tabs" role="tablist" aria-label="Stage">
                        {columns.map((s) => (
                            <button
                                key={s.value}
                                type="button"
                                role="tab"
                                aria-selected={phoneStage === s.value}
                                className="studio-chip"
                                onClick={() => setPhoneStage(s.value)}
                            >
                                {s.label} <span>{count(s.value)}</span>
                            </button>
                        ))}
                    </div>
                    <div className="leads-board" style={{ '--columns': columns.length }}>
                        {columns.map((s) => (
                            <div
                                key={s.value}
                                className={`leads-column${phoneStage === s.value ? ' is-current' : ''}`}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={drop(s.value)}
                            >
                                <h2 className="leads-column-title">
                                    {s.label} <span>{count(s.value)}</span>
                                </h2>
                                <div className="leads-cards">
                                    {visible
                                        .filter((l) => l.status === s.value)
                                        .map((lead) => (
                                            <LeadCard key={lead.id} lead={lead} onOpen={setOpen} />
                                        ))}
                                    {count(s.value) === 0 && <p className="leads-none">Nothing here.</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {open && <LeadDetail lead={open} onSave={update} onDelete={remove} onClose={() => setOpen(null)} />}
            {dialog === 'add' && <AddLead onAdd={add} onClose={() => setDialog(null)} />}
            {dialog === 'import' && <ImportLeads onAdd={add} onClose={() => setDialog(null)} />}
        </section>
    );
}
