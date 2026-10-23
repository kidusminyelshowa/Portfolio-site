/* Insights: working patterns from the task history, no AI involved.
   Every start, block and hand-in is stamped with a time, so we can see when each
   person is active, how fast and how well they deliver each kind of work, and turn
   that into plain suggestions for who should get what, and when.
   Managers see their team; the founder sees everyone. Times are in the agency's time zone (Settings → Brand & region). */
import { el, frag, S, me, employees, empById, isAdmin, partnerEmp, chip, card, empty, select, tile, score, pct, dateShort, today, daysBetween, goalsOf, reviewsOf, milestonesOf, quarterLabel, brand, brandName, brandZone, cur, settings } from '/team/ui.js';
import { tip } from '/team/gantt.js';
import { loadSales } from '/team/sales.js';
import { loadLeads, stageOf, LEAD_STAGE_LABEL, LEAD_OUTCOME_LABEL } from '/team/leads.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);          // 07:00 – 22:00
let parts = null, partsZone = '';
function local(isoAt) {
  if (!parts || partsZone !== brandZone()) { partsZone = brandZone(); parts = new Intl.DateTimeFormat('en-GB', { timeZone: partsZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }); }
  const p = Object.fromEntries(parts.formatToParts(new Date(isoAt)).map(x => [x.type, x.value]));
  return { day: DAYS.indexOf(p.weekday), hour: Number(p.hour) };
}
const hh = h => String(h).padStart(2, '0') + ':00';
const first = n => String(n || '').split(' ')[0];

/* what kind of work a task is, from its title (same idea as kick-off routing) */
const KINDS = [
  ['Video editing', /\b(edit(ing)?|post[- ]?production|motion|animation|colou?r grad|subtitl|sound design|voice ?over)/i],
  ['Film & photo', /\b(video|film|shoot|footage|cinemat|photo|drone|reel|storyboard|camera)/i],
  ['Strategy & concept', /\b(strateg|positioning|naming|messaging|concept|creative direction|audit|research|workshop|tone of voice|copy|script)/i],
  ['Marketing & social', /\b(social|content|community|ads?\b|advert|seo|analytics|newsletter|influencer|launch|marketing|campaign|calendar|instagram|post)/i],
  ['Design', /\b(design|logo|identity|visual|typograph|graphic|icon|guideline|template|layout|illustrat|packag|menu|sign|card|letterhead|print|mock ?up|website|ui\b|ux\b|key visual|collateral|banner|poster|brochure|deck)/i],
  ['Operations', /\b(coordinat|logistic|event|plan|meeting|invoice|report|admin|schedule)/i]
];
export const kindOf = t => t.kind === 'followup' ? 'Sales follow-up' : ((KINDS.find(([, re]) => re.test((t.title || '') + ' ' + (t.project || ''))) || ['Other'])[0]);

/* the people whose patterns we can show: everyone the server sent, apart from you unless you are the founder */
function peopleList() {
  return employees().filter(e => e.status !== 'inactive' && (e.id !== me().employeeId || isAdmin()));
}

export function collect(days) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const tasks = ((S.data && S.data.tasks) || []);
  const byPerson = new Map();
  peopleList().forEach(e => byPerson.set(e.id, { e, acts: [], handins: [], done: [], open: 0, late: [] }));
  tasks.forEach(t => {
    const rec = byPerson.get(t.employeeId);
    if (!rec) return;
    if (['todo', 'in_progress', 'blocked', 'submitted'].includes(t.status)) rec.open++;
    // their own moves on the task: start, block, hand in (the manager's clicks are not theirs)
    (t.log || []).forEach(l => {
      if (l.at < since || l.name !== rec.e.name) return;
      rec.acts.push({ at: l.at, to: l.to, t });
      if (l.to === 'submitted') rec.handins.push({ at: l.at, t });
    });
    (t.evidence || []).forEach(ev => { if (ev.at >= since && ev.by && ev.by === (userIdOf(rec.e) || '')) rec.acts.push({ at: ev.at, to: 'evidence', t }); });
    if (t.status === 'done' && String(t.deliveredAt || t.completedAt || '') >= since) {
      rec.done.push(t);
      if (t.daysLate > 0) rec.late.push(t);
    }
  });
  return [...byPerson.values()];
}
const userIdOf = e => (((S.data && S.data.users) || []).find(u => u.employeeId === e.id) || {}).id;

