/* Price Builder: after the client says yes.
   Contract → invoice(s) → kick-off. Shared by the builder (browser, PDFs) and
   api/quotes.js, so the amounts on the contract, the invoices and the server
   always agree.

   The contract freezes what was agreed (the client's request, or the quote as
   sent): the scope, delivery pace and the amounts in the agreed currency.
   Invoices are a % of that total; the last one is always "whatever is left",
   so rounding never leaves a few coins unbilled. */
import { clientTotals, defaultSelection, isOn, qtyOf, formatMoney, num, round } from './engine.js';

export const CONTRACT_STATUSES = ['draft', 'sent', 'signed'];
export const CONTRACT_LABELS = { draft: 'Draft', sent: 'Sent to client', signed: 'Signed' };
export const INVOICE_STATUSES = ['issued', 'paid', 'void'];
export const INVOICE_LABELS = { issued: 'Waiting for payment', paid: 'Paid', void: 'Cancelled' };
export const KIND_LABELS = { deposit: 'Deposit', balance: 'Balance', full: 'Full payment' };

/* the version the client agreed to: one of their requests, or the quote as sent */
export function basisOf(q, basis) {
  const p = q.published;
  const reqs = q.requests || [];
  const want = basis || (reqs.length ? 'request:' + reqs[reqs.length - 1].ref : 'quote');
  const ref = want.startsWith('request:') ? want.slice(8) : null;
  const r = ref ? reqs.find(x => x.ref === ref) : null;
  return r ? { id: 'request:' + r.ref, label: 'Client request ' + r.ref, request: r, selection: r.selection }
           : { id: 'quote', label: 'The quote as sent', request: null, selection: defaultSelection(p) };
}

/* scope + money as agreed, in the agreed currency */
export function agreement(p, sel) {
  const t = clientTotals(p, sel);
  const scope = [];
  p.categories.forEach(c => c.items.forEach(it => {
    if (!isOn(it, sel)) return;
    scope.push({ category: c.title, title: it.title, desc: it.desc || '', qty: qtyOf(it, sel), unit: it.unit || '' });
  }));
  (p.costs || []).forEach(c => scope.push({ category: 'Costs included', title: c.title, desc: '', qty: 1, unit: '' }));
  const usd = !!t.usd;
  const rate = num(p.usd && p.usd.rate);
  const total = usd ? round(t.usdAmount, 2) : t.etb;
  const subtotal = usd ? round(t.subtotal / rate, 2) : round(t.subtotal);
  return {
    currency: usd ? 'USD' : 'ETB', rate: usd ? rate : null,
    subtotal, vatOn: t.vatOn, vatPct: t.vatOn ? t.vatPct : 0,
    vat: round(total - subtotal, usd ? 2 : 0), total,
    totalEtb: t.etb,
    scope,
    choices: t.picks.map(x => ({ id: x.id, title: x.title, label: x.option.label })),
    timeline: { label: t.timeline.label || '', days: t.days }
  };
}

export const money = (n, currency) => formatMoney(n, currency || 'ETB');

/* the payment schedule from the deposit % */
export function paymentPlan(amounts, depositPct) {
  const pct = Math.max(1, Math.min(100, Math.round(num(depositPct) || 100)));
  const usd = amounts.currency === 'USD';
  const r = n => round(n, usd ? 2 : 0);
  if (pct >= 100) return [{ kind: 'full', pct: 100, subtotal: amounts.subtotal, vat: amounts.vat, total: amounts.total }];
  const dep = { kind: 'deposit', pct, subtotal: r(amounts.subtotal * pct / 100), vat: r(amounts.vat * pct / 100) };
  dep.total = r(dep.subtotal + dep.vat);
  const bal = { kind: 'balance', pct: 100 - pct, subtotal: r(amounts.subtotal - dep.subtotal), vat: r(amounts.vat - dep.vat) };
  bal.total = r(amounts.total - dep.total);
  return [dep, bal];
}

/* what the next invoice should be, given the ones already made (cancelled ones don't count).
   The balance is whatever is left, so edited invoices still add up to the contract. */
