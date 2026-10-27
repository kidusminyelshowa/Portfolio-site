/* The "my growth" side: dashboard, goals, milestones, skills, reviews,
   career path and leave. Managers see the same screens for themselves. */
import {
  el, frag, S, me, settings, empById, subject, employees, canManage, isManager, isAdmin, partnerEmp, tasksOf,
  goalsOf, milestonesOf, reviewsOf, skillsOf, leaveOf, quarterliesOf,
  levelOf, nextLevelOf, levelName, deptName, levelSkills, universal, ratingScale, goalTypeName,
  chip, statusChip, avatar, bar, meter, donut, spark, tile, card, empty, field, input, textarea, select, checkbox,
  lineChart, barRows, stacked,
  money, pct, score, dateShort, monthName, monthShort, today, thisMonth, sinceText, daysBetween,
  modal, closeModal, toast, act, STATUS_LABEL, quarterLabel, quarterDates, userName, noteModal, skillScale
} from '/team/ui.js';
import { brandName, brand, isSolo, teamSize } from '/team/ui.js';
import { loadSales } from '/team/sales.js';
import { icon } from '/team/icons.js';
import { tasksCard, taskEvidenceCard, deliveryTiles, taskBoard, linkedTasks } from '/team/tasks.js';
import { hello, promoCards, achievementsCard } from '/team/social.js';
import { studioDashboard } from '/team/studio.js';

const go = hash => { location.hash = hash; };

/* ================= a creative partner's home: their tasks, nothing else ================= */
function partnerHome(emp) {
  const own = emp.id === (me() || {}).employeeId;
  const actions = own ? (S.data.actions || []).filter(a => a.kind === 'task') : [];
  return frag([
    own ? hello() : null,
    own ? promoCards() : null,
    el('section', { class: 'card', style: 'margin-bottom:14px' }, [
      el('div', { class: 'headrow' }, [
        avatar(emp.name, 'lg'),
        el('div', { class: 'grow' }, [el('h2', { style: 'font-size:22px', text: emp.name }), el('p', { class: 'dim', text: emp.title || 'Creative partner' })]),
        el('div', { class: 'row wrap' }, [chip('Creative partner', 'partnerbadge')])
      ])
    ]),
    el('div', { style: 'margin-bottom:14px' }, [deliveryTiles(emp.tasks.recent)]),
    actions.length ? el('div', { style: 'margin-bottom:14px' }, [card('Needs your attention', null, [
      el('div', { class: 'list' }, actions.slice(0, 4).map(a => el('div', { class: 'item' }, [
        chip(a.level === 'warn' ? 'Late' : 'Soon', a.level === 'warn' ? 'bad' : 'warn'), el('span', { class: 'grow', text: a.text }),
        el('button', { class: 'sm ghost', text: 'Open', onclick: () => go(a.href) })])))
    ])]) : null,
    card('Your tasks', 'Drag a card to move it along, or tap it for the details', [taskBoard(tasksOf(emp.id), { emptyText: 'Tasks from ' + brandName() + ' appear here.' })])
  ]);
}

/* ================= first run: four steps for a new admin, gone once done or dismissed ================= */
const SETUP_KEY = 'gz-setup-dismissed';
function setupCard() {
  try { if (localStorage.getItem(SETUP_KEY)) return null; } catch (e) { /* private mode: still show it */ }
  const root = el('section', { class: 'card setup' });
  const draw = sales => {
    const b = brand(), solo = isSolo();
    const partners = employees().some(e => e.status !== 'inactive' && partnerEmp(e));
    const steps = [
      { done: !!(b.name && b.name !== 'Your Agency' && b.email), title: 'Add your business details', why: 'Name, logo, colours, contact and bank details. They appear on proposals, contracts and invoices.', href: '#/settings', label: 'Open settings' },
      { done: !!(sales && sales.catalogSaved), title: 'Set your prices', why: 'The price list starts with sample prices. Put in yours once and every quote uses them.', href: '/price#/prices', label: 'Open price list' },
      { done: !!(sales && sales.rows && sales.rows.length), title: 'Send your first proposal', why: 'Build a quote and send the client a live link they can adjust.', href: '/price#/new', label: 'New quote' },
      solo
        ? { done: partners, optional: true, title: 'Add a creative partner (optional)', why: 'Freelancers you bring in for specific work. They only see the tasks you give them.', href: '#/people', label: 'Add partner' }
        : { done: teamSize() > 1, title: 'Add your team', why: 'Each person gets their own sign-in, tasks and growth plan.', href: '#/people', label: 'Add people' }
    ];
    const required = steps.filter(x => !x.optional);
    if (required.every(x => x.done) && (steps[3].done || steps[3].optional)) { root.remove(); return; }
    const left = required.filter(x => !x.done).length;
    root.textContent = '';
    root.append(
      el('div', { class: 'cardhead' }, [
        el('div', {}, [el('h3', { text: 'Get set up' }), el('p', { class: 'sub', text: left ? left + ' of ' + required.length + ' steps left. This card goes away when you are done.' : 'All set. You can hide this card.' })]),
        el('button', { class: 'sm ghost', text: 'Hide', onclick: () => { try { localStorage.setItem(SETUP_KEY, '1'); } catch (e) { /* ignore */ } root.remove(); } })
      ]),
      el('ol', { class: 'setup-steps' }, steps.map((x, i) => el('li', { class: x.done ? 'done' : '' }, [
        el('span', { class: 'n', 'aria-hidden': 'true' }, [x.done ? icon('check', 15) : String(i + 1)]),
        el('span', { class: 'grow' }, [el('b', { text: x.title }), el('small', { text: x.done ? 'Done' : x.why })]),
        x.done ? null : el('button', { class: i === steps.findIndex(y => !y.done) ? 'accent sm' : 'sm ghost', text: x.label, onclick: () => { location.href = x.href; } })
      ])))
    );
  };
  draw(null);
  loadSales(false).then(draw).catch(() => draw(null));
  return root;
}