export function stats(list) {
  const rated = list.filter(t => t.quality);
  const turn = list.filter(t => t.startedAt && t.deliveredAt).map(t => Math.max(0, daysBetween(String(t.startedAt).slice(0, 10), String(t.deliveredAt).slice(0, 10))));
  return {
    n: list.length,
    quality: rated.length ? rated.reduce((s, t) => s + Number(t.quality), 0) / rated.length : null,
    onTime: list.length ? Math.round(list.filter(t => !(t.daysLate > 0)).length / list.length * 100) : null,
    revisions: list.length ? list.reduce((s, t) => s + Number(t.revisions || 0), 0) / list.length : 0,
    days: turn.length ? turn.reduce((s, v) => s + v, 0) / turn.length : null
  };
}
/* one number to compare people on a kind of work: quality first, punctuality second */
const strength = s => (s.quality == null ? 3 : s.quality) / 5 * 0.6 + (s.onTime == null ? 0.5 : s.onTime / 100) * 0.4;

function peakWindow(acts) {
  if (acts.length < 5) return null;
  const byHour = Array(24).fill(0);
  acts.forEach(a => { byHour[local(a.at).hour]++; });
  let best = 7, bestN = -1;
  for (let h = 6; h <= 21; h++) { const n = byHour[h] + byHour[h + 1] + byHour[h + 2]; if (n > bestN) { bestN = n; best = h; } }
  const byDay = Array(7).fill(0);
  acts.forEach(a => { byDay[local(a.at).day]++; });
  const topDays = byDay.map((n, i) => [n, i]).filter(x => x[0]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => DAYS[x[1]]);
  return { from: best, to: best + 3, share: Math.round(bestN / acts.length * 100), days: topDays };
}

