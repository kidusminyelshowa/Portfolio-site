/* Price Builder: pricing engine.
   Shared by the internal builder (browser), the client proposal (browser) and
   the server (api/quotes.js), so all three always agree on the numbers.

   Internal:  Σ(item price) × (1 + (complexity + revisions + team + other + timeline)%)
              + additional costs + internal adjustment  = calculated total
              (the agency may replace it with a custom final price)
   Client:    receives only item prices with every hidden cost already folded
              in, plus the % of the choices they are allowed to change (delivery
              pace, team, revisions), so the default scope adds up exactly to
              the agency's final price.
   VAT:       a per-quote switch (default 15%), added last — after the goodwill
              and USD discounts — so "You will pay" is the amount including VAT.
              The agency can also let the client switch it on or off.
   Money:     amounts are kept in the agency's home currency (Brand & region; ETB in
              the Ethiopia preset). Data fields keep their original names (etb, ETB),
              meaning "home currency". USD is the optional second currency a client
              may pay in, at the rate in the price list. */

export const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const round = (n, d = 0) => { const f = Math.pow(10, d); return Math.round(num(n) * f) / f; };
const has = v => v !== null && v !== undefined && v !== '';

export const STATUSES = ['draft', 'sent', 'viewed', 'client-modified', 'revision-requested', 'accepted', 'expired', 'lost'];
export const STATUS_LABELS = {
  'draft': 'Draft', 'sent': 'Sent', 'viewed': 'Viewed', 'client-modified': 'Client modified',
  'revision-requested': 'Revision requested', 'accepted': 'Accepted', 'expired': 'Expired', 'lost': 'Lost'
};

// the choices a client may be allowed to change, in the order they are shown
export const CHOICE_GROUPS = [
  { id: 'timeline', title: 'Delivery pace' },
  { id: 'team', title: 'Team' },
  { id: 'revisions', title: 'Revision rounds' }
];

// colour themes for the client page (css in price/proposal.html); the first is the default
export const THEMES = [
  // built from Settings → Brand & region (accent and highlight), so proposals look like your other material
  { id: 'brand', label: 'Your brand', note: 'Default · your accent and highlight colours', colors: ['var(--accent)', 'color-mix(in srgb, var(--accent) 35%, #141414)', 'var(--highlight)', '#F0F0EE'] },
  { id: 'classic', label: 'Classic', note: 'Red, wine, petrol, ivory', colors: ['#F10103', '#4B0010', '#105752', '#F2E8DA'] },
  { id: 'blossom', label: 'Blossom', note: 'Pink, plum, teal', colors: ['#FFB1EE', '#4A1239', '#8FDCE5', '#EFEEE9'] },
  { id: 'ember', label: 'Ember', note: 'Warm · apricot, rust, mustard', colors: ['#F7A774', '#5A1F0E', '#F2D27A', '#F1ECE6'] },
  { id: 'sage', label: 'Sage', note: 'Calm · mint, forest, periwinkle', colors: ['#A8D5B5', '#173B30', '#C9D6F0', '#ECEEE8'] },
  { id: 'cobalt', label: 'Cobalt', note: 'Bold · sky, navy, peach', colors: ['#A9C3FF', '#14215C', '#FFD1A8', '#ECEEF3'] }
];

// words a proposal link may never take (they are real files or routes)
export const RESERVED = ['proposal', 'index', 'engine', 'builder', 'price', 'api', 'admin', 'new'];

export const MAX_QTY = 999;
export const VAT_PCT = 15;

/* the quote's VAT setting; quotes made before VAT existed count as off */
export function vatOf(q) {
  const v = (q && q.vat) || {};
  return { on: !!v.on, pct: has(v.pct) ? num(v.pct) : VAT_PCT, clientCanChange: !!v.clientCanChange };
}

export function slugify(s) {
  return String(s || '').toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}

/* the home currency: set from Brand & region by the server and by each page */
let HOME = 'ETB';
export function setHomeCurrency(code) { if (/^[A-Z]{3}$/.test(String(code || ''))) HOME = String(code); }
export const homeCurrency = () => HOME;
/* the label for a stored currency key: 'ETB' means the home currency */
export const currencyLabel = c => (c === 'USD' ? 'USD' : HOME);

