/* The studio at a glance, on the dashboard of the founder and managers:
   the sales pipeline, the work being done, employee of the month, charts,
   suggested next steps and a file for Claude. Everything is worked out in the
   browser from what the server already sends (tasks) and the sales pipeline
   (/api/team?sales=1). Amounts only show for admins (the server strips them). */
import {
  el, frag, S, me, employees, isAdmin, isSolo, brand, chip, card, empty, tile, avatar, bar, score, pct, dateShort, monthName,
  today, daysBetween, svgEl, quarterLabel, quarterRange, STATUS_LABEL, toast
} from '/team/ui.js';
import { cur } from '/team/ui.js';
import { tip } from '/team/gantt.js';
import { loadSales } from '/team/sales.js';
import { leadsForDashboard, leadDue } from '/team/leads.js';
import { collect, suggestions, exportForClaude } from '/team/insights.js';
import { taskModal } from '/team/tasks.js';
import { icon } from '/team/icons.js';

const go = h => { location.hash = h; };
const first = n => String(n || '').split(' ')[0];
const OPEN = ['todo', 'in_progress', 'blocked', 'submitted'];
const OPEN_STAGES = ['sent', 'opened', 'replied', 'contract'];
const delivered = t => String(t.deliveredAt || t.completedAt || '').slice(0, 10);
const tasks = () => ((S.data && S.data.tasks) || []).filter(t => t.employeeId);
const etb = n => Math.round(Number(n) || 0).toLocaleString('en-US') + ' ' + cur();
const short = n => { n = Number(n) || 0; return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)); };
const won = r => r.reached && (r.reached.signed || r.reached.paid);
const wonAt = r => String((r.contract && (r.contract.signedAt || r.contract.date)) || '').slice(0, 10);
const monthsBack = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (n - 1 - i)); return d.toISOString().slice(0, 7); });
const STATUS_COLOR = { todo: '#D9D9D5', in_progress: '#141414', blocked: '#D42F23', submitted: '#F6C445', done: 'var(--highlight)' };

/* the people the dashboard compares: everyone you can see, without the founder */
function people() {
  const admins = new Set(((S.data && S.data.users) || []).filter(u => u.role === 'admin').map(u => u.employeeId));
  if (isAdmin()) admins.add(me().employeeId);
  return employees().filter(e => e.status !== 'inactive' && !admins.has(e.id));
}

/* ---------- employee of the month: most finished work, weighted by quality and punctuality ---------- */
export function employeeOfMonth() {
  const month = today().slice(0, 7);
  let label = monthName(month), inWindow = t => delivered(t).slice(0, 7) === month;
  const all = tasks().filter(t => t.status === 'done');
  // early in the month there is too little to go on: use the last 30 days instead
  if (all.filter(inWindow).length < 3) {
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    inWindow = t => delivered(t) >= from;
    label = 'Last 30 days';
  }
  const rows = people().map(e => {
    const done = all.filter(t => t.employeeId === e.id && inWindow(t));
    const late = done.filter(t => t.daysLate > 0).length;
    const rated = done.filter(t => t.quality);
    const quality = rated.length ? rated.reduce((s, t) => s + Number(t.quality), 0) / rated.length : null;
    const points = done.reduce((s, t) => s + (Number(t.quality) || 3) / 5 * (t.daysLate > 0 ? 0.5 : 1) * (t.revisions ? 0.85 : 1), 0);
    return { e, done: done.length, onTime: done.length ? Math.round((done.length - late) / done.length * 100) : null, quality, points,
      open: tasks().filter(t => t.employeeId === e.id && OPEN.includes(t.status)).length };
  }).sort((a, b) => b.points - a.points || (b.quality || 0) - (a.quality || 0));
  return { label, rows, winner: rows[0] && rows[0].done ? rows[0] : null };
}

