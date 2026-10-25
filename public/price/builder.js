/* Price Builder: internal app at /price (team only, admin password).
   Views (by URL hash): #/ dashboard · #/new · #/edit/<id> · #/quote/<id> · #/contract/<id> · #/prices
   After the client says yes, the quote page walks through contract → invoice →
   kick-off; kick-off hands the project to the Team system (/team). */
import { applyTheme } from '/team/theme.js';
import { computeQuote, publishQuote, clientTotals, defaultSelection, formatMoney, slugify, isLocked, THEMES,
         num, STATUSES, STATUS_LABELS, VAT_PCT, setHomeCurrency, homeCurrency, currencyLabel, nextPhaseStart, serviceDays } from '/price/engine.js';
import { basisOf, agreement, nextInvoice, paymentPlan, paidSoFar, termContext, fillTerms, dateLong, invoiceLineText, lineTotals, contractStart,
         CONTRACT_LABELS, INVOICE_LABELS, KIND_LABELS } from '/price/deal.js';

const $ = s => document.querySelector(s);
/* The original font had no arrows (→ ↗ × ⋯ …), so phones borrowed them from another font and they sat
   too high or low. In buttons, links and chips they (and a leading +) are drawn as small line icons instead. */
const GLYPH = { '→': '<path d="M5 12h14M13 6l6 6-6 6"/>', '←': '<path d="M19 12H5M11 6l-6 6 6 6"/>', '↗': '<path d="M7 17 17 7M8 7h9v9"/>',
  '↑': '<path d="M12 19V5M6 11l6-6 6 6"/>', '↓': '<path d="M12 5v14M6 13l6 6 6-6"/>', '×': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  '+': '<path d="M12 5.5v13M5.5 12h13"/>',
  '⋯': '<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>' };
const GLYPH_RE = /[→←↗↑↓×⋯]|^\+ /;
function setText(n, v) {
  const s = String(v);
  if (!GLYPH_RE.test(s) || !(n.tagName === 'BUTTON' || n.tagName === 'A' || /\bchip\b/.test(n.className))) { n.textContent = s; return; }
  s.split(/([→←↗↑↓×⋯]|^\+(?= ))/).forEach(part => {
    if (!part) return;
    if (!GLYPH[part]) { n.appendChild(document.createTextNode(part)); return; }
    const i = document.createElement('span');
    i.className = 'glyph'; i.setAttribute('aria-hidden', 'true');
    i.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + GLYPH[part] + '</svg>';
    n.appendChild(i);
  });
  if (!n.getAttribute('aria-label') && /^[→←↗↑↓×⋯]$/.test(s.trim())) n.setAttribute('aria-label', n.getAttribute('title') || ({ '×': 'Remove', '⋯': 'More', '↑': 'Move up', '↓': 'Move down' }[s.trim()] || s.trim()));
}
function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'text') setText(n, v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = !!v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  (kids || []).forEach(c => c != null && c !== false && n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))));
  return n;
}
const money = n => formatMoney(n, 'ETB');   // 'ETB' is the stored key for the home currency
const signed = n => (n < 0 ? '−' : '+') + money(Math.abs(n));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const has = v => v !== null && v !== undefined && v !== '';
const when = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + num(n)); return d.toISOString().slice(0, 10); };

/* a small window for short forms */
function modal(title, kids, actions, sub) {
  const dlg = $('#dlg'), body = $('#dlgBody');
  body.textContent = '';
  body.appendChild(el('h2', { text: title }));
  if (sub) body.appendChild(el('p', { class: 'muted', style: 'margin:0 0 14px;font-size:13.5px', text: sub }));
  kids.filter(Boolean).forEach(k => body.appendChild(k));
  body.appendChild(el('div', { class: 'acts' }, actions.filter(Boolean)));
  if (!dlg.open) dlg.showModal();
  return dlg;
}
const closeModal = () => $('#dlg').close();
const dateInput = v => { const i = el('input', { type: 'date' }); i.value = v || ''; return i; };

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const b = await r.json().catch(() => ({}));
  if (r.status === 401) { showGate(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(b.error || 'Request failed (' + r.status + ')');
  return b;
}

let catalog = null, q = null, step = 1, dirty = false, liveHooks = [];
const view = () => $('#view');
function note(text, kind) { const n = $('#note'); n.textContent = text || ''; n.className = 'note ' + (kind || ''); }
function markDirty() { dirty = true; note('Unsaved changes', 'warn'); }
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ================= gate ================= */
function showGate(msg) {
  $('#app').classList.add('hide');
  $('#gate').classList.remove('hide');
  if (msg) $('#gateMsg').textContent = msg;
  $('#pw').focus();
}
$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#gateErr').textContent = '';
  try {
    const r = await fetch('/api/price-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', password: $('#pw').value }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'Could not sign in');
    $('#pw').value = '';
    start();
  } catch (err) { $('#gateErr').textContent = err.message; }
});

async function boot() {
  let s;
  try { s = await (await fetch('/api/price-auth', { cache: 'no-store' })).json(); } catch (e) { s = {}; }
  loadBrand();
  if (!s.configured) return showGate('No password is set yet. Set up the Team app at /team first (it sets this password too), then come back.');
  if (!s.authed) return showGate();
  start();
}
async function start() {
  $('#gate').classList.add('hide');
  $('#app').classList.remove('hide');
  try { catalog = (await api('/api/quotes?catalog=1')).catalog; }
  catch (e) { return note(e.message, 'err'); }
  setHomeCurrency(catalog.homeCurrency);
  route();
}

/* the agency's name, logo and accent colour (Team → Settings → Brand & region) */
async function loadBrand() {
  let b = {};
  try { b = (await (await fetch('/api/quotes?brand=1', { cache: 'no-store' })).json()).brand || {}; } catch (e) { return; }
  setHomeCurrency(b.currency);
  const mk = $('#brandMark');
  mk.textContent = '';
  if (b.logo) mk.appendChild(el('img', { src: b.logo, alt: '' })); else mk.textContent = String(b.name || 'P').charAt(0).toUpperCase();
  $('#brandName').textContent = b.name || '';
  applyTheme(b.colors);
  document.title = (b.name ? b.name + ' — ' : '') + 'Price Builder';
}