/* ================= dashboard ================= */
export function viewDashboard() {
  const emp = subject();
  if (!emp) return empty('No employee record', 'Your account is not linked to a team member yet. Ask an admin to connect it.');
  if (partnerEmp(emp)) return partnerHome(emp);
  const perf = emp.performance, ready = emp.readiness;
  const lvl = levelOf(emp.levelId), nxt = nextLevelOf(emp.levelId);
  const quarter = S.data.quarter;
  const goals = goalsOf(emp.id).filter(g => g.quarter === quarter && g.status !== 'cancelled');
  const ms = milestonesOf(emp.id);
  const nextMs = ms.filter(m => !['achieved', 'reviewed'].includes(m.status))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 3);
  const gaps = skillGaps(emp).slice(0, 4);
  const lastReview = reviewsOf(emp.id).find(r => r.status === 'approved');
  const actions = emp.id === (me() || {}).employeeId ? (S.data.actions || []).filter(a => ['project', 'goal', 'milestone', 'task', 'myreview'].includes(a.kind)) : [];

  const own = emp.id === (me() || {}).employeeId;
  const quarterRow = el('div', { class: 'grid2', style: 'margin-top:14px' }, [
    card('This quarter', quarterLabel(quarter) + ' · ' + quarterDates(quarter), [
      goals.length ? el('div', {}, [
        stacked([
          { label: 'Completed', value: goals.filter(g => g.status === 'completed').length, color: 'var(--ok)' },
          { label: 'On track', value: goals.filter(g => g.status === 'active').length, color: 'var(--plum)' },
          { label: 'At risk', value: goals.filter(g => g.status === 'at_risk').length, color: 'var(--warn)' }
        ]),
        el('div', { style: 'height:12px' }),
        el('div', { class: 'list' }, goals.map(g => goalRow(g, emp)))
      ]) : empty('No goals yet', own && canManage(emp.id) ? 'Set a few targets for this quarter: income, clients, a skill to learn.' : 'No goals have been set for this quarter.',
        own && canManage(emp.id) ? el('button', { class: 'sm primary', text: 'Add goal', onclick: () => goalModal(null, emp, true) }) : null)
    ], [el('button', { class: 'sm ghost', text: 'Open goals', onclick: () => go('#/goals') })]),
    card('Next milestones', null, [
      nextMs.length ? el('div', { class: 'list' }, nextMs.map(m => el('div', { class: 'item' }, [
        el('span', { class: 'grow' }, [el('b', { text: m.title }), el('small', { text: m.dueDate ? 'Due ' + dateShort(m.dueDate) : 'No date set' })]),
        statusChip(m.status)
      ]))) : empty('All clear', 'No open milestones right now.')
    ], [el('button', { class: 'sm ghost', text: 'Open milestones', onclick: () => go('#/milestones') })])
  ]);

  // the founder and managers see the studio first: sales, the work being done, the people
  const studio = own && isManager() && !S.preview;
  if (studio && isAdmin()) return frag([
    hello(), setupCard(), promoCards(), studioDashboard(),
    el('h2', { class: 'sechead', text: 'Your quarter' }),
    quarterRow,
    el('div', { style: 'margin-top:14px' }, [tasksCard(emp)])
  ]);
  return frag([
    own ? hello() : null,
    own ? promoCards() : null,
    studio ? studioDashboard() : null,
    studio ? el('h2', { class: 'sechead', text: 'Your growth' }) : null,
    el('section', { class: 'card', style: 'margin-bottom:14px' }, [
      el('div', { class: 'headrow' }, [
        avatar(emp.name, 'lg'),
        el('div', { class: 'grow' }, [
          el('h2', { style: 'font-size:22px', text: emp.name }),
          el('p', { class: 'dim', text: [deptName(emp.departmentId), lvl && lvl.name, 'in role ' + sinceText(emp.startDate)].filter(Boolean).join(' · ') })
        ]),
        el('div', { class: 'row wrap' }, [
          chip(quarterLabel(quarter), 'plum'),
          emp.status === 'inactive' ? chip('Inactive') : null,
          nxt ? chip('Next: ' + nxt.name) : chip('Top of this track')
        ])
      ])
    ]),

    el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
      tile('Performance', perf.latest ? score(perf.latest) + ' / 5' : '—', perf.latestPeriod ? monthName(perf.latestPeriod) : 'No review yet', () => go('#/reviews')),
      tile('Promotion readiness', ready ? pct(ready.percent) : '—', ready && ready.nextLevel ? 'toward ' + ready.nextLevel.name : 'no next level set', () => go('#/career')),
      tile('Goals this quarter', goals.filter(g => g.status === 'completed').length + '/' + goals.length, goals.some(g => g.status === 'at_risk') ? 'one is at risk' : 'on track', () => go('#/goals')),
      tile('Milestones', ms.filter(m => ['achieved', 'reviewed'].includes(m.status)).length + '/' + ms.length, 'achieved', () => go('#/milestones'))
    ]),

    actions.length ? card('Needs your attention', null, [
      el('div', { class: 'list' }, actions.slice(0, 4).map(a => el('div', { class: 'item' }, [
        chip(a.kind === 'myreview' ? 'To read' : a.level === 'warn' ? 'Attention' : 'Soon', a.kind === 'myreview' ? 'plum' : a.level === 'warn' ? 'bad' : 'warn'),
        el('span', { class: 'grow', text: a.text }),
        el('button', { class: 'sm ghost', text: 'Open', onclick: () => go(a.href) })
      ])))
    ]) : null,

    el('div', { style: 'margin-top:14px' }, [tasksCard(emp)]),
    el('div', { style: 'margin-top:14px' }, [achievementsCard(emp.id, own ? 'Your achievements' : 'Achievements')]),

    el('div', { class: 'grid2', style: 'margin-top:14px' }, [
      card('Performance', perf.count ? 'Last ' + perf.trend.length + ' reviews' : null, [
        perf.count ? el('div', {}, [
          el('div', { class: 'row', style: 'gap:18px;align-items:flex-end;margin-bottom:10px' }, [
            el('div', {}, [el('div', { class: 'v num', style: 'font-size:34px;font-weight:500;letter-spacing:-.03em', text: score(perf.latest) }),
              el('div', { class: 'muted', style: 'font-size:12.5px', text: 'of 5 · ' + monthName(perf.latestPeriod) })]),
            el('span', { class: 'grow' }),
            perf.direction ? chip((perf.direction > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(perf.direction * 10) / 10), perf.direction > 0 ? 'ok' : 'warn') : null
          ]),
          lineChart(perf.trend.map(t => ({ label: monthShort(t.period), value: Math.round(t.score * 10) / 10 })), { max: 5, min: 1, height: 130 }),
          el('div', { style: 'height:12px' }),
          el('div', { class: 'list' }, universal().map(c => {
            const v = lastReview && lastReview.scores ? Number(lastReview.scores[c.id] || 0) : 0;
            return el('div', { class: 'row', style: 'gap:12px' }, [
              el('span', { style: 'width:110px;font-size:13.5px', text: c.name }),
              el('span', { class: 'grow' }, [bar(v / 5 * 100, v >= 4 ? 'ok' : v >= 3 ? '' : 'warn')]),
              el('span', { class: 'num', style: 'width:30px;text-align:right;font-size:13.5px', text: v ? score(v) : '—' })
            ]);
          }))
        ]) : empty('No review yet', 'Your first review will appear here once your manager completes it.')
      ]),
      // skills are for management (the founder and managers); everyone else sees how they are growing
      isManager() ? card('Skill gaps', 'Where to focus next', [
        gaps.length ? el('div', { class: 'list' }, gaps.map(g => el('div', { class: 'item' }, [
          el('span', { class: 'grow' }, [el('b', { text: g.name }), el('small', { text: (g.scope === 'next' ? 'Next level needs ' : 'Your level needs ') + g.required + ' · you are at ' + (g.level || '—') })]),
          meter(g.level, g.required)
        ]))) : empty('Nothing urgent', 'No skill gaps recorded right now.'),
        el('button', { class: 'ghost sm', style: 'margin-top:12px', text: 'All skills', onclick: () => go('#/skills') })
      ]) : evolutionCard(emp)
    ]),

    quarterRow,

    el('div', { class: 'grid2', style: 'margin-top:14px' }, [
      card('Recent feedback', lastReview ? monthName(lastReview.period) + ' · by ' + reviewerName(lastReview) : null, [
        lastReview ? el('div', { class: 'stack' }, [
          feedbackBlock('What went well', lastReview.wins),
          feedbackBlock('What to improve', lastReview.improve),
          feedbackBlock('Focus next', lastReview.nextFocus)
        ]) : empty('No feedback yet', 'Feedback from your manager will show here.')
      ]),
      leaveCard(emp)
    ])
  ]);
}

