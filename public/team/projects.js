/* Projects kicked off from the Price Builder.
   A new project arrives "in review" with one task per deliverable, each already
   given to the least busy person in the right department. The project manager
   checks the plan (who, what, by when), changes what they like, and presses
   Start: only then do the tasks reach people. */
import {
  el, frag, S, me, employees, empById, canManage, isAdmin, isManager,
  chip, card, empty, field, input, textarea, select, tile, bar, avatar,
  dateShort, deptName, today, daysBetween, modal, closeModal, act, toast, PRIORITY_LABEL
} from '/team/ui.js';
import { brandName } from '/team/ui.js';
import { taskRow, taskModal } from '/team/tasks.js';

const render = () => window.dispatchEvent(new Event('gz:render'));
const go = h => { location.hash = h; };
const OPEN = ['todo', 'in_progress', 'blocked', 'submitted'];
export const PROJECT_LABEL = { review: 'Plan in review', active: 'In progress', done: 'Delivered', cancelled: 'Cancelled' };
const PROJECT_TONE = { review: 'warn', active: 'info', done: 'ok', cancelled: '' };
export const projects = () => (S.data && S.data.projects) || [];
const projectChip = p => chip(PROJECT_LABEL[p.status] || p.status, PROJECT_TONE[p.status]);
const nameOf = id => (empById(id) || {}).name || '—';

/* ================= list ================= */
let showClosed = false;
export function viewProjects() {
  const list = projects();
  const group = (title, sub, rows) => rows.length ? el('div', { style: 'margin-bottom:14px' }, [card(title, sub, [
    el('div', { class: 'list' }, rows.map(projectRow))
  ])]) : null;
  const by = st => list.filter(p => p.status === st).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const closed = list.filter(p => p.status === 'done' || p.status === 'cancelled').sort((a, b) => String(b.completedAt || b.dueDate).localeCompare(String(a.completedAt || a.dueDate)));
  const addBar = isManager() ? el('div', { class: 'salesbar' }, [el('span', { class: 'grow muted', style: 'font-size:13px', text: 'Projects come from Price Builder kick-offs, or add one yourself.' }),
    el('button', { class: 'primary sm', text: '+ Add project', onclick: newProjectModal })]) : null;
  if (!list.length) {
    return frag([addBar, empty('No projects yet', 'When a deal is kicked off in the Price Builder (contract → invoice → kick-off), it arrives here with a task plan. You can also add a project yourself.')]);
  }
  return frag([
    addBar,
    el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
      tile('Waiting for review', String(by('review').length), 'plans to check and start'),
      tile('In progress', String(by('active').length), 'with the team'),
      tile('Open tasks', String(by('active').reduce((s, p) => s + p.progress.open, 0)), 'across live projects'),
      tile('Overdue tasks', String(by('active').reduce((s, p) => s + p.progress.overdue, 0)), 'past the due date')
    ]),
    group('Waiting for review', 'Check who does what, then press Start.', by('review')),
    group('In progress', null, by('active')),
    closed.length ? el('div', {}, [
      el('button', { class: 'sm ghost', text: (showClosed ? 'Hide' : 'Show') + ' delivered and cancelled (' + closed.length + ')', onclick: () => { showClosed = !showClosed; render(); } }),
      showClosed ? el('div', { style: 'margin-top:12px' }, [group('Delivered and cancelled', null, closed)]) : null
    ]) : null
  ]);
}

