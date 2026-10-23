/* Team Growth System — storage, sessions, permissions and calculations.
   Everything lives in one private JSON document (team/db.json) in the
   private store (LEADS_BLOB_TOKEN, or the local data folder). Writes go through `mutate()`, which re-reads and
   retries if someone else saved in between, so two people editing at the same
   time cannot silently overwrite each other. */
import crypto from 'node:crypto';
import { readJsonMeta, writeJson, isWriteConflict, LEADS_TOKEN, hashPassword, verifyPassword } from './_lib.js';
import { DEFAULT_SETTINGS, allLevels, findLevel, nextLevel, levelSkills, isPartner, PARTNER_DEPT } from './_team-config.js';

export const DB_PATH = 'team/db.json';
const SECRET = process.env.SESSION_SECRET || '';
const COOKIE = 'gz_team';

export const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const clip = (v, n) => String(v == null ? '' : v).slice(0, n || 2000);
export const uid = p => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const today = () => new Date().toISOString().slice(0, 10);
export const monthOf = d => String(d || new Date().toISOString()).slice(0, 7);
/* The review year starts on the same day as the leave year (Settings → Leave; the
   Ethiopia preset uses 11 September and the International one 1 January).
   With 11 September: Q1 11 Sep–10 Dec, Q2 11 Dec–10 Mar, Q3 11 Mar–10 Jun, Q4 11 Jun–10 Sep.
   A quarter id looks like "Y2026-Q1" (the review year that starts in that year).
   Monthly reviews stay calendar months; a month belongs to the quarter it mostly
   falls in (with 11 September: Sep, Oct, Nov → Q1 and so on). */