export function suggestions(recs) {
  const out = [];
  const add = (e, text, why) => out.push({ e, text, why });
  // who is best at which kind of work
  const kinds = new Map();
  recs.forEach(r => r.done.forEach(t => { const k = kindOf(t); if (!kinds.has(k)) kinds.set(k, new Map()); const m = kinds.get(k); m.set(r.e.id, (m.get(r.e.id) || []).concat([t])); }));
  kinds.forEach((m, k) => {
    if (k === 'Other') return;
    const ranked = [...m.entries()].map(([id, list]) => ({ r: recs.find(x => x.e.id === id), s: stats(list) })).filter(x => x.s.n >= 2).sort((a, b) => strength(b.s) - strength(a.s));
    if (!ranked.length) return;
    const top = ranked[0];
    const line = (top.s.quality != null ? 'quality ' + score(top.s.quality) + '/5, ' : '') + top.s.onTime + '% on time over ' + top.s.n + ' tasks';
    if (ranked.length > 1) add('🏆', 'Give ' + k.toLowerCase() + ' to ' + first(top.r.e.name) + ' first', line + '; next best ' + first(ranked[1].r.e.name) + ' (' + ranked[1].s.onTime + '% on time).');
    else add('🎯', first(top.r.e.name) + ' is your ' + k.toLowerCase() + ' person', line + '.');
    ranked.filter(x => x.s.revisions >= 1.5).forEach(x => add('✏️', first(x.r.e.name) + ' needs ' + score(x.s.revisions) + ' revisions per ' + k.toLowerCase() + ' task', 'Give a sharper brief or pair them with ' + (top.r !== x.r ? first(top.r.e.name) : 'a reviewer') + ' on the first draft.'));
  });
  // when people work best
  recs.forEach(r => {
    const p = peakWindow(r.acts);
    if (p && p.share >= 35) add('⏰', first(r.e.name) + ' works most between ' + hh(p.from) + ' and ' + hh(p.to) + (p.days.length ? ', mostly on ' + p.days.join(' and ') : ''),
      p.share + '% of their task activity. Brief them before it, and expect hand-ins around then.');
    const late = r.handins.filter(h => local(h.at).hour >= 19).length;
    if (r.handins.length >= 4 && late / r.handins.length >= 0.35) add('🌙', first(r.e.name) + ' hands in ' + Math.round(late / r.handins.length * 100) + '% of work after 19:00', 'Due dates may be too tight, or the day too full. Worth a quick check-in.');
    if (r.late.length >= 2) {
      const byKind = {}; r.late.forEach(t => { const k = kindOf(t); byKind[k] = (byKind[k] || 0) + 1; });
      const [k, n] = Object.entries(byKind).sort((a, b) => b[1] - a[1])[0];
      if (n >= 2) add('⚠️', n + ' of ' + first(r.e.name) + '’s ' + r.late.length + ' late tasks were ' + k.toLowerCase(), 'Give that kind of work more days, or move it to someone faster at it.');
    }
  });
  // workload
  const core = recs.filter(r => !partnerEmp(r.e));
  if (core.length > 1) {
    const sorted = core.slice().sort((a, b) => b.open - a.open);
    const hi = sorted[0], lo = sorted[sorted.length - 1];
    if (hi.open - lo.open >= 3) add('⚖️', first(hi.e.name) + ' has ' + hi.open + ' open tasks, ' + first(lo.e.name) + ' has ' + lo.open, 'Give the next task to ' + first(lo.e.name) + ' if it fits their work.');
  }
  return out;
}

/* ---------- charts ---------- */
function heatmap(acts) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  acts.forEach(a => { const p = local(a.at); grid[p.day][p.hour]++; });
  const max = Math.max(1, ...grid.flat());
  const level = n => !n ? '' : n / max > 0.75 ? 'h4' : n / max > 0.45 ? 'h3' : n / max > 0.2 ? 'h2' : 'h1';
  const box = el('div', { class: 'heat', role: 'img', 'aria-label': 'Task activity by weekday and hour, ' + brandZone() + ' time' }, [el('span')].concat(HOURS.map(h => el('span', { class: 'hl', text: h % 3 === 1 ? String(h) : '' }))));
  DAYS.forEach((d, di) => {
    box.appendChild(el('span', { text: d }));
    HOURS.forEach(h => {
      const n = grid[di][h];
      const c = el('span', { class: 'hc ' + level(n) });
      tip(c, d + ' ' + hh(h) + '–' + hh(h + 1) + '\n' + n + ' action' + (n === 1 ? '' : 's'));
      box.appendChild(c);
    });
  });
  return frag([box, el('div', { class: 'hlegend' }, ['Fewer', ...['', 'h1', 'h2', 'h3', 'h4'].map(c => el('i', { class: 'hc ' + c, style: c ? '' : 'background:var(--soft2)' })), 'More'])]);
}