/* a project that did not come from the Price Builder: name, dates, and a first list of tasks */
function newProjectModal() {
  const f = {
    name: input('', { placeholder: 'e.g. Website refresh' }),
    client: input('', { placeholder: 'Client (or ' + brandName() + ' for our own work)' }),
    start: input(today(), { type: 'date' }),
    due: input('', { type: 'date' }),
    tasks: textarea('', { placeholder: 'One task per line, e.g.\nMoodboard\nLogo concepts\nSocial media kit', style: 'min-height:120px' }),
    note: textarea('', { placeholder: 'Brief, links, anything the team should know (optional)' })
  };
  const managers = ((S.data && S.data.users) || []).filter(u => u.active !== false && (u.role === 'admin' || u.role === 'manager') && u.employeeId);
  f.pm = isAdmin() && managers.length ? select(me().employeeId, managers.map(u => ({ value: u.employeeId, label: u.name }))) : null;
  modal('Add a project', [
    el('div', { class: 'grid2' }, [field('Project', f.name), field('Client', f.client)]),
    el('div', { class: 'grid2' }, [field('Start', f.start), field('Due', f.due)]),
    f.pm ? field('Project manager', f.pm) : null,
    field('Tasks', f.tasks, 'Each line becomes a task, given to the least busy person who does that kind of work. You can change everything before you start it.'),
    field('Notes', f.note)
  ], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Create project', onclick: () => act({ action: 'newProject', project: {
      name: f.name.value, client: f.client.value, startDate: f.start.value, dueDate: f.due.value, tasks: f.tasks.value, note: f.note.value,
      managerId: f.pm ? f.pm.value : undefined } }, 'Project created — check the plan, then press Start project', res => { closeModal(); go('#/project/' + res.id); }).catch(() => {}) })
  ], { sub: 'It waits as a plan until you press Start project; only then do the tasks go out.' });
}

function projectRow(p) {
  const pr = p.progress || {};
  return el('div', { class: 'item click', style: 'flex-wrap:wrap', onclick: () => go('#/project/' + p.id) }, [
    el('span', { class: 'grow', style: 'min-width:200px' }, [
      el('b', { text: p.name + (p.client ? ' · ' + p.client : '') }),
      el('small', { text: ['Project manager: ' + nameOf(p.managerId), p.status === 'review' ? (p.plan || []).length + ' tasks planned' : pr.done + ' of ' + pr.total + ' tasks done',
        'due ' + dateShort(p.dueDate)].join(' · ') })
    ]),
    p.status === 'active' ? el('span', { style: 'width:120px' }, [bar(pr.pct, pr.overdue ? 'warn' : 'ok')]) : null,
    pr.overdue ? chip(pr.overdue + ' overdue', 'bad') : null,
    projectChip(p)
  ]);
}

/* ================= one project ================= */
export function viewProject(id) {
  const p = projects().find(x => x.id === id);
  if (!p) return empty('Project not found', 'It may have been deleted, or you do not have access to it.');
  const runs = !!p.canRun;
  return frag([
    headerCard(p, runs),
    el('div', { style: 'margin-top:14px' }, [p.status === 'review' && runs ? planEditor(p) : p.status === 'review' ? readOnlyPlan(p) : liveTasks(p, runs)]),
    (p.log || []).length ? el('div', { style: 'margin-top:14px' }, [card('History', null, [
      el('div', { class: 'list' }, p.log.slice().reverse().map(l => el('div', { class: 'row', style: 'gap:10px;font-size:13px' }, [
        el('span', { class: 'muted', style: 'width:92px', text: dateShort(String(l.at).slice(0, 10)) }),
        el('span', { class: 'grow', text: (l.name ? l.name + ': ' : '') + l.text })
      ])))
    ])]) : null
  ]);
}

