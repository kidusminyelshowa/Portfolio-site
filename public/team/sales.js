/* Sales pipeline: every price proposal from the Price Builder, where it stands,
   and what needs a follow-up. "Follow up" turns into a task (by default for the
   sales owner: the first manager unless you pick someone); when they log how it went, the proposal moves on.
   Data comes from /api/team?sales=1, which reads the Price Builder's storage. */
import { viewLeads } from '/team/leads.js';
import {
  el, frag, S, me, isAdmin, chip, card, empty, field, textarea, select, tile, modal, closeModal, act, toast,
  dateShort, today, avatar, svgEl
} from '/team/ui.js';
import { cur } from '/team/ui.js';

const go = h => { location.hash = h; };
const STAGES = [['sent', 'Sent'], ['opened', 'Opened'], ['replied', 'Client replied'], ['contract', 'Contract'],
  ['invoiced', 'Invoiced'], ['paid', 'Paid'], ['production', 'With the team'], ['delivered', 'Delivered']];
const STAGE_LABEL = Object.fromEntries(STAGES.concat([['draft', 'Draft'], ['lost', 'Lost'], ['expired', 'Expired']]));
const FUNNEL = [['sent', 'Sent'], ['opened', 'Opened'], ['replied', 'Replied'], ['contract', 'Contract'], ['paid', 'Paid'], ['production', 'With the team'], ['delivered', 'Delivered']];
const PERIODS = [['30', '30 days'], ['90', '90 days'], ['year', 'This year'], ['all', 'All time']];
const OUTCOMES = [['interested', 'Spoke: interested'], ['changes', 'Spoke: wants changes'], ['won', 'Agreed: going ahead'],
  ['later', 'Not now: follow up later'], ['noanswer', 'No answer'], ['lost', 'Lost the deal']];
export const OUTCOME_LABEL = Object.fromEntries(OUTCOMES);

