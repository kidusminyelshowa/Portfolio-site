/* Team app API (/team).
   One endpoint, one action per request. Every action checks what the signed-in
   person is allowed to see or change; the browser never decides permissions.
   Private management notes are only ever sent to admins and the employee's
   own managers. */
import { json, readBody, setupTokenOk, failure, ensureSecret } from './_lib.js';
import {
  readDb, mutate, log, migrate, uid, num, clip, today, monthOf, quarterOf, quarterMonths, quarterRange, quarterInfo, previousQuarter, nextQuarter,
  hashPassword, verifyPassword, makeToken, setCookie, currentUser,
  isAdmin, isManager, canSee, canManage, visibleEmployees, teamOf,
  reviewScore, goalProgress, performanceOf, skillsOf, promotionReadiness, approvedReviews, founderOnly, REVIEW_SENT,
  TASK_STATUSES, TASK_OPEN, TASK_PRIORITIES, taskStats, taskSummary, taskDaysLate, monthRange,
  leaveBalance, leaveYear, workingDays, actionsFor, allLevels, findLevel, nextLevel, levelSkills, isPartner
} from './_team-lib.js';
import { DEFAULT_SETTINGS, MILESTONE_STATUSES, GOAL_STATUSES, PROMOTION_STATUSES, LEAVE_TYPES, LEVEL_MILESTONES, PIPELINE_STAGES } from './_team-config.js';
import { buildDemo, clearDemo } from './_team-seed.js';
import { autoAssign, cleanPlan, projectProgress, createProject, PROJECT_STATUSES } from './_team-projects.js';
import { allQuotes, readQuote, writeQuote, salesRow, followupFor, salesRules } from './_sales.js';
import { notify, notifyEmployee, managerIdsOf, adminIds, userOf, afterTaskDone, awardGoal, awardMilestone, awardReview, awardProject,
  ACHIEVEMENTS, achievementOn, recommendations, sendBroadcast, audienceIds, ACH } from './_team-notify.js';
import { sendPush, VAPID_PUBLIC_KEY, pushReady } from './_push.js';
import { LEAD_STAGES, importLeads, newLead, applyLeadFields, findDuplicate, logLeadActivity, visibleLeads } from './_leads.js';
import { issueSignedToken, presignUrl, signUpload, LOCAL_MEDIA_PREFIX, MEDIA_PRIVATE } from './_storage.js';
import { readBrand, brand, publicBrand, saveBrand, PRESETS } from './_brand.js';
import { HOLIDAY_PRESETS } from './_team-notify.js';
import { readJson, writeJson, LEADS_TOKEN } from './_lib.js';
import { MEDIA_TOKEN } from './_lib.js';

const fail = (msg, status) => { const e = new Error(msg); e.status = status || 400; throw e; };
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
const cleanDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const cleanTime = v => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '');

/* ---------- sales leads ---------- */
function leadsPayload(db, user) {
  const people = (db.employees || []).filter(e => e.status !== 'inactive' && (canAssign(db, user, e.id) || e.id === user.employeeId)).map(e => ({ id: e.id, name: e.name }));
  return { leads: visibleLeads(db, user, isManager), people, owner: salesRules(db).owner, canImport: isManager(user), showMoney: isAdmin(user), priceAccess: isAdmin(user) };
}
const runsLead = (user, l) => isManager(user) || (l.ownerId && l.ownerId === user.employeeId);

/* ---------- what a signed-in person may load ---------- */
function payload(db, user) {
  const emps = visibleEmployees(db, user);
  const ids = new Set(emps.map(e => e.id));
  const mineOnly = list => (list || []).filter(x => ids.has(x.employeeId));
  const manageable = new Set(emps.filter(e => canManage(db, user, e.id)).map(e => e.id));

  // the employee only sees a review once the founder has approved it; private notes never reach them
  // skill ratings inside reviews stay with management too
  const hidePrivate = x => ({ ...x, privateNote: undefined, history: undefined, roleScores: undefined,
    snapshot: x.snapshot ? { ...x.snapshot, skills: undefined } : x.snapshot });
  const reviews = mineOnly(db.reviews).filter(r => manageable.has(r.employeeId) || r.status === 'approved')
    .map(r => manageable.has(r.employeeId) ? r : hidePrivate(r))
    .map(r => (isAdmin(user) ? r : stripMoney(db, r)));
  const quarterlies = mineOnly(db.quarterlies).filter(q => manageable.has(q.employeeId) || q.status === 'final')
    .map(q => manageable.has(q.employeeId) ? q : hidePrivate(q));
  // projects: admins see all; a manager sees the ones they run or that involve their team;
  // everyone else only the basics of projects they have tasks in
  const myTaskProjects = new Set((db.tasks || []).filter(t => ids.has(t.employeeId) && t.projectId).map(t => t.projectId));
  const projects = (db.projects || []).filter(p => isAdmin(user) || p.managerId === user.employeeId || myTaskProjects.has(p.id) ||
      (isManager(user) && (p.plan || []).some(r => manageable.has(r.employeeId))))
    .map(p => {
      const runs = isAdmin(user) || p.managerId === user.employeeId;
      const base = { id: p.id, name: p.name, client: p.client, status: p.status, managerId: p.managerId, startDate: p.startDate,
        dueDate: p.dueDate, timeline: p.timeline, days: p.days, startedAt: p.startedAt || null, completedAt: p.completedAt || null,
        progress: projectProgress(db, p), canRun: runs };
      if (!runs && !isManager(user)) return base;
      return { ...base, plan: p.plan || [], note: p.note || '', contractNumber: p.contractNumber || '', log: (p.log || []).slice(-30),
        createdAt: p.createdAt, createdByName: p.createdByName,
        ...(isAdmin(user) ? { quoteId: p.quoteId || null, slug: p.slug || null, amount: p.amount || '' } : {}) };
    });
  const people = emps.map(e => {
    const r = (db.reviews || []).find(x => x.employeeId === e.id && x.period === monthOf());
    return {
      ...e,
      performance: performanceOf(db, e.id),
      readiness: promotionReadiness(db, e.id),
      leave: leaveBalance(db, e.id),
      tasks: taskSummary(db, e.id),
      partner: isPartner(e),
      founderOnly: founderOnly(db, e.id),
      // "sent" = the manager has done their part (waiting for approval or approved)
      reviewThisMonth: !!r && REVIEW_SENT.includes(r.status),
      reviewThisMonthStatus: r ? r.status : null
    };
  });

  const seesRating = t => isAdmin(user) || t.employeeId === user.employeeId || t.assignedBy === user.id || (t.employeeId && canManage(db, user, t.employeeId)) || (isManager(user) && isExternal(t));
  const founderIds = new Set((db.users || []).filter(u => u.role === 'admin' && u.active !== false && u.employeeId).map(u => u.employeeId));
  const myEmp = (db.employees || []).find(e => e.id === user.employeeId) || {};
  const partner = isPartner(myEmp);
  const mine = (db.notifications || []).filter(n => n.to === user.id);
  const achKeys = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, a]));
  return {
    me: { id: user.id, name: user.name, email: user.email, role: user.role, employeeId: user.employeeId, mustChange: !!user.mustChange,
          photo: myEmp.photo || '', prefs: user.prefs || {}, partner },
    // money is only ever sent to admins
    showMoney: isAdmin(user),
    notifications: mine.slice(-60).reverse(),
    unread: mine.filter(n => !n.read).length,
    push: { publicKey: VAPID_PUBLIC_KEY, ready: pushReady(), devices: (db.pushSubs || []).filter(s => s.userId === user.id).length },
    // names and photos of the whole team, so everyone can see who they work with
    roster: (db.employees || []).filter(e => e.status !== 'inactive').map(e => ({ id: e.id, name: e.name, photo: e.photo || '', levelId: e.levelId, departmentId: e.departmentId,
      title: e.title || '', partner: isPartner(e) })),
    music: { spotify: (db.music && db.music.spotify) || '' },
    // the agency's name, logo, colours and region; admins also get the company details to edit them
    brand: isAdmin(user) ? brand() : publicBrand(brand()),
    presets: Object.fromEntries(Object.entries(PRESETS).map(([id, p]) => [id, p.label])),
    holidayPresets: HOLIDAY_PRESETS,
    achievements: (db.achievements || []).filter(a => ids.has(a.employeeId)).slice(-120).reverse()
      .map(a => ({ ...a, emoji: (achKeys[a.key] || {}).emoji || '🏅', title: (achKeys[a.key] || {}).title || a.key })),
    achievementList: ACHIEVEMENTS.map(a => ({ key: a.key, emoji: a.emoji, title: a.title, text: a.text, on: achievementOn(db, a.key) })),
    ...(isAdmin(user) ? { broadcasts: (db.broadcasts || []).slice(-40).reverse(), recommendations: recommendations(db),
      adminAchievements: !(db.settings.notifications && db.settings.notifications.adminAchievements === false) } : {}),
    settings: isAdmin(user) ? db.settings : { ...db.settings, salesKpis: (db.settings.salesKpis || []).filter(k => k.format !== 'currency'), currency: undefined },
    employees: people,
    users: isAdmin(user) ? (db.users || []).map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, employeeId: u.employeeId, active: u.active !== false, hasPassword: !!u.hash })) : [],
    // skill ratings: only the founder and managers see them (team members see readiness and progress)
    skills: partner || !isManager(user) ? [] : mineOnly(db.employeeSkills),
    goals: partner ? [] : mineOnly(db.goals).map(g => ({ ...g, progressPct: goalProgress(g) })),
    milestones: partner ? [] : mineOnly(db.milestones),
    reviews: partner ? [] : reviews,
    quarterlies: partner ? [] : quarterlies,
    // tasks of people you can see, plus the ones you gave to someone else (e.g. a manager's task for the founder);
    // managers also see the founder's own tasks on Team tasks (asked for 2026-10-20)
    tasks: (db.tasks || []).filter(t => ids.has(t.employeeId) || t.assignedBy === user.id || (isManager(user) && (isExternal(t) || founderIds.has(t.employeeId)))).map(t => ({ ...t, daysLate: taskDaysLate(t), mineToRun: t.assignedBy === user.id, canFinish: finishRole(db, user, t),
      // a task's rating and comment only reach the person who did it and whoever manages or gave it
      ...(seesRating(t) ? {} : { quality: null, qualityNote: '', ratingHidden: !!t.quality }) })),
    // who you can give a task to
    assignable: (db.employees || []).filter(e => e.status !== 'inactive' && canAssign(db, user, e.id)).map(e => ({ id: e.id, name: e.name })),
    projects,
    promotions: partner ? [] : mineOnly(db.promotions),
    leaveRequests: partner ? [] : mineOnly(db.leave),
    notes: (db.notes || []).filter(n => manageable.has(n.employeeId)),   // management only
    actions: actionsFor(db, user),
    quarter: quarterOf(),
    quarterInfo: quarterInfo(),
    month: monthOf(),
    counts: { employees: (db.employees || []).length }
  };
}

/* sales review figures in money: only admins see or change them */
const moneyKpis = db => ((db.settings && db.settings.salesKpis) || []).filter(k => k.format === 'currency').map(k => k.id);
const stripMoney = (db, r) => { if (!r || !r.salesKpis) return r; const k = { ...r.salesKpis }; moneyKpis(db).forEach(id => delete k[id]); return { ...r, salesKpis: k }; };

