import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { site } from '../content.js';
import Leads from './Leads.jsx';
import Settings from './Settings.jsx';
import { supabase } from './supabase.js';
import './studio.css';

// Keep the studio out of search results and free of the public site's side nav padding
function usePrivatePage() {
    useEffect(() => {
        const robots = document.createElement('meta');
        robots.name = 'robots';
        robots.content = 'noindex, nofollow';
        document.head.appendChild(robots);
        document.body.classList.add('is-studio');
        const previous = document.title;
        document.title = `Studio – ${site.name}`;
        return () => {
            robots.remove();
            document.body.classList.remove('is-studio');
            document.title = previous;
        };
    }, []);
}

function SignIn() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const send = async (e) => {
        e.preventDefault();
        setStatus('sending');
        setError('');
        const { error: sendError } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: `${window.location.origin}/studio` },
        });
        if (sendError) {
            setError(sendError.message);
            setStatus('idle');
        } else {
            setStatus('sent');
        }
    };

    return (
        <main className="studio-gate">
            <p className="studio-kicker">Studio</p>
            {status === 'sent' ? (
                <>
                    <h1 className="studio-gate-title">Check your inbox.</h1>
                    <p className="studio-gate-text">
                        I sent a sign-in link to <strong>{email.trim()}</strong>. Open it on this device and you're in.
                    </p>
                    <button type="button" className="studio-link" onClick={() => setStatus('idle')}>
                        Use a different email
                    </button>
                </>
            ) : (
                <form onSubmit={send}>
                    <h1 className="studio-gate-title">Sign in</h1>
                    <p className="studio-gate-text">Leads, prices, proposals and invoices, for your eyes only.</p>
                    <label className="studio-field">
                        <span>Email</span>
                        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </label>
                    {error && <p className="studio-error" role="alert">{error}</p>}
                    <button type="submit" className="studio-button is-primary" disabled={status === 'sending'}>
                        {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
                    </button>
                </form>
            )}
            <Link to="/" className="studio-link">Back to the site</Link>
        </main>
    );
}

function NoAccess({ email }) {
    return (
        <main className="studio-gate">
            <p className="studio-kicker">Studio</p>
            <h1 className="studio-gate-title">No access.</h1>
            <p className="studio-gate-text">
                <strong>{email}</strong> isn't on the studio's owner list.
            </p>
            <button type="button" className="studio-button" onClick={() => supabase.auth.signOut()}>
                Sign out
            </button>
        </main>
    );
}

function Shell({ email }) {
    return (
        <div className="studio">
            <header className="studio-bar">
                <Link to="/studio" className="studio-brand">
                    Studio
                </Link>
                <nav className="studio-nav" aria-label="Studio">
                    <NavLink to="/studio/leads">Leads</NavLink>
                    <NavLink to="/studio/settings">Settings</NavLink>
                </nav>
                <div className="studio-account">
                    <Link to="/" className="studio-link">View site</Link>
                    <button type="button" className="studio-link" onClick={() => supabase.auth.signOut()} title={email}>
                        Sign out
                    </button>
                </div>
            </header>
            <main className="studio-main">
                <Routes>
                    <Route path="/studio/leads" element={<Leads />} />
                    <Route path="/studio/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/studio/leads" replace />} />
                </Routes>
            </main>
        </div>
    );
}

export default function Studio() {
    usePrivatePage();
    const [session, setSession] = useState(undefined);
    const [isOwner, setIsOwner] = useState(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
        return () => data.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        setIsOwner(null);
        if (!session) return;
        supabase.rpc('is_studio_owner').then(({ data }) => setIsOwner(data === true));
    }, [session?.user?.id]);

    if (session === undefined || (session && isOwner === null)) {
        return <p className="studio-loading">Loading…</p>;
    }
    if (!session) return <SignIn />;
    if (!isOwner) return <NoAccess email={session.user.email} />;
    return <Shell email={session.user.email} />;
}