// amounts only reach admins; for everyone else the page counts proposals instead of money
let MONEY = false;
const etb = n => (MONEY && n != null ? Math.round(Number(n) || 0).toLocaleString('en-US') + ' ' + cur() : '');
const join = (...parts) => parts.filter(Boolean).join(' · ');
const short = n => { n = Number(n) || 0; return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)); };
const daysSince = d => d ? Math.max(0, Math.floor((Date.now() - Date.parse(d)) / 86400000)) : null;
const ago = d => { const n = daysSince(d); return n == null ? '' : n === 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago'; };
const tomorrow = () => { const d = new Date(Date.now() + 86400000); return d.toISOString().slice(0, 10); };
const won = r => r.reached.signed || r.reached.paid;
const OPEN_STAGES = ['sent', 'opened', 'replied', 'contract'];

/* ---------- data ---------- */
let cache = null, cachedAt = 0, inflight = null;
const st = { period: '90', search: '', focus: '', closed: false };
async function load(force) {
  if (!force && cache && Date.now() - cachedAt < 30000) return cache;
  if (inflight) return inflight;
  inflight = fetch('/api/team?sales=1', { cache: 'no-store' }).then(async r => {
    const b = await r.json().catch(() => ({}));
    if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
    if (!r.ok) throw new Error(b.error || 'Could not load the proposals');
    cache = b; cachedAt = Date.now();
    return b;
  }).finally(() => { inflight = null; });
  return inflight;
}
/* the dashboard and the Claude export read the same proposals (cached for 30 seconds) */
export const loadSales = load;
const refreshView = () => load(true).then(() => window.dispatchEvent(new Event('gz:render'))).catch(e => toast(e.message, true));

function inPeriod(r) {
  const d = r.sentAt || r.createdAt;
  if (st.period === 'all' || !d) return true;
  if (st.period === 'year') return String(d).slice(0, 4) === today().slice(0, 4);
  return Date.parse(d) >= Date.now() - Number(st.period) * 86400000;
}
const matches = r => !st.search || [r.client, r.projectName, r.contact.name, r.contact.email, r.type].join(' ').toLowerCase().includes(st.search.toLowerCase());

/* ================= the page: Leads (before a proposal) | Proposals ================= */
const tabStore = { get: () => { try { return localStorage.getItem('gz-sales-tab'); } catch (e) { return null; } }, set: v => { try { localStorage.setItem('gz-sales-tab', v); } catch (e) { /* private mode */ } } };
export function viewSales() {
  const tab = tabStore.get() === 'proposals' ? 'proposals' : 'leads';
  const switcher = el('div', { class: 'seg salestabs', role: 'radiogroup', 'aria-label': 'Show' }, [['leads', 'Leads'], ['proposals', 'Proposals']].map(([v, l]) =>
    el('button', { type: 'button', role: 'radio', 'aria-checked': String(tab === v), text: l, onclick: () => { tabStore.set(v); window.dispatchEvent(new Event('gz:render')); } })));
  return frag([el('div', { style: 'margin-bottom:14px' }, [switcher]), tab === 'leads' ? viewLeads() : viewProposals()]);
}
function viewProposals() {
  const root = el('div', { class: 'sales' });
  if (cache) draw(root, cache);
  else root.appendChild(el('div', { class: 'skel', style: 'height:420px' }));
  load(false).then(d => draw(root, d)).catch(e => {
    root.textContent = '';
    root.appendChild(empty('Could not load the proposals', e.message));
  });
  return root;
}

function draw(root, data) {
  MONEY = !!data.showMoney;
  root.textContent = '';
  const rows = data.rows || [];
  if (!rows.length) {
    root.appendChild(empty('No proposals yet', 'Proposals made in the Price Builder show up here as soon as they are created.',
      el('button', { class: 'primary', text: 'Make a quote', onclick: () => { location.href = '/price#/new'; } })));
    return;
  }
  const cohort = rows.filter(r => r.sentAt && inPeriod(r));
  root.append(toolbar(data), kpis(rows, cohort), el('div', { class: 'grid2 salesgrid' }, [funnelCard(cohort), monthlyCard(rows)]),
    followCard(rows, data), boardCard(rows, data), closedCard(rows, data));
}

function toolbar(data) {
  const seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Period' }, PERIODS.map(([v, label]) =>
    el('button', { type: 'button', role: 'radio', 'aria-checked': String(st.period === v), text: label, onclick: () => { st.period = v; rerender(); } })));
  const search = el('input', { type: 'search', placeholder: 'Search client, project, contact…', value: st.search, 'aria-label': 'Search proposals' });
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.search = search.value; rerender(true); }, 180); });
  return el('div', { class: 'salesbar' }, [seg, search, el('span', { class: 'grow' }),
    data.canEditRules ? el('button', { class: 'sm ghost', text: 'Follow-up rules', onclick: () => rulesModal(data) }) : null,
    data.priceAccess ? el('a', { href: '/price', target: '_blank', rel: 'noopener' }, [el('button', { class: 'sm ghost', text: 'Price Builder ↗' })]) : null,
    el('button', { class: 'sm', text: 'Refresh', onclick: ev => { ev.target.disabled = true; refreshView(); } })]);
}
function rerender(keepFocus) {
  const active = document.activeElement && document.activeElement.type === 'search';
  window.dispatchEvent(new Event('gz:render'));
  if (keepFocus || active) setTimeout(() => { const s = document.querySelector('.salesbar input[type=search]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 0);
}

/* ---------- headline numbers ---------- */
function kpis(rows, cohort) {
  const winners = cohort.filter(won);
  const open = rows.filter(r => OPEN_STAGES.includes(r.stage));
  const paidIn = rows.flatMap(r => r.invoices.filter(i => i.status === 'paid' && (st.period === 'all' || inPeriod({ sentAt: i.paidAt }))));
  const outstanding = rows.reduce((t, r) => t + r.outstandingEtb, 0);
  const needs = rows.filter(r => r.needs && !r.openFollowup).length;
  const label = (PERIODS.find(p => p[0] === st.period) || [])[1].toLowerCase();
  return el('div', { class: 'kpis', style: 'margin-bottom:14px' }, [
    tile('Proposals sent', String(cohort.length), join(etb(cohort.reduce((t, r) => t + r.value, 0)), label), () => focusOn('sent')),
    tile('Won', cohort.length ? Math.round(winners.length / cohort.length * 100) + '%' : '—', join(winners.length + ' won', etb(winners.reduce((t, r) => t + r.value, 0))), () => focusOn('contract')),
    tile('Open pipeline', MONEY ? etb(open.reduce((t, r) => t + r.value, 0)) : String(open.length), MONEY ? open.length + ' waiting on the client' : 'waiting on the client', () => focusOn('open')),
    MONEY ? tile('Collected', etb(paidIn.reduce((t, i) => t + i.totalEtb, 0)), outstanding ? etb(outstanding) + ' invoiced, not paid' : 'nothing outstanding', () => focusOn('paid'))
      : tile('Paid', String(rows.filter(r => r.reached.paid).length), 'clients who paid', () => focusOn('paid')),
    tile('Needs a follow-up', String(needs), needs ? 'tap to see who to call' : 'all caught up', () => { st.focus = 'follow'; rerender(); setTimeout(() => { const n = document.querySelector('#followups'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); })
  ]);
}
function focusOn(stage) {
  st.focus = st.focus === stage ? '' : stage;
  rerender();
  if (st.focus) setTimeout(() => { const n = document.querySelector('#pipeline'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
}

/* ---------- funnel: how far proposals get (single hue, magnitude) ---------- */
function funnelCard(cohort) {
  const n0 = cohort.length || 1;
  const list = el('div', { class: 'funnel' });
  let prev = null;
  FUNNEL.forEach(([k, label]) => {
    const n = cohort.filter(r => r.reached[k]).length;
    const share = Math.round(n / n0 * 100);
    const step = prev == null ? null : prev ? Math.round(n / prev * 100) : 0;   // share of the step before
    list.appendChild(el('button', { type: 'button', class: 'frow' + (st.focus === k ? ' on' : ''), title: n + ' of ' + cohort.length + ' proposals reached “' + label + '”. Click to list them.', onclick: () => focusOn(k) }, [
      el('span', { class: 'fl', text: label }),
      el('span', { class: 'ftrack' }, [el('i', { style: 'width:' + Math.max(n ? 2 : 0, share) + '%' })]),
      el('span', { class: 'fn num', text: String(n) }),
      el('span', { class: 'fp num', text: step == null ? '' : prev ? step + '%' : '—' })
    ]));
    prev = n;
  });
  return card('How far proposals get', cohort.length ? cohort.length + ' sent in this period · % = share of the step before · click a step to list them' : 'Nothing sent in this period', [list]);
}

/* ---------- value sent vs won per month (two series, one axis, legend + tooltip) ---------- */
function monthlyCard(rows) {
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return d.toISOString().slice(0, 7); });
  const data = months.map(m => ({
    m, label: new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short' }),
    sent: rows.filter(r => String(r.sentAt || '').slice(0, 7) === m).reduce((t, r) => t + (MONEY ? r.value : 1), 0),
    won: rows.filter(r => won(r) && String((r.contract && (r.contract.signedAt || r.contract.date)) || '').slice(0, 7) === m).reduce((t, r) => t + (MONEY ? r.value : 1), 0),
    nSent: rows.filter(r => String(r.sentAt || '').slice(0, 7) === m).length,
    nWon: rows.filter(r => won(r) && String((r.contract && (r.contract.signedAt || r.contract.date)) || '').slice(0, 7) === m).length
  }));
  const max = Math.max(1, ...data.map(d => Math.max(d.sent, d.won)));
  const W = 560, H = 220, padL = 4, padB = 22, padT = 10, gw = (W - padL) / data.length, bw = Math.min(22, gw / 3);
  const y = v => padT + (1 - v / max) * (H - padT - padB);
  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'mchart', role: 'img', 'aria-label': 'Value sent and won per month' });
  [0.5, 1].forEach(g => svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: y(max * g), y2: y(max * g), stroke: 'var(--line)', 'stroke-width': 1 })));
  const tip = el('div', { class: 'ctip', hidden: true });
  const wrap = el('div', { class: 'mwrap' }, [svg, tip]);
  // a bar with a rounded top, flat on the baseline
  const bar = (x, v, color) => {
    const top = y(v), base = H - padB, r = Math.min(3, (base - top) / 2);
    if (base - top < 0.5) return null;
    return svgEl('path', { d: `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`, fill: color });
  };
  data.forEach((d, i) => {
    const x0 = padL + i * gw + (gw - bw * 2 - 2) / 2;
    [bar(x0, d.sent, 'var(--c1)'), bar(x0 + bw + 2, d.won, 'var(--c2)')].forEach(b => b && svg.appendChild(b));
    const t = svgEl('text', { x: padL + i * gw + gw / 2, y: H - 5, 'text-anchor': 'middle', class: 'mlab' }); t.textContent = d.label; svg.appendChild(t);
    const hit = svgEl('rect', { x: padL + i * gw, y: 0, width: gw, height: H, fill: 'transparent', class: 'mhit' });
    hit.addEventListener('mouseenter', () => {
      tip.hidden = false;
      tip.textContent = '';
      tip.append(el('b', { text: new Date(d.m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }),
        el('div', {}, [el('i', { class: 'sw', style: 'background:var(--c1)' }), 'Sent: ' + (MONEY ? etb(d.sent) + ' (' + d.nSent + ')' : d.nSent)]),
        el('div', {}, [el('i', { class: 'sw', style: 'background:var(--c2)' }), 'Won: ' + (MONEY ? etb(d.won) + ' (' + d.nWon + ')' : d.nWon)]));
      tip.style.left = Math.min(70, Math.max(0, (i + 0.5) / data.length * 100 - 15)) + '%';
    });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
    svg.appendChild(hit);
  });
  const last = data[data.length - 1];
  return card(MONEY ? 'Value per month' : 'Proposals per month', 'Last 6 months · hover a month for the numbers', [
    el('div', { class: 'legend', style: 'margin-bottom:8px' }, [el('span', {}, [el('i', { style: 'background:var(--c1)' }), 'Sent']), el('span', {}, [el('i', { style: 'background:var(--c2)' }), 'Won'])]),
    wrap,
    el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px', text: MONEY ? 'This month: ' + short(last.sent) + ' ' + cur() + ' sent, ' + short(last.won) + ' ' + cur() + ' won · scale up to ' + short(max) + ' ' + cur() : 'This month: ' + last.nSent + ' sent, ' + last.nWon + ' won' })
  ]);
}

/* ---------- who to call ---------- */
function followCard(rows, data) {
  const list = rows.filter(r => r.needs && matches(r)).sort((a, b) => (a.openFollowup ? 1 : 0) - (b.openFollowup ? 1 : 0) || (b.needs.level === 'warn') - (a.needs.level === 'warn') || b.value - a.value);
  const ownerName = ((data.assignable || []).find(p => p.id === data.owner) || {}).name || 'the sales owner';
  return el('div', { id: 'followups', style: 'margin-top:14px' }, [card('Needs a follow-up', list.length ? list.filter(r => !r.openFollowup).length + ' to do · follow-ups go to ' + ownerName + ' as tasks' : null, [
    list.length ? el('div', { class: 'list' }, list.map(r => el('div', { class: 'item click fup' + (st.focus === 'follow' ? ' glow' : ''), onclick: () => detail(r, data) }, [
      el('span', { class: 'dot ' + r.needs.level }),
      el('span', { class: 'grow', style: 'min-width:200px' }, [el('b', { text: r.client + (r.projectName ? ' · ' + r.projectName : '') }), el('small', { text: join(r.needs.reason, etb(r.value)) })]),
      r.openFollowup
        ? chip('With ' + r.openFollowup.name.split(' ')[0] + ' · due ' + dateShort(r.openFollowup.dueDate), r.openFollowup.dueDate < today() ? 'bad' : 'info')
        : r.needs.kind === 'kickoff' || r.needs.kind === 'contract'
          ? (data.priceAccess ? el('a', { href: '/price#/quote/' + r.id, target: '_blank', rel: 'noopener', onclick: ev => ev.stopPropagation() }, [el('button', { class: 'sm', text: r.needs.kind === 'kickoff' ? 'Kick off ↗' : 'Contract ↗' })]) : null)
          : null,
      r.openFollowup ? null : el('button', { class: 'sm primary', text: 'Follow up', onclick: ev => { ev.stopPropagation(); followModal(r, data); } })
    ]))) : empty('Nobody to chase', 'Every proposal is either moving or already has a follow-up.')
  ])]);
}

/* ---------- the board ---------- */
function boardCard(rows, data) {
  const live = rows.filter(r => STAGE_LABEL[r.stage] && !['draft', 'lost', 'expired'].includes(r.stage) && matches(r));
  const focused = st.focus && !['follow'].includes(st.focus)
    ? live.filter(r => st.focus === 'open' ? OPEN_STAGES.includes(r.stage) : r.reached[st.focus] && inPeriod(r)) : live;
  const cols = el('div', { class: 'board' }, STAGES.map(([k, label]) => {
    const here = focused.filter(r => r.stage === k).sort((a, b) => String(a.stageSince).localeCompare(String(b.stageSince)));
    return el('div', { class: 'bcol' }, [
      el('div', { class: 'bhead' }, [el('b', { text: label }), el('span', { class: 'muted num', text: here.length ? (MONEY ? here.length + ' · ' + short(here.reduce((t, r) => t + r.value, 0)) : String(here.length)) : '0' })]),
      ...here.map(r => el('button', { type: 'button', class: 'bcard', onclick: () => detail(r, data) }, [
        el('div', { class: 'row', style: 'justify-content:space-between;gap:6px' }, [el('b', { text: r.client }), r.needs && !r.openFollowup ? el('span', { class: 'dot ' + r.needs.level, title: r.needs.reason }) : null]),
        r.projectName ? el('small', { text: r.projectName }) : null,
        el('div', { class: 'row', style: 'justify-content:space-between;gap:6px;margin-top:6px' }, [
          el('span', { class: 'num', text: etb(r.value) || r.type || '' }), el('span', { class: 'muted', style: 'font-size:12px', text: ago(r.stageSince) })]),
        r.openFollowup ? el('small', { class: 'fu', text: '☎ ' + r.openFollowup.name.split(' ')[0] + ' · ' + dateShort(r.openFollowup.dueDate) }) : null,
        r.project && r.project.progress ? el('div', { class: 'bar ok', style: 'margin-top:6px' }, [el('i', { style: 'width:' + r.project.progress.pct + '%' })]) : null
      ]))
    ]);
  }));
  const focusLabel = st.focus === 'open' ? 'open proposals' : st.focus && st.focus !== 'follow' ? 'reached “' + ((FUNNEL.find(f => f[0] === st.focus) || [])[1] || st.focus) + '” in this period' : '';
  return el('div', { id: 'pipeline', style: 'margin-top:14px' }, [card('Pipeline', focusLabel ? 'Showing proposals that ' + focusLabel : 'Every live proposal by where it stands · click a card for the details',
    [focusLabel ? el('div', { style: 'margin-bottom:10px' }, [el('button', { class: 'sm ghost', text: 'Show all ×', onclick: () => { st.focus = ''; rerender(); } })]) : null, cols])]);
}

function closedCard(rows, data) {
  const list = rows.filter(r => ['draft', 'lost', 'expired'].includes(r.stage) && matches(r));
  if (!list.length) return el('span');
  return el('div', { style: 'margin-top:14px' }, [
    el('button', { class: 'sm ghost', text: (st.closed ? 'Hide' : 'Show') + ' drafts, lost and expired (' + list.length + ')', onclick: () => { st.closed = !st.closed; rerender(); } }),
    st.closed ? el('div', { class: 'list', style: 'margin-top:10px' }, list.map(r => el('div', { class: 'item click', onclick: () => detail(r, data) }, [
      el('span', { class: 'grow' }, [el('b', { text: r.client + (r.projectName ? ' · ' + r.projectName : '') }),
        el('small', { text: join(STAGE_LABEL[r.stage] + (r.lostReason ? ': ' + r.lostReason : ''), etb(r.value), ago(r.lostAt || r.sentAt || r.createdAt)) })]),
      chip(STAGE_LABEL[r.stage], r.stage === 'lost' ? 'bad' : '')
    ]))) : null
  ]);
}

/* ================= one proposal ================= */
function detail(r, data) {
  const ev = [];
  const add = (at, text, tone) => at && ev.push({ at, text, tone });
  add(r.createdAt, 'Quote created');
  add(r.sentAt, 'Proposal sent' + (r.slug ? ' (' + location.host + '/price/' + r.slug + ')' : ''), 'info');
  if (r.updatedSentAt) add(r.updatedSentAt, 'Proposal updated and re-sent', 'info');
  add(r.viewedAt, 'Client opened it');
  r.requests.forEach(q => add(q.at, join('Client sent their version ' + q.ref, MONEY ? q.amount : '') + (q.message ? ' · “' + q.message.slice(0, 120) + '”' : ''), 'ok'));
  if (r.contract) { add(r.contract.date, 'Contract ' + r.contract.number + ' made'); add(r.contract.signedAt, 'Contract signed', 'ok'); }
  r.invoices.forEach(i => { add(i.date, join('Invoice ' + i.number, etb(i.totalEtb)) + (i.status === 'void' ? ' (cancelled)' : '')); add(i.paidAt, 'Invoice ' + i.number + ' paid', 'ok'); });
  if (r.project) add(r.project.completedAt, 'Project delivered', 'ok');
  r.followups.forEach(f => { add(f.createdAt, 'Follow-up given to ' + f.name + ' (due ' + dateShort(f.dueDate) + ')'); if (f.doneAt) add(f.doneAt, f.name + ' followed up: ' + (OUTCOME_LABEL[f.outcome] || 'done') + (f.outcomeNote ? ' · ' + f.outcomeNote : ''), f.outcome === 'lost' ? 'bad' : 'ok'); });
  add(r.lostAt, 'Marked lost' + (r.lostReason ? ': ' + r.lostReason : ''), 'bad');
  ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const c = r.contact;
  const isLost = r.status === 'lost';
  modal(r.client + (r.projectName ? ' · ' + r.projectName : ''), [
    el('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:12px' }, [chip(STAGE_LABEL[r.stage] || r.stage, r.stage === 'lost' ? 'bad' : won(r) ? 'ok' : 'info'),
      r.needs ? chip(r.needs.reason, r.needs.level === 'warn' ? 'bad' : 'warn') : null]),
    el('div', { class: 'grid2', style: 'margin-bottom:12px' }, [
      MONEY ? fact('Value', etb(r.value) + (r.value !== r.quoted ? ' (quoted ' + etb(r.quoted) + ')' : '')) : fact('Stage', STAGE_LABEL[r.stage] || r.stage),
      fact('Contact', [c.name, c.email ? el('a', { href: 'mailto:' + c.email, text: c.email }) : null, c.phone ? el('a', { href: 'tel:' + c.phone.replace(/\s/g, ''), text: c.phone }) : null].filter(Boolean)),
      fact('Type', r.type || '—'),
      fact('Proposal', r.slug ? [el('a', { href: '/price/' + r.slug, target: '_blank', rel: 'noopener', text: location.host + '/price/' + r.slug })] : r.sentAt ? 'Sent ' + ago(r.sentAt) : 'Not sent yet')
    ]),
    r.project ? el('div', { class: 'card', style: 'background:var(--soft);border:0;margin-bottom:12px' }, [
      el('div', { class: 'row', style: 'justify-content:space-between' }, [el('b', { text: 'With the team: ' + r.project.name }), el('span', { class: 'muted', text: r.project.progress.done + ' / ' + r.project.progress.total + ' tasks' })]),
      el('div', { class: 'bar ok', style: 'margin-top:8px' }, [el('i', { style: 'width:' + r.project.progress.pct + '%' })])
    ]) : null,
    el('b', { text: 'History' }),
    el('div', { class: 'timeline' }, ev.map(e => el('div', { class: 'tl ' + (e.tone || '') }, [el('span', { class: 'muted', text: dateShort(String(e.at).slice(0, 10)) }), el('span', { text: e.text })])))
  ], [
    isLost ? el('button', { class: 'ghost', text: 'Re-open', onclick: () => act({ action: 'salesStatus', quoteId: r.id, status: 'open' }, 'Proposal re-opened', () => { closeModal(); refreshView(); }).catch(() => {}) })
      : el('button', { class: 'ghost', text: 'Mark lost', onclick: () => lostModal(r) }),
    r.project ? el('button', { class: 'ghost', text: 'Open project', onclick: () => { closeModal(); go('#/project/' + r.project.id); } }) : null,
    data.priceAccess ? el('a', { href: '/price#/quote/' + r.id, target: '_blank', rel: 'noopener' }, [el('button', { class: 'ghost', text: 'Price Builder ↗' })]) : null,
    el('button', { class: 'ghost', text: 'Close', onclick: closeModal }),
    !isLost && !r.openFollowup ? el('button', { class: 'primary', text: 'Follow up', onclick: () => followModal(r, data) }) : null
  ]);
}
const fact = (k, v) => el('div', {}, [el('div', { class: 'muted', style: 'font-size:12.5px', text: k }),
  el('div', { class: 'stack', style: 'gap:2px' }, (Array.isArray(v) ? v : [v]).map(x => typeof x === 'string' ? el('span', { text: x }) : x))]);

/* the suggested wording for the follow-up task */
function suggestion(r) {
  const who = r.contact.name || 'the client';
  switch (r.needs && r.needs.kind) {
    case 'payment': return 'Call ' + who + ' about the unpaid invoice and confirm when the payment will be made.';
    case 'contract': return 'Get in touch with ' + who + ' to send the contract and agree on signing.';
    case 'kickoff': return 'Confirm the start date with ' + who + ' so the project can be kicked off.';
    default: return 'Call ' + who + ' to check they have seen the proposal, answer questions and agree next steps.';
  }
}

function followModal(r, data) {
  const people = data.assignable || [];
  const who = select(people.some(p => p.id === data.owner) ? data.owner : (me() || {}).employeeId, people.map(p => ({ value: p.id, label: p.name + (p.id === data.owner ? ' (sales owner)' : '') })));
  const due = el('input', { type: 'date', value: tomorrow() });
  const pri = select('high', [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]);
  const noteBox = textarea(suggestion(r), { style: 'min-height:80px' });
  modal('Follow up: ' + r.client, [
    r.needs ? el('p', { class: 'dim', style: 'margin-bottom:12px', text: r.needs.reason + '.' }) : null,
    el('div', { class: 'grid2' }, [field('Who', who), field('By when', due)]),
    field('What to do', noteBox),
    field('Priority', pri),
    el('p', { class: 'muted', style: 'font-size:12.5px', text: 'It becomes a task with the client’s contact details and the proposal link. When it is done they log how it went, and it shows here.' })
  ], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Create follow-up task', onclick: ev => {
      ev.target.disabled = true;
      act({ action: 'salesFollowup', quoteId: r.id, employeeId: who.value, dueDate: due.value, note: noteBox.value, priority: pri.value },
        'Follow-up task given to ' + ((people.find(p => p.id === who.value) || {}).name || 'them'), () => { closeModal(); refreshView(); }).catch(() => { ev.target.disabled = false; });
    } })
  ]);
}

