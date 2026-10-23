/* Projects: the bridge from the Price Builder to the team.
   When a deal is kicked off, the agreed scope becomes a project with a task
   plan. Each task goes to the person in the right department with the fewest
   open tasks. The plan waits "in review" for the project manager, who edits it
   and presses Start; only then do the tasks reach people. */
import { uid, clip, num, TASK_OPEN, TASK_PRIORITIES, isAdmin, teamOf, isPartner } from './_team-lib.js';

export const PROJECT_STATUSES = ['review', 'active', 'done', 'cancelled'];

/* which department usually does a piece of work (checked in order; first match wins) */
const ROUTES = [
  { dept: 'video_production', track: 'editing_track', re: /\b(edit(ing)?|post[- ]?production|motion|animation|colou?r grad|subtitl|sound design|voice ?over)/i },
  { dept: 'video_production', track: 'cinematography_track', re: /\b(video|film|shoot|footage|cinemat|photo|drone|reel|pre[- ]?production|storyboard|camera|production day)/i },
  { dept: 'creative', re: /\b(strateg|positioning|naming|architecture|messaging|concept|creative direction|audit|research|workshop|tone of voice|copy ?writing|script)/i },
  { dept: 'design', re: /\b(design|logo|identity|visual|typograph|colou?r|graphic|icon|guideline|template|layout|illustrat|packag|menu|sign|card|letterhead|print|mock ?up|uniform|website|ui\b|ux\b|key visual|collateral)/i },
  { dept: 'admin', track: 'marketing_track', re: /\b(social|content|community|ads?\b|advert|media buy|seo|report|analytics|newsletter|influencer|launch|marketing|management|calendar|campaign)/i },
  { dept: 'admin', track: 'operations_track', re: /\b(coordinat|logistic|event|production manage|printing|delivery|handover)/i }
];
export function routeFor(text) {
  return ROUTES.find(r => r.re.test(text)) || { dept: 'design' };
}

/* open tasks per person, plus tasks already planned in projects still in review */
export function workload(db, skipProjectId) {
  const load = {};
  (db.tasks || []).forEach(t => { if (TASK_OPEN.includes(t.status)) load[t.employeeId] = (load[t.employeeId] || 0) + 1; });
  (db.projects || []).filter(p => p.status === 'review' && p.id !== skipProjectId)
    .forEach(p => (p.plan || []).forEach(r => { if (r.employeeId) load[r.employeeId] = (load[r.employeeId] || 0) + 1; }));
  return load;
}

const active = e => e && e.status !== 'inactive';
const userOf = (db, employeeId) => (db.users || []).find(u => u.employeeId === employeeId && u.active !== false) || null;

/* who the project manager may hand work to: an admin can use anyone; a manager their own team */
export function assignPool(db, managerEmployeeId) {
  const u = userOf(db, managerEmployeeId);
  const mgr = (db.employees || []).find(e => e.id === managerEmployeeId);
  let pool = u && isAdmin(u) ? (db.employees || []).filter(active) : teamOf(db, managerEmployeeId).filter(active);
  if (!pool.length && mgr) pool = [mgr];
  return pool;
}

/* a creative partner's specialities: "video_production" (the whole department) or "admin:marketing_track" */
const covers = (e, dept, track) => isPartner(e) && (e.covers || []).some(c => c === dept || (track && c === dept + ':' + track));

const deptName = (db, id) => (((db.settings || {}).departments || []).find(d => d.id === id) || {}).name || id;

