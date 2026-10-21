import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../proposal/money.js';
import { today } from './deals.js';
import { supabase } from './supabase.js';

export const projectStatuses = ['kick-off', 'in progress', 'done'];

const columns = [
    { value: 'to do', label: 'To do' },
    { value: 'doing', label: 'Doing' },
    { value: 'done', label: 'Done' },
];

// Every new project starts with these; rename, delete or add to them on the board
export const starterTasks = ['Kick-off call', 'Collect brand assets and access', 'First concepts', 'Revisions', 'Final files and handover'];

export const seedTasks = (projectId) =>
    supabase
        .from('project_tasks')
        .insert(starterTasks.map((title, i) => ({ project_id: projectId, title, position: i })))
        .select();

const capitalise = (s) => s[0].toUpperCase() + s.slice(1);

function Task({ task, onMove, onChange, onDelete }) {
    const index = columns.findIndex((c) => c.value === task.status);
    const late = task.status !== 'done' && task.due_on && task.due_on < today();
    return (
        <li className={`task${late ? ' is-late' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}>
            <span className="task-title">{task.title}</span>
            <div className="task-tools">
                <label className="task-due">
                    <span className="visually-hidden">Due date for {task.title}</span>
                    <input type="date" value={task.due_on ?? ''} onChange={(e) => onChange(task, { due_on: e.target.value || null })} />
                </label>
                {index > 0 && (
                    <button type="button" className="task-button" onClick={() => onMove(task, columns[index - 1].value)} aria-label={`Move "${task.title}" to ${columns[index - 1].label}`}>
                        ←
                    </button>
                )}
                {index < columns.length - 1 && (
                    <button type="button" className="task-button" onClick={() => onMove(task, columns[index + 1].value)} aria-label={`Move "${task.title}" to ${columns[index + 1].label}`}>
                        →
                    </button>
                )}
                <button type="button" className="task-button" onClick={() => onDelete(task)} aria-label={`Delete "${task.title}"`}>
                    ×
                </button>
            </div>
        </li>
    );
}

function Board({ project, tasks, setTasks, setError }) {
    const [title, setTitle] = useState('');
    const [over, setOver] = useState(null);
    const mine = tasks.filter((t) => t.project_id === project.id);

    const save = async (task, changes) => {
        const { data, error } = await supabase.from('project_tasks').update(changes).eq('id', task.id).select().single();
        if (error) setError(error.message);
        else setTasks((all) => all.map((t) => (t.id === data.id ? data : t)));
    };

    const move = (task, status) => {
        if (task.status === status) return;
        const last = Math.max(-1, ...mine.filter((t) => t.status === status).map((t) => t.position));
        save(task, { status, position: last + 1 });
    };

    const add = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const last = Math.max(-1, ...mine.filter((t) => t.status === 'to do').map((t) => t.position));
        const { data, error } = await supabase
            .from('project_tasks')
            .insert({ project_id: project.id, title: title.trim(), position: last + 1 })
            .select()
            .single();
        if (error) setError(error.message);
        else {
            setTasks((all) => [...all, data]);
            setTitle('');
        }
    };

    const remove = async (task) => {
        const { error } = await supabase.from('project_tasks').delete().eq('id', task.id);
        if (error) setError(error.message);
        else setTasks((all) => all.filter((t) => t.id !== task.id));
    };

    const drop = (status) => (e) => {
        e.preventDefault();
        setOver(null);
        const task = mine.find((t) => t.id === e.dataTransfer.getData('text/plain'));
        if (task) move(task, status);
    };

    return (
        <div className="task-board">
            {columns.map((column) => {
                const list = mine.filter((t) => t.status === column.value).sort((a, b) => a.position - b.position);
                return (
                    <section
                        key={column.value}
                        className={`task-column${over === column.value ? ' is-over' : ''}`}
                        aria-label={`${project.name}: ${column.label}`}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setOver(column.value);
                        }}
                        onDragLeave={() => setOver(null)}
                        onDrop={drop(column.value)}
                    >
                        <h3>
                            {column.label} <span>{list.length}</span>
                        </h3>
                        <ul>
                            {list.map((task) => (
                                <Task key={task.id} task={task} onMove={move} onChange={save} onDelete={remove} />
                            ))}
                        </ul>
                        {column.value === 'to do' && (
                            <form className="task-add" onSubmit={add}>
                                <label className="visually-hidden" htmlFor={`task-${project.id}`}>
                                    New task for {project.name}
                                </label>
                                <input id={`task-${project.id}`} placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} />
                                <button type="submit" className="studio-button" disabled={!title.trim()}>
                                    Add
                                </button>
                            </form>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

export default function Projects() {
    const [projects, setProjects] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [open, setOpen] = useState(() => new Set());
    const [showDone, setShowDone] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([
            supabase.from('projects').select('*').order('created_at', { ascending: false }),
            supabase.from('project_tasks').select('*').order('position'),
        ]).then(([p, t]) => {
            const failed = [p, t].find((r) => r.error);
            if (failed) return setError(failed.error.message);
            setProjects(p.data);
            setTasks(t.data);
            // Open the boards of work in progress straight away
            setOpen(new Set(p.data.filter((project) => project.status !== 'done').map((project) => project.id)));
        });
    }, []);

    const update = async (project, changes) => {
        const { data, error: e } = await supabase.from('projects').update(changes).eq('id', project.id).select().single();
        if (e) setError(e.message);
        else setProjects((all) => all.map((p) => (p.id === data.id ? data : p)));
    };

    const toggle = (id) =>
        setOpen((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const doneCount = projects?.filter((p) => p.status === 'done').length ?? 0;
    const shown = projects?.filter((p) => showDone || p.status !== 'done') ?? [];

    return (
        <section>
            <header className="studio-header">
                <div>
                    <h1 className="studio-title">Projects</h1>
                    <p className="studio-subtitle">Work you've kicked off from an accepted proposal, with a task board for each.</p>
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
            {doneCount > 0 && (
                <div className="leads-tools">
                    <button type="button" className="studio-chip" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>
                        {showDone ? 'Hide' : 'Show'} finished ({doneCount})
                    </button>
                </div>
            )}
            <ul className="project-list">
                {shown.map((project) => {
                    const mine = tasks.filter((t) => t.project_id === project.id);
                    const finished = mine.filter((t) => t.status === 'done').length;
                    const isOpen = open.has(project.id);
                    return (
                        <li key={project.id} className="project-card">
                            <div className="project-row">
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
                                                {capitalise(s)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="studio-field">
                                    <span>Due</span>
                                    <input type="date" value={project.due_on ?? ''} onChange={(e) => update(project, { due_on: e.target.value || null })} />
                                </label>
                                <span className="deal-actions">
                                    {project.proposal_id && (
                                        <Link className="studio-link" to={`/studio/proposals/${project.proposal_id}`}>
                                            Proposal
                                        </Link>
                                    )}
                                    <button type="button" className="studio-button" aria-expanded={isOpen} onClick={() => toggle(project.id)}>
                                        Tasks {mine.length > 0 ? `${finished}/${mine.length}` : ''}
                                    </button>
                                </span>
                            </div>
                            {mine.length > 0 && (
                                <div className="project-progress" role="progressbar" aria-label={`${project.name} tasks done`} aria-valuemin={0} aria-valuemax={mine.length} aria-valuenow={finished}>
                                    <span style={{ width: `${(finished / mine.length) * 100}%` }} />
                                </div>
                            )}
                            {isOpen && <Board project={project} tasks={tasks} setTasks={setTasks} setError={setError} />}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