/* ---------- charts ---------- */
/* columns: data = [{label, parts: [{value, color, name}], tip}] stacked bottom-up */
function columns(data, opts) {
  const o = opts || {};
  const wrap = el('div', { class: 'chartwrap' });
  // drawn at the box's real width (text stays 12px, bars keep their shape); redrawn when the box resizes
  const paint = W => {
    const H = o.height || 190, padB = 24, padT = 8, padL = 34;
    const max = Math.max(1, ...data.map(d => d.parts.reduce((s, p) => s + p.value, 0)));
    const nice = max <= 2 ? 2 : max <= 4 ? 4 : Math.ceil(max / 4) * 4;   // even, so the middle line is a whole number
    const gw = (W - padL) / data.length, bw = Math.min(38, gw * 0.56);
    const y = v => padT + (1 - v / nice) * (H - padT - padB);
    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'chart', role: 'img', 'aria-label': o.label || 'Chart' });
    // orange stripes for the "late" part, like the hatched bars in the reference
    const hid = 'hatch' + Math.random().toString(36).slice(2, 7);
    svg.appendChild(svgEl('defs', {}, [svgEl('pattern', { id: hid, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, [
      svgEl('rect', { width: 6, height: 6, fill: 'var(--orangeSoft)' }), svgEl('rect', { width: 3, height: 6, fill: 'var(--orange)' })])]));
    [0, 0.5, 1].forEach(g => {
      svg.appendChild(svgEl('line', { x1: padL, x2: W, y1: y(nice * g), y2: y(nice * g), stroke: g ? 'var(--line)' : 'var(--line2)', 'stroke-width': 1 }));
      const t = svgEl('text', { x: padL - 6, y: y(nice * g) + 4, 'text-anchor': 'end', class: 'mlab' }); t.textContent = o.fmt ? o.fmt(nice * g) : String(Math.round(nice * g)); svg.appendChild(t);
    });
    data.forEach((d, i) => {
      const x = padL + i * gw + (gw - bw) / 2;
      let base = 0;
      const segs = d.parts.filter(p => p.value > 0);
      segs.forEach((p, j) => {
        const y0 = y(base), y1 = y(base + p.value);
        const top = j === segs.length - 1, r = top ? Math.min(5, (y0 - y1) / 2, bw / 2) : 0;
        svg.appendChild(svgEl('path', { fill: p.hatch ? 'url(#' + hid + ')' : p.color, stroke: p.hatch ? 'var(--orange)' : 'none', 'stroke-width': p.hatch ? 1 : 0, d: 'M' + x + ',' + y0 + 'V' + (y1 + r) + (r ? 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + y1 + ' ' + (x + bw) + ',' + (y1 + r) : 'H' + (x + bw)) + 'V' + y0 + 'Z' }));
        base += p.value;
      });
      const lab = svgEl('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'mlab' }); lab.textContent = d.label; svg.appendChild(lab);
      const hit = svgEl('rect', { x: padL + i * gw, y: 0, width: gw, height: H, fill: 'transparent' });
      tip(hit, d.tip || d.label);
      svg.appendChild(hit);
    });
    wrap.textContent = '';
    wrap.appendChild(svg);
  };
  let last = 0;
  paint(560);
  if (window.ResizeObserver) new ResizeObserver(es => {
    const w = Math.round(es[0].contentRect.width);
    if (w > 0 && Math.abs(w - last) > 2) { last = w; paint(Math.max(260, w)); }
  }).observe(wrap);
  return wrap;
}