/* give each row (that has no person yet, or all rows when `all`) to the least busy suitable person */
export function autoAssign(db, project, all) {
  const pool = assignPool(db, project.managerId);
  if (!pool.length) return;
  const load = workload(db, project.id);
  if (!all) (project.plan || []).forEach(r => { if (r.employeeId) load[r.employeeId] = (load[r.employeeId] || 0) + 1; });
  const order = (a, b) => (load[a.id] || 0) - (load[b.id] || 0) || String(a.name).localeCompare(String(b.name));
  (project.plan || []).forEach(r => {
    if (r.externalName) return;                       // someone outside the team, chosen by hand
    if (!all && r.employeeId && pool.some(e => e.id === r.employeeId)) return;
    const route = routeFor(r.title + ' ' + (r.category || ''));
    const byTrack = route.track ? pool.filter(e => e.trackId === route.track || covers(e, route.dept, route.track)) : [];
    const byDept = pool.filter(e => e.departmentId === route.dept || covers(e, route.dept, route.track));
    // nobody fits: the least busy person of the core team (partners only get work in their specialities)
    const core = pool.filter(e => !isPartner(e));
    const cands = (byTrack.length ? byTrack : byDept.length ? byDept : core.length ? core : pool).slice().sort(order);
    const pick = cands[0];
    const before = load[pick.id] || 0;
    r.employeeId = pick.id;
    r.reason = byDept.length
      ? deptName(db, route.dept) + (cands.length > 1 ? ' · least busy of ' + cands.length : '')
      : 'Nobody in ' + deptName(db, route.dept) + ' · least busy person';
    load[pick.id] = before + 1;
  });
}

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/* one task per deliverable; due dates spread across the delivery time, category by category */
export function planFromScope(items, startDate, days) {
  const cats = [];
  items.forEach(it => { if (!cats.includes(it.category)) cats.push(it.category); });
  const span = Math.max(3, num(days) || 14);
  return items.filter(it => it.category !== 'Costs included').map((it, i) => {
    const step = cats.indexOf(it.category) + 1;
    return {
      key: 'r' + i + Math.random().toString(36).slice(2, 6),
      title: clip(it.title + (num(it.qty) > 1 ? ' × ' + it.qty + (it.unit ? ' ' + it.unit : '') : ''), 200),
      description: clip(it.desc, 4000),
      category: clip(it.category, 160),
      employeeId: '', reason: '', priority: 'normal',
      startDate: step > 1 ? addDays(startDate, Math.round(span * (step - 1) / cats.length)) : startDate,
      dueDate: addDays(startDate, Math.max(1, Math.round(span * step / cats.length)))
    };
  });
}

/* a deal from the Price Builder becomes a project waiting for review */
export function createProject(db, input, byName) {
  db.projects = db.projects || [];
  const existing = db.projects.find(p => p.quoteId && p.quoteId === input.quoteId && p.status !== 'cancelled');
  if (existing) return existing;
  const now = new Date().toISOString();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(input.startDate || '')) ? input.startDate : now.slice(0, 10);
  const days = Math.max(1, num(input.days) || 14);
  const p = {
    ...(input.manual ? { manual: true } : {}),
    id: uid('p'), status: 'review', quoteId: clip(input.quoteId, 60), slug: clip(input.slug, 60),
    name: clip(input.name, 200) || 'New project', client: clip(input.client, 200),
    managerId: input.managerId, startDate: start, dueDate: addDays(start, days),
    timeline: clip(input.timeline, 120), days, amount: clip(input.amount, 120),
    contractNumber: clip(input.contractNumber, 40), note: clip(input.note, 2000),
    plan: planFromScope(input.items || [], start, days),
    createdAt: now, createdByName: clip(byName, 120) || 'Price Builder', log: [{ at: now, name: byName || 'Price Builder', text: input.logText || 'Kicked off from the Price Builder' }]
  };
  autoAssign(db, p, true);
  db.projects.push(p);
  return p;
}

/* rows the project manager edited in the browser, cleaned */
export function cleanPlan(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 200).map((r, i) => ({
    key: clip(r.key, 40) || 'r' + i + Math.random().toString(36).slice(2, 6),
    title: clip(r.title, 200), description: clip(r.description, 4000), category: clip(r.category, 160),
    employeeId: r.externalName ? '' : clip(r.employeeId, 60), externalName: clip(r.externalName, 120) || undefined, reason: clip(r.reason, 200),
    priority: TASK_PRIORITIES.includes(r.priority) ? r.priority : 'normal',
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(r.startDate || '')) ? r.startDate : undefined,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(r.dueDate || '')) ? r.dueDate : '',
    dueTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.dueTime || '')) ? r.dueTime : undefined
  }));
}

export function projectProgress(db, p) {
  const tasks = (db.tasks || []).filter(t => t.projectId === p.id);
  const done = tasks.filter(t => t.status === 'done').length;
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: tasks.length, done,
    open: tasks.filter(t => TASK_OPEN.includes(t.status)).length,
    handedIn: tasks.filter(t => t.status === 'submitted').length,
    overdue: tasks.filter(t => TASK_OPEN.includes(t.status) && t.status !== 'submitted' && t.dueDate && t.dueDate < today).length,
    pct: tasks.length ? Math.round(done / tasks.length * 100) : 0
  };
}

/* what the Price Builder shows about a kicked-off deal */
export function projectStatusFor(db, projectId) {
  const p = (db.projects || []).find(x => x.id === projectId);
  if (!p) return null;
  const mgr = (db.employees || []).find(e => e.id === p.managerId);
  return { id: p.id, status: p.status, name: p.name, manager: mgr ? mgr.name : '', startedAt: p.startedAt || null,
           completedAt: p.completedAt || null, dueDate: p.dueDate, planned: (p.plan || []).length, progress: projectProgress(db, p) };
}
