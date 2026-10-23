/* Tasks with deadlines: who is doing what, by when, and how well it landed.
   Managers give tasks to their people and mark them done with a 1–5 quality
   rating. The person moves their own task along (start, blocked, hand in).
   On time = handed in (the accepted hand-in) on or before the due date. */
import { logFollowupModal, OUTCOME_LABEL } from '/team/sales.js';
import { icon } from '/team/icons.js';
import { viewGantt } from '/team/gantt.js';
import {
  el, frag, S, me, employees, empById, subject, canManage, isAdmin, isManager,
  tasksOf, goalsOf, milestonesOf, userName, chip, statusChip, avatar, tile, card, empty, field, input, textarea, select,
  lineChart, pct, score, dateShort, monthShort, today, daysBetween,
  modal, closeModal, noteModal, act, STATUS_LABEL, PRIORITY_LABEL
} from '/team/ui.js';

const render = () => window.dispatchEvent(new Event('gz:render'));
const OPEN = ['todo', 'in_progress', 'blocked', 'submitted'];
/* who runs a task (edits it, marks it done, rates it): an admin, the person's manager, or the manager who gave it */
const runs = t => isAdmin() || (t.externalName && isManager()) || (canManage(t.employeeId) && t.employeeId !== me().employeeId) || (t.assignedBy === me().id && isManager());
/* the person a task belongs to, even when they are outside your team (e.g. a task you gave the founder) */
const personOf = id => empById(id) || ((S.data && S.data.roster) || []).find(r => r.id === id) || null;
/* who does a task: a person with an account, or someone outside the team named on the task (no account) */
export const taskKey = t => t.externalName ? 'ext:' + t.externalName : t.employeeId;
export const taskPerson = t => t.externalName ? { id: taskKey(t), name: t.externalName, external: true } : personOf(t.employeeId);
/* "3 pm", "9:30 am" */
export const timeLabel = hm => { if (!hm) return ''; const [h, m] = hm.split(':').map(Number); return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' am' : ' pm'); };
const dueText = t => dateShort(t.dueDate) + (t.dueTime ? ', ' + timeLabel(t.dueTime) : '');
const byDue = (a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
const byDelivered = (a, b) => String(b.deliveredAt || '').localeCompare(String(a.deliveredAt || ''));

/* ---------- small pieces ---------- */
export function dueChip(t) {
  if (t.status === 'done') return t.daysLate > 0 ? chip(t.daysLate + ' day' + (t.daysLate === 1 ? '' : 's') + ' late', 'bad') : chip('On time', 'ok');
  if (!t.dueDate) return chip('No date');
  const d = daysBetween(today(), t.dueDate);
  if (t.status === 'submitted') {
    const late = t.submittedAt ? daysBetween(t.dueDate, String(t.submittedAt).slice(0, 10)) : -d;
    return chip(late > 0 ? 'Handed in ' + late + ' day' + (late === 1 ? '' : 's') + ' late' : 'Handed in on time', late > 0 ? 'bad' : 'ok');
  }
  if (d < 0) return chip((-d) + ' day' + (d === -1 ? '' : 's') + ' late', 'bad');
  if (d === 0) return chip('Due today' + (t.dueTime ? ' ' + timeLabel(t.dueTime) : ''), 'warn');
  if (d === 1 && t.dueTime) return chip('Due tomorrow ' + timeLabel(t.dueTime), 'warn');
  if (d <= 2) return chip('Due in ' + d + ' day' + (d === 1 ? '' : 's'), 'warn');
  if (t.status === 'todo' && t.startDate && t.startDate > today()) return chip('Starts ' + dateShort(t.startDate).replace(/ \d{4}$/, '') + ' · due ' + dateShort(t.dueDate).replace(/ \d{4}$/, ''));
  return chip('Due ' + (t.dueDate.slice(0, 4) === today().slice(0, 4) ? dateShort(t.dueDate).replace(/ \d{4}$/, '') : dateShort(t.dueDate)) + (t.dueTime ? ', ' + timeLabel(t.dueTime) : ''));
}
const priorityChip = p => p && p !== 'normal' ? chip(PRIORITY_LABEL[p] || p, p === 'urgent' ? 'bad' : p === 'high' ? 'warn' : '') : null;
const meta = t => [t.kind === 'followup' ? '☎ Sales follow-up' : '', t.client, t.project, t.outcome ? OUTCOME_LABEL[t.outcome] : '', t.status === 'done' ? 'delivered ' + dateShort(String(t.deliveredAt || '').slice(0, 10)) : (t.startDate ? dateShort(t.startDate) + ' → ' : 'due ') + dueText(t),
  t.revisions ? t.revisions + ' revision' + (t.revisions === 1 ? '' : 's') : '', t.quality ? 'quality ' + t.quality + '/5' : ''].filter(Boolean).join(' · ');

/* the person's own quick buttons: start → hand in */
function quickButtons(t) {
  const out = [];
  if (t.employeeId !== me().employeeId || t.status === 'done') return out;
  const move = (status, text) => el('button', { class: 'sm', text, onclick: ev => { ev.stopPropagation(); act({ action: 'moveTask', id: t.id, status }, STATUS_LABEL[status]).catch(() => {}); } });
  if (t.status === 'todo') out.push(move('in_progress', 'Start'));
  if (t.status === 'blocked') out.push(move('in_progress', 'Resume'));
  if (t.kind === 'followup' && t.status !== 'submitted') out.push(el('button', { class: 'sm primary', text: 'Log follow-up', onclick: ev => { ev.stopPropagation(); logFollowupModal(t); } }));
  else if (t.status === 'in_progress') out.push(move('submitted', 'Hand in'));
  return out;
}

export function taskRow(t, showPerson) {
  const e = taskPerson(t);
  return el('div', { class: 'item click', style: 'flex-wrap:wrap', onclick: () => taskModal(t) }, [
    showPerson && e ? avatar(e.name, 'sm') : null,
    el('span', { class: 'grow', style: 'min-width:190px' }, [
      el('b', { text: (showPerson && e ? e.name.split(' ')[0] + ' · ' : '') + t.title }),
      el('small', { text: meta(t) })
    ]),
    priorityChip(t.priority), dueChip(t), statusChip(t.status),
    ...quickButtons(t)
  ]);
}

/* four headline numbers for a person (last 90 days) */
export function deliveryTiles(st) {
  return el('div', { class: 'grid4' }, [
    tile('On time', st.onTimePct == null ? '—' : pct(st.onTimePct), st.dated ? st.onTime + ' of ' + st.dated + ' finished tasks' : 'no finished tasks yet'),
    tile('Average days late', st.late ? '+' + score(st.avgDaysLate) : '0', st.late ? 'across ' + st.late + ' late task' + (st.late === 1 ? '' : 's') : 'nothing late'),
    tile('Done per month', String(st.perMonth != null ? st.perMonth : st.done), 'average, last 3 months'),
    tile('Average quality', st.avgQuality == null ? '—' : score(st.avgQuality) + ' / 5', st.rated ? st.rated + ' rated' + (st.avgRevisions ? ' · ' + score(st.avgRevisions) + ' revisions each' : '') : 'rated when marked done')
  ]);
}

/* one line of evidence for reviews: what the task numbers were that month */
export function taskEvidenceLine(te) {
  if (!te || !te.done) return 'No tasks were finished this month.';
  return [
    te.done + ' task' + (te.done === 1 ? '' : 's') + ' finished',
    te.onTimePct != null ? te.onTimePct + '% on time' : '',
    te.late ? te.late + ' late (avg ' + score(te.avgDaysLate) + ' days)' : '',
    te.avgQuality != null ? 'quality ' + score(te.avgQuality) + ' / 5' : '',
    te.avgRevisions ? score(te.avgRevisions) + ' revisions per task' : ''
  ].filter(Boolean).join(' · ');
}
export function taskEvidenceCard(te, sub) {
  return el('div', { class: 'card', style: 'background:var(--soft);border:0' }, [
    el('div', { class: 'row wrap', style: 'justify-content:space-between;gap:8px' }, [
      el('b', { text: 'Evidence from tasks' }), chip('Execution · Quality', 'plum')
    ]),
    el('p', { style: 'margin-top:6px', text: taskEvidenceLine(te) }),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:4px', text: sub || 'For reference when scoring Execution and Quality. It does not change the score by itself.' })
  ]);
}


/* ================= the board: cards in columns, like Notion ================= */
const COLS = [['todo', 'To do'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['submitted', 'Handed in'], ['done', 'Done']];
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
export const taskView = () => store.get('gz-task-view') === 'list' ? 'list' : 'board';
function viewSwitch() {
  const cur = taskView();
  return el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Show tasks as' }, [['board', 'Board'], ['list', 'List']].map(([v, l]) =>
    el('button', { type: 'button', role: 'radio', 'aria-checked': String(cur === v), text: l, onclick: () => { store.set('gz-task-view', v); render(); } })));
}