function headerCard(p, runs) {
  const facts = [
    ['Client', p.client || '—'], ['Project manager', nameOf(p.managerId)],
    ['Dates', dateShort(p.startDate) + ' → ' + dateShort(p.dueDate) + (p.days ? ' (' + p.days + ' days' + (p.timeline ? ', ' + p.timeline : '') + ')' : '')],
    p.contractNumber ? ['Contract', p.contractNumber + (p.amount ? ' · ' + p.amount : '')] : null
  ].filter(Boolean);
  const actions = [];
  if (isAdmin() && p.quoteId) actions.push(el('a', { href: '/price#/quote/' + p.quoteId, target: '_blank', rel: 'noopener' }, [el('button', { class: 'sm ghost', text: 'Quote & invoices ↗' })]));
  if (runs && p.status === 'active') actions.push(el('button', { class: 'sm', text: 'Mark delivered', onclick: () => {
    const left = (p.progress || {}).open;
    if (!confirm(left ? left + ' task' + (left === 1 ? ' is' : 's are') + ' still open. Mark the project delivered anyway?' : 'Mark “' + p.name + '” as delivered?')) return;
    act({ action: 'projectStatus', id: p.id, status: 'done' }, 'Project delivered').catch(() => {});
  } }));
  if (runs && p.status === 'done') actions.push(el('button', { class: 'sm ghost', text: 'Re-open', onclick: () => act({ action: 'projectStatus', id: p.id, status: 'active' }, 'Project re-opened').catch(() => {}) }));
  if (runs && (p.status === 'review' || p.status === 'active')) actions.push(el('button', { class: 'sm ghost', text: 'Cancel project', onclick: () => {
    if (!confirm('Cancel “' + p.name + '”?' + (p.status === 'active' ? ' Its tasks stay with people until you delete them.' : ' The plan is not sent to anyone.'))) return;
    act({ action: 'projectStatus', id: p.id, status: 'cancelled' }, 'Project cancelled').catch(() => {});
  } }));
  if (isAdmin()) actions.push(el('button', { class: 'sm danger', text: 'Delete', onclick: () => {
    if (!confirm('Delete the project “' + p.name + '”? Tasks already sent stay with people, without the project link.')) return;
    act({ action: 'deleteProject', id: p.id }, 'Project deleted', () => go('#/projects')).catch(() => {});
  } }));
  return card(p.name, null, [
    el('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:12px' }, [projectChip(p), p.status === 'active' && p.progress.overdue ? chip(p.progress.overdue + ' overdue', 'bad') : null]),
    el('div', { class: 'grid2' }, facts.map(([k, v]) => el('div', {}, [el('div', { class: 'muted', style: 'font-size:12.5px', text: k }), el('div', { text: v })]))),
    p.note ? el('p', { class: 'dim', style: 'margin-top:12px;white-space:pre-wrap', text: p.note }) : null
  ], actions.length ? actions : null);
}

/* open tasks per person (what this browser can see), used to show who is busy */
function loadOf() {
  const load = {};
  ((S.data && S.data.tasks) || []).forEach(t => { if (OPEN.includes(t.status)) load[t.employeeId] = (load[t.employeeId] || 0) + 1; });
  return load;
}

