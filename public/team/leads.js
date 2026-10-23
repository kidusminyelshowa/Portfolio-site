/* Sales leads, the part of the pipeline before a proposal.
   Leads are researched in a Claude chat ("Get leads from Claude" gives the exact prompt),
   pasted or uploaded here ("Import leads"), and worked by the sales owner: call, message,
   email, meet, log how it went, set the next follow-up, give a task, and finally make a
   proposal in the Price Builder (prefilled, and linked back to the lead).
   Data: GET /api/team?leads=1 and the lead actions in api/team.js (api/_leads.js). */
import {
  el, frag, S, me, isAdmin, isManager, chip, card, empty, field, input, textarea, select, tile, modal, closeModal, toast, api,
  dateShort, today, daysBetween, avatar
} from '/team/ui.js';
import { brand, brandName } from '/team/ui.js';
import { loadSales } from '/team/sales.js';

const go = h => { location.hash = h; };
export const LEAD_STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['meeting', 'Meeting'], ['proposal', 'Proposal'], ['won', 'Won']];
const STAGE_LABEL = Object.fromEntries(LEAD_STAGES.concat([['lost', 'Lost']]));
const KINDS = [['call', 'Call'], ['message', 'Message'], ['email', 'Email'], ['meeting', 'Meeting'], ['visit', 'Visit'], ['note', 'Note']];
const OUTCOMES = [['', 'How did it go?'], ['no_answer', 'No answer'], ['left_message', 'Left a message'], ['talked', 'Talked'], ['interested', 'Interested'],
  ['meeting_set', 'Meeting set'], ['wants_proposal', 'Wants a proposal'], ['not_now', 'Not now, later'], ['not_interested', 'Not interested'], ['wrong_contact', 'Wrong contact']];
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES);
const KIND_LABEL = Object.fromEntries(KINDS.concat([['stage', 'Stage'], ['task', 'Task']]));
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
const first = n => String(n || '').split(' ')[0];

/* ---------- data ---------- */
let cache = null, inflight = null;
export async function loadLeads(force) {
  if (!force && cache) return cache;
  if (inflight) return inflight;
  inflight = fetch('/api/team?leads=1', { cache: 'no-store' }).then(async r => {
    const b = await r.json().catch(() => ({}));
    if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
    if (!r.ok) throw new Error(b.error || 'Could not load the leads');
    cache = b;
    return b;
  }).finally(() => { inflight = null; });
  return inflight;
}
const redraw = () => window.dispatchEvent(new Event('gz:render'));
/* run a lead action; the answer carries the fresh lead list */
async function leadAct(body, okText) {
  try {
    const b = await api(body);
    if (b.leads) cache = { ...cache, leads: b.leads, people: b.people || (cache && cache.people), owner: b.owner, canImport: b.canImport, showMoney: b.showMoney, priceAccess: b.priceAccess };
    if (okText) toast(okText);
    return b;
  } catch (e) { toast(e.message, true); throw e; }
}

/* the proposal made from a lead: linked by the lead id, else by the company name */
const norm = s => String(s || '').toLowerCase().replace(/\b(plc|ltd|llc|share company|sc|inc)\b/g, '').replace(/[^a-z0-9]/g, '');
let salesRows = [];
const proposalOf = l => salesRows.find(r => r.leadId === l.id) || salesRows.find(r => norm(r.client) && norm(r.client) === norm(l.company)) || null;
/* where a lead really is: a proposal moves it on, a won deal wins it */
export function stageOf(l) {
  if (l.stage === 'lost') return 'lost';
  const p = proposalOf(l);
  if (p && p.reached && (p.reached.signed || p.reached.paid)) return 'won';
  if (p && LEAD_STAGES.findIndex(s => s[0] === l.stage) < 4) return 'proposal';
  return l.stage;
}
const due = l => l.nextFollowUp && !['won', 'lost'].includes(stageOf(l)) && l.nextFollowUp <= today();
const personName = id => ((cache && cache.people) || []).find(p => p.id === id)?.name || '';

/* ---------- contact links ---------- */
/* a local number (0 9…, or 9 digits) gets the country code from Settings → Brand & region
   (the Ethiopia preset fills it in); without a code, numbers are used as typed */
const digits = p => { let d = String(p || '').replace(/\D/g, ''); const cc = brand().phoneCode || ''; if (!cc) return d;
  if (d.length === 10 && d[0] === '0') d = cc + d.slice(1); if (d.length === 9 && /^[79]/.test(d)) d = cc + d; return d; };
