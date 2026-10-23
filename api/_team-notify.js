/* Notifications and achievements for the Team app.
   notify() stores a notification for each person (the bell in the app) and puts
   it in db._outbox; mutate() takes the outbox off before saving and api/team.js
   sends it as phone/desktop push after the save. Achievements are checked when
   work is finished and by the daily runs in api/cron.js. Amounts of money never
   go into a notification. */
import { uid, clip, today, isAdmin, isManager, taskDaysLate, TASK_OPEN, isPartner } from './_team-lib.js';
import { brand, zoneOffsetMs } from './_brand.js';

const partnerEmp = (db, id) => isPartner((db.employees || []).find(e => e.id === id));
const partnerUser = (db, u) => partnerEmp(db, u.employeeId);

export const ACHIEVEMENTS = [
  { key: 'ontime-3', emoji: '⏱️', title: 'On-time streak: 3', text: '3 tasks in a row delivered on time.', on: true },
  { key: 'ontime-5', emoji: '🔥', title: 'On-time streak: 5', text: '5 tasks in a row delivered on time.', on: true },
  { key: 'ontime-10', emoji: '🏆', title: 'On-time streak: 10', text: '10 tasks in a row delivered on time.', on: true },
  { key: 'ontime-25', emoji: '👑', title: 'On-time streak: 25', text: '25 tasks in a row delivered on time.', on: true },
  { key: 'clean-sweep', emoji: '🧹', title: 'Clean sweep', text: 'Every task due today is done or handed in.', on: true },
  { key: 'zero-overdue-week', emoji: '🛡️', title: 'Zero-overdue week', text: 'A full week of work with nothing overdue.', on: true },
  { key: 'perfect-5', emoji: '⭐', title: 'Perfect 5', text: 'A task rated 5 out of 5.', on: true },
  { key: 'quality-3', emoji: '💎', title: 'Quality run', text: '3 tasks in a row rated 4 or higher.', on: true },
  { key: 'first-time-right', emoji: '✨', title: 'First time right', text: '5 tasks in a row accepted with no revisions.', on: true },
  { key: 'early-bird', emoji: '🐦', title: 'Early bird', text: 'Handed in 2 or more days before the due date.', on: false },
  { key: 'project-on-time', emoji: '🚀', title: 'Project delivered on time', text: 'Your project was delivered on or before its due date.', on: true },
  { key: 'goal-done', emoji: '🎯', title: 'Goal completed', text: 'One of your goals is completed.', on: true },
  { key: 'milestone', emoji: '🏔️', title: 'Milestone reached', text: 'A milestone was marked achieved.', on: true },
  { key: 'strong-review', emoji: '🌟', title: 'Strong review', text: 'An approved monthly review of 4 or higher.', on: true },
  { key: 'anniversary', emoji: '🎂', title: 'Work anniversary', text: 'Another year with the agency.', on: true },
  { key: 'deal-won', emoji: '🤝', title: 'Deal won', text: 'A client signed the contract (to the admin and the sales owner).', on: true }
];
export const ACH = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, a]));
export const achievementOn = (db, key) => {
  const s = (db.settings && db.settings.achievements) || {};
  return s[key] != null ? !!s[key] : !!(ACH[key] && ACH[key].on);
};

/* ---------- who gets told ---------- */
/* the account someone signs in with (one with a password first) */
export const usersOf = (db, employeeId) => (db.users || []).filter(u => employeeId && u.employeeId === employeeId && u.active !== false);
export const userOf = (db, employeeId) => { const list = usersOf(db, employeeId); return list.find(u => u.hash) || list[0] || null; };
export const adminIds = db => (db.users || []).filter(u => u.active !== false && isAdmin(u)).map(u => u.id);
/* the nearest manager above someone who has an account; the admins when there is none */
export function managerIdsOf(db, employeeId) {
  const seen = new Set();
  let e = (db.employees || []).find(x => x.id === employeeId);
  while (e && e.managerId && !seen.has(e.managerId)) {
    seen.add(e.managerId);
    const m = (db.employees || []).find(x => x.id === e.managerId);
    const u = m && userOf(db, m.id);
    if (u && isManager(u)) return [u.id];
    e = m;
  }
  return adminIds(db);
}