/* ---------- helpers ---------- */
function employee(db, id) { return (db.employees || []).find(e => e.id === id) || fail('Person not found', 404); }
function mustManage(db, user, employeeId) { if (!canManage(db, user, employeeId)) fail('You cannot change this person’s record', 403); }
function mustSee(db, user, employeeId) { if (!canSee(db, user, employeeId)) fail('Not allowed', 403); }
/* tasks: managers give tasks to their team, to themselves and to the founder (admins);
   whoever gave a task can also edit it, mark it done and rate it */
const adminEmployee = (db, employeeId) => (db.users || []).some(u => u.employeeId === employeeId && isAdmin(u) && u.active !== false);
function canAssign(db, user, employeeId) {
  if (!employeeId) return false;
  if (canManage(db, user, employeeId)) return true;
  return isManager(user) && (employeeId === user.employeeId || adminEmployee(db, employeeId));
}
/* a task for someone outside the team (a photographer, a printer…): no account, so only managers and the founder see and run it */
const isExternal = t => !t.employeeId && !!t.externalName;
const runsTask = (db, user, t) => (isExternal(t) ? isManager(user) : canManage(db, user, t.employeeId)) || (t.assignedBy === user.id && isManager(user));
function mustAssign(db, user, employeeId) { if (!canAssign(db, user, employeeId)) fail('You cannot give a task to this person', 403); }
/* who may mark a task done, and whether they also rate it (asked for 2026-10-20):
   - whoever gave the task finishes and rates it (after it is handed in); the founder can finish and rate anyone's;
   - a task someone logged for themselves: they mark it done but never rate it (their manager or the founder can);
   - the founder's own tasks: the founder marks them done, and managers can mark them done and rate them;
   - nobody rates their own work. Returns 'rate', 'done' or null. */
function finishRole(db, user, t) {
  if (isExternal(t)) return isManager(user) ? 'rate' : null;
  const giver = (db.users || []).find(u => u.id === t.assignedBy) || null;
  const selfLogged = !!giver && giver.employeeId === t.employeeId;
  if (t.employeeId === user.employeeId) return selfLogged || isAdmin(user) ? 'done' : null;
  if (isAdmin(user) || t.assignedBy === user.id) return 'rate';
  if (isManager(user) && adminEmployee(db, t.employeeId)) return 'rate';
  if ((selfLogged || !giver) && canManage(db, user, t.employeeId)) return 'rate';
  return null;
}
function mustRunTask(db, user, t) { if (!runsTask(db, user, t)) fail('Only the person who gave this task, or their manager, can change it', 403); }
/* creative partners only take tasks: no goals, milestones, skills, reviews, promotions or leave */
function notPartner(db, employeeId) {
  if (isPartner((db.employees || []).find(e => e.id === employeeId))) fail('Creative partners only have tasks: no goals, milestones, skills, reviews or leave.');
}
/* who may write someone's review: their manager, except that a manager's own review is the founder's alone */
function mustReview(db, user, employeeId) {
  mustManage(db, user, employeeId);
  notPartner(db, employeeId);
  if (!isAdmin(user) && founderOnly(db, employeeId)) fail('A manager’s review is written and approved by the founder.', 403);
  if (employeeId === user.employeeId) fail('You cannot review yourself.', 403);
}
const sign = (user, now) => ({ by: user.id, name: user.name, at: now });
/* a project is run by its project manager, or any admin */
function mustRunProject(db, user, id) {
  const p = (db.projects || []).find(x => x.id === id) || fail('Project not found', 404);
  if (!isAdmin(user) && p.managerId !== user.employeeId) fail('Only the project manager or an admin can change this project.', 403);
  return p;
}
const projectLog = (p, user, text) => { p.log = (p.log || []).concat([{ at: new Date().toISOString(), name: user.name, text }]).slice(-60); };

const OUTCOMES = { interested: 'Spoke: interested', changes: 'Spoke: wants changes', later: 'Not now: follow up later', noanswer: 'No answer', won: 'Agreed: going ahead', lost: 'Lost' };

/* move a task to a new status and keep the timestamps honest */
function setTaskStatus(t, status, user, now, note) {
  if (t.status === status) return;
  const from = t.status;
  if (status === 'in_progress' || status === 'submitted' || status === 'blocked') t.startedAt = t.startedAt || now;
  if (status === 'submitted') { t.submittedAt = now; t.submissions = num(t.submissions) + 1; }
  if (status === 'done') {
    t.completedAt = now;
    t.deliveredAt = from === 'submitted' && t.submittedAt ? t.submittedAt : now;
  }
  if (from === 'done') { t.completedAt = null; t.deliveredAt = null; t.quality = null; t.qualityNote = ''; t.ratedBy = null; }
  t.status = status;
  t.log = (t.log || []).concat([{ at: now, by: user.id, name: user.name, from, to: status, note: clip(note, 500) }]).slice(-60);
}

function applyLevelTemplates(db, emp) {
  const skills = levelSkills(db.settings, emp.levelId);
  skills.forEach(sk => {
    if (!(db.employeeSkills || []).some(x => x.employeeId === emp.id && x.name === sk.name)) {
      db.employeeSkills.push({ employeeId: emp.id, name: sk.name, level: 0, lastReviewedAt: null, note: '' });
    }
  });
  const templates = (db.settings.levelMilestones || LEVEL_MILESTONES)[emp.levelId] || [];
  const existing = new Set((db.milestones || []).filter(m => m.employeeId === emp.id).map(m => m.title));
  templates.forEach(title => {
    if (existing.has(title)) return;
    db.milestones.push({
      id: uid('m'), employeeId: emp.id, title, description: '', targetLevelId: null, skillName: '',
      dueDate: '', status: 'not_started', responsibility: false, evidence: [], reviewerComment: '',
      achievedAt: null, createdAt: new Date().toISOString()
    });
  });
}