export function nextInvoice(contract, invoices) {
  const live = (invoices || []).filter(i => i.status !== 'void');
  const plan = paymentPlan(contract.amounts, contract.depositPct);
  const step = plan.find(s => !live.some(i => i.kind === s.kind));
  if (!step || step.kind !== 'balance') return step || null;
  const a = contract.amounts, r = n => round(n, 2);
  const prev = live.reduce((t, i) => ({ subtotal: t.subtotal + num(i.subtotal), vat: t.vat + num(i.vat), total: t.total + num(i.total) }), { subtotal: 0, vat: 0, total: 0 });
  return { ...step, subtotal: r(a.subtotal - prev.subtotal), vat: r(a.vat - prev.vat), total: r(a.total - prev.total) };
}

/* invoice lines: what the client is billed for, before VAT */
export function invoiceLineText(kind, pct, project, contractNumber) {
  const what = kind === 'full' ? 'Full payment' : KIND_LABELS[kind] + ' (' + pct + '% of the agreed fee)';
  return what + ' for ' + (project || 'the project') + ', as set out in agreement ' + contractNumber + '.';
}
export function cleanLines(lines) {
  return (Array.isArray(lines) ? lines : []).slice(0, 30)
    .map(l => ({ text: String(l && l.text || '').slice(0, 400), amount: round(num(l && l.amount), 2) }))
    .filter(l => l.text.trim() || l.amount);
}
export function lineTotals(lines, vatOn, vatPct, currency) {
  const d = currency === 'USD' ? 2 : 0;
  const subtotal = round(lines.reduce((s, l) => s + num(l.amount), 0), d);
  const vat = vatOn ? round(subtotal * num(vatPct) / 100, d) : 0;
  return { subtotal, vat, total: round(subtotal + vat, d) };
}

export function paidSoFar(invoices, currency) {
  const usd = currency === 'USD';
  return round((invoices || []).filter(i => i.status === 'paid').reduce((s, i) => s + num(i.total), 0), usd ? 2 : 0);
}

/* when the work starts, as the contract says: on its start date, or when the first payment came in if that is later */
export function contractStart(deal) {
  const c = (deal && deal.contract) || {};
  const paid = ((deal && deal.invoices) || []).filter(i => i.status === 'paid' && i.paidAt).map(i => String(i.paidAt).slice(0, 10)).sort()[0];
  return [c.startDate, paid].filter(Boolean).sort().pop() || '';
}
const dateLong = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';
export { dateLong };

/* the words that fill {{…}} in the contract clauses */
export function termContext(q, contract, company) {
  const s = q.setup || {};
  const a = contract.amounts;
  const plan = paymentPlan(a, contract.depositPct);
  const m = n => money(n, a.currency);
  const choice = id => ((a.choices || []).find(c => c.id === id) || {}).label || '';
  const dep = plan[0], bal = plan[1];
  const schedule = plan.length === 1
    ? 'The full amount (' + m(a.total) + ') is due on signing.'
    : dep.pct + '% (' + m(dep.total) + ') is due on signing, and the remaining ' + bal.pct + '% (' + m(bal.total) + ') is due on delivery of the final work.';
  return {
    studio: (company && company.name) || 'the studio',
    client: contract.clientName || s.company || s.clientName || 'the client',
    project: s.project || s.typeLabel || 'the project',
    total: m(a.total) + (a.vatOn ? ' including ' + a.vatPct + '% VAT' : ''),
    deposit: m(dep.total), depositPct: dep.pct + '%',
    balance: bal ? m(bal.total) : m(0), balancePct: bal ? bal.pct + '%' : '0%',
    paymentSchedule: schedule,
    paymentDays: String(num(contract.paymentDays) || 7),
    startDate: dateLong(contract.startDate),
    days: String(a.timeline.days || '—'),
    timeline: (a.timeline.label || 'standard') + ' delivery',
    revisions: (choice('revisions') || 'the agreed revision rounds').toLowerCase(),
    team: choice('team') || 'the ' + ((company && company.name) || 'studio') + ' team',
    country: (company && company.country) || 'the country where the studio is registered',
    city: (company && company.city) || 'the city where the studio is registered'
  };
}

export function fillTerms(text, ctx) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (all, k) => (ctx[k] != null ? ctx[k] : all));
}