/* store one notification per person, and queue the push */
export function notify(db, userIds, n) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  db.notifications = db.notifications || [];
  const at = new Date().toISOString();
  const tag = n.tag || uid('n');
  ids.forEach(to => {
    db.notifications.push({ id: uid('n'), to, kind: n.kind || 'info', emoji: n.emoji || '🔔', title: clip(n.title, 140), body: clip(n.body, 400),
      href: clip(n.href, 200) || '#/', at, read: false, from: n.from || null });
  });
  // keep the newest 80 per person
  if (db.notifications.length > 600) {
    const per = {};
    db.notifications = db.notifications.slice().reverse().filter(x => (per[x.to] = (per[x.to] || 0) + 1) <= 80).reverse();
  }
  db._outbox = (db._outbox || []).concat([{ to: ids, title: (n.emoji ? n.emoji + ' ' : '') + clip(n.title, 140), body: clip(n.body, 300), href: n.href || '#/', tag }]);
}
export const notifyEmployee = (db, employeeId, n) => employeeId ? notify(db, usersOf(db, employeeId).map(u => u.id), n) : null;

/* ---------- achievements ---------- */
function award(db, employeeId, key, extra) {
  if (!achievementOn(db, key) || partnerEmp(db, employeeId)) return false;     // creative partners: tasks only
  const a = ACH[key];
  db.achievements = db.achievements || [];
  db.achievements.push({ id: uid('a'), employeeId, key, at: new Date().toISOString(), note: clip(extra && extra.note, 200) });
  if (db.achievements.length > 4000) db.achievements = db.achievements.slice(-3000);
  const emp = (db.employees || []).find(e => e.id === employeeId) || {};
  const first = String(emp.name || 'Someone').split(' ')[0];
  notifyEmployee(db, employeeId, { kind: 'achievement', emoji: a.emoji, title: 'Achievement: ' + a.title, body: (extra && extra.body) || a.text, href: '#/' });
  // the admins hear about the team's wins too
  const own = usersOf(db, employeeId).map(u => u.id);
  const admins = adminIds(db).filter(id => !own.includes(id));
  if (admins.length && !(db.settings.notifications && db.settings.notifications.adminAchievements === false)) {
    notify(db, admins, { kind: 'achievement', emoji: a.emoji, title: first + ': ' + a.title, body: (extra && extra.adminBody) || a.text, href: '#/people/' + employeeId });
  }
  return true;
}
const recentlyAwarded = (db, employeeId, key, days) => (db.achievements || []).some(x => x.employeeId === employeeId && x.key === key &&
  Date.parse(x.at) > Date.now() - days * 86400000);

/* after a task is marked done: streaks and quality */
export function afterTaskDone(db, t) {
  if (!t.employeeId) return;                       // someone outside the team (no account)
  const done = (db.tasks || []).filter(x => x.employeeId === t.employeeId && x.status === 'done' && x.kind !== 'followup' && x.deliveredAt)
    .sort((a, b) => String(b.deliveredAt).localeCompare(String(a.deliveredAt)));
  let streak = 0;
  for (const x of done) { if (x.dueDate && taskDaysLate(x) === 0) streak++; else break; }
  if (t.dueDate && taskDaysLate(t) === 0 && [3, 5, 10, 25].includes(streak)) award(db, t.employeeId, 'ontime-' + streak);
  if (Number(t.quality) === 5) award(db, t.employeeId, 'perfect-5', { body: '“' + t.title + '” was rated 5 out of 5.' });
  const rated = done.filter(x => Number(x.quality) > 0);
  let q = 0; for (const x of rated) { if (Number(x.quality) >= 4) q++; else break; }
  if (q === 3) award(db, t.employeeId, 'quality-3');
  let clean = 0; for (const x of done) { if (!Number(x.revisions)) clean++; else break; }
  if (clean === 5 && !Number(t.revisions)) award(db, t.employeeId, 'first-time-right');
  if (t.dueDate && t.submittedAt && Date.parse(t.dueDate) - Date.parse(String(t.submittedAt).slice(0, 10)) >= 2 * 86400000 && !recentlyAwarded(db, t.employeeId, 'early-bird', 7)) {
    award(db, t.employeeId, 'early-bird', { body: '“' + t.title + '” was handed in early.' });
  }
}
export const awardGoal = (db, g) => award(db, g.employeeId, 'goal-done', { body: '“' + g.title + '” is completed.' });
export const awardMilestone = (db, m) => award(db, m.employeeId, 'milestone', { body: '“' + m.title + '” was achieved.' });
export const awardReview = (db, r) => { if (Number(r.overall) >= 4) award(db, r.employeeId, 'strong-review', { body: 'Your review scored ' + Number(r.overall).toFixed(1) + ' out of 5.' }); };
export function awardProject(db, p) {
  if (!p.dueDate || String(p.completedAt || '').slice(0, 10) > p.dueDate) return;
  const people = [...new Set((db.tasks || []).filter(t => t.projectId === p.id).map(t => t.employeeId))].filter(Boolean);
  people.forEach(id => award(db, id, 'project-on-time', { body: '“' + p.name + '” was delivered on time. Great teamwork!' }));
}