function lostModal(r) {
  const why = select('', [{ value: '', label: 'Why was it lost?' }].concat(['Price too high', 'Went with another agency', 'Project postponed or cancelled', 'No reply', 'Scope did not fit', 'Other'].map(x => ({ value: x, label: x }))));
  const noteBox = textarea('', { placeholder: 'Anything to remember (optional)' });
  modal('Mark ' + r.client + ' as lost', [field('Reason', why), field('Note', noteBox),
    el('p', { class: 'muted', style: 'font-size:12.5px', text: 'It moves out of the pipeline. You can re-open it any time.' })], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'danger', text: 'Mark lost', onclick: () => {
      if (!why.value) { why.focus(); return; }
      act({ action: 'salesStatus', quoteId: r.id, status: 'lost', reason: why.value + (noteBox.value.trim() ? ': ' + noteBox.value.trim() : '') }, 'Marked lost', () => { closeModal(); refreshView(); }).catch(() => {});
    } })
  ]);
}

function rulesModal(data) {
  const r = data.rules || {};
  const people = data.assignable || [];
  const owner = select(r.owner || '', people.map(p => ({ value: p.id, label: p.name })));
  const num = (k, label) => { const i = el('input', { type: 'number', min: 0, max: 60, value: r[k] }); i.dataset.k = k; return field(label, i); };
  const fields = [num('sentDays', 'Not opened after (days)'), num('openedDays', 'Opened, no reply after (days)'), num('repliedDays', 'Client replied, no contract after (days)'),
    num('contractDays', 'Contract not signed after (days)'), num('expiringDays', 'Warn before it expires (days)')];
  modal('Follow-up rules', [field('Follow-ups go to', owner), el('div', { class: 'grid2' }, fields)], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save', onclick: () => {
      const rules = { owner: owner.value };
      fields.forEach(f => { const i = f.querySelector('input'); rules[i.dataset.k] = Number(i.value); });
      act({ action: 'saveSalesRules', rules }, 'Rules saved', () => { closeModal(); refreshView(); }).catch(() => {});
    } })
  ], { sub: 'When a proposal shows up under “Needs a follow-up”.' });
}

