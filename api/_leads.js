/* Sales leads: companies to contact before there is a proposal. Leads are made
   in a Claude chat (a sheet or CSV), imported into Team → Sales pipeline, and
   worked by the sales owner (the first manager by default): call, message, meet, log how it
   went, and turn it into a proposal in the Price Builder. Stored in the team
   database (db.salesLeads) so tasks, people and the safe-save in mutate() apply. */
import { uid, clip } from './_team-lib.js';

export const LEAD_STAGES = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost'];
export const LEAD_ACTIVITY = ['call', 'message', 'email', 'meeting', 'visit', 'note'];
export const LEAD_OUTCOMES = ['no_answer', 'left_message', 'talked', 'interested', 'meeting_set', 'wants_proposal', 'not_now', 'not_interested', 'wrong_contact'];
export const LEAD_PRIORITIES = ['hot', 'warm', 'cold'];

/* every field a lead can carry, with its maximum length */
const FIELDS = {
  company: 160, contactName: 120, role: 120, phone: 60, email: 160, whatsapp: 60, telegram: 80, instagram: 200, linkedin: 300,
  website: 300, sector: 120, size: 60, city: 80, source: 200, need: 2000, service: 300, channel: 20,
  firstMessage: 3000, emailSubject: 300, emailBody: 5000, callScript: 4000, notes: 4000, lostReason: 300
};

const norm = s => String(s || '').toLowerCase().replace(/\b(plc|p\.?l\.?c|ltd|llc|share company|s\.c|sc|inc|trading|enterprise)\b/g, '').replace(/[^a-z0-9]/g, '');
const phoneKey = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : ''; };
const cleanDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const addDays = (n, from) => { const d = from ? new Date(from + 'T00:00:00Z') : new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* copy the allowed fields from an incoming lead onto `into` */
export function applyLeadFields(into, src) {
  const s = src || {};
  for (const [k, n] of Object.entries(FIELDS)) if (s[k] !== undefined) into[k] = clip(s[k], n).trim();
  if (s.priority !== undefined) into.priority = LEAD_PRIORITIES.includes(String(s.priority).toLowerCase()) ? String(s.priority).toLowerCase() : 'warm';
  if (s.nextFollowUp !== undefined) into.nextFollowUp = cleanDate(s.nextFollowUp) || null;
  if (into.email) into.email = into.email.toLowerCase();
  return into;
}

/* is this company (or phone, or email) already a lead? */
export function findDuplicate(leads, l, exceptId) {
  const c = norm(l.company), p = phoneKey(l.phone || l.whatsapp), e = String(l.email || '').toLowerCase();
  return (leads || []).find(x => x.id !== exceptId && ((c && norm(x.company) === c) || (p && phoneKey(x.phone || x.whatsapp) === p) || (e && String(x.email || '').toLowerCase() === e))) || null;
}

export function newLead(src, user, ownerId, now) {
  const l = applyLeadFields({ id: uid('l'), stage: 'new', priority: 'warm', createdAt: now, createdBy: user.id, createdByName: user.name,
    ownerId: ownerId || null, activity: [], nextFollowUp: null }, src);
  if (!l.company && !l.contactName) return null;
  if (!l.company) l.company = l.contactName;
  if (!l.nextFollowUp) l.nextFollowUp = addDays(l.priority === 'hot' ? 0 : l.priority === 'cold' ? 3 : 1);
  return l;
}

/* add many leads at once (from a Claude sheet); duplicates are skipped and reported */
export function importLeads(db, rows, user, ownerId, source, now) {
  db.salesLeads = db.salesLeads || [];
  const added = [], skipped = [];
  (rows || []).slice(0, 500).forEach(r => {
    const l = newLead({ source, ...r }, user, ownerId, now);
    if (!l) { skipped.push({ company: '(empty row)', reason: 'no company or contact name' }); return; }
    const dup = findDuplicate(db.salesLeads.concat(added), l);
    if (dup) { skipped.push({ company: l.company, reason: 'already a lead: ' + dup.company }); return; }
    added.push(l);
  });
  db.salesLeads.push(...added);
  return { added: added.length, skipped };
}

/* what a logged call, message or meeting does to the lead */
const ORDER = LEAD_STAGES.indexOf.bind(LEAD_STAGES);
export function logLeadActivity(lead, a, user, now) {
  const kind = LEAD_ACTIVITY.includes(a.kind) ? a.kind : 'note';
  const outcome = LEAD_OUTCOMES.includes(a.outcome) ? a.outcome : '';
  lead.activity = lead.activity || [];
  lead.activity.push({ id: uid('a'), at: now, by: user.id, byName: user.name, kind, outcome, note: clip(a.note, 2000) });
  if (lead.activity.length > 200) lead.activity = lead.activity.slice(-200);
  if (kind !== 'note') lead.lastContactAt = now;
  const raise = s => { if (!['won', 'lost'].includes(lead.stage) && ORDER(s) > ORDER(lead.stage)) lead.stage = s; };
  if (kind !== 'note') raise('contacted');
  if (['talked', 'interested'].includes(outcome)) raise('replied');
  if (outcome === 'meeting_set' || kind === 'meeting' || kind === 'visit') raise('meeting');
  if (outcome === 'wants_proposal') raise('proposal');
  if (outcome === 'not_interested') { lead.stage = 'lost'; lead.lostReason = lead.lostReason || clip(a.note, 300) || 'Not interested'; }
  // the next follow-up: the date picked, or a sensible default from the outcome
  const picked = cleanDate(a.nextAt);
  if (picked) lead.nextFollowUp = picked;
  else if (['won', 'lost'].includes(lead.stage)) lead.nextFollowUp = null;
  else if (kind !== 'note') lead.nextFollowUp = addDays(outcome === 'no_answer' || outcome === 'left_message' ? 2 : outcome === 'not_now' ? 30 : 4, now.slice(0, 10));
  return lead;
}

/* who sees which leads: managers and the founder all of them, anyone else the ones they own */
export function visibleLeads(db, user, isManagerFn) {
  const all = db.salesLeads || [];
  return isManagerFn(user) ? all : all.filter(l => l.ownerId && l.ownerId === user.employeeId);
}
