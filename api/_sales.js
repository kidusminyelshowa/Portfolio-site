/* Sales pipeline: every price proposal, where it stands, and what needs a
   follow-up. Read by the Team app (/team#/sales) straight from
   the Price Builder's storage, so both always show the same thing. */
import { readJson, writeJson, list, LEADS_TOKEN } from './_lib.js';
import { computeQuote, num } from '../public/price/engine.js';
import { projectProgress } from './_team-projects.js';

export const QUOTES = 'quotes/';
export const readQuote = id => readJson(QUOTES + String(id || '').replace(/[^a-z0-9]/gi, '') + '.json', LEADS_TOKEN, null, 'private');
export const writeQuote = q => writeJson(QUOTES + q.id + '.json', LEADS_TOKEN, q, 'private');

export const SALES_DEFAULTS = { owner: null, sentDays: 3, openedDays: 4, repliedDays: 1, contractDays: 3, expiringDays: 5 };

/* who sales follow-ups go to and when they are due: the sales owner picked under
   "Follow-up rules", or else the first manager */
export function salesRules(db) {
  const r = { ...SALES_DEFAULTS, ...((db.settings && db.settings.sales) || {}) };
  const live = id => (db.employees || []).some(e => e.id === id && e.status !== 'inactive');
  if (!r.owner || !live(r.owner)) {
    const emps = (db.employees || []).filter(e => e.status !== 'inactive');
    const mgr = emps.find(e => (db.users || []).some(u => u.employeeId === e.id && u.role === 'manager' && u.active !== false));
    r.owner = (mgr || emps[0] || {}).id || null;
  }
  return r;
}

export function effectiveStatus(q) {
  const exp = q.published && Date.parse(q.published.expiresAt);
  if (exp && exp < Date.now() && (q.status === 'sent' || q.status === 'viewed')) return 'expired';
  return q.status || 'draft';
}

/* where a deal is after the yes (Price Builder dashboard) */
export function dealStage(q) {
  const d = q.deal || {};
  if (d.kickoff) return 'kicked-off';
  const inv = (d.invoices || []).filter(i => i.status !== 'void');
  if (inv.some(i => i.status === 'paid')) return 'paid';
  if (inv.length) return 'invoiced';
  if (d.contract) return d.contract.status === 'signed' ? 'signed' : 'contract';
  return null;
}

export async function allQuotes() {
  const { blobs } = await list({ token: LEADS_TOKEN, prefix: QUOTES, limit: 1000 });
  const out = [];
  for (let i = 0; i < blobs.length; i += 8) {
    const batch = await Promise.all(blobs.slice(i, i + 8).map(b => readJson(b.pathname, LEADS_TOKEN, null, 'private').catch(() => null)));
    batch.forEach(q => { if (q && q.id) out.push(q); });
  }
  return out;
}

const DAY = 86400000;
const days = (from, now) => from ? Math.floor((now - Date.parse(from)) / DAY) : 0;
const when = n => n === 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago';
const toEtb = (amount, currency, rate) => currency === 'USD' ? num(amount) * (num(rate) || 0) : num(amount);

