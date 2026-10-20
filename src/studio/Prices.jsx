import { useEffect, useState } from 'react';
import { units } from '../proposal/money.js';
import { useSettings } from './settings.js';
import { supabase } from './supabase.js';

const blank = { name: '', description: '', unit: 'project', price: '' };

function ServiceRow({ service, currency, onSave, onDelete }) {
    const [draft, setDraft] = useState(service);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const changed = ['name', 'description', 'unit', 'price'].some((key) => String(draft[key] ?? '') !== String(service[key] ?? ''));
    const set = (field) => (e) => {
        setDraft((d) => ({ ...d, [field]: e.target.value }));
        setStatus('idle');
    };

    const save = async (e) => {
        e.preventDefault();
        setStatus('saving');
        setError('');
        try {
            await onSave(service.id, { name: draft.name.trim(), description: draft.description?.trim() || null, unit: draft.unit, price: Number(draft.price) || 0 });
            setStatus('saved');
        } catch (err) {
            setError(err.message);
            setStatus('idle');
        }
    };

    const remove = async () => {
        if (!window.confirm(`Delete ${service.name} from your price list?`)) return;
        try {
            await onDelete(service.id);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <form className="price-row" onSubmit={save}>
            <div className="price-row-fields">
                <label className="studio-field price-name">
                    <span>
                        Service {service.is_sample && <em className="studio-badge">Sample price</em>}
                    </span>
                    <input required value={draft.name} onChange={set('name')} />
                </label>
                <label className="studio-field price-unit">
                    <span>Per</span>
                    <select value={draft.unit} onChange={set('unit')}>
                        {[...new Set([draft.unit, ...units])].map((u) => (
                            <option key={u} value={u}>
                                {u}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="studio-field price-amount">
                    <span>Price ({currency})</span>
                    <input type="number" min="0" step="any" required value={draft.price} onChange={set('price')} />
                </label>
                <label className="studio-field price-description">
                    <span>What's included</span>
                    <input value={draft.description ?? ''} onChange={set('description')} />
                </label>
            </div>
            {error && <p className="studio-error" role="alert">{error}</p>}
            <div className="studio-actions">
                <button type="button" className="studio-link is-danger" onClick={remove}>
                    Delete
                </button>
                {status === 'saved' && !changed && <span className="studio-success">Saved</span>}
                <button type="submit" className="studio-button" disabled={(!changed && !service.is_sample) || status === 'saving'}>
                    {service.is_sample && !changed ? 'Keep this price' : status === 'saving' ? 'Saving…' : 'Save'}
                </button>
            </div>
        </form>
    );
}

export default function Prices() {
    const { settings } = useSettings();
    const [services, setServices] = useState(null);
    const [adding, setAdding] = useState(null);
    const [error, setError] = useState('');
    const currency = settings?.money.currency || 'ETB';

    const load = async () => {
        const { data, error: loadError } = await supabase.from('studio_services').select('*').order('sort').order('id');
        if (loadError) setError(loadError.message);
        else setServices(data);
    };

    useEffect(() => {
        load();
    }, []);

    // Saving a sample confirms it as a real price
    const save = async (id, changes) => {
        const { data, error: saveError } = await supabase
            .from('studio_services')
            .update({ ...changes, is_sample: false })
            .eq('id', id)
            .select()
            .single();
        if (saveError) throw saveError;
        setServices((all) => all.map((s) => (s.id === id ? data : s)));
    };

    const remove = async (id) => {
        const { error: deleteError } = await supabase.from('studio_services').delete().eq('id', id);
        if (deleteError) throw deleteError;
        setServices((all) => all.filter((s) => s.id !== id));
    };

    const add = async (e) => {
        e.preventDefault();
        const sort = Math.max(0, ...(services ?? []).map((s) => s.sort)) + 1;
        const { error: addError } = await supabase.from('studio_services').insert({
            name: adding.name.trim(),
            description: adding.description.trim() || null,
            unit: adding.unit,
            price: Number(adding.price) || 0,
            sort,
            is_sample: false,
        });
        if (addError) return setError(addError.message);
        setAdding(null);
        return load();
    };

    const samples = services?.filter((s) => s.is_sample).length ?? 0;

    return (
        <section className="prices">
            <header className="studio-header">
                <div>
                    <h1 className="studio-title">Prices</h1>
                    <p className="studio-subtitle">Your services and what they cost. The price builder starts from these, and you can still change any line in a proposal.</p>
                </div>
                <div className="studio-header-actions">
                    <button type="button" className="studio-button is-primary" onClick={() => setAdding(blank)}>
                        Add a service
                    </button>
                </div>
            </header>

            {samples > 0 && (
                <p className="studio-notice">
                    {samples} {samples === 1 ? 'price is a sample' : 'prices are samples'} I filled in to get you started. Change them to your real rates, or keep or delete
                    them, and the label goes away.
                </p>
            )}
            {error && <p className="studio-error" role="alert">{error}</p>}
            {services === null && !error && <p className="studio-help">Loading prices…</p>}

            {adding && (
                <form className="price-row is-new" onSubmit={add}>
                    <div className="price-row-fields">
                        <label className="studio-field price-name">
                            <span>Service</span>
                            <input required autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
                        </label>
                        <label className="studio-field price-unit">
                            <span>Per</span>
                            <select value={adding.unit} onChange={(e) => setAdding({ ...adding, unit: e.target.value })}>
                                {units.map((u) => (
                                    <option key={u} value={u}>
                                        {u}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="studio-field price-amount">
                            <span>Price ({currency})</span>
                            <input type="number" min="0" step="any" required value={adding.price} onChange={(e) => setAdding({ ...adding, price: e.target.value })} />
                        </label>
                        <label className="studio-field price-description">
                            <span>What's included</span>
                            <input value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} />
                        </label>
                    </div>
                    <div className="studio-actions">
                        <button type="button" className="studio-link" onClick={() => setAdding(null)}>
                            Cancel
                        </button>
                        <button type="submit" className="studio-button is-primary">
                            Add service
                        </button>
                    </div>
                </form>
            )}

            {services?.length === 0 && !adding && (
                <div className="studio-empty">
                    <h2>No prices yet.</h2>
                    <p>Add the services you offer and what you charge, and they'll be one click away when you write a proposal.</p>
                    <button type="button" className="studio-button is-primary" onClick={() => setAdding(blank)}>
                        Add your first service
                    </button>
                </div>
            )}

            <div className="price-list">
                {services?.map((service) => (
                    <ServiceRow key={`${service.id}-${service.updated_at}`} service={service} currency={currency} onSave={save} onDelete={remove} />
                ))}
            </div>
            {services?.length > 0 && <p className="studio-help">Prices are in {currency}, the currency set in Settings.</p>}
        </section>
    );
}