/* where the signed-in person may move a task */
/* "done" is only for whoever may finish the task (t.canFinish from the server: the person who gave it,
   the founder, or the person themselves for a task they logged); everyone else stops at "Handed in" */
function movesFor(t) {
  const mine = t.employeeId === me().employeeId;
  const managing = runs(t);
  let list = managing ? COLS.map(c => c[0]) : mine && t.status !== 'done' ? ['todo', 'in_progress', 'blocked', 'submitted'] : [];
  list = t.canFinish ? (list.includes('done') ? list : list.concat(['done'])) : list.filter(s => s !== 'done');
  return list.filter(s => s !== t.status);
}

/* a task changes column: the same rules as the buttons (rating to finish, a note when blocked or sent back) */
export function moveTaskTo(t, status) {
  if (!status || status === t.status || !movesFor(t).includes(status)) return;
  const mine = t.employeeId === me().employeeId;
  const managing = runs(t);
  const done = () => { closeModal(); render(); };
  if (status === 'done') return rateModal(t);
  if (t.canFinish === 'rate' && t.status === 'submitted' && status === 'in_progress') {
    return noteModal('Send back for changes', 'The task goes back to in progress and counts as one revision.', 'What needs to change?', 'Send back',
      note => act({ action: 'reviseTask', id: t.id, note }, 'Sent back — revision counted', done), { required: true, label: 'What needs to change' });
  }
  if (status === 'blocked') {
    return noteModal('What is blocking it?', mine ? 'Your manager sees this note on the task.' : 'The note is kept on the task.', 'e.g. waiting for the client’s logo files', 'Mark as blocked',
      note => act({ action: 'moveTask', id: t.id, status: 'blocked', note }, STATUS_LABEL.blocked, done).catch(() => {}), { label: 'What is blocking it' });
  }
  if (t.kind === 'followup' && status === 'submitted' && mine) return logFollowupModal(t);
  act({ action: 'moveTask', id: t.id, status }, STATUS_LABEL[status], render).catch(() => {});
}

