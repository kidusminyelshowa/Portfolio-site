import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { site } from '../content.js';
import Leads from './Leads.jsx';
import Invoices from './Invoices.jsx';
import Prices from './Prices.jsx';
import Projects from './Projects.jsx';
import { ProposalEditor, ProposalList } from './Proposals.jsx';
import SetPassword from './SetPassword.jsx';
import Settings from './Settings.jsx';
import Today from './Today.jsx';
import { isRecoveryReturn, supabase } from './supabase.js';
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

const friendly = (message) =>
    ({
        'Invalid login credentials': "That email and password don't match.",
        'email rate limit exceeded': 'Too many emails were sent in the last hour. Try again a little later.',
    })[message] ?? message;

function SignIn() {
    const [mode, setMode] = useState('sign-in');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');

    const switchTo = (next) => {
        setMode(next);
        setError('');
        setStatus('idle');
    };

    const signIn = async (e) => {
        e.preventDefault();
        setStatus('busy');
        setError('');
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) {
            setError(friendly(signInError.message));
            setStatus('idle');
        }
    };

    const sendReset = async (e) => {
        e.preventDefault();
        setStatus('busy');
        setError('');
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/studio`,
        });
        if (resetError) {
            setError(friendly(resetError.message));
            setStatus('idle');
        } else {
            setStatus('sent');
        }
    };

    const emailField = (
        <label className="studio-field">
            <span>Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
    );

    return (
        <main className="studio-gate">
            <p className="studio-kicker">Studio</p>
            {mode === 'sign-in' && (
                <form onSubmit={signIn}>
                    <h1 className="studio-gate-title">Sign in</h1>
                    <p className="studio-gate-text">Leads, prices, proposals and invoices, for your eyes only.</p>
                    {emailField}
                    <label className="studio-field">
                        <span>Password</span>
                        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </label>
                    {error && <p className="studio-error" role="alert">{error}</p>}
                    <button type="submit" className="studio-button is-primary" disabled={status === 'busy'}>
                        {status === 'busy' ? 'Signing in…' : 'Sign in'}
                    </button>
                    <button type="button" className="studio-link" onClick={() => switchTo('reset')}>
                        Forgot your password, or never set one?
                    </button>
                </form>
            )}
            {mode === 'reset' && status !== 'sent' && (
                <form onSubmit={sendReset}>
                    <h1 className="studio-gate-title">Set a password</h1>
                    <p className="studio-gate-text">I'll email you a link. Open it on this device and choose a new password.</p>
                    {emailField}
                    {error && <p className="studio-error" role="alert">{error}</p>}
                    <button type="submit" className="studio-button is-primary" disabled={status === 'busy'}>
                        {status === 'busy' ? 'Sending…' : 'Email me a link'}
                    </button>
                    <button type="button" className="studio-link" onClick={() => switchTo('sign-in')}>
                        Back to sign in
                    </button>
                </form>
            )}
            {mode === 'reset' && status === 'sent' && (
                <>
                    <h1 className="studio-gate-title">Check your inbox.</h1>
                    <p className="studio-gate-text">
                        If <strong>{email.trim()}</strong> has a studio account, a link to set your password is on its way.
                    </p>
                    <button type="button" className="studio-link" onClick={() => switchTo('sign-in')}>
                        Back to sign in
                    </button>
                </>
            )}
            <Link to="/" className="studio-link">Back to the site</Link>
        </main>
    );
}

function ChoosePassword({ onDone }) {
    return (
        <main className="studio-gate">
            <p className="studio-kicker">Studio</p>
            <h1 className="studio-gate-title">Choose a password</h1>
            <p className="studio-gate-text">You'll use it with your email to sign in from now on.</p>
            <SetPassword submitLabel="Save password" onDone={onDone} />
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
                    <NavLink to="/studio/today">Today</NavLink>
                    <NavLink to="/studio/leads">Leads</NavLink>
                    <NavLink to="/studio/proposals">Proposals</NavLink>
                    <NavLink to="/studio/invoices">Invoices</NavLink>
                    <NavLink to="/studio/projects">Projects</NavLink>
                    <NavLink to="/studio/prices">Prices</NavLink>
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
                    <Route path="/studio/today" element={<Today />} />
                    <Route path="/studio/leads" element={<Leads />} />
                    <Route path="/studio/proposals" element={<ProposalList />} />
                    <Route path="/studio/proposals/:id" element={<ProposalEditor />} />
                    <Route path="/studio/invoices" element={<Invoices />} />
                    <Route path="/studio/projects" element={<Projects />} />
                    <Route path="/studio/prices" element={<Prices />} />
                    <Route path="/studio/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/studio/today" replace />} />
                </Routes>
            </main>
        </div>
    );
}

export default function Studio() {
    usePrivatePage();
    const [session, setSession] = useState(undefined);
    const [isOwner, setIsOwner] = useState(null);
    const [choosingPassword, setChoosingPassword] = useState(isRecoveryReturn);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data } = supabase.auth.onAuthStateChange((event, next) => {
            if (event === 'PASSWORD_RECOVERY') setChoosingPassword(true);
            setSession(next);
        });
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
    if (choosingPassword) return <ChoosePassword onDone={() => setChoosingPassword(false)} />;
    if (!isOwner) return <NoAccess email={session.user.email} />;
    return <Shell email={session.user.email} />;
}