/* ================= routing ================= */
let currentHash = location.hash;
window.addEventListener('hashchange', () => {
  if (dirty && !confirm('You have unsaved changes. Leave without saving?')) {
    history.replaceState(null, '', currentHash || '#/');
    return;
  }
  // leaving the price list without saving: forget those edits
  if (dirty && /^#\/prices/.test(currentHash)) api('/api/quotes?catalog=1').then(r => { catalog = r.catalog; }).catch(() => {});
  dirty = false;
  route();
});
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function route() {
  currentHash = location.hash;
  note('');
  const [path, qs] = location.hash.split('?');
  const [, name, id] = (path.replace(/^#\/?/, '#/').match(/^#\/([^/]*)\/?(.*)$/) || []);
  window.scrollTo(0, 0);
  try {
    if (name === 'new') {
      q = newQuote('branding'); step = 1; dirty = false;
      // "Make proposal" from a sales lead in /team: the client's details come along, and the lead id links the two
      if (qs) {
        const p = new URLSearchParams(qs), sx = q.setup;
        sx.company = p.get('company') || ''; sx.clientName = p.get('client') || ''; sx.project = p.get('project') || ''; sx.sector = p.get('sector') || '';
        if (p.get('notes')) sx.notes = p.get('notes');
        if (p.get('lead')) sx.leadId = p.get('lead');
        dirty = true;
      }
      return renderEditor();
    }
    if (name === 'edit' && id) {
      if (!q || q.id !== id) { view().textContent = 'Loading…'; q = upgrade((await api('/api/quotes?id=' + id)).quote); step = 1; }
      return renderEditor();
    }
    if (name === 'quote' && id) { view().textContent = 'Loading…'; const r = await api('/api/quotes?id=' + id); return renderQuote(r.quote, r.project); }
    if (name === 'contract' && id) { view().textContent = 'Loading…'; q = upgrade((await api('/api/quotes?id=' + id)).quote); return renderContract(); }
    if (name === 'prices') return renderCatalog();
    return renderDashboard();
  } catch (e) { if (e.message !== 'Signed out') { view().textContent = ''; note(e.message, 'err'); } }
}

/* ================= building a quote from the price list ================= */
function typeById(id) { return catalog.projectTypes.find(t => t.id === id) || catalog.projectTypes[0]; }
function itemFrom(ci, catId) {
  return { id: catId + '-' + ci.id + '-' + uid().slice(0, 3), label: ci.label, unitLabel: ci.unitLabel || '', unit: num(ci.price),
           qty: 1, override: null, note: '', clientTitle: ci.label, clientDesc: ci.desc || '',
           mode: 'optional', defaultOn: true, clientQty: !!ci.unitLabel, enabled: false };
}
function categoryFrom(c) { return { id: c.id + '-' + uid().slice(0, 3), label: c.label, items: c.items.map(i => itemFrom(i, c.id)), start: num(c.start), phases: clone(c.phases || []) }; }
function timelineFor(type) {
  return catalog.timeline.map((o, i) => ({ ...clone(o), days: type.days && has(type.days[i]) ? num(type.days[i]) : o.days }));
}
function newQuote(typeId) {
  const type = typeById(typeId);
  return {
    id: null,
    setup: { clientName: '', company: '', project: '', typeId: type.id, typeLabel: type.label, sector: '',
             currency: 'ETB', theme: THEMES[0].id, notes: '', intro: catalog.intro || '', validDays: catalog.validDays || 30 },
    categories: type.categories.map(categoryFrom),
    factors: {
      timeline: { options: timelineFor(type), selected: (catalog.timeline[0] || {}).id, clientCanChange: true },
      revisions: { options: clone(catalog.revisions), selected: (catalog.revisions[0] || {}).id, clientCanChange: true },
      team: { options: clone(catalog.team || []), selected: ((catalog.team || [])[0] || {}).id, clientCanChange: true },
      complexity: { options: clone(catalog.complexity), selected: (catalog.complexity[0] || {}).id },
      other: (catalog.otherFactors || []).map(o => ({ ...clone(o), on: false }))
    },
    costs: [], adjustment: 0, adjustmentNote: '',
    discount: {
      goodwill: { available: false, pct: catalog.goodwillPct, preApplied: false },
      usd: { enabled: true, rate: catalog.usdRate, pct: catalog.usdDiscountPct, stack: false }
    },
    vat: defaultVat(),
    finalPrice: null, slugWanted: ''
  };
}

// quotes saved before a setting existed get its default
const defaultVat = () => ({ on: catalog.vatOn !== false, pct: catalog.vatPct != null ? catalog.vatPct : VAT_PCT, clientCanChange: false });
function upgrade(qq) {
  if (!qq.vat) qq.vat = defaultVat();          // quotes made before VAT existed get it (on) when opened
  const f = qq.factors = qq.factors || {};
  if (!f.team) f.team = { options: clone(catalog.team || []), selected: ((catalog.team || [])[0] || {}).id, clientCanChange: false };
  return qq;
}

/* ================= small form helpers ================= */
// an input bound to obj[key]; numbers stay numbers, empty money fields become null
function inp(obj, key, opts) {
  const o = opts || {};
  const numeric = o.type === 'number';
  const i = el(o.area ? 'textarea' : 'input', {
    type: o.area ? null : (numeric ? 'number' : 'text'), step: numeric ? 'any' : null,
    placeholder: o.placeholder, class: o.class, 'aria-label': o.label, disabled: o.disabled, list: o.list
  });
  i.value = has(obj[key]) ? obj[key] : '';
  i.addEventListener('input', () => {
    obj[key] = numeric ? (i.value === '' ? (o.nullable ? null : 0) : Number(i.value)) : i.value;
    markDirty();
    if (o.onInput) o.onInput(i.value);
    live();
  });
  return i;
}
function chk(obj, key, text, onChange) {
  const c = el('input', { type: 'checkbox', checked: obj[key] });
  c.addEventListener('change', () => { obj[key] = c.checked; markDirty(); if (onChange) onChange(); else live(); });
  return text ? el('label', { class: 'check' }, [c, text]) : c;
}
function field(label, input) { return el('div', { class: 'field' }, [el('label', { class: 'l', text: label }), input]); }
// a friendly "what to do here" box at the top of each step
function hint(lead, points) {
  return el('div', { class: 'hint' }, [el('b', { text: lead }), points && points.length ? el('ul', {}, points.map(x => el('li', { text: x }))) : null]);
}
function panel(title, sub, kids) { return el('div', { class: 'panel' }, [el('h3', { text: title }), sub ? el('p', { class: 'sub', text: sub }) : null, ...kids]); }
function live() { liveHooks.forEach(f => f()); }

/* an editable list of options: { id, label, days?, pct } with an optional "selected" radio */
function optionTable(group, list, opts) {
  const o = opts || {};
  const tb = el('tbody');
  const draw = () => {
    tb.textContent = '';
    list.forEach((opt, idx) => {
      const cells = [];
      if (o.radio) {
        const r = el('input', { type: 'radio', name: group, checked: o.radio.get() === opt.id, 'aria-label': 'Use ' + opt.label });
        r.addEventListener('change', () => { o.radio.set(opt.id); markDirty(); live(); });
        cells.push(el('td', {}, [r]));
      }
      if (o.toggle) cells.push(el('td', {}, [chk(opt, 'on')]));
      cells.push(el('td', {}, [inp(opt, 'label', { label: 'Name' })]));
      if (o.desc) cells.push(el('td', {}, [inp(opt, 'desc', { label: 'Description for the client' })]));
      if (o.days) cells.push(el('td', { style: 'width:90px' }, [inp(opt, 'days', { type: 'number', label: 'Days' })]));
      cells.push(el('td', { style: 'width:90px' }, [inp(opt, 'pct', { type: 'number', label: '+%' })]));
      cells.push(el('td', { style: 'width:78px' }, [el('button', { class: 'small danger', text: 'Delete', onclick: () => {
        if (!confirm('Delete “' + (opt.label || 'this option') + '”?')) return;
        list.splice(idx, 1); markDirty(); draw(); live();
      } })]));
      tb.appendChild(el('tr', {}, cells));
    });
  };
  draw();
  const headCells = [o.radio ? el('th', { text: o.radio.title || 'Use' }) : null, o.toggle ? el('th', { text: 'On' }) : null,
    el('th', { text: 'Name' }), o.desc ? el('th', { text: 'Client sees' }) : null, o.days ? el('th', { text: 'Days' }) : null, el('th', { text: '+ %' }), el('th')];
  return el('div', {}, [
    el('table', { class: 'opts' }, [el('thead', {}, [el('tr', {}, headCells)]), tb]),
    el('button', { class: 'small ghost', style: 'margin-top:8px', text: '+ Add option', onclick: () => {
      list.push({ id: uid(), label: 'New option', pct: 0, ...(o.days ? { days: 0 } : {}), ...(o.toggle ? { on: true } : {}) });
      markDirty(); draw(); live();
    } })
  ]);
}

/* ================= dashboard ================= */
async function renderDashboard() {
  const v = view();
  v.textContent = '';
  v.appendChild(el('div', { class: 'head' }, [
    el('div', {}, [el('h1', { text: 'Price Builder' }), el('p', { text: 'Build a quote, then send the client a live proposal link. Prices and notes here are never shown to clients.' })]),
    el('div', { class: 'row wrap' }, [
      el('a', { href: '/team#/sales', target: '_blank', rel: 'noopener' }, [el('button', { class: 'ghost', text: 'Sales pipeline ↗' })]),
      el('button', { text: 'Price list', onclick: () => go('#/prices') }),
      el('button', { class: 'ghost', text: 'Sign out', onclick: async () => {
        await fetch('/api/price-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"logout"}' });
        showGate();
      } }),
      el('button', { class: 'primary', text: 'Create new quote', onclick: () => go('#/new') })
    ])
  ]));
  v.appendChild(el('div', { class: 'steps3' }, [
    ['1', 'Build a quote', 'Pick the project type, tick deliverables, set prices and options.'],
    ['2', 'Send the link', 'The client opens ' + location.host + '/price/… and adjusts the scope live.'],
    ['3', 'Get their version', 'Their request appears here, next to your original quote.']
  ].map(([n, a, b]) => el('div', {}, [el('i', { text: n }), el('div', {}, [el('b', { text: a }), el('span', { text: b })])]))));
  const box = el('div', { class: 'panel', style: 'padding:6px 6px 0' }, [el('p', { class: 'muted', style: 'padding:12px', text: 'Loading quotes…' })]);
  v.appendChild(box);
  const { quotes } = await api('/api/quotes');
  box.textContent = '';
  if (!quotes.length) {
    box.appendChild(el('div', { class: 'next-empty', style: 'margin:8px' }, [el('b', { text: 'No quotes yet' }),
      el('span', { text: 'Pick a project type, tick what you will deliver and send the client a live link.' }),
      el('button', { class: 'primary', text: 'Create your first quote', onclick: () => go('#/new') })]));
    return;
  }
  box.appendChild(el('table', { class: 'qt' }, [
    el('thead', {}, [el('tr', {}, ['Client', 'Project', 'Amount', 'Status', 'Updated', 'Link', ''].map(h => el('th', { text: h, class: h === 'Amount' ? 'right' : null })))]),
    el('tbody', {}, quotes.map(r => el('tr', { onclick: e => { if (e.target.closest('a')) return; go((r.generatedAt ? '#/quote/' : '#/edit/') + r.id); } }, [
      el('td', {}, [el('strong', { text: r.company || r.client || 'Untitled' }), r.company && r.client ? el('div', { class: 'muted', style: 'font-size:12px', text: r.client }) : null]),
      el('td', {}, [r.project || '—', el('div', { class: 'muted', style: 'font-size:12px', text: r.type })]),
      el('td', { class: 'right num' }, [money(r.amount), r.lastRequestAmount != null && r.lastRequestAmount !== Math.round(r.amount)
        ? el('div', { class: 'muted', style: 'font-size:12px', text: 'Client: ' + money(r.lastRequestAmount) }) : null]),
      el('td', {}, [el('span', { class: 'pill ' + r.status, text: STATUS_LABELS[r.status] || r.status }),
        r.stage ? el('span', { class: 'pill ' + r.stage, style: 'margin-left:6px', text: STAGE_LABELS[r.stage] || r.stage }) : null,
        r.requests ? el('span', { class: 'muted', style: 'font-size:12px;margin-left:6px', text: r.requests + ' request' + (r.requests > 1 ? 's' : '') }) : null]),
      el('td', { class: 'muted', text: when(r.updatedAt) }),
      el('td', {}, [r.slug ? el('a', { href: '/price/' + r.slug, target: '_blank', rel: 'noopener', text: '/price/' + r.slug }) : el('span', { class: 'muted', text: 'Not sent' })]),
      el('td', { class: 'right' }, [el('button', { class: 'small quiet-del', text: 'Delete', 'aria-label': 'Delete the quote for ' + (r.company || r.client || 'this client'), onclick: async e => {
        e.stopPropagation();
        if (!confirm('Delete the quote for ' + (r.company || r.client || 'this client') + '?' +
                     (r.slug ? ' The link ' + location.host + '/price/' + r.slug + ' will stop working.' : '') +
                     ' Requests already in admin → Leads stay there.')) return;
        try { await api('/api/quotes', { action: 'delete', id: r.id }); note('Quote deleted', 'ok'); renderDashboard(); }
        catch (err) { note(err.message, 'err'); }
      } })])
    ])))
  ]));
}

const STAGE_LABELS = { contract: 'Contract draft', signed: 'Contract signed', invoiced: 'Invoiced', paid: 'Paid', 'kicked-off': 'With the team' };

/* ================= editor ================= */
const STEPS = ['Project setup', 'Build scope', 'Project factors', 'Adjustments & discount', 'Review & send'];

const sent = () => !!(q && q.generatedAt);

async function saveDraft(silent) {
  note('Saving…');
  const r = await api('/api/quotes', { action: 'save', quote: q });
  const wasNew = !q.id;
  q.id = r.quote.id; q.createdAt = r.quote.createdAt; q.updatedAt = r.quote.updatedAt;
  dirty = false;
  if (wasNew) { currentHash = '#/edit/' + q.id; history.replaceState(null, '', currentHash); }
  note(silent ? 'Draft saved' : 'Draft saved ' + when(q.updatedAt), 'ok');
}

function renderEditor() {
  liveHooks = [];
  const v = view();
  v.textContent = '';
  const s = q.setup;
  v.appendChild(el('div', { class: 'head' }, [
    el('div', {}, [el('h1', { text: s.company || s.clientName || 'New quote' }),
      el('p', { text: (s.project || 'Untitled project') + ' · ' + s.typeLabel + ' · ' + (sent() ? 'Sent · editing' : 'Draft') })]),
    el('div', { class: 'row wrap' }, [
      el('button', { class: 'ghost', text: sent() ? '← Back to the quote' : '← All quotes', onclick: () => go(sent() ? '#/quote/' + q.id : '#/') }),
      sent() ? null : el('button', { text: 'Save draft', onclick: () => saveDraft().catch(e => note(e.message, 'err')) })
    ])
  ]));
  if (sent()) v.appendChild(hint('You are editing a quote the client already has.', [
    'Nothing changes for them until you press “Update the client link” on step 5.',
    'The link stays the same, and the version they had is kept in the quote’s history.']));
  v.appendChild(el('nav', { class: 'steps' }, STEPS.map((t, i) => el('button', {
    'aria-current': String(step === i + 1), onclick: () => { step = i + 1; renderEditor(); window.scrollTo(0, 0); }
  }, [el('b', { text: String(i + 1) }), t]))));

  const body = [stepSetup, stepScope, stepFactors, stepAdjust, stepReview][step - 1]();
  const nav = el('div', { class: 'navbtns' }, [
    step > 1 ? el('button', { text: '← ' + STEPS[step - 2], onclick: () => { step--; renderEditor(); window.scrollTo(0, 0); } }) : el('span'),
    step < 5 ? el('button', { class: 'primary', text: STEPS[step] + ' →', onclick: () => {
      step++; renderEditor(); window.scrollTo(0, 0);
      if (dirty && !sent()) saveDraft(true).catch(e => note(e.message, 'err'));
    } }) : el('span')
  ]);
  v.appendChild(el('div', { class: 'edit' }, [el('div', {}, [body, nav]), livePanel()]));
  live();
}

/* ---- live price panel (internal only) ---- */
function livePanel() {
  const box = el('div', { class: 'live' });
  liveHooks.push(() => {
    const t = computeQuote(q);
    const d = q.discount;
    box.textContent = '';
    const ln = (a, b, cls) => box.appendChild(el('div', { class: 'ln ' + (cls || '') }, [el('span', { text: a }), el('span', { class: 'num', text: b })]));
    box.appendChild(el('h4', {}, ['Live price', el('span', { text: 'Internal' })]));
    const n = t.lines.filter(l => l.inDefault).length;
    ln('Scope · ' + n + ' item' + (n === 1 ? '' : 's'), money(t.scope));
    if (t.factorPct) ln('Factors (' + (t.factorPct > 0 ? '+' : '') + t.factorPct + '%)', signed(t.factorAmt));
    if (t.timelinePct) ln('Timeline · ' + t.timeline.label + ' (' + (t.timelinePct > 0 ? '+' : '') + t.timelinePct + '%)', signed(t.timelineAmt));
    if (t.visibleCosts) ln('Costs shown to client', money(t.visibleCosts));
    if (t.hiddenCosts) ln('Internal costs', money(t.hiddenCosts));
    if (t.adjustment) ln('Internal adjustment', signed(t.adjustment));
    box.appendChild(el('div', { class: 'rule' }));
    ln('Calculated', money(t.calculated), t.overridden ? '' : 'big');
    if (t.overridden) ln('Custom final price', money(t.final), 'big');
    box.appendChild(el('div', { class: 'rule' }));
    const vx = t.vatOn ? 1 + t.vatPct / 100 : 1;
    ln(t.vatOn ? 'Client price before VAT' : 'Client sees', money(t.final), t.vatOn ? '' : 'client');
    if (t.vatOn) { ln('VAT ' + t.vatPct + '%', '+' + money(t.vatAmt)); ln('Client pays incl. VAT', money(t.finalWithVat), 'client'); }
    else ln('VAT', q.vat && q.vat.clientCanChange ? 'off · client can switch it on' : 'off');
    if (d.goodwill.available) ln('… with ' + num(d.goodwill.pct) + '% goodwill', money(t.final * (1 - num(d.goodwill.pct) / 100) * vx));
    if (d.usd.enabled && num(d.usd.rate) > 0) ln('… paying in USD (−' + num(d.usd.pct) + '%)', formatMoney(t.final * (1 - num(d.usd.pct) / 100) * vx / num(d.usd.rate), 'USD'));
    if (t.optionalOff) ln('Optional add-ons offered', '+' + money(t.optionalOff * (1 + t.factorPct / 100)));
  });
  return box;
}

/* ---- step 1 ---- */
function stepSetup() {
  const s = q.setup;
  const typeSel = el('select', { 'aria-label': 'Project type' }, catalog.projectTypes.map(t => el('option', { value: t.id, text: t.label })));
  typeSel.value = s.typeId;
  typeSel.addEventListener('change', () => {
    const used = q.categories.some(c => c.items.some(i => i.enabled));
    const type = typeById(typeSel.value);
    if (used && !confirm('Switch to ' + type.label + '? The scope you picked will be replaced with the ' + type.label + ' list.')) {
      typeSel.value = s.typeId; return;
    }
    s.typeId = type.id; s.typeLabel = type.label;
    q.categories = type.categories.map(categoryFrom);
    q.factors.timeline.options = timelineFor(type);
    markDirty(); renderEditor();
  });
  const cur = el('select', { 'aria-label': 'Currency' }, [el('option', { value: 'ETB', text: homeCurrency() + ' (default)' }), el('option', { value: 'USD', text: 'USD — client opens it in dollars' })]);
  cur.value = s.currency;
  cur.addEventListener('change', () => { s.currency = cur.value; if (cur.value === 'USD') q.discount.usd.enabled = true; markDirty(); });
  const sectors = el('datalist', { id: 'sectors' }, (catalog.sectors || []).map(x => el('option', { value: x })));
  return el('div', {}, [hint('Start with who the quote is for.', ['The client sees their name, company and project name.', 'Picking a project type loads its list of deliverables for the next step.']),
  panel('Project setup', null, [
    el('div', { class: 'grid2' }, [
      field('Client name', inp(s, 'clientName', { placeholder: 'e.g. Selam Tesfaye' })),
      field('Company name', inp(s, 'company', { placeholder: 'e.g. Blue Oven' })),
      field('Project name', inp(s, 'project', { placeholder: 'e.g. Brand & Launch' })),
      field('Project type', typeSel),
      field('Sector / category', inp(s, 'sector', { list: 'sectors', placeholder: 'Pick or type' })),
      field('Currency', cur)
    ]),
    sectors,
    field('Notes (internal)', inp(s, 'notes', { area: true, placeholder: 'Anything the team should remember. Never shown to the client.' }))
  ]), themePicker()]);
}

// the colour theme of the client's proposal page
function themePicker() {
  const grid = el('div', { class: 'themes', role: 'radiogroup', 'aria-label': 'Proposal theme' });
  const draw = () => {
    grid.textContent = '';
    const current = q.setup.theme || THEMES[0].id;
    THEMES.forEach(t => grid.appendChild(el('button', { type: 'button', class: 'theme', role: 'radio', 'aria-checked': String(t.id === current),
      onclick: () => { q.setup.theme = t.id; markDirty(); draw(); } }, [
      el('span', { class: 'sw', style: 'background:' + t.colors[3] }, [
        el('i', { style: 'background:' + t.colors[1] }), el('i', { style: 'background:' + t.colors[0] }), el('i', { style: 'background:' + t.colors[2] })]),
      el('b', { text: t.label }), el('small', { text: t.note })
    ])));
  };
  draw();
  return panel('Proposal look', 'The colour theme the client sees on their page. Classic is the default.', [grid]);
}

/* the services' own timelines next to the quoted pace: a gentle note when they don't agree */
function paceCheck(q) {
  const quoted = (q.factors.timeline.options || []).find(o => o.id === q.factors.timeline.selected);
  const total = (q.categories || []).filter(c => (c.items || []).some(it => it.enabled) && serviceDays(c.phases))
    .reduce((m, c) => Math.max(m, num(c.start) + serviceDays(c.phases)), 0);
  if (!quoted || !total || !num(quoted.days) || total === num(quoted.days)) return el('span');
  return el('p', { class: 'sub', text: 'The service timelines in step 2 add up to ' + total + ' working days, but this pace says ' + num(quoted.days) +
    '. The client\'s week-by-week chart follows the service timelines, stretched or squeezed if they pick another pace.' });
}

/* ---- a service's own timeline: phases with a start day and a length, some of them client reviews ---- */
function phaseEditor(cat, others) {
  cat.phases = Array.isArray(cat.phases) ? cat.phases : [];
  const box = el('details', { class: 'phases', open: cat.phases.length ? null : null });
  const sum = el('summary');
  const body = el('div', { class: 'phbody' });
  const label = () => {
    const d = serviceDays(cat.phases);
    sum.textContent = '';
    sum.append(el('b', { text: 'Timeline' }), el('span', { class: 'muted', text: cat.phases.length
      ? ' · ' + cat.phases.length + ' step' + (cat.phases.length === 1 ? '' : 's') + ', ' + d + ' working day' + (d === 1 ? '' : 's') + ', starts on day ' + (num(cat.start) + 1)
      : ' · optional: break this service into steps and client reviews' }));
  };
  const add = review => {
    cat.phases.push({ label: review ? 'Client review' : 'New step', start: nextPhaseStart(cat.phases), days: review ? 2 : 3, review });
    markDirty(); draw(); box.open = true;
  };
  const draw = () => {
    label();
    body.textContent = '';
    // the service starts on a day of the project; "after the previous service" is the common case
    const prevEnd = (others || []).filter(o => o !== cat && o.phases && o.phases.length).reduce((m, o) => Math.max(m, num(o.start) + serviceDays(o.phases)), 0);
    body.append(el('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:8px' }, [
      el('label', { class: 'l', style: 'margin:0', text: 'Starts on project day' }),
      el('input', { type: 'number', min: 1, class: 'w-qty', 'aria-label': 'Starts on project day', value: String(num(cat.start) + 1), oninput: ev => { cat.start = Math.max(0, Math.round(Number(ev.target.value) || 1) - 1); markDirty(); label(); } }),
      others ? el('button', { class: 'small ghost', text: 'Start after the other services', onclick: () => { cat.start = prevEnd; markDirty(); draw(); } }) : null
    ]));
    if (cat.phases.length) body.appendChild(el('table', { class: 'items phtable' }, [
      el('thead', {}, [el('tr', {}, ['Step', 'From day', 'Days', 'Client review', ''].map(h => el('th', { text: h })))]),
      el('tbody', {}, cat.phases.map((ph, i) => el('tr', { class: ph.review ? 'rev' : '' }, [
        el('td', {}, [inp(ph, 'label', { label: 'Step name', onInput: label })]),
        el('td', { style: 'width:90px' }, [(() => { const x = el('input', { type: 'number', min: 1, class: 'w-qty', 'aria-label': 'From day', value: String(num(ph.start) + 1) });
          x.addEventListener('input', () => { ph.start = Math.max(0, Math.round(Number(x.value) || 1) - 1); markDirty(); label(); }); return x; })()]),
        el('td', { style: 'width:80px' }, [inp(ph, 'days', { type: 'number', class: 'w-qty', label: 'Days', onInput: label })]),
        el('td', { style: 'width:110px' }, [chk(ph, 'review', null, () => { draw(); })]),
        el('td', { style: 'width:44px' }, [el('button', { class: 'x', title: 'Remove step', text: '×', onclick: () => { cat.phases.splice(i, 1); markDirty(); draw(); } })])
      ])))
    ]));
    body.appendChild(el('div', { class: 'row wrap', style: 'gap:8px;margin-top:6px' }, [
      el('button', { class: 'small', text: '+ Add step', onclick: () => add(false) }),
      el('button', { class: 'small ghost', text: '+ Add client review', onclick: () => add(true) }),
      el('span', { class: 'muted', style: 'font-size:12.5px', text: 'Days are working days. Steps can overlap. The client sees this as a week-by-week chart.' })
    ]));
  };
  draw();
  box.append(sum, body);
  return box;
}

/* ---- step 2 ---- */
const MODES = [['optional-on', 'Removable', 'In the quote; the client can switch it off'],
               ['optional-off', 'Add-on', 'Offered switched off; the client can add it'],
               ['included', 'Locked', 'Always included; the client cannot remove it']];
function modeOf(it) { return isLocked(it) ? 'included' : it.defaultOn ? 'optional-on' : 'optional-off'; }

function stepScope() {
  const wrap = el('div');
  wrap.appendChild(hint('Tick what goes into this quote, then set quantity and price.', [
    '“Removable”: in the quote, and the client can switch it off.',
    '“Add-on”: offered switched off; the client can add it.',
    '“Locked”: always included.',
    'A custom price replaces the calculated one. Press ⋯ for client wording, notes and quantity settings.']));
  q.categories.forEach((c, ci) => wrap.appendChild(categoryBlock(c, ci)));

  // add a category: blank, or copied from any project type in the price list
  const pick = el('select', { 'aria-label': 'Add a category' }, [el('option', { value: '', text: 'Add a category from the price list…' })]
    .concat(catalog.projectTypes.filter(t => t.categories.length).map(t => el('optgroup', { label: t.label },
      t.categories.map(c => el('option', { value: t.id + '|' + c.id, text: c.label }))))));
  pick.addEventListener('change', () => {
    if (!pick.value) return;
    const [tid, cid] = pick.value.split('|');
    const src = typeById(tid).categories.find(c => c.id === cid);
    q.categories.push(categoryFrom(src));
    markDirty(); renderEditor();
  });
  wrap.appendChild(el('div', { class: 'row wrap' }, [
    el('div', { style: 'max-width:340px;flex:1' }, [pick]),
    el('button', { text: '+ Empty category', onclick: () => {
      q.categories.push({ id: 'c' + uid(), label: 'New category', items: [] }); markDirty(); renderEditor();
    } })
  ]));
  return wrap;
}

function categoryBlock(c, ci) {
  const total = el('span', { class: 'muted num' });
  liveHooks.push(() => {
    const on = c.items.filter(i => i.enabled);
    const sum = on.filter(i => isLocked(i) || i.defaultOn).reduce((s, i) => s + (has(i.override) ? num(i.override) : num(i.unit) * num(i.qty)), 0);
    total.textContent = on.length + ' selected · ' + money(sum);
  });
  const tb = el('tbody');
  c.items.forEach((it, ii) => itemRows(c, it, ii).forEach(r => tb.appendChild(r)));
  return el('div', { class: 'cat' }, [
    el('div', { class: 'cathead' }, [
      inp(c, 'label', { class: 'catname', label: 'Category name' }),
      el('span', { class: 'grow' }), total,
      el('button', { class: 'small ghost', text: 'Tick all', onclick: () => { const all = c.items.every(i => i.enabled); c.items.forEach(i => { i.enabled = !all; }); markDirty(); renderEditor(); } }),
      el('button', { class: 'x', title: 'Remove category', text: '×', onclick: () => {
        if (c.items.some(i => i.enabled) && !confirm('Remove “' + c.label + '” from this quote?')) return;
        q.categories.splice(ci, 1); markDirty(); renderEditor();
      } })
    ]),
    el('table', { class: 'items' }, [
      el('thead', {}, [el('tr', {}, ['', 'Deliverable', 'Qty', 'Unit price', 'Calculated', 'Custom price', 'For the client', ''].map(h => el('th', { text: h })))]),
      tb
    ]),
    el('div', { class: 'addbar' }, [el('button', { class: 'small', text: '+ Add custom item', onclick: () => {
      c.items.push({ id: 'x' + uid(), label: 'Custom item', unitLabel: '', unit: 0, qty: 1, override: null, note: '',
                     clientTitle: 'Custom item', clientDesc: '', mode: 'optional', defaultOn: true, clientQty: false, enabled: true, custom: true, open: true });
      markDirty(); renderEditor();
    } })]),
    phaseEditor(c, q.categories)
  ]);
}

function itemRows(c, it, ii) {
  const calc = el('td', { class: 'num muted', style: 'white-space:nowrap' });
  const ov = inp(it, 'override', { type: 'number', nullable: true, class: 'w-money', label: 'Custom price', disabled: !it.enabled });
  liveHooks.push(() => {
    const k = num(it.unit) * num(it.qty);
    calc.textContent = money(k);
    ov.placeholder = Math.round(k).toLocaleString('en-US');
    ov.classList.toggle('over', has(it.override));
  });
  const mode = el('div', { class: 'segs' + (it.enabled ? '' : ' dis'), role: 'radiogroup', 'aria-label': 'For the client' });
  const drawMode = () => {
    mode.textContent = '';
    MODES.forEach(([vl, t, tip]) => mode.appendChild(el('button', { type: 'button', role: 'radio', title: tip, 'aria-checked': String(modeOf(it) === vl), disabled: !it.enabled,
      text: t, onclick: () => { it.mode = vl === 'included' ? 'included' : 'optional'; it.defaultOn = vl !== 'optional-off'; markDirty(); drawMode(); live(); } })));
  };
  drawMode();
  const en = chk(it, 'enabled', null, () => renderEditor());
  en.setAttribute('aria-label', 'Include ' + it.label);
  const name = it.custom || it.open
    ? el('td', { class: 'nm' }, [inp(it, 'label', { label: 'Internal name', onInput: val => { if (!it.titleTouched) it.clientTitle = val; } })])
    : el('td', { class: 'nm' }, [it.label, it.unitLabel ? el('small', { text: 'per ' + it.unitLabel.replace(/s$/, '') }) : null, it.note ? el('small', { text: '✎ ' + it.note }) : null]);
  const row = el('tr', { class: it.enabled ? '' : 'off' }, [
    el('td', {}, [en]), name,
    el('td', {}, [inp(it, 'qty', { type: 'number', class: 'w-qty', label: 'Quantity', disabled: !it.enabled })]),
    el('td', {}, [inp(it, 'unit', { type: 'number', class: 'w-money', label: 'Unit price', disabled: !it.enabled })]),
    calc, el('td', {}, [ov]), el('td', {}, [mode]),
    el('td', {}, [el('button', { class: 'x', title: 'Client wording and notes', text: '⋯', onclick: () => { it.open = !it.open; renderEditor(); } })])
  ]);
  if (!it.open) return [row];
  const title = inp(it, 'clientTitle', { label: 'Client-visible title', onInput: () => { it.titleTouched = true; } });
  const more = el('tr', { class: 'more' }, [el('td'), el('td', { colspan: 7 }, [
    el('div', { class: 'grid2', style: 'padding:6px 0' }, [
      field('Client-visible title', title),
      field('Unit name (e.g. pages, posts)', inp(it, 'unitLabel', { label: 'Unit name' })),
      field('Client-visible description', inp(it, 'clientDesc', { area: true })),
      field('Internal note (never shown)', inp(it, 'note', { area: true }))
    ]),
    el('div', { style: 'padding:2px 0 10px' }, [chk(it, 'clientQty', 'Client can change the quantity (+ / − buttons on their page)')]),
    el('div', { class: 'row', style: 'justify-content:flex-end;padding-bottom:6px' }, [
      el('button', { class: 'small danger', text: 'Remove item', onclick: () => { c.items.splice(ii, 1); markDirty(); renderEditor(); } }),
      el('button', { class: 'small', text: 'Done', onclick: () => { it.open = false; renderEditor(); } })
    ])
  ])]);
  return [row, more];
}

/* ---- step 3 ---- */
function stepFactors() {
  const f = q.factors;
  const radio = (grp, title) => ({ title, get: () => f[grp].selected, set: id => { f[grp].selected = id; } });
  const letChoose = (grp, text) => el('div', { class: 'choose' }, [chk(f[grp], 'clientCanChange', text)]);
  return el('div', {}, [
    hint('These add a % to the deliverables. The selected option (●) is what you quote.', [
      'Tick “Let the client choose” and they get buttons for each option, with the price difference shown.',
      'Complexity and other factors are internal: the client never sees them.']),
    panel('Delivery pace', 'Faster delivery usually costs more.', [
      optionTable('tl', f.timeline.options, { days: true, radio: radio('timeline', 'Quoted') }),
      letChoose('timeline', 'Let the client choose the delivery pace'),
      paceCheck(q)
    ]),
    panel('Team', 'How many people work on the project.', [
      optionTable('tm', f.team.options, { desc: true, radio: radio('team', 'Quoted') }),
      letChoose('team', 'Let the client choose the team size')
    ]),
    el('div', { class: 'grid2' }, [
      panel('Revision rounds', 'The client sees the number of rounds.', [optionTable('rv', f.revisions.options, { radio: radio('revisions', 'Quoted') }),
        letChoose('revisions', 'Let the client choose')]),
      panel('Complexity', 'Internal only.', [optionTable('cx', f.complexity.options, { radio: radio('complexity', 'Quoted') })])
    ]),
    panel('Other factors', 'Extra +/− % on the deliverables. Tick to apply. Internal only.', [optionTable('of', f.other, { toggle: true })])
  ]);
}

/* ---- step 4 ---- */
function stepAdjust() {
  const tb = el('tbody');
  const drawCosts = () => {
    tb.textContent = '';
    q.costs.forEach((c, i) => {
      const type = el('select', { 'aria-label': 'Cost type' }, (catalog.costTypes || []).map(t => el('option', { value: t, text: t })));
      type.value = c.type;
      type.addEventListener('change', () => { if (!c.label || c.label === c.type) c.label = type.value; c.type = type.value; markDirty(); drawCosts(); });
      tb.appendChild(el('tr', {}, [
        el('td', { style: 'width:170px' }, [type]),
        el('td', {}, [inp(c, 'label', { label: 'Description', placeholder: 'Shown to the client if visible' })]),
        el('td', { style: 'width:130px' }, [inp(c, 'amount', { type: 'number', label: 'Amount (' + homeCurrency() + ')' })]),
        el('td', { style: 'width:120px' }, [chk(c, 'visible', 'Client sees')]),
        el('td', { style: 'width:36px' }, [el('button', { class: 'x', text: '×', title: 'Remove', onclick: () => { q.costs.splice(i, 1); markDirty(); drawCosts(); live(); } })])
      ]));
    });
  };
  drawCosts();
  const d = q.discount;
  return el('div', {}, [
    hint('Extra costs and discounts.', ['Costs you do not tick as “Client sees” are spread invisibly across the client’s prices.',
      'The goodwill and USD discounts are switches the client controls on their page.',
    'VAT (15%) is on by default for every quote. Switch it off here if this client should not pay VAT.']),
    panel('Internal adjustments', 'Additional costs are internal unless you tick “Client sees”. Internal ones are spread invisibly across the client’s prices.', [
      el('table', { class: 'opts' }, [el('thead', {}, [el('tr', {}, ['Type', 'Description', 'Amount (' + homeCurrency() + ')', '', ''].map(h => el('th', { text: h })))]), tb]),
      el('button', { class: 'small ghost', style: 'margin:8px 0 16px', text: '+ Add cost', onclick: () => {
        const t = (catalog.costTypes || ['Other'])[0];
        q.costs.push({ type: t, label: t, amount: 0, visible: false }); markDirty(); drawCosts();
      } }),
      el('div', { class: 'grid2' }, [
        field('Custom adjustment (+/− ' + homeCurrency() + ')', inp(q, 'adjustment', { type: 'number', placeholder: 'e.g. -5000' })),
        field('Why (internal)', inp(q, 'adjustmentNote', { placeholder: 'e.g. long-term client' }))
      ])
    ]),
    panel('VAT', 'Added on top of the final price, after any discounts. Shown to the client as its own line.', [
      el('div', { class: 'grid3' }, [
        el('div', { class: 'field' }, [chk(q.vat, 'on', 'Add VAT to this quote')]),
        field('VAT %', inp(q.vat, 'pct', { type: 'number' })),
        el('div', { class: 'field' }, [chk(q.vat, 'clientCanChange', 'Let the client switch VAT on or off')])
      ])
    ]),
    panel('Goodwill discount', 'Offered to the client as “Because we like working with you.”', [
      el('div', { class: 'grid3' }, [
        el('div', { class: 'field' }, [chk(d.goodwill, 'available', 'Offer it to the client')]),
        field('Discount %', inp(d.goodwill, 'pct', { type: 'number' })),
        el('div', { class: 'field' }, [chk(d.goodwill, 'preApplied', 'Already switched on')])
      ])
    ]),
    panel('USD payment', 'USD price = ' + homeCurrency() + ' price × (100 − discount)% ÷ rate. The rate is saved with the quote, so a sent link never changes.', [
      el('div', { class: 'grid2' }, [
        el('div', { class: 'field' }, [chk(d.usd, 'enabled', 'Show the ' + homeCurrency() + ' | USD switch to the client')]),
        el('div', { class: 'field' }, [chk(d.usd, 'stack', 'Allow goodwill + USD discounts together')]),
        field('1 USD = … ' + homeCurrency(), inp(d.usd, 'rate', { type: 'number' })),
        field('USD payment discount %', inp(d.usd, 'pct', { type: 'number' }))
      ])
    ])
  ]);
}

/* ---- step 5 ---- */
function stepReview() {
  const s = q.setup;
  const scopeDd = el('dd'), factorsDd = el('dd'), totalDd = el('dd'), clientDd = el('dd');
  const finalInp = inp(q, 'finalPrice', { type: 'number', nullable: true, placeholder: 'Leave empty to use the calculated total' });
  liveHooks.push(() => {
    const t = computeQuote(q);
    scopeDd.textContent = '';
    if (!t.categories.length) scopeDd.appendChild(el('span', { class: 'muted', text: 'Nothing selected yet. Go to Build scope.' }));
    t.categories.forEach(c => scopeDd.appendChild(el('div', { class: 'ln' }, [el('span', { text: c.label + ' · ' + c.count }), el('span', { class: 'num', text: money(c.total) })])));
    factorsDd.textContent = '';
    const fl = (a, b) => factorsDd.appendChild(el('div', { class: 'ln' }, [el('span', { text: a }), el('span', { class: 'num', text: b })]));
    fl('Complexity, team, revisions & other (' + t.factorPct + '%)', signed(t.factorAmt));
    fl('Timeline adjustment · ' + (t.timeline ? t.timeline.label + ', ' + t.timeline.days + ' days' : '—'), signed(t.timelineAmt));
    if (t.visibleCosts) fl('Costs shown to client', money(t.visibleCosts));
    if (t.hiddenCosts) fl('Internal costs', money(t.hiddenCosts));
    if (t.adjustment) fl('Internal adjustment', signed(t.adjustment));
    totalDd.textContent = '';
    totalDd.appendChild(el('div', { class: 'bigtotal num', text: money(t.calculated) }));
    finalInp.placeholder = 'Calculated: ' + money(t.calculated);

    // exactly what the client will get
    const p = publishQuote(q, 'preview');
    const ct = clientTotals(p, defaultSelection(p));
    clientDd.textContent = '';
    p.categories.forEach(c => c.items.forEach(i => clientDd.appendChild(el('div', { class: 'ln' }, [
      el('span', { text: (i.locked ? '🔒 ' : i.on ? '● ' : '○ ') + i.title + (i.qty > 1 ? ' × ' + i.qty : '') + (i.qtyEditable ? ' (client can change qty)' : '') }),
      el('span', { class: 'num', text: (i.on ? '' : '+') + money(i.unitPrice * i.qty) })]))));
    p.choices.filter(g => g.canChange).forEach(g => clientDd.appendChild(el('div', { class: 'ln' }, [
      el('span', { text: '⇄ Client chooses ' + g.title.toLowerCase() }), el('span', { class: 'muted', text: g.options.map(o => o.label).join(' / ') })])));
    p.costs.forEach(c => clientDd.appendChild(el('div', { class: 'ln' }, [el('span', { text: '✓ ' + c.title }), el('span', { class: 'num', text: money(c.amount) })])));
    if (p.fixed) clientDd.appendChild(el('div', { class: 'ln' }, [el('span', { text: 'Project base' }), el('span', { class: 'num', text: money(p.fixed) })]));
    if (ct.vatOn) {
      clientDd.appendChild(el('div', { class: 'ln' }, [el('span', { text: 'Before VAT' }), el('span', { class: 'num', text: money(ct.subtotal) })]));
      clientDd.appendChild(el('div', { class: 'ln' }, [el('span', { text: 'VAT ' + ct.vatPct + '%' }), el('span', { class: 'num', text: '+' + money(ct.vat) })]));
    }
    clientDd.appendChild(el('div', { class: 'ln big' }, [el('span', { text: ct.vatOn ? 'Client total incl. VAT' : 'Client total' + (p.vat.canToggle ? ' (VAT off — client can switch it on)' : '') }), el('span', { class: 'num', text: money(ct.etb) })]));
    clientDd.appendChild(el('p', { class: 'muted', style: 'font-size:12px;margin:6px 0 0', text: '🔒 locked · ● removable · ○ add-on. Internal costs, adjustments and fixed choices are folded into these prices.' }));
  });

  const slugInp = el('input', { 'aria-label': 'Link name' });
  const slugNote = el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px' });
  slugInp.value = q.slug || q.slugWanted || slugify(s.company || s.clientName || s.project);
  const checkSlug = async () => {
    const want = slugify(slugInp.value);
    slugInp.value = want;
    q.slugWanted = want;
    if (!want) { slugNote.textContent = ''; return; }
    try {
      const r = await api('/api/quotes', { action: 'checkSlug', slug: want, keep: q.slug || '' });
      slugNote.textContent = r.slug === want ? 'Available.' : '“' + want + '” is taken, so the link will be ' + location.host + '/price/' + r.slug;
    } catch (e) { slugNote.textContent = ''; }
  };
  slugInp.addEventListener('change', () => { markDirty(); checkSlug(); });
  checkSlug();

  const genBtn = el('button', { class: 'primary', style: 'padding:14px 22px;font-size:14px',
    text: sent() ? 'Update the client link' : 'Generate client link' });
  genBtn.addEventListener('click', async () => {
    const moved = sent() && slugify(slugInp.value) !== q.slug;
    const ask = sent()
      ? 'Update what the client sees on ' + (moved ? 'a NEW link (the old link will stop working)' : 'the same link') + '?'
      : 'Generate the client link?';
    if (!confirm(ask)) return;
    genBtn.disabled = true;
    note(sent() ? 'Updating…' : 'Generating…');
    try {
      const r = await api('/api/quotes', { action: sent() ? 'update' : 'generate', quote: q, slug: slugInp.value });
      dirty = false;
      q = r.quote;
      go('#/quote/' + q.id);
    } catch (e) { note(e.message, 'err'); genBtn.disabled = false; }
  });

  return el('div', { class: 'review' }, [
    hint(sent() ? 'Check the numbers, then update the link.' : 'Check the numbers, then create the link.',
      ['“The client sees” is exactly what their page will show.',
       sent() ? 'Updating replaces the client’s page. What they had is kept in the quote’s history, and requests they already sent stay.'
              : 'You can come back and edit this quote after sending it.']),
    panel('Final internal review', 'Check everything before the link goes out.', [
      el('dl', {}, [
        el('dt', { text: 'Client' }), el('dd', { text: [s.company, s.clientName].filter(Boolean).join(' · ') || '—' }),
        el('dt', { text: 'Project' }), el('dd', { text: (s.project || '—') + ' · ' + s.typeLabel + (s.sector ? ' · ' + s.sector : '') }),
        el('dt', { text: 'Scope' }), scopeDd,
        el('dt', { text: 'Adjustments' }), factorsDd,
        el('dt', { text: 'Calculated total' }), totalDd,
        el('dt', { text: 'Custom final price' }), el('dd', {}, [el('div', { class: 'row' }, [finalInp,
          el('button', { class: 'small ghost', text: 'Clear', onclick: () => { q.finalPrice = null; finalInp.value = ''; markDirty(); live(); } })])]),
        el('dt', { text: 'The client sees' }), clientDd
      ])
    ]),
    panel('Proposal text', 'The short introduction at the top of the client page.', [
      field('Introduction', inp(s, 'intro', { area: true })),
      el('div', { class: 'grid2' }, [field('Valid for (days)', inp(s, 'validDays', { type: 'number' }))])
    ]),
    panel('Client link', sent() ? 'Changing the name here moves the proposal to a new link and the old one stops working.'
                                 : 'Only people with this link can open the proposal. It is not linked from the website.', [
      el('div', { class: 'linkbox' }, [el('span', { text: location.host + '/price/' }), slugInp]), slugNote,
      el('div', { style: 'margin-top:16px' }, [genBtn])
    ])
  ]);
}

/* ================= a sent quote: original vs client version ================= */
function renderQuote(qq, project) {
  q = upgrade(qq);
  const v = view();
  v.textContent = '';
  const s = q.setup, p = q.published;
  const link = location.origin + '/price/' + q.slug;
  const status = el('select', { style: 'width:auto', 'aria-label': 'Status' }, STATUSES.map(x => el('option', { value: x, text: STATUS_LABELS[x] })));
  status.value = q.status;
  status.addEventListener('change', async () => {
    try { await api('/api/quotes', { action: 'status', id: q.id, status: status.value }); note('Status updated', 'ok'); }
    catch (e) { note(e.message, 'err'); }
  });
  const copyBtn = el('button', { text: 'Copy link', onclick: async () => {
    try { await navigator.clipboard.writeText(link); copyBtn.textContent = 'Copied'; setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1500); }
    catch (e) { prompt('Copy this link:', link); }
  } });

  v.appendChild(el('div', { class: 'head' }, [
    el('div', {}, [el('h1', { text: s.company || s.clientName }), el('p', { text: (s.project || '') + ' · ' + s.typeLabel + ' · sent ' + when(q.generatedAt) + (q.republishedAt ? ' · updated ' + when(q.republishedAt) : '') +
        (q.viewedAt ? ' · opened ' + when(q.viewedAt) : ' · not opened yet') +
        ((q.history || []).length ? ' · ' + q.history.length + ' earlier version' + (q.history.length > 1 ? 's' : '') : '') })]),
    el('div', { class: 'row wrap' }, [
      el('button', { class: 'ghost', text: '← All quotes', onclick: () => go('#/') }), status,
      el('button', { class: 'primary', text: 'Edit & resend', onclick: () => { step = 1; go('#/edit/' + q.id); } }),
      el('button', { text: 'Duplicate as new quote', onclick: () => {
        const copy = clone(q);
        ['id', 'slug', 'status', 'published', 'originalTotals', 'requests', 'generatedAt', 'viewedAt', 'createdAt', 'updatedAt',
         'deal', 'history', 'republishedAt'].forEach(k => delete copy[k]);
        copy.finalPrice = q.finalPrice; copy.slugWanted = '';
        copy.discount.usd.rate = catalog.usdRate;
        q = copy; step = 1; dirty = true; currentHash = '#/new';
        history.replaceState(null, '', '#/new'); renderEditor(); note('Copy of the quote. Unsaved; the USD rate was updated to today’s.', 'warn');
      } }),
      el('button', { class: 'danger', text: 'Delete', onclick: async () => {
        if (!confirm('Delete this quote? The client link will stop working. Requests already in admin → Leads stay there.')) return;
        try { await api('/api/quotes', { action: 'delete', id: q.id }); go('#/'); } catch (e) { note(e.message, 'err'); }
      } })
    ])
  ]));

  v.appendChild(panel('Client link', null, [el('div', { class: 'row wrap' }, [
    el('a', { href: link, target: '_blank', rel: 'noopener', class: 'grow', style: 'font-size:16px', text: link.replace(/^https?:\/\//, '') }),
    copyBtn, el('a', { href: link, target: '_blank', rel: 'noopener' }, [el('button', { text: 'Open' })]),
    el('button', { text: 'Download PDF', title: 'The proposal as a PDF, for clients who ask for one', onclick: () => download('proposal') })
  ]), el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:12.5px', text: 'The PDF shows the proposal as sent (the default scope, add-ons listed separately). Only you can download it here; the client page has no PDF button.' })]));
  v.appendChild(dealPanel(project));

  // ---- original quote (internal breakdown, frozen) ----
  const t = computeQuote(q);
  const orig = el('div', { class: 'panel' }, [el('h3', { text: 'Your original quote' }),
    el('p', { class: 'sub', text: 'Locked when the link was generated. Internal view.' })]);
  const ob = el('table', { class: 'cmp' }, [el('thead', {}, [el('tr', {}, ['Item', 'Mode', 'Internal', 'Client price'].map(h => el('th', { text: h })))])]);
  const clientPrice = {};
  p.categories.forEach(c => c.items.forEach(i => { clientPrice[i.id] = i.unitPrice * i.qty; }));
  const obody = el('tbody');
  t.lines.forEach(l => obody.appendChild(el('tr', {}, [
    el('td', {}, [l.item.clientTitle || l.item.label, num(l.item.qty) > 1 ? ' × ' + l.item.qty : '', l.item.note ? el('div', { class: 'muted', style: 'font-size:11.5px', text: '✎ ' + l.item.note }) : null]),
    el('td', { class: 'muted', text: isLocked(l.item) ? 'Locked' : l.item.defaultOn ? 'Removable' : 'Add-on' }),
    el('td', { class: 'num' }, [money(l.price), l.overridden ? el('div', { class: 'muted', style: 'font-size:11.5px', text: 'calc. ' + money(l.calc) }) : null]),
    el('td', { class: 'num', text: clientPrice[l.item.id] != null ? money(clientPrice[l.item.id]) : '—' })
  ])));
  ob.appendChild(obody);
  orig.appendChild(ob);
  const ol = (a, b, cls) => orig.appendChild(el('div', { class: 'ln ' + (cls || '') }, [el('span', { text: a }), el('span', { class: 'num', text: b })]));
  orig.appendChild(el('div', { class: 'rule' }));
  if (t.factorPct) ol('Factors (' + t.factorPct + '%)', signed(t.factorAmt));
  ol('Timeline · ' + (t.timeline ? t.timeline.label + ', ' + t.timeline.days + ' days' : ''), signed(t.timelineAmt));
  if (t.visibleCosts) ol('Costs shown to client', money(t.visibleCosts));
  if (t.hiddenCosts) ol('Internal costs', money(t.hiddenCosts));
  if (t.adjustment) ol('Internal adjustment' + (q.adjustmentNote ? ' (' + q.adjustmentNote + ')' : ''), signed(t.adjustment));
  ol('Calculated', money(t.calculated));
  if (t.overridden) ol('Custom final price', money(t.final));
  if (p.vat && p.vat.on) {
    ol('Quoted to client before VAT', money(p.total));
    ol('VAT ' + p.vat.pct + '%', '+' + money(p.totalInclVat - p.total));
    ol('Quoted to client incl. VAT', money(p.totalInclVat), 'big');
  } else ol('Quoted to client' + (p.vat ? ' (no VAT)' : ''), money(p.total), 'big');
  const extras = [];
  if (p.goodwill.enabled) extras.push(p.goodwill.pct + '% goodwill offered' + (p.goodwill.preApplied ? ' (pre-applied)' : ''));
  if (p.vat && p.vat.canToggle) extras.push('client can switch VAT on/off');
  if (p.usd.enabled) extras.push('USD at ' + p.usd.rate + ' ' + homeCurrency() + ', −' + p.usd.pct + '%' + (p.usd.stack ? ', stacks with goodwill' : ''));
  p.choices.filter(g => g.canChange).forEach(g => extras.push('client can change ' + g.title.toLowerCase()));
  extras.push('theme: ' + ((THEMES.find(x => x.id === p.theme) || THEMES[0]).label));
  if (extras.length) orig.appendChild(el('p', { class: 'muted', style: 'font-size:12px;margin:10px 0 0', text: extras.join(' · ') }));
  if (s.notes) orig.appendChild(el('p', { class: 'muted', style: 'font-size:12.5px;margin:10px 0 0;white-space:pre-wrap', text: 'Notes: ' + s.notes }));

  // ---- client requested version(s) ----
  const reqs = (q.requests || []).slice().reverse();
  const right = el('div', { class: 'panel' }, [el('h3', { text: 'Client requested version' })]);
  if (!reqs.length) {
    right.appendChild(el('p', { class: 'sub', text: q.viewedAt ? 'The client opened the proposal but has not sent anything back yet.' : 'Nothing yet. The client has not opened the link.' }));
  } else {
    let shown = 0;
    const holder = el('div');
    const drawReq = () => {
      holder.textContent = '';
      const r = reqs[shown];
      const def = defaultSelection(p);
      const cmp = el('table', { class: 'cmp' }, [el('thead', {}, [el('tr', {}, ['Item', 'Original', 'Client'].map(h => el('th', { text: h })))])]);
      const cb = el('tbody');
      const rq = r.selection.qty || {};
      p.categories.forEach(c => c.items.forEach(i => {
        const o = i.locked || !!def.items[i.id];
        const n = i.locked || !!(r.selection.items || {})[i.id];
        const oq = i.qty, nq = i.qtyEditable && rq[i.id] != null ? rq[i.id] : i.qty;
        const lab = (on, qq) => on ? '✓' + (qq > 1 ? ' × ' + qq : '') : '—';
        const diff = o !== n || (n && oq !== nq);
        cb.appendChild(el('tr', { class: diff ? 'chg' : '' }, [
          el('td', { text: i.title }),
          el('td', { class: o ? 'yes' : 'no', text: lab(o, oq) }),
          el('td', { class: n ? 'yes' : 'no', text: lab(n, nq) + (o !== n ? (n ? ' added' : ' removed') : oq !== nq && n ? ' changed' : '') })
        ]));
      }));
      const rc = r.selection.choices || {};
      p.choices.forEach(g => {
        const a = g.options.find(x => x.id === def.choices[g.id]) || {}, b = g.options.find(x => x.id === (rc[g.id] || def.choices[g.id])) || a;
        cb.appendChild(el('tr', { class: a.id !== b.id ? 'chg' : '' }, [el('td', { text: g.title }), el('td', { text: a.label || '' }), el('td', { text: b.label || '' })]));
      });
      [['Goodwill discount', def.goodwill ? 'on' : 'off', r.goodwill ? 'on' : 'off'], ['Currency', p.currency, r.currency]]
        .concat(p.vat ? [['VAT', def.vat ? 'on' : 'off', r.vat ? 'on' : 'off']] : []).forEach(([a, o, n]) =>
        cb.appendChild(el('tr', { class: o !== n ? 'chg' : '' }, [el('td', { text: a }), el('td', { text: o }), el('td', { text: n })])));
      cb.appendChild(el('tr', {}, [el('td', {}, [el('strong', { text: 'Total' })]), el('td', { class: 'num', text: money(p.totalInclVat != null ? p.totalInclVat : p.total) }),
        el('td', { class: 'num' }, [el('strong', { text: r.amount })])]));
      cmp.appendChild(cb);
      holder.appendChild(el('p', { class: 'sub', text: (r.changed ? 'The client changed the scope' : 'The client requested the scope as quoted') + ' · ' + when(r.at) + ' · ' + r.ref }));
      holder.appendChild(cmp);
      holder.appendChild(el('dl', { class: 'kv', style: 'margin-top:14px' }, [
        el('dt', { text: 'Name' }), el('dd', { text: r.contact.name }),
        el('dt', { text: 'Email' }), el('dd', {}, [el('a', { href: 'mailto:' + r.contact.email, text: r.contact.email })]),
        el('dt', { text: 'Phone' }), el('dd', { text: r.contact.phone || '—' }),
        el('dt', { text: 'Message' }), el('dd', { text: r.contact.message || '—' }),
        el('dt', { text: 'Breakdown' }), el('dd', { class: 'num', text: 'Scope + delivery ' + money(r.totals.original) +
          (r.totals.goodwill ? ' − goodwill ' + money(r.totals.goodwill) : '') + (r.totals.usdDiscount ? ' − USD discount ' + money(r.totals.usdDiscount) : '') +
          (r.totals.vat ? ' + VAT ' + (r.totals.vatPct || 15) + '% ' + money(r.totals.vat) : '') +
          ' = ' + money(r.totals.etb) + (r.totals.usd != null ? ' ($' + r.totals.usd.toFixed(2) + ')' : '') })
      ]));
    };
    if (reqs.length > 1) {
      const pick = el('select', { style: 'width:auto;margin:6px 0 10px', 'aria-label': 'Request' }, reqs.map((r, i) => el('option', { value: i, text: (i === 0 ? 'Latest · ' : '') + when(r.at) + ' · ' + r.contact.name })));
      pick.addEventListener('change', () => { shown = Number(pick.value); drawReq(); });
      right.appendChild(pick);
    }
    right.appendChild(holder);
    drawReq();
  }
  v.appendChild(el('div', { class: 'cols' }, [orig, right]));
}

/* ================= after the yes: contract → invoice → kick-off ================= */
const company = () => ({ name: 'Studio', ...((catalog && catalog.company) || {}) });
const pdfLib = () => import('/price/pdf.js');

/* run a deal action, then redraw the quote page with the answer */
async function dealAction(body, okText) {
  note('Saving…');
  try {
    const r = await api('/api/quotes', { ...body, id: q.id });
    q = upgrade(r.quote);
    note(okText || 'Saved', 'ok');
    if (/^#\/quote\//.test(location.hash)) renderQuote(q, r.project);
    return r;
  } catch (e) { note(e.message, 'err'); throw e; }
}
async function download(kind, inv) {
  note('Making the PDF…');
  try {
    const lib = await pdfLib();
    if (kind === 'proposal') await lib.proposalPdf(q.published, company(), location.origin + '/price/' + q.slug);
    else if (kind === 'contract') await lib.contractPdf(q, company());
    else await lib.invoicePdf(q, inv, company());
    note('PDF downloaded', 'ok');
  } catch (e) { console.error(e); note(e.message || 'Could not make the PDF', 'err'); }
}

function flowStep(n, title, state, kids) {
  return el('div', { class: 'fstep ' + state }, [
    el('div', { class: 'fh' }, [el('i', { text: state === 'done' ? '✓' : String(n) }), el('b', { text: title })]),
    ...kids.filter(Boolean)
  ]);
}

function dealPanel(project) {
  const d = q.deal || {};
  const c = d.contract, invoices = d.invoices || [];
  const live = invoices.filter(i => i.status !== 'void');
  const m = n => formatMoney(n, c ? c.amounts.currency : 'ETB');
  const reqs = q.requests || [];

  /* 1 · contract */
  const s1 = !c
    ? flowStep(1, 'Contract', 'now', [
        el('p', { text: reqs.length ? 'Turn what the client agreed into a contract. It starts from their latest request (' + reqs[reqs.length - 1].ref + ').'
                                    : 'Turn the quote into a contract. If the client sends back a different scope first, the contract can use that instead.' }),
        el('div', { class: 'acts' }, [el('button', { class: 'primary', text: 'Create contract', onclick: () => go('#/contract/' + q.id) })])
      ])
    : flowStep(1, 'Contract', c.status === 'signed' ? 'done' : 'now', [
        el('div', { class: 'row wrap', style: 'gap:6px' }, [el('b', { text: c.number }), el('span', { class: 'pill ' + c.status, text: CONTRACT_LABELS[c.status] + (c.signedAt ? ' ' + dateLong(c.signedAt) : '') })]),
        el('p', { text: m(c.amounts.total) + (c.amounts.vatOn ? ' incl. VAT' : '') + ' · ' + (c.depositPct >= 100 ? 'paid in full up front' : c.depositPct + '% / ' + (100 - c.depositPct) + '% payments') + ' · ' + c.basisLabel }),
        el('div', { class: 'acts' }, [
          el('button', { class: 'small', text: 'Download PDF', onclick: () => download('contract') }),
          c.status !== 'signed' ? el('button', { class: 'small', text: 'Edit', onclick: () => go('#/contract/' + q.id) }) : null,
          c.status === 'draft' ? el('button', { class: 'small', text: 'Mark as sent', onclick: () => dealAction({ action: 'contractStatus', status: 'sent' }, 'Contract marked as sent') }) : null,
          c.status !== 'signed' ? el('button', { class: 'small primary', text: 'Mark as signed', onclick: () => {
            const dt = dateInput(todayIso());
            modal('Contract signed', [field('Date the client signed', dt)], [
              el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
              el('button', { class: 'primary', text: 'Mark as signed', onclick: () => { closeModal(); dealAction({ action: 'contractStatus', status: 'signed', date: dt.value }, 'Contract signed').catch(() => {}); } })
            ], 'Keep the signed copy with your records. The contract is locked once it is signed.');
          } }) : el('button', { class: 'small ghost', text: 'Mark as not signed', onclick: () => {
            if (confirm('Unlock the contract so it can be edited again?')) dealAction({ action: 'contractStatus', status: 'sent' }, 'Contract unlocked').catch(() => {});
          } })
        ])
      ]);

  /* 2 · invoices */
  let s2;
  if (!c) s2 = flowStep(2, 'Invoice', 'wait', [el('p', { text: 'After the contract: an invoice for the first payment (usually 50%), and later the balance.' })]);
  else {
    const next = nextInvoice(c, invoices);
    const paid = paidSoFar(invoices, c.amounts.currency);
    const allDone = !next;
    const rows = invoices.slice().reverse().map(inv => el('div', { class: 'inv' }, [
      el('div', { class: 'top' }, [
        el('span', {}, [el('b', { text: inv.number }), el('span', { class: 'muted', text: ' · ' + KIND_LABELS[inv.kind] + (inv.kind !== 'full' ? ' ' + inv.pct + '%' : '') })]),
        el('span', { class: 'pill ' + inv.status, text: INVOICE_LABELS[inv.status] + (inv.paidAt ? ' ' + dateLong(inv.paidAt) : '') })
      ]),
      el('div', { class: 'muted', style: 'font-size:13px', text: formatMoney(inv.total, inv.currency) + ' · due ' + dateLong(inv.dueDate) }),
      el('div', { class: 'acts' }, [
        el('button', { class: 'small', text: 'PDF', onclick: () => download('invoice', inv) }),
        inv.status === 'issued' ? el('button', { class: 'small', text: 'Edit', onclick: () => invoiceModal(null, inv) }) : null,
        inv.status === 'issued' ? el('button', { class: 'small primary', text: 'Mark paid', onclick: () => {
          const dt = dateInput(todayIso());
          modal('Payment received', [field('Date the money arrived', dt)], [
            el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
            el('button', { class: 'primary', text: 'Mark paid', onclick: () => { closeModal(); dealAction({ action: 'invoiceStatus', number: inv.number, status: 'paid', date: dt.value }, inv.number + ' marked paid').catch(() => {}); } })
          ], inv.number + ' · ' + formatMoney(inv.total, inv.currency));
        } }) : null,
        inv.status === 'paid' ? el('button', { class: 'small ghost', text: 'Not paid', onclick: () => dealAction({ action: 'invoiceStatus', number: inv.number, status: 'issued' }, 'Marked as not paid').catch(() => {}) }) : null,
        inv.status === 'issued' ? el('button', { class: 'small danger', text: 'Cancel', onclick: () => {
          if (confirm('Cancel invoice ' + inv.number + '? It stays in the list as cancelled, and you can make a new one.')) dealAction({ action: 'invoiceStatus', number: inv.number, status: 'void' }, 'Invoice cancelled').catch(() => {});
        } }) : null
      ])
    ]));
    const delivered = project && project.status === 'done';
    s2 = flowStep(2, 'Invoice', allDone && paid >= c.amounts.total ? 'done' : (!live.length || (next && next.kind === 'balance' && delivered)) ? 'now' : '', [
      el('p', { text: 'Paid ' + m(paid) + ' of ' + m(c.amounts.total) + '.' }),
      ...rows,
      next && next.kind === 'balance' && delivered ? el('div', { class: 'warnbox', text: 'The team marked the project delivered. Time for the balance invoice.' }) : null,
      next ? el('div', { class: 'acts' }, [el('button', { class: live.length ? 'small' : 'primary', text: 'Create ' + KIND_LABELS[next.kind].toLowerCase() + ' invoice · ' + m(next.total), onclick: () => invoiceModal(next) })])
           : el('p', { text: 'Every payment in the contract has an invoice.' })
    ]);
  }

  /* 3 · kick-off */
  let s3;
  if (!live.length) s3 = flowStep(3, 'Kick-off', 'wait', [el('p', { text: 'After the invoice: the project goes to the team on ' + location.host + '/team, with each deliverable given to the least busy person who does that kind of work.' })]);
  else if (!d.kickoff || (project && project.removed)) {      // never kicked off, or its project was deleted in Team
    const firstPaid = live.some(i => i.status === 'paid');
    s3 = flowStep(3, 'Kick-off', 'now', [
      el('p', { text: 'Creates the project in Team with one task per deliverable. The project manager checks who does what, then starts it.' }),
      firstPaid ? null : el('div', { class: 'warnbox', text: 'The first invoice is not marked paid yet. You can still kick off if work should start now.' }),
      el('div', { class: 'acts' }, [el('button', { class: 'primary', text: 'Kick off project', onclick: kickoffModal })])
    ]);
  } else {
    const pr = project;
    const link = '/team#/project/' + d.kickoff.projectId;
    const state = !pr ? 'Kicked off ' + when(d.kickoff.at) + '.'
      : pr.status === 'review' ? 'Waiting for ' + (pr.manager || 'the project manager') + ' to check the plan (' + pr.planned + ' tasks) and start it.'
      : pr.status === 'active' ? 'In progress with the team · ' + pr.progress.done + ' of ' + pr.progress.total + ' tasks done' + (pr.progress.overdue ? ' · ' + pr.progress.overdue + ' overdue' : '') + ' · due ' + dateLong(pr.dueDate)
      : pr.status === 'done' ? 'Delivered ' + dateLong(pr.completedAt) + '.'
      : 'The project was cancelled in Team.';
    s3 = flowStep(3, 'Kick-off', pr && pr.status === 'done' ? 'done' : '', [
      pr ? el('div', { class: 'row wrap', style: 'gap:6px' }, [el('b', { text: pr.name }), el('span', { class: 'pill ' + pr.status, text: { review: 'Plan in review', active: 'In progress', done: 'Delivered', cancelled: 'Cancelled' }[pr.status] })]) : null,
      el('p', { text: state }),
      pr && pr.status === 'active' ? el('div', { class: 'bar' }, [el('i', { style: 'width:' + pr.progress.pct + '%' })]) : null,
      el('div', { class: 'acts' }, [el('a', { href: link, target: '_blank', rel: 'noopener' }, [el('button', { class: 'small', text: 'Open in Team ↗' })])])
    ]);
  }

  return panel('From yes to kick-off', 'Contract, invoice, then hand the project to the team. Everything here is internal; you send the PDFs to the client.', [el('div', { class: 'flow' }, [s1, s2, s3])]);
}

/* create an invoice (step from the payment plan) or edit one that is not paid yet */
function invoiceModal(step, existing) {
  const c = q.deal.contract;
  const cur = c.amounts.currency;
  const inv = existing || null;
  const m = n => formatMoney(n, cur);
  const dt = dateInput(inv ? inv.date : todayIso());
  const due = dateInput(inv ? inv.dueDate : addDays(todayIso(), c.paymentDays || 7));
  dt.addEventListener('change', () => { if (dt.value && !inv) due.value = addDays(dt.value, c.paymentDays || 7); });
  const noteBox = el('textarea', {});
  noteBox.value = inv ? (inv.note || '') : (catalog.invoiceNote || '');
  const billBox = el('textarea', { placeholder: 'Leave empty to use the client details from the contract' });
  billBox.value = inv ? (inv.billTo || '') : '';
  // bank details: start from the company details in the price list, change them for this invoice if needed
  const bankBox = el('textarea', { placeholder: 'Bank name, account name, account number, SWIFT…', style: 'min-height:96px' });
  bankBox.value = inv && inv.bank != null ? inv.bank : ((catalog.company && catalog.company.bank) || '');
  const lines = inv && inv.lines && inv.lines.length ? clone(inv.lines)
    : [{ text: invoiceLineText(inv ? inv.kind : step.kind, inv ? inv.pct : step.pct, q.setup.project, c.number), amount: inv ? inv.subtotal : step.subtotal }];
  const planned = inv ? inv.subtotal : step.subtotal;          // untouched amounts keep the exact split
  const linesBox = el('div', { class: 'stack' });
  const totalsBox = el('div', { class: 'inv', style: 'margin:10px 0 12px' });
  const drawTotals = () => {
    const sum = lines.reduce((t, l) => t + num(l.amount), 0);
    const same = Math.abs(sum - planned) < 0.005;
    const t = same && !inv ? { subtotal: step.subtotal, vat: step.vat, total: step.total }
      : same && inv ? { subtotal: inv.subtotal, vat: inv.vat, total: inv.total }
      : lineTotals(lines, c.amounts.vatOn, c.amounts.vatPct, cur);
    totalsBox.textContent = '';
    totalsBox.append(...[
      el('div', { class: 'ln' }, [el('span', { text: 'Subtotal' }), el('span', { class: 'num', text: m(t.subtotal) })]),
      c.amounts.vatOn ? el('div', { class: 'ln' }, [el('span', { text: 'VAT ' + c.amounts.vatPct + '%' }), el('span', { class: 'num', text: m(t.vat) })]) : null,
      el('div', { class: 'ln', style: 'font-weight:500' }, [el('span', { text: 'Total' }), el('span', { class: 'num', text: m(t.total) })]),
      same ? null : el('div', { class: 'warnbox', text: 'Changed from the contract split (' + m(planned) + ' before VAT). The balance invoice will take whatever is left.' })
    ].filter(Boolean));
  };
  const drawLines = () => {
    linesBox.textContent = '';
    lines.forEach((l, i) => {
      const tx = el('textarea', { style: 'min-height:66px', 'aria-label': 'Description' }); tx.value = l.text;
      tx.addEventListener('input', () => { l.text = tx.value; });
      const am = el('input', { type: 'number', step: 'any', style: 'width:130px', 'aria-label': 'Amount before VAT' }); am.value = l.amount;
      am.addEventListener('input', () => { l.amount = am.value === '' ? 0 : Number(am.value); drawTotals(); });
      linesBox.appendChild(el('div', { class: 'row', style: 'align-items:flex-start' }, [tx, am,
        lines.length > 1 ? el('button', { class: 'x', title: 'Remove line', text: '×', onclick: () => { lines.splice(i, 1); drawLines(); } }) : null]));
    });
    drawTotals();
  };
  drawLines();
  modal(inv ? 'Edit invoice ' + inv.number : 'New ' + KIND_LABELS[step.kind].toLowerCase() + ' invoice', [
    el('label', { class: 'l', text: 'Lines (amounts before VAT, in ' + currencyLabel(cur) + ')' }), linesBox,
    el('button', { class: 'small ghost', style: 'margin-top:8px', text: '+ Add line', onclick: () => { lines.push({ text: '', amount: 0 }); drawLines(); } }),
    totalsBox,
    el('div', { class: 'grid2' }, [field('Invoice date', dt), field('Payment due', due)]),
    field('Bill to (optional)', billBox),
    field('Bank & payment details', bankBox),
    el('p', { class: 'muted', style: 'font-size:12px;margin:-6px 0 10px', text: 'To change them for every future invoice, edit Price list → Contracts & invoices.' }),
    field('Note on the invoice', noteBox)
  ], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: inv ? 'Save & download PDF' : 'Create & download PDF', onclick: async ev => {
      if (!lines.some(l => String(l.text).trim() || num(l.amount))) { note('Add at least one line.', 'err'); return; }
      ev.target.disabled = true;
      try {
        const payload = { date: dt.value, dueDate: due.value, note: noteBox.value, billTo: billBox.value, bank: bankBox.value, lines };
        const r = inv ? await dealAction({ action: 'updateInvoice', number: inv.number, invoice: payload }, inv.number + ' saved')
                      : await dealAction({ action: 'createInvoice', ...payload }, 'Invoice created');
        closeModal();
        const fresh = (q.deal.invoices || []).find(i => i.number === (inv ? inv.number : r.invoice));
        if (fresh) download('invoice', fresh);
      } catch (e) { ev.target.disabled = false; }
    } })
  ], inv ? 'Change anything until the invoice is marked paid. The number stays the same.' : 'The invoice gets the next invoice number. Change the wording or amounts if you need to.');
}

async function kickoffModal() {
  const c = q.deal.contract;
  note('Loading the team…');
  let team;
  try { team = await api('/api/quotes?team=1'); note(''); } catch (e) { return note(e.message, 'err'); }
  if (!team.configured || !team.managers.length) {
    return modal('Set up Team first', [el('p', { text: 'Kick-off sends the project to ' + location.host + '/team. Open it, create the founder account and add the team (or load the demo team), then come back.' })],
      [el('a', { href: '/team', target: '_blank', rel: 'noopener' }, [el('button', { class: 'primary', text: 'Open Team ↗' })]), el('button', { class: 'ghost', text: 'Close', onclick: closeModal })]);
  }
  const pm = el('select', {}, team.managers.map(x => el('option', { value: x.employeeId, text: x.name + (x.role === 'admin' ? ' (admin)' : '') })));
  // the contract's dates: its start date, or the first payment if that came later
  const start = dateInput(contractStart(q.deal) || todayIso());
  const dueNote = el('p', { class: 'muted', style: 'margin:-4px 0 12px;font-size:12.5px' });
  const showDue = () => {
    const days = c.amounts.timeline.days || 14, d = new Date((start.value || todayIso()) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    dueNote.textContent = 'Delivery due ' + dateLong(d.toISOString().slice(0, 10)) + ' (' + days + ' days, as in contract ' + (c.number || '') + ').' +
      (c.startDate && start.value !== c.startDate ? ' The contract start date is ' + dateLong(c.startDate) + (contractStart(q.deal) !== c.startDate ? '; the first payment came later, so work starts then.' : '.') : '');
  };
  start.addEventListener('change', showDue); showDue();
  const noteBox = el('textarea', { placeholder: 'Anything the project manager should know (optional)' });
  modal('Kick off ' + (q.setup.project || 'the project'), [
    el('p', { class: 'muted', style: 'margin:0 0 12px;font-size:13.5px', text: c.amounts.scope.filter(x => x.category !== 'Costs included').length + ' tasks, one per deliverable, spread over ' +
      (c.amounts.timeline.days || 14) + ' days. Each goes to the least busy person in the right department (design, video, strategy…). Nothing reaches the team until the project manager presses Start.' }),
    field('Project manager', pm),
    field('Start date', start), dueNote,
    field('Note', noteBox)
  ], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Kick off', onclick: async ev => {
      ev.target.disabled = true;
      try { await dealAction({ action: 'kickoff', managerId: pm.value, startDate: start.value, note: noteBox.value }, 'Project sent to the team for review'); closeModal(); }
      catch (e) { ev.target.disabled = false; }
    } })
  ]);
}

/* ---- the contract editor ---- */
function termsEditor(list, onChange) {
  const box = el('div', { class: 'terms' });
  const draw = () => {
    box.textContent = '';
    list.forEach((t, i) => {
      const title = el('input', { 'aria-label': 'Clause title' }); title.value = t.title || '';
      const body = el('textarea', { 'aria-label': 'Clause text' }); body.value = t.body || '';
      title.addEventListener('input', () => { t.title = title.value; onChange(); });
      body.addEventListener('input', () => { t.body = body.value; onChange(); });
      const move = (dir) => { const j = i + dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; draw(); onChange(); };
      box.appendChild(el('div', { class: 'term' }, [
        el('div', { class: 'row' }, [el('span', { class: 'muted', style: 'width:20px', text: (i + 1) + '.' }), title,
          el('button', { class: 'x', title: 'Move up', text: '↑', onclick: () => move(-1) }),
          el('button', { class: 'x', title: 'Move down', text: '↓', onclick: () => move(1) }),
          el('button', { class: 'x', title: 'Remove clause', text: '×', onclick: () => { if (confirm('Remove “' + (t.title || 'this clause') + '”?')) { list.splice(i, 1); draw(); onChange(); } } })]),
        body
      ]));
    });
    box.appendChild(el('button', { class: 'small ghost', text: '+ Add clause', onclick: () => { list.push({ title: 'New clause', body: '' }); draw(); onChange(); } }));
  };
  draw();
  return box;
}

function renderContract() {
  liveHooks = [];
  const v = view();
  v.textContent = '';
  if (!q.published) { note('Send the quote to the client first.', 'err'); return; }
  const s = q.setup;
  const old = (q.deal && q.deal.contract) || null;
  const reqs = q.requests || [];
  const latest = reqs.length ? reqs[reqs.length - 1] : null;
  const c = old ? clone(old) : {
    basis: basisOf(q).id, date: todayIso(), startDate: todayIso(),
    depositPct: num(catalog.depositPct) || 50, paymentDays: num(catalog.invoiceDueDays) || 7,
    clientName: s.company || s.clientName || '', clientRep: (latest && latest.contact.name) || s.clientName || '', clientTitle: '',
    clientAddress: '', clientTin: '', clientEmail: (latest && latest.contact.email) || '', clientPhone: (latest && latest.contact.phone) || '',
    notes: '', terms: clone(catalog.contractTerms || [])
  };
  const locked = !!(old && old.status === 'signed');
  const preview = el('div', { class: 'doc' });
  const drawPreview = () => {
    const basis = basisOf(q, c.basis);
    const a = agreement(q.published, basis.selection);
    const draft = { ...c, amounts: a };
    const ctx = termContext(q, draft, company());
    const mm = n => formatMoney(n, a.currency);
    preview.textContent = '';
    const co = company();
    const choice = id => ((a.choices || []).find(x => x.id === id) || {}).label || '—';
    preview.append(...[
      el('h2', { text: 'Service agreement' }),
      el('p', { class: 'sub', text: (s.project || s.typeLabel) + ' · ' + (old ? old.number : 'number given when saved') + ' · ' + dateLong(c.date) }),
      el('div', { class: 'parties' }, [
        el('div', { text: [co.name, co.address, co.tin ? 'TIN ' + co.tin : '', co.email, co.secondaryEmail ? 'Also: ' + co.secondaryEmail : '', co.phone].filter(Boolean).join('\n') }),
        el('div', { text: [c.clientName, c.clientRep ? 'Attn: ' + c.clientRep + (c.clientTitle ? ', ' + c.clientTitle : '') : '', c.clientAddress, c.clientTin ? 'TIN ' + c.clientTin : '', c.clientEmail, c.clientPhone].filter(Boolean).join('\n') || 'Client details' })
      ]),
      el('h4', { text: 'The project' }),
      el('div', { class: 'ln' }, [el('span', { text: 'Start' }), el('span', { text: dateLong(c.startDate) })]),
      el('div', { class: 'ln' }, [el('span', { text: 'Delivery' }), el('span', { text: a.timeline.label + ', ' + a.timeline.days + ' days' })]),
      el('div', { class: 'ln' }, [el('span', { text: 'Revisions · Team' }), el('span', { text: choice('revisions') + ' · ' + choice('team') })]),
      el('h4', { text: 'Fees and payment' }),
      el('div', { class: 'ln' }, [el('span', { text: 'Project fee' }), el('span', { class: 'num', text: mm(a.subtotal) })]),
      a.vatOn ? el('div', { class: 'ln' }, [el('span', { text: 'VAT ' + a.vatPct + '%' }), el('span', { class: 'num', text: mm(a.vat) })]) : null,
      el('div', { class: 'ln big' }, [el('span', { text: 'Total' }), el('span', { class: 'num', text: mm(a.total) })]),
      ...paymentPlan(a, c.depositPct).map(p => el('div', { class: 'ln' }, [el('span', { text: KIND_LABELS[p.kind] + ' ' + p.pct + '% · ' + (p.kind === 'balance' ? 'on delivery' : 'on signing') }), el('span', { class: 'num', text: mm(p.total) })])),
      el('h4', { text: 'Terms' }),
      el('ol', {}, (c.terms || []).map(t => el('li', {}, [el('b', { text: fillTerms(t.title, ctx) }), fillTerms(t.body, ctx)]))),
      c.notes ? el('h4', { text: 'Additional notes' }) : null, c.notes ? el('p', { style: 'white-space:pre-wrap', text: fillTerms(c.notes, ctx) }) : null,
      el('h4', { text: 'Schedule A: scope of work' }),
      ...a.scope.map(it => el('div', { class: 'ln' }, [el('span', { text: it.title + (it.qty > 1 ? ' × ' + it.qty : '') }), el('span', { class: 'muted', text: it.category })])),
      el('h4', { text: 'Signatures' }),
      el('p', { class: 'muted', text: 'For ' + ctx.studio + ': ' + (co.signatory || '(name in Price list → Contracts & invoices)') + ' · For ' + ctx.client + ': ' + (c.clientRep || '—') })
    ].filter(Boolean));
  };
  liveHooks.push(drawPreview);
  const changed = () => { markDirty(); drawPreview(); };
  // inputs redraw the preview through live(); numbers stay numbers
  const t = (key, ph, area) => inp(c, key, { placeholder: ph, area, disabled: locked });
  const n = key => inp(c, key, { type: 'number', disabled: locked });

  const basisSel = el('select', { disabled: locked }, [
    ...reqs.slice().reverse().map((r, i) => el('option', { value: 'request:' + r.ref, text: (i === 0 ? 'Latest · ' : '') + 'Client request ' + r.ref + ' · ' + when(r.at) + ' · ' + r.amount })),
    el('option', { value: 'quote', text: 'The quote as sent · ' + formatMoney(q.published.totalInclVat != null ? q.published.totalInclVat : q.published.total) })
  ]);
  basisSel.value = c.basis;
  basisSel.addEventListener('change', () => { c.basis = basisSel.value; changed(); });

  const payWrap = el('div');
  const drawPay = () => {
    payWrap.textContent = '';
    const segs = el('div', { class: 'segs', role: 'radiogroup' });
    [[50, '50% now · 50% on delivery'], [100, '100% up front'], ['custom', 'Other split']].forEach(([vl, label]) => {
      const on = vl === 'custom' ? ![50, 100].includes(num(c.depositPct)) : num(c.depositPct) === vl;
      segs.appendChild(el('button', { type: 'button', role: 'radio', 'aria-checked': String(on), disabled: locked, text: label, onclick: () => {
        c.depositPct = vl === 'custom' ? (on ? c.depositPct : 30) : vl; drawPay(); changed();
      } }));
    });
    payWrap.appendChild(segs);
    if (![50, 100].includes(num(c.depositPct))) payWrap.appendChild(el('div', { style: 'max-width:220px;margin-top:10px' }, [field('First payment %', n('depositPct'))]));
  };
  drawPay();
  const dates = [['Contract date', 'date'], ['Work starts', 'startDate']].map(([label, key]) => {
    const i = dateInput(c[key]); i.disabled = locked;
    i.addEventListener('change', () => { c[key] = i.value; changed(); });
    return field(label, i);
  });

  c.terms = c.terms || [];
  const termsBox = el('div', {}, [locked ? el('ol', {}, c.terms.map(x => el('li', { text: x.title }))) : termsEditor(c.terms, changed)]);

  const save = async thenPdf => {
    try {
      note('Saving…');
      const r = await api('/api/quotes', { action: 'saveContract', id: q.id, contract: c });
      q = upgrade(r.quote); dirty = false;
      note('Contract ' + q.deal.contract.number + ' saved', 'ok');
      if (thenPdf) await download('contract');
      go('#/quote/' + q.id);
    } catch (e) { note(e.message, 'err'); }
  };

  v.appendChild(el('div', { class: 'head' }, [
    el('div', {}, [el('h1', { text: 'Contract' + (old ? ' ' + old.number : '') }), el('p', { text: (s.company || s.clientName) + ' · ' + (s.project || s.typeLabel) + (locked ? ' · signed, locked' : '') })]),
    el('div', { class: 'row wrap' }, [
      el('button', { class: 'ghost', text: '← Back to the quote', onclick: () => go('#/quote/' + q.id) }),
      locked ? el('button', { text: 'Download PDF', onclick: () => download('contract') }) : el('button', { text: 'Save', onclick: () => save(false) }),
      locked ? null : el('button', { class: 'primary', text: 'Save & download PDF', onclick: () => save(true) })
    ])
  ]));
  v.appendChild(hint(locked ? 'This contract is signed, so it is locked.' : 'Check the details, then save. The PDF is what you send the client to sign.', locked
    ? ['To change it, go back to the quote and press “Mark as not signed”.']
    : ['Amounts and scope come from the version the client agreed to. They are frozen when you save.',
       'Words in {{double braces}} in the clauses are filled in automatically (client, total, dates…).',
       'Your company details, bank account and the default clauses are in Price list → Contracts & invoices.']));
  v.appendChild(el('div', { class: 'edit' }, [
    el('div', {}, [
      panel('What was agreed', 'The scope and price the contract is based on.', [field('Based on', basisSel)]),
      panel('Client details', 'As they should appear on the contract and invoices.', [el('div', { class: 'grid2' }, [
        field('Company / client name', t('clientName')), field('Signs for the client', t('clientRep', 'Full name')),
        field('Their title', t('clientTitle', 'e.g. General Manager')), field('TIN', t('clientTin', 'Client tax number')),
        field('Email', t('clientEmail')), field('Phone', t('clientPhone'))
      ]), field('Address', t('clientAddress', 'Street, city', true))]),
      panel('Dates and payment', null, [
        el('div', { class: 'grid2' }, dates),
        field('Payment terms', payWrap),
        el('div', { class: 'grid2' }, [field('Invoices payable within (days)', n('paymentDays'))])
      ]),
      panel('Clauses', 'Edit the wording for this contract only. The defaults live in the price list.', [
        termsBox,
        locked ? null : el('button', { class: 'small ghost', style: 'margin-top:8px', text: 'Reset to the price list clauses', onclick: () => {
          if (!confirm('Replace these clauses with the ones from the price list?')) return;
          c.terms = clone(catalog.contractTerms || []);
          termsBox.replaceChildren(termsEditor(c.terms, changed));
          changed();
        } })
      ]),
      panel('Additional notes', 'Optional. Printed after the clauses.', [t('notes', 'e.g. Printing costs are paid by the client directly to the printer.', true)])
    ]),
    el('div', { class: 'stick' }, [preview])
  ]));
  drawPreview();
}

/* ================= price list ================= */
let editType = null;
function renderCatalog() {
  liveHooks = [];
  const v = view();
  v.textContent = '';
  const c = catalog;
  if (c.vatOn == null) c.vatOn = true;          // price lists saved before VAT existed
  if (c.vatPct == null) c.vatPct = VAT_PCT;
  const saveBtn = el('button', { class: 'primary', text: 'Save price list', onclick: async () => {
    saveBtn.disabled = true;
    try { await api('/api/quotes', { action: 'saveCatalog', catalog: c }); dirty = false; note('Price list saved', 'ok'); }
    catch (e) { note(e.message, 'err'); }
    saveBtn.disabled = false;
  } });
  const resetBtn = el('button', { class: 'danger', text: 'Reset to the starting list', onclick: async () => {
    if (!confirm('Throw away your price list and go back to the one the site came with? This cannot be undone.')) return;
    try { const r = await api('/api/quotes', { action: 'resetCatalog' }); catalog = r.catalog; dirty = false; note('Price list reset', 'ok'); renderCatalog(); }
    catch (e) { note(e.message, 'err'); }
  } });
  v.appendChild(el('div', { class: 'head' }, [
    el('div', {}, [el('h1', { text: 'Price list' }), el('p', { text: 'Starting prices and options for new quotes. Changes never affect quotes that were already created.' })]),
    el('div', { class: 'row wrap' }, [el('button', { class: 'ghost', text: '← All quotes', onclick: () => go('#/') }), resetBtn, saveBtn])
  ]));
  if (c.samplePrices) v.appendChild(el('p', { class: 'note warn', style: 'display:block;margin:0 0 14px;padding:12px 16px;border-radius:14px;background:var(--pinkSoft)',
    text: 'These are SAMPLE prices, not real ones. Change them to your own and press “Save price list” before you send a quote.' }));
  v.appendChild(hint('Edit any price, name or description by typing in it.', [
    'Press “Delete” to remove a deliverable, category, option or whole project type.',
    'Nothing is stored until you press “Save price list”.']));

  v.appendChild(panel('Money', null, [el('div', { class: 'grid3' }, [
    field('1 USD = … ' + homeCurrency(), inp(c, 'usdRate', { type: 'number' })),
    field('USD payment discount %', inp(c, 'usdDiscountPct', { type: 'number' })),
    field('Goodwill discount %', inp(c, 'goodwillPct', { type: 'number' })),
    field('VAT %', inp(c, 'vatPct', { type: 'number', placeholder: '15' })),
    el('div', { class: 'field' }, [chk(c, 'vatOn', 'VAT on for new quotes')]),
    field('Proposal valid for (days)', inp(c, 'validDays', { type: 'number' }))
  ]), field('Default introduction for clients', inp(c, 'intro', { area: true }))]));

  // who contracts and invoices come from, and the clauses every new contract starts with
  const co = c.company = c.company || {};
  c.contractTerms = c.contractTerms || [];
  v.appendChild(panel('Contracts & invoices', 'Printed on every contract and invoice PDF.', [
    el('div', { class: 'grid3' }, [
      field('Company name', inp(co, 'name', { placeholder: 'Your studio name' })),
      field('TIN', inp(co, 'tin', { placeholder: 'Tax number' })),
      field('VAT registration no.', inp(co, 'vatNumber')),
      field('Address', inp(co, 'address')), field('Phone', inp(co, 'phone')), field('Main email', inp(co, 'email', { placeholder: 'hello@yourstudio.com' })),
      field('Second email (also printed)', inp(co, 'secondaryEmail', { placeholder: 'Optional' })),
      field('Website', inp(co, 'website')), field('Signs contracts (name)', inp(co, 'signatory', { placeholder: 'Full name' })), field('Their title', inp(co, 'signatoryTitle'))
    ]),
    el('div', { class: 'grid2' }, [
      field('Bank details (printed on invoices)', inp(co, 'bank', { area: true })),
      field('Note at the bottom of invoices', inp(c, 'invoiceNote', { area: true }))
    ]),
    el('div', { class: 'grid3' }, [
      field('First payment % (50 = half up front, 100 = all up front)', inp(c, 'depositPct', { type: 'number' })),
      field('Invoices payable within (days)', inp(c, 'invoiceDueDays', { type: 'number' }))
    ]),
    el('h3', { style: 'margin-top:12px', text: 'Contract clauses' }),
    el('p', { class: 'sub', text: 'Every new contract starts with these. Words in {{double braces}} are filled in: {{studio}}, {{client}}, {{project}}, {{total}}, {{paymentSchedule}}, {{deposit}}, {{balance}}, {{paymentDays}}, {{startDate}}, {{days}}, {{timeline}}, {{revisions}}, {{team}}. Have a lawyer read them once.' }),
    termsEditor(c.contractTerms, markDirty)
  ]));

  v.appendChild(el('div', { class: 'grid2' }, [
    panel('Timeline options', 'Days here are the default; each project type can set its own below.', [optionTable('ctl', c.timeline, { days: true })]),
    panel('Revision rounds', null, [optionTable('crv', c.revisions, {})]),
    panel('Team sizes', 'What the client can pick as “Team”.', [optionTable('ctm', c.team = c.team || [], { desc: true })]),
    panel('Complexity', null, [optionTable('ccx', c.complexity, {})]),
    panel('Other factors', 'Offered (switched off) on every new quote.', [optionTable('cof', c.otherFactors = c.otherFactors || [], {})])
  ]));

  // project types
  if (!editType || !c.projectTypes.find(t => t.id === editType)) editType = c.projectTypes[0] && c.projectTypes[0].id;
  const type = c.projectTypes.find(t => t.id === editType);
  const tabs = el('div', { class: 'types' }, c.projectTypes.map(t => el('button', { 'aria-current': String(t.id === editType), text: t.label,
    onclick: () => { editType = t.id; renderCatalog(); } })).concat([el('button', { class: 'ghost', text: '+ Project type', onclick: () => {
      const id = 't' + uid(); c.projectTypes.push({ id, label: 'New type', days: [], categories: [] }); editType = id; markDirty(); renderCatalog();
    } })]));
  const tp = panel('Project types', 'Categories and deliverables offered for each type of project.', [tabs]);
  if (type) {
    type.days = type.days || [];
    tp.appendChild(el('div', { class: 'grid3' }, [
      field('Type name', inp(type, 'label')),
      ...c.timeline.map((o, i) => field(o.label + ' (days)', inp(type.days, i, { type: 'number', nullable: true, placeholder: String(o.days) })))
    ]));
    type.categories.forEach((cat, ci) => {
      const tb = el('tbody');
      cat.items.forEach((it, ii) => tb.appendChild(el('tr', {}, [
        el('td', {}, [inp(it, 'label', { label: 'Name' })]),
        el('td', {}, [inp(it, 'desc', { label: 'Client description' })]),
        el('td', { style: 'width:110px' }, [inp(it, 'unitLabel', { label: 'Unit', placeholder: 'e.g. pages' })]),
        el('td', { style: 'width:120px' }, [inp(it, 'price', { type: 'number', label: 'Price (' + homeCurrency() + ')' })]),
        el('td', { style: 'width:78px' }, [el('button', { class: 'small danger', text: 'Delete', onclick: () => {
          if (!confirm('Delete “' + (it.label || 'this deliverable') + '” from the price list?')) return;
          cat.items.splice(ii, 1); markDirty(); renderCatalog(); } })])
      ])));
      tp.appendChild(el('div', { class: 'cat', style: 'margin-top:14px' }, [
        el('div', { class: 'cathead' }, [inp(cat, 'label', { class: 'catname', label: 'Category' }), el('span', { class: 'grow' }),
          el('button', { class: 'small danger', text: 'Delete category', onclick: () => { if (confirm('Delete “' + cat.label + '” and its ' + cat.items.length + ' deliverables?')) { type.categories.splice(ci, 1); markDirty(); renderCatalog(); } } })]),
        el('table', { class: 'items' }, [el('thead', {}, [el('tr', {}, ['Deliverable', 'Client description', 'Unit', 'Price (' + homeCurrency() + ')', ''].map(h => el('th', { text: h })))]), tb]),
        el('div', { class: 'addbar' }, [el('button', { class: 'small', text: '+ Add deliverable', onclick: () => {
          cat.items.push({ id: 'i' + uid(), label: 'New deliverable', desc: '', unitLabel: '', price: 0 }); markDirty(); renderCatalog();
        } })]),
        phaseEditor(cat, type.categories)
      ]));
    });
    tp.appendChild(el('div', { class: 'row wrap', style: 'margin-top:12px' }, [
      el('button', { text: '+ Add category', onclick: () => { type.categories.push({ id: 'c' + uid(), label: 'New category', items: [] }); markDirty(); renderCatalog(); } }),
      el('span', { class: 'grow' }),
      el('button', { class: 'danger', text: 'Delete this project type', onclick: () => {
        if (c.projectTypes.length < 2 || !confirm('Delete the “' + type.label + '” project type and everything in it?')) return;
        c.projectTypes = c.projectTypes.filter(t => t !== type); editType = null; markDirty(); renderCatalog();
      } })
    ]));
  }
  v.appendChild(tp);
}

boot();