function hourBars(handins) {
  const counts = HOURS.map(h => handins.filter(x => local(x.at).hour === h).length);
  const max = Math.max(1, ...counts);
  const W = 640, H = 150, pad = 22, bw = (W - 30) / HOURS.length;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (H + pad)); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Hand-ins by hour of day');
  const mk = (tag, a) => { const n = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  [0.5, 1].forEach(f => svg.appendChild(mk('line', { x1: 30, x2: W, y1: H - (H - 10) * f, y2: H - (H - 10) * f, stroke: 'var(--line)', 'stroke-width': 1 })));
  svg.appendChild(mk('line', { x1: 30, x2: W, y1: H, y2: H, stroke: 'var(--line2)', 'stroke-width': 1 }));
  const yl = mk('text', { x: 24, y: 14, 'text-anchor': 'end', class: 'mlab' }); yl.textContent = String(max); svg.appendChild(yl);
  counts.forEach((n, i) => {
    const h = n ? Math.max(4, (H - 10) * n / max) : 0, x = 30 + i * bw + 2;
    if (h) {
      const r = Math.min(4, (bw - 4) / 2);
      const p = mk('path', { d: 'M' + x + ',' + H + 'V' + (H - h + r) + 'Q' + x + ',' + (H - h) + ' ' + (x + r) + ',' + (H - h) + 'H' + (x + bw - 4 - r) + 'Q' + (x + bw - 4) + ',' + (H - h) + ' ' + (x + bw - 4) + ',' + (H - h + r) + 'V' + H + 'Z', fill: 'var(--c1)' });
      svg.appendChild(p);
    }
    const hit = mk('rect', { x: 30 + i * bw, y: 0, width: bw, height: H, fill: 'transparent' });
    tip(hit, hh(HOURS[i]) + '–' + hh(HOURS[i] + 1) + '\n' + n + ' hand-in' + (n === 1 ? '' : 's'));
    svg.appendChild(hit);
    if (HOURS[i] % 3 === 1) { const t = mk('text', { x: 30 + i * bw + bw / 2, y: H + 16, 'text-anchor': 'middle', class: 'mlab' }); t.textContent = hh(HOURS[i]); svg.appendChild(t); }
  });
  return el('div', { class: 'mchart-wrap' }, [svg]);
}

function matrix(recs) {
  const kinds = [...new Set(recs.flatMap(r => r.done.map(kindOf)))].sort();
  if (!kinds.length) return empty('Nothing finished yet', 'The table fills in as tasks are marked done.');
  const cell = new Map();
  recs.forEach(r => kinds.forEach(k => { const list = r.done.filter(t => kindOf(t) === k); if (list.length) cell.set(r.e.id + '|' + k, stats(list)); }));
  const bestOf = {};
  kinds.forEach(k => { let b = null; recs.forEach(r => { const s = cell.get(r.e.id + '|' + k); if (s && s.n >= 2 && (!b || strength(s) > strength(b.s))) b = { id: r.e.id, s }; }); bestOf[k] = b && b.id; });
  return el('div', { style: 'overflow-x:auto' }, [el('table', { class: 'matrix responsive' }, [
    el('thead', {}, [el('tr', {}, [el('th', { text: 'Person' })].concat(kinds.map(k => el('th', { text: k }))))]),
    el('tbody', {}, recs.filter(r => r.done.length).map(r => el('tr', {}, [el('td', { 'data-l': 'Person' }, [el('b', { text: r.e.name })])].concat(kinds.map(k => {
      const s = cell.get(r.e.id + '|' + k);
      if (!s) return el('td', { 'data-l': k, class: 'muted', text: '—' });
      const best = bestOf[k] === r.e.id;
      return el('td', { 'data-l': k }, [el('span', { class: best ? 'best' : '', text: (s.quality != null ? score(s.quality) + '★ · ' : '') + s.onTime + '% on time' }), best ? chip('Best', 'ok') : null,
        el('small', { class: 'muted', style: 'display:block', text: s.n + ' task' + (s.n === 1 ? '' : 's') + (s.days != null ? ' · ' + score(s.days) + ' days each' : '') + (s.revisions ? ' · ' + score(s.revisions) + ' rev.' : '') })]);
    })))))
  ])]);
}

