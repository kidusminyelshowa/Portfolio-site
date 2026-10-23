/* Demo team for the Team Growth System.
   Fictional people, realistic numbers: three to four months of reviews, current
   quarter goals, milestones in mixed states, skill ratings and some leave.
   Admins can delete all of it from Settings once the real team is in. */
import { uid, quarterOf, quarterMonths, quarterRange, monthOf, reviewScore, workingDays, taskStats, monthRange } from './_team-lib.js';
import { LEVEL_SKILLS, LEVEL_MILESTONES } from './_team-config.js';

const iso = d => d.toISOString().slice(0, 10);
const shift = (months, day) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + months); if (day) d.setUTCDate(day); return iso(d); };
const monthsBack = n => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };

/* when each demo person usually starts and hands in work (local hours, stored as UTC+3) */
const WORK_HOURS = { hanna: [9, 16], samuel: [11, 18], liya: [10, 14], yonas: [7, 12], meron: [14, 21], kalkidan: [8, 11], rahel: [9, 15], nahom: [10, 17], betty: [13, 19] };

const PEOPLE = [
  { key: 'hanna', name: 'Hanna Tesfaye', email: 'hanna@example.com', dept: 'design', track: 'design_track', level: 'designer', role: 'manager', start: '2023-02-06', lead: true },
  { key: 'samuel', name: 'Samuel Girma', email: 'samuel@example.com', dept: 'design', track: 'design_track', level: 'junior_designer', role: 'employee', start: '2025-01-13', manager: 'hanna' },
  { key: 'liya', name: 'Liya Bekele', email: 'liya@example.com', dept: 'design', track: 'design_track', level: 'intern', role: 'employee', start: '2026-06-01', manager: 'hanna' },
  { key: 'yonas', name: 'Yonas Alemu', email: 'yonas@example.com', dept: 'video_production', track: 'cinematography_track', level: 'cinematographer', role: 'employee', start: '2024-09-02', lead: true },
  { key: 'meron', name: 'Meron Haile', email: 'meron@example.com', dept: 'video_production', track: 'editing_track', level: 'editor', role: 'employee', start: '2025-03-17', manager: 'yonas' },
  { key: 'kalkidan', name: 'Kalkidan Abebe', email: 'kalkidan@example.com', dept: 'admin', track: 'operations_track', level: 'operations_manager', role: 'manager', start: '2024-04-15', lead: true },
  { key: 'rahel', name: 'Rahel Desta', email: 'rahel@example.com', dept: 'admin', track: 'marketing_track', level: 'marketing_manager', role: 'employee', start: '2025-08-04', lead: true },
  { key: 'nahom', name: 'Nahom Assefa', email: 'nahom@example.com', dept: 'sales', track: 'sales_track', level: 'sales_representative', role: 'employee', start: '2025-05-05', manager: 'kalkidan' },
  { key: 'betty', name: 'Betty Mulugeta', email: 'betty@example.com', dept: 'sales', track: 'sales_track', level: 'sales_representative', role: 'employee', start: '2026-02-02', manager: 'kalkidan' }
];

// scores per person per month (oldest first): believable, varied, not all rising
const SCORES = {
  hanna: [[4, 4, 4, 5, 4], [4, 5, 4, 5, 4], [5, 4, 5, 5, 4]],
  samuel: [[3, 4, 3, 4, 4], [4, 4, 4, 4, 4], [4, 4, 4, 5, 4]],
  liya: [[3, 3, 2, 4, 4], [3, 3, 3, 4, 4]],
  yonas: [[4, 4, 4, 3, 3], [4, 4, 4, 4, 4], [4, 5, 4, 4, 4]],
  meron: [[3, 3, 3, 4, 3], [3, 4, 3, 4, 4], [4, 4, 3, 4, 4]],
  kalkidan: [[4, 4, 4, 4, 3], [4, 4, 5, 4, 4], [4, 5, 5, 4, 4]],
  rahel: [[3, 3, 3, 4, 4], [3, 4, 3, 4, 4], [4, 4, 4, 4, 5]],
  nahom: [[4, 4, 4, 4, 3], [3, 4, 3, 4, 3], [4, 4, 4, 4, 4]],
  betty: [[3, 3, 3, 4, 4], [3, 3, 3, 4, 4]]
};