const feedbackBlock = (label, text) => text ? el('div', {}, [
  el('div', { class: 'muted', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.08em', text: label }),
  el('p', { style: 'margin-top:3px;white-space:pre-wrap', text })
]) : null;

function reviewerName(r) {
  const u = ((S.data.users || []).find(x => x.id === r.reviewerId)) || null;
  if (u) return u.name;
  const emp = employees().find(e => e.id === (r.reviewerEmployeeId || ''));
  return emp ? emp.name : 'your manager';
}

/* how someone evolved: monthly scores and readiness (taken when each review was approved), and the quarters */
export function evolutionCard(emp) {
  const monthly = reviewsOf(emp.id).filter(r => r.status === 'approved').slice().sort((a, b) => String(a.period).localeCompare(String(b.period))).slice(-12);
  const quarters = quarterliesOf(emp.id).filter(q => q.status === 'final').sort((a, b) => String(a.quarter).localeCompare(String(b.quarter)));
  const withReady = monthly.filter(r => r.readinessAt != null);
  return card('How you are growing', 'Month by month, from your approved reviews', [
    monthly.length ? el('div', { class: 'grid2' }, [
      el('div', {}, [
        el('div', { class: 'muted', style: 'font-size:12.5px;margin-bottom:6px', text: 'Monthly review score (out of 5)' }),
        monthly.length > 1 ? lineChart(monthly.map(r => ({ label: monthShort(r.period), value: Math.round(Number(r.overall) * 10) / 10 })), { max: 5, min: 1, height: 120 })
          : el('b', { class: 'num', style: 'font-size:28px', text: score(monthly[0].overall) + ' / 5' })
      ]),
      el('div', {}, [
        el('div', { class: 'muted', style: 'font-size:12.5px;margin-bottom:6px', text: 'Promotion readiness' }),
        withReady.length > 1 ? lineChart(withReady.map(r => ({ label: monthShort(r.period), value: Number(r.readinessAt) })), { max: 100, min: 0, height: 120, color: 'var(--ok)', fill: 'var(--okSoft)' })
          : el('b', { class: 'num', style: 'font-size:28px', text: pct(emp.readiness ? emp.readiness.percent : 0) })
      ])
    ]) : empty('Your growth chart starts with your first review', 'Each approved monthly review adds a point here: your score and your promotion readiness that month.'),
    quarters.length ? el('div', { class: 'list', style: 'margin-top:14px' }, quarters.map(q => {
      const s = q.snapshot || {};
      return el('div', { class: 'item' }, [chip(quarterLabel(q.quarter), 'plum'),
        el('span', { class: 'grow', text: [s.average ? 'average ' + score(s.average) + ' / 5' : '', s.change ? (s.change > 0 ? '▲ ' : '▼ ') + Math.abs(s.change) + ' on the quarter before' : '',
          s.goals ? s.goalsCompleted + ' of ' + s.goals.length + ' goals done' : '', s.readiness ? 'readiness ' + s.readiness.percent + '%' : ''].filter(Boolean).join(' · ') })]);
    })) : null
  ]);
}

export function skillGaps(emp) {
  const mine = skillsOf(emp.id);
  const rating = name => { const hit = mine.find(x => x.name === name); return hit ? Number(hit.level) || 0 : 0; };
  const nxt = nextLevelOf(emp.levelId);
  const rows = [
    ...levelSkills(emp.levelId).map(s => ({ name: s.name, required: s.req, level: rating(s.name), scope: 'current' })),
    ...(nxt ? levelSkills(nxt.id).map(s => ({ name: s.name, required: s.req, level: rating(s.name), scope: 'next' })) : [])
  ];
  const seen = new Set();
  return rows.filter(r => r.level < r.required).filter(r => { const k = r.name + r.scope; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.required - b.level) - (a.required - a.level));
}

/* ================= goals ================= */
function goalRow(g, emp) {
  const p = g.progressPct != null ? g.progressPct : 0;
  const mine = canManage(emp.id);
  return el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
    el('span', { class: 'grow', style: 'min-width:190px' }, [
      el('b', { text: g.title }),
      el('small', { text: [goalTypeName(g.type), g.kpi ? g.kpi + (g.target ? ': ' + (g.current ?? 0) + ' / ' + g.target + (g.unit ? ' ' + g.unit : '') : '') : '', g.dueDate ? 'due ' + dateShort(g.dueDate) : ''].filter(Boolean).join(' · ') }),
      linkedTasks('goal', g.id).text ? el('small', { style: 'color:var(--ink)', text: linkedTasks('goal', g.id).text }) : null
    ]),
    el('span', { style: 'width:130px' }, [bar(p, g.status === 'completed' ? 'ok' : g.status === 'at_risk' ? 'warn' : '')]),
    el('span', { class: 'num', style: 'width:42px;text-align:right', text: pct(p) }),
    statusChip(g.status),
    el('button', { class: 'sm ghost', text: mine ? 'Edit' : 'Update', onclick: () => goalModal(g, emp, mine) })
  ]);
}