/* ---------- daily runs (api/cron.js) ---------- */
const workDay = (db, iso) => ((db.settings.leave && db.settings.leave.workDays) || [1, 2, 3, 4, 5]).includes(new Date(iso + 'T12:00:00Z').getUTCDay());
const activeEmps = db => (db.employees || []).filter(e => e.status !== 'inactive');

/* morning: what is due today, scheduled messages, anniversaries, ideas for the admin */
export function morningRun(db) {
  const now = today();
  const sent = { digests: 0, broadcasts: 0, anniversaries: 0 };
  if (workDay(db, now)) activeEmps(db).forEach(e => {
    const open = (db.tasks || []).filter(t => t.employeeId === e.id && TASK_OPEN.includes(t.status) && t.status !== 'submitted');
    const dueToday = open.filter(t => t.dueDate === now), late = open.filter(t => t.dueDate && t.dueDate < now);
    if (!late.length) return;                          // what is due today gets its own reminder (reminderRun)
    const parts = [dueToday.length ? dueToday.length + ' due today' : '', late.length ? late.length + ' overdue' : ''].filter(Boolean);
    notifyEmployee(db, e.id, { kind: 'digest', emoji: late.length ? '⏰' : '☀️', title: 'Good morning, ' + String(e.name).split(' ')[0],
      body: 'Tasks: ' + parts.join(' · ') + (dueToday[0] ? '. First up: ' + dueToday[0].title : ''), href: '#/tasks' });
    sent.digests++;
  });
  // the admin's scheduled messages
  (db.broadcasts || []).filter(b => b.status === 'scheduled' && b.sendOn && b.sendOn <= now).forEach(b => { sendBroadcast(db, b); sent.broadcasts++; });
  // work anniversaries
  activeEmps(db).forEach(e => {
    if (!e.startDate || e.startDate.slice(5) !== now.slice(5) || e.startDate.slice(0, 4) >= now.slice(0, 4)) return;
    const years = Number(now.slice(0, 4)) - Number(e.startDate.slice(0, 4));
    if (award(db, e.id, 'anniversary', { body: years + ' year' + (years === 1 ? '' : 's') + ' with ' + brand().name + ' today. Thank you!', adminBody: years + ' year' + (years === 1 ? '' : 's') + ' with ' + brand().name + ' today.' })) sent.anniversaries++;
  });
  return sent;
}
/* ---------- due-date reminders (every hour) ----------
   A task is due at its due time (the agency's time zone; 17:00 when none is set). The person gets a reminder the day
   before, on the morning of the day, 6 hours before and 2 hours before. Each is sent once (t.reminded);
   when several fall due together (a task given at the last minute) only the most urgent goes out.
   Outside the team (no account), the reminder goes to whoever gave the task. Quiet from 21:00 to 07:00. */