/* one proposal as the sales dashboard sees it (no internal costs or notes) */
export function salesRow(q, db) {
  const s = q.setup || {}, p = q.published || null, d = q.deal || {};
  const status = effectiveStatus(q);
  const reqs = q.requests || [];
  const last = reqs[reqs.length - 1] || null;
  const c = d.contract || null;
  const invoices = (d.invoices || []).map(i => ({ number: i.number, kind: i.kind, pct: i.pct, total: i.total, currency: i.currency, status: i.status,
    date: i.date, dueDate: i.dueDate, paidAt: i.paidAt, totalEtb: Math.round(toEtb(i.total, i.currency, i.rate)) }));
  const live = invoices.filter(i => i.status !== 'void');
  const proj = d.kickoff && db ? (db.projects || []).find(x => x.id === d.kickoff.projectId) : null;
  const quoted = p ? num(p.totalInclVat != null ? p.totalInclVat : p.total) : computeQuote(q).finalWithVat;
  const value = Math.round(c ? num(c.amounts.totalEtb) : last ? num(last.totals.etb) : quoted);

  const reached = {
    sent: !!q.generatedAt,
    opened: !!(q.viewedAt || reqs.length || c),
    replied: !!(reqs.length || c),
    contract: !!c,
    signed: !!(c && c.status === 'signed') || live.some(i => i.status === 'paid') || !!d.kickoff,
    paid: live.some(i => i.status === 'paid') || !!d.kickoff,
    production: !!d.kickoff && (!db || !!proj),          // a project deleted in Team waits to be kicked off again
    delivered: !!(proj && proj.status === 'done')
  };
  let stage = !q.generatedAt ? 'draft'
    : reached.delivered ? 'delivered' : reached.production ? 'production'
    : reached.paid ? 'paid' : live.length ? 'invoiced' : reached.contract ? 'contract'
    : reached.replied ? 'replied' : reached.opened ? 'opened' : 'sent';
  if (status === 'lost') stage = 'lost';
  else if (status === 'expired' && !reached.replied) stage = 'expired';
  const since = { draft: q.createdAt, sent: q.republishedAt || q.generatedAt, opened: q.viewedAt, replied: last && last.at,
    contract: c && (c.createdAt || c.date), invoiced: live.length && live[live.length - 1].date, paid: live.filter(i => i.paidAt).map(i => i.paidAt).sort().pop(),
    production: d.kickoff && d.kickoff.at, delivered: proj && proj.completedAt, lost: q.lostAt, expired: p && p.expiresAt }[stage] || q.updatedAt;

  const contact = last ? last.contact : { name: s.clientName || '', email: '', phone: '' };
  return {
    id: q.id, slug: q.slug || null, client: s.company || s.clientName || 'Untitled', contact: { name: contact.name || '', email: contact.email || '', phone: contact.phone || '' },
    projectName: s.project || '', leadId: s.leadId || null, type: s.typeLabel || '', createdAt: q.createdAt, sentAt: q.generatedAt || null, updatedSentAt: q.republishedAt || null,
    viewedAt: q.viewedAt || null, expiresAt: p ? p.expiresAt : null, status, lostReason: q.lostReason || '', lostAt: q.lostAt || null,
    value, quoted: Math.round(quoted), currency: (c && c.amounts.currency) || (last && last.currency) || 'ETB',
    requests: reqs.slice(-5).map(r => ({ ref: r.ref, at: r.at, amount: r.amount, etb: r.totals.etb, changed: r.changed, message: r.contact.message || '' })),
    requestCount: reqs.length,
    contract: c ? { number: c.number, status: c.status, date: c.date, signedAt: c.signedAt, totalEtb: Math.round(num(c.amounts.totalEtb)), depositPct: c.depositPct } : null,
    invoices,
    paidEtb: invoices.filter(i => i.status === 'paid').reduce((t, i) => t + i.totalEtb, 0),
    outstandingEtb: live.filter(i => i.status === 'issued').reduce((t, i) => t + i.totalEtb, 0),
    // the Team project once kicked off (the proposal's own project name is projectName)
    project: proj ? { id: proj.id, name: proj.name, status: proj.status, progress: projectProgress(db, proj), completedAt: proj.completedAt || null } : null,
    stage, stageSince: since || null, reached
  };
}

/* does this proposal need someone to get in touch, and why */
export function followupFor(r, rules, nowMs) {
  const s = { ...SALES_DEFAULTS, ...(rules || {}) };
  const now = nowMs || Date.now();
  const overdue = r.invoices.filter(i => i.status === 'issued' && i.dueDate && Date.parse(i.dueDate + 'T23:59:59Z') < now);
  if (overdue.length) {
    const i = overdue[0], n = days(i.dueDate, now);
    return { reason: 'Invoice ' + i.number + ' is ' + n + ' day' + (n === 1 ? '' : 's') + ' overdue', level: 'warn', kind: 'payment' };
  }
  const left = r.expiresAt ? Math.ceil((Date.parse(r.expiresAt) - now) / DAY) : null;
  switch (r.stage) {
    case 'sent': {
      if (left != null && left <= s.expiringDays) return { reason: 'Expires in ' + left + ' day' + (left === 1 ? '' : 's') + ' and still not opened', level: 'warn', kind: 'proposal' };
      const n = days(r.updatedSentAt || r.sentAt, now);
      return n >= s.sentDays ? { reason: 'Sent ' + when(n) + ', not opened yet', level: 'due', kind: 'proposal' } : null;
    }
    case 'opened': {
      if (left != null && left <= s.expiringDays) return { reason: 'Opened, no reply, and it expires in ' + left + ' day' + (left === 1 ? '' : 's'), level: 'warn', kind: 'proposal' };
      const n = days(r.viewedAt, now);
      return n >= s.openedDays ? { reason: 'Opened ' + when(n) + ', no reply yet', level: 'due', kind: 'proposal' } : null;
    }
    case 'replied': {
      const n = days(r.stageSince, now);
      return n >= s.repliedDays ? { reason: 'Client replied ' + when(n) + ': send the contract', level: 'due', kind: 'contract' } : null;
    }
    case 'contract': {
      const n = days(r.stageSince, now);
      return n >= s.contractDays && r.contract.status !== 'signed' ? { reason: 'Contract not signed after ' + n + ' days', level: 'due', kind: 'contract' } : null;
    }
    case 'paid': return { reason: 'Paid: ready to kick off with the team', level: 'info', kind: 'kickoff' };
    case 'expired': return { reason: 'Expired without a reply: renew it or close it', level: 'warn', kind: 'proposal' };
    default: return null;
  }
}