let YEAR_START_MONTH = 9, YEAR_START_DAY = 11;
export function setYearStart(month, day) {
  const m = Math.round(Number(month)), d = Math.round(Number(day));
  if (m >= 1 && m <= 12) YEAR_START_MONTH = m;
  if (d >= 1 && d <= 28) YEAR_START_DAY = d;
}
const pad = n => String(n).padStart(2, '0');
export function quarterOf(dateish) {
  const raw = dateish == null ? new Date().toISOString() : (dateish instanceof Date ? dateish.toISOString() : String(dateish));
  let y = Number(raw.slice(0, 4)), m = Number(raw.slice(5, 7));
  const day = raw.length === 7 ? 31 : Number(raw.slice(8, 10)) || 1;   // a bare month counts from its 11th
  if (raw.length !== 7 && day < YEAR_START_DAY) { m -= 1; if (m < 1) { m = 12; y -= 1; } }
  const offset = (m - YEAR_START_MONTH + 12) % 12;
  const startYear = m >= YEAR_START_MONTH ? y : y - 1;
  return 'Y' + startYear + '-Q' + (Math.floor(offset / 3) + 1);
}
function parseQuarter(q) {
  const hit = /^Y(\d{4})-Q([1-4])$/.exec(String(q || ''));
  return hit ? { y: Number(hit[1]), n: Number(hit[2]) } : null;
}
export function quarterMonths(q) {
  const p = parseQuarter(q) || parseQuarter(quarterOf());
  return [0, 1, 2].map(i => {
    const idx = YEAR_START_MONTH - 1 + (p.n - 1) * 3 + i;
    return (p.y + Math.floor(idx / 12)) + '-' + pad(idx % 12 + 1);
  });
}
export function quarterRange(q) {
  const p = parseQuarter(q) || parseQuarter(quarterOf());
  const start = new Date(Date.UTC(p.y, YEAR_START_MONTH - 1 + (p.n - 1) * 3, YEAR_START_DAY));
  const end = new Date(Date.UTC(p.y, YEAR_START_MONTH - 1 + p.n * 3, YEAR_START_DAY - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
export function previousQuarter(q) {
  const p = parseQuarter(q) || parseQuarter(quarterOf());
  return p.n === 1 ? 'Y' + (p.y - 1) + '-Q4' : 'Y' + p.y + '-Q' + (p.n - 1);
}
export function nextQuarter(q) {
  const p = parseQuarter(q) || parseQuarter(quarterOf());
  return p.n === 4 ? 'Y' + (p.y + 1) + '-Q1' : 'Y' + p.y + '-Q' + (p.n + 1);
}
export function quarterInfo(q) {
  const id = q || quarterOf(), p = parseQuarter(id);
  const calendar = YEAR_START_MONTH === 1 && YEAR_START_DAY === 1;
  return { id, label: 'Q' + p.n + ' ' + p.y + (calendar ? '' : '/' + String(p.y + 1).slice(2)), ...quarterRange(id),
    months: quarterMonths(id), previous: previousQuarter(id), next: nextQuarter(id) };
}

export function emptyDb() {
  return {
    v: 1, version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    users: [], employees: [], employeeSkills: [], goals: [], milestones: [],
    reviews: [], quarterlies: [], promotions: [], notes: [], leave: [], tasks: [], projects: [], audit: [],
    notifications: [], achievements: [], broadcasts: [], pushSubs: [], music: { tracks: [], spotify: '' },
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  };
}

function prepare(db) {
  if (!db) { const fresh = emptyDb(); setYearStart(fresh.settings.leave.yearStartMonth, fresh.settings.leave.yearStartDay); return fresh; }
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };   // new settings appear in old installs
  const l = db.settings.leave || {};
  setYearStart(l.yearStartMonth, l.yearStartDay);
  return db;
}

export async function readDb() {
  return prepare((await readJsonMeta(DB_PATH, LEADS_TOKEN, 'private')).data);
}

/* read → change → save. The save only goes through if nobody else saved in
   between (etag check); otherwise it re-reads and applies the change again, so
   two people editing at the same time cannot overwrite each other.
   Returns the document we wrote, so the caller answers from that copy. */
export async function mutate(fn) {
  for (let attempt = 1; ; attempt++) {
    const { data, etag } = await readJsonMeta(DB_PATH, LEADS_TOKEN, 'private', true);
    const db = prepare(data);
    const result = await fn(db);
    if (result && result.nothingChanged) return { result, db, outbox: [] };   // e.g. an hourly check that found nothing to do
    const outbox = db._outbox || [];          // pushes to send once the save went through
    delete db._outbox;
    db.version = (db.version || 0) + 1;
    db.updatedAt = new Date().toISOString();
    // safety net: if the conditional save keeps being refused, save plainly (the read above is fresh anyway)
    const safe = etag && attempt <= 4;
    try {
      await writeJson(DB_PATH, LEADS_TOKEN, db, 'private', safe ? { ifMatch: etag } : null);
      return { result, db, outbox };
    } catch (e) {
      if (!isWriteConflict(e) || !safe) throw e;
      if (attempt >= 3) console.warn('team db: conditional save refused ' + attempt + ' times');
      await new Promise(r => setTimeout(r, 80 * attempt + Math.random() * 120));
    }
  }
}

export function log(db, userId, action, detail) {
  db.audit = db.audit || [];
  db.audit.push({ at: new Date().toISOString(), by: userId || null, action, detail: detail || '' });
  if (db.audit.length > 3000) db.audit = db.audit.slice(-2000);
}

/* ---------- accounts and sessions ---------- */
export { hashPassword, verifyPassword };
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');

export function makeToken(userId, hours) {
  const body = userId + '|' + (Date.now() + (hours || 24 * 14) * 3600 * 1000);
  return Buffer.from(body).toString('base64url') + '.' + sign(body);
}
export function readToken(token) {
  if (!token || !SECRET) return null;
  const i = String(token).lastIndexOf('.');
  if (i < 0) return null;
  let body;
  try { body = Buffer.from(token.slice(0, i), 'base64url').toString('utf8'); } catch (e) { return null; }
  const sig = token.slice(i + 1), expect = sign(body);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const [userId, exp] = body.split('|');
  if (!userId || Number(exp) < Date.now()) return null;
  return userId;
}
export function setCookie(res, token, maxAgeSeconds) {
  res.setHeader('Set-Cookie', [COOKIE + '=' + encodeURIComponent(token || ''), 'Path=/', 'HttpOnly',
    'SameSite=Lax', 'Secure', 'Max-Age=' + (maxAgeSeconds === 0 ? 0 : (maxAgeSeconds || 60 * 60 * 24 * 14))].join('; '));
}
export function cookieOf(req) {
  const raw = req.headers.cookie || '';
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : '';
}
export function currentUser(db, req) {
  const id = readToken(cookieOf(req));
  if (!id) return null;
  const u = (db.users || []).find(x => x.id === id && x.active !== false);
  return u || null;
}

/* ---------- permissions ---------- */
export const isAdmin = u => !!u && u.role === 'admin';
export const isManager = u => !!u && (u.role === 'admin' || u.role === 'manager');

export function directReports(db, employeeId) {
  return (db.employees || []).filter(e => e.managerId === employeeId);
}
/* everyone below someone in the reporting tree */
export function teamOf(db, employeeId) {
  const out = [], seen = new Set();
  const walk = id => directReports(db, id).forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); walk(e.id); } });
  walk(employeeId);
  return out;
}
export function canSee(db, user, employeeId) {
  if (isAdmin(user)) return true;
  if (!user) return false;
  if (user.employeeId === employeeId) return true;
  if (user.role === 'manager') return teamOf(db, user.employeeId).some(e => e.id === employeeId);
  return false;
}
export function canManage(db, user, employeeId) {
  if (isAdmin(user)) return true;
  if (!user || user.role !== 'manager') return false;
  return teamOf(db, user.employeeId).some(e => e.id === employeeId);
}
export function visibleEmployees(db, user) {
  if (isAdmin(user)) return db.employees || [];
  if (!user) return [];
  const mine = (db.employees || []).filter(e => e.id === user.employeeId);
  return user.role === 'manager' ? [...mine, ...teamOf(db, user.employeeId)] : mine;
}