/* finishing a task: big or long tasks get a 1–5 quality rating; small ones can be marked done without one */
function rateModal(t) {
  let q = 0;
  const note = input('', { placeholder: 'What made it good, or what was missing (optional)' });
  const labels = ['Well below the standard', 'Below the standard', 'Meets the standard', 'Above the standard', 'Exceptional'];
  const hint = el('p', { class: 'muted', style: 'font-size:13px;min-height:20px;margin:8px 0 4px', text: 'Tap a rating' });
  const stars = el('div', { class: 'rate' }, [1, 2, 3, 4, 5].map(v => el('button', { type: 'button', 'aria-pressed': 'false', text: String(v), onclick: () => {
    q = v; hint.textContent = v + ' — ' + labels[v - 1];
    stars.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i < v)));
  } })));
  const finish = rating => act({ action: 'finishTask', id: t.id, quality: rating, qualityNote: note.value }, rating ? 'Done · rated ' + rating + '/5' : 'Marked done', () => { closeModal(); render(); }).catch(() => {});
  // your own task (one you logged yourself, or the founder's own): done, but nobody rates their own work
  if (t.canFinish === 'done') return modal('Mark “' + t.title + '” done', [field('Note', note, 'Optional')], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: () => { closeModal(); render(); } }),
    el('button', { class: 'primary', text: 'Mark done', onclick: () => finish(0) })
  ], { sub: 'You don’t rate your own work. ' + (isAdmin() ? 'A manager can rate it.' : 'Your manager or the founder can rate it.') });
  modal('Mark “' + t.title + '” done', [field('Quality', stars), hint, field('Comment', note),
    el('p', { class: 'muted', style: 'font-size:12.5px', text: 'Rate big and long tasks. Small, quick tasks don’t need a rating: mark them done without one.' })], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: () => { closeModal(); render(); } }),
    el('button', { text: 'Small task, no rating', onclick: () => finish(0) }),
    el('button', { class: 'primary', text: 'Mark done', onclick: () => {
      if (!q) { hint.textContent = 'Tap a rating from 1 to 5, or use “Small task, no rating”.'; return; }
      finish(q);
    } })
  ], { sub: 'The person and their managers see the rating, nobody else. It counts toward their quality score and their review.' });
}

function moveSheet(t) {
  const moves = movesFor(t);
  modal('Move “' + t.title + '”', [el('div', { class: 'movegrid' }, COLS.map(([s, label]) => el('button', {
    type: 'button', class: s === t.status ? 'primary' : '', disabled: s !== t.status && !moves.includes(s),
    onclick: () => { if (s === t.status) return closeModal(); closeModal(); moveTaskTo(t, s); }
  }, [el('span', { class: 'dot s-' + s }), label])))], [el('button', { class: 'ghost', text: 'Close', onclick: closeModal })], { sub: 'Pick the column it belongs in now.' });
}

function boardCard(t, showPerson, list) {
  const e = taskPerson(t);
  const moves = movesFor(t);
  const dark = t.priority === 'urgent' && t.status !== 'done';      // urgent work stands out as a black card
  const c = el('div', { class: 'tcard' + (moves.length ? ' can' : '') + (dark ? ' dark' : ''), tabindex: '0', 'data-id': t.id, role: 'button', 'aria-label': t.title }, [
    el('div', { class: 'tc-tags' }, [t.kind === 'followup' ? chip('☎ Follow-up', 'info') : null, priorityChip(t.priority), t.revisions ? chip(t.revisions + ' rev.', '') : null]),
    el('b', { text: t.title }),
    t.client || t.project ? el('small', { text: [t.client, t.project && t.project !== t.client ? t.project : ''].filter(Boolean).join(' · ') }) : null,
    el('div', { class: 'tc-foot' }, [
      showPerson && e ? (e.external ? chip(e.name.split(' ')[0], 'info') : avatar(e.name, 'xs')) : null,
      dueChip(t),
      el('span', { class: 'grow' }),
      t.quality ? el('span', { class: 'muted num', style: 'font-size:12px', text: '★ ' + t.quality }) : null,
      t.kind === 'followup' && t.employeeId === me().employeeId && !['done', 'submitted'].includes(t.status)
        ? el('button', { class: 'sm primary', type: 'button', text: 'Log follow-up', onclick: ev => { ev.stopPropagation(); logFollowupModal(t); } }) : null,
      moves.length ? el('button', { class: 'tc-move', type: 'button', 'aria-label': 'Move to another column', onclick: ev => { ev.stopPropagation(); moveSheet(t); } }, [icon('more', 16)]) : null
    ])
  ]);
  c.addEventListener('keydown', ev => { if (ev.key === 'Enter') openCard(t, list); });
  return c;
}
const openCard = (t, list) => taskModal(t, null, null, { list, i: list.indexOf(t) });

export function taskBoard(list, opts) {
  const o = opts || {};
  const cutoff = new Date(Date.now() - 21 * 86400000).toISOString();
  const cols = COLS.map(([s, label]) => {
    let items = list.filter(t => t.status === s);
    items = s === 'done' ? items.filter(t => String(t.completedAt || t.deliveredAt || '') >= cutoff).sort(byDelivered) : items.sort(byDue);
    return { s, label, items };
  });
  const flat = cols.flatMap(c => c.items);
  const board = el('div', { class: 'kanban' }, cols.map(c => el('section', { class: 'kcol', 'data-status': c.s }, [
    el('header', {}, [el('span', { class: 'dot s-' + c.s }), el('b', { text: c.label }), el('span', { class: 'muted num', text: String(c.items.length) }),
      c.s === 'done' ? el('small', { class: 'muted', text: 'last 3 weeks' }) : null]),
    el('div', { class: 'kitems' }, c.items.length ? c.items.map(t => boardCard(t, o.showPerson, flat)) : [el('div', { class: 'kempty', text: c.s === 'todo' && o.emptyText ? o.emptyText : 'Nothing here' })])
  ])));
  enableDrag(board, flat);
  return board;
}

/* drag a card to another column: mouse right away, touch after a short press (so the board still scrolls).
   One set of window listeners for every board; `drag` holds the card being moved. */
