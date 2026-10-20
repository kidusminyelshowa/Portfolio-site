import { cloneElement, useEffect, useId, useState } from 'react';
import { presets, useSettings } from './settings.js';
import SetPassword from './SetPassword.jsx';

const timeZones = ['Africa/Addis_Ababa', 'Africa/Nairobi', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'UTC'];

// The hint is announced as a description, not as part of the field's name
function Field({ label, hint, children }) {
    const id = useId();
    return (
        <div className="studio-field">
            <label htmlFor={id}>{label}</label>
            {cloneElement(children, { id, 'aria-describedby': hint ? `${id}-hint` : undefined })}
            {hint && <small id={`${id}-hint`}>{hint}</small>}
        </div>
    );
}

export default function Settings() {
    const { settings, error, save } = useSettings();
    const [draft, setDraft] = useState(null);
    const [status, setStatus] = useState('idle');
    const [saveError, setSaveError] = useState('');

    useEffect(() => {
        if (settings && !draft) setDraft(settings);
    }, [settings, draft]);

    if (!draft) return <p className="studio-help">{error || 'Loading settings…'}</p>;

    const set = (group, field) => (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setDraft((d) => ({ ...d, [group]: { ...d[group], [field]: value } }));
        setStatus('idle');
    };

    const choosePreset = (e) => {
        const key = e.target.value;
        const { label, ...values } = presets[key] ?? {};
        setDraft((d) => ({ ...d, money: { ...d.money, ...values, preset: key } }));
        setStatus('idle');
    };

    const submit = async (e) => {
        e.preventDefault();
        setStatus('saving');
        setSaveError('');
        try {
            await save(draft);
            setStatus('saved');
        } catch (err) {
            setSaveError(err.message);
            setStatus('idle');
        }
    };

    const { business, payment, money, documents } = draft;

    return (
        <>
            <form className="settings" onSubmit={submit}>
                <header className="studio-header">
                    <div>
                        <h1 className="studio-title">Settings</h1>
                        <p className="studio-subtitle">Your proposals, contracts and invoices pull these details in, so fill them once here.</p>
                    </div>
                </header>

                {error && <p className="studio-error" role="alert">{error}</p>}

                <fieldset className="studio-card">
                    <legend>Business</legend>
                    <div className="studio-grid">
                        <Field label="Name on documents">
                            <input value={business.name} onChange={set('business', 'name')} />
                        </Field>
                        <Field label="Email">
                            <input type="email" value={business.email} onChange={set('business', 'email')} />
                        </Field>
                        <Field label="Phone">
                            <input type="tel" value={business.phone} onChange={set('business', 'phone')} placeholder={money.phonePrefix ? `${money.phonePrefix} …` : ''} />
                        </Field>
                        <Field label="Website">
                            <input type="url" value={business.website} onChange={set('business', 'website')} />
                        </Field>
                        <Field label="Address">
                            <textarea rows={2} value={business.address} onChange={set('business', 'address')} />
                        </Field>
                    </div>
                </fieldset>

                <fieldset className="studio-card">
                    <legend>Money</legend>
                    <div className="studio-grid">
                        <Field label="Preset" hint="Fills in the currency, tax and time zone. You can still change each one.">
                            <select value={money.preset} onChange={choosePreset}>
                                {Object.entries(presets).map(([key, p]) => (
                                    <option key={key} value={key}>
                                        {p.label}
                                    </option>
                                ))}
                                <option value="custom">Custom</option>
                            </select>
                        </Field>
                        <Field label="Currency" hint="A three-letter code, like ETB or USD.">
                            <input value={money.currency} maxLength={3} onChange={set('money', 'currency')} />
                        </Field>
                        {money.currency.toUpperCase() !== 'USD' && (
                            <Field label={`${money.currency || 'Local'} per 1 USD`} hint="Used to show a USD estimate on proposals. Leave blank to hide it.">
                                <input type="number" min="0" step="any" value={money.usdRate} onChange={set('money', 'usdRate')} />
                            </Field>
                        )}
                        <Field label="Time zone">
                            <select value={money.timeZone} onChange={set('money', 'timeZone')}>
                                {[...new Set([money.timeZone, ...timeZones])].map((tz) => (
                                    <option key={tz} value={tz}>
                                        {tz.replace(/_/g, ' ')}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <label className="studio-check">
                            <input type="checkbox" checked={money.vatEnabled} onChange={set('money', 'vatEnabled')} />
                            Charge VAT
                        </label>
                        {money.vatEnabled && (
                            <Field label="VAT %">
                                <input type="number" min="0" max="100" step="any" value={money.vatRate} onChange={set('money', 'vatRate')} />
                            </Field>
                        )}
                    </div>
                </fieldset>

                <fieldset className="studio-card">
                    <legend>Getting paid</legend>
                    <div className="studio-grid">
                        <Field label="Bank">
                            <input value={payment.bankName} onChange={set('payment', 'bankName')} />
                        </Field>
                        <Field label="Account name">
                            <input value={payment.accountName} onChange={set('payment', 'accountName')} />
                        </Field>
                        <Field label="Account number">
                            <input value={payment.accountNumber} onChange={set('payment', 'accountNumber')} />
                        </Field>
                        <Field label="TIN" hint="Your tax ID, printed on invoices.">
                            <input value={payment.tin} onChange={set('payment', 'tin')} />
                        </Field>
                    </div>
                </fieldset>

                <fieldset className="studio-card">
                    <legend>Contracts and invoices</legend>
                    <div className="studio-grid">
                        <Field label="Signed by">
                            <input value={documents.signatory} onChange={set('documents', 'signatory')} />
                        </Field>
                        <Field label="Payment due (days after invoice)">
                            <input type="number" min="0" value={documents.paymentTermsDays} onChange={set('documents', 'paymentTermsDays')} />
                        </Field>
                        <Field label="Contract terms" hint="One clause per paragraph. Added to every contract.">
                            <textarea rows={6} value={documents.contractClauses} onChange={set('documents', 'contractClauses')} />
                        </Field>
                        <Field label="Invoice note" hint="Printed at the bottom of every invoice.">
                            <textarea rows={3} value={documents.invoiceNote} onChange={set('documents', 'invoiceNote')} />
                        </Field>
                    </div>
                </fieldset>

                <div className="settings-save">
                    {saveError && <p className="studio-error" role="alert">{saveError}</p>}
                    {status === 'saved' && <p className="studio-success" role="status">Saved.</p>}
                    <button type="submit" className="studio-button is-primary" disabled={status === 'saving'}>
                        {status === 'saving' ? 'Saving…' : 'Save settings'}
                    </button>
                </div>
            </form>
            <section className="settings settings-password">
                <div className="studio-card">
                    <h2 className="studio-card-title">Password</h2>
                    <SetPassword />
                </div>
            </section>
        </>
    );
}