/* ---------- calculations ---------- */
export function reviewScore(settings, scores) {
  const cats = settings.universal || DEFAULT_SETTINGS.universal;
  let total = 0, weight = 0;
  cats.forEach(c => {
    const v = num(scores && scores[c.id]);
    if (v > 0) { total += v * c.weight; weight += c.weight; }
  });
  return weight ? Math.round((total / weight) * 100) / 100 : 0;
}

export function goalProgress(goal) {
  if (goal.progressMode === 'metric' && num(goal.target) > 0) {
    return Math.max(0, Math.min(100, Math.round(num(goal.current) / num(goal.target) * 100)));
  }
  return Math.max(0, Math.min(100, Math.round(num(goal.progress))));
}

/* Review sign-off: draft → awaiting_approval → approved (the employee can see it)
   → optionally acknowledged by the employee. Only approved reviews count. */
export const REVIEW_SENT = ['awaiting_approval', 'approved'];
export function approvedReviews(db, employeeId) {
  return (db.reviews || [])
    .filter(r => r.employeeId === employeeId && r.status === 'approved')
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));
}
/* a manager's (or admin's) own review is written and approved by the founder alone */
export function founderOnly(db, employeeId) {
  return (db.users || []).some(u => u.employeeId === employeeId && u.active !== false && (u.role === 'manager' || u.role === 'admin'));
}

export function performanceOf(db, employeeId) {
  const list = approvedReviews(db, employeeId);
  const recent = list.slice(-6);
  const last = recent[recent.length - 1] || null;
  const avg3 = recent.slice(-3).reduce((s, r, _, a) => s + num(r.overall) / a.length, 0);
  return {
    latest: last ? num(last.overall) : 0,
    latestPeriod: last ? last.period : null,
    average3: Math.round(avg3 * 100) / 100,
    trend: recent.map(r => ({ period: r.period, score: num(r.overall) })),
    count: list.length,
    direction: recent.length > 1 ? num(recent[recent.length - 1].overall) - num(recent[recent.length - 2].overall) : 0
  };
}

export function skillsOf(db, employeeId) {
  const emp = (db.employees || []).find(e => e.id === employeeId);
  if (!emp) return { current: [], next: [], gaps: [] };
  const s = db.settings;
  const nxt = nextLevel(s, emp.levelId);
  const mine = (db.employeeSkills || []).filter(x => x.employeeId === employeeId);
  const rating = name => { const hit = mine.find(x => x.name === name); return hit ? { level: num(hit.level), at: hit.lastReviewedAt, note: hit.note } : { level: 0, at: null, note: '' }; };
  const current = levelSkills(s, emp.levelId).map(sk => ({ name: sk.name, required: num(sk.req), ...rating(sk.name) }));
  const nextReq = nxt ? levelSkills(s, nxt.id) : [];
  const next = nextReq.map(sk => ({ name: sk.name, required: num(sk.req), ...rating(sk.name) }));
  const gaps = [...current.map(x => ({ ...x, scope: 'current' })), ...next.map(x => ({ ...x, scope: 'next' }))]
    .filter(x => x.level < x.required)
    .sort((a, b) => (b.required - b.level) - (a.required - a.level));
  return { current, next, gaps, nextLevel: nxt };
}