let drag = null;
const colAt = (x, y) => { const n = document.elementFromPoint(x, y); return n && n.closest ? n.closest('.kcol') : null; };
const stopScroll = ev => { if (drag && drag.dragging) ev.preventDefault(); };
function dragBegin() {
  const st = drag;
  st.dragging = true;
  const r = st.card.getBoundingClientRect();
  st.dx = st.x - r.left; st.dy = st.y - r.top;
  st.ghost = st.card.cloneNode(true);
  st.ghost.classList.add('ghost');
  st.ghost.style.width = r.width + 'px';
  document.body.appendChild(st.ghost);
  st.card.classList.add('lifted');
  const moves = movesFor(st.task);
  st.board.querySelectorAll('.kcol').forEach(k => k.classList.toggle('no', k.dataset.status !== st.task.status && !moves.includes(k.dataset.status)));
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* not allowed */ }
  dragPlace();
}
function dragPlace() {
  const st = drag;
  st.ghost.style.transform = 'translate(' + (st.x - st.dx) + 'px,' + (st.y - st.dy) + 'px) rotate(2deg)';
  const k = colAt(st.x, st.y);
  st.board.querySelectorAll('.kcol').forEach(c => c.classList.toggle('over', c === k && !c.classList.contains('no')));
  const r = st.board.getBoundingClientRect();        // near the edge: scroll the board sideways
  if (st.x < r.left + 36) st.board.scrollLeft -= 14; else if (st.x > r.right - 36) st.board.scrollLeft += 14;
}
function dragEnd(ev, cancel) {
  if (!drag) return;
  const st = drag; drag = null;
  clearTimeout(st.timer);
  document.removeEventListener('touchmove', stopScroll);
  if (!st.dragging) return;
  if (ev && ev.preventDefault) ev.preventDefault();
  st.ghost.remove();
  st.card.classList.remove('lifted');
  st.board.querySelectorAll('.kcol').forEach(c => c.classList.remove('over', 'no'));
  st.board.dataset.dragged = '1';
  setTimeout(() => { delete st.board.dataset.dragged; }, 60);
  const k = cancel ? null : colAt(st.x, st.y);
  if (k && k.dataset.status !== st.task.status) moveTaskTo(st.task, k.dataset.status);
}
window.addEventListener('pointermove', ev => {
  if (!drag) return;
  drag.x = ev.clientX; drag.y = ev.clientY;
  if (!drag.dragging) {
    const far = Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) > 8;
    if (far && drag.touch) { dragEnd(null, true); return; }      // the finger is scrolling, not dragging
    if (far) dragBegin();
    return;
  }
  dragPlace();
});
window.addEventListener('pointerup', ev => dragEnd(ev));
window.addEventListener('pointercancel', ev => dragEnd(ev, !(drag && drag.dragging)));

function enableDrag(board, flat) {
  const byId = id => flat.find(t => t.id === id);
  board.addEventListener('pointerdown', ev => {
    const card = ev.target.closest('.tcard');
    if (!card || ev.button > 0 || ev.target.closest('button')) return;
    const task = byId(card.dataset.id);
    if (!task || !movesFor(task).length) return;
    drag = { board, card, task, x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, touch: ev.pointerType !== 'mouse', dragging: false };
    if (drag.touch) {
      document.addEventListener('touchmove', stopScroll, { passive: false });
      drag.timer = setTimeout(() => { if (drag && !drag.dragging) dragBegin(); }, 260);
    }
  });
  board.addEventListener('click', ev => {
    if (board.dataset.dragged) return;
    const card = ev.target.closest('.tcard');
    if (!card || ev.target.closest('button')) return;
    const t = byId(card.dataset.id);
    if (t) openCard(t, flat);
  });
  board.addEventListener('contextmenu', ev => { if (ev.target.closest('.tcard')) ev.preventDefault(); });
}

/* ================= my tasks ================= */
export function viewMyTasks() {
  const emp = subject();
  if (!emp) return empty('No employee record', 'Your account is not linked to a team member yet.');
  const all = tasksOf(emp.id);
  const open = all.filter(t => OPEN.includes(t.status)).sort(byDue);
  const done = all.filter(t => t.status === 'done').sort(byDelivered);
  const managing = canManage(emp.id) || (isManager() && emp.id === me().employeeId);      // managers give themselves tasks too
  const bar = el('div', { class: 'salesbar' }, [viewSwitch(), el('span', { class: 'grow' }),
    el('span', { class: 'muted', style: 'font-size:13px', text: taskView() === 'board' ? 'Drag a card to move it, or tap ⋯' : '' }),
    managing ? el('button', { class: 'primary sm', text: 'New task', onclick: () => taskModal(null, emp) }) : null]);
  if (taskView() === 'board') return frag([
    el('div', { style: 'margin-bottom:14px' }, [deliveryTiles(emp.tasks.recent)]),
    bar,
    taskBoard(all, { emptyText: managing ? 'Give a task with a due date.' : 'Tasks your manager gives you appear here.' })
  ]);
  return frag([
    el('div', { style: 'margin-bottom:14px' }, [deliveryTiles(emp.tasks.recent)]),
    bar,
    card('Open tasks', open.length ? open.length + ' open' : null, [
      open.length ? el('div', { class: 'list' }, open.map(t => taskRow(t))) :
        empty('Nothing open', managing ? 'Give a task with a due date.' : 'Tasks your manager gives you will appear here.')
    ], managing ? [el('button', { class: 'primary sm', text: 'New task', onclick: () => taskModal(null, emp) })] : null),
    el('div', { style: 'margin-top:14px' }, [card('Finished', done.length ? done.length + ' done' : null, [
      done.length ? el('div', { class: 'list' }, done.slice(0, 30).map(t => taskRow(t))) : empty('Nothing finished yet', '')
    ])])
  ]);
}

/* dashboard card for one person */
export function tasksCard(emp) {
  const open = tasksOf(emp.id).filter(t => OPEN.includes(t.status)).sort(byDue);
  const st = emp.tasks.recent;
  return card('Tasks', 'Last 90 days: ' + (st.onTimePct == null ? 'nothing finished yet' : st.onTimePct + '% on time · ' + st.done + ' done') +
    (st.avgQuality != null ? ' · quality ' + score(st.avgQuality) + ' / 5' : ''), [
    open.length ? el('div', { class: 'list' }, open.slice(0, 4).map(t => taskRow(t))) : empty('No open tasks', 'Nothing is waiting on you.')
  ], [el('button', { class: 'sm ghost', text: 'All tasks', onclick: () => { location.hash = '#/tasks'; } })]);
}

