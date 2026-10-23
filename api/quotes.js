/* Price Builder API.
   Storage (the private store: Blob LEADS_BLOB_TOKEN, or STORAGE_DIR/private):
     quotes/<id>.json      full internal quote: prices, notes, costs, client requests,
                           and after a yes: q.deal = { contract, invoices, kickoff }
     proposals/<slug>.json only { id, published }: the client-safe snapshot
     pricing/catalog.json  the team's price list
     pricing/counters.json running contract and invoice numbers, per year
     config/brand.json     the agency's name, logo, colours, company details and region (api/_brand.js)
   Kick-off writes a project into the Team system (team/db.json), where the
   project manager reviews the task plan and starts it.
   The public side (a client opening /price/<slug>) only ever reads proposals/. */
import { json, readBody, readJson, readJsonMeta, writeJson, isWriteConflict, list, del, isAuthed, requireAuth, LEADS_TOKEN, failure } from './_lib.js';
import { computeQuote, publishQuote, clientTotals, defaultSelection, slugify, formatMoney, clampQty,
         RESERVED, STATUSES, setHomeCurrency } from '../public/price/engine.js';
import { readBrand, brand, publicBrand, companyOf, saveBrand } from './_brand.js';
import DEFAULT_CATALOG from './_price-catalog.js';
import { basisOf, agreement, nextInvoice, invoiceLineText, cleanLines, lineTotals, CONTRACT_STATUSES, INVOICE_STATUSES, contractStart } from '../public/price/deal.js';
import { readDb as readTeamDb, mutate as mutateTeam, isManager } from './_team-lib.js';
import { createProject, projectStatusFor } from './_team-projects.js';
import { effectiveStatus, dealStage, salesRules } from './_sales.js';
import { notify, notifyEmployee, adminIds, userOf } from './_team-notify.js';
import { sendPush } from './_push.js';

/* tell the team (bell + push) about something that happened on a deal; never fails the deal itself.
   Sales news goes to the admins and the sales owner, with no amounts in it. */
async function tellTeam(fn) {
  try {
    const { db, outbox } = await mutateTeam(async d => { if ((d.users || []).some(u => u.hash)) fn(d); });
    if (outbox && outbox.length) await sendPush(db, outbox);
  } catch (e) { /* the Team app may not be set up yet */ }
}
const salesPeople = d => { const owner = userOf(d, salesRules(d).owner); return [...new Set(adminIds(d).concat(owner ? [owner.id] : []))]; };
const clientName = q => (q.setup && (q.setup.company || q.setup.clientName)) || 'A client';

const Q = 'quotes/', P = 'proposals/', CATALOG = 'pricing/catalog.json', COUNTERS = 'pricing/counters.json';
const MAX_REQUESTS = 30;