export function promotionReadiness(db, employeeId) {
  const s = db.settings;
  const emp = (db.employees || []).find(e => e.id === employeeId);
  if (!emp) return null;
  const cfg = s.promotion || DEFAULT_SETTINGS.promotion;
  const nxt = nextLevel(s, emp.levelId);
  const msAll = (db.milestones || []).filter(m => m.employeeId === employeeId && (!nxt || !m.targetLevelId || m.targetLevelId === nxt.id));
  const msDone = msAll.filter(m => m.status === 'achieved' || m.status === 'reviewed');
  const sk = skillsOf(db, employeeId);
  const skNeeded = sk.next.length ? sk.next : sk.current;
  const skMet = skNeeded.filter(x => x.level >= x.required);
  const perf = performanceOf(db, employeeId);
  const respNeeded = num(cfg.responsibilityExamplesRequired) || 3;
  const respDone = (db.goals || []).filter(g => g.employeeId === employeeId && g.type === 'level_up' && g.status === 'completed').length +
                   msDone.filter(m => m.responsibility).length;

  const parts = {
    milestones: { label: 'Promotion milestones', done: msDone.length, total: msAll.length, ratio: msAll.length ? msDone.length / msAll.length : 0 },
    skills: { label: 'Next-level skills at target', done: skMet.length, total: skNeeded.length, ratio: skNeeded.length ? skMet.length / skNeeded.length : 0 },
    performance: { label: 'Sustained performance at current level', done: perf.average3, total: 5, ratio: perf.count ? Math.max(0, Math.min(1, perf.average3 / 5)) : 0 },
    responsibility: { label: 'Higher-level responsibility shown', done: Math.min(respDone, respNeeded), total: respNeeded, ratio: respNeeded ? Math.min(1, respDone / respNeeded) : 0 }
  };
  const w = cfg.components || DEFAULT_SETTINGS.promotion.components;
  const score = Object.keys(parts).reduce((sum, k) => sum + parts[k].ratio * num(w[k]), 0);
  const t = cfg.thresholds || DEFAULT_SETTINGS.promotion.thresholds;
  const suggested = score >= num(t.approved) ? 'management_review'      // never auto-approve
    : score >= num(t.management_review) ? 'management_review'
    : score >= num(t.developing) ? 'developing' : 'not_ready';
  const decision = (db.promotions || []).filter(p => p.employeeId === employeeId).sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)))[0] || null;
  return {
    percent: Math.round(score * 100), parts, weights: w, suggested,
    decision: decision ? decision.decision : null, decisionAt: decision ? decision.decidedAt : null,
    decisionNote: decision ? decision.notes : '', nextLevel: nxt || null
  };
}

/* ---------- tasks ---------- */
/* A task is delivered when it is handed in for the last time (the submission the
   manager accepted), or when the manager marks it done if it was never handed in.
   It is on time when that day is on or before the due date. */