/* quarterly summary assembled from the three months */
function quarterSummary(db, employeeId, quarter) {
  const months = quarterMonths(quarter);
  const reviews = approvedReviews(db, employeeId).filter(r => months.includes(r.period));
  const avg = reviews.length ? reviews.reduce((s, r) => s + num(r.overall), 0) / reviews.length : 0;
  const prevQ = previousQuarter(quarter);
  const prevReviews = approvedReviews(db, employeeId).filter(r => quarterMonths(prevQ).includes(r.period));
  const prevAvg = prevReviews.length ? prevReviews.reduce((s, r) => s + num(r.overall), 0) / prevReviews.length : 0;
  const goals = (db.goals || []).filter(g => g.employeeId === employeeId && g.quarter === quarter);
  const ms = (db.milestones || []).filter(m => m.employeeId === employeeId);
  const range = quarterRange(quarter);
  const achievedThis = ms.filter(m => m.achievedAt && String(m.achievedAt).slice(0, 10) >= range.start && String(m.achievedAt).slice(0, 10) <= range.end);
  return {
    quarter, months, info: quarterInfo(quarter),
    tasks: taskStats((db.tasks || []).filter(t => t.employeeId === employeeId), range.start, range.end),
    reviews: reviews.map(r => ({ period: r.period, overall: num(r.overall), scores: r.scores })),
    average: Math.round(avg * 100) / 100,
    previousAverage: Math.round(prevAvg * 100) / 100,
    change: Math.round((avg - prevAvg) * 100) / 100,
    goals: goals.map(g => ({ id: g.id, title: g.title, type: g.type, status: g.status, progress: goalProgress(g) })),
    goalsCompleted: goals.filter(g => g.status === 'completed').length,
    milestonesAchieved: achievedThis.length,
    milestonesOpen: ms.filter(m => !['achieved', 'reviewed'].includes(m.status)).length,
    milestonesBlocked: ms.filter(m => m.status === 'blocked').length,
    skills: skillsOf(db, employeeId),
    readiness: promotionReadiness(db, employeeId)
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const url = new URL(req.url, 'http://localhost');
  try {
    await ensureSecret();
    await readBrand();
    let db0 = await readDb();
    if (migrate(db0)) {
      const m = await mutate(async db => { migrate(db); });
      db0 = m.db;
      await sendPush(m.db, m.outbox).catch(() => {});
    }
    const user0 = currentUser(db0, req);

    if (req.method === 'GET') {
      if (url.searchParams.has('state')) {
        return json(res, 200, {
          configured: (db0.users || []).some(u => u.hash),
          signedIn: !!user0,
          brand: publicBrand(brand()),
          data: user0 ? payload(db0, user0) : null
        });
      }
      if (url.searchParams.has('sales')) {
        // the sales pipeline: admins and managers
        if (!user0) fail('Not signed in', 401);
        if (!isManager(user0)) fail('Only managers and admins can see the sales pipeline.', 403);
        const rules = salesRules(db0);
        const quotes = await allQuotes();
        const tasks = (db0.tasks || []).filter(t => t.quoteId);
        const nameOf = id => ((db0.employees || []).find(e => e.id === id) || {}).name || '';
        const rows = quotes.map(q => {
          const r = salesRow(q, db0);
          const mine = tasks.filter(t => t.quoteId === q.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
          const open = mine.filter(t => TASK_OPEN.includes(t.status)).pop();
          r.followups = mine.map(t => ({ id: t.id, employeeId: t.employeeId, name: nameOf(t.employeeId), status: t.status, dueDate: t.dueDate,
            createdAt: t.createdAt, doneAt: t.deliveredAt || t.completedAt || null, outcome: t.outcome || '', outcomeNote: t.outcomeNote || '' }));
          r.openFollowup = open ? r.followups.find(f => f.id === open.id) : null;
          r.needs = followupFor(r, rules);
          return r;
        }).sort((a, b) => String(b.sentAt || b.createdAt).localeCompare(String(a.sentAt || a.createdAt)));
        const assignable = visibleEmployees(db0, user0).filter(e => e.status !== 'inactive' && (canManage(db0, user0, e.id) || e.id === user0.employeeId))
          .map(e => ({ id: e.id, name: e.name, departmentId: e.departmentId }));
        const money = isAdmin(user0);
        const safe = money ? rows : rows.map(r => ({ ...r, value: null, quoted: null, paidEtb: null, outstandingEtb: null, slug: null,
          invoices: r.invoices.map(i => ({ number: i.number, kind: i.kind, status: i.status, date: i.date, dueDate: i.dueDate, paidAt: i.paidAt })),
          requests: r.requests.map(q => ({ ref: q.ref, at: q.at, changed: q.changed, message: q.message })),
          contract: r.contract ? { number: r.contract.number, status: r.contract.status, date: r.contract.date, signedAt: r.contract.signedAt } : null,
          needs: r.needs && r.needs.kind === 'payment' ? { ...r.needs, reason: r.needs.reason } : r.needs }));
        // the first-run checklist on the admin dashboard asks whether the sample price list was replaced
        const catalogSaved = isAdmin(user0) ? !!(await readJson('pricing/catalog.json', LEADS_TOKEN, null, 'private')) : undefined;
        return json(res, 200, { rows: safe, rules, owner: rules.owner, assignable, canEditRules: isAdmin(user0), priceAccess: money, showMoney: money, catalogSaved });
      }
      if (url.searchParams.has('leads')) {
        // sales leads (before a proposal): managers and the founder see all, anyone else the ones they own
        if (!user0) fail('Not signed in', 401);
        return json(res, 200, leadsPayload(db0, user0));
      }
      if (url.searchParams.has('summary')) {
        if (!user0) fail('Not signed in', 401);
        const id = String(url.searchParams.get('employee') || '');
        mustSee(db0, user0, id);
        return json(res, 200, { summary: quarterSummary(db0, id, url.searchParams.get('summary') || quarterOf()) });
      }
      return json(res, 400, { error: 'Unknown request' });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const body = await readBody(req);
    const action = body.action;

    /* ---------- open actions ---------- */
    if (action === 'setup') {
      // first run only: creates the founder/admin account
      // only someone who knows the install's SETUP_TOKEN can claim the first account
      if (!setupTokenOk(body.setupToken)) fail('The setup key is wrong, or SETUP_TOKEN is not set on the server.', 403);
      return json(res, 200, (await mutate(async db => {
        if ((db.users || []).some(u => u.hash)) fail('An account already exists. Sign in instead.', 409);
        const email = clip(body.email, 200).toLowerCase();
        const name = clip(body.name, 120) || 'Admin';
        if (!emailOk(email)) fail('Enter a valid email address.');
        if (String(body.password || '').length < 8) fail('Use a password of at least 8 characters.');
        const empId = uid('e');
        db.employees.push({
          id: empId, name, email, departmentId: 'creative', trackId: 'creative_direction_track',
          levelId: 'creative_director', managerId: null, startDate: today(), status: 'active',
          phone: '', notes: '', leaveCarryOver: 0, createdAt: new Date().toISOString()
        });
        const { salt, hash } = hashPassword(body.password);
        const u = { id: uid('u'), email, name, role: 'admin', employeeId: empId, salt, hash, active: true, createdAt: new Date().toISOString() };
        db.users.push(u);
        log(db, u.id, 'setup', 'admin account created');
        setCookie(res, makeToken(u.id));
        return { ok: true };
      })).result);
    }

    if (action === 'login') {
      const email = clip(body.email, 200).toLowerCase();
      const u = (db0.users || []).find(x => String(x.email).toLowerCase() === email && x.active !== false);
      if (!u || !u.hash || !verifyPassword(String(body.password || ''), u)) {
        await new Promise(r => setTimeout(r, 600));
        return json(res, 401, { error: 'Wrong email or password.' });
      }
      setCookie(res, makeToken(u.id));
      return json(res, 200, { ok: true });
    }

    if (action === 'logout') { setCookie(res, '', 0); return json(res, 200, { ok: true }); }

    /* ---------- everything else needs a signed-in person ---------- */
    if (!user0) return json(res, 401, { error: 'Not signed in' });

    /* ----- Brand & region (its own small document, not the team database) ----- */
    if (action === 'saveBrand') {
      if (!isAdmin(user0)) fail('Only an admin can change the brand.', 403);
      return json(res, 200, { ok: true, brand: await saveBrand(body.brand || {}) });
    }
    if (action === 'applyPreset') {
      // fills the regional fields of the brand, the team's leave and review year, the holiday
      // list, and the price list's money settings; every one stays editable afterwards
      if (!isAdmin(user0)) fail('Only an admin can change the region.', 403);
      const pr = PRESETS[body.preset] || fail('Unknown preset');
      const saved = await saveBrand({ ...pr.brand, preset: body.preset });
      await mutate(async db => {
        db.settings.leave = { ...db.settings.leave, yearStartMonth: pr.team.yearStartMonth, yearStartDay: pr.team.yearStartDay,
          annualDays: pr.team.annualDays, sickDays: pr.team.sickDays, workDays: pr.team.workDays.slice() };
        db.settings.holidays = { ...(db.settings.holidays || {}), preset: pr.team.holidays };
        db.settings.currency = pr.brand.currency;
        log(db, user0.id, 'preset.apply', body.preset);
      });
      const CATALOG = 'pricing/catalog.json';
      const cat = (await readJson(CATALOG, LEADS_TOKEN, null, 'private')) || { samplePrices: true };
      Object.assign(cat, pr.money);
      await writeJson(CATALOG, LEADS_TOKEN, cat, 'private');
      return json(res, 200, { ok: true, brand: saved });
    }

    const { result, db: saved, outbox } = await mutate(async db => {
      const user = currentUser(db, req) || fail('Not signed in', 401);
      const me = user.employeeId;
      const now = new Date().toISOString();

      switch (action) {
        /* ----- account ----- */
        case 'changePassword': {
          const u = db.users.find(x => x.id === user.id);
          if (u.hash && !verifyPassword(String(body.current || ''), u)) fail('Current password is wrong.');
          if (String(body.password || '').length < 8) fail('Use a password of at least 8 characters.');
          Object.assign(u, hashPassword(body.password), { mustChange: false });
          log(db, user.id, 'password.change', u.email);
          return { ok: true };
        }
        case 'setPassword': {          // admin sets or resets someone's password
          if (!isAdmin(user)) fail('Admins only', 403);
          const u = db.users.find(x => x.id === body.userId) || fail('Account not found', 404);
          if (String(body.password || '').length < 8) fail('Use a password of at least 8 characters.');
          Object.assign(u, hashPassword(body.password), { mustChange: true, active: true });
          log(db, user.id, 'password.set', u.email);
          return { ok: true };
        }
        case 'saveUser': {             // create or change an account for an employee
          if (!isAdmin(user)) fail('Admins only', 403);
          const email = clip(body.email, 200).toLowerCase();
          if (!emailOk(email)) fail('Enter a valid email address.');
          if (!['admin', 'manager', 'employee'].includes(body.role)) fail('Unknown role');
          let u = db.users.find(x => x.id === body.id);
          if (db.users.some(x => String(x.email).toLowerCase() === email && x.id !== (u && u.id))) fail('That email already has an account.');
          if (!u) {
            u = { id: uid('u'), salt: '', hash: '', active: true, createdAt: now };
            db.users.push(u);
          }
          Object.assign(u, { email, name: clip(body.name, 120), role: body.role, employeeId: body.employeeId || null, active: body.active !== false });
          if (body.password) Object.assign(u, hashPassword(body.password), { mustChange: true });
          log(db, user.id, 'user.save', email);
          return { ok: true, id: u.id };
        }
        case 'deleteUser': {
          if (!isAdmin(user)) fail('Admins only', 403);
          if (body.id === user.id) fail('You cannot delete your own account.');
          db.users = db.users.filter(x => x.id !== body.id);
          log(db, user.id, 'user.delete', body.id);
          return { ok: true };
        }

        /* ----- people ----- */
        case 'saveEmployee': {
          const incoming = body.employee || {};
          const existing = incoming.id ? db.employees.find(e => e.id === incoming.id) : null;
          if (existing) {
            if (!isAdmin(user) && !canManage(db, user, existing.id)) fail('You cannot change this person’s record', 403);
          } else if (!isAdmin(user)) fail('Admins only', 403);
          const level = findLevel(db.settings, incoming.levelId) || fail('Pick a position');
          const emp = existing || { id: uid('e'), createdAt: now, status: 'active' };
          const levelChanged = existing && existing.levelId !== incoming.levelId;
          Object.assign(emp, {
            name: clip(incoming.name, 120) || fail('Name is required'),
            email: clip(incoming.email, 200).toLowerCase(),
            departmentId: level.departmentId, trackId: level.trackId, levelId: level.id,
            managerId: incoming.managerId || null,
            startDate: cleanDate(incoming.startDate) || emp.startDate || today(),
            status: incoming.status === 'inactive' ? 'inactive' : 'active',
            phone: clip(incoming.phone, 60), title: clip(incoming.title, 120), notes: clip(incoming.notes, 2000),
            leaveCarryOver: num(incoming.leaveCarryOver)
          });
          // a creative partner's specialities decide which kick-off tasks can go to them
          if (isPartner(emp)) {
            const okCover = c => (db.settings.departments || []).some(d => d.id === c.split(':')[0] && (!c.includes(':') || (d.tracks || []).some(t => t.id === c.split(':')[1])));
            if (Array.isArray(incoming.covers)) emp.covers = incoming.covers.map(c => clip(c, 80)).filter(okCover).slice(0, 12);
          } else delete emp.covers;
          if (emp.managerId === emp.id) emp.managerId = null;
          if (!existing) { db.employees.push(emp); applyLevelTemplates(db, emp); }
          else if (levelChanged) {
            applyLevelTemplates(db, emp);
            db.promotions.push({ id: uid('p'), employeeId: emp.id, fromLevelId: existing.levelId, toLevelId: level.id,
              decision: 'approved', decidedBy: user.id, decidedAt: now, notes: clip(incoming.levelChangeNote, 500) || 'Level changed' });
          }
          log(db, user.id, existing ? 'employee.update' : 'employee.create', emp.name);
          return { ok: true, id: emp.id };
        }
        case 'deleteEmployee': {
          if (!isAdmin(user)) fail('Admins only', 403);
          const emp = employee(db, body.id);
          if (emp.id === me) fail('You cannot delete your own record.');
          const drop = list => (list || []).filter(x => x.employeeId !== emp.id);
          db.employees = db.employees.filter(e => e.id !== emp.id);
          db.employees.forEach(e => { if (e.managerId === emp.id) e.managerId = null; });
          db.users = db.users.filter(u => u.employeeId !== emp.id);
          ['employeeSkills', 'goals', 'milestones', 'reviews', 'quarterlies', 'promotions', 'notes', 'leave', 'tasks'].forEach(k => { db[k] = drop(db[k]); });
          log(db, user.id, 'employee.delete', emp.name);
          return { ok: true };
        }

        /* ----- skills ----- */
        case 'saveSkills': {
          mustManage(db, user, body.employeeId);
          notPartner(db, body.employeeId);
          (body.skills || []).forEach(s => {
            const name = clip(s.name, 120);
            if (!name) return;
            let row = db.employeeSkills.find(x => x.employeeId === body.employeeId && x.name === name);
            if (!row) { row = { employeeId: body.employeeId, name, level: 0, note: '' }; db.employeeSkills.push(row); }
            const level = Math.max(0, Math.min(db.settings.skillScale === 10 ? 10 : 5, Math.round(num(s.level))));
            if (row.level !== level) { row.level = level; row.lastReviewedAt = today(); }
            if (s.note !== undefined) row.note = clip(s.note, 500);
          });
          log(db, user.id, 'skills.save', body.employeeId);
          return { ok: true };
        }

        /* ----- goals ----- */
        case 'saveGoal': {
          const g0 = body.goal || {};
          const existing = g0.id ? db.goals.find(x => x.id === g0.id) : null;
          const employeeId = existing ? existing.employeeId : g0.employeeId;
          mustSee(db, user, employeeId);
          notPartner(db, employeeId);
          const managing = canManage(db, user, employeeId);
          if (!existing && !managing) fail('Only your manager can add goals', 403);
          const goal = existing || { id: uid('g'), employeeId, createdAt: now, evidence: [], updates: [], ownerId: employeeId };
          const wasStatus = existing ? existing.status : null;
          if (managing) {
            if (existing && num(existing.target) !== num(g0.target) && existing.target != null) {
              goal.updates.push({ at: now, by: user.id, field: 'target', from: existing.target, to: g0.target, reason: clip(g0.changeReason, 300) });
            }
            Object.assign(goal, {
              title: clip(g0.title, 200) || fail('Goal title is required'),
              description: clip(g0.description, 2000), why: clip(g0.why, 1000),
              type: ['performance', 'skill_development', 'level_up'].includes(g0.type) ? g0.type : 'performance',
              kpi: clip(g0.kpi, 160), unit: clip(g0.unit, 40),
              target: g0.target === '' || g0.target == null ? null : num(g0.target),
              progressMode: g0.progressMode === 'metric' ? 'metric' : 'manual',
              status: GOAL_STATUSES.includes(g0.status) ? g0.status : 'active',
              dueDate: cleanDate(g0.dueDate), quarter: clip(g0.quarter, 12) || quarterOf(),
              managerComment: clip(g0.managerComment, 1000)
            });
          }
          // the employee may move their own numbers along
          if (g0.current !== undefined) goal.current = g0.current === '' ? null : num(g0.current);
          if (g0.progress !== undefined) goal.progress = Math.max(0, Math.min(100, num(g0.progress)));
          if (!existing) db.goals.push(goal);
          if (goal.status === 'completed' && wasStatus !== 'completed') awardGoal(db, goal);
          log(db, user.id, existing ? 'goal.update' : 'goal.create', goal.title);
          return { ok: true, id: goal.id };
        }
        case 'deleteGoal': {
          const g = db.goals.find(x => x.id === body.id) || fail('Goal not found', 404);
          mustManage(db, user, g.employeeId);
          db.goals = db.goals.filter(x => x.id !== body.id);
          log(db, user.id, 'goal.delete', g.title);
          return { ok: true };
        }

        /* ----- milestones ----- */
        case 'saveMilestone': {
          const m0 = body.milestone || {};
          const existing = m0.id ? db.milestones.find(x => x.id === m0.id) : null;
          const employeeId = existing ? existing.employeeId : m0.employeeId;
          mustSee(db, user, employeeId);
          notPartner(db, employeeId);
          const managing = canManage(db, user, employeeId);
          if (!existing && !managing) fail('Only your manager can add milestones', 403);
          const m = existing || { id: uid('m'), employeeId, createdAt: now, evidence: [], status: 'not_started' };
          if (managing) {
            Object.assign(m, {
              title: clip(m0.title, 200) || fail('Milestone title is required'),
              description: clip(m0.description, 2000),
              targetLevelId: m0.targetLevelId || null, skillName: clip(m0.skillName, 120),
              dueDate: cleanDate(m0.dueDate), responsibility: !!m0.responsibility,
              reviewerComment: clip(m0.reviewerComment, 1000)
            });
          }
          if (m0.status) {
            const allowed = managing ? MILESTONE_STATUSES : ['not_started', 'in_progress', 'blocked'];
            if (!allowed.includes(m0.status)) fail('Only your manager can mark a milestone achieved', 403);
            const before = m.status;
            m.status = m0.status;
            m.achievedAt = ['achieved', 'reviewed'].includes(m0.status) ? (m.achievedAt || today()) : null;
            if (m.status === 'achieved' && before !== 'achieved' && before !== 'reviewed') awardMilestone(db, m);
          }
          if (!existing) db.milestones.push(m);
          log(db, user.id, existing ? 'milestone.update' : 'milestone.create', m.title);
          return { ok: true, id: m.id };
        }
        case 'deleteMilestone': {
          const m = db.milestones.find(x => x.id === body.id) || fail('Milestone not found', 404);
          mustManage(db, user, m.employeeId);
          db.milestones = db.milestones.filter(x => x.id !== body.id);
          log(db, user.id, 'milestone.delete', m.title);
          return { ok: true };
        }
        case 'addEvidence': {
          const kind = body.kind === 'goal' ? 'goals' : body.kind === 'task' ? 'tasks' : 'milestones';
          const row = db[kind].find(x => x.id === body.id) || fail('Not found', 404);
          mustSee(db, user, row.employeeId);
          row.evidence = row.evidence || [];
          row.evidence.push({ at: now, by: user.id, text: clip(body.text, 1000), url: clip(body.url, 500) });
          log(db, user.id, 'evidence.add', row.title);
          return { ok: true };
        }

        /* ----- monthly review ----- */
        /* The manager writes the review and sends it for approval. The founder
           (admin) approves it, and only then does the employee see it. A review the
           founder writes is approved as it is sent. */
        case 'saveReview': {
          const r0 = body.review || {};
          const employeeId = r0.employeeId;
          mustReview(db, user, employeeId);
          const period = /^\d{4}-\d{2}$/.test(String(r0.period)) ? r0.period : monthOf();
          let r = db.reviews.find(x => x.id === r0.id && x.employeeId === employeeId) || db.reviews.find(x => x.employeeId === employeeId && x.period === period);
          if (!r) { r = { id: uid('r'), employeeId, period, createdAt: now, status: 'draft', evidence: [] }; db.reviews.push(r); }
          if (r.status !== 'draft') {
            // changing a review that was already sent keeps a trail
            r.history = (r.history || []).concat([{ at: now, by: user.id, status: r.status, scores: r.scores, overall: r.overall }]).slice(-20);
          }
          const scores = {};
          (db.settings.universal || DEFAULT_SETTINGS.universal).forEach(c => {
            const v = num((r0.scores || {})[c.id]);
            if (v) scores[c.id] = Math.max(1, Math.min(5, v));
          });
          const range = monthRange(period);
          Object.assign(r, {
            reviewerId: user.id, period, scores, overall: reviewScore(db.settings, scores),
            roleScores: r0.roleScores && typeof r0.roleScores === 'object' ? r0.roleScores : (r.roleScores || {}),
            // money figures (revenue) are kept from the stored review unless an admin changes them
            salesKpis: r0.salesKpis && typeof r0.salesKpis === 'object'
              ? { ...(r.salesKpis || {}), ...(isAdmin(user) ? r0.salesKpis : Object.fromEntries(Object.entries(r0.salesKpis).filter(([k]) => !moneyKpis(db).includes(k)))) }
              : (r.salesKpis || {}),
            wins: clip(r0.wins, 3000), improve: clip(r0.improve, 3000),
            observation: clip(r0.observation, 3000), nextFocus: clip(r0.nextFocus, 3000),
            privateNote: clip(r0.privateNote, 3000),
            // task numbers for the month, kept with the review as evidence (they do not change the score)
            taskEvidence: taskStats((db.tasks || []).filter(t => t.employeeId === employeeId), range.from, range.to)
          });
          // skills rated in the review become the person's current skill ratings
          const scaleMax = db.settings.skillScale === 10 ? 10 : 5;
          Object.entries(r.roleScores || {}).forEach(([name0, v]) => {
            const name = clip(name0, 120), level = Math.max(0, Math.min(scaleMax, Math.round(num(v))));
            if (!name || !level) return;
            let row = db.employeeSkills.find(x => x.employeeId === employeeId && x.name === name);
            if (!row) { row = { employeeId, name, level: 0, note: '' }; db.employeeSkills.push(row); }
            if (row.level !== level) { row.level = level; row.lastReviewedAt = today(); }
          });
          if (body.submit) {
            if (!Object.keys(scores).length) fail('Score the five categories before sending.');
            r.sentAt = now; r.sentBy = sign(user, now);
            r.returnedAt = null; r.returnNote = ''; r.acknowledgedAt = null; r.acknowledgedNote = '';
            const who = (db.employees.find(e => e.id === employeeId) || {}).name || 'someone';
            if (isAdmin(user)) {
              r.status = 'approved'; r.approvedAt = now; r.approvedBy = user.id; r.approval = sign(user, now);
              r.readinessAt = (promotionReadiness(db, employeeId) || {}).percent || 0;      // for the "how I evolved" chart
              notifyEmployee(db, employeeId, { kind: 'review', emoji: '📝', title: 'Your review is ready to read', body: 'Your review for ' + period + ' was approved.', href: '#/reviews' });
              awardReview(db, r);
            } else {
              r.status = 'awaiting_approval'; r.approvedAt = null; r.approvedBy = null; r.approval = null;
              notify(db, adminIds(db), { kind: 'approval', emoji: '✅', title: 'Review waiting for approval', body: user.name + ' sent the ' + period + ' review for ' + who + '.', href: '#/approvals' });
            }
          } else if (r.status !== 'draft' && !isAdmin(user)) {
            // a manager changing a sent review takes it back to draft until it is sent and approved again
            r.status = 'draft'; r.approvedAt = null; r.approvedBy = null; r.approval = null;
          } else if (r.status === 'approved' && isAdmin(user)) {
            r.approvedAt = now; r.approval = sign(user, now);
          }
          (r0.newMilestones || []).filter(t => clip(t, 200)).slice(0, 3).forEach(title => {
            db.milestones.push({ id: uid('m'), employeeId, title: clip(title, 200), description: '',
              targetLevelId: null, skillName: '', dueDate: cleanDate(r0.milestoneDue), status: 'not_started',
              responsibility: false, evidence: [], reviewerComment: '', achievedAt: null, fromReview: r.id, createdAt: now });
          });
          log(db, user.id, body.submit ? 'review.send' : 'review.save', employeeId + ' ' + period + ' ' + r.status);
          return { ok: true, id: r.id, overall: r.overall, status: r.status };
        }
        case 'deleteReview': {
          const r = db.reviews.find(x => x.id === body.id) || fail('Review not found', 404);
          if (!isAdmin(user)) fail('Admins only', 403);
          db.reviews = db.reviews.filter(x => x.id !== body.id);
          log(db, user.id, 'review.delete', r.employeeId + ' ' + r.period);
          return { ok: true };
        }
        /* founder approves a review, or sends it back to the manager with a note */
        case 'decideReview': {
          if (!isAdmin(user)) fail('Only the founder approves reviews', 403);
          const list = body.kind === 'quarterly' ? db.quarterlies : db.reviews;
          const r = list.find(x => x.id === body.id) || fail('Review not found', 404);
          if (body.decision === 'approve') {
            if (body.kind === 'quarterly') { r.status = 'final'; r.finalizedAt = r.finalizedAt || now; }
            else r.status = 'approved';
            r.approvedAt = now; r.approvedBy = user.id; r.approval = sign(user, now);
            r.approvalNote = clip(body.note, 1000);
            r.acknowledgedAt = null; r.acknowledgedNote = '';
            r.readinessAt = (promotionReadiness(db, r.employeeId) || {}).percent || 0;      // for the "how I evolved" chart
            notifyEmployee(db, r.employeeId, { kind: 'review', emoji: '📝', title: 'Your ' + (body.kind === 'quarterly' ? 'quarterly ' : '') + 'review is ready to read',
              body: 'It was approved and is waiting for you.', href: '#/reviews' });
            if (body.kind !== 'quarterly') awardReview(db, r);
          } else if (body.decision === 'return') {
            r.status = 'draft'; r.returnedAt = now; r.returnedBy = user.id; r.returnNote = clip(body.note, 1000);
            const writer = r.sentBy && r.sentBy.by ? r.sentBy.by : r.reviewerId;
            if (writer) notify(db, [writer], { kind: 'review', emoji: '↩️', title: 'A review was sent back', body: clip(body.note, 200) || 'See the founder’s note.', href: '#/approvals' });
            r.approvedAt = null; r.approvedBy = null; r.approval = null;
          } else fail('Unknown decision');
          log(db, user.id, 'review.' + body.decision, (body.kind || 'monthly') + ' ' + r.employeeId);
          return { ok: true };
        }
        /* the employee confirms they have read an approved review */
        case 'acknowledgeReview': {
          const list = body.kind === 'quarterly' ? db.quarterlies : db.reviews;
          const r = list.find(x => x.id === body.id) || fail('Review not found', 404);
          if (r.employeeId !== me) fail('Only the person reviewed can confirm this', 403);
          if (!['approved', 'final'].includes(r.status)) fail('This review has not been approved yet.');
          r.acknowledgedAt = now; r.acknowledgedNote = clip(body.note, 1500);
          log(db, user.id, 'review.acknowledge', (body.kind || 'monthly') + ' ' + r.id);
          return { ok: true };
        }

        /* ----- quarterly review ----- */
        case 'saveQuarterly': {
          const q0 = body.quarterly || {};
          mustReview(db, user, q0.employeeId);
          const quarter = /^Y\d{4}-Q[1-4]$/.test(String(q0.quarter)) ? q0.quarter : quarterOf();
          let qr = db.quarterlies.find(x => x.employeeId === q0.employeeId && x.quarter === quarter);
          if (!qr) { qr = { id: uid('q'), employeeId: q0.employeeId, quarter, createdAt: now, status: 'draft' }; db.quarterlies.push(qr); }
          const wasSent = qr.status !== 'draft';
          Object.assign(qr, {
            reviewerId: user.id,
            achieved: clip(q0.achieved, 4000), notAchieved: clip(q0.notAchieved, 4000),
            improved: clip(q0.improved, 4000), needsWork: clip(q0.needsWork, 4000),
            recommendation: clip(q0.recommendation, 4000), nextFocus: clip(q0.nextFocus, 4000),
            meetingDate: cleanDate(q0.meetingDate), privateNote: clip(q0.privateNote, 3000)
          });
          if (body.finalize) {
            qr.snapshot = quarterSummary(db, q0.employeeId, quarter);
            qr.sentAt = now; qr.sentBy = sign(user, now); qr.returnedAt = null; qr.returnNote = '';
            qr.acknowledgedAt = null; qr.acknowledgedNote = '';
            if (isAdmin(user)) { qr.status = 'final'; qr.finalizedAt = now; qr.approvedAt = now; qr.approvedBy = user.id; qr.approval = sign(user, now); }
            else { qr.status = 'awaiting_approval'; qr.approvedAt = null; qr.approvedBy = null; qr.approval = null; }
            // next quarter's goals are created once, when the review is sent
            (q0.nextGoals || []).slice(0, 6).forEach(g => {
              if (!clip(g.title, 200)) return;
              db.goals.push({ id: uid('g'), employeeId: q0.employeeId, quarter: /^Y\d{4}-Q[1-4]$/.test(String(q0.nextQuarter)) ? q0.nextQuarter : nextQuarter(quarter),
                type: ['performance', 'skill_development', 'level_up'].includes(g.type) ? g.type : 'performance',
                title: clip(g.title, 200), description: '', why: '', kpi: clip(g.kpi, 160), unit: clip(g.unit, 40),
                target: g.target == null || g.target === '' ? null : num(g.target), current: 0,
                progressMode: g.target ? 'metric' : 'manual', progress: 0, status: 'active',
                dueDate: cleanDate(g.dueDate) || quarterRange(nextQuarter(quarter)).end, ownerId: q0.employeeId, managerComment: '', evidence: [], updates: [], createdAt: now });
            });
          } else if (wasSent && !isAdmin(user)) {
            qr.status = 'draft'; qr.approvedAt = null; qr.approvedBy = null; qr.approval = null;
          }
          log(db, user.id, body.finalize ? 'quarterly.send' : 'quarterly.save', q0.employeeId + ' ' + quarter + ' ' + qr.status);
          return { ok: true, id: qr.id, status: qr.status };
        }

        /* ----- tasks ----- */
        /* Managers give tasks to the people they manage. The person moves their own
           task along (started, blocked, handed in); only the manager marks it done,
           and gives it a 1–5 quality rating when they do. */
        case 'saveTask': {
          const t0 = body.task || {};
          const existing = t0.id ? (db.tasks || []).find(x => x.id === t0.id) : null;
          const externalName = t0.employeeId ? '' : clip(t0.externalName, 120);
          const employeeId = existing ? existing.employeeId : t0.employeeId;
          if (existing) mustRunTask(db, user, existing);
          else if (externalName) { if (!isManager(user)) fail('Only managers can give tasks to people outside the team', 403); }
          else mustAssign(db, user, employeeId);
          if (t0.employeeId && t0.employeeId !== employeeId) mustAssign(db, user, t0.employeeId);
          if (!t0.employeeId && !externalName) fail('Choose who does this task');
          if (externalName && !isManager(user)) fail('Only managers can give tasks to people outside the team', 403);
          db.tasks = db.tasks || [];
          const t = existing || { id: uid('t'), createdAt: now, assignedBy: user.id, assignedByName: user.name, status: 'todo', revisions: 0, evidence: [], log: [] };
          const prevEmployee = existing ? existing.employeeId : null;
          Object.assign(t, {
            employeeId: externalName ? '' : (t0.employeeId || employeeId),
            externalName: externalName || undefined,
            title: clip(t0.title, 200) || fail('Give the task a title'),
            description: clip(t0.description, 4000),
            client: clip(t0.client, 160), project: clip(t0.project, 160),
            startDate: cleanDate(t0.startDate) || undefined,
            dueDate: cleanDate(t0.dueDate) || fail('Pick a due date'),
            dueTime: cleanTime(t0.dueTime) || undefined,
            priority: TASK_PRIORITIES.includes(t0.priority) ? t0.priority : 'normal'
          });
          if (t0.projectId !== undefined) {
            const pr = t0.projectId ? (db.projects || []).find(x => x.id === t0.projectId) : null;
            t.projectId = pr ? pr.id : null;
            if (pr && !t.project) t.project = pr.name;
            if (pr && !t.client) t.client = pr.client;
          }
          // a task can count toward one of the person's goals or milestones (its rating then shows there as evidence)
          if (t0.goalId !== undefined) t.goalId = (db.goals || []).some(g => g.id === t0.goalId && g.employeeId === t.employeeId) ? t0.goalId : undefined;
          if (t0.milestoneId !== undefined) t.milestoneId = (db.milestones || []).some(m => m.id === t0.milestoneId && m.employeeId === t.employeeId) ? t0.milestoneId : undefined;
          if (t.startDate && t.startDate > t.dueDate) fail('The start date is after the due date.');
          if (existing && (existing._dueKey || '') !== t.dueDate + ' ' + (t.dueTime || '')) t.reminded = {};   // a new deadline gets fresh reminders
          t._dueKey = t.dueDate + ' ' + (t.dueTime || '');
          if (!existing) db.tasks.push(t);
          if (t0.status && TASK_STATUSES.includes(t0.status) && t0.status !== t.status) {
            if (t0.status === 'done') {
              // big and long tasks get a 1–5 rating; small ones can be accepted without one (quality 0 = not rated)
              const role = finishRole(db, user, t) || fail('Only the person who gave this task can mark it done.', 403);
              const q = role === 'rate' ? num(t0.quality) : 0;
              if (q && (q < 1 || q > 5)) fail('A quality rating goes from 1 to 5.');
              setTaskStatus(t, 'done', user, now, t0.note);
              Object.assign(t, { quality: q || null, qualityNote: clip(t0.qualityNote, 1000), ratedBy: q ? user.id : undefined });
              if (t.employeeId !== me) notifyEmployee(db, t.employeeId, { kind: 'task', emoji: q >= 4 ? '🎉' : '✅', title: 'Task accepted: ' + t.title,
                body: (q ? 'Rated ' + q + ' out of 5' : 'Marked done') + (t.qualityNote ? ' · ' + clip(t.qualityNote, 140) : ''), href: '#/tasks' });
              afterTaskDone(db, t);
            } else setTaskStatus(t, t0.status, user, now, t0.note);
          } else if (t.status === 'done' && t0.quality != null && finishRole(db, user, t) === 'rate') {
            const q = num(t0.quality);
            if (q >= 1 && q <= 5) { t.quality = q; t.ratedBy = user.id; } else if (!q) { t.quality = null; t.ratedBy = undefined; }
            t.qualityNote = clip(t0.qualityNote, 1000);
          }
          if (t.employeeId !== me && prevEmployee !== t.employeeId && t.status !== 'done') {
            notifyEmployee(db, t.employeeId, { kind: 'task', emoji: '🗂️', title: 'New task: ' + t.title,
              body: 'From ' + user.name + ' · due ' + t.dueDate + (t.dueTime ? ' ' + t.dueTime : '') + (t.priority === 'urgent' || t.priority === 'high' ? ' · ' + t.priority + ' priority' : ''), href: '#/tasks' });
          }
          log(db, user.id, existing ? 'task.update' : 'task.create', t.title);
          return { ok: true, id: t.id };
        }
        case 'finishTask': {              // mark done (and rate, when allowed): see finishRole
          const t = (db.tasks || []).find(x => x.id === body.id) || fail('Task not found', 404);
          const role = finishRole(db, user, t) || fail('Only the person who gave this task can mark it done.', 403);
          const q = role === 'rate' ? num(body.quality) : 0;
          if (q && (q < 1 || q > 5)) fail('A quality rating goes from 1 to 5.');
          const wasDone = t.status === 'done';
          if (!wasDone) setTaskStatus(t, 'done', user, now, body.note);
          if (role === 'rate' || !wasDone) Object.assign(t, { quality: q || null, qualityNote: clip(body.qualityNote, 1000), ratedBy: q ? user.id : undefined });
          if (!wasDone) {
            if (t.employeeId && t.employeeId !== me) notifyEmployee(db, t.employeeId, { kind: 'task', emoji: q >= 4 ? '🎉' : '✅', title: 'Task accepted: ' + t.title,
              body: (q ? 'Rated ' + q + ' out of 5' : 'Marked done') + ' by ' + String(user.name || '').split(' ')[0] + (t.qualityNote ? ' · ' + clip(t.qualityNote, 140) : ''), href: '#/tasks' });
            afterTaskDone(db, t);
          }
          log(db, user.id, 'task.done', t.title + (q ? ' · ' + q + '/5' : ''));
          return { ok: true };
        }
        case 'moveTask': {                // the person working on it: start, block, hand in
          const t = (db.tasks || []).find(x => x.id === body.id) || fail('Task not found', 404);
          const managing = runsTask(db, user, t);
          if (t.employeeId !== me && !managing) fail('Not allowed', 403);
          if (t.status === 'done' && !managing) fail('This task is done. Ask your manager if it needs reopening.', 403);
          if (!['todo', 'in_progress', 'blocked', 'submitted'].includes(body.status)) fail('Only your manager can mark a task done.', 403);
          setTaskStatus(t, body.status, user, now, body.note);
          if (t.employeeId === me && (body.status === 'submitted' || body.status === 'blocked')) {
            const assigner = (db.users || []).find(u => u.id === t.assignedBy && u.active !== false && u.id !== user.id);
            const to = assigner ? [assigner.id] : managerIdsOf(db, t.employeeId);
            const first = String(user.name || 'Someone').split(' ')[0];
            notify(db, to, body.status === 'submitted'
              ? { kind: 'task', emoji: '📥', title: first + ' handed in “' + t.title + '”', body: 'Check it and rate it.', href: '#/tasks-team' }
              : { kind: 'task', emoji: '🚧', title: first + ' is blocked on “' + t.title + '”', body: clip(body.note, 200) || 'They need your help.', href: '#/tasks-team' });
          }
          log(db, user.id, 'task.move', t.title + ' → ' + body.status);
          return { ok: true };
        }
        case 'reviseTask': {              // manager sends handed-in work back for changes
          const t = (db.tasks || []).find(x => x.id === body.id) || fail('Task not found', 404);
          if (finishRole(db, user, t) !== 'rate') fail('Only the person who gave this task can send it back.', 403);
          if (t.status !== 'submitted') fail('Only handed-in work can be sent back for changes.');
          t.revisions = num(t.revisions) + 1;
          setTaskStatus(t, 'in_progress', user, now, 'Changes requested: ' + clip(body.note, 480));
          notifyEmployee(db, t.employeeId, { kind: 'task', emoji: '✏️', title: 'Changes requested: ' + t.title, body: clip(body.note, 200), href: '#/tasks' });
          log(db, user.id, 'task.revise', t.title);
          return { ok: true };
        }
        case 'deleteTask': {
          const t = (db.tasks || []).find(x => x.id === body.id) || fail('Task not found', 404);
          mustRunTask(db, user, t);
          db.tasks = db.tasks.filter(x => x.id !== body.id);
          log(db, user.id, 'task.delete', t.title);
          return { ok: true };
        }

        /* ----- projects (kicked off from the Price Builder) ----- */
        /* The plan waits in review: the project manager edits who does what and by
           when, then starts it. Starting turns every row into a real task. */
        case 'saveProject': {
          const p = mustRunProject(db, user, body.id);
          const x = body.project || {};
          if (x.name != null) p.name = clip(x.name, 200) || p.name;
          if (x.client != null) p.client = clip(x.client, 200);
          if (x.note != null) p.note = clip(x.note, 2000);
          if (cleanDate(x.startDate)) p.startDate = cleanDate(x.startDate);
          if (cleanDate(x.dueDate)) p.dueDate = cleanDate(x.dueDate);
          if (x.managerId && x.managerId !== p.managerId) {
            if (!isAdmin(user)) fail('Only an admin can change the project manager.', 403);
            const mu = (db.users || []).find(u => u.employeeId === x.managerId && u.active !== false && isManager(u));
            if (!mu) fail('The project manager needs a manager or admin account.');
            p.managerId = x.managerId;
            projectLog(p, user, 'Project manager changed');
          }
          if (p.status === 'review' && Array.isArray(x.plan)) p.plan = cleanPlan(x.plan);
          if (p.status === 'review' && body.rebalance) { autoAssign(db, p, true); projectLog(p, user, 'Re-balanced by workload'); }
          log(db, user.id, 'project.save', p.name);
          return { ok: true, id: p.id };
        }
        /* a project started by hand in Team (not from a Price Builder deal): it waits in review like the others */
        case 'newProject': {
          if (!isManager(user)) fail('Only managers and admins can add projects.', 403);
          const x = body.project || {};
          const managerId = isAdmin(user) && x.managerId ? x.managerId : me;
          const mu = (db.users || []).find(u => u.employeeId === managerId && u.active !== false && isManager(u));
          if (!mu) fail('The project manager needs a manager or admin account.');
          const start = cleanDate(x.startDate) || today();
          const due = cleanDate(x.dueDate) || fail('Pick the project due date.');
          if (due < start) fail('The due date is before the start date.');
          const items = String(x.tasks || '').split(/\n+/).map(t => t.trim()).filter(Boolean).slice(0, 80).map(title => ({ title: clip(title, 200), category: '' }));
          const p = createProject(db, { manual: true, managerId, startDate: start, days: Math.max(1, Math.round((Date.parse(due) - Date.parse(start)) / 86400000)),
            name: clip(x.name, 200) || fail('Give the project a name.'), client: clip(x.client, 200), note: clip(x.note, 2000), items,
            logText: 'Added in Team by ' + user.name }, user.name);
          if (managerId !== me) notifyEmployee(db, managerId, { kind: 'project', emoji: '🗂️', title: 'New project to plan: ' + p.name, body: 'Check who does what, then press Start project.', href: '#/project/' + p.id });
          log(db, user.id, 'project.new', p.name);
          return { ok: true, id: p.id };
        }
        case 'startProject': {
          const p = mustRunProject(db, user, body.id);
          if (p.status !== 'review') fail('This project has already started.');
          if (body.project && Array.isArray(body.project.plan)) p.plan = cleanPlan(body.project.plan);
          const rows = (p.plan || []).filter(r => r.title);
          if (!rows.length) fail('Add at least one task before starting.');
          rows.forEach(r => {
            if (r.externalName) { if (!r.dueDate) fail('Pick a due date for “' + r.title + '”.'); return; }
            const who = (db.employees || []).find(e => e.id === r.employeeId);
            if (!who) fail('Choose a person for “' + r.title + '”.');
            if (who.status === 'inactive') fail(who.name + ' is inactive. Choose someone else for “' + r.title + '”.');
            if (!canManage(db, user, who.id) && !(who.id === user.employeeId && p.managerId === user.employeeId)) fail('You cannot give tasks to ' + who.name + '.', 403);
            if (!r.dueDate) fail('Pick a due date for “' + r.title + '”.');
          });
          db.tasks = db.tasks || [];
          p.taskIds = rows.map(r => {
            const t = { id: uid('t'), createdAt: now, assignedBy: user.id, assignedByName: user.name, status: 'todo', revisions: 0,
              evidence: [], log: [], employeeId: r.externalName ? '' : r.employeeId, title: r.title, description: r.description, client: p.client,
              project: p.name, projectId: p.id, startDate: r.startDate && r.startDate <= r.dueDate ? r.startDate : undefined,
              dueDate: r.dueDate, dueTime: r.dueTime, priority: r.priority || 'normal' };
            if (r.externalName) t.externalName = r.externalName;
            t._dueKey = t.dueDate + ' ' + (t.dueTime || '');
            db.tasks.push(t);
            return t.id;
          });
          p.status = 'active';
          p.startedAt = now;
          p.startedBy = user.name;
          const per = {};
          rows.forEach(r => { per[r.employeeId] = (per[r.employeeId] || 0) + 1; });
          Object.keys(per).forEach(id => { if (id !== me) notifyEmployee(db, id, { kind: 'project', emoji: '🚀', title: 'You are on ' + p.name,
            body: per[id] + ' task' + (per[id] === 1 ? '' : 's') + ' for ' + (p.client || 'a new project') + '. Kick-off is today!', href: '#/tasks' }); });
          projectLog(p, user, 'Started · ' + rows.length + ' task' + (rows.length === 1 ? '' : 's') + ' sent to the team');
          log(db, user.id, 'project.start', p.name);
          return { ok: true, id: p.id, tasks: rows.length };
        }
        case 'projectStatus': {             // mark delivered, re-open, or cancel
          const p = mustRunProject(db, user, body.id);
          const to = body.status;
          if (!PROJECT_STATUSES.includes(to) || to === p.status) fail('Nothing to change.');
          if (to === 'review') fail('A started project cannot go back to review.');
          if (to === 'active' && p.status === 'review') fail('Use “Start project” instead.');
          if (to === 'done') {
            p.completedAt = now;
            const people = [...new Set((db.tasks || []).filter(t => t.projectId === p.id).map(t => t.employeeId))].filter(id => id !== me);
            people.forEach(id => notifyEmployee(db, id, { kind: 'project', emoji: '🎉', title: p.name + ' is delivered', body: 'Thank you for your part in it!', href: '#/' }));
            awardProject(db, p);
          }
          if (to === 'active') p.completedAt = null;
          if (to === 'cancelled') p.cancelledAt = now;
          p.status = to;
          projectLog(p, user, { done: 'Marked delivered', active: 'Re-opened', cancelled: 'Cancelled' }[to]);
          log(db, user.id, 'project.' + to, p.name);
          return { ok: true };
        }
        case 'deleteProject': {
          if (!isAdmin(user)) fail('Only an admin can delete a project.', 403);
          const p = (db.projects || []).find(x => x.id === body.id) || fail('Project not found', 404);
          db.projects = db.projects.filter(x => x.id !== p.id);
          (db.tasks || []).forEach(t => { if (t.projectId === p.id) t.projectId = null; });   // the tasks stay, without the link
          log(db, user.id, 'project.delete', p.name);
          return { ok: true };
        }

        /* ----- sales pipeline (proposals from the Price Builder) ----- */
        case 'salesFollowup': {           // a follow-up becomes a task, by default for the sales owner
          if (!isManager(user)) fail('Only managers and admins can create follow-ups.', 403);
          const q = await readQuote(body.quoteId) || fail('Proposal not found', 404);
          const who = employee(db, body.employeeId || salesRules(db).owner || me);
          if (!canManage(db, user, who.id) && who.id !== me) fail('You cannot give tasks to ' + who.name + '.', 403);
          if ((db.tasks || []).some(t => t.quoteId === q.id && TASK_OPEN.includes(t.status) && t.employeeId === who.id)) fail(who.name + ' already has an open follow-up for this proposal.');
          const s = q.setup || {}, last = (q.requests || []).slice(-1)[0];
          const c = last ? last.contact : { name: s.clientName };
          const lines = [clip(body.note, 1500), '',
            'Client: ' + (s.company || s.clientName || '') + (c && c.name ? ' (' + c.name + ')' : ''),
            c && c.email ? 'Email: ' + c.email : '', c && c.phone ? 'Phone: ' + c.phone : ''].filter((l, i) => i < 2 || l);
          db.tasks = db.tasks || [];
          const t = { id: uid('t'), createdAt: now, assignedBy: user.id, assignedByName: user.name, status: 'todo', revisions: 0, evidence: [], log: [],
            kind: 'followup', quoteId: q.id, employeeId: who.id, title: clip(body.title, 200) || 'Follow up: ' + (s.company || s.clientName || 'client') + (s.project ? ' · ' + s.project : ''),
            description: clip(lines.join('\n').trim(), 4000), client: s.company || s.clientName || '', project: s.project || '',
            dueDate: cleanDate(body.dueDate) || today(), priority: TASK_PRIORITIES.includes(body.priority) ? body.priority : 'high' };
          db.tasks.push(t);
          if (who.id !== me) notifyEmployee(db, who.id, { kind: 'sales', emoji: '☎️', title: t.title, body: 'From ' + user.name + ' · due ' + t.dueDate, href: '#/tasks' });
          log(db, user.id, 'sales.followup', t.title + ' → ' + who.name);
          return { ok: true, id: t.id };
        }
        case 'completeFollowup': {        // the person who followed up logs how it went
          const t = (db.tasks || []).find(x => x.id === body.id) || fail('Task not found', 404);
          if (t.kind !== 'followup') fail('This is not a follow-up task.');
          if (t.employeeId !== me && !canManage(db, user, t.employeeId)) fail('Not allowed', 403);
          if (!OUTCOMES[body.outcome]) fail('Choose how it went.');
          if (body.outcome === 'later' && !cleanDate(body.nextDate)) fail('Pick the date to follow up again.');
          t.outcome = body.outcome;
          t.outcomeNote = clip(body.note, 1500);
          setTaskStatus(t, 'done', user, now, OUTCOMES[body.outcome] + (body.note ? ': ' + clip(body.note, 300) : ''));
          if (body.outcome === 'later') {
            db.tasks.push({ ...t, id: uid('t'), createdAt: now, status: 'todo', log: [], evidence: [], outcome: '', outcomeNote: '',
              completedAt: null, deliveredAt: null, startedAt: null, submittedAt: null, submissions: 0, quality: null,
              title: t.title.replace(/^(Follow up again: |Follow up: )?/, 'Follow up again: '), dueDate: cleanDate(body.nextDate),
              description: (body.note ? 'Last time: ' + clip(body.note, 600) + '\n\n' : '') + String(t.description || '').replace(/^Last time:[^\n]*\n\n/, '') });
          }
          if (body.outcome === 'lost' && t.quoteId) {
            const q = await readQuote(t.quoteId);
            if (q) { q.status = 'lost'; q.lostReason = clip(body.note, 500) || 'Marked lost after a follow-up'; q.lostAt = now; q.updatedAt = now; await writeQuote(q); }
          }
          notify(db, adminIds(db).filter(id => id !== user.id), { kind: 'sales', emoji: body.outcome === 'won' ? '🤝' : body.outcome === 'lost' ? '🙁' : '☎️',
            title: String(user.name || '').split(' ')[0] + ' followed up: ' + (t.client || 'client'), body: OUTCOMES[body.outcome] + (body.note ? ' · ' + clip(body.note, 160) : ''), href: '#/sales' });
          log(db, user.id, 'sales.followup.done', t.title + ' · ' + body.outcome);
          return { ok: true };
        }
        case 'salesStatus': {             // mark a proposal lost, or bring it back
          if (!isManager(user)) fail('Only managers and admins can change this.', 403);
          const q = await readQuote(body.quoteId) || fail('Proposal not found', 404);
          if (body.status === 'lost') { q.status = 'lost'; q.lostReason = clip(body.reason, 500); q.lostAt = now; }
          else if (body.status === 'open') { q.status = (q.requests || []).length ? 'client-modified' : q.viewedAt ? 'viewed' : 'sent'; q.lostReason = ''; q.lostAt = null; }
          else fail('Unknown status');
          q.updatedAt = now;
          await writeQuote(q);
          log(db, user.id, 'sales.' + body.status, (q.setup || {}).company || q.id);
          return { ok: true };
        }
        case 'saveSalesRules': {
          if (!isAdmin(user)) fail('Only an admin can change the follow-up rules.', 403);
          const r = body.rules || {};
          const n = (v, d) => Math.max(0, Math.min(60, Math.round(num(v != null ? v : d))));
          const cur = salesRules(db);
          db.settings.sales = {
            owner: r.owner && (db.employees || []).some(e => e.id === r.owner) ? r.owner : cur.owner,
            sentDays: n(r.sentDays, cur.sentDays), openedDays: n(r.openedDays, cur.openedDays), repliedDays: n(r.repliedDays, cur.repliedDays),
            contractDays: n(r.contractDays, cur.contractDays), expiringDays: n(r.expiringDays, cur.expiringDays)
          };
          return { ok: true };
        }

        /* ----- profile, background, uploads ----- */
        case 'uploadUrl': {               // a short-lived link to put one file straight into storage
          const LIMITS = { avatar: [2, /^image\/(jpeg|png|webp)$/], background: [6, /^image\/(jpeg|png|webp)$/], logo: [2, /^image\/(jpeg|png|webp|svg\+xml)$/] };
          const lim = LIMITS[body.kind] || fail('Unknown upload');
          if (body.kind === 'logo' && !isAdmin(user)) fail('Only an admin can change the logo.', 403);
          const type = String(body.contentType || '').toLowerCase();
          if (!lim[1].test(type)) fail('Choose a JPG, PNG or WebP image.');
          if (num(body.size) > lim[0] * 1024 * 1024) fail('That file is larger than ' + lim[0] + ' MB.');
          const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[type] || 'bin';
          const pathname = 'team/' + body.kind + '/' + user.id + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext;
          if (MEDIA_PRIVATE) {
            // one-store setup: the picture goes through api/media.js into the private store
            // (a function takes at most 4.5 MB, and pictures are shrunk in the browser first)
            if (num(body.size) > 4 * 1024 * 1024) fail('That file is larger than 4 MB.');
            const t = signUpload({ pathname, validUntil: Date.now() + 15 * 60 * 1000, maximumSizeInBytes: 4 * 1024 * 1024, allowedContentTypes: [type] });
            return { ok: true, uploadUrl: '/api/media?token=' + encodeURIComponent(t), pathname };
          }
          const signed = await issueSignedToken({ token: MEDIA_TOKEN, pathname, operations: ['put'], validUntil: Date.now() + 15 * 60 * 1000,
            maximumSizeInBytes: lim[0] * 1024 * 1024, allowedContentTypes: [type] });
          const { presignedUrl } = await presignUrl(signed, { operation: 'put', pathname, allowOverwrite: true, cacheControlMaxAge: 31536000 });
          return { ok: true, uploadUrl: presignedUrl, pathname };
        }
        case 'savePrefs': {
          const u = db.users.find(x => x.id === user.id);
          const okUrl = v => v === '' || /^https:\/\/[a-z0-9.-]+\.(public\.blob\.vercel-storage\.com|blob\.vercel-storage\.com)\//i.test(String(v)) ||
            String(v).startsWith(LOCAL_MEDIA_PREFIX + 'team/');
          if (body.photo !== undefined) {
            if (!okUrl(body.photo)) fail('That photo link is not allowed.');
            const emp = db.employees.find(e => e.id === me) || fail('Your account is not linked to a team member.');
            emp.photo = clip(body.photo, 400);
          }
          if (body.bg !== undefined) {
            const b = body.bg || {};
            if (b.type === 'image' && !okUrl(b.value)) fail('That background link is not allowed.');
            u.prefs = { ...(u.prefs || {}), bg: ['preset', 'image', 'none'].includes(b.type) ? { type: b.type, value: clip(b.value, 400), dim: Math.max(0, Math.min(90, num(b.dim) || 55)) } : { type: 'none' } };
          }
          if (body.prefs && typeof body.prefs === 'object') {
            const p0 = body.prefs;
            u.prefs = { ...(u.prefs || {}), ...(p0.player != null ? { player: !!p0.player } : {}), ...(p0.sounds != null ? { sounds: !!p0.sounds } : {}) };
          }
          return { ok: true };
        }

        /* ----- notifications ----- */
        case 'readNotifications': {
          const ids = Array.isArray(body.ids) ? new Set(body.ids) : null;
          (db.notifications || []).forEach(n => { if (n.to === user.id && (!ids || ids.has(n.id))) n.read = true; });
          return { ok: true };
        }
        case 'pushSubscribe': {
          const sub = body.subscription || {};
          if (!/^https:\/\//.test(String(sub.endpoint || '')) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) fail('That device could not be registered.');
          db.pushSubs = (db.pushSubs || []).filter(s => s.endpoint !== sub.endpoint);
          db.pushSubs.push({ userId: user.id, endpoint: clip(sub.endpoint, 800), keys: { p256dh: clip(sub.keys.p256dh, 200), auth: clip(sub.keys.auth, 100) },
            ua: clip(body.ua, 160), createdAt: now });
          if (body.test !== false) notify(db, [user.id], { kind: 'info', emoji: '🔔', title: 'Notifications are on', body: 'You will hear about new tasks, kick-offs, reviews and wins here.', href: '#/' });
          return { ok: true };
        }
        case 'pushUnsubscribe': {
          db.pushSubs = (db.pushSubs || []).filter(s => !(s.endpoint === body.endpoint && s.userId === user.id));
          return { ok: true };
        }
        case 'testPush': {
          notify(db, [user.id], { kind: 'info', emoji: '👋', title: 'Test notification', body: 'If you can read this on your phone, notifications work.', href: '#/' });
          return { ok: true };
        }

        /* ----- the team playlist: the studio's Spotify playlist ----- */
        case 'setSpotify': {
          if (!isAdmin(user)) fail('Only an admin can set the Spotify playlist.', 403);
          const m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album)\/([A-Za-z0-9]+)/.exec(String(body.url || ''));
          if (body.url && !m) fail('Paste a Spotify playlist link (open.spotify.com/playlist/…).');
          db.music = db.music || { tracks: [], spotify: '' };
          db.music.spotify = m ? m[1] + '/' + m[2] : '';
          return { ok: true };
        }

        /* ----- the admin's messages and achievements ----- */
        case 'sendBroadcast': {
          if (!isAdmin(user)) fail('Only an admin can send messages to the team.', 403);
          const b = { id: uid('b'), title: clip(body.title, 140) || fail('Give the message a title.'), body: clip(body.body, 600), emoji: clip(body.emoji, 16) || '📣',
            href: /^#\//.test(String(body.href || '')) ? clip(body.href, 200) : '#/',
            audience: ['managers', 'everyone', 'partners'].includes(body.audience) ? body.audience : Array.isArray(body.audience) && body.audience.length ? body.audience.map(x => clip(x, 60)).slice(0, 100) : 'all',
            sendOn: cleanDate(body.sendOn), byName: user.name, createdAt: now, status: 'scheduled' };
          if (!audienceIds(db, b.audience).length) fail('Nobody would receive this message.');
          db.broadcasts = db.broadcasts || [];
          db.broadcasts.push(b);
          if (!b.sendOn || b.sendOn <= today()) sendBroadcast(db, b);
          if (db.broadcasts.length > 200) db.broadcasts = db.broadcasts.slice(-150);
          return { ok: true, id: b.id, status: b.status };
        }
        case 'deleteBroadcast': {
          if (!isAdmin(user)) fail('Admins only', 403);
          db.broadcasts = (db.broadcasts || []).filter(x => !(x.id === body.id && x.status === 'scheduled'));
          return { ok: true };
        }
        case 'saveAchievementSettings': {
          if (!isAdmin(user)) fail('Admins only', 403);
          const en = body.enabled || {};
          db.settings.achievements = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, en[a.key] != null ? !!en[a.key] : achievementOn(db, a.key)]));
          db.settings.notifications = { ...(db.settings.notifications || {}), adminAchievements: body.adminAchievements !== false };
          return { ok: true };
        }

        /* ----- promotion decision ----- */
        case 'savePromotion': {
          mustManage(db, user, body.employeeId);
          notPartner(db, body.employeeId);
          if (!PROMOTION_STATUSES.some(s => s.id === body.decision)) fail('Unknown decision');
          const emp = employee(db, body.employeeId);
          const nxt = nextLevel(db.settings, emp.levelId);
          db.promotions.push({ id: uid('p'), employeeId: emp.id, fromLevelId: emp.levelId,
            toLevelId: nxt ? nxt.id : null, decision: body.decision, decidedBy: user.id, decidedAt: now,
            notes: clip(body.notes, 1000), readiness: promotionReadiness(db, emp.id).percent });
          if (body.applyLevel && body.decision === 'approved' && nxt && isAdmin(user)) {
            emp.levelId = nxt.id; emp.trackId = nxt.trackId; emp.departmentId = nxt.departmentId;
            applyLevelTemplates(db, emp);
          }
          log(db, user.id, 'promotion.decide', emp.name + ' ' + body.decision);
          return { ok: true };
        }

        /* ----- private management notes ----- */
        case 'saveNote': {
          mustManage(db, user, body.employeeId);
          db.notes.push({ id: uid('n'), employeeId: body.employeeId, authorId: user.id, text: clip(body.text, 4000), createdAt: now });
          log(db, user.id, 'note.add', body.employeeId);
          return { ok: true };
        }
        case 'deleteNote': {
          const n = db.notes.find(x => x.id === body.id) || fail('Note not found', 404);
          mustManage(db, user, n.employeeId);
          db.notes = db.notes.filter(x => x.id !== body.id);
          return { ok: true };
        }

        /* ----- leave ----- */
        case 'requestLeave': {
          const employeeId = body.employeeId || me;
          if (employeeId !== me && !canManage(db, user, employeeId)) fail('Not allowed', 403);
          notPartner(db, employeeId);
          const from = cleanDate(body.from) || fail('Pick a start date');
          const to = cleanDate(body.to) || from;
          if (to < from) fail('The end date is before the start date.');
          if (!LEAVE_TYPES.some(t => t.id === body.type)) fail('Pick a leave type');
          const days = body.days ? num(body.days) : workingDays(from, to, db.settings.leave.workDays);
          if (days <= 0) fail('That range has no working days in it.');
          const bal = leaveBalance(db, employeeId);
          if (body.type === 'annual' && days > bal.annual.available) {
            fail('Only ' + bal.annual.available + ' days have been earned so far this leave year (' +
                 bal.annual.accrued + ' earned' + (bal.annual.carried ? ' + ' + bal.annual.carried + ' carried over' : '') + ').');
          }
          const row = { id: uid('l'), employeeId, type: body.type, from, to, days,
            note: clip(body.note, 1000), status: employeeId !== me && canManage(db, user, employeeId) && body.approve ? 'approved' : 'pending',
            createdAt: now, decidedBy: null, decidedAt: null, decisionNote: '' };
          if (row.status === 'approved') { row.decidedBy = user.id; row.decidedAt = now; }
          db.leave.push(row);
          if (row.status === 'pending') {
            const who = (db.employees.find(e => e.id === employeeId) || {}).name || 'Someone';
            notify(db, managerIdsOf(db, employeeId), { kind: 'leave', emoji: '🌴', title: 'Leave request from ' + who, body: days + ' day' + (days === 1 ? '' : 's') + ', ' + from + (to !== from ? ' to ' + to : ''), href: '#/team-leave' });
          }
          log(db, user.id, 'leave.request', employeeId + ' ' + from + '→' + to);
          return { ok: true, id: row.id, days };
        }
        case 'decideLeave': {
          const l = db.leave.find(x => x.id === body.id) || fail('Request not found', 404);
          mustManage(db, user, l.employeeId);
          if (!['approved', 'declined'].includes(body.decision)) fail('Unknown decision');
          l.status = body.decision; l.decidedBy = user.id; l.decidedAt = now; l.decisionNote = clip(body.note, 1000);
          notifyEmployee(db, l.employeeId, { kind: 'leave', emoji: body.decision === 'approved' ? '🌴' : '📅', title: 'Leave ' + (body.decision === 'approved' ? 'approved' : 'declined'),
            body: l.from + (l.to !== l.from ? ' to ' + l.to : '') + (l.decisionNote ? ' · ' + l.decisionNote : ''), href: '#/leave' });
          log(db, user.id, 'leave.' + body.decision, l.employeeId);
          return { ok: true };
        }
        case 'cancelLeave': {
          const l = db.leave.find(x => x.id === body.id) || fail('Request not found', 404);
          if (l.employeeId !== me && !canManage(db, user, l.employeeId)) fail('Not allowed', 403);
          if (l.status === 'approved' && l.employeeId === me && !canManage(db, user, l.employeeId) && l.from <= today()) {
            fail('Leave that has already started can only be cancelled by your manager.');
          }
          db.leave = db.leave.filter(x => x.id !== body.id);
          log(db, user.id, 'leave.cancel', l.employeeId);
          return { ok: true };
        }

        /* ----- settings and demo data ----- */
        case 'saveSettings': {
          if (!isAdmin(user)) fail('Admins only', 403);
          const s = body.settings;
          if (!s || typeof s !== 'object' || !Array.isArray(s.departments)) fail('Bad settings');
          db.settings = { ...db.settings, ...s };
          log(db, user.id, 'settings.save', '');
          return { ok: true };
        }
        case 'loadDemo': {
          if (!isAdmin(user)) fail('Admins only', 403);
          clearDemo(db);
          buildDemo(db, user);
          log(db, user.id, 'demo.load', '');
          return { ok: true };
        }
        case 'clearDemo': {
          if (!isAdmin(user)) fail('Admins only', 403);
          clearDemo(db);
          log(db, user.id, 'demo.clear', '');
          return { ok: true };
        }
        /* the admin switches skill ratings from out of 5 to out of 10: what each level needs, and any
           ratings already given, are doubled so nobody's position changes */
        case 'setSkillScale': {
          if (!isAdmin(user)) fail('Admins only', 403);
          if (db.settings.skillScale === 10) return { ok: true, already: true };
          Object.values(db.settings.levelSkills || {}).forEach(list => (list || []).forEach(k => { k.req = Math.min(10, num(k.req) * 2); }));
          (db.employeeSkills || []).forEach(x => { x.level = Math.min(10, num(x.level) * 2); });
          db.settings.skillScale = 10;
          log(db, user.id, 'skills.scale', 'out of 10');
          return { ok: true };
        }
        /* start fresh: the admin deletes every task (and, if they choose, the kicked-off projects) */
        case 'clearTasks': {
          if (!isAdmin(user)) fail('Admins only', 403);
          if (String(body.confirm || '').trim().toUpperCase() !== 'DELETE') fail('Type DELETE to confirm.');
          const n = (db.tasks || []).length, p = (db.projects || []).length;
          db.tasks = [];
          if (body.projects) db.projects = [];
          log(db, user.id, 'tasks.clear', n + ' tasks' + (body.projects ? ', ' + p + ' projects' : ''));
          return { ok: true, tasks: n, projects: body.projects ? p : 0 };
        }
        /* ----- sales leads ----- */
        case 'importLeads': {
          if (!isManager(user)) fail('Only managers can import leads', 403);
          const owner = body.ownerId && (db.employees || []).some(e => e.id === body.ownerId) ? body.ownerId : salesRules(db).owner;
          const r = importLeads(db, Array.isArray(body.rows) ? body.rows : [], user, owner, clip(body.source, 200) || 'Claude', now);
          if (r.added && owner && owner !== me) notifyEmployee(db, owner, { kind: 'task', emoji: '📇', title: r.added + ' new lead' + (r.added === 1 ? '' : 's') + ' to contact',
            body: 'From ' + user.name + ' · open Sales pipeline → Leads', href: '#/sales' });
          log(db, user.id, 'leads.import', r.added + ' added, ' + r.skipped.length + ' skipped');
          return { ok: true, ...r, ...leadsPayload(db, user) };
        }
        case 'saveLead': {
          const l0 = body.lead || {};
          db.salesLeads = db.salesLeads || [];
          let l = l0.id ? db.salesLeads.find(x => x.id === l0.id) || fail('Lead not found', 404) : null;
          if (l) {
            if (!runsLead(user, l)) fail('Not allowed', 403);
            applyLeadFields(l, l0);
          } else {
            if (!isManager(user)) fail('Only managers can add leads', 403);
            l = newLead(l0, user, salesRules(db).owner, now) || fail('Give the company or contact a name');
            const dup = findDuplicate(db.salesLeads, l);
            if (dup && !body.allowDuplicate) fail('Already a lead: ' + dup.company);
            db.salesLeads.push(l);
          }
          if (l0.ownerId !== undefined && isManager(user)) l.ownerId = (db.employees || []).some(e => e.id === l0.ownerId) ? l0.ownerId : null;
          if (l0.stage !== undefined && LEAD_STAGES.includes(l0.stage)) {
            if (l.stage !== l0.stage) (l.activity = l.activity || []).push({ id: uid('a'), at: now, by: user.id, byName: user.name, kind: 'stage', outcome: l0.stage, note: l0.stage === 'lost' ? clip(l0.lostReason, 300) : '' });
            l.stage = l0.stage;
            if (['won', 'lost'].includes(l.stage)) l.nextFollowUp = null;
          }
          l.updatedAt = now;
          log(db, user.id, l0.id ? 'lead.update' : 'lead.create', l.company);
          return { ok: true, id: l.id, ...leadsPayload(db, user) };
        }
        case 'logLeadActivity': {
          const l = (db.salesLeads || []).find(x => x.id === body.id) || fail('Lead not found', 404);
          if (!runsLead(user, l)) fail('Not allowed', 403);
          logLeadActivity(l, body.activity || {}, user, now);
          // optionally a task for the next follow-up, so it gets the usual reminders
          if (body.makeTask && l.nextFollowUp) {
            const who = l.ownerId && canAssign(db, user, l.ownerId) ? l.ownerId : me;
            if (who) {
              db.tasks = db.tasks || [];
              db.tasks.push({ id: uid('t'), kind: 'lead', leadId: l.id, employeeId: who, title: 'Follow up: ' + l.company, client: l.company, project: 'Sales leads',
                description: [l.contactName && 'Contact: ' + l.contactName + (l.role ? ' (' + l.role + ')' : ''), l.phone && 'Phone: ' + l.phone, l.email && 'Email: ' + l.email, l.need && 'Needs: ' + l.need].filter(Boolean).join('\n'),
                dueDate: l.nextFollowUp, priority: l.priority === 'hot' ? 'high' : 'normal', status: 'todo', createdAt: now, assignedBy: user.id, assignedByName: user.name, revisions: 0, evidence: [], log: [] });
              if (who !== me) notifyEmployee(db, who, { kind: 'task', emoji: '📞', title: 'Follow up: ' + l.company, body: 'Due ' + l.nextFollowUp + ' · from ' + user.name, href: '#/tasks' });
            }
          }
          l.updatedAt = now;
          log(db, user.id, 'lead.activity', l.company + ' · ' + (body.activity || {}).kind);
          return { ok: true, ...leadsPayload(db, user) };
        }
        case 'leadTask': {
          const l = (db.salesLeads || []).find(x => x.id === body.id) || fail('Lead not found', 404);
          if (!runsLead(user, l)) fail('Not allowed', 403);
          const who = body.employeeId || me;
          if (who !== me) mustAssign(db, user, who);
          const dueDate = cleanDate(body.dueDate) || fail('Pick a due date');
          db.tasks = db.tasks || [];
          const t = { id: uid('t'), kind: 'lead', leadId: l.id, employeeId: who, title: clip(body.title, 200) || 'Contact ' + l.company, client: l.company, project: 'Sales leads',
            description: clip(body.description, 4000), dueDate, dueTime: cleanTime(body.dueTime) || undefined, priority: ['low', 'normal', 'high', 'urgent'].includes(body.priority) ? body.priority : 'normal',
            status: 'todo', createdAt: now, assignedBy: user.id, assignedByName: user.name, revisions: 0, evidence: [], log: [] };
          db.tasks.push(t);
          if (who !== me) notifyEmployee(db, who, { kind: 'task', emoji: '📞', title: 'New task: ' + t.title, body: 'From ' + user.name + ' · due ' + dueDate, href: '#/tasks' });
          (l.activity = l.activity || []).push({ id: uid('a'), at: now, by: user.id, byName: user.name, kind: 'task', outcome: '', note: t.title + ' → ' + (((db.employees || []).find(e => e.id === who) || {}).name || '') + ', due ' + dueDate });
          log(db, user.id, 'lead.task', l.company + ' → ' + who);
          return { ok: true, taskId: t.id, ...leadsPayload(db, user) };
        }
        case 'deleteLead': {
          if (!isManager(user)) fail('Only managers can delete leads', 403);
          const before = (db.salesLeads || []).length;
          const ids = new Set([].concat(body.ids || body.id || []));
          db.salesLeads = (db.salesLeads || []).filter(x => !ids.has(x.id));
          log(db, user.id, 'lead.delete', (before - db.salesLeads.length) + ' lead(s)');
          return { ok: true, ...leadsPayload(db, user) };
        }
        default:
          fail('Unknown action');
      }
    });

    if (outbox && outbox.length) {
      try {
        const dead = await sendPush(saved, outbox);
        if (dead.length) await mutate(async d => { d.pushSubs = (d.pushSubs || []).filter(s => !dead.includes(s.endpoint)); });
      } catch (e) { /* a failed push never fails the save */ }
    }
    const user = currentUser(saved, req);
    return json(res, 200, { ...result, data: user ? payload(saved, user) : null });
  } catch (e) {
    const [status, error] = failure(e);
    return json(res, status, { error });
  }
}