/* ================= team tasks ================= */
const teamFilter = { person: '', show: 'open' };   // kept while the page re-draws after a save
export function viewTeamTasks() {
  // your team and yourself: the founder's and the manager's own tasks are on the board too
  const people = employees().filter(e => (canManage(e.id) || e.id === me().employeeId) && e.status !== 'inactive');
  // anyone else whose tasks the server sends you (for a manager: the founder's)
  const outside = [...new Set(((S.data && S.data.tasks) || []).filter(t => !t.externalName && t.employeeId && !people.some(e => e.id === t.employeeId)).map(t => t.employeeId))]
    .map(personOf).filter(Boolean);
  // people outside the team (a photographer, a printer…): only managers and the founder see their tasks
  const externals = [...new Map(((S.data && S.data.tasks) || []).filter(t => t.externalName).map(t => [taskKey(t), taskPerson(t)])).values()];
  outside.push(...externals.map(x => ({ ...x, name: x.name + ' (outside)' })));
  const ids = new Set(people.concat(outside).map(e => e.id));
  const state = teamFilter;
  if (state.person && !ids.has(state.person)) state.person = '';
  const listBox = el('div');
  const personSel = select(state.person, [{ value: '', label: 'Everyone' }].concat(people.concat(outside).map(e => ({ value: e.id, label: e.name }))), { onchange: ev => { state.person = ev.target.value; draw(); } });
  const showSel = select(state.show, [
    { value: 'open', label: 'Open' }, { value: 'submitted', label: 'Handed in — to check' }, { value: 'overdue', label: 'Overdue' },
    { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }
  ], { onchange: ev => { state.show = ev.target.value; draw(); } });

  function draw() {
    const now = today();
    let list = ((S.data && S.data.tasks) || []).filter(t => ids.has(taskKey(t)) && (!state.person || taskKey(t) === state.person));
    listBox.textContent = '';
    if (taskView() === 'board') { showSel.hidden = true; listBox.appendChild(taskBoard(list, { showPerson: true, emptyText: 'Give someone a task.' })); return; }
    showSel.hidden = false;
    list = list.filter(t => state.show === 'all' ? true : state.show === 'open' ? OPEN.includes(t.status)
      : state.show === 'overdue' ? OPEN.includes(t.status) && t.status !== 'submitted' && t.dueDate && t.dueDate < now : t.status === state.show);
    list.sort(state.show === 'done' ? byDelivered : byDue);
    listBox.textContent = '';
    listBox.appendChild(list.length ? el('div', { class: 'list' }, list.slice(0, 150).map(t => taskRow(t, true))) : empty('No tasks here', 'Try a different filter.'));
  }
  draw();

  const all = ((S.data && S.data.tasks) || []).filter(t => ids.has(taskKey(t)));
  const waiting = all.filter(t => t.status === 'submitted').length;
  const overdue = all.filter(t => OPEN.includes(t.status) && t.status !== 'submitted' && t.dueDate && t.dueDate < today()).length;
  return frag([
    el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
      tile('Open', String(all.filter(t => OPEN.includes(t.status)).length), 'across ' + people.length + ' people', () => { showSel.value = 'open'; state.show = 'open'; draw(); }),
      tile('Handed in', String(waiting), 'waiting for you to check', () => { showSel.value = 'submitted'; state.show = 'submitted'; draw(); }),
      tile('Overdue', String(overdue), 'past the due date', () => { showSel.value = 'overdue'; state.show = 'overdue'; draw(); }),
      teamOnTimeTile(people)
    ]),
    el('div', { class: 'tablecard boardcard' }, [
      el('div', { class: 'toolbar' }, [viewSwitch(), personSel, showSel, el('span', { class: 'grow' }),
        el('button', { class: 'primary sm', text: 'New task', onclick: () => taskModal(null, state.person && !state.person.startsWith('ext:') ? personOf(state.person) : null) })]),
      el('div', { style: 'padding:6px 16px 14px' }, [listBox])
    ]),
    el('div', { style: 'margin-top:14px' }, [viewGantt()]),
    el('div', { style: 'margin-top:14px' }, [deliveryTable(people)])
  ]);
}

/* team-wide numbers built from each person's last-90-day figures */
export function teamDelivery(people) {
  const t = { done: 0, dated: 0, onTime: 0, lateDays: 0, late: 0, rated: 0, quality: 0, overdue: 0, waiting: 0, open: 0 };
  people.forEach(e => {
    const r = e.tasks.recent;
    t.done += r.done; t.dated += r.dated; t.onTime += r.onTime; t.late += r.late; t.lateDays += r.avgDaysLate * r.late;
    t.rated += r.rated; t.quality += (r.avgQuality || 0) * r.rated; t.overdue += r.overdue; t.waiting += r.waiting; t.open += r.open;
  });
  return { ...t, onTimePct: t.dated ? Math.round(t.onTime / t.dated * 100) : null, avgQuality: t.rated ? t.quality / t.rated : null, avgDaysLate: t.late ? t.lateDays / t.late : 0 };
}
function teamOnTimeTile(people) {
  const t = teamDelivery(people);
  return tile('On time', t.onTimePct == null ? '—' : pct(t.onTimePct), 'team, last 90 days');
}
/* on-time % by month across the team */
export function onTimeChart(people) {
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return d.toISOString().slice(0, 7); });
  const pts = months.map(m => {
    let dated = 0, onTime = 0;
    people.forEach(e => { const st = (e.tasks.months || {})[m]; if (st) { dated += st.dated; onTime += st.onTime; } });
    return dated ? { label: monthShort(m), value: Math.round(onTime / dated * 100), n: dated } : null;
  }).filter(Boolean);
  return pts.length ? el('div', {}, [
    lineChart(pts, { max: 100, min: 0, height: 130, color: 'var(--ok)', fill: 'var(--okSoft)' }),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:8px', text: pts[pts.length - 1].label + ': ' + pts[pts.length - 1].value + '% of ' + pts[pts.length - 1].n + ' finished tasks on time' })
  ]) : empty('No finished tasks yet', 'The trend appears once tasks are marked done.');
}