export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'submitted', 'done'];
export const TASK_OPEN = ['todo', 'in_progress', 'blocked', 'submitted'];
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export function taskDaysLate(t) {
  const d = t.deliveredAt ? String(t.deliveredAt).slice(0, 10) : null;
  if (!t.dueDate || !d) return 0;
  return Math.max(0, dayDiff(t.dueDate, d));
}
export function taskStats(tasks, from, to) {
  const now = today();
  const done = tasks.filter(t => t.status === 'done' && t.deliveredAt &&
    (!from || String(t.deliveredAt).slice(0, 10) >= from) && (!to || String(t.deliveredAt).slice(0, 10) <= to));
  const dated = done.filter(t => t.dueDate);
  const late = dated.filter(t => taskDaysLate(t) > 0);
  const rated = done.filter(t => num(t.quality) > 0);
  const open = tasks.filter(t => TASK_OPEN.includes(t.status));
  const r2 = v => Math.round(v * 100) / 100;
  return {
    done: done.length,
    onTime: dated.length - late.length, dated: dated.length,
    onTimePct: dated.length ? Math.round((dated.length - late.length) / dated.length * 100) : null,
    late: late.length,
    avgDaysLate: late.length ? r2(late.reduce((s, t) => s + taskDaysLate(t), 0) / late.length) : 0,
    avgQuality: rated.length ? r2(rated.reduce((s, t) => s + num(t.quality), 0) / rated.length) : null,
    rated: rated.length,
    avgRevisions: done.length ? r2(done.reduce((s, t) => s + num(t.revisions), 0) / done.length) : 0,
    open: open.length,
    overdue: open.filter(t => t.dueDate && t.dueDate < now && t.status !== 'submitted').length,
    waiting: open.filter(t => t.status === 'submitted').length
  };
}
const monthEnd = m => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
export const monthRange = m => ({ from: m + '-01', to: monthEnd(m) });
/* numbers shown on dashboards: last 90 days, this quarter, and each of the last 12 months */
export function taskSummary(db, employeeId) {
  const mine = (db.tasks || []).filter(t => t.employeeId === employeeId);
  const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const q = quarterRange(quarterOf());
  const months = {};
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
    const m = d.toISOString().slice(0, 7), r = monthRange(m);
    const st = taskStats(mine, r.from, r.to);
    if (st.done) months[m] = st;
  }
  const recent = taskStats(mine, d90, null);
  return { recent: { ...recent, perMonth: Math.round(recent.done / 3 * 10) / 10 }, quarter: taskStats(mine, q.start, q.end), months };
}

/* ---------- leave ---------- */
export function workingDays(from, to, workDays) {
  const days = workDays && workDays.length ? workDays : [1, 2, 3, 4, 5];
  const a = new Date(from + 'T00:00:00Z'), b = new Date(to + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0;
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) if (days.includes(d.getUTCDay())) n++;
  return n;
}
/* The leave year runs from the start day in Settings → Leave (11 September in the
   Ethiopia preset, to 10 September).
   Leave is earned month by month: 16 days ÷ 12 = 1.33 days per completed month,
   counted from the start of the leave year or the person's start date, whichever
   is later. Days left over from last year are carried in the person's record. */
