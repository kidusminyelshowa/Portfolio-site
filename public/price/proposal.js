/* Price Builder: the client proposal at /price/<slug>.
   The client's choices live only in this browser (and are sent when they
   press "Request"). The saved quote is never changed. */
import { applyTheme } from '/team/theme.js';
import { clientTotals, defaultSelection, toDisplay, formatMoney, clampQty, qtyOf, isOn, MAX_QTY, setHomeCurrency, homeCurrency, currencyLabel, timelinePlan } from '/price/engine.js';

const $ = s => document.querySelector(s);
const SVG = 'http://www.w3.org/2000/svg';
/* drawn, because the brand font has no − or + and the borrowed ones sat off-centre */
const stepIcon = d => '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="' + d + '"/></svg>';
const STEP_ICON = { minus: stepIcon('M6 12h12'), plus: stepIcon('M12 6v12M6 12h12') };
function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  (kids || []).forEach(c => c != null && c !== false && n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))));
  return n;
}
const ICON = {
  up: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12V2M3 6l4-4 4 4"/></svg>',
  down: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v10M3 8l4 4 4-4"/></svg>',
  eq: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 5h8M3 9h8"/></svg>',
  lock: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="5.5" width="8" height="5.5" rx="1.3"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>'
};

const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '').toLowerCase();
const storeKey = 'gz-proposal-' + slug;
let P = null, sel = null, DEF = null;

const usdOk = () => P.usd.enabled && P.usd.rate > 0;
const cur = () => (sel.currency === 'USD' && usdOk() ? 'USD' : 'ETB');
const money = (etb, c) => formatMoney(toDisplay(P, etb, c || cur()), c || cur());
const signed = (etb, c) => (etb < 0 ? '−' : '+') + money(Math.abs(etb), c);
const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function save() { try { localStorage.setItem(storeKey, JSON.stringify({ at: P.preparedAt, sel })); } catch (e) {} }
function payable(t) { return t.usd ? formatMoney(t.usdAmount, 'USD') : formatMoney(t.etb); }
function payNum(t) { return t.usd ? t.usdAmount : t.etb; }

async function load() {
  if (!slug) return fail();
  let r;
  // the agency's name, logo, colours and contact details (Team → Settings → Brand & region)
  try { applyBrand((await (await fetch('/api/quotes?brand=1', { cache: 'no-store' })).json()).brand || {}); } catch (e) { /* the proposal still loads */ }
  try { r = await fetch('/api/quotes?slug=' + encodeURIComponent(slug), { cache: 'no-store' }); }
  catch (e) { return fail(); }
  if (!r.ok) return fail();
  P = (await r.json()).proposal;
  if (!P || P.v !== 2) return fail();
  DEF = defaultSelection(P);
  sel = structuredClone(DEF);
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
    if (saved && saved.at === P.preparedAt && saved.sel) {
      const s = saved.sel;
      sel = { ...sel, goodwill: !!s.goodwill, currency: s.currency || sel.currency,
              vat: P.vat && P.vat.canToggle && s.vat !== undefined ? !!s.vat : sel.vat,
              items: { ...sel.items, ...s.items }, qty: { ...sel.qty, ...s.qty }, choices: { ...sel.choices, ...s.choices } };
    }
  } catch (e) {}
  if (!usdOk()) sel.currency = 'ETB';
  build();
  render();
}
function fail() { $('#loading').hidden = true; $('#missing').hidden = false; }