/* a ring split by status; the number in the middle */
function ring(parts, center, sub) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  const svg = svgEl('svg', { viewBox: '0 0 140 140', class: 'ring', role: 'img', 'aria-label': parts.map(p => p.name + ' ' + p.value).join(', ') });
  svg.appendChild(svgEl('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: 'var(--soft2)', 'stroke-width': 16 }));
  let off = 0;
  parts.filter(p => p.value).forEach(p => {
    const len = p.value / total * C;
    const c = svgEl('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: p.color, 'stroke-width': 16, 'stroke-dasharray': Math.max(0, len - 2) + ' ' + (C - Math.max(0, len - 2)), 'stroke-dashoffset': -off, transform: 'rotate(-90 70 70)' });
    tip(c, p.name + '\n' + p.value + ' task' + (p.value === 1 ? '' : 's'));
    svg.appendChild(c);
    off += len;
  });
  return el('div', { class: 'ringwrap' }, [svg, el('div', { class: 'ringmid' }, [el('b', { class: 'num', text: String(center) }), el('small', { text: sub })])]);
}

/* ---------- the cards ---------- */
function weeklyCard() {
  // the last 8 weeks, Monday to Sunday
  const monday = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return x.toISOString().slice(0, 10); };
  const thisWeek = monday(today());
  const weeks = Array.from({ length: 8 }, (_, i) => { const x = new Date(thisWeek + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - (7 - i) * 7); return x.toISOString().slice(0, 10); });
  const done = tasks().filter(t => t.status === 'done' && delivered(t));
  const data = weeks.map(w => {
    const list = done.filter(t => monday(delivered(t)) === w);
    const late = list.filter(t => t.daysLate > 0).length;
    const lab = new Date(w + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return { label: w === thisWeek ? 'This wk' : lab, parts: [{ value: list.length - late, color: 'var(--black)' }, { value: late, color: 'var(--orange)', hatch: true }],
      tip: 'Week of ' + lab + '\n' + list.length + ' finished · ' + (list.length - late) + ' on time · ' + late + ' late', n: list.length };
  });
  const total = data.reduce((s, d) => s + d.n, 0);
  const prev = data.slice(0, 4).reduce((s, d) => s + d.n, 0), last = data.slice(4).reduce((s, d) => s + d.n, 0);
  return card('Work finished per week', 'Last 8 weeks · hover a week for the numbers', [
    total ? frag([
      el('div', { class: 'legend', style: 'margin:0 0 8px' }, [el('span', {}, [el('i', { style: 'background:var(--black)' }), 'On time']), el('span', {}, [el('i', { class: 'hatch' }), 'Late'])]),
      columns(data, { label: 'Tasks finished per week' }),
      el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px', text: last + ' finished in the last 4 weeks' + (prev ? ' · ' + (last >= prev ? '▲ ' : '▼ ') + Math.abs(last - prev) + ' on the 4 weeks before' : '') })
    ]) : empty('Nothing finished yet', 'The chart fills in as tasks are marked done.')
  ], [el('button', { class: 'sm ghost', text: isSolo() ? 'My tasks' : 'Team tasks', onclick: () => go(isSolo() ? '#/tasks' : '#/tasks-team') })]);
}

function motionCard() {
  const list = tasks();
  const cutoff = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
  const parts = ['todo', 'in_progress', 'blocked', 'submitted'].map(s => ({ name: STATUS_LABEL[s], value: list.filter(t => t.status === s).length, color: STATUS_COLOR[s], s }))
    .concat([{ name: 'Done (3 weeks)', value: list.filter(t => t.status === 'done' && delivered(t) >= cutoff).length, color: STATUS_COLOR.done, s: 'done' }]);
  const open = parts.slice(0, 4).reduce((s, p) => s + p.value, 0);
  const now = list.filter(t => t.status === 'in_progress').sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 5);
  const pers = id => employees().find(e => e.id === id);
  return card('Work in motion', isSolo() ? 'Every open task, by where it stands' : 'Every task the team has, by where it stands', [
    el('div', { class: 'motion' }, [
      ring(parts, open, 'open'),
      el('div', { class: 'legend col' }, parts.map(p => el('span', {}, [el('i', { style: 'background:' + p.color }), p.name, el('b', { class: 'num', text: String(p.value) })])))
    ]),
    el('div', { class: 'muted', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:14px 0 8px', text: 'Being worked on now' }),
    now.length ? el('div', { class: 'list' }, now.map(t => { const e = pers(t.employeeId); return el('div', { class: 'item click', onclick: () => taskModal(t) }, [
      e ? avatar(e.name, 'sm') : null,
      el('span', { class: 'grow' }, [el('b', { text: t.title }), el('small', { text: [e && first(e.name), t.client, t.dueDate ? 'due ' + dateShort(t.dueDate) : ''].filter(Boolean).join(' · ') })]),
      t.priority === 'urgent' ? chip('Urgent', 'bad') : null
    ]); })) : empty(isSolo() ? 'Nothing in progress' : 'Nobody has started anything', 'Tasks show here once they are started.')
  ]);
}

function eomCard(eom) {
  const w = eom.winner;
  const others = eom.rows.filter(r => r !== w && r.done).slice(0, 3);
  if (!w) return el('section', { class: 'card dark eom' }, [
    el('div', { class: 'eomtag', text: 'Employee of the month' }),
    el('h3', { style: 'margin-top:10px', text: 'Not decided yet' }),
    el('p', { class: 'sub', text: 'The first person to finish rated work this month takes the spot.' })
  ]);
  return el('section', { class: 'card dark eom' }, [
    el('div', { class: 'row', style: 'justify-content:space-between' }, [el('span', { class: 'eomtag', text: 'Employee of the month' }), el('span', { class: 'muted', style: 'font-size:12.5px', text: eom.label })]),
    el('div', { class: 'eomwho' }, [
      el('div', { class: 'eomface' }, [avatar(w.e.name, 'xl'), el('span', { class: 'crown', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>' })]),
      el('div', {}, [el('h2', { text: w.e.name }), el('p', { class: 'sub', text: w.e.title || '' })])
    ]),
    el('div', { class: 'eomstats' }, [
      el('div', {}, [el('b', { class: 'num', text: String(w.done) }), el('small', { text: 'tasks finished' })]),
      el('div', {}, [el('b', { class: 'num', text: w.onTime == null ? '—' : w.onTime + '%' }), el('small', { text: 'on time' })]),
      el('div', {}, [el('b', { class: 'num', text: w.quality == null ? '—' : score(w.quality) }), el('small', { text: 'quality / 5' })])
    ]),
    others.length ? el('div', { class: 'list', style: 'margin-top:14px;gap:6px' }, others.map((r, i) => el('div', { class: 'row', style: 'gap:10px;font-size:13px' }, [
      el('span', { class: 'muted num', style: 'width:14px', text: String(i + 2) }), avatar(r.e.name, 'xs'),
      el('span', { class: 'grow', text: r.e.name }), el('span', { class: 'muted num', text: r.done + ' done' + (r.onTime != null ? ' · ' + r.onTime + '%' : '') })
    ]))) : null,
    el('div', { class: 'row wrap', style: 'margin-top:16px;gap:8px' }, [
      isAdmin() ? el('button', { class: 'sm', text: 'Send a shout-out', onclick: () => go('#/notify') }) : null,
      el('button', { class: 'sm ghost', text: 'Their page', onclick: () => go('#/people/' + w.e.id) })
    ])
  ]);
}

function leaderCard(eom) {
  const rows = eom.rows;
  const max = Math.max(1, ...rows.map(r => r.done));
  return card('Who is getting things done', eom.label + ' · finished tasks, on time and quality', [
    rows.length ? el('div', { class: 'lboard' }, rows.map((r, i) => el('div', { class: 'lrow click', onclick: () => go('#/people/' + r.e.id + '/tasks') }, [
      el('span', { class: 'lrank num', text: String(i + 1) }),
      avatar(r.e.name, 'sm'),
      el('span', { class: 'grow' }, [el('b', { text: r.e.name }), el('div', { class: 'lbar' }, [el('i', { style: 'width:' + Math.round(r.done / max * 100) + '%' })])]),
      el('span', { class: 'lnums' }, [
        el('b', { class: 'num', text: String(r.done) }), el('small', { text: r.onTime == null ? r.open + ' open' : r.onTime + '% on time' })
      ])
    ]))) : empty('Nobody to show', '')
  ]);
}

/* ---------- sales ---------- */
function salesCard(sales) {
  if (sales === null) return card('Sales pipeline', 'Loading the proposals…', [el('div', { class: 'skel', style: 'height:220px' })]);
  if (sales.error) return card('Sales pipeline', null, [empty('Could not load the proposals', sales.error)]);
  const rows = sales.rows || [];
  const money = !!sales.showMoney;
  if (!rows.length) return card('Sales pipeline', null, [empty('No proposals yet', 'Proposals you make in the Price Builder show up here, with where each one stands.',
    isAdmin() ? el('button', { class: 'accent sm', text: 'Make a quote', onclick: () => { location.href = '/price#/new'; } }) : null)]);
  const STAGES = [['sent', 'Sent'], ['opened', 'Opened'], ['replied', 'Replied'], ['contract', 'Contract'], ['invoiced', 'Invoiced'], ['paid', 'Paid'], ['production', 'With the team']];
  const live = rows.filter(r => STAGES.some(s => s[0] === r.stage));
  const maxN = Math.max(1, ...STAGES.map(([k]) => live.filter(r => r.stage === k).length));
  const stageRows = el('div', { class: 'stages' }, STAGES.map(([k, label]) => {
    const here = live.filter(r => r.stage === k);
    const v = here.reduce((t, r) => t + (r.value || 0), 0);
    return el('button', { type: 'button', class: 'srow', onclick: () => go('#/sales') }, [
      el('span', { class: 'sl', text: label }),
      el('span', { class: 'strack' }, [el('i', { style: 'width:' + (here.length ? Math.max(4, here.length / maxN * 100) : 0) + '%' })]),
      el('span', { class: 'sn num', text: here.length + (money && v ? ' · ' + short(v) : '') })
    ]);
  }));
  // per month: money collected (admins) or deals won (managers)
  const months = monthsBack(6);
  const data = months.map(m => {
    const lab = new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short' });
    if (money) {
      const v = rows.flatMap(r => (r.invoices || []).filter(i => i.status === 'paid' && String(i.paidAt || '').slice(0, 7) === m)).reduce((t, i) => t + (i.totalEtb || 0), 0);
      return { label: lab, parts: [{ value: v, color: m === months[months.length - 1] ? 'var(--orange)' : 'var(--black)' }], tip: monthName(m) + '\nCollected ' + etb(v), v };
    }
    const n = rows.filter(r => won(r) && wonAt(r).slice(0, 7) === m).length;
    return { label: lab, parts: [{ value: n, color: m === months[months.length - 1] ? 'var(--orange)' : 'var(--black)' }], tip: monthName(m) + '\n' + n + ' deal' + (n === 1 ? '' : 's') + ' won', v: n };
  });
  const needs = rows.filter(r => r.needs && !r.openFollowup).length;
  return card('Sales pipeline', live.length + ' live proposals · ' + (needs ? needs + ' need a follow-up' : 'nobody to chase right now'), [
    el('div', { class: 'salesdash' }, [
      el('div', {}, [el('div', { class: 'minihead', text: 'Where the proposals are' }), stageRows]),
      el('div', {}, [el('div', { class: 'minihead', text: money ? 'Money collected per month' : 'Deals won per month' }),
        columns(data, { height: 170, label: money ? 'Money collected per month' : 'Deals won per month', fmt: money ? short : null })])
    ])
  ], [el('button', { class: 'sm ghost', text: 'Open pipeline', onclick: () => go('#/sales') })]);
}

function kpiRow(sales, eom) {
  const list = tasks();
  const month = today().slice(0, 7);
  const prevMonth = monthsBack(2)[0];
  const doneIn = m => list.filter(t => t.status === 'done' && delivered(t).slice(0, 7) === m).length;
  const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const recent = list.filter(t => t.status === 'done' && delivered(t) >= d90 && t.dueDate);
  const onTime = recent.length ? Math.round(recent.filter(t => !(t.daysLate > 0)).length / recent.length * 100) : null;
  const overdue = list.filter(t => OPEN.includes(t.status) && t.status !== 'submitted' && t.dueDate && t.dueDate < today()).length;
  const waiting = list.filter(t => t.status === 'submitted').length;
  const tiles = [];
  const rows = sales && sales.rows ? sales.rows : null;
  const money = !!(sales && sales.showMoney);
  if (rows) {
    const open = rows.filter(r => OPEN_STAGES.includes(r.stage));
    const q = quarterRange(S.data.quarter);
    const wonQ = rows.filter(r => won(r) && wonAt(r) >= q.start && wonAt(r) <= q.end);
    tiles.push(tile('Open pipeline', money ? short(open.reduce((t, r) => t + (r.value || 0), 0)) + ' ' + cur() : String(open.length), open.length + ' proposal' + (open.length === 1 ? '' : 's') + ' waiting on clients', () => go('#/sales')));
    tiles.push(tile('Won this quarter', String(wonQ.length), money ? short(wonQ.reduce((t, r) => t + (r.value || 0), 0)) + ' ' + cur() + ' · ' + quarterLabel(S.data.quarter) : quarterLabel(S.data.quarter), () => go('#/sales')));
  } else {
    tiles.push(tile('Open pipeline', '…', 'loading'), tile('Won this quarter', '…', 'loading'));
  }
  const dm = doneIn(month), dp = doneIn(prevMonth);
  const solo = isSolo(), tasksHref = solo ? '#/tasks' : '#/tasks-team';
  tiles.push(tile('Finished this month', String(dm), dp ? (dm >= dp ? '▲ ' : '▼ ') + Math.abs(dm - dp) + ' on last month (' + dp + ')' : 'tasks marked done', () => go(tasksHref)));
  tiles.push(tile('On time', onTime == null ? '—' : onTime + '%', (solo ? 'last 90 days' : 'team, last 90 days') + ' · goal 90%', () => go(solo ? '#/tasks' : '#/insights')));
  tiles.push(tile('Overdue now', String(overdue), waiting ? waiting + ' handed in, waiting for you' : solo ? 'nothing overdue to chase' : 'nothing waiting to check', () => go(tasksHref)));
  return el('div', { class: 'kpis', style: 'margin-bottom:14px' }, tiles);
}

/* ---------- next steps: plain rules over tasks, sales and the system's own to-do list ---------- */
function nextSteps(sales, eom) {
  const out = [];
  const add = (e, text, why, href, tone) => out.push({ e, text, why, href, tone });   // e = icon name
  const list = tasks();
  const pers = id => employees().find(e => e.id === id);
  const waiting = list.filter(t => t.status === 'submitted');
  if (waiting.length) add('check', 'Check ' + waiting.length + ' handed-in task' + (waiting.length === 1 ? '' : 's'), waiting.slice(0, 3).map(t => first((pers(t.employeeId) || {}).name) + ': ' + t.title).join(' · '), '#/tasks-team', 'warn');
  const overdue = list.filter(t => OPEN.includes(t.status) && t.status !== 'submitted' && t.dueDate && t.dueDate < today()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdue.length) add('bell', overdue.length + ' task' + (overdue.length === 1 ? ' is' : 's are') + ' overdue', overdue.slice(0, 3).map(t => first((pers(t.employeeId) || {}).name) + ': ' + t.title + ' (' + daysBetween(t.dueDate, today()) + 'd)').join(' · '), '#/tasks-team', 'bad');
  list.filter(t => t.status === 'blocked').slice(0, 2).forEach(t => {
    const note = (t.log || []).slice().reverse().find(l => l.to === 'blocked' && l.note);
    add('tasks', 'Unblock “' + t.title + '”', first((pers(t.employeeId) || {}).name) + (note ? ' is waiting: ' + note.note : ' is stuck on it'), '#/tasks-team', 'bad');
  });
  // sales leads: calls and messages due today, and leads nobody has touched yet
  if (leadsNow && leadsNow.length) {
    const dueL = leadsNow.filter(leadDue);
    const hot = dueL.filter(l => l.priority === 'hot');
    if (dueL.length) add('phone', dueL.length + ' lead' + (dueL.length === 1 ? '' : 's') + ' to call or message today', (hot.length ? hot.length + ' hot: ' : '') + dueL.slice(0, 3).map(l => l.company).join(', '), '#/sales', hot.length ? 'bad' : 'warn');
    const fresh = leadsNow.filter(l => l.stage === 'new' && !(l.activity || []).length);
    if (fresh.length >= 5) add('sales', fresh.length + ' new leads not contacted yet', 'Give them to your sales owner as tasks, or start with the hot ones.', '#/sales');
  }
  if (sales && sales.rows) {
    const rows = sales.rows;
    rows.filter(r => r.needs && r.needs.kind === 'kickoff').slice(0, 2).forEach(r => add('send', 'Kick off ' + r.client + ' with the team', 'Paid and ready to start' + (r.projectName ? ': ' + r.projectName : ''), '#/sales', 'ok'));
    const chase = rows.filter(r => r.needs && !r.openFollowup && r.needs.kind !== 'kickoff').sort((a, b) => (b.needs.level === 'warn') - (a.needs.level === 'warn') || (b.value || 0) - (a.value || 0));
    chase.slice(0, 3).forEach(r => add('phone', 'Follow up with ' + r.client, r.needs.reason + (r.value ? ' · ' + etb(r.value) : ''), '#/sales', r.needs.level === 'warn' ? 'bad' : 'warn'));
    const sent30 = rows.filter(r => r.sentAt && Date.parse(r.sentAt) >= Date.now() - 30 * 86400000).length;
    if (sent30 < 4) add('sales', 'Send more proposals: only ' + sent30 + ' went out in 30 days', 'A full pipeline needs about one a week. Pick two leads to quote this week.', '#/sales', 'warn');
    const outstanding = rows.reduce((t, r) => t + (r.outstandingEtb || 0), 0);
    if (outstanding) add('reports', etb(outstanding) + ' invoiced and not paid yet', 'Chase the oldest invoice first.', '#/sales', 'warn');
  }
  (S.data.actions || []).filter(a => ['approval', 'leave', 'review', 'project'].includes(a.kind)).slice(0, 3).forEach(a => add('approvals', a.text, a.kind === 'approval' ? 'Waiting for your approval' : a.kind === 'leave' ? 'Leave request' : a.kind === 'project' ? 'Project' : 'Review', a.href));
  // the Insights rules: workload, who is best at what, lateness patterns
  suggestions(collect(90)).slice(0, 3).forEach(s => add('insights', s.text, s.why, '#/insights'));
  if (eom.winner && isAdmin() && !isSolo()) add('award', 'Recognise ' + first(eom.winner.e.name) + ' as employee of the month', eom.winner.done + ' tasks finished, ' + (eom.winner.onTime == null ? '' : eom.winner.onTime + '% on time') + '. A short message goes a long way.', '#/notify', 'ok');
  return out;
}

function nextCard(steps) {
  return card('Next steps', (isSolo() ? 'Suggested from your tasks and sales' : 'Suggested from your tasks, sales and approvals') + ' · most urgent first', [
    steps.length ? el('div', { class: 'stack', style: 'gap:8px' }, steps.slice(0, 9).map(s => el('div', { class: 'sugg click' + (s.tone ? ' t-' + s.tone : ''), onclick: () => go(s.href) }, [
      el('span', { class: 'sic' }, [icon(s.e, 17)]),
      el('div', { class: 'grow' }, [el('b', { text: s.text }), s.why ? el('div', { class: 'dim', style: 'font-size:13px', text: s.why }) : null]),
      el('span', { class: 'go', 'aria-hidden': 'true', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' })
    ]))) : empty('All clear', 'Nothing needs you right now.')
  ]);
}

/* the "where am I at" lines that open the Claude file */
function summaryLines(sales, eom) {
  const list = tasks();
  const L = [];
  const open = list.filter(t => OPEN.includes(t.status));
  const overdue = open.filter(t => t.status !== 'submitted' && t.dueDate && t.dueDate < today());
  L.push(open.length + ' open tasks across the team, ' + overdue.length + ' overdue, ' + list.filter(t => t.status === 'submitted').length + ' handed in and waiting to be checked');
  if (eom.winner) L.push('Employee of the month (' + eom.label + '): ' + eom.winner.e.name + ', ' + eom.winner.done + ' tasks finished' + (eom.winner.onTime != null ? ', ' + eom.winner.onTime + '% on time' : '') + (eom.winner.quality != null ? ', quality ' + score(eom.winner.quality) : ''));
  eom.rows.forEach(r => L.push(r.e.name + ': ' + r.done + ' finished (' + eom.label + '), ' + r.open + ' open'));
  nextSteps(sales, eom).slice(0, 8).forEach(s => L.push('Next step suggested by the app: ' + s.text + (s.why ? ' (' + s.why + ')' : '')));
  return L;
}

function claudeCard(sales, eom) {
  return el('section', { class: 'card dark claude' }, [
    el('div', { class: 'grow' }, [
      el('span', { class: 'eomtag', text: 'Where do I stand?' }),
      el('h3', { style: 'font-size:20px;margin-top:8px', text: isSolo() ? 'Ask Claude about your business' : 'Ask Claude about ' + (brand().name || 'the studio') }),
      el('p', { class: 'sub', style: 'margin-top:4px', text: isSolo()
        ? 'Download one file with your pipeline, cash and every task. Drop it into a Claude chat and it tells you where you are and what to do next.'
        : 'Download one file with the pipeline, cash, every task and each person’s numbers. Drop it into a Claude chat and it tells you where you are and what to do next.' })
    ]),
    el('button', { text: 'Download for Claude', onclick: ev => {
      ev.target.disabled = true;
      exportForClaude(summaryLines(sales, eom)).then(() => toast('Downloaded. Drop the file into a Claude chat.')).catch(e => toast(e.message, true)).finally(() => { ev.target.disabled = false; });
    } })
  ]);
}

/* ---------- the whole block ---------- */
let salesCache = null, leadsNow = null;
export function studioDashboard() {
  const root = el('div', { class: 'studio' });
  const draw = sales => {
    const eom = employeeOfMonth();
    root.textContent = '';
    const ok = sales && !sales.error ? sales : null;
    // working alone: no employee of the month or leaderboard, the sales card gets the room
    if (isSolo()) {
      root.append(kpiRow(ok, eom), el('div', { class: 'dash' }, [
        el('div', { class: 's8' }, [salesCard(sales)]),
        el('div', { class: 's4' }, [isAdmin() ? claudeCard(ok, eom) : null]),
        el('div', { class: 's7' }, [nextCard(nextSteps(ok, eom))]),
        el('div', { class: 's5' }, [motionCard()]),
        el('div', { class: 's12' }, [weeklyCard()])
      ]));
      return;
    }
    root.append(
      kpiRow(sales && !sales.error ? sales : null, eom),
      el('div', { class: 'dash' }, [
        el('div', { class: 's8' }, [salesCard(sales)]),
        el('div', { class: 's4' }, [eomCard(eom)]),
        el('div', { class: 's7' }, [weeklyCard()]),
        el('div', { class: 's5' }, [motionCard()]),
        el('div', { class: 's7' }, [nextCard(nextSteps(sales && !sales.error ? sales : null, eom))]),
        el('div', { class: 's5 stack' }, [leaderCard(eom), isAdmin() ? claudeCard(sales && !sales.error ? sales : null, eom) : null])
      ])
    );
  };
  draw(salesCache);
  loadSales(false).then(d => { salesCache = d; draw(d); }).catch(e => draw({ error: e.message }));
  leadsForDashboard().then(list => { leadsNow = list; if (list && list.length) draw(salesCache); });
  return root;
}