export function leaveYear(settings, when) {
  const s = (settings && settings.leave) || DEFAULT_SETTINGS.leave;
  const m = num(s.yearStartMonth) || 9, d = num(s.yearStartDay) || 11;
  const now = when ? new Date(when + 'T00:00:00Z') : new Date();
  const y = now.getUTCFullYear();
  const startThis = Date.UTC(y, m - 1, d);
  const startYear = now.getTime() >= startThis ? y : y - 1;
  const start = new Date(Date.UTC(startYear, m - 1, d));
  const end = new Date(Date.UTC(startYear + 1, m - 1, d - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: startYear + '/' + (startYear + 1) };
}
export function completedMonths(from, to) {
  const a = new Date(from + 'T00:00:00Z'), b = new Date((to || today()) + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}
export function leaveBalance(db, employeeId, when) {
  const s = db.settings.leave || DEFAULT_SETTINGS.leave;
  const emp = (db.employees || []).find(e => e.id === employeeId) || {};
  const yr = leaveYear(db.settings, when);
  const allowance = num(s.annualDays) || 16;
  const perMonth = allowance / 12;
  const accrualFrom = (emp.startDate && emp.startDate > yr.start) ? emp.startDate : yr.start;
  const months = completedMonths(accrualFrom, when || today());
  const accrued = s.accrue === false ? allowance : Math.min(allowance, Math.round(months * perMonth * 100) / 100);
  const carried = Math.max(0, num(emp.leaveCarryOver));

  const inYear = (db.leave || []).filter(l => l.employeeId === employeeId && l.from >= yr.start && l.from <= yr.end);
  const sum = (type, status) => inYear.filter(l => l.type === type && l.status === status).reduce((t, l) => t + num(l.days), 0);
  const usedAnnual = sum('annual', 'approved'), pendingAnnual = sum('annual', 'pending');
  const available = Math.round((carried + accrued - usedAnnual - pendingAnnual) * 100) / 100;

  return {
    year: yr.label, yearStart: yr.start, yearEnd: yr.end,
    monthsWorked: months, perMonth: Math.round(perMonth * 100) / 100,
    annual: {
      allowance, accrued, carried, used: usedAnnual, pending: pendingAnnual,
      available: Math.max(0, available),
      left: Math.max(0, available),                       // what can be booked right now
      remainingEntitlement: Math.round((carried + allowance - usedAnnual) * 100) / 100
    },
    sick: { allowance: num(s.sickDays), used: sum('sick', 'approved'), pending: sum('sick', 'pending'),
            left: num(s.sickDays) - sum('sick', 'approved') },
    unpaid: { used: sum('unpaid', 'approved'), pending: sum('unpaid', 'pending') },
    upcoming: inYear.filter(l => l.status === 'approved' && l.to >= today()).sort((a, b) => a.from.localeCompare(b.from))
  };
}

/* ---------- one-off upgrades for installs made before a change ---------- */
export function migrate(db) {
  let changed = false;
  const done = db.migrations = db.migrations || [];
  const once = (id, fn) => { if (done.includes(id)) return; fn(); done.push(id); changed = true; };

  // one-off upgrades for the original agency's live data were removed in this edition;
  // a fresh install starts with these
  once('tasks-2026-09', () => { db.tasks = db.tasks || []; });
  once('projects-2026-10', () => { db.projects = db.projects || []; });
  once('app-2026-10', () => {
    db.notifications = db.notifications || []; db.achievements = db.achievements || [];
    db.broadcasts = db.broadcasts || []; db.pushSubs = db.pushSubs || [];
    db.music = db.music || { tracks: [], spotify: '' };
  });

  return changed;
}

/* ---------- what needs doing ---------- */
export function actionsFor(db, user) {
  const out = [];
  const now = today(), month = monthOf();
  const add = (kind, text, href, level) => out.push({ kind, text, href, level: level || 'info' });
  const me = (db.employees || []).find(e => e.id === user.employeeId);
  const nameOf = id => ((db.employees || []).find(e => e.id === id) || {}).name || 'someone';
  const ack = !(db.settings.reviews && db.settings.reviews.acknowledge === false);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthLabel = p => MONTHS[Number(String(p).slice(5, 7)) - 1] + ' ' + String(p).slice(0, 4);

  // projects kicked off from the Price Builder
  (db.projects || []).filter(p => p.managerId === user.employeeId || (isAdmin(user) && !(db.employees || []).some(e => e.id === p.managerId))).forEach(p => {
    if (p.status === 'review') add('project', 'New project “' + p.name + '” is waiting for you: check the plan and start it', '#/project/' + p.id, 'due');
    else if (p.status === 'active') {
      const tasks = (db.tasks || []).filter(t => t.projectId === p.id);
      if (tasks.length && tasks.every(t => t.status === 'done')) add('project', 'Every task in “' + p.name + '” is done: mark it delivered', '#/project/' + p.id, 'due');
    }
  });

  if (me) {
    (db.goals || []).filter(g => g.employeeId === me.id && ['active', 'at_risk'].includes(g.status)).forEach(g => {
      const days = Math.ceil((Date.parse(g.dueDate) - Date.parse(now)) / 86400000);
      if (g.status === 'at_risk') add('goal', 'Your goal “' + g.title + '” is at risk', '#/goals', 'warn');
      else if (g.dueDate && days <= 14 && days >= 0) add('goal', 'Goal “' + g.title + '” is due in ' + days + ' day' + (days === 1 ? '' : 's'), '#/goals');
      else if (g.dueDate && days < 0) add('goal', 'Goal “' + g.title + '” is overdue', '#/goals', 'warn');
    });
    (db.milestones || []).filter(m => m.employeeId === me.id && !['achieved', 'reviewed'].includes(m.status)).forEach(m => {
      if (m.status === 'blocked') add('milestone', 'Milestone “' + m.title + '” is blocked', '#/milestones', 'warn');
      else if (m.dueDate && m.dueDate < now) add('milestone', 'Milestone “' + m.title + '” is overdue', '#/milestones', 'warn');
    });
    (db.tasks || []).filter(t => t.employeeId === me.id && ['todo', 'in_progress', 'blocked'].includes(t.status) && t.dueDate).forEach(t => {
      const days = Math.round((Date.parse(t.dueDate) - Date.parse(now)) / 86400000);
      if (days < 0) add('task', 'Task “' + t.title + '” is ' + (-days) + ' day' + (days === -1 ? '' : 's') + ' late', '#/tasks', 'warn');
      else if (days <= 2) add('task', 'Task “' + t.title + '” is due ' + (days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in 2 days'), '#/tasks', 'due');
    });
    if (ack) {
      (db.reviews || []).filter(r => r.employeeId === me.id && r.status === 'approved' && !r.acknowledgedAt).forEach(r =>
        add('myreview', 'Your ' + monthLabel(r.period) + ' review is ready to read', '#/reviews', 'due'));
      (db.quarterlies || []).filter(q => q.employeeId === me.id && q.status === 'final' && !q.acknowledgedAt).forEach(q =>
        add('myreview', 'Your quarterly review is ready to read', '#/reviews', 'due'));
    }
  }

  if (isManager(user)) {
    const mine = isAdmin(user) ? (db.employees || []) : teamOf(db, user.employeeId);
    // creative partners only take tasks: no reviews to write for them
    const writable = mine.filter(e => e.status !== 'inactive' && !isPartner(e) && e.id !== user.employeeId && (isAdmin(user) || !founderOnly(db, e.id)));
    writable.forEach(e => {
      const r = (db.reviews || []).find(x => x.employeeId === e.id && x.period === month);
      if (r && r.status === 'draft' && r.returnedAt) add('review', 'Review for ' + e.name + ' was sent back: ' + (r.returnNote || 'see the notes'), '#/review/' + e.id + '/' + month, 'warn');
      else if (!r || !REVIEW_SENT.includes(r.status)) add('review', 'Monthly review due for ' + e.name, '#/review/' + e.id + '/' + month, 'due');
      if (!approvedReviews(db, e.id).length && !(db.reviews || []).some(x => x.employeeId === e.id && REVIEW_SENT.includes(x.status))) {
        add('review', e.name + ' has never been reviewed', '#/people/' + e.id, 'warn');
      }
    });
    // quarterly review: due in the last three weeks of a quarter, and for a month after it ends
    const cur = quarterInfo();
    const daysLeft = dayDiff(now, cur.end);
    const dueQs = [daysLeft <= 21 ? cur.id : null, dayDiff(quarterRange(cur.previous).end, now) <= 30 ? cur.previous : null].filter(Boolean);
    dueQs.forEach(q => writable.forEach(e => {
      // last quarter only matters for people who were reviewed during it
      if (q !== cur.id && !approvedReviews(db, e.id).some(r => quarterMonths(q).includes(r.period))) return;
      const x = (db.quarterlies || []).find(y => y.employeeId === e.id && y.quarter === q);
      if (!x || x.status === 'draft') add('quarterly', 'Quarterly review due for ' + e.name + ' (' + quarterInfo(q).label + ')', '#/quarterly/' + e.id + '/' + q, 'due');
    }));
    (db.leave || []).filter(l => l.status === 'pending' && mine.some(e => e.id === l.employeeId)).forEach(l => {
      add('leave', 'Leave request from ' + nameOf(l.employeeId) + ' waiting for approval', '#/team-leave', 'due');
    });
    (db.tasks || []).filter(t => mine.some(e => e.id === t.employeeId) && t.employeeId !== user.employeeId).forEach(t => {
      if (t.status === 'submitted') add('task', nameOf(t.employeeId) + ' handed in “' + t.title + '” — check and rate it', '#/tasks-team', 'due');
      else if (TASK_OPEN.includes(t.status) && t.dueDate && t.dueDate < now) add('task', '“' + t.title + '” (' + nameOf(t.employeeId) + ') is overdue', '#/tasks-team', 'warn');
    });
  }

  if (isAdmin(user)) {
    (db.reviews || []).filter(r => r.status === 'awaiting_approval').forEach(r =>
      add('approval', 'Approve the ' + monthLabel(r.period) + ' review for ' + nameOf(r.employeeId), '#/approvals', 'due'));
    (db.quarterlies || []).filter(q => q.status === 'awaiting_approval').forEach(q =>
      add('approval', 'Approve the quarterly review for ' + nameOf(q.employeeId), '#/approvals', 'due'));
  }
  return out.slice(0, 60);
}

export { allLevels, findLevel, nextLevel, levelSkills, isPartner, PARTNER_DEPT };