export function formatMoney(n, currency) {
  if (currency === 'USD' || HOME === 'USD') {
    return '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(num(n)).toLocaleString('en-US') + ' ' + HOME;
}

function pick(options, id) {
  const list = options || [];
  return list.find(o => o.id === id) || list[0] || null;
}

export const isLocked = it => it.mode === 'included' || it.mode === 'locked';

export function lineCalc(it) {
  const calc = num(it.unit) * Math.max(0, num(has(it.qty) ? it.qty : 1));
  const price = has(it.override) ? num(it.override) : calc;
  return { calc, price, overridden: has(it.override) };
}

/* ---------- internal quote ---------- */
export function computeQuote(q) {
  const f = q.factors || {};
  const sel = id => pick(f[id] && f[id].options, f[id] && f[id].selected);
  const cx = sel('complexity'), rv = sel('revisions'), tm = sel('team'), tl = sel('timeline');
  const others = (f.other || []).filter(o => o.on !== false);
  const factorPct = num(cx && cx.pct) + num(rv && rv.pct) + num(tm && tm.pct) + others.reduce((s, o) => s + num(o.pct), 0);
  const timelinePct = num(tl && tl.pct);

  const lines = [];
  const categories = [];
  let scope = 0, optionalOff = 0;
  (q.categories || []).forEach(c => {
    let catTotal = 0, count = 0;
    (c.items || []).forEach(it => {
      if (!it.enabled) return;
      const { calc, price, overridden } = lineCalc(it);
      const inDefault = isLocked(it) || !!it.defaultOn;
      lines.push({ catId: c.id, catLabel: c.label, item: it, calc, price, overridden, inDefault });
      if (inDefault) { scope += price; catTotal += price; count++; }
      else optionalOff += price;
    });
    if (count) categories.push({ id: c.id, label: c.label, total: catTotal, count });
  });

  const factorAmt = scope * factorPct / 100;
  const timelineAmt = scope * timelinePct / 100;
  const scopeF = scope + factorAmt;
  const costs = (q.costs || []).filter(c => num(c.amount) !== 0);
  const visibleCosts = costs.filter(c => c.visible).reduce((s, c) => s + num(c.amount), 0);
  const hiddenCosts = costs.filter(c => !c.visible).reduce((s, c) => s + num(c.amount), 0);
  const adjustment = num(q.adjustment);
  const calculated = scopeF + timelineAmt + visibleCosts + hiddenCosts + adjustment;
  const overridden = has(q.finalPrice);
  const final = Math.max(0, overridden ? num(q.finalPrice) : calculated);

  const gw = (q.discount && q.discount.goodwill) || {};
  const goodwillPct = gw.available ? num(gw.pct) : 0;
  const usd = (q.discount && q.discount.usd) || {};
  const vat = vatOf(q);
  const vatAmt = vat.on ? final * vat.pct / 100 : 0;

  return {
    lines, categories, scope, optionalOff, factorPct, factorAmt, scopeF,
    timeline: tl, timelinePct, timelineAmt,
    complexity: cx, revisions: rv, team: tm, others,
    optionalOffWithFactors: optionalOff * (1 + (factorPct + timelinePct) / 100),
    visibleCosts, hiddenCosts, adjustment, calculated, final, overridden,
    goodwillPct, goodwillAmt: final * goodwillPct / 100,
    usdRate: num(usd.rate), usdPct: num(usd.pct),
    vatOn: vat.on, vatPct: vat.pct, vatAmt, finalWithVat: final + vatAmt
  };
}

/* ---------- the client-safe snapshot ----------
   Built from scratch with an explicit list of fields: nothing internal
   (base prices, notes, costs marked internal, adjustments, complexity,
   the % of choices the client cannot change) can reach the client. */
export function publishQuote(q, slug, now) {
  const t = computeQuote(q);
  const s = q.setup || {};
  const f = q.factors || {};
  const d = q.discount || {};

  const choices = CHOICE_GROUPS.map(G => {
    const grp = f[G.id] || {};
    const opts = grp.options || [];
    const chosen = pick(opts, grp.selected);
    if (!chosen) return null;
    const can = !!grp.clientCanChange && opts.length > 1;
    return {
      id: G.id, title: G.title, canChange: can, selected: String(chosen.id),
      options: (can ? opts : [chosen]).map(o => ({
        id: String(o.id), label: String(o.label || ''), desc: String(o.desc || ''),
        days: G.id === 'timeline' ? num(o.days) : 0,
        pct: can ? num(o.pct) : 0     // fixed choices are already inside the item prices
      }))
    };
  }).filter(Boolean);
  const clientPct = choices.reduce((sum, g) => sum + num((g.options.find(o => o.id === g.selected) || {}).pct), 0);

  const target = Math.max(0, t.final - t.visibleCosts);
  const base = t.scope * (1 + clientPct / 100);
  let k = 1, fixed = 0;
  if (base > 0) k = target / base; else fixed = target;

  const categories = [];
  (q.categories || []).forEach(c => {
    const items = [];
    (c.items || []).forEach(it => {
      if (!it.enabled) return;
      const { price } = lineCalc(it);
      const qty = Math.max(1, Math.round(num(has(it.qty) ? it.qty : 1)));
      const locked = isLocked(it);
      items.push({
        id: String(it.id),
        title: String(it.clientTitle || it.label || ''),
        desc: String(it.clientDesc || ''),
        unit: String(it.unitLabel || ''),
        qty,
        unitPrice: round(price * k / qty, 4),
        locked,
        on: locked || !!it.defaultOn,
        qtyEditable: !!it.clientQty
      });
    });
    if (items.length) categories.push({ title: String(c.label || ''), items, start: dayNum(c.start, 0), phases: cleanPhases(c.phases) });
  });

  const gw = d.goodwill || {};
  const usd = d.usd || {};
  const vat = vatOf(q);
  const at = now || new Date().toISOString();
  const validDays = num(s.validDays) || 30;

  return {
    v: 2,
    slug,
    client: String(s.clientName || ''),
    company: String(s.company || ''),
    project: String(s.project || ''),
    projectType: String(s.typeLabel || ''),
    intro: String(s.intro || ''),
    preparedAt: at,
    expiresAt: new Date(Date.parse(at) + validDays * 86400000).toISOString(),
    currency: s.currency === 'USD' && usd.enabled ? 'USD' : 'ETB',
    theme: THEMES.some(x => x.id === s.theme) ? s.theme : THEMES[0].id,
    categories,
    choices,
    costs: (q.costs || []).filter(c => c.visible && num(c.amount) !== 0)
      .map(c => ({ title: String(c.label || c.type || ''), amount: round(num(c.amount), 2) })),
    fixed: round(fixed, 2),
    goodwill: { enabled: !!gw.available, pct: num(gw.pct), preApplied: !!(gw.available && gw.preApplied) },
    usd: { enabled: !!usd.enabled, rate: num(usd.rate), pct: num(usd.pct), stack: !!usd.stack },
    vat: { on: vat.on, pct: vat.pct, canToggle: vat.clientCanChange },
    total: round(t.final, 2),
    totalInclVat: round(t.finalWithVat, 2)
  };
}

/* ---------- per-service timeline ----------
   Each category (service) can carry its own plan: phases with a start day (counted from the
   service's own start) and a length in working days, some marked as client reviews. The service
   itself starts on a day counted from the project start, so services can overlap. */
const dayNum = (v, min) => Math.max(min, Math.min(999, Math.round(num(v)) || 0));
export function cleanPhases(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map(x => ({
    label: String((x && x.label) || '').slice(0, 120), start: dayNum(x && x.start, 0), days: Math.max(1, dayNum(x && x.days, 1)), review: !!(x && x.review)
  })).filter(x => x.label);
}
/* a new phase goes right after the last one */
export function nextPhaseStart(phases) {
  return (phases || []).reduce((m, x) => Math.max(m, dayNum(x.start, 0) + Math.max(1, dayNum(x.days, 1))), 0);
}
/* how long a service takes from its first phase to its last */
export function serviceDays(phases) { return cleanPhases(phases).reduce((m, x) => Math.max(m, x.start + x.days), 0); }

/* the plan the client sees: services with at least one item switched on, stretched or squeezed
   by the delivery pace they picked (Rush shortens every phase in proportion) */
export function timelinePlan(p, sel) {
  const s = sel || defaultSelection(p);
  const pace = (p.choices || []).find(g => g.id === 'timeline');
  let k = 1;
  if (pace) {
    const base = pace.options.find(o => o.id === pace.selected) || pace.options[0];
    const now = (pace.canChange && s.choices && pace.options.find(o => o.id === s.choices[pace.id])) || base;
    if (base && now && num(base.days) > 0 && num(now.days) > 0) k = num(now.days) / num(base.days);
  }
  const sc = d => Math.round(d * k);
  const services = [];
  (p.categories || []).forEach((c, i) => {
    const phases = cleanPhases(c.phases);
    if (!phases.length || !c.items.some(it => isOn(it, s))) return;
    const start = sc(dayNum(c.start, 0));
    const rows = phases.map(x => { const a = start + sc(x.start); return { label: x.label, review: x.review, start: a, end: a + Math.max(1, sc(x.days)) }; });
    const end = rows.reduce((m, r) => Math.max(m, r.end), start);
    services.push({ title: c.title, index: i, start, end, days: end - start, phases: rows });
  });
  return { services, total: services.reduce((m, x) => Math.max(m, x.end), 0), scaled: k !== 1 };
}

/* ---------- client totals (browser + server) ---------- */
export function defaultSelection(p) {
  const items = {}, qty = {}, choices = {};
  p.categories.forEach(c => c.items.forEach(it => {
    if (!it.locked) items[it.id] = !!it.on;
    if (it.qtyEditable) qty[it.id] = it.qty;
  }));
  (p.choices || []).forEach(g => { choices[g.id] = g.selected; });
  return { items, qty, choices, goodwill: !!p.goodwill.preApplied, currency: p.currency || 'ETB', vat: !!(p.vat && p.vat.on) };
}

export function clampQty(n) { return Math.min(MAX_QTY, Math.max(1, Math.round(num(n)) || 1)); }
export function qtyOf(it, sel) { return it.qtyEditable && sel.qty && has(sel.qty[it.id]) ? clampQty(sel.qty[it.id]) : it.qty; }
export function isOn(it, sel) { return it.locked || !!(sel.items && sel.items[it.id]); }

export function clientTotals(p, sel) {
  const s = sel || defaultSelection(p);
  let scope = 0, full = 0;
  const chosen = [], added = [], removed = [], qtyChanged = [], cats = [];
  p.categories.forEach(c => {
    let catAmt = 0, catCount = 0;
    c.items.forEach(it => {
      const q = qtyOf(it, s);
      const price = it.unitPrice * q;
      const on = isOn(it, s);
      full += price;
      if (on) {
        scope += price; catAmt += price; catCount++;
        chosen.push(it.title + (q > 1 ? ' × ' + q : ''));
        if (q !== it.qty) qtyChanged.push({ title: it.title, from: it.qty, to: q });
      }
      if (!it.locked && on && !it.on) added.push(it.title);
      if (!it.locked && !on && it.on) removed.push(it.title);
    });
    cats.push({ title: c.title, amount: catAmt, count: catCount });
  });

  const picks = (p.choices || []).map(g => {
    const o = (g.canChange && s.choices && g.options.find(x => x.id === s.choices[g.id])) ||
              g.options.find(x => x.id === g.selected) || g.options[0];
    return { id: g.id, title: g.title, option: o, pct: num(o.pct), amount: scope * num(o.pct) / 100, canChange: g.canChange };
  });
  const choiceAmt = picks.reduce((sum, x) => sum + x.amount, 0);
  const tl = (picks.find(x => x.id === 'timeline') || {}).option || { label: '', days: 0 };
  const costs = (p.costs || []).reduce((sum, c) => sum + num(c.amount), 0);
  const original = scope + choiceAmt + costs + num(p.fixed);
  const usd = s.currency === 'USD' && p.usd.enabled && num(p.usd.rate) > 0;
  const goodwillOn = !!(p.goodwill.enabled && s.goodwill && (!usd || p.usd.stack));
  const goodwill = goodwillOn ? original * num(p.goodwill.pct) / 100 : 0;
  const etb = original - goodwill;
  const usdDiscount = usd ? etb * num(p.usd.pct) / 100 : 0;
  const payEtb = etb - usdDiscount;
  // VAT comes last; older proposals have no VAT setting and stay without it
  const v = p.vat || null;
  const vatOn = !!(v && (v.canToggle ? (s.vat === undefined ? v.on : !!s.vat) : v.on));
  const vatPct = v ? num(v.pct) : 0;
  const vat = vatOn ? payEtb * vatPct / 100 : 0;
  const totalEtb = payEtb + vat;
  return {
    scope, full, picks, choiceAmt, timeline: tl, days: num(tl.days),
    costs, fixed: num(p.fixed), original, cats,
    goodwillOn, goodwill, usd, usdDiscount,
    subtotal: payEtb, vatOn, vatPct, vat, vatCanToggle: !!(v && v.canToggle),
    etb: round(totalEtb), usdAmount: usd ? round(totalEtb / num(p.usd.rate), 2) : null,
    chosen, added, removed, qtyChanged
  };
}

/* ETB amount → the chosen currency at the saved rate (the USD discount is
   shown as its own line, so it is not applied here) */
export function toDisplay(p, amountEtb, currency) {
  if (currency === 'USD' && p.usd.enabled && num(p.usd.rate) > 0) return amountEtb / num(p.usd.rate);
  return amountEtb;
}