const FEEDBACK = {
  wins: ['Strong, consistent delivery this month and good energy in reviews.', 'Handled a difficult client round calmly and kept quality high.', 'Took initiative without being asked and it showed in the work.', 'Turned work around quickly without dropping the standard.'],
  improve: ['Ask for direction earlier when a brief is unclear.', 'Tighten the first round so fewer revisions are needed.', 'Keep files and handover notes organised.', 'Push the concept further before moving to execution.'],
  focus: ['Own one project end to end next month.', 'Present your thinking, not only the final file.', 'Close the loop on follow-ups within two days.', 'Spend time on the skill gap we agreed on.']
};

const GOALS = {
  design: [
    { type: 'performance', title: 'Deliver 95% of projects on time', kpi: 'On-time delivery', target: 95, unit: '%', current: 88 },
    { type: 'skill_development', title: 'Develop 3 independent campaign concepts', kpi: 'Concepts presented', target: 3, unit: 'concepts', current: 2 },
    { type: 'level_up', title: 'Lead 2 small client projects from brief to delivery', kpi: 'Projects led', target: 2, unit: 'projects', current: 1 }
  ],
  video_production: [
    { type: 'performance', title: 'Cut editing turnaround to 4 days', kpi: 'Average turnaround', target: 4, unit: 'days', current: 6 },
    { type: 'skill_development', title: 'Deliver 2 pieces with original motion graphics', kpi: 'Pieces delivered', target: 2, unit: 'pieces', current: 1 },
    { type: 'level_up', title: 'Own one full production from plan to delivery', kpi: 'Productions owned', target: 1, unit: 'productions', current: 0 }
  ],
  admin: [
    { type: 'performance', title: 'Deliver 9 of 10 projects on schedule', kpi: 'Projects on schedule', target: 9, unit: 'projects', current: 7 },
    { type: 'skill_development', title: 'Document 3 repeatable studio processes', kpi: 'Processes documented', target: 3, unit: 'docs', current: 2 },
    { type: 'level_up', title: 'Halve the issues needing founder intervention', kpi: 'Founder interventions', target: 4, unit: 'per month', current: 6 }
  ],
  sales: [
    { type: 'performance', title: 'Generate 60 qualified leads this quarter', kpi: 'Qualified leads', target: 60, unit: 'leads', current: 41 },
    { type: 'skill_development', title: 'Improve proposal-to-close conversion to 25%', kpi: 'Conversion rate', target: 25, unit: '%', current: 18 },
    { type: 'level_up', title: 'Run the full funnel on 3 accounts unaided', kpi: 'Accounts owned', target: 3, unit: 'accounts', current: 2 }
  ]
};