export const DEFAULT_DUE_TIME = '17:00';
/* the agency's time zone (Brand & region) */
const offset = atMs => zoneOffsetMs(brand().timeZone, atMs);
export const dueAt = t => {
  const naive = Date.parse(t.dueDate + 'T' + (t.dueTime || DEFAULT_DUE_TIME) + ':00Z');
  return naive - offset(naive - offset(naive));
};
const fmtTime = hm => { const [h, m] = hm.split(':').map(Number); return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' am' : ' pm'); };
export function reminderRun(db, nowMs = Date.now()) {
  const local = new Date(nowMs + offset(nowMs)), hour = local.getUTCHours(), todayLocal = local.toISOString().slice(0, 10);
  const tomorrow = new Date(nowMs + offset(nowMs) + 86400000).toISOString().slice(0, 10);
  if (hour < 7 || hour >= 21) return { sent: 0, nothingChanged: true };
  let sent = 0, changed = false;
  (db.tasks || []).forEach(t => {
    if (!t.dueDate || !['todo', 'in_progress', 'blocked'].includes(t.status)) return;
    const left = (dueAt(t) - nowMs) / 3600000;
    if (left <= 0) return;
    const r = t.reminded || {};
    // the reminders whose moment has come, most urgent last
    const due = [
      ['d1', t.dueDate === tomorrow && hour >= 8],
      ['d0', t.dueDate === todayLocal && hour >= 8 && left > 6],
      ['h6', left <= 6 && left > 2],
      ['h2', left <= 2]
    ].filter(([k, now]) => now && !r[k]).map(([k]) => k);
    if (!due.length) return;
    // a later reminder makes the earlier ones pointless
    const order = ['d1', 'd0', 'h6', 'h2'], pick = due[due.length - 1];
    order.slice(0, order.indexOf(pick) + 1).forEach(k => { r[k] = true; });
    t.reminded = r; changed = true;
    const at = fmtTime(t.dueTime || DEFAULT_DUE_TIME);
    const text = { d1: ['📅', 'Due tomorrow: ', 'Due tomorrow at ' + at + '.'], d0: ['☀️', 'Due today: ', 'Due today at ' + at + '.'],
      h6: ['⏳', '6 hours left: ', 'Due at ' + at + ' today.'], h2: ['⏰', '2 hours left: ', 'Due at ' + at + '. Hand it in when it is ready.'] }[pick];
    const n = { kind: 'reminder', emoji: text[0], title: text[1] + t.title, body: text[2] + (t.project ? ' · ' + t.project : ''), href: '#/tasks' };
    if (t.employeeId) notifyEmployee(db, t.employeeId, n);
    else if (t.assignedBy) notify(db, [t.assignedBy], { ...n, title: text[1] + t.title + ' (' + (t.externalName || 'outside the team') + ')', href: '#/tasks-team' });
    sent++;
  });
  return changed ? { sent } : { sent: 0, nothingChanged: true };
}

/* evening (work days): clean sweep; Fridays: zero-overdue week */
export function eveningRun(db) {
  const now = today();
  const out = { sweeps: 0, weeks: 0 };
  if (!workDay(db, now)) return out;
  activeEmps(db).forEach(e => {
    const mine = (db.tasks || []).filter(t => t.employeeId === e.id && t.kind !== 'followup');
    const dueToday = mine.filter(t => t.dueDate === now);
    if (dueToday.length && dueToday.every(t => t.status === 'done' || t.status === 'submitted') && !recentlyAwarded(db, e.id, 'clean-sweep', 0.5)) {
      if (award(db, e.id, 'clean-sweep', { body: 'All ' + dueToday.length + ' task' + (dueToday.length === 1 ? '' : 's') + ' due today are done. Enjoy your evening!' })) out.sweeps++;
    }
    if (new Date(now + 'T12:00:00Z').getUTCDay() === 5) {
      const weekAgo = new Date(Date.parse(now) - 6 * 86400000).toISOString().slice(0, 10);
      const week = mine.filter(t => t.dueDate && t.dueDate >= weekAgo && t.dueDate <= now);
      const lateNow = mine.some(t => TASK_OPEN.includes(t.status) && t.status !== 'submitted' && t.dueDate && t.dueDate < now);
      const lateDone = week.some(t => t.status === 'done' && taskDaysLate(t) > 0);
      if (week.length >= 2 && !lateNow && !lateDone && award(db, e.id, 'zero-overdue-week')) out.weeks++;
    }
  });
  return out;
}

/* ---------- the admin's messages ---------- */
export function audienceIds(db, audience) {
  const users = (db.users || []).filter(u => u.active !== false);
  if (audience === 'managers') return users.filter(u => isManager(u)).map(u => u.id);
  if (audience === 'partners') return users.filter(u => partnerUser(db, u)).map(u => u.id);
  if (audience === 'everyone') return users.map(u => u.id);
  if (Array.isArray(audience)) return users.filter(u => audience.includes(u.employeeId) || audience.includes(u.id)).map(u => u.id);
  return users.filter(u => !partnerUser(db, u)).map(u => u.id);       // "the team": creative partners only get studio messages when picked
}
export function sendBroadcast(db, b) {
  notify(db, audienceIds(db, b.audience), { kind: 'broadcast', emoji: b.emoji || '📣', title: b.title, body: b.body, href: b.href || '#/', from: b.byName });
  b.status = 'sent';
  b.sentAt = new Date().toISOString();
  b.reach = audienceIds(db, b.audience).length;
}

