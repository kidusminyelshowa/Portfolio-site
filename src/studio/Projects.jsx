import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../proposal/money.js';
import { supabase } from './supabase.js';

export const projectStatuses = ['kick-off', 'in progress', 'done'];

export default function Projects() {
    const [projects, setProjects] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false })
            .then(({ data, error: e }) => (e ? setError(e.message) : setProjects(data)));
    }, []);

    const update = async (project, changes) => {
        const { data, error: e } = await supabase.from('projects').update(changes).eq('id', project.id).select().single();
        if (e) setError(e.message);
        else setProjects((all) => all.map((p) => (p.id === data.id ? data : p)));
    };

    return (
        <section>
            <header className="studio-header">
                <div>
                    <h1 className="studio-title">Projects</h1>
                    <p className="studio-subtitle">Work you've kicked off from an accepted proposal.</p>
                </div>
            </header>
            {error && <p className="studio-error" role="alert">{error}</p>}
            {projects === null && !error && <p className="studio-help">Loading projects…</p>}
            {projects?.length === 0 && (
                <div className="studio-empty">
                    <h2>No projects yet.</h2>
                    <p>When a client accepts a proposal, open it and press "Start project" under Next steps.</p>
                    <Link to="/studio/proposals" className="studio-button is-primary">
                        Go to proposals
                    </Link>
                </div>
            )}
            <ul className="proposal-list">
                {projects?.map((project) => (
                    <li key={project.id} className="project-row">
                        <span className="proposal-list-title">
                            <strong>{project.name}</strong>
                            <span>
                                {project.client_name || 'Client'} · started {formatDate(project.starts_on ?? project.created_at)}
                            </span>
                        </span>
                        <label className="studio-field">
                            <span>Status</span>
                            <select value={project.status} onChange={(e) => update(project, { status: e.target.value })}>
                                {projectStatuses.map((s) => (
                                    <option key={s} value={s}>
                                        {s[0].toUpperCase() + s.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="studio-field">
                            <span>Due</span>
                            <input type="date" value={project.due_on ?? ''} onChange={(e) => update(project, { due_on: e.target.value || null })} />
                        </label>
                        {project.proposal_id && (
                            <Link className="studio-link" to={`/studio/proposals/${project.proposal_id}`}>
                                Proposal
                            </Link>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