/* ---------- the page ---------- */
const state = { days: 90, person: '' };
export function viewInsights() {
  const root = el('div');
  const draw = () => {
    root.textContent = '';
    const all = collect(state.days);
    const recs = state.person ? all.filter(r => r.e.id === state.person) : all;
    const acts = recs.flatMap(r => r.acts), handins = recs.flatMap(r => r.handins), done = recs.flatMap(r => r.done);
    const st = stats(done);
    const peak = peakWindow(acts);
    const ideas = suggestions(all);
    root.append(
      el('div', { class: 'salesbar' }, [
        el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Period' }, [[30, '30 days'], [90, '90 days'], [365, 'Year']].map(([v, l]) =>
          el('button', { type: 'button', role: 'radio', 'aria-checked': String(state.days === v), text: l, onclick: () => { state.days = v; draw(); } }))),
        select(state.person, [{ value: '', label: 'Whole team' }].concat(all.map(r => ({ value: r.e.id, label: r.e.name }))), { onchange: ev => { state.person = ev.target.value; draw(); } }),
        el('span', { class: 'grow' }),
        isAdmin() ? el('button', { class: 'sm', text: 'Download for Claude', title: 'A summary file to drop into a Claude chat on your computer', onclick: () => exportForClaude() }) : null
      ]),
      el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
        tile('Most active', peak ? hh(peak.from) + '–' + hh(peak.to) : '—', peak ? peak.share + '% of activity' + (peak.days.length ? ' · ' + peak.days.join(', ') : '') : 'needs a few more task moves'),
        tile('Finished', String(st.n), 'tasks in the last ' + state.days + ' days'),
        tile('On time', st.onTime == null ? '—' : st.onTime + '%', st.quality != null ? 'quality ' + score(st.quality) + ' / 5' : 'rated when marked done'),
        tile('Start to hand-in', st.days == null ? '—' : score(st.days) + ' days', 'average per task')
      ]),
      ideas.length ? card('Suggestions', 'From the task history. Use them as a starting point for your own judgement.', [
        el('div', { class: 'stack', style: 'gap:8px' }, ideas.slice(0, 10).map(s => el('div', { class: 'sugg' }, [el('span', { class: 'e', text: s.e }), el('div', {}, [el('b', { text: s.text }), el('div', { class: 'dim', style: 'font-size:13px', text: s.why })])])))
      ]) : null,
      el('div', { class: 'grid2', style: 'margin-top:14px;align-items:start' }, [
        card('When ' + (state.person ? first(recs[0] && recs[0].e.name) + ' works' : 'the team works'), 'Starts, blocks, hand-ins and evidence by weekday and hour (' + brandZone() + ' time)', [acts.length ? heatmap(acts) : empty('No activity yet', 'This fills in as people move their task cards.')]),
        card('When work is handed in', handins.length + ' hand-in' + (handins.length === 1 ? '' : 's') + ' by hour of day', [handins.length ? hourBars(handins) : empty('No hand-ins yet', '')])
      ]),
      el('div', { style: 'margin-top:14px' }, [card('Who is good at what', 'Finished tasks by kind of work (from the task title): average quality, on-time share, days from start to hand-in', [matrix(recs)])]),
      el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:12px', text: 'Patterns come only from what people do on their task cards in this app; work done outside it is not counted. A few weeks of using the board gives reliable numbers.' })
    );
  };
  draw();
  return root;
}

/* ---------- a file for Claude on your own computer (no API, nothing leaves the browser) ----------
   `summary`: optional lines from the dashboard (where things stand today), put at the top */