const read = path => readJson(path, LEADS_TOKEN, null, 'private');
const write = (path, data) => writeJson(path, LEADS_TOKEN, data, 'private');
const cleanSlug = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
const cleanId = s => String(s || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
const clip = (v, n) => String(v == null ? '' : v).slice(0, n || 2000);

function newId() {
  return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const cleanDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fail = (msg, status) => { const e = new Error(msg); e.status = status || 400; throw e; };

/* next contract or invoice number for this year: CTR-2026-001, INV-2026-0001.
   Saved with an etag check, so two people can never get the same number. */
async function nextNumber(kind) {
  const year = new Date().getUTCFullYear();
  for (let attempt = 1; ; attempt++) {
    const { data, etag } = await readJsonMeta(COUNTERS, LEADS_TOKEN, 'private', true);
    const safe = etag && attempt <= 4;
    const c = data || {};
    c[kind] = c[kind] || {};
    const n = (Number(c[kind][year]) || 0) + 1;
    c[kind][year] = n;
    try {
      await writeJson(COUNTERS, LEADS_TOKEN, c, 'private', safe ? { ifMatch: etag } : null);
      return kind === 'invoice' ? 'INV-' + year + '-' + String(n).padStart(4, '0') : 'CTR-' + year + '-' + String(n).padStart(3, '0');
    } catch (e) {
      if (!isWriteConflict(e) || !safe) throw e;
      await new Promise(r => setTimeout(r, 100 * attempt));
    }
  }
}

/* a saved price list plus anything added to the starting list since; the company
   details always come from Brand & region */
function withDefaults(saved) {
  const c = { ...DEFAULT_CATALOG, ...(saved || {}) };
  c.company = companyOf(brand());
  c.homeCurrency = brand().currency;
  return c;
}
const COMPANY_KEYS = ['name', 'address', 'phone', 'email', 'secondaryEmail', 'website', 'tin', 'vatNumber', 'signatory', 'signatoryTitle', 'bank'];

function summary(q) {
  const s = q.setup || {};
  const amount = q.published ? (q.published.totalInclVat != null ? q.published.totalInclVat : q.published.total) : computeQuote(q).finalWithVat;
  const last = (q.requests || [])[q.requests ? q.requests.length - 1 : 0];
  return {
    id: q.id, slug: q.slug || null, client: s.clientName || '', company: s.company || '',
    project: s.project || '', type: s.typeLabel || '', amount, status: effectiveStatus(q),
    createdAt: q.createdAt, updatedAt: q.updatedAt, generatedAt: q.generatedAt || null,
    viewedAt: q.viewedAt || null, requests: (q.requests || []).length,
    lastRequestAmount: last ? last.totals.etb : null,
    stage: dealStage(q)
  };
}

// fields the builder may set; everything else is controlled by the server
function editable(src) {
  const q = src && typeof src === 'object' ? src : {};
  return {
    setup: q.setup && typeof q.setup === 'object' ? q.setup : {},
    categories: Array.isArray(q.categories) ? q.categories : [],
    factors: q.factors && typeof q.factors === 'object' ? q.factors : {},
    costs: Array.isArray(q.costs) ? q.costs : [],
    adjustment: q.adjustment == null ? 0 : q.adjustment,
    adjustmentNote: clip(q.adjustmentNote, 500),
    discount: q.discount && typeof q.discount === 'object' ? q.discount : {},
    vat: q.vat && typeof q.vat === 'object' ? { on: !!q.vat.on, pct: Math.max(0, Math.min(100, Number(q.vat.pct) || 0)), clientCanChange: !!q.vat.clientCanChange } : { on: false, pct: 15, clientCanChange: false },
    finalPrice: q.finalPrice == null ? null : q.finalPrice,
    slugWanted: clip(q.slugWanted, 60)
  };
}

async function saveDraft(body) {
  const incoming = body.quote || {};
  const id = cleanId(incoming.id) || newId();
  const stored = incoming.id ? await read(Q + id + '.json') : null;
  if (stored && stored.generatedAt) {
    const e = new Error('This quote was already sent, so it is locked. Duplicate it to make changes.');
    e.status = 409; throw e;
  }
  const now = new Date().toISOString();
  const q = { id, status: 'draft', createdAt: (stored && stored.createdAt) || now, updatedAt: now,
              ...editable(incoming) };
  await write(Q + id + '.json', q);
  return q;
}

async function freeSlug(wanted) {
  let base = slugify(wanted) || 'proposal';
  for (let n = 0; n < 500; n++) {
    const s = n ? base + n : base;
    if (RESERVED.includes(s)) continue;
    if (!(await read(P + s + '.json'))) return s;
  }
  throw new Error('Could not find a free link name.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const url = new URL(req.url, 'http://localhost');
  const qs = url.searchParams;
  try {
    await readBrand();
    setHomeCurrency(brand().currency);
    if (req.method === 'GET') {
      /* public: the agency's name, logo and colours for the proposal page and sign-in screens */
      if (qs.has('brand')) return json(res, 200, { brand: publicBrand(brand()) });
      /* public: a client opening their proposal */
      if (qs.has('slug')) {
        const slug = cleanSlug(qs.get('slug'));
        const rec = slug && await read(P + slug + '.json');
        if (!rec || !rec.published) return json(res, 404, { error: 'Proposal not found' });
        if (!isAuthed(req)) {
          // first time the client opens it: mark as viewed (team previews don't count)
          const q = await read(Q + rec.id + '.json');
          if (q && !q.viewedAt) {
            q.viewedAt = new Date().toISOString();
            if (q.status === 'sent') q.status = 'viewed';
            await write(Q + q.id + '.json', q);
            await tellTeam(d => notify(d, salesPeople(d), { kind: 'sales', emoji: '👀', title: clientName(q) + ' opened the proposal',
              body: (q.setup.project || 'Their proposal') + ' was just opened.', href: '#/sales' }));
          }
        }
        return json(res, 200, { proposal: rec.published });
      }

      if (!requireAuth(req, res)) return;
      if (qs.has('catalog')) {
        const catalog = await read(CATALOG);
        // new settings added to the starting list later still appear in a saved list
        return json(res, 200, { catalog: withDefaults(catalog), isDefault: !catalog });
      }
      if (qs.has('id')) {
        const q = await read(Q + cleanId(qs.get('id')) + '.json');
        if (!q) return json(res, 404, { error: 'Quote not found' });
        let project = null;
        if (q.deal && q.deal.kickoff && q.deal.kickoff.projectId) {
          try { project = projectStatusFor(await readTeamDb(), q.deal.kickoff.projectId) || { removed: true }; } catch (e) { project = null; }
        }
        return json(res, 200, { quote: { ...q, status: effectiveStatus(q) }, project });
      }
      if (qs.has('team')) {
        // who can run a project: people with a manager or admin account in /team
        const db = await readTeamDb();
        const managers = (db.users || []).filter(u => u.active !== false && u.hash && isManager(u)).map(u => {
          const e = (db.employees || []).find(x => x.id === u.employeeId);
          return e && e.status !== 'inactive' ? { employeeId: e.id, name: e.name, role: u.role } : null;
        }).filter(Boolean);
        const people = (db.employees || []).filter(e => e.status !== 'inactive').length;
        return json(res, 200, { configured: (db.users || []).some(u => u.hash), managers, people });
      }
      const { blobs } = await list({ token: LEADS_TOKEN, prefix: Q, limit: 1000 });
      const quotes = [];
      for (const b of blobs) {
        const q = await read(b.pathname);
        if (q && q.id) quotes.push(summary(q));
      }
      quotes.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return json(res, 200, { quotes });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = await readBody(req);
    const action = body.action;

    /* public: a client sends back the scope they chose */
    if (action === 'request') {
      const slug = cleanSlug(body.slug);
      const rec = slug && await read(P + slug + '.json');
      if (!rec || !rec.published) return json(res, 404, { error: 'Proposal not found' });
      const p = rec.published;
      const c = body.contact || {};
      const contact = { name: clip(c.name, 120), email: clip(c.email, 200), phone: clip(c.phone, 60),
                        message: clip(c.message, 4000) };
      if (!contact.name) return json(res, 400, { error: 'Please add your name.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) return json(res, 400, { error: 'Please add a valid email.' });

      // rebuild the selection from the saved proposal; never trust client totals
      const raw = body.selection || {};
      const sel = defaultSelection(p);
      sel.goodwill = false;
      p.categories.forEach(cg => cg.items.forEach(i => {
        if (!i.locked) sel.items[i.id] = !!(raw.items && raw.items[i.id]);
        if (i.qtyEditable && raw.qty && raw.qty[i.id] != null) sel.qty[i.id] = clampQty(raw.qty[i.id]);
      }));
      (p.choices || []).forEach(g => {
        const want = raw.choices && raw.choices[g.id];
        if (g.canChange && g.options.some(o => o.id === want)) sel.choices[g.id] = want;
      });
      sel.goodwill = !!(p.goodwill.enabled && raw.goodwill);
      sel.currency = raw.currency === 'USD' && p.usd.enabled ? 'USD' : 'ETB';
      if (p.vat && p.vat.canToggle) sel.vat = !!raw.vat;
      const t = clientTotals(p, sel);
      const def = defaultSelection(p);
      const changed = JSON.stringify([sel.items, sel.qty, sel.choices]) !== JSON.stringify([def.items, def.qty, def.choices]) ||
                      sel.goodwill !== def.goodwill || sel.vat !== def.vat;

      const q = await read(Q + rec.id + '.json');
      if (!q) return json(res, 404, { error: 'Proposal not found' });
      q.requests = q.requests || [];
      if (q.requests.length >= MAX_REQUESTS) return json(res, 429, { error: 'Please contact us directly.' });
      const at = new Date().toISOString();
      const ref = 'PQ-' + Math.floor(1000 + Math.random() * 8999);
      const amount = (t.usd ? formatMoney(t.usdAmount, 'USD') + ' (' + formatMoney(t.etb) + ')' : formatMoney(t.etb)) +
        (t.vatOn ? ' incl. ' + t.vatPct + '% VAT' : p.vat ? ' (no VAT)' : '');
      const request = {
        ref, at, contact, selection: sel, changed,
        chosen: t.chosen, added: t.added, removed: t.removed, qtyChanged: t.qtyChanged,
        timeline: { label: t.timeline.label, days: t.days, pct: t.timeline.pct || 0 },
        choices: t.picks.map(x => ({ title: x.title, label: x.option.label, pct: x.pct })),
        goodwill: t.goodwillOn, currency: sel.currency, vat: t.vatOn,
        totals: { original: Math.round(t.original), goodwill: Math.round(t.goodwill),
                  usdDiscount: Math.round(t.usdDiscount), subtotal: Math.round(t.subtotal),
                  vat: Math.round(t.vat), vatPct: t.vatPct, etb: t.etb, usd: t.usdAmount },
        amount
      };
      q.requests.push(request);
      await tellTeam(d => notify(d, salesPeople(d), { kind: 'sales', emoji: changed ? '✍️' : '🎉', title: clientName(q) + (changed ? ' sent back their version' : ' accepted the proposal'),
        body: contact.name + (contact.message ? ': “' + clip(contact.message, 120) + '”' : '') + ' · next: the contract', href: '#/sales' }));
      q.status = changed ? 'client-modified' : 'accepted';
      q.updatedAt = at;
      await write(Q + q.id + '.json', q);

      // also kept as a lead record (leads/), as in the original site's admin
      const lines = [
        contact.message || '(no message)', '',
        'Phone / WhatsApp: ' + (contact.phone || '—'),
        'Proposal: https://' + (req.headers['x-forwarded-host'] || req.headers.host || '') + '/price/' + slug,
        'Quoted by ' + brand().name + ': ' + formatMoney(p.totalInclVat != null ? p.totalInclVat : p.total) + (p.vat && p.vat.on ? ' incl. VAT' : ''),
        'Client requested: ' + amount,
        'Added: ' + (t.added.join(', ') || '—'),
        'Removed: ' + (t.removed.join(', ') || '—'),
        'Quantities changed: ' + (t.qtyChanged.map(x => x.title + ' ' + x.from + ' → ' + x.to).join(', ') || '—'),
        ...t.picks.map(x => x.title + ': ' + x.option.label),
        'Goodwill discount: ' + (t.goodwillOn ? 'applied' : 'not applied'),
        'VAT: ' + (t.vatOn ? t.vatPct + '% · ' + formatMoney(t.vat) : 'not included'),
        'Currency: ' + sel.currency
      ];
      await write('leads/' + at.replace(/[:.]/g, '-') + '-' + ref + '.json', {
        ref, at, source: 'price-builder', needs: t.chosen,
        summary: 'Price proposal: ' + (p.project || p.company) + ' (' + (changed ? 'client changed the scope' : 'as quoted') + ')',
        timing: t.timeline.label + (t.days ? ' · ' + t.days + ' days' : ''),
        budget: amount, notes: lines.join('\n'),
        name: contact.name, email: contact.email, company: p.company || p.client, status: 'new'
      });
      return json(res, 200, { ok: true, ref });
    }

    /* everything below is for the agency's team */
    if (!requireAuth(req, res)) return;

    if (action === 'save') {
      const q = await saveDraft(body);
      return json(res, 200, { ok: true, quote: q });
    }

    if (action === 'generate') {
      const q = await saveDraft(body);
      const slug = await freeSlug(body.slug || q.slugWanted || (q.setup.company || q.setup.clientName || q.setup.project));
      const now = new Date().toISOString();
      const published = publishQuote(q, slug, now);
      if (!published.categories.length && !published.fixed) {
        return json(res, 400, { error: 'Add at least one deliverable before generating a link.' });
      }
      q.slug = slug;
      q.status = 'sent';
      q.generatedAt = now;
      q.updatedAt = now;
      q.published = published;
      q.originalTotals = (({ scope, factorAmt, timelineAmt, visibleCosts, hiddenCosts, adjustment, calculated, final }) =>
        ({ scope, factorAmt, timelineAmt, visibleCosts, hiddenCosts, adjustment, calculated, final }))(computeQuote(q));
      await write(P + slug + '.json', { id: q.id, published });
      await write(Q + q.id + '.json', q);
      return json(res, 200, { ok: true, quote: q, slug });
    }

    /* edit a quote the client already has, and republish it to the same link */
    if (action === 'update') {
      const id = cleanId(body.quote && body.quote.id);
      const stored = id && await read(Q + id + '.json');
      if (!stored) return json(res, 404, { error: 'Quote not found' });
      if (!stored.generatedAt) return json(res, 400, { error: 'This quote has not been sent yet.' });
      const now = new Date().toISOString();
      const q = { ...stored, ...editable(body.quote), id, updatedAt: now };
      // keep what the client saw before, so nothing is lost
      q.history = (stored.history || []).slice(-9).concat([{
        at: stored.republishedAt || stored.generatedAt, published: stored.published, totals: stored.originalTotals
      }]);
      let slug = stored.slug;
      const wanted = slugify(body.slug || q.slugWanted || slug);
      if (wanted && wanted !== slug) slug = await freeSlug(wanted);
      const published = publishQuote(q, slug, now);
      if (!published.categories.length && !published.fixed) {
        return json(res, 400, { error: 'Add at least one deliverable before updating the link.' });
      }
      if (slug !== stored.slug && stored.slug) await del(P + stored.slug + '.json', { token: LEADS_TOKEN });
      q.slug = slug;
      q.published = published;
      q.republishedAt = now;
      q.viewedAt = null;            // so you can see when they open the new version
      q.status = 'sent';
      q.originalTotals = (({ scope, factorAmt, timelineAmt, visibleCosts, hiddenCosts, adjustment, calculated, final }) =>
        ({ scope, factorAmt, timelineAmt, visibleCosts, hiddenCosts, adjustment, calculated, final }))(computeQuote(q));
      await write(P + slug + '.json', { id: q.id, published });
      await write(Q + q.id + '.json', q);
      return json(res, 200, { ok: true, quote: q, slug });
    }

    /* ----- after the client says yes: contract → invoices → kick-off ----- */
    if (['saveContract', 'contractStatus', 'createInvoice', 'updateInvoice', 'invoiceStatus', 'kickoff'].includes(action)) {
      const q = await read(Q + cleanId(body.id) + '.json');
      if (!q) return json(res, 404, { error: 'Quote not found' });
      if (!q.published) return json(res, 400, { error: 'Send the quote to the client first.' });
      const now = new Date().toISOString();
      const deal = q.deal = q.deal || { invoices: [] };
      deal.invoices = deal.invoices || [];
      const catalog = withDefaults((await read(CATALOG)) || {});
      let extra = {};

      if (action === 'saveContract') {
        const c0 = body.contract || {};
        const old = deal.contract;
        if (old && old.status === 'signed') fail('This contract is signed. Mark it as not signed first to change it.');
        const basis = basisOf(q, c0.basis || (old && old.basis));
        const amounts = agreement(q.published, basis.selection);
        const depositPct = Math.max(1, Math.min(100, Math.round(Number(c0.depositPct != null ? c0.depositPct : old ? old.depositPct : catalog.depositPct) || 50)));
        // invoices are cut from the contract, so its money can't change under them
        if (old && deal.invoices.some(i => i.status !== 'void') && (old.amounts.total !== amounts.total || old.depositPct !== depositPct)) {
          fail('Invoices already exist for this contract. Cancel them before changing the amount or the payment terms.');
        }
        const terms = (Array.isArray(c0.terms) ? c0.terms : (old && old.terms) || catalog.contractTerms || [])
          .slice(0, 40).map(t => ({ title: clip(t.title, 200), body: clip(t.body, 4000) })).filter(t => t.title || t.body);
        deal.contract = {
          number: (old && old.number) || await nextNumber('contract'),
          status: old ? old.status : 'draft',
          basis: basis.id, basisLabel: basis.label,
          date: cleanDate(c0.date) || (old && old.date) || today(),
          startDate: cleanDate(c0.startDate) || (old && old.startDate) || today(),
          depositPct,
          paymentDays: Math.max(0, Math.min(120, Math.round(Number(c0.paymentDays != null ? c0.paymentDays : old ? old.paymentDays : catalog.invoiceDueDays) || 7))),
          clientName: clip(c0.clientName != null ? c0.clientName : old ? old.clientName : (q.setup.company || q.setup.clientName), 200),
          clientRep: clip(c0.clientRep != null ? c0.clientRep : old ? old.clientRep : ((basis.request && basis.request.contact.name) || q.setup.clientName), 200),
          clientTitle: clip(c0.clientTitle != null ? c0.clientTitle : old ? old.clientTitle : '', 120),
          clientAddress: clip(c0.clientAddress != null ? c0.clientAddress : old ? old.clientAddress : '', 400),
          clientTin: clip(c0.clientTin != null ? c0.clientTin : old ? old.clientTin : '', 60),
          clientEmail: clip(c0.clientEmail != null ? c0.clientEmail : old ? old.clientEmail : ((basis.request && basis.request.contact.email) || ''), 200),
          clientPhone: clip(c0.clientPhone != null ? c0.clientPhone : old ? old.clientPhone : ((basis.request && basis.request.contact.phone) || ''), 60),
          notes: clip(c0.notes != null ? c0.notes : old ? old.notes : '', 4000),
          terms, amounts,
          signedAt: null,
          createdAt: (old && old.createdAt) || now, updatedAt: now
        };
      }

      if (action === 'contractStatus') {
        if (!deal.contract) fail('Make the contract first.');
        if (!CONTRACT_STATUSES.includes(body.status)) fail('Unknown status');
        deal.contract.status = body.status;
        deal.contract.signedAt = body.status === 'signed' ? (cleanDate(body.date) || today()) : null;
        if (body.status === 'signed') await tellTeam(d => notify(d, salesPeople(d), { kind: 'achievement', emoji: '🤝', title: 'Deal won: ' + clientName(q),
          body: (q.setup.project || 'The project') + ' contract is signed. Next: the invoice and the kick-off.', href: '#/sales' }));
        deal.contract.updatedAt = now;
        if (body.status === 'signed' && q.status !== 'accepted') q.status = 'accepted';
      }

      if (action === 'createInvoice') {
        const c = deal.contract || fail('Make the contract first.');
        // the balance step is whatever is left, so the invoices always add up to the contract
        const step = nextInvoice(c, deal.invoices) || fail('Every payment in the contract already has an invoice.');
        const date = cleanDate(body.date) || today();
        let lines = cleanLines(body.lines);
        if (!lines.length) lines = [{ text: invoiceLineText(step.kind, step.pct, q.setup.project, c.number), amount: step.subtotal }];
        const sum = lines.reduce((s, l) => s + l.amount, 0);
        const inv = {
          number: await nextNumber('invoice'), kind: step.kind, pct: step.pct, status: 'issued',
          date, dueDate: cleanDate(body.dueDate) || addDays(date, c.paymentDays || 7),
          currency: c.amounts.currency, rate: c.amounts.rate, vatOn: c.amounts.vatOn, vatPct: c.amounts.vatPct,
          lines, billTo: clip(body.billTo, 600), bank: body.bank != null ? clip(body.bank, 1200) : null,
          // untouched amounts keep the exact split; edited ones are added up again
          ...(Math.abs(sum - step.subtotal) < 0.005 ? { subtotal: step.subtotal, vat: step.vat, total: step.total }
            : lineTotals(lines, c.amounts.vatOn, c.amounts.vatPct, c.amounts.currency)),
          note: clip(body.note != null ? body.note : catalog.invoiceNote, 1000),
          contractNumber: c.number, createdAt: now, paidAt: null
        };
        deal.invoices.push(inv);
        extra = { invoice: inv.number };
      }

      if (action === 'updateInvoice') {
        const inv = deal.invoices.find(i => i.number === body.number) || fail('Invoice not found', 404);
        if (inv.status !== 'issued') fail(inv.status === 'paid' ? 'This invoice is marked paid. Mark it as not paid first to change it.' : 'A cancelled invoice cannot be changed.');
        const x = body.invoice || {};
        if (cleanDate(x.date)) inv.date = cleanDate(x.date);
        if (cleanDate(x.dueDate)) inv.dueDate = cleanDate(x.dueDate);
        if (x.note != null) inv.note = clip(x.note, 1000);
        if (x.billTo != null) inv.billTo = clip(x.billTo, 600);
        if (x.bank != null) inv.bank = clip(x.bank, 1200);
        if (Array.isArray(x.lines)) {
          const lines = cleanLines(x.lines);
          if (!lines.length) fail('An invoice needs at least one line.');
          const sum = lines.reduce((s, l) => s + l.amount, 0);
          if (Math.abs(sum - inv.subtotal) >= 0.005) Object.assign(inv, lineTotals(lines, inv.vatOn, inv.vatPct, inv.currency));
          inv.lines = lines;
        }
        inv.updatedAt = now;
      }

      if (action === 'invoiceStatus') {
        const inv = deal.invoices.find(i => i.number === body.number) || fail('Invoice not found', 404);
        if (!INVOICE_STATUSES.includes(body.status)) fail('Unknown status');
        inv.status = body.status;
        inv.paidAt = body.status === 'paid' ? (cleanDate(body.date) || today()) : null;
        inv.updatedAt = now;
      }

      if (action === 'kickoff') {
        const c = deal.contract || fail('Make the contract first.');
        if (!deal.invoices.some(i => i.status !== 'void')) fail('Create the invoice first.');
        const basis = basisOf(q, c.basis);
        const items = c.amounts.scope.map(x => ({ ...x }));
        const startDate = cleanDate(body.startDate) || contractStart(deal) || today();     // the contract's dates, not the day of kick-off
        const { result: project, db: teamDb, outbox } = await mutateTeam(async db => {
          if (!(db.users || []).some(u => u.hash)) fail('Set up the Team app (/team) before kicking off a project.');
          // a project that was deleted in Team can be kicked off again
          if (deal.kickoff && deal.kickoff.projectId && (db.projects || []).some(p => p.id === deal.kickoff.projectId)) fail('This project was already kicked off.');
          const mu = (db.users || []).find(u => u.employeeId === body.managerId && u.active !== false && isManager(u));
          if (!mu) fail('Choose a project manager who has a manager or admin account in Team.');
          const p = createProject(db, {
            quoteId: q.id, slug: q.slug, managerId: body.managerId, startDate,
            name: q.setup.project || q.setup.typeLabel || 'Project', client: c.clientName || q.setup.company || q.setup.clientName,
            days: c.amounts.timeline.days, timeline: c.amounts.timeline.label, contractNumber: c.number,
            amount: formatMoney(c.amounts.total, c.amounts.currency),
            note: clip(body.note, 2000) || (basis.request && basis.request.contact.message ? 'Client note: ' + basis.request.contact.message : ''),
            items
          }, 'Price Builder');
          notifyEmployee(db, body.managerId, { kind: 'project', emoji: '🚀', title: 'New project to review: ' + p.name,
            body: (p.plan || []).length + ' tasks are planned for ' + (p.client || 'the client') + '. Check who does what, then press Start.', href: '#/project/' + p.id });
          return { id: p.id, name: p.name, tasks: (p.plan || []).length };
        });
        deal.kickoff = { projectId: project.id, at: now, managerId: body.managerId, startDate, tasks: project.tasks };
        try { await sendPush(teamDb, outbox); } catch (e) { /* the project is created either way */ }
        extra = { projectId: project.id };
      }

      q.updatedAt = now;
      await write(Q + q.id + '.json', q);
      let project = null;
      if (deal.kickoff && deal.kickoff.projectId) {
        try { project = projectStatusFor(await readTeamDb(), deal.kickoff.projectId) || { removed: true }; } catch (e) { project = null; }
      }
      return json(res, 200, { ok: true, quote: { ...q, status: effectiveStatus(q) }, project, ...extra });
    }

    if (action === 'checkSlug') {
      const keep = cleanSlug(body.keep);
      const want = slugify(body.slug);
      if (keep && want === keep) return json(res, 200, { slug: keep });
      return json(res, 200, { slug: await freeSlug(body.slug) });
    }

    if (action === 'status') {
      const q = await read(Q + cleanId(body.id) + '.json');
      if (!q) return json(res, 404, { error: 'Quote not found' });
      if (!STATUSES.includes(body.status)) return json(res, 400, { error: 'Unknown status' });
      q.status = body.status;
      q.updatedAt = new Date().toISOString();
      await write(Q + q.id + '.json', q);
      return json(res, 200, { ok: true });
    }

    if (action === 'delete') {
      const q = await read(Q + cleanId(body.id) + '.json');
      if (!q) return json(res, 404, { error: 'Quote not found' });
      if (q.slug) await del(P + q.slug + '.json', { token: LEADS_TOKEN });
      await del(Q + q.id + '.json', { token: LEADS_TOKEN });
      return json(res, 200, { ok: true });
    }

    if (action === 'resetCatalog') {
      if (await read(CATALOG)) await del(CATALOG, { token: LEADS_TOKEN });
      return json(res, 200, { ok: true, catalog: withDefaults(null) });
    }

    if (action === 'saveCatalog') {
      const c = body.catalog;
      if (!c || typeof c !== 'object' || !Array.isArray(c.projectTypes)) return json(res, 400, { error: 'Bad price list' });
      // the company block belongs to Brand & region: save it there, not in the price list
      if (c.company && typeof c.company === 'object') {
        const patch = {};
        COMPANY_KEYS.forEach(k => { if (c.company[k] !== undefined) patch[k] = c.company[k]; });
        await saveBrand(patch);
      }
      delete c.company;
      delete c.homeCurrency;
      c.samplePrices = false;
      c.updatedAt = new Date().toISOString();
      await write(CATALOG, c);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Unknown action' });
  } catch (e) {
    const [status, error] = failure(e);
    return json(res, status, { error });
  }
}