export function viewGoals() {
  const emp = subject();
  const quarter = S.data.quarter;
  const all = goalsOf(emp.id);
  const current = all.filter(g => g.quarter === quarter);
  const past = all.filter(g => g.quarter !== quarter);
  const mine = canManage(emp.id);
  return frag([
    card('This quarter · ' + quarterLabel(quarter), quarterDates(quarter) + ' · ' + settings().goalsPerQuarter + ' core goals is the aim', [
      current.length ? el('div', { class: 'list' }, current.map(g => goalRow(g, emp))) :
        empty('No goals yet', mine ? 'Add the goals for this quarter.' : 'No goals have been set for this quarter.',
          mine ? el('button', { class: 'primary', text: 'Add goal', onclick: () => goalModal(null, emp, true) }) : null)
    ], mine ? [el('button', { class: 'primary sm', text: 'Add goal', onclick: () => goalModal(null, emp, true) })] : null),
    past.length ? el('div', { style: 'margin-top:14px' }, [card('Earlier quarters', null, [
      el('div', { class: 'list' }, past.sort((a, b) => String(b.quarter).localeCompare(String(a.quarter))).map(g => el('div', { class: 'item' }, [
        chip(quarterLabel(g.quarter)), el('span', { class: 'grow' }, [el('b', { text: g.title }), el('small', { text: goalTypeName(g.type) })]), statusChip(g.status)
      ])))
    ])]) : null
  ]);
}

export function goalModal(goal, emp, managing) {
  const g = goal || { type: 'performance', status: 'active', progressMode: 'metric', quarter: S.data.quarter, employeeId: emp.id, dueDate: '' };
  const f = {};
  const body = [];
  if (managing) {
    f.title = input(g.title, { placeholder: 'e.g. Deliver 95% of projects on time' });
    f.type = select(g.type, (settings().goalTypes || []).map(t => ({ value: t.id, label: t.name })));
    f.status = select(g.status, ['draft', 'active', 'at_risk', 'completed', 'cancelled'].map(s => ({ value: s, label: STATUS_LABEL[s] })));
    f.kpi = input(g.kpi, { placeholder: 'What is measured' });
    f.target = input(g.target, { type: 'number', step: 'any' });
    f.unit = input(g.unit, { placeholder: '%, projects, leads…' });
    f.dueDate = input(g.dueDate, { type: 'date' });
    f.description = textarea(g.description, { placeholder: 'What does good look like?' });
    body.push(field('Goal', f.title),
      el('div', { class: 'grid2' }, [field('Type', f.type), field('Status', f.status)]),
      el('div', { class: 'grid3' }, [field('Measure (KPI)', f.kpi), field('Target', f.target), field('Unit', f.unit)]),
      field('Due date', f.dueDate), field('Description', f.description));
    if (goal && goal.target != null) body.push(field('Reason, if you are changing the target', f.changeReason = input('', { placeholder: 'Priorities changed because…' })));
  } else {
    body.push(el('p', { class: 'dim', style: 'margin-bottom:12px', text: g.title }));
  }
  f.current = input(g.current, { type: 'number', step: 'any' });
  f.progress = input(g.progress, { type: 'number', min: 0, max: 100 });
  body.push(el('div', { class: 'grid2' }, [
    field('Where you are now' + (g.unit ? ' (' + g.unit + ')' : ''), f.current, g.target ? 'Target ' + g.target + (g.unit ? ' ' + g.unit : '') : ''),
    field('Or progress %', f.progress, 'Used when there is no number to count')
  ]));

  const evidence = el('div', { class: 'stack' }, (g.evidence || []).map(e => el('div', { class: 'item' }, [
    el('span', { class: 'grow' }, [el('b', { text: e.text || 'Evidence' }), e.url ? el('small', {}, [el('a', { href: e.url, target: '_blank', rel: 'noopener', text: e.url })]) : null]),
    chip(dateShort(e.at))
  ])));
  if (goal) {
    const ev = input('', { placeholder: 'Add a note or link as evidence' });
    body.push(field('Evidence', el('div', { class: 'row' }, [ev, el('button', {
      class: 'sm', text: 'Add', onclick: () => {
        if (!ev.value.trim()) return;
        const isUrl = /^https?:\/\//i.test(ev.value.trim());
        act({ action: 'addEvidence', kind: 'goal', id: g.id, text: isUrl ? '' : ev.value.trim(), url: isUrl ? ev.value.trim() : '' }, 'Evidence added', () => { closeModal(); render(); });
      }
    })])), evidence);
  }

  modal(goal ? 'Goal' : 'New goal', body, [
    goal && managing ? el('button', { class: 'danger', text: 'Delete', onclick: () => {
      if (!confirm('Delete this goal?')) return;
      act({ action: 'deleteGoal', id: g.id }, 'Goal deleted', () => { closeModal(); render(); });
    } }) : null,
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save', onclick: () => {
      const payload = { id: g.id, employeeId: emp.id, current: f.current.value, progress: f.progress.value };
      if (managing) Object.assign(payload, {
        title: f.title.value, type: f.type.value, status: f.status.value, kpi: f.kpi.value,
        target: f.target.value, unit: f.unit.value, dueDate: f.dueDate.value, description: f.description.value,
        quarter: g.quarter, progressMode: f.target.value ? 'metric' : 'manual',
        changeReason: f.changeReason ? f.changeReason.value : ''
      });
      act({ action: 'saveGoal', goal: payload }, 'Goal saved', () => { closeModal(); render(); });
    } })
  ]);
}

/* ================= milestones ================= */
export function viewMilestones() {
  const emp = subject();
  const managing = canManage(emp.id);
  const ms = milestonesOf(emp.id);
  const open = ms.filter(m => !['achieved', 'reviewed'].includes(m.status));
  const done = ms.filter(m => ['achieved', 'reviewed'].includes(m.status));
  const row = m => el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
    el('span', { class: 'grow', style: 'min-width:200px' }, [
      el('b', { text: m.title }),
      el('small', { text: [m.dueDate ? 'Due ' + dateShort(m.dueDate) : '', m.skillName, m.achievedAt ? 'Achieved ' + dateShort(m.achievedAt) : '', (m.evidence || []).length ? (m.evidence || []).length + ' evidence' : '', linkedTasks('milestone', m.id).text].filter(Boolean).join(' · ') })
    ]),
    statusChip(m.status),
    el('button', { class: 'sm ghost', text: 'Open', onclick: () => milestoneModal(m, emp, managing) })
  ]);
  return frag([
    card('Open milestones', 'Concrete proof of progress toward ' + (nextLevelOf(emp.levelId) ? nextLevelOf(emp.levelId).name : 'the next level'), [
      open.length ? el('div', { class: 'list' }, open.map(row)) : empty('Nothing open', 'No milestones are waiting on you.')
    ], managing ? [el('button', { class: 'primary sm', text: 'Add milestone', onclick: () => milestoneModal(null, emp, true) })] : null),
    done.length ? el('div', { style: 'margin-top:14px' }, [card('Achieved', done.length + ' of ' + ms.length, [el('div', { class: 'list' }, done.map(row))])]) : null
  ]);
}