export function buildDemo(db, adminUser) {
  db.tasks = db.tasks || [];
  const q = quarterOf(), qEnd = quarterRange(q).end;
  const ids = {};
  const admin = (db.employees || []).find(e => e.id === (adminUser && adminUser.employeeId));

  PEOPLE.forEach(p => {
    const id = uid('e');
    ids[p.key] = id;
    db.employees.push({
      id, name: p.name, email: p.email, demo: true,
      departmentId: p.dept, trackId: p.track, levelId: p.level,
      managerId: null, startDate: p.start, status: 'active',
      phone: '', notes: '', createdAt: new Date().toISOString()
    });
    db.users.push({
      id: uid('u'), email: p.email, name: p.name, role: p.role, employeeId: id,
      salt: '', hash: '', active: true, demo: true, createdAt: new Date().toISOString()
    });
  });
  // reporting lines: leads report to the admin, everyone else to their lead
  PEOPLE.forEach(p => {
    const e = db.employees.find(x => x.id === ids[p.key]);
    e.managerId = p.manager ? ids[p.manager] : (admin ? admin.id : null);
  });

  PEOPLE.forEach(p => {
    const empId = ids[p.key];
    const rows = SCORES[p.key] || [];
    const reviewerId = (db.users.find(u => u.employeeId === (p.manager ? ids[p.manager] : (admin ? admin.id : null))) || {}).id || (adminUser || {}).id;

    // monthly reviews, oldest first, ending with last month
    rows.forEach((row, i) => {
      const period = monthsBack(rows.length - i);
      const scores = { quality: row[0], execution: row[1], ownership: row[2], collaboration: row[3], growth: row[4] };
      db.reviews.push({
        id: uid('r'), employeeId: empId, reviewerId, period, status: 'approved',
        sentAt: new Date(period + '-28T09:00:00Z').toISOString(), approvedAt: new Date(period + '-28T15:00:00Z').toISOString(),
        approvedBy: (adminUser || {}).id || null,
        approval: { by: (adminUser || {}).id || null, name: (adminUser || {}).name || 'Founder', at: new Date(period + '-28T15:00:00Z').toISOString() },
        acknowledgedAt: i < rows.length - 1 ? new Date(period + '-29T08:00:00Z').toISOString() : null, acknowledgedNote: '',
        scores, overall: reviewScore(db.settings, scores),
        roleScores: {}, salesKpis: p.dept === 'sales' ? {
          qualified_leads: 12 + i * 3, meetings_opportunities: 6 + i, proposals: 4 + i,
          deals_won: 1 + (i % 2), conversion_rate: 16 + i * 3, revenue_generated: 180000 + i * 60000,
          follow_up_discipline: 3 + (i % 2), crm_pipeline_management: 3, communication_professionalism: 4
        } : {},
        wins: FEEDBACK.wins[i % FEEDBACK.wins.length],
        improve: FEEDBACK.improve[i % FEEDBACK.improve.length],
        observation: '', nextFocus: FEEDBACK.focus[i % FEEDBACK.focus.length],
        privateNote: i === rows.length - 1 ? 'Internal: keep an eye on workload next month.' : '',
        submittedAt: new Date(period + '-28T09:00:00Z').toISOString(), createdAt: new Date(period + '-25T09:00:00Z').toISOString()
      });
    });

    // skills: mostly at or near the level requirement, with a couple of real gaps
    const skills = LEVEL_SKILLS[p.level] || [];
    skills.forEach((sk, i) => {
      const base = sk.req + (i % 4 === 0 ? -1 : i % 3 === 0 ? 0 : 1);
      db.employeeSkills.push({
        employeeId: empId, name: sk.name, level: Math.max(1, Math.min(5, base)),
        lastReviewedAt: monthsBack(1) + '-28', note: ''
      });
    });

    // three goals for this quarter
    (GOALS[p.dept] || GOALS.design).forEach((g, i) => {
      const status = i === 1 && (p.key === 'meron' || p.key === 'nahom') ? 'at_risk' : (i === 0 && p.key === 'kalkidan' ? 'completed' : 'active');
      db.goals.push({
        id: uid('g'), employeeId: empId, quarter: q, type: g.type, title: g.title,
        description: '', why: '', kpi: g.kpi, unit: g.unit, target: g.target,
        current: status === 'completed' ? g.target : g.current,
        progressMode: 'metric', progress: 0, status,
        dueDate: qEnd, ownerId: empId, managerComment: '',
        evidence: [], updates: [], createdAt: new Date().toISOString()
      });
    });

    // promotion milestones from the level template, some achieved
    const mss = LEVEL_MILESTONES[p.level] || LEVEL_MILESTONES.junior_designer;
    mss.forEach((title, i) => {
      const achieved = i < Math.max(2, Math.round(mss.length * (p.key === 'samuel' ? 0.62 : 0.45)));
      db.milestones.push({
        id: uid('m'), employeeId: empId, title, description: '', targetLevelId: null,
        skillName: '', dueDate: shift(1, 28), responsibility: i % 4 === 0,
        status: achieved ? 'achieved' : (i === mss.length - 1 ? 'blocked' : i % 2 ? 'in_progress' : 'not_started'),
        evidence: achieved ? [{ at: monthsBack(1) + '-20', by: reviewerId, text: 'Reviewed in the monthly meeting', url: '' }] : [],
        reviewerComment: '', achievedAt: achieved ? monthsBack(1) + '-20' : null, createdAt: new Date().toISOString()
      });
    });

    // a little leave history
    if (['samuel', 'meron', 'nahom'].includes(p.key)) {
      const from = shift(1, 12), to = shift(1, 14);
      db.leave.push({
        id: uid('l'), employeeId: empId, type: 'annual', from, to,
        days: workingDays(from, to, db.settings.leave.workDays), note: 'Family trip',
        status: 'pending', createdAt: new Date().toISOString(), decidedBy: null, decidedAt: null, decisionNote: ''
      });
    }
    if (['hanna', 'liya', 'betty', 'yonas'].includes(p.key)) {
      const from = shift(-2, 10), to = shift(-2, 12);
      db.leave.push({
        id: uid('l'), employeeId: empId, type: 'annual', from, to,
        days: workingDays(from, to, db.settings.leave.workDays), note: '',
        status: 'approved', createdAt: new Date().toISOString(), decidedBy: (adminUser || {}).id || null,
        decidedAt: new Date().toISOString(), decisionNote: ''
      });
    }
  });

  // tasks: about three months of work each, mostly on time, a few late or reworked
  const TASK_TITLES = {
    design: ['Logo refinements', 'Social media kit', 'Pitch deck layout', 'Packaging mock-ups', 'Brand guidelines update', 'Campaign key visual', 'Menu redesign', 'Website hero banners'],
    creative: ['Campaign concept review', 'Brand direction', 'Pitch creative', 'Portfolio refresh'],
    video_production: ['Product shoot', 'Launch film edit', 'Colour grade', 'Behind-the-scenes cut', 'Interview edit', 'Reel cut-downs', 'Sound mix', 'Location scout'],
    admin: ['Weekly production schedule', 'Supplier quotes', 'Client onboarding pack', 'Newsletter', 'Campaign report', 'Process write-up', 'Budget tracker', 'Event plan'],
    sales: ['Follow up warm leads', 'Proposal for hotel group', 'Pipeline clean-up', 'Pitch meeting prep', 'Pricing sheet', 'Case study for bank', 'Renewal call list', 'Trade show leads']
  };
  const CLIENTS = ['Bunberi', 'Dalga', 'Blue Oven', 'Jami', 'Sini', 'Kefa Coffee'];
  const lateness = { samuel: [0, 0, 2, 0, 0, 1, 0], liya: [0, 3, 1, 0, 2, 0], meron: [0, 4, 0, 2, 0, 0, 3], nahom: [1, 0, 0, 5, 0, 0], betty: [0, 0, 1, 0, 0] };
  const qualityOf = { hanna: 5, samuel: 4, liya: 3, yonas: 4, meron: 3, kalkidan: 4, rahel: 4, nahom: 3, betty: 4 };
  const addDays = (d0, n) => { const d = new Date(d0 + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const now0 = iso(new Date());
  PEOPLE.forEach(p => {
    const empId = ids[p.key];
    const titles = TASK_TITLES[p.dept] || TASK_TITLES.design;
    const lates = lateness[p.key] || [0, 0, 0, 1, 0, 0];
    const lead = p.manager ? ids[p.manager] : (admin ? admin.id : null);
    const byUser = db.users.find(u => u.employeeId === lead) || adminUser || {};
    const base = { employeeId: empId, assignedBy: byUser.id || null, assignedByName: byUser.name || 'Manager', description: '', project: '', evidence: [], log: [], demo: true };
    // finished work, spread over the last ~90 days
    lates.forEach((late, i) => {
      const due = addDays(now0, -88 + i * Math.floor(80 / lates.length));
      const delivered = addDays(due, late ? late : -(i % 3));
      const revisions = (i + p.key.length) % 4 === 0 ? 1 : 0;
      const quality = Math.max(1, Math.min(5, qualityOf[p.key] + (i % 3 === 2 ? -1 : i % 4 === 1 ? 1 : 0) - (late > 2 ? 1 : 0)));
      // each person has their own rhythm (local time), so Insights has patterns to show
      const startH = (WORK_HOURS[p.key] || [9, 15])[0] + (i % 2), handH = (WORK_HOURS[p.key] || [9, 15])[1] + (i % 3) - 1;
      const at = (d, h) => d + 'T' + String(Math.max(0, Math.min(23, h - 3))).padStart(2, '0') + ':' + String((i * 17) % 60).padStart(2, '0') + ':00.000Z';
      const started = at(addDays(due, -8), startH), handed = at(delivered, handH), closed = addDays(delivered, 1) + 'T07:00:00.000Z';
      db.tasks.push({ ...base, id: uid('t'),
        title: titles[i % titles.length], client: CLIENTS[(i + p.key.length) % CLIENTS.length],
        dueDate: due, priority: i % 5 === 0 ? 'high' : 'normal', status: 'done', createdAt: addDays(due, -10) + 'T06:00:00.000Z',
        startedAt: started, submittedAt: handed, deliveredAt: handed,
        completedAt: closed, revisions, submissions: revisions + 1,
        quality, qualityNote: '', ratedBy: byUser.id || null,
        log: [{ at: started, by: null, name: p.name, from: 'todo', to: 'in_progress', note: '' },
          { at: handed, by: null, name: p.name, from: 'in_progress', to: 'submitted', note: '' },
          { at: closed, by: byUser.id || null, name: byUser.name || 'Manager', from: 'submitted', to: 'done', note: '' }] });
    });
    // open work: something in progress, something not started, and either handed in or overdue
    const open = [
      { status: 'in_progress', due: addDays(now0, 4) },
      { status: 'todo', due: addDays(now0, 9) },
      ['meron', 'nahom'].includes(p.key) ? { status: 'in_progress', due: addDays(now0, -2) } : { status: 'submitted', due: addDays(now0, 1) }
    ];
    open.forEach((o, i) => db.tasks.push({ ...base, id: uid('t'),
      title: titles[(lates.length + i) % titles.length], client: CLIENTS[(i + 2) % CLIENTS.length],
      dueDate: o.due, priority: i === 2 ? 'high' : 'normal', status: o.status, createdAt: addDays(o.due, -7) + 'T08:00:00.000Z',
      startedAt: o.status === 'todo' ? null : addDays(o.due, -5) + 'T08:00:00.000Z',
      submittedAt: o.status === 'submitted' ? now0 + 'T09:00:00.000Z' : null, deliveredAt: null, completedAt: null,
      revisions: 0, submissions: o.status === 'submitted' ? 1 : 0, quality: null }));
  });

  // one review waiting for the founder, to show the approval step
  const sam = ids.samuel;
  const samLead = db.users.find(u => u.employeeId === ids.hanna);
  const month = monthOf();
  if (!db.reviews.some(r => r.employeeId === sam && r.period === month)) {
    const scores = { quality: 4, execution: 4, ownership: 4, collaboration: 4, growth: 5 };
    const r = monthRange(month);
    db.reviews.push({
      id: uid('r'), employeeId: sam, reviewerId: samLead ? samLead.id : null, period: month, status: 'awaiting_approval',
      scores, overall: reviewScore(db.settings, scores), roleScores: {}, salesKpis: {},
      wins: 'Led the Dalga social kit end to end and presented it confidently.', improve: 'Check type details before handing in.',
      observation: '', nextFocus: 'Present concepts to the client directly.', privateNote: '',
      taskEvidence: taskStats(db.tasks.filter(t => t.employeeId === sam), r.from, r.to),
      sentAt: new Date().toISOString(), sentBy: { by: samLead ? samLead.id : null, name: 'Hanna Tesfaye', at: new Date().toISOString() },
      createdAt: new Date().toISOString(), evidence: []
    });
  }

  db.notes.push({
    id: uid('n'), employeeId: ids.samuel, authorId: (adminUser || {}).id || null,
    text: 'Management only: strong candidate for Designer if concept development keeps improving this quarter.',
    createdAt: new Date().toISOString()
  });
  return db;
}

export function clearDemo(db) {
  const demoIds = new Set((db.employees || []).filter(e => e.demo).map(e => e.id));
  db.employees = (db.employees || []).filter(e => !e.demo);
  db.users = (db.users || []).filter(u => !u.demo);
  const keep = list => (list || []).filter(x => !demoIds.has(x.employeeId));
  db.employeeSkills = keep(db.employeeSkills);
  db.goals = keep(db.goals);
  db.milestones = keep(db.milestones);
  db.reviews = keep(db.reviews);
  db.quarterlies = keep(db.quarterlies);
  db.promotions = keep(db.promotions);
  db.notes = keep(db.notes);
  db.leave = keep(db.leave);
  db.tasks = keep(db.tasks);
  (db.employees || []).forEach(e => { if (demoIds.has(e.managerId)) e.managerId = null; });
  return db;
}
