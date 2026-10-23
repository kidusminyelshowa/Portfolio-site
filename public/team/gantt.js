/* Timeline (Gantt chart) of tasks: one bar per task from when it started (or was
   given) to its due date, grouped by person or by project. Everyone sees the
   tasks the server sends them: their own, or their whole team for managers. */
import { el, frag, S, me, empById, isManager, chip, card, empty, select, dateShort, today, daysBetween, STATUS_LABEL } from '/team/ui.js';
import { taskModal, taskKey, taskPerson, timeLabel } from '/team/tasks.js';

const DAY = 86400000;
const iso = t => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * DAY);
const first = n => String(n || '').split(' ')[0];
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

/* a small hover/tap tooltip shared by the charts */
let tipEl = null;
export function tip(node, text) {
  const show = ev => {
    if (!tipEl) { tipEl = el('div', { class: 'vtip', role: 'tooltip' }); document.body.appendChild(tipEl); }
    tipEl.textContent = '';
    String(typeof text === 'function' ? text() : text).split('\n').forEach((line, i) => tipEl.appendChild(el(i ? 'div' : 'b', { text: line })));
    tipEl.hidden = false;
    const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, Math.max(8, ev.clientX + 12));
    const y = ev.clientY - tipEl.offsetHeight - 12 < 8 ? ev.clientY + 16 : ev.clientY - tipEl.offsetHeight - 12;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  };
  node.addEventListener('pointermove', show);
  node.addEventListener('pointerdown', show);
  node.addEventListener('pointerleave', () => { if (tipEl) tipEl.hidden = true; });
}
window.addEventListener('scroll', () => { if (tipEl) tipEl.hidden = true; }, { passive: true });

/* where a task's bar starts and ends, and the late part after its due date.
   It starts on the task's start date; without one, when work began (or, not yet begun, on the due date itself),
   not on the day it was given, which made it look as if the work ran all that time */
function span(t) {
  const start = String(t.startDate || t.startedAt || t.dueDate || today()).slice(0, 10);
  const due = t.dueDate || start;
  const end = t.status === 'done' ? String(t.deliveredAt || t.completedAt || due).slice(0, 10) : due;
  const lateTo = t.status === 'done' ? (end > due ? end : null) : (today() > due && t.status !== 'submitted' ? today() : null);
  return { start: start > due ? due : start, due, end: end < start ? start : end, lateTo };
}