export function milestoneModal(milestone, emp, managing) {
  const m = milestone || { employeeId: emp.id, status: 'not_started' };
  const f = {};
  const body = [];
  if (managing) {
    f.title = input(m.title, { placeholder: 'e.g. Lead one small client project' });
    f.description = textarea(m.description, { placeholder: 'What has to be true for this to count?' });
    f.dueDate = input(m.dueDate, { type: 'date' });
    f.skillName = input(m.skillName, { placeholder: 'Related skill (optional)' });
    f.reviewerComment = textarea(m.reviewerComment, { placeholder: 'Reviewer comment' });
    body.push(field('Milestone', f.title), field('Description', f.description),
      el('div', { class: 'grid2' }, [field('Due date', f.dueDate), field('Related skill', f.skillName)]));
  } else {
    body.push(el('p', { style: 'margin-bottom:6px' }, [el('b', { text: m.title })]),
      m.description ? el('p', { class: 'dim', style: 'margin-bottom:12px;white-space:pre-wrap', text: m.description }) : null);
  }
  const statuses = managing ? ['not_started', 'in_progress', 'achieved', 'blocked', 'reviewed'] : ['not_started', 'in_progress', 'blocked'];
  f.status = select(statuses.includes(m.status) ? m.status : statuses[0], statuses.map(s => ({ value: s, label: STATUS_LABEL[s] })));
  body.push(field('Status', f.status, managing ? '' : 'Your manager marks a milestone achieved.'));
  if (managing) body.push(field('Reviewer comment', f.reviewerComment), checkbox('Counts as higher-level responsibility', m.responsibility, v => { m.responsibility = v; }));

  if (milestone) {
    const ev = input('', { placeholder: 'Add a note or link as evidence' });
    body.push(field('Evidence', el('div', { class: 'row' }, [ev, el('button', { class: 'sm', text: 'Add', onclick: () => {
      if (!ev.value.trim()) return;
      const isUrl = /^https?:\/\//i.test(ev.value.trim());
      act({ action: 'addEvidence', kind: 'milestone', id: m.id, text: isUrl ? '' : ev.value.trim(), url: isUrl ? ev.value.trim() : '' }, 'Evidence added', () => { closeModal(); render(); });
    } })])),
      el('div', { class: 'stack' }, (m.evidence || []).map(e => el('div', { class: 'item' }, [
        el('span', { class: 'grow' }, [el('b', { text: e.text || 'Evidence' }), e.url ? el('small', {}, [el('a', { href: e.url, target: '_blank', rel: 'noopener', text: e.url })]) : null]),
        chip(dateShort(e.at))
      ]))));
  }

  modal(milestone ? 'Milestone' : 'New milestone', body, [
    milestone && managing ? el('button', { class: 'danger', text: 'Delete', onclick: () => {
      if (!confirm('Delete this milestone?')) return;
      act({ action: 'deleteMilestone', id: m.id }, 'Milestone deleted', () => { closeModal(); render(); });
    } }) : null,
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save', onclick: () => {
      const payload = { id: m.id, employeeId: emp.id, status: f.status.value };
      if (managing) Object.assign(payload, {
        title: f.title.value, description: f.description.value, dueDate: f.dueDate.value,
        skillName: f.skillName.value, reviewerComment: f.reviewerComment.value, responsibility: !!m.responsibility
      });
      act({ action: 'saveMilestone', milestone: payload }, 'Milestone saved', () => { closeModal(); render(); });
    } })
  ]);
}

/* ================= skills ================= */
export function viewSkills() {
  const emp = subject();
  const managing = canManage(emp.id);
  const mine = skillsOf(emp.id);
  const rating = name => { const hit = mine.find(x => x.name === name); return hit || { level: 0, lastReviewedAt: null, note: '' }; };
  const nxt = nextLevelOf(emp.levelId);
  const gaps = skillGaps(emp);

  const table = (title, list, subtitle) => card(title, subtitle, [
    list.length ? el('table', { class: 'responsive' }, [
      el('thead', {}, [el('tr', {}, ['Skill', 'Now', 'Needed', 'Last looked at'].map(h => el('th', { text: h })))]),
      el('tbody', {}, list.map(sk => {
        const r = rating(sk.name);
        const gap = (Number(r.level) || 0) < sk.req;
        return el('tr', {}, [
          el('td', { 'data-l': 'Skill' }, [el('b', { text: sk.name }), r.note ? el('small', { class: 'muted', style: 'display:block', text: r.note }) : null]),
          el('td', { 'data-l': 'Now' }, [el('div', { class: 'row', style: 'gap:8px' }, [meter(Number(r.level) || 0, sk.req), el('span', { class: 'num', text: r.level || '—' })])]),
          el('td', { 'data-l': 'Needed' }, [gap ? chip(String(sk.req), 'warn') : chip(String(sk.req), 'ok')]),
          el('td', { 'data-l': 'Last looked at', class: 'muted', text: r.lastReviewedAt ? dateShort(r.lastReviewedAt) : 'not assessed' })
        ]);
      }))
    ]) : empty('No skills listed', 'This level has no skills configured yet.')
  ], managing ? [el('button', { class: 'sm', text: 'Rate skills', onclick: () => skillsModal(emp) })] : null);

  return frag([
    gaps.length ? card('Focus next', 'The biggest meaningful gaps', [
      el('div', { class: 'list' }, gaps.slice(0, 5).map(g => el('div', { class: 'item' }, [
        el('span', { class: 'grow' }, [el('b', { text: g.name }), el('small', { text: g.scope === 'next' ? 'Needed for ' + (nxt ? nxt.name : 'the next level') : 'Needed at your level' })]),
        meter(g.level, g.required),
        chip(g.level + ' → ' + g.required, 'warn')
      ])))
    ]) : null,
    el('div', { style: 'margin-top:14px' }, [table('Your level · ' + levelName(emp.levelId), levelSkills(emp.levelId))]),
    nxt ? el('div', { style: 'margin-top:14px' }, [table('Next level · ' + nxt.name, levelSkills(nxt.id), 'What ' + nxt.name + ' expects')]) : null
  ]);
}