/* Days worth a greeting. Settings → Holidays picks the list (the Ethiopia or the
   International preset, or none) and can add the agency's own days. Fixed dates are
   Gregorian; the Ethiopian list's Fasika and Eids move every year (approximate dates,
   confirm before sending). Messages use the agency name from Brand & region. */
const HOLIDAY_LISTS = {
  ethiopia: [
    ['01-01', '🎆', 'Happy New Year!', 'Happy New Year from all of us at {name}! 🎉 Here is to a year of bold work together.'],
    ['01-07', '🎄', 'Melkam Genna!', 'Melkam Genna! 🎄 Wishing you and your family a joyful Ethiopian Christmas.'],
    ['01-19', '💧', 'Melkam Timket!', 'Melkam Timket! 💧 Wishing everyone a blessed Epiphany.'],
    ['03-02', '🇪🇹', 'Adwa Victory Day', 'Happy Adwa Victory Day! 🇪🇹 Proud of where we come from.'],
    ['03-08', '💐', 'International Women’s Day', 'Happy Women’s Day to the brilliant women of {name}! 💐'],
    ['05-01', '🛠️', 'Labour Day', 'Happy Labour Day! 🛠️ Thank you for everything you build.'],
    ['05-05', '🇪🇹', 'Patriots’ Victory Day', 'Happy Patriots’ Victory Day! 🇪🇹'],
    ['09-11', '🌼', 'Melkam Enkutatash!', 'Melkam Enkutatash! 🌼 Happy Ethiopian New Year from everyone at {name}. May this year bring great work and good health.'],
    ['09-27', '🔥', 'Melkam Meskel!', 'Melkam Meskel! 🔥 Wishing everyone a bright and joyful Meskel.'],
    ['12-25', '🎁', 'Merry Christmas', 'Merry Christmas to everyone celebrating today! 🎁']
  ],
  international: [
    ['01-01', '🎆', 'Happy New Year!', 'Happy New Year from all of us at {name}! 🎉 Here is to a year of bold work together.'],
    ['03-08', '💐', 'International Women’s Day', 'Happy Women’s Day to the brilliant women of {name}! 💐'],
    ['05-01', '🛠️', 'Labour Day', 'Happy Labour Day! 🛠️ Thank you for everything you build.'],
    ['12-25', '🎁', 'Merry Christmas', 'Merry Christmas to everyone celebrating today! 🎁'],
    ['12-31', '🥂', 'New Year’s Eve', 'Thank you for a great year, everyone. See you in the new one! 🥂']
  ],
  none: []
};
const MOVING_LISTS = {
  ethiopia: { // approximate; Fasika = Ethiopian Orthodox Easter
    '2027-03-10': ['🌙', 'Eid Mubarak!', 'Eid Mubarak! 🌙 Wishing everyone celebrating Eid al-Fitr peace and joy.'],
    '2027-05-02': ['🐣', 'Melkam Fasika!', 'Melkam Fasika! 🐣 Wishing you and your family a blessed Easter.'],
    '2027-05-17': ['🕌', 'Eid al-Adha Mubarak', 'Eid al-Adha Mubarak! 🕌 Wishing everyone a blessed Arafa.'],
    '2028-02-27': ['🌙', 'Eid Mubarak!', 'Eid Mubarak! 🌙 Wishing everyone celebrating Eid al-Fitr peace and joy.'],
    '2028-04-16': ['🐣', 'Melkam Fasika!', 'Melkam Fasika! 🐣 Wishing you and your family a blessed Easter.']
  }
};
export const HOLIDAY_PRESETS = Object.keys(HOLIDAY_LISTS);
/* settings.holidays = { preset: 'ethiopia' | 'international' | 'none', custom: [{ date: 'MM-DD', emoji, title, body }] } */
function holidaysOf(db) {
  const h = (db && db.settings && db.settings.holidays) || {};
  const preset = HOLIDAY_LISTS[h.preset] ? h.preset : 'ethiopia';
  const named = s => String(s).replace(/\{name\}/g, brand().name);
  const fixed = HOLIDAY_LISTS[preset].map(x => [x[0], x[1], x[2], named(x[3])])
    .concat((Array.isArray(h.custom) ? h.custom : []).filter(c => /^\d{2}-\d{2}$/.test(c.date || '') && c.title)
      .map(c => [c.date, c.emoji || '📣', String(c.title), String(c.body || c.title)]));
  return { fixed, moving: MOVING_LISTS[preset] || {} };
}
export function upcomingDays(fromIso, days, db) {
  const out = [];
  const { fixed, moving } = holidaysOf(db);
  for (let i = 0; i <= days; i++) {
    const d = new Date(Date.parse(fromIso + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
    fixed.filter(h => h[0] === d.slice(5)).forEach(h => out.push({ date: d, emoji: h[1], title: h[2], body: h[3] }));
    if (moving[d]) out.push({ date: d, emoji: moving[d][0], title: moving[d][1], body: moving[d][2], approx: true });
  }
  return out;
}

/* ideas for the admin's next message */
export function recommendations(db) {
  const now = today(), out = [];
  upcomingDays(now, 21, db).forEach(h => out.push({ kind: 'holiday', when: h.date, emoji: h.emoji, title: h.title, body: h.body, audience: 'all',
    why: (h.approx ? 'Around ' : '') + new Date(h.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) + (h.approx ? ' (date moves each year; check it)' : '') }));
  activeEmps(db).forEach(e => {
    if (!e.startDate) return;
    for (let i = 0; i <= 14; i++) {
      const d = new Date(Date.parse(now + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
      if (d.slice(5) === e.startDate.slice(5) && d.slice(0, 4) > e.startDate.slice(0, 4)) {
        const y = Number(d.slice(0, 4)) - Number(e.startDate.slice(0, 4));
        out.push({ kind: 'anniversary', when: d, emoji: '🎂', title: 'Happy work anniversary, ' + String(e.name).split(' ')[0] + '!',
          body: 'Today ' + e.name + ' celebrates ' + y + ' year' + (y === 1 ? '' : 's') + ' at ' + brand().name + '. Thank you for everything! 🎉', audience: 'all', why: e.name + ' · ' + y + ' year' + (y === 1 ? '' : 's') });
      }
    }
    if (e.startDate >= new Date(Date.parse(now) - 7 * 86400000).toISOString().slice(0, 10) && e.startDate <= now) {
      out.push({ kind: 'welcome', when: now, emoji: '👋', title: 'Welcome ' + String(e.name).split(' ')[0] + '!', body: 'Please give a warm welcome to ' + e.name + ', who just joined the team. 👋', audience: 'all', why: 'Started ' + e.startDate });
    }
  });
  const week = Date.now() - 7 * 86400000;
  const wins = (db.achievements || []).filter(a => Date.parse(a.at) > week && ['ontime-5', 'ontime-10', 'ontime-25', 'zero-overdue-week', 'project-on-time'].includes(a.key));
  const byKey = {};
  wins.forEach(a => { const e = (db.employees || []).find(x => x.id === a.employeeId); if (e) (byKey[a.key] = byKey[a.key] || new Set()).add(String(e.name).split(' ')[0]); });
  Object.keys(byKey).forEach(k => out.push({ kind: 'celebrate', when: now, emoji: ACH[k].emoji, title: 'Shout-out: ' + ACH[k].title,
    body: 'Big shout-out to ' + [...byKey[k]].join(', ') + ' for “' + ACH[k].title + '” this week! ' + ACH[k].emoji, audience: 'all', why: 'This week' }));
  (db.projects || []).filter(p => p.status === 'done' && Date.parse(p.completedAt) > week).forEach(p => out.push({ kind: 'celebrate', when: now, emoji: '🚀',
    title: p.name + ' is delivered!', body: '“' + p.name + '” for ' + (p.client || 'our client') + ' is delivered. Thank you, team! 🚀', audience: 'all', why: 'Delivered ' + String(p.completedAt).slice(0, 10) }));
  const dueTasks = (db.tasks || []).filter(t => TASK_OPEN.includes(t.status) && t.status !== 'submitted' && t.dueDate && t.dueDate < now).length;
  if (dueTasks >= 5) out.push({ kind: 'nudge', when: now, emoji: '⏰', title: 'Let’s close the open loops', body: 'A few tasks are past their due dates. Take ten minutes today to update or hand them in. 🙏', audience: 'all', why: dueTasks + ' overdue tasks across the team' });
  return out.slice(0, 12);
}