/* ---------- the plan, while it is in review ---------- */
let draft = null;          // { id, rows, fields, dirty } — survives re-draws until saved
function planEditor(p) {
  if (!draft || draft.id !== p.id || !draft.dirty) draft = { id: p.id, rows: JSON.parse(JSON.stringify(p.plan || [])), dirty: false,
    fields: { name: p.name, startDate: p.startDate, dueDate: p.dueDate, note: p.note || '', managerId: p.managerId } };
  const d = draft;
  const people = employees().filter(e => e.status !== 'inactive' && (isAdmin() || canManage(e.id)));
  const load = loadOf();
  const holder = el('div');
  const balance = el('div', { class: 'row wrap', style: 'gap:6px' });
  const mark = () => { d.dirty = true; drawBalance(); };

  function drawBalance() {
    const count = {};
    d.rows.forEach(r => { const k = r.externalName ? 'ext:' + r.externalName : r.employeeId; if (k) count[k] = (count[k] || 0) + 1; });
    balance.textContent = '';
    Object.keys(count).sort((a, b) => count[b] - count[a]).forEach(id => balance.appendChild(
      chip(id.startsWith('ext:') ? id.slice(4).split(' ')[0] + ' (outside): ' + count[id] + ' here' : nameOf(id).split(' ')[0] + ': ' + count[id] + ' here · ' + (load[id] || 0) + ' open', id.startsWith('ext:') ? 'info' : '')));
    const none = d.rows.filter(r => !r.employeeId && !r.externalName).length;
    if (none) balance.appendChild(chip(none + ' without a person', 'bad'));
  }

  function rowEl(r, i) {
    const title = input(r.title, { placeholder: 'What needs to be done' });
    title.addEventListener('input', () => { r.title = title.value; mark(); });
    // someone outside the team (a photographer, a printer…) can be named here; only managers and the founder see their tasks
    const EXT = '__outside';
    const who = select(r.externalName ? 'ext' : r.employeeId || '', [{ value: '', label: 'Choose a person' }].concat(people.map(e => ({
      value: e.id, label: e.name + ' · ' + deptName(e.departmentId) + ' · ' + (load[e.id] || 0) + ' open' })),
      r.externalName ? [{ value: 'ext', label: r.externalName + ' (outside the team)' }] : [], [{ value: EXT, label: 'Someone outside the team…' }]));
    who.addEventListener('change', () => {
      if (who.value === EXT) {
        const name = (prompt('Who is it? (e.g. Dawit, photographer). Only managers and the founder see this task.', r.externalName || '') || '').trim();
        if (name) { r.externalName = name; r.employeeId = ''; r.reason = 'Outside the team'; mark(); }
        draw(); return;
      }
      if (who.value === 'ext') return;
      r.externalName = ''; r.employeeId = who.value; r.reason = 'Chosen by hand'; mark();
    });
    const start = input(r.startDate || '', { type: 'date', title: 'Start date' });
    start.addEventListener('change', () => { r.startDate = start.value; mark(); });
    const due = input(r.dueDate, { type: 'date', title: 'Due date' });
    due.addEventListener('change', () => { r.dueDate = due.value; mark(); });
    const pri = select(r.priority || 'normal', Object.keys(PRIORITY_LABEL).map(k => ({ value: k, label: PRIORITY_LABEL[k] })));
    pri.addEventListener('change', () => { r.priority = pri.value; mark(); });
    const desc = textarea(r.description, { placeholder: 'Details for the person (optional)', style: 'min-height:60px' });
    desc.addEventListener('input', () => { r.description = desc.value; mark(); });
    const more = el('details', {}, [el('summary', { class: 'muted', style: 'cursor:pointer;font-size:12.5px', text: (r.category ? r.category + ' · ' : '') + (r.reason || 'details') }), el('div', { style: 'margin-top:8px' }, [desc])]);
    return el('div', { class: 'item', style: 'display:block' }, [
      el('div', { class: 'planrow' }, [
        el('span', { class: 'muted num', text: String(i + 1) }), title, who, start, due, pri,
        el('button', { class: 'sm ghost', title: 'Remove this task', text: '×', onclick: () => { d.rows.splice(i, 1); mark(); draw(); } })
      ]),
      more
    ]);
  }
  function draw() {
    holder.textContent = '';
    holder.appendChild(d.rows.length ? el('div', { class: 'list' }, d.rows.map(rowEl)) : empty('No tasks in the plan', 'Add one below.'));
    drawBalance();
  }
  draw();

  const f = d.fields;
  const nameIn = input(f.name); nameIn.addEventListener('input', () => { f.name = nameIn.value; d.dirty = true; });
  const startIn = input(f.startDate, { type: 'date' }); startIn.addEventListener('change', () => { f.startDate = startIn.value; d.dirty = true; });
  const dueIn = input(f.dueDate, { type: 'date' }); dueIn.addEventListener('change', () => { f.dueDate = dueIn.value; d.dirty = true; });
  const noteIn = textarea(f.note, { placeholder: 'Brief for the team (optional)', style: 'min-height:60px' }); noteIn.addEventListener('input', () => { f.note = noteIn.value; d.dirty = true; });
  const managers = employees().filter(e => e.status !== 'inactive' && (((S.data && S.data.users) || []).some(u => u.employeeId === e.id && u.active && (u.role === 'admin' || u.role === 'manager'))));
  const pmSel = isAdmin() && managers.length ? select(f.managerId, managers.map(e => ({ value: e.id, label: e.name }))) : null;
  if (pmSel) pmSel.addEventListener('change', () => { f.managerId = pmSel.value; d.dirty = true; });

  const payload = () => ({ ...f, plan: d.rows });
  const save = (extra, okText) => act({ action: 'saveProject', id: p.id, project: payload(), ...(extra || {}) }, okText || 'Plan saved', () => { draft = null; render(); }).catch(() => {});

  return frag([
    card('Task plan', 'One task per deliverable, already given to the least busy person in the right department. Change anything, then press Start.', [
      el('div', { class: 'grid2', style: 'margin-bottom:6px' }, [field('Project name', nameIn), pmSel ? field('Project manager', pmSel) : el('span')]),
      el('div', { class: 'grid2' }, [field('Starts', startIn), field('Due', dueIn)]),
      field('Brief for the team', noteIn),
      el('div', { style: 'margin:6px 0 12px' }, [el('div', { class: 'muted', style: 'font-size:12.5px;margin-bottom:6px', text: 'How the work is spread' }), balance]),
      holder,
      el('div', { class: 'row wrap', style: 'margin-top:12px;gap:8px' }, [
        el('button', { class: 'sm', text: '+ Add task', onclick: () => {
          d.rows.push({ key: 'n' + Date.now().toString(36), title: '', description: '', category: '', employeeId: '', reason: 'Added by hand', priority: 'normal', dueDate: f.dueDate || today() });
          mark(); draw();
        } }),
        el('button', { class: 'sm ghost', text: 'Re-balance by workload', title: 'Give every task to the least busy suitable person again', onclick: () => {
          if (!confirm('Re-assign every task to the least busy person in the right department? Your own choices of person are replaced.')) return;
          save({ rebalance: true }, 'Re-balanced');
        } }),
        el('span', { class: 'grow' }),
        el('button', { class: 'sm', text: 'Save plan', onclick: () => save() }),
        el('button', { class: 'primary', text: 'Start project', onclick: () => {
          const missing = d.rows.filter(r => !r.title || !(r.employeeId || r.externalName) || !r.dueDate);
          if (missing.length) { toast('Every task needs a name, a person and a due date (' + missing.length + ' missing).', true); return; }
          const people = new Set(d.rows.map(r => r.externalName ? 'ext:' + r.externalName : r.employeeId)).size;
          if (!confirm('Start “' + f.name + '”? ' + d.rows.length + ' task' + (d.rows.length === 1 ? '' : 's') + ' go to ' + people + ' ' + (people === 1 ? 'person' : 'people') + ' now.')) return;
          act({ action: 'startProject', id: p.id, project: payload() }, 'Project started — tasks sent to the team', () => { draft = null; render(); }).catch(() => {});
        } })
      ])
    ])
  ]);
}