/* rate every skill of someone's level and of the next level in one go (any time, not only at review time) */
export function skillsModal(emp) {
  const mine = skillsOf(emp.id);
  const scale = skillScale();
  const nxt = nextLevelOf(emp.levelId);
  const groups = [[levelName(emp.levelId) + ' (their level now)', levelSkills(emp.levelId)]];
  if (nxt) groups.push(['Needed for ' + nxt.name + ' (the next level)', levelSkills(nxt.id)]);
  const seen = new Set(), rows = [], body = [];
  groups.forEach(([title, list]) => {
    const fresh = list.filter(sk => !seen.has(sk.name));
    if (!fresh.length) return;
    body.push(el('div', { class: 'navsec', style: 'padding:10px 0 6px', text: title }));
    fresh.forEach(sk => {
      seen.add(sk.name);
      const cur = mine.find(x => x.name === sk.name) || { level: 0, note: '' };
      const sel = select(String(cur.level || 0), Array.from({ length: scale + 1 }, (_, v) => ({ value: String(v), label: v === 0 ? 'Not rated yet' : v + ' / ' + scale })));
      const note = input(cur.note, { placeholder: 'Note (optional)' });
      rows.push({ name: sk.name, sel, note });
      body.push(el('div', { class: 'row', style: 'gap:10px;margin-bottom:8px;flex-wrap:wrap' }, [
        el('span', { style: 'flex:1;min-width:150px' }, [el('b', { style: 'font-weight:500', text: sk.name }), el('small', { class: 'muted', style: 'display:block', text: 'needs ' + sk.req + ' / ' + scale })]),
        el('span', { style: 'width:150px' }, [sel]), el('span', { style: 'flex:1;min-width:150px' }, [note])
      ]));
    });
  });
  modal('Rate skills · ' + emp.name, body, [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save ratings', onclick: () => act({
      action: 'saveSkills', employeeId: emp.id,
      skills: rows.map(r => ({ name: r.name, level: Number(r.sel.value), note: r.note.value }))
    }, 'Skills saved', () => { closeModal(); render(); }) })
  ], { sub: scale === 10 ? 'Rate what you see today. 2 = learning · 4 = developing · 6 = solid · 8 = strong · 10 = exceptional.'
    : 'Rate what you see today. 1 = significantly below · 3 = meets expectations · 5 = exceptional.' });
}

/* ================= reviews ================= */
export function viewReviews() {
  const emp = subject();
  const list = reviewsOf(emp.id).filter(r => r.status === 'approved' || canManage(emp.id));
  const qs = quarterliesOf(emp.id).sort((a, b) => String(b.quarter).localeCompare(String(a.quarter)));
  return frag([
    card('Monthly reviews', list.length ? list.length + ' recorded' : 'Reviews appear here once the founder has approved them', [
      list.length ? el('div', { class: 'list' }, list.map(r => el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
        el('span', { style: 'width:120px' }, [el('b', { text: monthName(r.period) })]),
        el('span', { class: 'grow', style: 'min-width:160px' }, [el('small', { text: r.wins ? r.wins.slice(0, 90) : 'No written feedback' })]),
        reviewStateChip(r),
        chip(score(r.overall) + ' / 5', r.overall >= 4 ? 'ok' : r.overall >= 3 ? '' : 'warn'),
        el('button', { class: 'sm ghost', text: 'Read', onclick: () => reviewModal(r, emp) })
      ]))) : empty('No reviews yet', 'Your first review will appear here once your manager completes it and the founder approves it.')
    ]),
    el('div', { style: 'margin-top:14px' }, [card('Quarterly reviews', null, [
      qs.length ? el('div', { class: 'list' }, qs.map(q => el('div', { class: 'item' }, [
        el('span', { style: 'width:120px' }, [el('b', { text: quarterLabel(q.quarter) })]),
        el('span', { class: 'grow' }, [el('small', { text: q.achieved ? q.achieved.slice(0, 100) : 'In progress' })]),
        reviewStateChip(q),
        el('button', { class: 'sm ghost', text: 'Open', onclick: () => location.hash = '#/quarterly/' + emp.id + '/' + q.quarter })
      ]))) : empty('No quarterly review yet', 'These come at the end of each quarter of the review year (from 11 September).')
    ])])
  ]);
}

/* where a review is in the sign-off: draft → waiting for approval → approved → read */
export function reviewStateChip(r) {
  if (r.status === 'draft') return r.returnedAt ? chip('Sent back', 'bad') : chip('Draft', '');
  if (r.status === 'awaiting_approval') return chip('Waiting for approval', 'warn');
  if (r.acknowledgedAt) return chip('Approved · read', 'ok');
  return chip('Approved', 'ok');
}
const ackOn = () => !(settings().reviews && settings().reviews.acknowledge === false);
const when = iso => iso ? dateShort(String(iso).slice(0, 10)) : '';
/* who signed what, and when */
export function signoffBlock(r, isQuarterly) {
  const rows = [
    ['Written by', r.sentBy ? r.sentBy.name : userName(r.reviewerId) || '—', r.sentAt || r.submittedAt],
    ['Approved by', r.approval ? r.approval.name : (r.approvedBy ? userName(r.approvedBy) || 'Founder' : '—'), r.approvedAt],
    ackOn() || r.acknowledgedAt ? ['Read by employee', r.acknowledgedAt ? 'Confirmed' : 'Not yet', r.acknowledgedAt] : null
  ].filter(Boolean);
  return el('div', { class: 'card', style: 'background:var(--soft);border:0;margin-top:12px' }, [
    el('b', { text: 'Sign-off' }),
    el('div', { class: 'list', style: 'margin-top:8px' }, rows.map(([k, v, at]) => el('div', { class: 'row', style: 'gap:10px;font-size:13.5px' }, [
      el('span', { class: 'muted', style: 'width:130px', text: k }), el('span', { class: 'grow', text: v }), el('span', { class: 'muted', text: when(at) })
    ]))),
    r.returnNote && r.status === 'draft' ? el('p', { style: 'margin-top:8px;font-size:13.5px' }, [chip('Sent back', 'bad'), ' ' + r.returnNote]) : null,
    r.approvalNote && ['approved', 'final'].includes(r.status) ? el('p', { class: 'dim', style: 'margin-top:8px;font-size:13.5px', text: 'Founder’s note: ' + r.approvalNote }) : null,
    r.acknowledgedNote ? el('p', { class: 'dim', style: 'margin-top:8px;font-size:13.5px', text: 'Employee’s comment: ' + r.acknowledgedNote }) : null
  ]);
}
/* the buttons that move a review along: founder approves or sends back; employee confirms they read it */
export function signoffActions(r, kind, after) {
  const out = [];
  const done = after || (() => { closeModal(); render(); });
  if (isAdmin() && r.status === 'awaiting_approval') {
    out.push(el('button', { class: 'danger', text: 'Send back', onclick: () => noteModal('Send back to the manager',
      'The review goes back to draft. The manager sees your note and can change it and send it again.', 'What should change?', 'Send back',
      note => act({ action: 'decideReview', kind, id: r.id, decision: 'return', note }, 'Sent back to the manager', done), { danger: true, required: true, label: 'What should change' }) }));
    out.push(el('button', { class: 'primary', text: 'Approve and share', onclick: () => noteModal('Approve this review',
      'Once approved, the employee can see it and it counts toward their performance.', 'Optional note for the record', 'Approve and share',
      note => act({ action: 'decideReview', kind, id: r.id, decision: 'approve', note }, 'Approved — the employee can see it now', done)) }));
  }
  const mine = me() && r.employeeId === me().employeeId;
  if (mine && ackOn() && ['approved', 'final'].includes(r.status) && !r.acknowledgedAt) {
    out.push(el('button', { class: 'primary', text: 'I’ve read this', onclick: () => noteModal('Confirm you have read your review',
      'Your manager and the founder will see that you have read it, and any comment you add.', 'Anything you want to add (optional)', 'Confirm',
      note => act({ action: 'acknowledgeReview', kind, id: r.id, note }, 'Thanks — marked as read', done), { label: 'Your comment' }) }));
  }
  return out;
}