let BRAND = { name: '' };
function applyBrand(b) {
  BRAND = b;
  applyTheme(b.colors);
  setHomeCurrency(b.currency);
  document.querySelectorAll('[data-cur="ETB"]').forEach(x => { x.textContent = homeCurrency(); });
  const mk = $('#brandMark'), nm = $('#brandName');
  if (mk) { mk.textContent = ''; mk.appendChild(b.logo ? el('img', { src: b.logo, alt: '', width: 15, height: 19 }) : document.createTextNode(String(b.name || '').charAt(0).toUpperCase())); }
  if (nm) nm.textContent = String(b.name || '').toUpperCase();
  const where = [b.tagline, b.city].filter(Boolean).join(' · ');
  $('#footName').textContent = [b.name, where].filter(Boolean).join(' · ');
  const links = $('#footLinks');
  links.textContent = '';
  if (b.email) links.appendChild(el('a', { href: 'mailto:' + b.email, text: b.email }));
  if (b.phone) links.appendChild(el('a', { href: 'tel:' + String(b.phone).replace(/[^\d+]/g, ''), text: b.phone }));
  if (b.website) links.appendChild(el('a', { href: /^https?:/i.test(b.website) ? b.website : 'https://' + b.website, target: '_blank', rel: 'noopener', text: b.website.replace(/^https?:\/\//, '') }));
  const reach = $('#missingReach');
  reach.textContent = '';
  [b.email, b.secondaryEmail].filter(Boolean).forEach((m, i) => {
    if (i) reach.appendChild(document.createTextNode(' or '));
    reach.appendChild(el('a', { href: 'mailto:' + m }, [el('u', { text: m })]));
  });
  if (!reach.childNodes.length) reach.textContent = 'the person who sent it';
}

/* ================= static parts ================= */
function build() {
  const name = P.company || P.client;
  if (P.theme && P.theme !== 'blossom') {
    document.documentElement.dataset.theme = P.theme;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--page').trim();
    if (bg) document.querySelector('meta[name="theme-color"]').setAttribute('content', bg);
  }
  document.title = (name ? name + ' — ' : '') + 'Proposal' + (BRAND.name ? ' · ' + BRAND.name : '');
  $('#prepared').textContent = P.projectType ? P.projectType + ' proposal' : 'Proposal';
  $('#company').textContent = name;
  $('#project').textContent = P.project;
  $('#sFor').textContent = P.client || P.company;
  $('#sDate').textContent = fmtDate(P.preparedAt);
  $('#sValid').textContent = fmtDate(P.expiresAt);
  $('#topvalid').textContent = 'Valid until ' + fmtDate(P.expiresAt);
  $('#topchip').hidden = false;
  $('#intro').textContent = P.intro;
  const defT = clientTotals(P, DEF);
  $('#hTotal').textContent = payable({ ...defT, usd: false });
  if (defT.vatOn) $('#hTotal').nextElementSibling.textContent = 'Proposed investment · incl. ' + defT.vatPct + '% VAT';
  $('#hDays').textContent = defT.days ? defT.days + ' days' : defT.timeline.label || '—';
  if (Date.parse(P.expiresAt) < Date.now()) {
    $('#expired').hidden = false;
    $('#expired').textContent = 'This proposal was valid until ' + fmtDate(P.expiresAt) + '. You can still send it to us and we will confirm current prices.';
  }

  if (usdOk()) {
    ['#seg', '#dseg'].forEach(id => {
      $(id).hidden = false;
      $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', () => setCur(b.dataset.cur)));
    });
    $('#swap').hidden = false;
    $('#swap').addEventListener('click', () => setCur(cur() === 'USD' ? 'ETB' : 'USD'));
    $('#rateMini').hidden = false;
    $('#rate').textContent = '1 USD = ' + P.usd.rate.toFixed(2) + ' ' + homeCurrency();
  }
  $('#gwBox').hidden = !P.goodwill.enabled;
  $('#gw').addEventListener('click', e => { e.preventDefault(); sel.goodwill = !sel.goodwill; save(); render(); });
  $('#vatBox').hidden = !(P.vat && P.vat.canToggle);
  $('#vatTog').addEventListener('click', e => { e.preventDefault(); sel.vat = !sel.vat; save(); render(); });
  $('#reset').addEventListener('click', () => { const c = sel.currency; sel = structuredClone(DEF); sel.currency = c; save(); render(); });
  $('#cta').addEventListener('click', openRequest);
  $('#dcta').addEventListener('click', openRequest);
  $('#fCancel').addEventListener('click', () => $('#dlg').close());
  $('#doneClose').addEventListener('click', () => $('#dlg').close());
  $('#form').addEventListener('submit', submit);
  $('#dlg').addEventListener('click', e => { if (e.target === $('#dlg')) $('#dlg').close(); });

  if (!P.choices.some(g => g.canChange)) $('#choicePanel').hidden = true;

  $('#loading').hidden = true;
  $('#doc').hidden = false;
  $('#dock').hidden = false;

  // the floating bar on phones: hidden over the hero and while the full summary is visible
  const seen = new Map();
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      es.forEach(e => seen.set(e.target, e.isIntersecting));
      $('#dock').classList.toggle('away', [...seen.values()].some(Boolean));
    }, { threshold: 0.12 });
    io.observe($('.hero')); io.observe($('#inv'));
  } else $('#dock').classList.remove('away');

  // chart carousel dots on phones
  const g = $('#glance');
  g.addEventListener('scroll', () => {
    const i = Math.round(g.scrollLeft / Math.max(1, g.scrollWidth - g.clientWidth) * (g.children.length - 1));
    $('#dots').querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
}

function setCur(c) { sel.currency = c; save(); render(); }

/* ================= live parts ================= */
function render() {
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
  const t = clientTotals(P, sel);
  const defT = clientTotals(P, { ...DEF, currency: sel.currency });
  renderScope(t);
  renderChoices(t);
  renderIncluded(t);
  renderGlance(t, defT);
  renderInvestment(t, defT);
  renderTimeline();
  if (focusKey) { const f = document.querySelector('[data-k="' + focusKey + '"]'); if (f) f.focus({ preventScroll: true }); }
}

function renderScope(t) {
  const box = $('#cats');
  box.textContent = '';
  let on = 0, all = 0;
  P.categories.forEach((c, ci) => {
    const rows = c.items.map(it => {
      const q = qtyOf(it, sel), active = isOn(it, sel);
      all++; if (active) on++;
      const flip = () => { if (it.locked) return; sel.items[it.id] = !sel.items[it.id]; save(); render(); };
      const tog = it.locked
        ? el('span', { class: 'lock tg', title: 'Always included', html: ICON.lock })
        : el('button', { type: 'button', class: 'tog tg', role: 'switch', 'aria-checked': String(active), 'aria-label': it.title, 'data-k': 't' + it.id,
            onclick: e => { e.stopPropagation(); flip(); } });
      const unit = it.unit || '';
      const qty = it.qtyEditable ? el('div', { class: 'qty', onclick: e => e.stopPropagation() }, [
        el('button', { type: 'button', 'aria-label': 'Fewer', 'data-k': 'm' + it.id, disabled: q <= 1 || !active,
          onclick: () => { sel.qty[it.id] = clampQty(q - 1); save(); render(); }, html: STEP_ICON.minus }),
        el('span', { class: 'num', text: q + (unit ? ' ' + (q === 1 ? unit.replace(/s$/, '') : unit) : '') }),
        el('button', { type: 'button', 'aria-label': 'More', 'data-k': 'p' + it.id, disabled: q >= MAX_QTY || !active,
          onclick: () => { sel.qty[it.id] = clampQty(q + 1); save(); render(); }, html: STEP_ICON.plus })
      ]) : null;
      const title = it.title + (!it.qtyEditable && q > 1 ? ' × ' + q + (unit ? ' ' + unit : '') : '');
      return el('div', { class: 'item' + (active ? '' : ' off') + (it.locked ? ' locked' : ''), onclick: flip }, [
        tog,
        el('div', { class: 'tx' }, [el('b', {}, [title, it.locked ? el('span', { class: 'tag', text: 'Included' }) : null]), it.desc ? el('small', { text: it.desc }) : null]),
        qty,
        el('div', { class: 'pr num', text: (active ? '' : '+') + money(it.unitPrice * q) })
      ]);
    });
    box.appendChild(el('div', { class: 'cat' }, [
      el('div', { class: 'cathead' }, [el('h3', { text: c.title }), el('span', { class: 'sub num', text: money(t.cats[ci].amount) })]),
      el('div', { class: 'items' }, rows)
    ]));
  });
  $('#count').textContent = on + ' of ' + all + ' selected';
}

function renderChoices(t) {
  const box = $('#groups');
  box.textContent = '';
  const now = payNum(t);
  P.choices.filter(g => g.canChange).forEach(g => {
    const pick = t.picks.find(x => x.id === g.id);
    box.appendChild(el('div', { class: 'grp' }, [
      el('div', { class: 'grph' }, [el('h3', { text: g.title }),
        el('span', { text: g.id === 'timeline' ? (t.days ? t.days + ' days' : '') : pick.option.label })]),
      el('div', { class: 'pills', role: 'radiogroup', 'aria-label': g.title }, g.options.map(o => {
        const chosen = o.id === pick.option.id;
        const alt = clientTotals(P, { ...sel, choices: { ...sel.choices, [g.id]: o.id } });
        const diff = payNum(alt) - now;
        const cc = cur();
        const d = Math.abs(diff) < 0.5 ? '' : (diff > 0 ? '+' : '−') + formatMoney(Math.abs(diff), cc);
        const parts = [g.id === 'timeline' && o.days ? o.days + ' days' : '', chosen ? 'selected' : d || 'same price'].filter(Boolean);
        return el('button', { type: 'button', class: 'pill', role: 'radio', 'aria-checked': String(chosen), 'data-k': 'c' + g.id + o.id,
          onclick: () => { sel.choices[g.id] = o.id; save(); render(); } }, [el('b', { text: o.label }), el('small', { class: 'num', text: parts.join(' · ') })]);
      })),
      pick.option.desc ? el('p', { class: 'gnote', text: pick.option.desc }) : null
    ]));
  });
}

function renderIncluded(t) {
  const box = $('#incl');
  box.textContent = '';
  P.choices.filter(g => !g.canChange).forEach(g => {
    const o = g.options[0];
    box.appendChild(el('div', {}, [el('span', { text: g.title }), el('span', { text: o.label + (g.id === 'timeline' && o.days ? ' · ' + o.days + ' days' : '') + (o.desc ? ' · ' + o.desc : '') })]));
  });
  (P.costs || []).forEach(c => box.appendChild(el('div', {}, [el('span', { text: c.title }), el('span', { class: 'num', text: money(c.amount) })])));
  $('#inclPanel').hidden = !box.children.length;
}

/* ---------- per-service timeline: each service's steps on a week grid ---------- */
const SVC_COLORS = ['var(--pinkSel)', 'var(--gA-arc2)', 'var(--w5)', 'var(--teal)', 'var(--gC-soft)', 'var(--gD-soft)'];
function renderTimeline() {
  const plan = timelinePlan(P, sel);
  const panel = $('#tlPanel');
  panel.hidden = !plan.services.length;
  if (!plan.services.length) return;
  const weeks = Math.max(1, Math.ceil(plan.total / 5)), span = weeks * 5;
  const pc = d => (d / span * 100) + '%';
  const box = $('#tl');
  box.textContent = '';
  box.style.setProperty('--wk', (100 / weeks) + '%');
  box.appendChild(el('div', { class: 'wkh', style: 'grid-template-columns:repeat(' + weeks + ',1fr)', 'aria-hidden': 'true' },
    Array.from({ length: weeks }, (_, i) => el('span', { text: 'Week ' + (i + 1) }))));
  plan.services.forEach((sv, n) => {
    const color = SVC_COLORS[n % SVC_COLORS.length];
    box.appendChild(el('div', { class: 'svc', style: 'background:' + color }, [el('b', { text: sv.title }), el('small', { text: sv.days + ' working day' + (sv.days === 1 ? '' : 's') })]));
    box.appendChild(el('div', { class: 'lane', role: 'list', 'aria-label': sv.title }, sv.phases.map(ph => {
      const right = ph.end / span > 0.7;    // near the end: the name goes before the bar
      const when = 'days ' + (ph.start + 1) + '–' + ph.end;
      return el('div', { class: 'step', role: 'listitem', 'aria-label': ph.label + ', ' + when + (ph.review ? ', your review' : '') }, [
        el('span', { class: 'bar' + (ph.review ? ' rev' : ''), style: 'left:' + pc(ph.start) + ';width:' + pc(ph.end - ph.start) + ';background:' + color }),
        el('span', { class: 'lbl', style: right ? 'right:calc(100% - ' + pc(ph.start) + ')' : 'left:' + pc(ph.end), text: ph.label })
      ]);
    })));
  });
  $('#tlTotal').textContent = plan.total + ' working days · about ' + weeks + ' week' + (weeks === 1 ? '' : 's');
  $('#tlSub').textContent = plan.scaled ? 'Each service, step by step. It follows the delivery pace you chose.' : 'Each service, step by step, week by week.';
}

/* ---------- charts ---------- */
function svg(tag, attrs, kids) {
  const n = document.createElementNS(SVG, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  (kids || []).forEach(c => c && n.appendChild(c));
  return n;
}

function gaugeCard(t, defT) {
  const cov = t.full > 0 ? t.scope / t.full : 0;
  const word = cov >= 0.85 ? 'Complete' : cov >= 0.5 ? 'Balanced' : 'Essentials';
  const cx = 100, cy = 100, r = 78, SW = 220, A0 = 200;
  const pt = v => { const a = (A0 - SW * v) * Math.PI / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const arc = (v0, v1) => { const [x0, y0] = pt(v0), [x1, y1] = pt(v1); return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + ((v1 - v0) * SW > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2); };
  const s = svg('svg', { viewBox: '0 0 200 150', 'aria-hidden': 'true' });
  const v = Math.max(0.02, Math.min(1, cov));
  // remaining part: short dashes like the reference
  let k = 0;
  for (let a = v + 0.07; a < 0.995; a += 0.09, k++) {
    s.appendChild(svg('path', { d: arc(a, Math.min(0.995, a + 0.045)), style: 'stroke:var(' + (k < 2 ? '--gA-arc2' : '--gA-rest') + ')', 'stroke-width': 16, 'stroke-linecap': 'round', fill: 'none' }));
  }
  s.appendChild(svg('path', { d: arc(0.005, v), style: 'stroke:var(--gA-arc)', 'stroke-width': 16, 'stroke-linecap': 'round', fill: 'none' }));
  const diff = payNum(t) - payNum(defT);
  const same = Math.abs(diff) < 0.5;
  return el('div', { class: 'gc lav' }, [
    el('h3', { text: 'Your scope' }),
    el('div', { class: 'gauge' }, [s, el('div', { class: 'c' }, [el('span', { text: word }), el('b', { class: 'num', text: Math.round(cov * 100) + '%' })])]),
    el('span', { class: 'gchip num', html: (same ? ICON.eq : diff > 0 ? ICON.up : ICON.down) + '<span></span>' }),
  ]);
}

const WARM = ['var(--w1)', 'var(--w2)', 'var(--w3)', 'var(--w4)', 'var(--w5)', 'var(--w6)'];
function barCard(t) {
  const parts = t.cats.filter(c => c.amount > 0).map((c, i) => ({ label: c.title, amt: c.amount, color: WARM[i % WARM.length] }));
  const extra = t.choiceAmt + t.costs + t.fixed;
  if (extra > 0.5) parts.push({ label: 'Fees, pace & team', amt: extra, color: 'var(--wx)' });
  const total = parts.reduce((s, p) => s + p.amt, 0) || 1;
  let acc = 0;
  const ticks = [];
  const track = el('div', { class: 'track' }, parts.map(p => el('i', { style: 'width:' + (p.amt / total * 100).toFixed(2) + '%;background:' + p.color })));
  parts.forEach(p => { acc += p.amt; if (acc < total - 0.5) ticks.push(acc / total); });
  const n = t.chosen.length;
  return el('div', { class: 'gc beige' }, [
    el('h3', { text: 'Where it goes' }),
    el('div', { class: 'bartop' }, [
      el('div', {}, [el('span', { text: 'Deliverables' }), el('b', { class: 'num', text: money(t.scope) })]),
      el('div', {}, [el('span', { text: 'Before discounts' }), el('b', { class: 'num', text: money(t.original) })])
    ]),
    track,
    el('div', { class: 'ticks' }, ticks.map(x => el('i', { style: 'left:' + (x * 100).toFixed(2) + '%' }))),
    el('div', { class: 'legend' }, parts.map(p => el('span', {}, [el('i', { style: 'background:' + p.color }), p.label + ' ' + Math.round(p.amt / total * 100) + '%']))),
    el('div', { class: 'barfoot', text: n + ' deliverable' + (n === 1 ? '' : 's') })
  ]);
}

function lineCard(t) {
  const phases = t.cats.filter(c => c.amount > 0);
  const days = t.days || 0;
  const W = 320, H = 176, x0 = 0, x1 = W - 34, yTop = 22, yBot = 144;
  const s = svg('svg', { class: 'line', viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const total = phases.reduce((a, p) => a + p.amount, 0) || 1;
  // each phase takes time in proportion to its share of the work, then the line steps up
  const start = 40;
  let x = start, y = yBot, cum = 0;
  let d = 'M' + x0 + ' ' + yBot + ' L' + start + ' ' + yBot;
  const nodes = [];
  phases.forEach(p => {
    cum += p.amount;
    const nx = start + (x1 - start) * cum / total;
    const ny = yBot - (yBot - yTop) * cum / total;
    const rise = Math.min(34, (nx - x) * 0.55);
    d += ' L' + (nx - rise).toFixed(1) + ' ' + y.toFixed(1) + ' C' + (nx - rise / 2).toFixed(1) + ' ' + y.toFixed(1) + ' ' + (nx - rise / 2).toFixed(1) + ' ' + ny.toFixed(1) + ' ' + nx.toFixed(1) + ' ' + ny.toFixed(1);
    nodes.push([nx, ny]);
    x = nx; y = ny;
  });
  if (nodes.length) {
    const [lx, ly] = nodes[nodes.length - 1];
    s.appendChild(svg('line', { x1: lx, y1: ly, x2: lx, y2: H, style: 'stroke:var(--gC-vline)', 'stroke-width': 1.2 }));
  }
  s.appendChild(svg('path', { d, fill: 'none', style: 'stroke:var(--gC-line)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  nodes.forEach(([nx, ny], i) => {
    const last = i === nodes.length - 1;
    s.appendChild(svg('circle', last ? { cx: nx, cy: ny, r: 9, style: 'fill:#fff;stroke:var(--gC-line)', 'stroke-width': 4.5 } : { cx: nx, cy: ny, r: 5.5, style: 'fill:var(--gC-line);stroke:var(--gC-bg)', 'stroke-width': 2 }));
  });
  const lab = (tx, xx, anchor) => svg('text', { x: xx, y: H - 6, 'font-size': 11, fill: 'currentColor', 'text-anchor': anchor, 'font-family': 'Figtree, Helvetica, sans-serif' }, [document.createTextNode(tx)]);
  s.appendChild(lab('Start', 6, 'start'));
  if (days) s.appendChild(lab('Day ' + Math.round(days / 2), start + (x1 - start) / 2, 'middle'));
  if (nodes.length) s.appendChild(lab(days ? 'Day ' + days : 'Done', Math.min(nodes[nodes.length - 1][0], W - 20), 'middle'));
  return el('div', { class: 'gc rose' }, [
    el('h3', { text: 'How the project unfolds' }),
    el('div', { class: 'lchip' }, [el('i', { html: ICON.up }), el('span', { text: (days ? 'Delivered in ' + days + ' days' : 'Delivery: ' + t.timeline.label) + ' · ' + phases.length + ' phase' + (phases.length === 1 ? '' : 's') })]),
    s
  ]);
}

function setupCard(t, defT) {
  const rows = [];
  const row = (title, sub, value, changed) => rows.push({ title, sub, value, changed });
  t.picks.forEach(x => {
    const changed = x.canChange && x.option.id !== DEF.choices[x.id];
    row(x.option.label, x.title + (x.id === 'timeline' && t.days ? ' · ' + t.days + ' days' : ''),
        x.amount ? signed(x.amount) : 'Included', changed);
  });
  const byTitle = {};
  P.categories.forEach(c => c.items.forEach(i => { byTitle[i.title] = i; }));
  const price = title => { const i = byTitle[title]; return i ? i.unitPrice * qtyOf(i, sel) : 0; };
  t.added.forEach(title => row(title, 'Added by you', '+' + money(price(title)), true));
  t.removed.forEach(title => row(title, 'Removed by you', '−' + money(price(title)), true));
  t.qtyChanged.forEach(x => row(x.title, 'Changed from ' + x.from + ' to ' + x.to, money(price(x.title)), true));
  if (t.goodwillOn) row('Goodwill discount', 'Applied', '−' + money(t.goodwill), true);
  if (t.usd) row('Paying in USD', P.usd.pct + '% discount', '−' + money(t.usdDiscount), true);
  if (t.vatOn) row('VAT', t.vatPct + '% added to the total', '+' + money(t.vat), t.vatCanToggle && sel.vat !== DEF.vat);

  const diff = payNum(t) - payNum(defT);
  const same = Math.abs(diff) < 0.5;
  const shown = rows.slice(0, 5);
  const more = rows.length - shown.length;
  return el('div', { class: 'gc olive' }, [
    el('h3', { text: 'Your choices' }),
    el('div', { class: 'lchip' }, [
      el('i', { html: same ? ICON.eq : diff > 0 ? ICON.up : ICON.down }),
      el('span', { text: same ? 'Exactly as we proposed it' : formatMoney(Math.abs(diff), cur()) + (diff > 0 ? ' more than' : ' less than') + ' our proposal' })
    ]),
    el('div', { class: 'rows' }, shown.map(r => el('div', { class: 'rw' }, [
      el('span', { class: 'bd' + (r.changed ? ' dk' : ''), text: (r.title[0] || '·').toUpperCase() }),
      el('div', { class: 'tx' }, [el('b', { text: r.title }), el('small', { text: r.sub })]),
      el('span', { class: 'vl num', text: r.value })
    ])).concat(more > 0 ? [el('div', { class: 'rw' }, [el('div', { class: 'tx' }, [el('small', { text: '+ ' + more + ' more change' + (more > 1 ? 's' : '') })])])] : []))
  ]);
}

function renderGlance(t, defT) {
  const g = $('#glance');
  const keep = g.scrollLeft;
  g.textContent = '';
  const gauge = gaugeCard(t, defT);
  const diff = payNum(t) - payNum(defT);
  gauge.querySelector('.gchip span').textContent = Math.abs(diff) < 0.5 ? 'Same as our proposal'
    : formatMoney(Math.abs(diff), cur()) + (diff > 0 ? ' more' : ' less') + ' than proposed';
  [gauge, barCard(t), lineCard(t), setupCard(t, defT)].forEach(c => g.appendChild(c));
  g.scrollLeft = keep;
  const dots = $('#dots');
  if (!dots.children.length) for (let i = 0; i < 4; i++) dots.appendChild(el('i', { class: i ? '' : 'on' }));
}

/* ---------- investment ---------- */
function setNum(node, text) {
  if (node.textContent && node.textContent !== text) { node.classList.add('tick'); setTimeout(() => node.classList.remove('tick'), 140); }
  node.textContent = text;
}
function renderInvestment(t, defT) {
  const c = cur();
  const bare = n => money(n).replace(' ' + homeCurrency(), '').replace(/^\$/, '');
  setNum($('#gross'), bare(t.original));
  $('#grossCur').textContent = currencyLabel(c);
  $('#alt').textContent = usdOk() ? '≈ ' + money(t.original, c === 'USD' ? 'ETB' : 'USD') : '';
  const brk = $('#brk');
  brk.textContent = '';
  const row = (a, b) => brk.appendChild(el('div', {}, [el('span', { text: a }), el('span', { class: 'num', text: b })]));
  row('Deliverables · ' + t.chosen.length, money(t.scope + t.fixed));
  t.picks.forEach(x => { if (x.amount) row(x.title + ' · ' + x.option.label, signed(x.amount)); });
  if (t.costs) row('Also included', money(t.costs));

  const payText = t.usd ? formatMoney(t.usdAmount, 'USD').replace(/^\$/, '') : bare(t.etb);
  setNum($('#pay'), payText);
  $('#payCur').textContent = t.usd ? 'USD' : homeCurrency();
  const notes = [];
  if (t.goodwillOn) notes.push('Goodwill −' + money(t.goodwill));
  if (t.usd) notes.push(P.usd.pct + '% USD payment discount included');
  else if (usdOk()) notes.push('Pay in USD and save ' + P.usd.pct + '%');
  if (!t.vatOn && P.vat) notes.push('Excludes VAT');
  // VAT gets its own clear line right above what they pay
  const inPay = etb => t.usd ? formatMoney(etb / P.usd.rate, 'USD') : formatMoney(etb);
  $('#vatRows').hidden = !t.vatOn;
  $('#vSub').textContent = inPay(t.subtotal);
  $('#vLab').textContent = '+ ' + t.vatPct + '% VAT';
  $('#vAmt').textContent = '+ ' + inPay(t.vat);
  $('#dVat').hidden = !t.vatOn;
  $('#dVat').textContent = 'incl. + ' + t.vatPct + '% VAT (' + inPay(t.vat) + ')';
  $('#payNote').textContent = notes.join(' · ');
  $('#dTotal').textContent = payable(t);

  const gwBlocked = t.usd && !P.usd.stack;
  $('#gw').disabled = gwBlocked;
  $('#gw').setAttribute('aria-checked', String(t.goodwillOn));
  $('#gwNote').textContent = gwBlocked ? 'The USD discount already applies'
    : P.goodwill.pct + '% · because we like working with you';
  $('#vatTog').setAttribute('aria-checked', String(t.vatOn));
  $('#vatNote').textContent = (P.vat ? P.vat.pct : 15) + '% · ' + (t.vatOn ? 'added to the total' : 'not included');
  $('#eta').textContent = t.days ? t.days + ' days' : t.timeline.label || '—';
  ['#seg', '#dseg'].forEach(id => $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cur === c))));
  $('#reset').hidden = JSON.stringify([sel.items, sel.qty, sel.choices, sel.goodwill, sel.vat]) === JSON.stringify([DEF.items, DEF.qty, DEF.choices, DEF.goodwill, DEF.vat]);
}

/* ================= request ================= */
function openRequest() {
  const t = clientTotals(P, sel);
  const recap = $('#recap');
  recap.textContent = '';
  recap.append('You are requesting ', el('b', { text: payable(t) }), ' · ' + t.chosen.length + ' deliverable' + (t.chosen.length === 1 ? '' : 's') +
    (t.days ? ' · ' + t.days + ' days' : '') + (t.goodwillOn ? ' · goodwill discount applied' : '') + (t.vatOn ? ' · incl. ' + t.vatPct + '% VAT' : '') + '. We will reply with next steps.');
  $('#form').hidden = false;
  $('#done').hidden = true;
  $('#ferr').textContent = '';
  $('#dlg').showModal();
}

async function submit(ev) {
  ev.preventDefault();
  const f = ev.target, v = k => f.elements[k].value.trim();
  const contact = { name: v('name'), email: v('email'), phone: v('phone'), message: v('message') };
  if (!contact.name) { $('#ferr').textContent = 'Please add your name.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) { $('#ferr').textContent = 'Please add a valid email.'; return; }
  const btn = $('#fSend');
  btn.disabled = true;
  $('#ferr').textContent = '';
  try {
    const r = await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request', slug, selection: sel, contact }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'Something went wrong. Please try again.');
    const t = clientTotals(P, sel);
    const st = $('#doneStats');
    st.textContent = '';
    [['Deliverables', String(t.chosen.length)], ['Your version', payable(t)], ['Reference', b.ref]].forEach(([a, c]) =>
      st.appendChild(el('div', {}, [el('span', { text: a }), el('b', { class: 'num', text: c })])));
    $('#doneText').textContent = 'We will reply within two working days' + (contact.phone ? ', by email or WhatsApp.' : ' by email.');
    $('#form').hidden = true;
    $('#done').hidden = false;
    f.reset();
  } catch (e) {
    $('#ferr').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

load();