export function viewGantt() {
  const all = ((S.data && S.data.tasks) || []).slice();
  const manager = isManager();
  const state = { range: store.get('gz-gantt-range') || '30', group: store.get('gz-gantt-group') || 'person', person: '', done: true };
  const box = el('div');
  const people = [...new Map(all.map(t => [taskKey(t), taskPerson(t)])).values()].filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

  const rangeSel = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Time range' }, [['14', '2 weeks'], ['30', 'Month'], ['90', '3 months']].map(([v, l]) =>
    el('button', { type: 'button', role: 'radio', 'aria-checked': String(state.range === v), text: l, onclick: ev => {
      state.range = v; store.set('gz-gantt-range', v);
      ev.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b === ev.currentTarget)));
      draw();
    } })));
  const groupSel = select(state.group, [{ value: 'person', label: 'By person' }, { value: 'project', label: 'By project' }], { onchange: ev => { state.group = ev.target.value; store.set('gz-gantt-group', state.group); draw(); } });
  const personSel = select('', [{ value: '', label: 'Everyone' }].concat(people.map(p => ({ value: p.id, label: p.name }))), { onchange: ev => { state.person = ev.target.value; draw(); } });
  const doneBox = el('label', { class: 'row', style: 'gap:8px;font-size:13.5px;cursor:pointer' }, [
    el('input', { type: 'checkbox', checked: true, onchange: ev => { state.done = ev.target.checked; draw(); } }), 'Show done']);

  function draw() {
    box.textContent = '';
    const days = Number(state.range);
    const from = addDays(today(), -Math.round(days * 0.3));          // a little of the past, mostly what is coming
    const to = addDays(from, days - 1);
    let list = all.filter(t => (!state.person || taskKey(t) === state.person) && (state.done || t.status !== 'done'));
    list = list.filter(t => { const s = span(t); return (s.lateTo || s.end) >= from && s.start <= to; });
    if (!list.length) { box.appendChild(empty('Nothing on the timeline', 'Tasks with dates in this period show here as bars.')); return; }

    const px = days <= 14 ? 56 : days <= 30 ? 32 : 13;               // width of one day
    const x = d => Math.max(0, Math.min(days, daysBetween(from, d))) * px;
    const groups = new Map();
    list.sort((a, b) => span(a).start.localeCompare(span(b).start)).forEach(t => {
      const key = state.group === 'project' ? (t.project || t.client || 'No project') : taskKey(t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });

    // header: months/weeks and days, weekends shaded, today marked
    const head = el('div', { class: 'gh' });
    for (let i = 0; i < days; i++) {
      const d = addDays(from, i), wd = new Date(d + 'T00:00:00Z').getUTCDay();
      const label = days <= 30 ? String(Number(d.slice(8))) : (wd === 1 ? dateShort(d).replace(/ \d{4}$/, '') : '');
      head.appendChild(el('div', { class: 'gd' + (wd === 0 ? ' we' : '') + (d === today() ? ' now' : ''), style: 'width:' + px + 'px', text: label, title: dateShort(d) }));
    }
    const grid = el('div', { class: 'gbody', style: '--px:' + px + 'px;width:' + (days * px) + 'px' });
    const names = el('div', { class: 'gnames' }, [el('div', { class: 'gcorner', text: state.group === 'project' ? 'Project' : 'Person' })]);
    const tracks = el('div', { class: 'gtracks' }, [head]);

    [...groups.entries()].forEach(([key, tasks]) => {
      const who = state.group === 'person' ? taskPerson(tasks[0]) : null;
      names.appendChild(el('div', { class: 'ggroup', text: who ? who.name + (who.external ? ' (outside)' : '') : key }));
      tracks.appendChild(el('div', { class: 'ggroup-track', style: 'width:' + (days * px) + 'px' }));
      tasks.forEach(t => {
        const s = span(t), p = taskPerson(t);
        names.appendChild(el('div', { class: 'gname', title: t.title }, [
          el('span', { class: 'dot s-' + t.status }), el('span', { class: 'grow', text: t.title }),
          state.group === 'project' && p ? el('small', { class: 'muted', text: first(p.name) }) : null]));
        const row = el('div', { class: 'grow-track', style: 'width:' + (days * px) + 'px' });
        const left = x(s.start), right = x(addDays(s.end, 1));
        const bar = el('button', { type: 'button', class: 'gbar s-' + t.status, style: 'left:' + left + 'px;width:' + Math.max(px * 0.6, right - left - 2) + 'px',
          'aria-label': t.title + ', ' + STATUS_LABEL[t.status] + ', due ' + dateShort(t.dueDate), onclick: () => taskModal(t) },
          [el('span', { text: right - left > 90 ? t.title : '' })]);
        tip(bar, () => [t.title, (p ? p.name + ' · ' : '') + STATUS_LABEL[t.status], dateShort(s.start) + ' → due ' + dateShort(t.dueDate) + (t.dueTime ? ' ' + timeLabel(t.dueTime) : '') +
          (t.status === 'done' ? ' · delivered ' + dateShort(s.end) : ''), (t.project || t.client || '') + (t.quality ? ' · quality ' + t.quality + '/5' : '')].filter(Boolean).join('\n'));
        row.appendChild(bar);
        if (s.lateTo && s.lateTo > s.due) {
          const l2 = x(addDays(s.due, 1)), r2 = x(addDays(s.lateTo, 1));
          if (r2 > l2) {
            const late = el('div', { class: 'glate', style: 'left:' + l2 + 'px;width:' + Math.max(4, r2 - l2 - 2) + 'px' });
            tip(late, () => t.title + '\n' + daysBetween(s.due, s.lateTo) + ' day' + (daysBetween(s.due, s.lateTo) === 1 ? '' : 's') + ' late');
            row.appendChild(late);
          }
        }
        tracks.appendChild(row);
      });
    });
    const todayX = x(today()) + px / 2;
    tracks.appendChild(el('div', { class: 'gtoday', style: 'left:' + todayX + 'px', title: 'Today' }));
    grid.append(tracks);
    const scroller = el('div', { class: 'gscroll' }, [grid]);
    box.appendChild(el('div', { class: 'gantt' }, [names, scroller]));
    // start with today in view
    requestAnimationFrame(() => { scroller.scrollLeft = Math.max(0, todayX - scroller.clientWidth * 0.3); });
  }
  draw();

  const legend = el('div', { class: 'legend', style: 'margin-top:10px' }, [
    ...['todo', 'in_progress', 'blocked', 'submitted', 'done'].map(s => el('span', {}, [el('i', { class: 'dot s-' + s, style: 'border-radius:3px' }), STATUS_LABEL[s]])),
    el('span', {}, [el('i', { class: 'glate-sw' }), 'Late']), el('span', {}, [el('i', { style: 'background:var(--red);width:2px' }), 'Today'])
  ]);
  return card(manager ? 'Team timeline' : 'My timeline', manager ? 'Every task as a bar, from start to due date. Tap a bar to open the task.' : 'Your tasks from start to due date. Tap a bar to open it.', [
    el('div', { class: 'salesbar' }, [rangeSel, manager ? groupSel : null, manager && people.length > 1 ? personSel : null, doneBox]),
    box, legend
  ]);
}