export async function exportForClaude(summary) {
  const recs = collect(365);
  // the sales pipeline too, so Claude can say where the studio stands, not only the team
  let sales = null;
  try { sales = await loadSales(false); } catch (e) { /* the team part still downloads */ }
  const lines = [];
  const L = s => lines.push(s);
  const b = brand(), where = [b.city, b.country].filter(Boolean).join(', '), ls = settings().leave || {};
  L('# ' + brandName() + ' data for analysis (' + today() + ')');
  L('');
  L('Prompt idea: "You are helping the founder of ' + brandName() + ', a creative studio' + (where ? ' in ' + where : '') + ', run the business. From this data, tell me where I am at: how the sales pipeline is doing and what is likely to close, cash collected versus outstanding, how the team is delivering (on time, quality, workload), who is best at which work and who is overloaded, and the main risks. Then give me 5 concrete actions for the next two weeks, most important first. Ask me if anything is unclear."');
  L('');
  L('Times are ' + brandZone() + ' time. Quality is 1–5 as rated by the manager. Quarters run from ' + new Date(Date.UTC(2000, (Number(ls.yearStartMonth) || 9) - 1, Number(ls.yearStartDay) || 11)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) + '. Money is in ' + cur() + ' including VAT.');
  if (summary && summary.length) { L(''); L('## Where things stand today'); summary.forEach(x => L('- ' + x)); }
  if (sales && (sales.rows || []).length) salesSection(sales.rows, L);
  let leads = null;
  try { leads = (await loadLeads(false)).leads; } catch (e) { /* skip */ }
  if (leads && leads.length) leadsSection(leads, L);
  recs.forEach(r => {
    const e = r.e, s = stats(r.done), p = peakWindow(r.acts);
    L(''); L('## ' + e.name + (partnerEmp(e) ? ' (creative partner)' : ''));
    L('- Position: ' + (e.title || e.levelId) + (e.startDate ? ' · started ' + e.startDate : ''));
    L('- Last 12 months: ' + s.n + ' tasks finished, ' + (s.onTime == null ? '—' : s.onTime + '%') + ' on time, quality ' + (s.quality == null ? '—' : score(s.quality)) + ', ' + score(s.revisions) + ' revisions per task, ' + (s.days == null ? '—' : score(s.days) + ' days') + ' start to hand-in; ' + r.open + ' open now');
    if (p) L('- Most active ' + hh(p.from) + '–' + hh(p.to) + ' (' + p.share + '% of activity), busiest days ' + p.days.join(', '));
    if (e.readiness) L('- Promotion readiness ' + e.readiness.percent + '%' + (e.readiness.nextLevel ? ' toward ' + e.readiness.nextLevel.name : '') + ': ' + Object.values(e.readiness.parts).map(x => x.label + ' ' + x.done + '/' + x.total).join('; '));
    const g = goalsOf(e.id).filter(x => x.status !== 'cancelled');
    if (g.length) { L('- Goals:'); g.forEach(x => L('  - [' + quarterLabel(x.quarter) + ', ' + x.status + ', ' + (x.progressPct || 0) + '%] ' + x.title)); }
    const ms = milestonesOf(e.id).filter(m => m.focus || m.dueDate);
    if (ms.length) { L('- Focus milestones:'); ms.forEach(m => L('  - [' + m.status + (m.dueDate ? ', due ' + m.dueDate : '') + '] ' + m.title)); }
    const rv = reviewsOf(e.id).filter(x => x.status === 'approved');
    if (rv.length) L('- Monthly review scores: ' + rv.slice().reverse().map(x => x.period + ' ' + score(x.overall)).join(', '));
  });
  L(''); L('## Tasks (last 12 months)'); L('');
  L('| Person | Task | Kind | Status | Given | Due | Handed in / done | Days late | Quality | Revisions |');
  L('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const since = new Date(Date.now() - 365 * 86400000).toISOString();
  ((S.data && S.data.tasks) || []).filter(t => String(t.createdAt || '') >= since).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).forEach(t => {
    const who = empById(t.employeeId);
    L('| ' + [who ? who.name : t.externalName ? t.externalName + ' (outside)' : '?', String(t.title).replace(/\|/g, '/'), kindOf(t), t.status, String(t.createdAt || '').slice(0, 10), t.dueDate || '', String(t.deliveredAt || t.submittedAt || '').slice(0, 10),
      t.daysLate > 0 ? t.daysLate : 0, t.quality || '', t.revisions || 0].join(' | ') + ' |');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = el('a', { href: URL.createObjectURL(blob), download: String(brandName()).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-for-claude-' + today() + '.md' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* the proposals, in a table Claude can read */
function salesSection(rows, L) {
  const money = v => v == null ? '' : Math.round(Number(v) || 0).toLocaleString('en-US');
  const open = rows.filter(r => ['sent', 'opened', 'replied', 'contract'].includes(r.stage));
  const won = rows.filter(r => r.reached && (r.reached.signed || r.reached.paid));
  const sent = rows.filter(r => r.sentAt);
  L(''); L('## Sales pipeline (Price Builder proposals)');
  L('- ' + sent.length + ' proposals sent in total, ' + won.length + ' won (' + (sent.length ? Math.round(won.length / sent.length * 100) : 0) + '%), ' + open.length + ' still open' +
    (open.some(r => r.value != null) ? ', worth ' + money(open.reduce((t, r) => t + (r.value || 0), 0)) + ' ' + cur() : ''));
  const paid = rows.flatMap(r => (r.invoices || []).filter(i => i.status === 'paid' && i.paidAt && i.totalEtb != null));
  if (paid.length) {
    const byMonth = {};
    paid.forEach(i => { const m = String(i.paidAt).slice(0, 7); byMonth[m] = (byMonth[m] || 0) + i.totalEtb; });
    L('- Collected by month: ' + Object.keys(byMonth).sort().map(m => m + ' ' + money(byMonth[m])).join(', '));
  }
  const outstanding = rows.reduce((t, r) => t + (r.outstandingEtb || 0), 0);
  if (outstanding) L('- Invoiced but not paid yet: ' + money(outstanding) + ' ' + cur());
  L('');
  L('| Client | Project | Stage | Value (' + cur() + ') | Sent | Days at this stage | Needs |');
  L('| --- | --- | --- | --- | --- | --- | --- |');
  rows.forEach(r => {
    const since = r.stageSince ? Math.max(0, Math.floor((Date.now() - Date.parse(r.stageSince)) / 86400000)) : '';
    L('| ' + [r.client, r.projectName || '', r.stage, money(r.value), String(r.sentAt || '').slice(0, 10), since,
      r.needs ? r.needs.reason + (r.openFollowup ? ' (follow-up with ' + r.openFollowup.name + ')' : '') : ''].map(v => String(v).replace(/\|/g, '/')).join(' | ') + ' |');
  });
}

/* the sales leads (before a proposal): where each one is and what came of the outreach */
function leadsSection(leads, L) {
  const by = {};
  leads.forEach(l => { const st = stageOf(l); by[st] = (by[st] || 0) + 1; });
  L(''); L('## Sales leads (before a proposal)');
  L('- ' + leads.length + ' leads: ' + Object.entries(by).map(([k, n]) => (LEAD_STAGE_LABEL[k] || k) + ' ' + n).join(', '));
  const lost = leads.filter(l => l.stage === 'lost' && l.lostReason);
  if (lost.length) L('- Lost reasons: ' + lost.map(l => l.lostReason).join('; '));
  L('');
  L('| Company | Sector | Stage | Priority | Touches | Last outcome | Next follow-up | Source |');
  L('| --- | --- | --- | --- | --- | --- | --- | --- |');
  leads.forEach(l => {
    const acts = (l.activity || []).filter(a => !['stage', 'task'].includes(a.kind));
    const last = acts[acts.length - 1];
    L('| ' + [l.company, l.sector || '', LEAD_STAGE_LABEL[stageOf(l)] || l.stage, l.priority || '', acts.length, last ? (LEAD_OUTCOME_LABEL[last.outcome] || last.kind) + (last.note ? ': ' + last.note.slice(0, 80) : '') : '',
      l.nextFollowUp || '', l.source || ''].map(v => String(v).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ') + ' |');
  });
}