export function reviewModal(r, emp) {
  const body = [
    el('div', { class: 'row wrap', style: 'gap:10px;margin-bottom:14px' }, [
      chip(monthName(r.period), 'plum'), chip('Overall ' + score(r.overall) + ' / 5', r.overall >= 4 ? 'ok' : ''),
      reviewStateChip(r)
    ]),
    el('div', { class: 'list', style: 'margin-bottom:14px' }, universal().map(c => el('div', { class: 'row', style: 'gap:12px' }, [
      el('span', { style: 'width:120px;font-size:13.5px', text: c.name }),
      el('span', { class: 'grow' }, [bar((Number((r.scores || {})[c.id]) || 0) / 5 * 100)]),
      el('span', { class: 'num', style: 'width:26px;text-align:right', text: (r.scores || {})[c.id] || '—' })
    ]))),
    r.taskEvidence ? el('div', { style: 'margin-bottom:14px' }, [taskEvidenceCard(r.taskEvidence, 'Task numbers for ' + monthName(r.period) + ', kept with the review.')]) : null,
    feedbackBlock('What went well', r.wins), feedbackBlock('What to improve', r.improve),
    feedbackBlock('Key observation', r.observation), feedbackBlock('Focus next month', r.nextFocus),
    r.privateNote ? el('div', { class: 'card', style: 'margin-top:12px;background:var(--soft)' }, [
      chip('Management only', 'bad'), el('p', { style: 'margin-top:6px;white-space:pre-wrap', text: r.privateNote })
    ]) : null,
    signoffBlock(r)
  ];
  const canEdit = canManage(emp.id) && emp.id !== me().employeeId && (isAdmin() || !emp.founderOnly);
  modal('Review · ' + emp.name, body, [
    canEdit ? el('button', { class: 'ghost', text: 'Edit', onclick: () => { closeModal(); location.hash = '#/review/' + emp.id + '/' + r.period; } }) : null,
    ...signoffActions(r, 'monthly'),
    el('button', { class: signoffActions(r, 'monthly').length ? 'ghost' : 'primary', text: 'Close', onclick: closeModal })
  ]);
}

/* ================= career path ================= */
export function viewCareer() {
  const emp = subject();
  const lvl = levelOf(emp.levelId);
  const nxt = nextLevelOf(emp.levelId);
  const ready = emp.readiness;
  const track = (settings().departments || []).flatMap(d => d.tracks || []).find(t => t.id === emp.trackId);
  const levels = track ? track.levels : [];
  const ms = milestonesOf(emp.id);

  const levelCard = l => {
    const isNow = l.id === emp.levelId, isNext = nxt && l.id === nxt.id;
    return el('div', {
      class: 'card', style: 'border-color:' + (isNow ? 'var(--ink)' : isNext ? 'var(--plum)' : 'var(--line)') + (isNext ? ';background:var(--plumSoft)' : '')
    }, [
      el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:6px' }, [
        el('h3', { text: l.name }), isNow ? chip('You are here', 'info') : isNext ? chip('Next level', 'plum') : chip('Level ' + l.order)
      ]),
      el('p', { class: 'dim', style: 'font-size:13.5px', text: l.description }),
      isManager() ? el('div', { style: 'margin-top:12px' }, [
        el('div', { class: 'muted', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.08em', text: 'Skills expected' }),
        el('div', { class: 'row wrap', style: 'gap:6px;margin-top:6px' }, levelSkills(l.id).map(s => chip(s.name + ' ' + s.req)))
      ]) : null
    ]);
  };

  return frag([
    ready ? card('Promotion readiness', ready.nextLevel ? 'Toward ' + ready.nextLevel.name : 'No next level on this track', [
      el('div', { class: 'row wrap', style: 'gap:20px;align-items:center' }, [
        donut(ready.percent),
        el('div', { class: 'grow', style: 'min-width:min(100%,280px)' }, [
          el('div', { class: 'list' }, Object.keys(ready.parts).map(k => {
            const p = ready.parts[k];
            return el('div', { class: 'row', style: 'gap:12px' }, [
              el('span', { style: 'flex:1;min-width:0;font-size:13.5px', text: p.label }),
              el('span', { style: 'width:min(110px,24vw);flex:none' }, [bar(p.ratio * 100, p.ratio >= 0.8 ? 'ok' : p.ratio >= 0.5 ? '' : 'warn')]),
              el('span', { class: 'num muted', style: 'width:74px;text-align:right;font-size:13px', text: k === 'performance' ? score(p.done) + ' / 5' : p.done + ' / ' + p.total })
            ]);
          })),
          el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:10px', text: 'Readiness is a guide for the promotion conversation, not an automatic promotion. Management records the decision.' })
        ]),
        el('div', {}, [
          el('div', { class: 'muted', style: 'font-size:12px', text: 'Management decision' }),
          el('div', { style: 'margin-top:4px' }, [statusChip(ready.decision || ready.suggested)]),
          ready.decisionAt ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px', text: dateShort(ready.decisionAt) } ) : null
        ])
      ])
    ]) : null,
    el('div', { style: 'margin-top:14px' }, [evolutionCard(emp)]),
    el('div', { style: 'margin-top:14px' }, [card('Your track · ' + (track ? track.name : '—'), deptName(emp.departmentId), [
      el('div', { class: 'grid3' }, levels.map(levelCard))
    ])]),
    nxt ? el('div', { style: 'margin-top:14px' }, [card('What ' + nxt.name + ' asks for', 'Milestones recorded for you', [
      ms.length ? el('div', { class: 'list' }, ms.map(m => el('div', { class: 'item' }, [
        el('span', { class: 'grow' }, [el('b', { text: m.title }), m.achievedAt ? el('small', { text: 'Achieved ' + dateShort(m.achievedAt) }) : null]),
        statusChip(m.status)
      ]))) : empty('No milestones yet', 'Your manager will add the milestones for the next level.')
    ])]) : null
  ]);
}