function readOnlyPlan(p) {
  return card('Task plan', 'Waiting for ' + nameOf(p.managerId) + ' to check it and start the project.', [
    (p.plan || []).length ? el('div', { class: 'list' }, p.plan.map(r => el('div', { class: 'item' }, [
      el('span', { class: 'grow' }, [el('b', { text: r.title }), el('small', { text: (r.externalName ? r.externalName + ' (outside the team)' : nameOf(r.employeeId)) + (r.startDate ? ' · ' + dateShort(r.startDate) + ' → ' : ' · due ') + dateShort(r.dueDate) })])
    ]))) : empty('No tasks planned', '')
  ]);
}

/* ---------- once started: the real tasks ---------- */
function liveTasks(p, runs) {
  const tasks = ((S.data && S.data.tasks) || []).filter(t => t.projectId === p.id);
  const open = tasks.filter(t => OPEN.includes(t.status)).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const done = tasks.filter(t => t.status === 'done');
  const pr = p.progress || {};
  const daysLeft = p.dueDate ? daysBetween(today(), p.dueDate) : null;
  const canAdd = runs && p.status === 'active';
  return frag([
    el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
      tile('Done', pr.done + ' / ' + pr.total, pr.pct + '% of the tasks'),
      tile('Handed in', String(pr.handedIn), 'waiting to be checked', () => go('#/tasks-team')),
      tile('Overdue', String(pr.overdue), 'open tasks past due'),
      tile(daysLeft != null && daysLeft < 0 ? 'Late by' : 'Days left', daysLeft == null ? '—' : String(Math.abs(daysLeft)), 'due ' + dateShort(p.dueDate))
    ]),
    el('div', { style: 'margin-bottom:14px' }, [bar(pr.pct, pr.overdue ? 'warn' : 'ok')]),
    card('Open tasks', open.length + ' open', [open.length ? el('div', { class: 'list' }, open.map(t => taskRow(t, true))) : empty('Nothing open', p.status === 'active' ? 'Every task is done. Mark the project delivered when it has gone to the client.' : '')],
      canAdd ? [el('button', { class: 'primary sm', text: 'Add task', onclick: () => taskModal(null, null, { projectId: p.id, project: p.name, client: p.client, dueDate: p.dueDate }) })] : null),
    done.length ? el('div', { style: 'margin-top:14px' }, [card('Finished', done.length + ' done', [el('div', { class: 'list' }, done.map(t => taskRow(t, true)))])]) : null
  ]);
}