export function deliveryTable(people) {
  const rows = people.slice().sort((a, b) => (b.tasks.recent.done - a.tasks.recent.done) || a.name.localeCompare(b.name));
  return card('Delivery by person', 'Last 90 days · on time means handed in on or before the due date', [
    rows.length ? el('table', { class: 'responsive' }, [
      el('thead', {}, [el('tr', {}, ['Person', 'On time', 'Avg days late', 'Done / month', 'Avg quality', 'Revisions', 'Open', 'Overdue'].map(h => el('th', { text: h })))]),
      el('tbody', {}, rows.map(e => {
        const r = e.tasks.recent;
        return el('tr', { class: 'click', onclick: () => { location.hash = '#/people/' + e.id + '/tasks'; } }, [
          el('td', { 'data-l': 'Person' }, [el('div', { class: 'row' }, [avatar(e.name, 'sm'), el('b', { text: e.name })])]),
          el('td', { 'data-l': 'On time' }, [r.onTimePct == null ? '—' : chip(r.onTimePct + '%', r.onTimePct >= 85 ? 'ok' : r.onTimePct >= 65 ? 'warn' : 'bad')]),
          el('td', { 'data-l': 'Avg days late', class: 'num', text: r.late ? '+' + score(r.avgDaysLate) : '0' }),
          el('td', { 'data-l': 'Done / month', class: 'num', text: r.perMonth }),
          el('td', { 'data-l': 'Avg quality', class: 'num', text: r.avgQuality == null ? '—' : score(r.avgQuality) }),
          el('td', { 'data-l': 'Revisions', class: 'num', text: r.done ? score(r.avgRevisions) : '—' }),
          el('td', { 'data-l': 'Open', class: 'num', text: r.open }),
          el('td', { 'data-l': 'Overdue' }, [r.overdue ? chip(String(r.overdue), 'bad') : el('span', { class: 'muted', text: '0' })])
        ]);
      }))
    ]) : empty('Nobody to show', '')
  ]);
}

/* person page tab */
export function personTasks(e, managing) {
  const all = tasksOf(e.id);
  const open = all.filter(t => OPEN.includes(t.status)).sort(byDue);
  const done = all.filter(t => t.status === 'done').sort(byDelivered);
  return frag([
    el('div', { style: 'margin-bottom:14px' }, [deliveryTiles(e.tasks.recent)]),
    card('Open', null, [open.length ? el('div', { class: 'list' }, open.map(t => taskRow(t))) : empty('Nothing open', '')],
      managing ? [el('button', { class: 'primary sm', text: 'New task', onclick: () => taskModal(null, e) })] : null),
    el('div', { style: 'margin-top:14px' }, [card('Finished', done.length + ' done', [
      done.length ? el('div', { class: 'list' }, done.slice(0, 40).map(t => taskRow(t))) : empty('Nothing finished yet', '')
    ])])
  ]);
}

/* the goal or milestone a task counts toward (title), if any */
export const linkedTo = t => {
  const g = t.goalId && ((S.data && S.data.goals) || []).find(x => x.id === t.goalId);
  const m = t.milestoneId && ((S.data && S.data.milestones) || []).find(x => x.id === t.milestoneId);
  return g ? 'Goal: ' + g.title : m ? 'Milestone: ' + m.title : '';
};
/* rated tasks behind a goal or milestone: "3 tasks done · 4.3★ average" */
export function linkedTasks(kind, id) {
  const list = ((S.data && S.data.tasks) || []).filter(t => (kind === 'goal' ? t.goalId : t.milestoneId) === id);
  const done = list.filter(t => t.status === 'done'), rated = done.filter(t => t.quality);
  const avg = rated.length ? rated.reduce((s2, t) => s2 + Number(t.quality), 0) / rated.length : null;
  return { list, done, avg, text: list.length ? done.length + ' of ' + list.length + ' linked task' + (list.length === 1 ? '' : 's') + ' done' + (avg != null ? ' · ' + score(avg) + '★ average' : '') : '' };
}