const telHref = p => 'tel:+' + digits(p);
const waHref = (p, text) => 'https://wa.me/' + digits(p) + (text ? '?text=' + encodeURIComponent(text) : '');
const tgHref = h => /^https?:/i.test(h) ? h : 'https://t.me/' + String(h).replace(/^@/, '');
const mailHref = l => 'mailto:' + l.email + '?subject=' + encodeURIComponent(l.emailSubject || '') + '&body=' + encodeURIComponent(l.emailBody || '');
const webHref = u => /^https?:/i.test(u) ? u : 'https://' + u;
const linkBtn = (href, text, cls) => el('a', { href, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener', onclick: ev => ev.stopPropagation() }, [el('button', { class: 'sm ' + (cls || ''), type: 'button', text })]);
async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast((what || 'Text') + ' copied'); }
  catch (e) { const t = el('textarea', {}, [text]); document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast((what || 'Text') + ' copied'); } catch (x) { toast('Could not copy', true); } t.remove(); }
}

/* ---------- small pieces ---------- */
const prioChip = p => chip(p === 'hot' ? 'Hot' : p === 'cold' ? 'Cold' : 'Warm', p === 'hot' ? 'accent' : p === 'cold' ? '' : 'warn');
function followChip(l) {
  if (!l.nextFollowUp || ['won', 'lost'].includes(stageOf(l))) return null;
  const d = daysBetween(today(), l.nextFollowUp);
  return d < 0 ? chip((-d) + 'd overdue', 'bad') : d === 0 ? chip('Today', 'warn') : chip(d === 1 ? 'Tomorrow' : dateShort(l.nextFollowUp).replace(/ \d{4}$/, ''));
}
function leadCard(l) {
  const p = proposalOf(l);
  const c = el('div', { class: 'tcard' + (l.priority === 'hot' && !['won', 'lost'].includes(stageOf(l)) ? ' dark' : ''), tabindex: '0', role: 'button', onclick: () => leadModal(l.id) }, [
    el('div', { class: 'tc-tags' }, [prioChip(l.priority), p ? chip('Proposal: ' + (p.stage || ''), 'ok') : null]),
    el('b', { text: l.company }),
    l.contactName || l.sector ? el('small', { text: [l.contactName && l.contactName + (l.role ? ', ' + l.role : ''), l.sector].filter(Boolean).join(' · ') }) : null,
    l.need ? el('small', { class: 'clamp2', text: l.need }) : null,
    el('div', { class: 'tc-foot' }, [l.ownerId ? avatar(personName(l.ownerId), 'xs') : null, followChip(l), el('span', { class: 'grow' }),
      l.activity && l.activity.length ? el('span', { class: 'muted num', style: 'font-size:12px', text: l.activity.filter(a => !['stage', 'task'].includes(a.kind)).length + ' touch' + (l.activity.length === 1 ? '' : 'es') }) : null])
  ]);
  c.addEventListener('keydown', ev => { if (ev.key === 'Enter') leadModal(l.id); });
  return c;
}

/* ================= the page ================= */
const st = { q: '', stage: '', owner: '', prio: '', lost: false };
export function viewLeads() {
  const root = el('div');
  const paint = () => { root.textContent = ''; root.appendChild(draw()); };
  if (cache) paint(); else root.appendChild(el('div', { class: 'skel', style: 'height:420px' }));
  Promise.all([loadLeads(false), loadSales(false).then(d => { salesRows = d.rows || []; }).catch(() => {})])
    .then(paint).catch(e => { root.textContent = ''; root.appendChild(empty('Could not load the leads', e.message)); });
  return root;
}

