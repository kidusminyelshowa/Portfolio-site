import { useState } from 'react';
import { supabase } from './supabase.js';

// Sets the signed-in user's password; used in Settings and after a reset link
export default function SetPassword({ submitLabel = 'Change password', onDone }) {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 10) return setError('Use at least 10 characters.');
        if (password !== confirm) return setError("The two passwords don't match.");
        setStatus('saving');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
            setError(updateError.message);
            setStatus('idle');
            return undefined;
        }
        setPassword('');
        setConfirm('');
        setStatus('saved');
        onDone?.();
        return undefined;
    };

    return (
        <form className="studio-form" onSubmit={submit}>
            <label className="studio-field">
                <span>New password</span>
                <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <small>At least 10 characters.</small>
            </label>
            <label className="studio-field">
                <span>Type it again</span>
                <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            {error && <p className="studio-error" role="alert">{error}</p>}
            {status === 'saved' && <p className="studio-success" role="status">Password saved.</p>}
            <div>
                <button type="submit" className="studio-button is-primary" disabled={status === 'saving'}>
                    {status === 'saving' ? 'Saving…' : submitLabel}
                </button>
            </div>
        </form>
    );
}