/* ================= the task window ================= */
export function taskModal(task, emp, preset, nav) {
  const t = task || { status: 'todo', priority: 'normal', employeeId: emp ? emp.id : '', dueDate: '', ...(preset || {}) };
  const managing = task ? runs(t) : true;
  const person = taskPerson(t);
  const body = [];
  const f = {};

  if (managing) {
    const people = (S.data.assignable || employees().filter(e => canManage(e.id) && e.status !== 'inactive'));
    f.title = input(t.title, { placeholder: 'e.g. Social media kit for Dalga' });
    // managers can also give work to someone outside the team: no account, the team does not see it
    const EXT = '__outside';
    f.employeeId = select(t.externalName ? EXT : t.employeeId || '', [{ value: '', label: 'Choose a person' }].concat(people.map(e => ({ value: e.id, label: e.name })),
      isManager() ? [{ value: EXT, label: 'Someone outside the team…' }] : []));
    f.externalName = input(t.externalName || '', { placeholder: 'Their name, e.g. Dawit (photographer)' });
    const extBox = field('Name (only managers and the founder see this task)', f.externalName);
    const syncExt = () => { extBox.style.display = f.employeeId.value === EXT ? '' : 'none'; };
    f.employeeId.addEventListener('change', () => { syncExt(); if (f.employeeId.value === EXT) f.externalName.focus(); });
    syncExt();
    f.ext = EXT; f.extBox = extBox;
    f.client = input(t.client, { placeholder: 'Client' });
    f.project = input(t.project, { placeholder: 'Project (optional)' });
    f.startDate = input(t.startDate || '', { type: 'date' });
    f.dueDate = input(t.dueDate, { type: 'date' });
    f.dueTime = input(t.dueTime || '', { type: 'time', step: 900 });
    f.priority = select(t.priority || 'normal', Object.keys(PRIORITY_LABEL).map(k => ({ value: k, label: PRIORITY_LABEL[k] })));
    f.status = select(t.status, ['todo', 'in_progress', 'blocked', 'submitted'].concat(t.status === 'done' || (!task && t.canFinish) ? ['done'] : []).map(s => ({ value: s, label: STATUS_LABEL[s] })));
    f.quality = select(t.quality ? String(t.quality) : '', [{ value: '', label: 'Not rated (small task)' }].concat([1, 2, 3, 4, 5].map(v => ({ value: String(v), label: v + ' — ' + ['Well below the standard', 'Below the standard', 'Meets the standard', 'Above the standard', 'Exceptional'][v - 1] }))));
    f.qualityNote = input(t.qualityNote, { placeholder: 'What made it good, or what was missing (optional)' });
    f.description = textarea(t.description, { placeholder: 'What needs to be delivered, and what good looks like' });
    // the task can count toward one of the person's goals or milestones: its rating then shows there and in their review
    f.goalId = select('', []); f.milestoneId = select('', []);
    const linkBox = el('div', { class: 'grid2' }, [field('Counts toward a goal', f.goalId), field('Or a milestone', f.milestoneId, 'Its rating shows there as evidence')]);
    const fillLinks = () => {
      const pid = f.employeeId.value;
      const gs = goalsOf(pid).filter(g => !['cancelled', 'completed'].includes(g.status) || g.id === t.goalId);
      const ms = milestonesOf(pid).filter(m => !['achieved', 'reviewed'].includes(m.status) || m.id === t.milestoneId);
      const put = (sel, rows, cur) => { sel.textContent = ''; [{ id: '', title: 'None' }].concat(rows).forEach(r => sel.appendChild(el('option', { value: r.id, text: r.title }))); sel.value = rows.some(r => r.id === cur) ? cur : ''; };
      put(f.goalId, gs, t.goalId); put(f.milestoneId, ms, t.milestoneId);
      linkBox.style.display = gs.length || ms.length ? '' : 'none';
    };
    f.employeeId.addEventListener('change', fillLinks);
    fillLinks();
    const qualityBox = el('div', { class: 'card', style: 'background:var(--soft);border:0;margin-bottom:12px' }, [
      el('div', { class: 'grid2' }, [field('Quality', f.quality, 'Rate big and long tasks; small ones can stay unrated'), field('Comment', f.qualityNote)])
    ]);
    const syncQuality = () => { qualityBox.style.display = f.status.value === 'done' && (!task || t.canFinish === 'rate') ? '' : 'none'; };
    f.status.addEventListener('change', syncQuality);
    syncQuality();
    body.push(field('Task', f.title),
      el('div', { class: 'grid2' }, [field('Assigned to', f.employeeId), field('Priority', f.priority)]),
      f.extBox,
      el('div', { class: 'grid3' }, [field('Start date', f.startDate), field('Due date', f.dueDate), field('Due time', f.dueTime, 'Optional · 5 pm if empty')]),
      el('div', { class: 'grid2' }, [field('Client', f.client), field('Project', f.project)]),
      linkBox,
      field('Status', f.status),
      qualityBox,
      field('Details', f.description));
  } else {
    body.push(
      el('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:10px' }, [statusChip(t.status), dueChip(t), priorityChip(t.priority)]),
      el('p', { class: 'dim', style: 'margin-bottom:10px', text: [t.client, t.project, t.startDate ? 'starts ' + dateShort(t.startDate) : '', 'due ' + dueText(t), 'from ' + (t.assignedByName || userName(t.assignedBy) || 'your manager')].filter(Boolean).join(' · ') }),
      linkedTo(t) ? el('p', { style: 'margin-bottom:10px' }, [chip('Counts toward', 'accent'), ' ', linkedTo(t)]) : null,
      t.description ? el('p', { style: 'white-space:pre-wrap;margin-bottom:12px', text: t.description }) : null,
      t.status === 'done' && !t.ratingHidden ? el('p', { style: 'margin-bottom:12px' }, [el('b', { text: t.quality ? 'Quality ' + t.quality + ' / 5' : 'Not rated (small task)' }), t.qualityNote ? ' · ' + t.qualityNote : '']) : null
    );
  }

  let addedEvidence = false;
  if (task) {
    // evidence is saved on its own; the window stays open so unsaved edits above are kept
    const ev = input('', { placeholder: 'Link to the work, or a short note' });
    const evList = el('div', { class: 'stack', style: 'margin-bottom:12px' });
    const drawEvidence = list => {
      evList.textContent = '';
      evList.hidden = !list.length;
      list.forEach(e => evList.appendChild(el('div', { class: 'item' }, [
        el('span', { class: 'grow' }, [el('b', { text: e.text || 'Link' }), e.url ? el('small', {}, [el('a', { href: e.url, target: '_blank', rel: 'noopener', text: e.url })]) : null]),
        chip(dateShort(String(e.at).slice(0, 10)))
      ])));
    };
    drawEvidence(t.evidence || []);
    const addBtn = el('button', { class: 'sm', type: 'button', text: 'Add', onclick: () => {
      const v = ev.value.trim();
      if (!v) { ev.focus(); return; }
      const isUrl = /^https?:\/\//i.test(v);
      addBtn.disabled = true;
      act({ action: 'addEvidence', kind: 'task', id: t.id, text: isUrl ? '' : v, url: isUrl ? v : '' }, 'Evidence added', () => {
        addedEvidence = true;
        ev.value = '';
        const fresh = ((S.data && S.data.tasks) || []).find(x => x.id === t.id);
        drawEvidence((fresh && fresh.evidence) || []);
      }).catch(() => {}).finally(() => { addBtn.disabled = false; });
    } });
    ev.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });
    body.push(field('Evidence', el('div', { class: 'row' }, [ev, addBtn])), evList,
    (t.log || []).length ? el('details', {}, [el('summary', { class: 'muted', style: 'cursor:pointer;font-size:13px', text: 'History (' + t.log.length + ')' }),
      el('div', { class: 'list', style: 'margin-top:8px' }, t.log.slice().reverse().map(l => el('div', { class: 'row', style: 'gap:10px;font-size:13px' }, [
        el('span', { class: 'muted', style: 'width:92px', text: dateShort(String(l.at).slice(0, 10)) }),
        el('span', { class: 'grow', text: (l.name || '') + ': ' + (STATUS_LABEL[l.from] || l.from) + ' → ' + (STATUS_LABEL[l.to] || l.to) + (l.note ? ' · ' + l.note : '') })
      ])))]) : null);
  }

  const mine = task && t.employeeId === me().employeeId && t.status !== 'done';
  const move = (status, text, cls) => el('button', { class: cls || '', text, onclick: () => act({ action: 'moveTask', id: t.id, status }, STATUS_LABEL[status], () => { closeModal(); render(); }) });

  const dlg = modal(task ? (managing ? 'Task' : t.title) : 'New task' + (person ? ' for ' + person.name : ''), body, [
    task && managing ? el('button', { class: 'danger', text: 'Delete', onclick: () => {
      if (!confirm('Delete this task?')) return;
      act({ action: 'deleteTask', id: t.id }, 'Task deleted', () => { closeModal(); render(); });
    } }) : null,
    task && t.canFinish === 'rate' && t.status === 'submitted' ? el('button', { text: 'Send back for changes', onclick: () => noteModal('Send back for changes',
      'The task goes back to in progress and counts as one revision.', 'What needs to change?', 'Send back',
      note => act({ action: 'reviseTask', id: t.id, note }, 'Sent back — revision counted', () => { closeModal(); render(); }), { required: true, label: 'What needs to change' }) }) : null,
    task && t.canFinish && t.status !== 'done' ? el('button', { text: 'Mark done', onclick: () => rateModal(t) }) : null,
    mine && t.status === 'todo' ? move('in_progress', 'Start') : null,
    mine && ['todo', 'in_progress'].includes(t.status) ? el('button', { text: 'I’m blocked', onclick: () => noteModal('What is blocking you?',
      'Your manager sees this note on the task.', 'e.g. waiting for the client’s logo files', 'Mark as blocked',
      note => act({ action: 'moveTask', id: t.id, status: 'blocked', note }, STATUS_LABEL.blocked, () => { closeModal(); render(); }).catch(() => {}), { label: 'What is blocking it' }) }) : null,
    mine && t.status === 'blocked' ? move('in_progress', 'Resume') : null,
    task && t.kind === 'followup' && t.status !== 'done' && (mine || managing) ? el('button', { class: 'primary', text: 'Log how it went', onclick: () => logFollowupModal(t) }) : null,
    task && t.kind === 'followup' ? el('button', { class: 'ghost', text: 'Sales pipeline', onclick: () => { closeModal(); location.hash = '#/sales'; } }) : null,
    task && t.leadId ? el('button', { class: 'ghost', text: 'Open lead', onclick: () => { closeModal(); location.hash = '#/sales/lead/' + t.leadId; } }) : null,
    mine && t.kind !== 'followup' && ['in_progress', 'blocked', 'todo'].includes(t.status) ? move('submitted', 'Hand in', 'primary') : null,
    el('button', { class: 'ghost', text: managing ? 'Cancel' : 'Close', onclick: closeModal }),
    managing ? el('button', { class: 'primary', text: 'Save', onclick: () => {
      act({ action: 'saveTask', task: {
        id: t.id, employeeId: f.employeeId.value === f.ext ? '' : f.employeeId.value, externalName: f.employeeId.value === f.ext ? f.externalName.value : '',
        title: f.title.value, client: f.client.value, project: f.project.value,
        startDate: f.startDate.value, dueDate: f.dueDate.value, dueTime: f.dueTime.value, priority: f.priority.value, status: f.status.value, description: f.description.value,
        quality: f.quality.value ? Number(f.quality.value) : (t.status === 'done' || f.status.value === 'done' ? 0 : null), qualityNote: f.qualityNote.value,
        goalId: f.goalId.value, milestoneId: f.milestoneId.value,
        projectId: task ? undefined : t.projectId
      } }, task ? 'Task saved' : 'Task given', () => { closeModal(); render(); }).catch(() => {});
    } }) : null
  ]);
  // step through the cards without closing the window
  if (task && nav && nav.list && nav.list.length > 1 && nav.i >= 0) {
    const n = nav.list.length, i = nav.i;
    const step = d => taskModal(nav.list[(i + d + n) % n], null, null, { list: nav.list, i: (i + d + n) % n });
    const h = dlg.querySelector('h2');
    const head = el('div', { class: 'mhead' });
    h.replaceWith(head);
    head.append(h, el('div', { class: 'row', style: 'gap:6px' }, [
      el('button', { class: 'icon', type: 'button', 'aria-label': 'Previous task', onclick: () => step(-1) }, [icon('prev', 14)]),
      el('span', { class: 'muted num', style: 'font-size:12.5px', text: (i + 1) + ' / ' + n }),
      el('button', { class: 'icon', type: 'button', 'aria-label': 'Next task', onclick: () => step(1) }, [icon('next', 14)])
    ]));
  }
  // evidence added while the window was open: refresh the page behind it once it closes
  dlg.addEventListener('close', () => { if (addedEvidence) render(); }, { once: true });
}