function draw() {
  const all = cache.leads || [];
  const match = l => (!st.q || [l.company, l.contactName, l.sector, l.city, l.need, l.phone, l.email].join(' ').toLowerCase().includes(st.q.toLowerCase()))
    && (!st.owner || l.ownerId === st.owner) && (!st.prio || l.priority === st.prio) && (!st.stage || stageOf(l) === st.stage);
  const list = all.filter(match);
  const open = all.filter(l => !['won', 'lost'].includes(stageOf(l)));
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const touched = all.filter(l => (l.activity || []).some(a => a.at >= weekAgo && !['stage', 'task', 'note'].includes(a.kind)));
  const dueNow = open.filter(due).sort((a, b) => (a.priority === 'hot' ? -1 : 0) - (b.priority === 'hot' ? -1 : 0) || String(a.nextFollowUp).localeCompare(String(b.nextFollowUp)));

  const search = el('input', { type: 'search', placeholder: 'Search company, contact, sector…', value: st.q, 'aria-label': 'Search leads' });
  let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; redraw(); setTimeout(() => { const s = document.querySelector('.leadsbar input[type=search]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 0); }, 200); });
  const bar = el('div', { class: 'salesbar leadsbar' }, [
    search,
    select(st.stage, [{ value: '', label: 'Every stage' }].concat(LEAD_STAGES.concat([['lost', 'Lost']]).map(([v, l]) => ({ value: v, label: l }))), { onchange: ev => { st.stage = ev.target.value; redraw(); } }),
    select(st.owner, [{ value: '', label: 'Everyone' }].concat((cache.people || []).map(p => ({ value: p.id, label: p.name }))), { onchange: ev => { st.owner = ev.target.value; redraw(); } }),
    select(st.prio, [{ value: '', label: 'Hot, warm and cold' }, { value: 'hot', label: 'Hot' }, { value: 'warm', label: 'Warm' }, { value: 'cold', label: 'Cold' }], { onchange: ev => { st.prio = ev.target.value; redraw(); } }),
    el('span', { class: 'grow' }),
    cache.canImport ? el('button', { class: 'sm', text: 'Get leads from Claude', onclick: promptModal }) : null,
    cache.canImport ? el('button', { class: 'sm', text: 'Import leads', onclick: importModal }) : null,
    cache.canImport ? el('button', { class: 'sm primary', text: 'Add lead', onclick: () => editModal(null) }) : null
  ]);

  if (!all.length) return frag([bar, empty('No leads yet', 'Press “Get leads from Claude” for the prompt, run it in a Claude chat, then “Import leads” and paste what it gives you.',
    cache.canImport ? el('button', { class: 'primary', text: 'Get leads from Claude', onclick: promptModal }) : null)]);

  const proposals = all.filter(l => proposalOf(l)).length, won = all.filter(l => stageOf(l) === 'won').length;
  const tiles = el('div', { class: 'kpis', style: 'margin-bottom:14px' }, [
    tile('Open leads', String(open.length), all.length + ' in total', () => { st.stage = ''; redraw(); }),
    tile('Follow up today', String(dueNow.length), dueNow.length ? 'calls and messages due' : 'all caught up', () => { const n = document.querySelector('#leaddue'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }),
    tile('Contacted this week', String(touched.length), 'leads with a call, message or meeting'),
    tile('Became proposals', String(proposals), all.length ? Math.round(proposals / all.length * 100) + '% of all leads' : ''),
    tile('Won', String(won), proposals ? Math.round(won / Math.max(1, proposals) * 100) + '% of proposals' : 'from leads')
  ]);

  const dueCard = el('div', { id: 'leaddue', style: 'margin-bottom:14px' }, [card('Follow up today', dueNow.length ? dueNow.length + ' due · hot leads first' : 'Nothing due today', [
    dueNow.length ? el('div', { class: 'list' }, dueNow.slice(0, 12).map(l => el('div', { class: 'item click', style: 'flex-wrap:wrap', onclick: () => leadModal(l.id) }, [
      prioChip(l.priority),
      el('span', { class: 'grow', style: 'min-width:180px' }, [el('b', { text: l.company }),
        el('small', { text: [l.contactName, STAGE_LABEL[stageOf(l)], l.lastContactAt ? 'last contact ' + dateShort(l.lastContactAt.slice(0, 10)) : 'not contacted yet'].filter(Boolean).join(' · ') })]),
      followChip(l),
      l.phone ? linkBtn(telHref(l.phone), 'Call') : null,
      l.whatsapp || l.phone ? linkBtn(waHref(l.whatsapp || l.phone, l.firstMessage), 'WhatsApp') : null,
      el('button', { class: 'sm primary', text: 'Log', onclick: ev => { ev.stopPropagation(); leadModal(l.id, true); } })
    ]))) : empty('All caught up', 'No calls or messages are due today.')
  ])]);

  const board = el('div', { class: 'kanban leadboard' }, LEAD_STAGES.map(([s, label]) => {
    const here = list.filter(l => stageOf(l) === s).sort((a, b) => ({ hot: 0, warm: 1, cold: 2 }[a.priority] - { hot: 0, warm: 1, cold: 2 }[b.priority]) || String(a.nextFollowUp || '9').localeCompare(String(b.nextFollowUp || '9')));
    return el('section', { class: 'kcol', 'data-stage': s }, [
      el('header', {}, [el('b', { text: label }), el('span', { class: 'muted num', text: String(here.length) })]),
      el('div', { class: 'kitems' }, here.length ? here.slice(0, 60).map(leadCard) : [el('div', { class: 'kempty', text: 'Nothing here' })])
    ]);
  }));
  const lost = list.filter(l => stageOf(l) === 'lost');

  return frag([bar, tiles, dueCard,
    el('div', { class: 'tablecard boardcard', style: 'padding:14px' }, [board]),
    lost.length ? el('div', { style: 'margin-top:14px' }, [
      el('button', { class: 'sm ghost', text: (st.lost ? 'Hide' : 'Show') + ' lost leads (' + lost.length + ')', onclick: () => { st.lost = !st.lost; redraw(); } }),
      st.lost ? el('div', { class: 'list', style: 'margin-top:10px' }, lost.map(l => el('div', { class: 'item click', onclick: () => leadModal(l.id) }, [
        el('span', { class: 'grow' }, [el('b', { text: l.company }), el('small', { text: [l.lostReason, l.sector].filter(Boolean).join(' · ') })]), chip('Lost', 'bad')]))) : null
    ]) : null,
    el('div', { class: 'grid2', style: 'margin-top:14px' }, [funnelCard(all), activityCard(all)])
  ]);
}

/* how far leads get, and what the team did this week */
function funnelCard(all) {
  const order = LEAD_STAGES.map(s => s[0]);
  const reached = s => all.filter(l => { const x = stageOf(l); return x !== 'lost' ? order.indexOf(x) >= order.indexOf(s) : (l.activity || []).some(a => a.kind === 'stage' && a.outcome === s) || (s === 'contacted' && !!l.lastContactAt); }).length;
  const n0 = all.length || 1;
  return card('How far leads get', all.length + ' leads · share of all leads', [el('div', { class: 'stages' }, LEAD_STAGES.map(([s, label]) => {
    const n = s === 'new' ? all.length : reached(s);
    return el('div', { class: 'srow' }, [el('span', { class: 'sl', text: label }), el('span', { class: 'strack' }, [el('i', { style: 'width:' + Math.round(n / n0 * 100) + '%' })]), el('span', { class: 'sn num', text: n + ' · ' + Math.round(n / n0 * 100) + '%' })]);
  }))]);
}
function activityCard(all) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const acts = all.flatMap(l => (l.activity || []).filter(a => a.at >= weekAgo && !['stage', 'task'].includes(a.kind)));
  const by = {};
  acts.forEach(a => { const k = a.byName || '—'; by[k] = by[k] || { calls: 0, msgs: 0, meet: 0, n: 0 }; by[k].n++; if (a.kind === 'call') by[k].calls++; else if (['message', 'email'].includes(a.kind)) by[k].msgs++; else if (['meeting', 'visit'].includes(a.kind)) by[k].meet++; });
  const rows = Object.entries(by).sort((a, b) => b[1].n - a[1].n);
  const max = Math.max(1, ...rows.map(r => r[1].n));
  return card('This week’s outreach', acts.length + ' calls, messages and meetings in 7 days', [
    rows.length ? el('div', { class: 'lboard' }, rows.map(([name, r]) => el('div', { class: 'lrow' }, [avatar(name, 'sm'),
      el('span', { class: 'grow' }, [el('b', { text: name }), el('div', { class: 'lbar' }, [el('i', { style: 'width:' + Math.round(r.n / max * 100) + '%' })])]),
      el('span', { class: 'lnums' }, [el('b', { class: 'num', text: String(r.n) }), el('small', { text: r.calls + ' calls · ' + r.msgs + ' msgs · ' + r.meet + ' meetings' })])]))) : empty('No outreach logged this week', 'Log each call or message on the lead.')
  ]);
}

/* ================= one lead ================= */
export async function leadModal(id, focusLog) {
  if (!cache) { try { await loadLeads(false); } catch (e) { return toast(e.message, true); } }
  const l = (cache.leads || []).find(x => x.id === id);
  if (!l) return toast('Lead not found', true);
  const p = proposalOf(l);
  const block = (label, text, copyAs) => text ? el('div', { class: 'leadmsg' }, [
    el('div', { class: 'row', style: 'justify-content:space-between' }, [el('span', { class: 'muted', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.08em', text: label }),
      copyAs ? el('button', { class: 'sm ghost', text: 'Copy', onclick: () => copy(text, copyAs) }) : null]),
    el('p', { style: 'white-space:pre-wrap;margin-top:4px', text })]) : null;

  // log a call / message / meeting
  let kind = 'call';
  const kindSeg = el('div', { class: 'seg', role: 'radiogroup' }, KINDS.map(([v, t]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(v === kind), text: t,
    onclick: ev => { kind = v; kindSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b === ev.target))); } })));
  const outcome = select('', OUTCOMES.map(([v, t]) => ({ value: v, label: t })));
  const note = textarea('', { placeholder: 'What was said, what they asked for, what happens next', style: 'min-height:70px' });
  const nextAt = input('', { type: 'date' });
  const mkTask = el('input', { type: 'checkbox', checked: true });
  const logBox = el('div', { class: 'card', style: 'background:var(--soft);border:0;margin:12px 0' }, [
    el('b', { text: 'Log a touch' }),
    el('div', { style: 'margin:10px 0;overflow-x:auto' }, [kindSeg]),
    el('div', { class: 'grid2' }, [field('Outcome', outcome), field('Next follow-up', nextAt, 'Empty = picked from the outcome')]),
    field('Note', note),
    el('label', { class: 'row', style: 'gap:8px;font-size:13.5px;margin-bottom:10px' }, [mkTask, 'Make a task for the next follow-up (with reminders)']),
    el('button', { class: 'primary', text: 'Log it', onclick: async () => {
      await leadAct({ action: 'logLeadActivity', id: l.id, activity: { kind, outcome: outcome.value, note: note.value, nextAt: nextAt.value }, makeTask: mkTask.checked }, 'Logged').catch(() => {});
      leadModal(l.id); redraw();
    } })
  ]);

  const timeline = (l.activity || []).slice().reverse();
  const contacts = el('div', { class: 'row wrap', style: 'gap:6px;margin:10px 0' }, [
    l.phone ? linkBtn(telHref(l.phone), 'Call ' + l.phone, 'primary') : null,
    l.whatsapp || l.phone ? linkBtn(waHref(l.whatsapp || l.phone, l.firstMessage), 'WhatsApp') : null,
    l.telegram ? linkBtn(tgHref(l.telegram), 'Telegram') : null,
    l.email ? linkBtn(mailHref(l), 'Email') : null,
    l.website ? linkBtn(webHref(l.website), 'Website ↗') : null,
    l.instagram ? linkBtn(webHref(l.instagram.startsWith('@') ? 'instagram.com/' + l.instagram.slice(1) : l.instagram), 'Instagram ↗') : null,
    l.linkedin ? linkBtn(webHref(l.linkedin), 'LinkedIn ↗') : null
  ]);
  const stageSel = select(l.stage, LEAD_STAGES.concat([['lost', 'Lost']]).map(([v, t]) => ({ value: v, label: t })), { onchange: async ev => {
    let lostReason = '';
    if (ev.target.value === 'lost') { lostReason = prompt('Why was it lost? (e.g. no budget, chose another agency)') || ''; }
    await leadAct({ action: 'saveLead', lead: { id: l.id, stage: ev.target.value, lostReason } }, 'Moved to ' + STAGE_LABEL[ev.target.value]).catch(() => {});
    leadModal(l.id); redraw();
  } });

  const proposalBtn = p
    ? (cache.priceAccess ? el('a', { href: '/price#/quote/' + p.id, target: '_blank', rel: 'noopener' }, [el('button', { text: 'Open proposal ↗' })]) : el('button', { text: 'Sales pipeline', onclick: () => { closeModal(); store.set('gz-sales-tab', 'proposals'); redraw(); } }))
    : cache.priceAccess ? el('a', { href: '/price#/new?' + new URLSearchParams({ lead: l.id, company: l.company, client: l.contactName || '', project: l.service || '', sector: l.sector || '', notes: [l.need && 'Needs: ' + l.need, l.notes].filter(Boolean).join('\n') }).toString(), target: '_blank', rel: 'noopener' }, [el('button', { text: 'Make proposal ↗' })]) : null;

  modal(l.company, [
    el('div', { class: 'row wrap', style: 'gap:8px' }, [prioChip(l.priority), chip(STAGE_LABEL[stageOf(l)], 'info'), followChip(l), p ? chip('Proposal: ' + p.stage, 'ok') : null,
      l.ownerId ? chip('Owner: ' + first(personName(l.ownerId))) : null]),
    el('p', { class: 'dim', style: 'margin-top:8px', text: [l.contactName && l.contactName + (l.role ? ', ' + l.role : ''), l.sector, l.size, l.city, l.source && 'source: ' + l.source].filter(Boolean).join(' · ') }),
    contacts,
    el('div', { class: 'grid2' }, [block('What they need', l.need), block('What we offer them', l.service)]),
    block('Notes from Claude', l.notes),
    block('First message', l.firstMessage, 'Message'),
    l.emailSubject || l.emailBody ? block('Email', (l.emailSubject ? 'Subject: ' + l.emailSubject + '\n\n' : '') + (l.emailBody || ''), 'Email') : null,
    block('Call script', l.callScript, 'Call script'),
    field('Stage', stageSel),
    logBox,
    timeline.length ? el('div', {}, [el('div', { class: 'muted', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px', text: 'History' }),
      el('div', { class: 'timeline' }, timeline.slice(0, 40).map(a => el('div', { class: 'tl' + (a.outcome === 'not_interested' || a.outcome === 'lost' ? ' bad' : ['interested', 'meeting_set', 'wants_proposal', 'won'].includes(a.outcome) ? ' ok' : '') }, [
        el('span', { class: 'muted', text: dateShort(a.at.slice(0, 10)).replace(/ \d{4}$/, '') }),
        el('span', { text: [first(a.byName), KIND_LABEL[a.kind] || a.kind, a.kind === 'stage' ? '→ ' + (STAGE_LABEL[a.outcome] || a.outcome) : OUTCOME_LABEL[a.outcome], a.note].filter(Boolean).join(' · ') })])))]) : null
  ], [
    cache.canImport ? el('button', { class: 'danger', text: 'Delete', onclick: async () => { if (!confirm('Delete ' + l.company + '?')) return; await leadAct({ action: 'deleteLead', id: l.id }, 'Lead deleted').catch(() => {}); closeModal(); redraw(); } }) : null,
    el('button', { class: 'ghost', text: 'Edit', onclick: () => editModal(l) }),
    el('button', { class: 'ghost', text: 'Give a task', onclick: () => taskForLead(l) }),
    proposalBtn,
    el('button', { class: 'primary', text: 'Close', onclick: () => { closeModal(); redraw(); } })
  ]);
  if (focusLog) setTimeout(() => logBox.scrollIntoView({ block: 'center' }), 60);
}

function taskForLead(l) {
  const people = cache.people || [];
  const who = select(l.ownerId || cache.owner || me().employeeId || '', people.map(p => ({ value: p.id, label: p.name })));
  const title = input('Call ' + (l.contactName ? l.contactName + ' at ' : '') + l.company);
  const dueDate = input(l.nextFollowUp && l.nextFollowUp >= today() ? l.nextFollowUp : today(), { type: 'date' });
  const dueTime = input('', { type: 'time', step: 900 });
  const prio = select(l.priority === 'hot' ? 'high' : 'normal', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']].map(([v, t]) => ({ value: v, label: t })));
  const desc = textarea([l.contactName && 'Contact: ' + l.contactName + (l.role ? ' (' + l.role + ')' : ''), l.phone && 'Phone: ' + l.phone, l.email && 'Email: ' + l.email,
    l.need && 'Needs: ' + l.need, l.firstMessage && '\nMessage to send:\n' + l.firstMessage, l.callScript && '\nCall script:\n' + l.callScript].filter(Boolean).join('\n'));
  modal('Task for ' + l.company, [field('Task', title), el('div', { class: 'grid3' }, [field('Who', who), field('Due', dueDate), field('Time', dueTime, 'Optional')]), field('Priority', prio), field('Details', desc)], [
    el('button', { class: 'ghost', text: 'Back', onclick: () => leadModal(l.id) }),
    el('button', { class: 'primary', text: 'Give task', onclick: async () => {
      await leadAct({ action: 'leadTask', id: l.id, employeeId: who.value, title: title.value, dueDate: dueDate.value, dueTime: dueTime.value, priority: prio.value, description: desc.value }, 'Task given').catch(() => {});
      leadModal(l.id); redraw();
    } })
  ], { sub: 'It shows on their task board with the usual reminders.' });
}

const EDIT_FIELDS = [['company', 'Company'], ['contactName', 'Contact name'], ['role', 'Their role'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp'], ['telegram', 'Telegram'],
  ['email', 'Email'], ['website', 'Website'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['sector', 'Sector'], ['size', 'Size'], ['city', 'City'], ['source', 'Source']];
const EDIT_LONG = [['need', 'What they need'], ['service', 'What we offer them'], ['firstMessage', 'First message'], ['emailSubject', 'Email subject'], ['emailBody', 'Email'], ['callScript', 'Call script'], ['notes', 'Notes']];
function editModal(l) {
  const f = {};
  const base = l || { priority: 'warm' };
  EDIT_FIELDS.forEach(([k]) => { f[k] = input(base[k] || ''); });
  EDIT_LONG.forEach(([k]) => { f[k] = k === 'emailSubject' ? input(base[k] || '') : textarea(base[k] || ''); });
  f.priority = select(base.priority || 'warm', [['hot', 'Hot'], ['warm', 'Warm'], ['cold', 'Cold']].map(([v, t]) => ({ value: v, label: t })));
  f.ownerId = select(base.ownerId || cache.owner || '', [{ value: '', label: 'Nobody yet' }].concat((cache.people || []).map(p => ({ value: p.id, label: p.name }))));
  f.nextFollowUp = input(base.nextFollowUp || '', { type: 'date' });
  modal(l ? 'Edit ' + l.company : 'New lead', [
    el('div', { class: 'grid2' }, EDIT_FIELDS.map(([k, t]) => field(t, f[k]))),
    el('div', { class: 'grid3' }, [field('Priority', f.priority), field('Owner', f.ownerId), field('Next follow-up', f.nextFollowUp)]),
    ...EDIT_LONG.map(([k, t]) => field(t, f[k]))
  ], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: () => (l ? leadModal(l.id) : closeModal()) }),
    el('button', { class: 'primary', text: 'Save', onclick: async () => {
      const lead = { id: l ? l.id : undefined };
      Object.keys(f).forEach(k => { lead[k] = f[k].value; });
      if (!isManager()) delete lead.ownerId;
      const b = await leadAct({ action: 'saveLead', lead }, 'Saved').catch(() => null);
      if (b) { leadModal(b.id || (l && l.id)); redraw(); }
    } })
  ]);
}

/* ================= Claude: the prompt, and importing what it gives back ================= */
export const LEAD_COLUMNS = ['company', 'contact_name', 'role', 'phone', 'email', 'whatsapp', 'telegram', 'instagram', 'linkedin', 'website', 'sector', 'size', 'city',
  'need', 'suggested_service', 'priority', 'best_channel', 'first_message', 'email_subject', 'email_body', 'call_script', 'notes', 'source'];
function leadPrompt(n, who) {
  const b = brand(), name = brandName(), where = [b.city, b.country].filter(Boolean).join(', ');
  return `You are a sales researcher for ${name}, a creative studio${where ? ' in ' + where : ''}${b.website ? ' (' + b.website.replace(/^https?:\/\//, '') + ')' : ''}. ${name} does ${b.services || 'creative work'}.

Find ${n} real companies${b.country ? ' in ' + b.country : ''} that would likely buy from ${name}${who ? ': ' + who : ''}. Look for clear signs of need: an outdated or missing logo or website, weak or inactive social media, a new branch, product launch, rebrand, funding, or hiring for marketing.

Rules:
- Only real, existing companies. Search the web and check each one.
- Only include contact details you actually found in a public source (their website, Google Maps, LinkedIn, Facebook or Instagram page, local business directories, etc.). Never invent a name, phone number or email; leave the field empty if you could not find it.
- Put the page where you found the contact in "source".
- Phone numbers in international format${b.phoneCode ? ' (+' + b.phoneCode + ')' : ''}.
- priority: hot (clear need right now), warm (likely need), cold (worth a try).
- best_channel: call, whatsapp, telegram, email or visit.
- first_message: a short, friendly, personal message (WhatsApp/Telegram length) that mentions something specific about them and offers one concrete idea. In English, or the local language if that fits them better.
- email_subject and email_body: a short cold email (under 120 words) with the same specific hook.
- call_script: 4–6 lines: opener, why we are calling, one question about their need, the ask (a 20-minute meeting).
- notes: what you saw (website, social media, recent news), and how big the opportunity looks.

Give the result as ONE CSV code block, nothing else, with exactly these columns in this order:
${LEAD_COLUMNS.join(',')}
Put every value in double quotes. After the CSV, add a one-line summary of how many you found.`;
}
function promptModal() {
  const n = select('20', ['10', '20', '30', '50'].map(v => ({ value: v, label: v + ' leads' })));
  const who = input('', { placeholder: 'e.g. hotels and restaurants that opened in the last 2 years' });
  const box = textarea(leadPrompt(20, ''), { readonly: true, style: 'min-height:260px;font-size:13px' });
  const refresh = () => { box.value = leadPrompt(n.value, who.value.trim()); };
  n.addEventListener('change', refresh); who.addEventListener('input', refresh);
  modal('Get leads from Claude', [
    el('ol', { class: 'dim', style: 'margin:0 0 12px 18px;padding:0;font-size:13.5px;line-height:1.7' }, [
      el('li', { text: 'Pick how many and who to look for, then copy the prompt.' }),
      el('li', {}, ['Open a Claude chat (', el('a', { href: 'https://claude.ai/new', target: '_blank', rel: 'noopener', style: 'text-decoration:underline', text: 'claude.ai' }), ') with web search on, and paste it.']),
      el('li', { text: 'Ask for changes if you like (“more hotels”, “only Bole”). When happy, copy the CSV it gives you.' }),
      el('li', { text: 'Come back and press “Import leads”, then paste it. A Google Sheet works too: select the rows and copy.' })
    ]),
    el('div', { class: 'grid2' }, [field('How many', n), field('Who to look for (optional)', who)]),
    field('The prompt', box)
  ], [
    el('button', { class: 'ghost', text: 'Close', onclick: closeModal }),
    el('a', { href: 'https://claude.ai/new', target: '_blank', rel: 'noopener' }, [el('button', { text: 'Open Claude ↗' })]),
    el('button', { class: 'primary', text: 'Copy prompt', onclick: () => copy(box.value, 'Prompt') })
  ], { sub: 'Claude researches the companies, finds public contacts and writes the first message, email and call script for each.' });
}

/* CSV / TSV / JSON → rows of lead fields */
function parseTable(text) {
  const src = String(text || '').trim().replace(/^```[a-z]*\n?|```$/gim, '').trim();
  if (!src) return [];
  if (src[0] === '[' || src[0] === '{') { try { const j = JSON.parse(src); return (Array.isArray(j) ? j : j.leads || []).map(mapRow); } catch (e) { /* not JSON */ } }
  const head = src.split('\n')[0];
  const delim = head.includes('\t') ? '\t' : (head.split(';').length > head.split(',').length ? ';' : ',');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') { q = true; continue; }
    if (c === delim) { row.push(cell); cell = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  row.push(cell); rows.push(row);
  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(x => String(x).trim())).map(r => mapRow(Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()]))));
}
const ALIAS = {
  company: ['company', 'companyname', 'business', 'businessname', 'organization', 'organisation', 'brand'], contactName: ['contactname', 'contact', 'name', 'person', 'contactperson', 'decisionmaker'],
  role: ['role', 'title', 'position', 'jobtitle'], phone: ['phone', 'phonenumber', 'tel', 'telephone', 'mobile'], email: ['email', 'emailaddress', 'mail'], whatsapp: ['whatsapp', 'wa'],
  telegram: ['telegram', 'tg'], instagram: ['instagram', 'ig'], linkedin: ['linkedin'], website: ['website', 'web', 'url', 'site'], sector: ['sector', 'industry', 'category'],
  size: ['size', 'companysize', 'employees'], city: ['city', 'location', 'area', 'address'], need: ['need', 'needs', 'whattheyneed', 'painpoint', 'opportunity'],
  service: ['suggestedservice', 'service', 'offer', 'whatweoffer'], priority: ['priority', 'temperature', 'heat', 'score'], channel: ['bestchannel', 'channel'],
  firstMessage: ['firstmessage', 'message', 'dm', 'opener', 'textmessage'], emailSubject: ['emailsubject', 'subject'], emailBody: ['emailbody', 'emailtext', 'emailmessage', 'coldemail'],
  callScript: ['callscript', 'script'], notes: ['notes', 'note', 'claudenotes', 'research'], source: ['source', 'sourceurl', 'sources']
};
const KEY = Object.fromEntries(Object.entries(ALIAS).flatMap(([k, list]) => list.map(a => [a, k])));
function mapRow(o) {
  const out = {};
  Object.entries(o || {}).forEach(([h, v]) => { const k = KEY[String(h).toLowerCase().replace(/[^a-z]/g, '')]; if (k && v != null && String(v).trim() && !out[k]) out[k] = String(v).trim(); });
  if (out.priority) { const p = out.priority.toLowerCase(); out.priority = /hot|high|[89]|10/.test(p) ? 'hot' : /cold|low|[123]\b/.test(p) ? 'cold' : 'warm'; }
  return out;
}
function importModal() {
  const box = textarea('', { placeholder: 'Paste the CSV from Claude here, or rows copied from a Google Sheet (with the header row)', style: 'min-height:180px;font-size:13px' });
  const fileIn = el('input', { type: 'file', accept: '.csv,.tsv,.txt,.json,text/csv' });
  const owner = select(cache.owner || '', [{ value: '', label: 'Sales owner (default)' }].concat((cache.people || []).map(p => ({ value: p.id, label: p.name }))));
  const source = input('Claude · ' + today());
  const preview = el('div', { style: 'margin-top:10px' });
  let rows = [];
  const show = () => {
    rows = parseTable(box.value);
    preview.textContent = '';
    if (!box.value.trim()) return;
    if (!rows.length) { preview.appendChild(el('p', { style: 'color:var(--bad);font-size:13px', text: 'Could not read any rows. Make sure the first line is the header (company, contact_name, …).' })); return; }
    const known = new Set((cache.leads || []).map(l => norm(l.company)));
    const dups = rows.filter(r => known.has(norm(r.company))).length;
    preview.append(el('p', { style: 'font-size:13.5px', text: rows.length + ' lead' + (rows.length === 1 ? '' : 's') + ' found' + (dups ? ' · ' + dups + ' already in the list (skipped)' : '') + ' · ' + rows.filter(r => r.phone || r.email || r.whatsapp).length + ' with a phone or email' }),
      el('div', { class: 'list', style: 'margin-top:6px' }, rows.slice(0, 5).map(r => el('div', { class: 'item' }, [el('span', { class: 'grow' }, [el('b', { text: r.company || r.contactName || '(no name)' }), el('small', { text: [r.contactName, r.phone, r.email, r.sector].filter(Boolean).join(' · ') })]), r.priority ? prioChip(r.priority) : null]))));
  };
  box.addEventListener('input', show);
  fileIn.addEventListener('change', async () => { const fl = fileIn.files[0]; if (fl) { box.value = await fl.text(); show(); } });
  modal('Import leads', [field('Paste', box), field('…or upload a CSV file', fileIn, 'In Google Sheets: File → Download → CSV'), el('div', { class: 'grid2' }, [field('Give them to', owner), field('Source', source)]), preview], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Import', onclick: async () => {
      if (!rows.length) { show(); return; }
      const b = await leadAct({ action: 'importLeads', rows, ownerId: owner.value, source: source.value }).catch(() => null);
      if (!b) return;
      toast(b.added + ' lead' + (b.added === 1 ? '' : 's') + ' added' + (b.skipped && b.skipped.length ? ', ' + b.skipped.length + ' skipped (already there)' : ''));
      closeModal(); redraw();
    } })
  ], { sub: 'Duplicates (same company, phone or email) are skipped.' });
}

/* for the dashboard and the Claude file */
export async function leadsForDashboard() { try { return (await loadLeads(false)).leads || []; } catch (e) { return null; } }
export const leadDue = due;
export { STAGE_LABEL as LEAD_STAGE_LABEL, OUTCOME_LABEL as LEAD_OUTCOME_LABEL };