/* ================= leave ================= */
export function leaveCard(emp) {
  const bal = emp.leave;
  const upcoming = (bal.upcoming || []).slice(0, 2);
  return card('Leave', 'Leave year ' + bal.year + ' · from 11 September', [
    el('div', { class: 'row wrap', style: 'gap:18px' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:4px' }, [
          el('span', { class: 'dim', text: 'Earned and available now' }),
          el('b', { class: 'num', text: bal.annual.available + ' days' })
        ]),
        bar(bal.annual.allowance ? (bal.annual.available / bal.annual.allowance) * 100 : 0, bal.annual.available > 3 ? 'ok' : 'warn'),
        el('div', { class: 'muted', style: 'font-size:12.5px;margin-top:6px', text:
          'Entitlement ' + bal.annual.allowance + ' days a year · earned ' + bal.annual.accrued + ' so far (' + bal.perMonth + ' a month)' +
          (bal.annual.carried ? ' · ' + bal.annual.carried + ' carried over' : '') + (bal.annual.pending ? ' · ' + bal.annual.pending + ' waiting' : '') })
      ]),
      el('div', {}, [el('div', { class: 'muted', style: 'font-size:12.5px', text: 'Sick leave' }), el('b', { class: 'num', text: bal.sick.left + ' / ' + bal.sick.allowance })])
    ]),
    upcoming.length ? el('div', { class: 'list', style: 'margin-top:12px' }, upcoming.map(l => el('div', { class: 'item' }, [
      chip(dateShort(l.from) + ' → ' + dateShort(l.to), 'ok'), el('span', { class: 'grow muted', text: l.days + ' days' })
    ]))) : null
  ], [el('button', { class: 'sm', text: 'Request leave', onclick: () => leaveModal(emp) })]);
}

export function viewLeave() {
  const emp = subject();
  const bal = emp.leave;
  const list = leaveOf(emp.id);
  return frag([
    el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
      tile('Entitlement for the year', bal.annual.allowance + ' days', 'leave year ' + bal.year + ' (from 11 Sept)'),
      tile('Earned to date', bal.annual.accrued + ' days', bal.perMonth + ' days per completed month'),
      tile('Available now', bal.annual.available + ' days', (bal.annual.carried ? bal.annual.carried + ' carried over · ' : '') + bal.annual.used + ' taken'),
      tile('Sick leave left', bal.sick.left + ' days', 'of ' + bal.sick.allowance)
    ]),
    card('Your requests', null, [
      list.length ? el('table', { class: 'responsive' }, [
        el('thead', {}, [el('tr', {}, ['Dates', 'Type', 'Days', 'Status', ''].map(h => el('th', { text: h })))]),
        el('tbody', {}, list.map(l => el('tr', {}, [
          el('td', { 'data-l': 'Dates' }, [el('b', { text: dateShort(l.from) + ' → ' + dateShort(l.to) }), l.note ? el('small', { class: 'muted', style: 'display:block', text: l.note }) : null]),
          el('td', { 'data-l': 'Type', text: (l.type || '').replace(/^\w/, c => c.toUpperCase()) }),
          el('td', { 'data-l': 'Days', class: 'num', text: l.days }),
          el('td', { 'data-l': 'Status' }, [statusChip(l.status), l.decisionNote ? el('small', { class: 'muted', style: 'display:block', text: l.decisionNote }) : null]),
          el('td', { class: 'right' }, [l.status !== 'declined' ? el('button', {
            class: 'sm ghost', text: 'Cancel', onclick: () => { if (confirm('Cancel this leave request?')) act({ action: 'cancelLeave', id: l.id }, 'Request cancelled'); }
          }) : null])
        ])))
      ]) : empty('No leave yet', 'Requests you make will show up here.', el('button', { class: 'primary', text: 'Request leave', onclick: () => leaveModal(emp) }))
    ], [el('button', { class: 'primary sm', text: 'Request leave', onclick: () => leaveModal(emp) })])
  ]);
}

export function leaveModal(emp) {
  const s = settings().leave || {};
  const f = {
    type: select('annual', [{ value: 'annual', label: 'Annual leave' }, { value: 'sick', label: 'Sick leave' }, { value: 'unpaid', label: 'Unpaid leave' }, { value: 'other', label: 'Other' }]),
    from: input(today(), { type: 'date' }),
    to: input(today(), { type: 'date' }),
    note: textarea('', { placeholder: 'Anything your manager should know' })
  };
  const count = el('p', { class: 'dim', style: 'font-size:13px' });
  const recount = () => {
    const days = workingDaysBetween(f.from.value, f.to.value, s.workDays || [1, 2, 3, 4, 5]);
    count.textContent = days > 0 ? days + ' working day' + (days === 1 ? '' : 's') + ' · ' + emp.leave.annual.available + ' annual days earned and available'
      : 'Pick a valid date range';
  };
  f.from.addEventListener('change', () => { if (f.to.value < f.from.value) f.to.value = f.from.value; recount(); });
  f.to.addEventListener('change', recount);
  recount();
  modal('Request leave', [
    field('Type', f.type),
    el('div', { class: 'grid2' }, [field('From', f.from), field('To', f.to)]),
    count, field('Note', f.note)
  ], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Send request', onclick: () => act({
      action: 'requestLeave', employeeId: emp.id, type: f.type.value, from: f.from.value, to: f.to.value, note: f.note.value
    }, 'Request sent to your manager', () => { closeModal(); render(); }) })
  ]);
}

export function workingDaysBetween(from, to, workDays) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (workDays.includes(d.getUTCDay())) n++;
  }
  return n;
}

const render = () => window.dispatchEvent(new Event('gz:render'));