/* ---------- logging a follow-up (from the task) ---------- */
export function logFollowupModal(t, after) {
  let pick = '';
  const nextDate = el('input', { type: 'date', value: (() => { const d = new Date(Date.now() + 3 * 86400000); return d.toISOString().slice(0, 10); })() });
  const nextBox = field('Follow up again on', nextDate); nextBox.hidden = true;
  const opts = el('div', { class: 'outcomes' }, OUTCOMES.map(([k, label]) => el('button', { type: 'button', class: 'outcome', 'aria-pressed': 'false', text: label, onclick: ev => {
    pick = k; opts.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === ev.target)));
    nextBox.hidden = k !== 'later';
  } })));
  const noteBox = textarea('', { placeholder: 'What did they say? (the team sees this on the proposal)' });
  modal('How did it go?', [el('p', { class: 'dim', style: 'margin-bottom:10px', text: t.title }), opts, nextBox, field('Note', noteBox)], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save', onclick: () => {
      if (!pick) { toast('Choose how it went.', true); return; }
      act({ action: 'completeFollowup', id: t.id, outcome: pick, note: noteBox.value, nextDate: nextDate.value },
        pick === 'later' ? 'Logged · next follow-up on ' + dateShort(nextDate.value) : 'Follow-up logged', () => { closeModal(); cache = null; if (after) after(); else window.dispatchEvent(new Event('gz:render')); }).catch(() => {});
    } })
  ]);
}
