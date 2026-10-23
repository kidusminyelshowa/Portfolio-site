/* The management side: team overview, people directory, the person page,
   the monthly and quarterly review flows, leave approvals, reports and settings. */
import {
  el, frag, S, me, settings, employees, empById, canManage, isAdmin, isManager, partnerEmp,
  goalsOf, milestonesOf, reviewsOf, skillsOf, leaveOf, notesOf, quarterliesOf, tasksOf,
  levelOf, nextLevelOf, levelName, deptName, levelSkills, universal, ratingScale, goalTypeName, allLevels,
  chip, statusChip, avatar, bar, meter, donut, spark, tile, card, empty, field, input, textarea, select, checkbox,
  lineChart, barRows, stacked,
  money, pct, score, dateShort, monthName, monthShort, today, thisMonth, sinceText,
  modal, closeModal, toast, act, api, getSummary, STATUS_LABEL,
  quarterLabel, quarterDates, quarterRange, nextQuarterOf, userName, skillScale
} from '/team/ui.js';
import { brand, applyBrand, loadState, pickFile, uploadFile } from '/team/ui.js';
import { goalModal, milestoneModal, reviewModal, skillGaps, skillsModal, leaveModal, workingDaysBetween, reviewStateChip, signoffBlock, signoffActions } from '/team/me.js';
import { personTasks, deliveryTable, onTimeChart, teamDelivery, linkedTasks, linkedTo } from '/team/tasks.js';
import { teamStrip, achievementsCard } from '/team/social.js';

const go = h => { location.hash = h; };
const render = () => window.dispatchEvent(new Event('gz:render'));
const myTeam = () => employees().filter(e => e.id !== me().employeeId || isAdmin());
const manageable = () => employees().filter(e => canManage(e.id));
/* may the signed-in person write this person's review? A manager's review is the founder's alone. */
const canReview = e => !!e && !partnerEmp(e) && canManage(e.id) && e.id !== me().employeeId && (isAdmin() || !e.founderOnly);
const MONTH_STATE = { approved: ['Approved', 'ok'], awaiting_approval: ['Waiting for approval', 'warn'], draft: ['Draft', ''] };
const monthChip = e => e.reviewThisMonthStatus ? chip(...MONTH_STATE[e.reviewThisMonthStatus]) : chip('Review due', 'warn');

/* ================= team overview ================= */
export function viewOverview() {
  const list = employees().filter(e => e.status !== 'inactive');
  const month = S.data.month, quarter = S.data.quarter;
  const reviewable = list.filter(e => e.id !== me().employeeId && !partnerEmp(e));   // nobody reviews themselves; partners are not reviewed
  const reviewed = reviewable.filter(e => e.reviewThisMonth);
  const avg = list.filter(e => e.performance.latest).reduce((s, e, _, a) => s + e.performance.latest / a.length, 0);
  const goals = list.flatMap(e => goalsOf(e.id).filter(g => g.quarter === quarter));
  const atRisk = goals.filter(g => g.status === 'at_risk');
  const msThisQuarter = list.flatMap(e => milestonesOf(e.id)).filter(m => m.achievedAt && m.achievedAt >= quarterRange(quarter).start);
  const delivery = teamDelivery(list);
  const attention = reviewable.filter(e => (e.performance.latest && e.performance.latest < 3.2) || e.performance.direction < -0.4 || !e.performance.count);
  const nearPromo = list.filter(e => e.readiness && e.readiness.percent >= 70)
    .sort((a, b) => b.readiness.percent - a.readiness.percent);
  const pendingLeave = (S.data.leaveRequests || []).filter(l => l.status === 'pending');
  const actions = S.data.actions || [];

  return frag([
    el('div', { style: 'margin-bottom:14px' }, [teamStrip((S.data.roster || []))]),
    el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
      tile('People', String(list.length), 'active', () => go('#/people')),
      tile('Reviews this month', reviewed.length + ' / ' + reviewable.length, 'sent · ' + monthName(month), () => go('#/reviews-team')),
      tile('Average performance', avg ? score(avg) + ' / 5' : '—', 'across the team'),
      tile('Goals at risk', String(atRisk.length), goals.length + ' goals this quarter', () => go('#/goals-team'))
    ]),
    el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
      tile('Milestones achieved', String(msThisQuarter.length), 'this quarter'),
      tile('Needs attention', String(attention.length), 'low or falling scores'),
      tile('Near promotion', String(nearPromo.length), '70% readiness or more'),
      tile('Leave to approve', String(pendingLeave.length), 'waiting', () => go('#/team-leave'))
    ]),

    actions.length ? card('To do', 'What the system thinks needs doing', [
      el('div', { class: 'list' }, actions.slice(0, 8).map(a => el('div', { class: 'item' }, [
        chip({ review: 'Review', quarterly: 'Quarterly', leave: 'Leave', goal: 'Goal', task: 'Task', approval: 'Approve', myreview: 'To read', project: 'Project' }[a.kind] || 'Milestone',
          a.level === 'warn' ? 'bad' : a.level === 'due' ? 'warn' : 'info'),
        el('span', { class: 'grow', text: a.text }),
        el('button', { class: 'sm ghost', text: 'Open', onclick: () => go(a.href) })
      ])))
    ]) : null,

    el('div', { class: 'grid2', style: 'margin-top:14px' }, [
      card('Delivery', 'Tasks, last 90 days', [
        el('div', { class: 'grid4', style: 'margin-bottom:12px' }, [
          tile('On time', delivery.onTimePct == null ? '—' : pct(delivery.onTimePct), delivery.onTime + ' of ' + delivery.dated),
          tile('Avg days late', delivery.late ? '+' + score(delivery.avgDaysLate) : '0', delivery.late + ' late'),
          tile('Overdue now', String(delivery.overdue), 'open tasks', () => go('#/tasks-team')),
          tile('Avg quality', delivery.avgQuality == null ? '—' : score(delivery.avgQuality), delivery.waiting + ' waiting to check', () => go('#/tasks-team'))
        ]),
        onTimeChart(list)
      ], [el('button', { class: 'sm ghost', text: 'Tasks', onclick: () => go('#/tasks-team') })]),
      card('Team performance', 'Average score by month', [
        (() => {
          const ms = lastMonths(6).reverse();
          const pts = ms.map(m => {
            const vals = list.map(e => (reviewsOf(e.id).find(r => r.period === m && r.status === 'approved') || {}).overall).filter(Boolean);
            return vals.length ? { label: monthShort(m), value: Math.round(vals.reduce((s2, v) => s2 + v, 0) / vals.length * 10) / 10, n: vals.length } : null;
          }).filter(Boolean);   // months with no reviews are left out, not drawn as zero
          return pts.length ? el('div', {}, [
            lineChart(pts, { max: 5, min: 1, height: 140 }),
            el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:8px', text: pts[pts.length - 1].n + ' reviews in ' + pts[pts.length - 1].label + ' · average ' + pts[pts.length - 1].value + ' of 5' })
          ]) : empty('No reviews yet', 'The trend appears once reviews are approved.');
        })()
      ])
    ]),

    el('div', { class: 'grid2', style: 'margin-top:14px' }, [
      card('Goals this quarter', quarterLabel(quarter) + ' · ' + quarterDates(quarter), [
        goals.length ? el('div', {}, [
          stacked([
            { label: 'Completed', value: goals.filter(g => g.status === 'completed').length, color: 'var(--ok)' },
            { label: 'Active', value: goals.filter(g => g.status === 'active').length, color: 'var(--plum)' },
            { label: 'At risk', value: goals.filter(g => g.status === 'at_risk').length, color: 'var(--warn)' },
            { label: 'Draft', value: goals.filter(g => g.status === 'draft').length, color: 'var(--line2)' }
          ]),
          el('div', { style: 'height:14px' }),
          barRows((settings().departments || []).map(d => {
            const dg = goals.filter(g => { const e2 = empById(g.employeeId); return e2 && e2.departmentId === d.id; });
            const done = dg.filter(g => g.status === 'completed').length;
            return { label: d.name, value: done, max: dg.length || 1, tone: 'ok', note: done + ' / ' + dg.length };
          }).filter(r => r.max))
        ]) : empty('No goals', 'Nothing has been set for this quarter.')
      ]),
      card('Needs attention', null, [
        attention.length ? el('div', { class: 'list' }, attention.map(e => personRow(e))) : empty('All good', 'Nobody is flagged right now.')
      ])
    ]),

    el('div', { class: 'grid2', style: 'margin-top:14px' }, [
      card('Approaching promotion readiness', null, [
        nearPromo.length ? el('div', { class: 'list' }, nearPromo.slice(0, 6).map(e => el('div', { class: 'item click', onclick: () => go('#/people/' + e.id) }, [
          avatar(e.name, 'sm'),
          el('span', { class: 'grow' }, [el('b', { text: e.name }), el('small', { text: levelName(e.levelId) + (e.readiness.nextLevel ? ' → ' + e.readiness.nextLevel.name : '') })]),
          el('span', { style: 'width:90px' }, [bar(e.readiness.percent, 'plum')]),
          chip(pct(e.readiness.percent), 'plum')
        ]))) : empty('Nobody yet', 'Readiness grows as milestones and skills are met.')
      ]),
      card('Departments', null, [
      el('div', { class: 'list' }, (settings().departments || []).map(d => {
        const dl = list.filter(e => e.departmentId === d.id);
        const dAvg = dl.filter(e => e.performance.latest).reduce((s, e, _, a) => s + e.performance.latest / (a.length || 1), 0);
        return el('div', { class: 'item' }, [
          el('span', { class: 'grow' }, [el('b', { text: d.name }), el('small', { text: dl.length + ' people · ' + dl.filter(e => e.reviewThisMonth).length + ' reviewed this month' })]),
          el('span', { style: 'width:100px' }, [bar(dAvg / 5 * 100, dAvg >= 4 ? 'ok' : dAvg >= 3 ? '' : 'warn')]),
          chip(dAvg ? score(dAvg) : '—')
        ]);
      })
      )
    ])
    ])
  ]);
}


function personRow(e) {
  return el('div', { class: 'item click', onclick: () => go('#/people/' + e.id) }, [
    avatar(e.name, 'sm'),
    el('span', { class: 'grow' }, [el('b', { text: e.name }), el('small', { text: levelName(e.levelId) + ' · ' + deptName(e.departmentId) })]),
    e.performance.latest ? chip(score(e.performance.latest) + ' / 5', e.performance.latest >= 4 ? 'ok' : e.performance.latest >= 3 ? '' : 'warn') : chip('No review', 'warn'),
    e.reviewThisMonth ? null : monthChip(e)
  ]);
}

/* ================= people ================= */
export function viewPeople() {
  const state = { q: '', dept: '', level: '', status: 'active', sort: 'name' };
  const wrap = el('div');
  const body = el('tbody');
  const search = input('', { placeholder: 'Search name or email', oninput: e => { state.q = e.target.value.toLowerCase(); draw(); } });
  const deptSel = select('', [{ value: '', label: 'All departments' }].concat((settings().departments || []).map(d => ({ value: d.id, label: d.name }))), { onchange: e => { state.dept = e.target.value; draw(); } });
  const levelSel = select('', [{ value: '', label: 'All positions' }].concat(allLevels().map(l => ({ value: l.id, label: l.name }))), { onchange: e => { state.level = e.target.value; draw(); } });
  const statusSel = select('active', [{ value: 'active', label: 'Active people' }, { value: 'all', label: 'Everyone' }, { value: 'inactive', label: 'Inactive only' }], { onchange: e => { state.status = e.target.value; draw(); } });
  const sortSel = select('name', [{ value: 'name', label: 'Sort: name' }, { value: 'perf', label: 'Sort: performance' }, { value: 'ready', label: 'Sort: readiness' }, { value: 'review', label: 'Sort: review due' }], { onchange: e => { state.sort = e.target.value; draw(); } });

  function draw() {
    let list = employees().filter(e =>
      (state.status === 'all' || (state.status === 'active' ? e.status !== 'inactive' : e.status === 'inactive')) &&
      (!state.dept || e.departmentId === state.dept) &&
      (!state.level || e.levelId === state.level) &&
      (!state.q || (e.name + ' ' + (e.email || '')).toLowerCase().includes(state.q)));
    list = list.sort((a, b) => state.sort === 'perf' ? (b.performance.latest || 0) - (a.performance.latest || 0)
      : state.sort === 'ready' ? ((b.readiness && b.readiness.percent) || 0) - ((a.readiness && a.readiness.percent) || 0)
        : state.sort === 'review' ? (a.reviewThisMonth === b.reviewThisMonth ? a.name.localeCompare(b.name) : a.reviewThisMonth ? 1 : -1)
          : a.name.localeCompare(b.name));
    body.textContent = '';
    if (!list.length) { body.appendChild(el('tr', {}, [el('td', { colspan: 7 }, [empty('Nobody found', 'Try a different filter.')])])); return; }
    list.forEach(e => {
      const mgr = empById(e.managerId);
      if (partnerEmp(e)) {
        const r = e.tasks.recent;
        body.appendChild(el('tr', { class: 'click', onclick: () => go('#/people/' + e.id) }, [
          el('td', { 'data-l': 'Name' }, [el('div', { class: 'row' }, [avatar(e.name, 'sm'), el('span', {}, [el('b', { text: e.name }), el('small', { class: 'muted', style: 'display:block', text: e.email || '' })])])]),
          el('td', { 'data-l': 'Position' }, [el('b', { text: 'Creative partner' }), el('small', { class: 'muted', style: 'display:block', text: e.title || '' })]),
          el('td', { 'data-l': 'Manager', class: 'muted', text: mgr ? mgr.name : '—' }),
          el('td', { 'data-l': 'Tasks' }, [r.onTimePct == null ? el('span', { class: 'muted', text: r.open + ' open' }) : chip(r.onTimePct + '% on time', r.onTimePct >= 85 ? 'ok' : 'warn')]),
          el('td', { 'data-l': 'Quality', class: 'num', text: r.avgQuality == null ? '—' : score(r.avgQuality) + ' / 5' }),
          el('td', { 'data-l': 'Type' }, [chip('Partner', 'partnerbadge')]),
          el('td')
        ]));
        return;
      }
      body.appendChild(el('tr', { class: 'click', onclick: () => go('#/people/' + e.id) }, [
        el('td', { 'data-l': 'Name' }, [el('div', { class: 'row' }, [avatar(e.name, 'sm'), el('span', {}, [el('b', { text: e.name }), el('small', { class: 'muted', style: 'display:block', text: e.email || '' })])])]),
        el('td', { 'data-l': 'Position' }, [el('b', { text: levelName(e.levelId) }), el('small', { class: 'muted', style: 'display:block', text: deptName(e.departmentId) })]),
        el('td', { 'data-l': 'Manager', class: 'muted', text: mgr ? mgr.name : '—' }),
        el('td', { 'data-l': 'Performance' }, [e.performance.latest ? el('div', { class: 'row', style: 'gap:8px' }, [
          el('span', { style: 'width:70px' }, [bar(e.performance.latest / 5 * 100, e.performance.latest >= 4 ? 'ok' : e.performance.latest >= 3 ? '' : 'warn')]),
          el('span', { class: 'num', text: score(e.performance.latest) })]) : chip('No review', 'warn')]),
        el('td', { 'data-l': 'Readiness' }, [e.readiness ? el('div', { class: 'row', style: 'gap:8px' }, [
          el('span', { style: 'width:70px' }, [bar(e.readiness.percent, 'plum')]), el('span', { class: 'num', text: pct(e.readiness.percent) })]) : '—']),
        el('td', { 'data-l': 'This month' }, [monthChip(e)]),
        el('td', { class: 'right' }, [canReview(e) ? el('button', {
          class: 'sm ghost', text: 'Review', onclick: ev => { ev.stopPropagation(); go('#/review/' + e.id + '/' + thisMonth()); }
        }) : null])
      ]));
    });
  }
  draw();
  wrap.appendChild(el('div', { class: 'tablecard' }, [
    el('div', { class: 'toolbar' }, [search, deptSel, levelSel, statusSel, sortSel]),
    el('table', { class: 'responsive' }, [
      el('thead', {}, [el('tr', {}, ['Name', 'Position', 'Manager', 'Performance', 'Readiness', 'This month', ''].map(h => el('th', { text: h })))]),
      body
    ])
  ]));
  return wrap;
}

export function personModal(emp) {
  const e = emp || { status: 'active', startDate: today() };
  const f = {
    name: input(e.name, { placeholder: 'Full name' }),
    email: input(e.email, { type: 'email', placeholder: 'name@example.com' }),
    levelId: select(e.levelId || '', allLevels().map(l => ({ value: l.id, label: l.departmentName + ' · ' + l.name }))),
    managerId: select(e.managerId || '', [{ value: '', label: 'No manager' }].concat(employees().filter(x => x.id !== e.id).map(x => ({ value: x.id, label: x.name })))),
    startDate: input(e.startDate, { type: 'date' }),
    phone: input(e.phone, { placeholder: 'Optional' }),
    status: select(e.status || 'active', [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]),
    leaveCarryOver: input(e.leaveCarryOver || 0, { type: 'number', step: '0.5' }),
    title: input(e.title, { placeholder: 'e.g. Cinematographer | Video Editor' })
  };
  // creative partners: what they do, and which kick-off tasks may go to them
  const covers = new Set(e.covers || []);
  const coverBox = el('div', { class: 'stack', style: 'gap:6px' }, coverOptions().map(([v, label]) =>
    checkbox(label, covers.has(v), on => { if (on) covers.add(v); else covers.delete(v); })));
  const partnerBox = el('div', {}, [field('What they do', f.title),
    field('Kick-off tasks they can get', coverBox, 'At kick-off, tasks of these kinds can go to them automatically. They never get anything else unless picked.')]);
  const syncPartner = () => { partnerBox.hidden = f.levelId.value !== 'creative_partner'; };
  f.levelId.addEventListener('change', syncPartner);
  syncPartner();
  modal(emp ? 'Edit person' : 'Add person', [
    el('div', { class: 'grid2' }, [field('Name', f.name), field('Email', f.email)]),
    field('Position', f.levelId, 'Skills and milestones for this position load automatically. Creative partners only get tasks.'),
    partnerBox,
    el('div', { class: 'grid2' }, [field('Manager', f.managerId), field('Start date', f.startDate)]),
    el('div', { class: 'grid3' }, [field('Phone', f.phone), field('Status', f.status),
      field('Leave carried over (days)', f.leaveCarryOver, 'Days brought in from last leave year')])
  ], [
    emp && isAdmin() ? el('button', { class: 'danger', text: 'Delete', onclick: () => {
      if (!confirm('Delete ' + emp.name + ' and all their reviews, goals and milestones? This cannot be undone.')) return;
      act({ action: 'deleteEmployee', id: emp.id }, 'Person deleted', () => { closeModal(); go('#/people'); render(); });
    } }) : null,
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save', onclick: () => act({
      action: 'saveEmployee',
      employee: { id: e.id, name: f.name.value, email: f.email.value, levelId: f.levelId.value, managerId: f.managerId.value,
        startDate: f.startDate.value, phone: f.phone.value, status: f.status.value, leaveCarryOver: f.leaveCarryOver.value,
        title: f.title.value, covers: [...covers] }
    }, 'Saved', () => { closeModal(); render(); }) })
  ]);
}

/* the kinds of work a creative partner can take on: whole departments, or one track */
function coverOptions() {
  const out = [];
  (settings().departments || []).filter(d => d.id !== 'partners').forEach(d => {
    out.push([d.id, d.name + ' (all)']);
    if ((d.tracks || []).length > 1) d.tracks.forEach(t => out.push([d.id + ':' + t.id, d.name + ' · ' + t.name]));
  });
  return out;
}
const coverNames = list => list.map(c => (coverOptions().find(o => o[0] === c) || [c, c])[1].replace(' (all)', ''));

/* ================= person page ================= */
export function viewPerson(id, tab) {
  const e = empById(id);
  if (!e) return empty('Not found', 'That person is not in your list.');
  const managing = canManage(e.id);
  if (partnerEmp(e)) {
    return frag([el('section', { class: 'card', style: 'margin-bottom:14px' }, [el('div', { class: 'headrow' }, [
      avatar(e.name, 'lg'),
      el('div', { class: 'grow' }, [el('h2', { style: 'font-size:22px', text: e.name }),
        el('p', { class: 'dim', text: [e.title || 'Creative partner', e.email, (e.covers || []).length ? 'takes ' + coverNames(e.covers).join(', ') + ' work' : ''].filter(Boolean).join(' · ') })]),
      el('div', { class: 'row wrap' }, [chip('Creative partner', 'partnerbadge'), managing ? el('button', { class: 'sm ghost', text: 'Edit', onclick: () => personModal(e) }) : null])
    ])]), personTasks(e, managing)]);
  }
  const tabs = ['Overview', 'Tasks', 'Performance', 'Goals', 'Milestones', 'Skills', 'Career', 'Reviews', 'Leave'].concat(managing ? ['Private notes'] : []);
  const active = tab || 'overview';
  const head = el('section', { class: 'card', style: 'margin-bottom:14px' }, [
    el('div', { class: 'headrow' }, [
      avatar(e.name, 'lg'),
      el('div', { class: 'grow' }, [
        el('h2', { style: 'font-size:22px', text: e.name }),
        el('p', { class: 'dim', text: [levelName(e.levelId), deptName(e.departmentId), e.email, 'started ' + dateShort(e.startDate)].filter(Boolean).join(' · ') })
      ]),
      el('div', { class: 'row wrap' }, [
        e.performance.latest ? chip('Performance ' + score(e.performance.latest), e.performance.latest >= 4 ? 'ok' : '') : chip('No review', 'warn'),
        e.readiness ? chip('Readiness ' + pct(e.readiness.percent), 'plum') : null,
        canReview(e) ? el('button', { class: 'primary sm', text: 'Monthly review', onclick: () => go('#/review/' + e.id + '/' + thisMonth()) }) : null,
        e.founderOnly && managing && !isAdmin() ? chip('Reviewed by the founder') : null,
        managing ? el('button', { class: 'sm ghost', text: 'Edit', onclick: () => personModal(e) }) : null
      ])
    ])
  ]);
  const tabBar = el('div', { class: 'tabs' }, tabs.map(t => el('button', {
    'aria-current': String(active === t.toLowerCase().replace(' ', '-')),
    text: t, onclick: () => go('#/people/' + e.id + '/' + t.toLowerCase().replace(' ', '-'))
  })));
  return frag([head, tabBar, personTab(e, active, managing)]);
}

function personTab(e, tab, managing) {
  const quarter = S.data.quarter;
  switch (tab) {
    case 'tasks': return personTasks(e, managing);
    case 'performance': {
      const list = reviewsOf(e.id);
      return frag([
        card('Trend', e.performance.count + ' reviews', [
          e.performance.count ? el('div', { class: 'row', style: 'gap:18px;align-items:flex-end' }, [
            el('div', {}, [el('div', { style: 'font-size:34px;font-weight:500;letter-spacing:-.03em' }, [score(e.performance.latest)]), el('div', { class: 'muted', style: 'font-size:12.5px', text: monthName(e.performance.latestPeriod) })]),
            el('div', { class: 'grow' }, [spark(e.performance.trend)])
          ]) : empty('No reviews yet', 'Start with a monthly review.', canReview(e) ? el('button', { class: 'primary', text: 'Start review', onclick: () => go('#/review/' + e.id + '/' + thisMonth()) }) : null)
        ]),
        el('div', { style: 'margin-top:14px' }, [card('By category', 'Average of the last three reviews', [
          el('div', { class: 'list' }, universal().map(c => {
            const vals = list.filter(r => r.status === 'approved').slice(0, 3).map(r => Number((r.scores || {})[c.id] || 0)).filter(Boolean);
            const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
            return el('div', { class: 'row', style: 'gap:12px' }, [
              el('span', { style: 'width:130px;font-size:13.5px', text: c.name }),
              el('span', { class: 'grow' }, [bar(avg / 5 * 100, avg >= 4 ? 'ok' : avg >= 3 ? '' : 'warn')]),
              el('span', { class: 'num', style: 'width:34px;text-align:right', text: avg ? score(avg) : '—' })
            ]);
          }))
        ])])
      ]);
    }
    case 'goals': {
      const list = goalsOf(e.id).filter(g => g.quarter === quarter);
      return card('Goals · ' + quarterLabel(quarter), quarterDates(quarter), [
        list.length ? el('div', { class: 'list' }, list.map(g => el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
          el('span', { class: 'grow', style: 'min-width:180px' }, [el('b', { text: g.title }), el('small', { text: [goalTypeName(g.type), g.dueDate ? 'due ' + dateShort(g.dueDate) : '', linkedTasks('goal', g.id).text].filter(Boolean).join(' · ') })]),
          el('span', { style: 'width:110px' }, [bar(g.progressPct)]), el('span', { class: 'num', style: 'width:40px', text: pct(g.progressPct) }),
          statusChip(g.status), el('button', { class: 'sm ghost', text: 'Open', onclick: () => goalModal(g, e, managing) })
        ]))) : empty('No goals', 'No goals have been set for this quarter.')
      ], managing ? [el('button', { class: 'primary sm', text: 'Add goal', onclick: () => goalModal(null, e, true) })] : null);
    }
    case 'milestones': {
      const list = milestonesOf(e.id);
      return card('Milestones', list.filter(m => ['achieved', 'reviewed'].includes(m.status)).length + ' of ' + list.length + ' achieved', [
        list.length ? el('div', { class: 'list' }, list.map(m => el('div', { class: 'item' }, [
          el('span', { class: 'grow' }, [el('b', { text: m.title }), el('small', { text: [m.dueDate ? 'due ' + dateShort(m.dueDate) : '', m.responsibility ? 'counts as next-level responsibility' : '', linkedTasks('milestone', m.id).text].filter(Boolean).join(' · ') })]),
          statusChip(m.status), el('button', { class: 'sm ghost', text: 'Open', onclick: () => milestoneModal(m, e, managing) })
        ]))) : empty('No milestones', 'Add the milestones for the next level.')
      ], managing ? [el('button', { class: 'primary sm', text: 'Add milestone', onclick: () => milestoneModal(null, e, true) })] : null);
    }
    case 'skills': {
      const mine = skillsOf(e.id);
      const rating = n => mine.find(x => x.name === n) || { level: 0 };
      const nxt = nextLevelOf(e.levelId);
      const rows = list => el('div', { class: 'list' }, list.map(sk => el('div', { class: 'item' }, [
        el('span', { class: 'grow', text: sk.name }), meter(Number(rating(sk.name).level) || 0, sk.req),
        chip((rating(sk.name).level || 0) + ' / ' + sk.req, (rating(sk.name).level || 0) >= sk.req ? 'ok' : 'warn')
      ])));
      return frag([
        card('Skills at ' + levelName(e.levelId), null, [rows(levelSkills(e.levelId))],
          managing ? [el('button', { class: 'primary sm', text: 'Rate skills', onclick: () => skillsModal(e) })] : null),
        nxt ? el('div', { style: 'margin-top:14px' }, [card('Needed for ' + nxt.name, null, [rows(levelSkills(nxt.id))])]) : null
      ]);
    }
    case 'career': {
      const r = e.readiness;
      return frag([
        r ? card('Promotion readiness', r.nextLevel ? 'Toward ' + r.nextLevel.name : null, [
          el('div', { class: 'row wrap', style: 'gap:20px;align-items:center' }, [
            donut(r.percent),
            el('div', { class: 'grow list', style: 'min-width:min(100%,280px)' }, Object.keys(r.parts).map(k => {
              const p = r.parts[k];
              return el('div', { class: 'row', style: 'gap:12px' }, [
                el('span', { style: 'flex:1;min-width:0;font-size:13.5px', text: p.label }),
                el('span', { style: 'width:min(110px,24vw);flex:none' }, [bar(p.ratio * 100, p.ratio >= 0.8 ? 'ok' : '')]),
                el('span', { class: 'num muted', style: 'width:76px;text-align:right;font-size:13px', text: k === 'performance' ? score(p.done) + ' / 5' : p.done + ' / ' + p.total })
              ]);
            })),
            el('div', {}, [
              el('div', { class: 'muted', style: 'font-size:12px', text: 'Decision' }),
              el('div', { style: 'margin:4px 0' }, [statusChip(r.decision || r.suggested)]),
              managing ? el('button', { class: 'sm', text: 'Record decision', onclick: () => promotionModal(e, r) }) : null
            ])
          ]),
          el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:12px', text: 'It fills itself in: milestones count when you mark them achieved; skills when you rate them at or above what ' +
            (r.nextLevel ? r.nextLevel.name : 'the next level') + ' needs; performance from the last 3 approved monthly reviews; responsibility from completed level-up goals and achieved milestones marked as next-level responsibility. At 75% it says “ready for management review”. Nobody is promoted until you record the decision.' })
        ]) : null,
        el('div', { style: 'margin-top:14px' }, [card('History', null, [
          (S.data.promotions || []).filter(p => p.employeeId === e.id).length
            ? el('div', { class: 'list' }, (S.data.promotions || []).filter(p => p.employeeId === e.id)
              .sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt))).map(p => el('div', { class: 'item' }, [
                chip(dateShort(p.decidedAt)),
                el('span', { class: 'grow' }, [el('b', { text: STATUS_LABEL[p.decision] || p.decision }),
                  el('small', { text: [p.fromLevelId ? levelName(p.fromLevelId) : '', p.toLevelId ? '→ ' + levelName(p.toLevelId) : '', p.notes].filter(Boolean).join(' · ') })])
              ])))
            : empty('Nothing recorded', 'Promotion decisions will be listed here.')
        ])])
      ]);
    }
    case 'reviews': {
      const list = reviewsOf(e.id);
      const qs = quarterliesOf(e.id).sort((a, b) => String(b.quarter).localeCompare(String(a.quarter)));
      return frag([
        card('Monthly reviews', null, [
          list.length ? el('div', { class: 'list' }, list.map(r => el('div', { class: 'item' }, [
            el('span', { style: 'width:130px' }, [el('b', { text: monthName(r.period) })]),
            el('span', { class: 'grow muted', text: r.wins ? r.wins.slice(0, 70) : '' }),
            reviewStateChip(r),
            chip(score(r.overall) + ' / 5', r.overall >= 4 ? 'ok' : ''),
            el('button', { class: 'sm ghost', text: 'Read', onclick: () => reviewModal(r, e) }),
            canReview(e) ? el('button', { class: 'sm ghost', text: 'Edit', onclick: () => go('#/review/' + e.id + '/' + r.period) }) : null
          ]))) : empty('No reviews yet', canReview(e) ? 'Start with this month.' : 'Nothing approved yet.')
        ], canReview(e) ? [el('button', { class: 'primary sm', text: 'New monthly review', onclick: () => go('#/review/' + e.id + '/' + thisMonth()) })] : null),
        el('div', { style: 'margin-top:14px' }, [card('Quarterly reviews', null, [
          qs.length ? el('div', { class: 'list' }, qs.map(q => el('div', { class: 'item' }, [
            el('span', { style: 'width:110px' }, [el('b', { text: quarterLabel(q.quarter) })]),
            el('span', { class: 'grow muted', text: q.recommendation ? q.recommendation.slice(0, 80) : '' }),
            reviewStateChip(q),
            el('button', { class: 'sm ghost', text: 'Open', onclick: () => go('#/quarterly/' + e.id + '/' + q.quarter) })
          ]))) : empty('None yet', 'The quarterly review pulls the last three months together.')
        ], canReview(e) ? [el('button', { class: 'primary sm', text: 'Start quarterly review', onclick: () => go('#/quarterly/' + e.id + '/' + S.data.quarter) })] : null)])
      ]);
    }
    case 'leave': {
      const list = leaveOf(e.id);
      return card('Leave', e.leave.annual.available + ' days available now · ' + e.leave.annual.accrued + ' earned of ' + e.leave.annual.allowance + ' this leave year', [
        list.length ? el('div', { class: 'list' }, list.map(l => leaveRow(l, e, managing))) : empty('No leave', 'No requests yet.')
      ], managing ? [el('button', { class: 'sm', text: 'Add leave', onclick: () => leaveModal(e) })] : null);
    }
    case 'private-notes': {
      if (!managing) return empty('Not available', '');
      const notes = notesOf(e.id);
      const box = textarea('', { placeholder: 'Only managers and admins can read this.' });
      return card('Private management notes', 'Never shown to the employee', [
        field('New note', box),
        el('button', { class: 'primary sm', text: 'Save note', onclick: () => {
          if (!box.value.trim()) return;
          act({ action: 'saveNote', employeeId: e.id, text: box.value.trim() }, 'Note saved');
        } }),
        el('div', { class: 'list', style: 'margin-top:14px' }, notes.map(n => el('div', { class: 'item' }, [
          el('span', { class: 'grow' }, [el('b', { style: 'font-weight:400;white-space:pre-wrap', text: n.text }), el('small', { text: dateShort(n.createdAt) })]),
          el('button', { class: 'sm ghost', text: 'Delete', onclick: () => act({ action: 'deleteNote', id: n.id }, 'Note deleted') })
        ])))
      ]);
    }
    default: {
      const gaps = skillGaps(e).slice(0, 4);
      const goals = goalsOf(e.id).filter(g => g.quarter === quarter);
      const ms = milestonesOf(e.id);
      return frag([
        el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
          tile('Performance', e.performance.latest ? score(e.performance.latest) : '—', e.performance.latestPeriod ? monthName(e.performance.latestPeriod) : 'no review yet'),
          tile('Readiness', e.readiness ? pct(e.readiness.percent) : '—', e.readiness && e.readiness.nextLevel ? e.readiness.nextLevel.name : ''),
          tile('Goals', goals.filter(g => g.status === 'completed').length + '/' + goals.length, 'completed this quarter'),
          tile('Milestones', ms.filter(m => ['achieved', 'reviewed'].includes(m.status)).length + '/' + ms.length, 'achieved')
        ]),
        el('div', { class: 'grid2' }, [
          card('Skill gaps', null, [gaps.length ? el('div', { class: 'list' }, gaps.map(g => el('div', { class: 'item' }, [
            el('span', { class: 'grow', text: g.name }), meter(g.level, g.required), chip(g.level + ' → ' + g.required, 'warn')
          ]))) : empty('No gaps', 'Skills are at the level required.')]),
          card('This quarter', quarterLabel(quarter), [goals.length ? el('div', { class: 'list' }, goals.map(g => el('div', { class: 'item' }, [
            el('span', { class: 'grow' }, [el('b', { text: g.title }), el('small', { text: goalTypeName(g.type) })]),
            el('span', { style: 'width:90px' }, [bar(g.progressPct)]), statusChip(g.status)
          ]))) : empty('No goals', 'Nothing set for this quarter.')])
        ])
      ]);
    }
  }
}

function ratePrompt(e) { import('/team/me.js').then(() => { go('#/people/' + e.id + '/skills'); }); }

function promotionModal(e, r) {
  const decision = select(r.decision || r.suggested, [
    { value: 'not_ready', label: 'Not ready' }, { value: 'developing', label: 'Developing toward next level' },
    { value: 'management_review', label: 'Ready for management review' }, { value: 'approved', label: 'Approved' }
  ]);
  const notes = textarea('', { placeholder: 'What was decided and why' });
  const applyLevel = { checked: false };
  modal('Record promotion decision · ' + e.name, [
    el('p', { class: 'dim', style: 'margin-bottom:12px', text: 'Readiness is ' + pct(r.percent) + '. The decision is yours, not the system’s.' }),
    field('Decision', decision), field('Notes', notes),
    isAdmin() && r.nextLevel ? checkbox('Also move ' + e.name + ' to ' + r.nextLevel.name + ' now', false, v => { applyLevel.checked = v; }) : null
  ], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save decision', onclick: () => act({
      action: 'savePromotion', employeeId: e.id, decision: decision.value, notes: notes.value, applyLevel: applyLevel.checked
    }, 'Decision recorded', () => { closeModal(); render(); }) })
  ]);
}

/* ================= monthly review flow ================= */
/* ---------- task ratings as evidence for a review ----------
   The tasks a person finished in the month, with each rating and comment, turned into
   suggested Quality and Execution scores and a first draft of the written feedback.
   Suggestions only: the manager still picks every score. */
function monthTasks(e, period) {
  return tasksOf(e.id).filter(t => t.status === 'done' && String(t.deliveredAt || t.completedAt || '').slice(0, 7) === period)
    .sort((a, b) => String(a.deliveredAt).localeCompare(String(b.deliveredAt)));
}
export function suggestedScores(list) {
  const out = {};
  const rated = list.filter(t => t.quality);
  if (rated.length) out.quality = Math.max(1, Math.min(5, Math.round(rated.reduce((s2, t) => s2 + Number(t.quality), 0) / rated.length)));
  const dated = list.filter(t => t.dueDate);
  if (dated.length) {
    const p = dated.filter(t => !(t.daysLate > 0)).length / dated.length * 100;
    let v = p >= 95 ? 5 : p >= 85 ? 4 : p >= 70 ? 3 : p >= 50 ? 2 : 1;
    const revs = list.reduce((s2, t) => s2 + Number(t.revisions || 0), 0) / list.length;
    if (revs >= 1.5) v = Math.max(1, v - 1);
    out.execution = v;
  }
  return out;
}
function feedbackFromTasks(list) {
  const good = list.filter(t => Number(t.quality) >= 4).sort((a, b) => b.quality - a.quality).slice(0, 4);
  const weak = list.filter(t => Number(t.quality) && Number(t.quality) <= 2);
  const late = list.filter(t => t.daysLate > 0);
  const revised = list.filter(t => Number(t.revisions) >= 2);
  const line = t => t.title + (t.quality ? ' (' + t.quality + '/5' + (t.qualityNote ? ': ' + t.qualityNote : '') + ')' : '');
  return {
    wins: good.length ? 'Strong work on ' + good.map(line).join('; ') + '.' : '',
    improve: [late.length ? late.length + ' task' + (late.length === 1 ? ' was' : 's were') + ' late: ' + late.map(t => t.title + ' (' + t.daysLate + 'd)').join(', ') + '.' : '',
      weak.length ? 'Below the standard: ' + weak.map(line).join('; ') + '.' : '',
      revised.length ? 'Needed several rounds of changes: ' + revised.map(t => t.title + ' (' + t.revisions + ')').join(', ') + '.' : ''].filter(Boolean).join(' ')
  };
}
function reviewTasksCard(e, period, draft, redraw) {
  const list = monthTasks(e, period);
  const sug = suggestedScores(list);
  const names = { quality: 'Quality', execution: 'Execution' };
  return el('div', { class: 'card', style: 'background:var(--soft);border:0' }, [
    el('div', { class: 'row wrap', style: 'justify-content:space-between;gap:8px' }, [
      el('div', {}, [el('b', { text: 'From their tasks in ' + monthName(period) }), el('div', { class: 'muted', style: 'font-size:12.5px', text: list.length ? list.length + ' finished · each one rated when you marked it done' : 'No finished tasks this month' })]),
      Object.keys(sug).length ? el('button', { class: 'sm primary', text: 'Use suggested scores', onclick: () => { Object.assign(draft.scores, sug); redraw(); } }) : null
    ]),
    Object.keys(sug).length ? el('p', { style: 'margin-top:8px;font-size:13.5px' }, ['Suggested: ', ...Object.entries(sug).map(([k, v], i) => el('b', { text: (i ? ' · ' : '') + names[k] + ' ' + v }))]) : null,
    list.length ? el('div', { class: 'list', style: 'margin-top:10px' }, list.map(t => el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
      el('span', { class: 'grow', style: 'min-width:180px' }, [el('b', { text: t.title }),
        el('small', { text: [t.client, linkedTo(t), t.revisions ? t.revisions + ' revision' + (t.revisions === 1 ? '' : 's') : '', t.qualityNote ? '“' + t.qualityNote + '”' : ''].filter(Boolean).join(' · ') })]),
      t.daysLate > 0 ? chip(t.daysLate + 'd late', 'bad') : chip('On time', 'ok'),
      t.quality ? chip(t.quality + ' / 5', t.quality >= 4 ? 'ok' : t.quality <= 2 ? 'bad' : '') : chip('Not rated')
    ]))) : null,
    el('p', { class: 'muted', style: 'font-size:12px;margin-top:8px', text: 'Quality = the average task rating. Execution = the share delivered on time (one lower with many revisions). Ownership, Collaboration and Growth are yours to judge.' })
  ]);
}

export function viewReview(employeeId, period) {
  const e = empById(employeeId);
  if (!e) return empty('Not found', '');
  if (!canManage(e.id)) return empty('Not allowed', 'You can only review people who report to you.');
  if (e.id === me().employeeId) return empty('Not available', 'Your own review is written by the founder.');
  if (!canReview(e)) return empty('Reviewed by the founder', e.name + ' is a manager, so their review is written and approved by the founder.');
  const existing = reviewsOf(e.id).find(r => r.period === period) || null;
  const draft = {
    employeeId: e.id, period, id: existing && existing.id,
    scores: { ...((existing && existing.scores) || {}) },
    salesKpis: { ...((existing && existing.salesKpis) || {}) },
    // skills start from the person's current ratings; what you set here updates them
    roleScores: { ...Object.fromEntries(skillsOf(e.id).filter(x => Number(x.level) > 0).map(x => [x.name, Number(x.level)])), ...((existing && existing.roleScores) || {}) },
    wins: (existing && existing.wins) || '', improve: (existing && existing.improve) || '',
    observation: (existing && existing.observation) || '', nextFocus: (existing && existing.nextFocus) || '',
    privateNote: (existing && existing.privateNote) || '', newMilestones: ['', '', ''], milestoneDue: ''
  };
  let step = 1;
  const wrap = el('div');
  const isSales = e.departmentId === 'sales';

  function totals() {
    const cats = universal();
    let sum = 0, w = 0;
    cats.forEach(c => { const v = Number(draft.scores[c.id]) || 0; if (v) { sum += v * c.weight; w += c.weight; } });
    return w ? sum / w : 0;
  }

  function summaryPanel() {
    return el('div', { class: 'card', style: 'position:sticky;top:76px' }, [
      el('h3', { text: 'Live score' }),
      el('div', { class: 'list', style: 'margin:12px 0' }, universal().map(c => el('div', { class: 'row', style: 'gap:10px' }, [
        el('span', { style: 'flex:1;font-size:13px', text: c.name }),
        el('span', { style: 'width:70px' }, [bar((Number(draft.scores[c.id]) || 0) / 5 * 100)]),
        el('span', { class: 'num', style: 'width:24px;text-align:right', text: draft.scores[c.id] || '—' })
      ]))),
      el('div', { class: 'row', style: 'justify-content:space-between;border-top:1px solid var(--line);padding-top:10px' }, [
        el('b', { text: 'Overall' }), el('b', { class: 'num', style: 'font-size:22px', text: score(totals()) + ' / 5' })
      ]),
      el('p', { class: 'muted', style: 'font-size:12px;margin-top:8px', text: 'Weighted: ' + universal().map(c => c.name + ' ' + Math.round(c.weight * 100) + '%').join(' · ') })
    ]);
  }

  function stepBody() {
    if (step === 1) {
      const sel = select(period, lastMonths(12).map(m => ({ value: m, label: monthName(m) })), { onchange: ev => go('#/review/' + e.id + '/' + ev.target.value) });
      const prev = reviewsOf(e.id).filter(r => r.status === 'approved').slice(0, 3);
      return card('Review period', 'Which month are you reviewing?', [
        field('Month', sel),
        prev.length ? el('div', { style: 'margin-top:8px' }, [
          el('div', { class: 'muted', style: 'font-size:12.5px;margin-bottom:6px', text: 'Recent scores' }),
          el('div', { class: 'list' }, prev.map(r => el('div', { class: 'item' }, [
            el('span', { class: 'grow', text: monthName(r.period) }), chip(score(r.overall) + ' / 5', r.overall >= 4 ? 'ok' : '')
          ])))
        ]) : null,
        existing ? el('p', { class: 'muted', style: 'margin-top:10px', text: {
          approved: isAdmin() ? 'This review is approved. Saving changes keeps it approved.' : 'This review is approved. Changing it takes it back to draft until you send it and it is approved again.',
          awaiting_approval: 'This review is waiting for the founder’s approval. Changing it takes it back to draft until you send it again.',
          draft: existing.returnedAt ? 'The founder sent this back: ' + (existing.returnNote || 'see notes') : 'You have a draft for this month.'
        }[existing.status] || '' }) : null,
        el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: isAdmin()
          ? 'Reviews you send are approved straight away and shown to ' + e.name.split(' ')[0] + '.'
          : 'When you send it, the founder approves it. Only then does ' + e.name.split(' ')[0] + ' see it.' })
      ]);
    }
    if (step === 2) {
      const sug2 = suggestedScores(monthTasks(e, period));
      return card('The five categories', 'Rate 1–5. The definition is beside each score.', [
        el('div', { style: 'margin-bottom:12px' }, [reviewTasksCard(e, period, draft, redraw)]),
        el('div', { class: 'stack' }, universal().map(c => el('div', { class: 'card', style: 'background:var(--soft);border:0' }, [
          el('div', { class: 'row', style: 'justify-content:space-between;gap:10px' }, [
            el('div', {}, [el('b', { text: c.name }), el('div', { class: 'muted', style: 'font-size:12.5px', text: c.description })]),
            el('div', { class: 'row', style: 'gap:6px' }, [sug2[c.id] ? chip('From tasks: ' + sug2[c.id], 'accent') : null, chip(Math.round(c.weight * 100) + '%')])
          ]),
          el('div', { class: 'row wrap', style: 'gap:6px;margin-top:10px' }, [1, 2, 3, 4, 5].map(v => el('button', {
            class: Number(draft.scores[c.id]) === v ? 'primary' : 'ghost',
            text: String(v), title: (ratingScale().find(r => r.value === v) || {}).label || '',
            onclick: () => { draft.scores[c.id] = v; redraw(); }
          }))),
          draft.scores[c.id] ? el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:8px', text: (ratingScale().find(r => r.value === Number(draft.scores[c.id])) || {}).description || '' }) : null
        ])))
      ]);
    }
    if (step === 3) {
      const nxtL = nextLevelOf(e.levelId);
      const criteria = levelSkills(e.levelId).concat((nxtL ? levelSkills(nxtL.id) : []).filter(k => !levelSkills(e.levelId).some(c => c.name === k.name)));
      const scale = skillScale();
      return frag([
        card(isSales ? 'Sales numbers for ' + monthName(period) : 'Skills · ' + levelName(e.levelId) + (nxtL ? ' and ' + nxtL.name : ''),
          isSales ? 'Enter what actually happened this month.' : 'Optional: rate their skills out of ' + scale + '. It updates their skills and promotion readiness.', [
          isSales ? el('div', { class: 'grid2' }, (settings().salesKpis || []).filter(k => k.format !== 'currency' || S.data.showMoney).map(k => field(k.name + (k.target ? ' (target ' + k.target + ')' : ''),
            input(draft.salesKpis[k.id], { type: 'number', step: 'any', oninput: ev => { draft.salesKpis[k.id] = ev.target.value; } }))))
            : el('div', { class: 'stack' }, criteria.map(c => el('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' }, [
              el('span', { style: 'flex:1;min-width:160px' }, [c.name, el('small', { class: 'muted', style: 'display:block', text: 'needs ' + c.req + ' / ' + scale })]),
              el('div', { class: 'row wrap', style: 'gap:4px' }, Array.from({ length: scale + 1 }, (_, v) => v).map(v => el('button', {
                class: Number(draft.roleScores[c.name] || 0) === v ? 'primary sm' : 'ghost sm', text: v === 0 ? '–' : String(v),
                onclick: () => { draft.roleScores[c.name] = v; redraw(); }
              })))
            ])))
        ]),
        isSales ? el('div', { style: 'margin-top:14px' }, [salesFunnelCard(draft.salesKpis)]) : null
      ]);
    }
    if (step === 4) {
      const fromTasks = feedbackFromTasks(monthTasks(e, period));
      return card('Written feedback', 'Short and specific beats long and vague.', [
        fromTasks.wins || fromTasks.improve ? el('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:12px' }, [
          el('button', { class: 'sm', text: 'Draft from task ratings', onclick: () => {
            if (fromTasks.wins) draft.wins = draft.wins ? draft.wins + '\n' + fromTasks.wins : fromTasks.wins;
            if (fromTasks.improve) draft.improve = draft.improve ? draft.improve + '\n' + fromTasks.improve : fromTasks.improve;
            redraw();
          } }), el('span', { class: 'muted', style: 'font-size:12.5px', text: 'Fills in the best-rated, late and low-rated tasks. Edit it into your own words.' })]) : null,
        field('What went well?', textarea(draft.wins, { oninput: ev => { draft.wins = ev.target.value; } })),
        field('What needs improvement?', textarea(draft.improve, { oninput: ev => { draft.improve = ev.target.value; } })),
        field('Key observation', textarea(draft.observation, { oninput: ev => { draft.observation = ev.target.value; } })),
        field('Focus for next month', textarea(draft.nextFocus, { oninput: ev => { draft.nextFocus = ev.target.value; } })),
        field('Private note (management only)', textarea(draft.privateNote, { oninput: ev => { draft.privateNote = ev.target.value; } }), 'Never shown to the employee.')
      ]);
    }
    const open = milestonesOf(e.id).filter(m => !['achieved', 'reviewed'].includes(m.status));
    return frag([
      card('Milestones from last month', 'Mark anything that is now done.', [
        open.length ? el('div', { class: 'list' }, open.slice(0, 6).map(m => el('div', { class: 'item' }, [
          el('span', { class: 'grow' }, [el('b', { text: m.title }), linkedTasks('milestone', m.id).text ? el('small', { text: linkedTasks('milestone', m.id).text }) : null]), statusChip(m.status),
          el('button', { class: 'sm', text: 'Mark achieved', onclick: () => act({ action: 'saveMilestone', milestone: { id: m.id, employeeId: e.id, status: 'achieved' } }, 'Milestone achieved', () => redraw()) })
        ]))) : empty('Nothing open', 'No milestones are waiting.')
      ]),
      el('div', { style: 'margin-top:14px' }, [card('New milestones for next month', 'Add up to three concrete things.', [
        ...draft.newMilestones.map((v, i) => field('Milestone ' + (i + 1), input(v, { placeholder: i === 0 ? 'e.g. Present 3 concepts unaided' : 'Optional', oninput: ev => { draft.newMilestones[i] = ev.target.value; } }))),
        field('Due date', input(draft.milestoneDue, { type: 'date', oninput: ev => { draft.milestoneDue = ev.target.value; } }))
      ])])
    ]);
  }

  function redraw() {
    wrap.textContent = '';
    wrap.appendChild(el('div', { class: 'steps' }, ['Period', 'Five categories', isSales ? 'Sales numbers' : 'Role criteria', 'Feedback', 'Milestones'].map((t, i) =>
      el('button', { 'aria-current': String(step === i + 1), text: (i + 1) + '. ' + t, onclick: () => { step = i + 1; redraw(); } }))));
    wrap.appendChild(el('div', { class: 'grid2', style: 'grid-template-columns:minmax(0,1fr) 300px;align-items:start' }, [
      el('div', {}, [stepBody(),
        el('div', { class: 'row', style: 'justify-content:space-between;margin-top:16px' }, [
          step > 1 ? el('button', { class: 'ghost', text: '← Back', onclick: () => { step--; redraw(); } }) : el('span'),
          el('div', { class: 'row' }, [
            el('button', { text: 'Save draft', onclick: () => save(false) }),
            step < 5 ? el('button', { class: 'primary', text: 'Next →', onclick: () => { step++; redraw(); } })
              : el('button', { class: 'primary', text: isAdmin() ? 'Approve and share' : 'Send for approval', onclick: () => save(true) })
          ])
        ])
      ]),
      summaryPanel()
    ]));
  }

  function save(submit) {
    act({ action: 'saveReview', submit, review: draft }, submit ? (isAdmin() ? 'Approved — ' + e.name.split(' ')[0] + ' can see it now' : 'Sent to the founder for approval') : 'Draft saved', () => {
      if (submit) go('#/people/' + e.id + '/reviews'); else render();
    });
  }
  redraw();
  return frag([
    el('div', { class: 'row', style: 'margin-bottom:14px;gap:12px' }, [
      avatar(e.name), el('div', { class: 'grow' }, [el('b', { text: e.name }), el('div', { class: 'muted', style: 'font-size:13px', text: levelName(e.levelId) + ' · ' + monthName(period) })]),
      existing ? reviewStateChip(existing) : null,
      el('button', { class: 'ghost sm', text: 'Back to profile', onclick: () => go('#/people/' + e.id) })
    ]),
    existing && existing.status === 'draft' && existing.returnedAt ? el('div', { class: 'card', style: 'margin-bottom:14px;border-color:var(--bad)' }, [
      chip('Sent back by the founder', 'bad'), el('p', { style: 'margin-top:6px', text: existing.returnNote || 'No note given.' })
    ]) : null,
    wrap
  ]);
}

function salesFunnelCard(kpis) {
  const stages = [['qualified_leads', 'Qualified leads'], ['meetings_opportunities', 'Meetings'], ['proposals', 'Proposals'], ['deals_won', 'Deals won']];
  const max = Math.max(1, ...stages.map(([k]) => Number(kpis[k]) || 0));
  return card('Funnel', 'Where the drop-off happens', [
    el('div', { class: 'list' }, stages.map(([k, label]) => el('div', { class: 'row', style: 'gap:12px' }, [
      el('span', { style: 'width:120px;font-size:13.5px', text: label }),
      el('span', { class: 'grow' }, [bar(((Number(kpis[k]) || 0) / max) * 100, 'plum')]),
      el('span', { class: 'num', style: 'width:60px;text-align:right', text: Number(kpis[k]) || 0 })
    ]))),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:10px', text: 'Conversion ' + (Number(kpis.qualified_leads) ? Math.round((Number(kpis.deals_won) || 0) / Number(kpis.qualified_leads) * 100) : 0) + '%' + (S.data.showMoney ? ' · revenue ' + money(kpis.revenue_generated || 0) : '') })
  ]);
}

const lastMonths = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });

/* ================= quarterly review ================= */
export function viewQuarterly(employeeId, quarter) {
  const e = empById(employeeId);
  if (!e) return empty('Not found', '');
  const writer = canReview(e);
  const wrap = el('div', {}, [el('div', { class: 'skel' })]);
  const existing = quarterliesOf(e.id).find(q => q.quarter === quarter);
  const draft = {
    employeeId: e.id, quarter, nextQuarter: nextQuarterOf(quarter),
    achieved: (existing && existing.achieved) || '', notAchieved: (existing && existing.notAchieved) || '',
    improved: (existing && existing.improved) || '', needsWork: (existing && existing.needsWork) || '',
    recommendation: (existing && existing.recommendation) || '', nextFocus: (existing && existing.nextFocus) || '',
    meetingDate: (existing && existing.meetingDate) || today(), privateNote: (existing && existing.privateNote) || '',
    nextGoals: [{ type: 'performance', title: '' }, { type: 'skill_development', title: '' }, { type: 'level_up', title: '' }]
  };

  getSummary(e.id, quarter).then(sum => {
    wrap.textContent = '';
    const tk = sum.tasks || {};
    wrap.appendChild(el('div', { class: 'grid4', style: 'margin-bottom:14px' }, [
      tile('Average this quarter', sum.average ? score(sum.average) + ' / 5' : '—', sum.reviews.length + ' approved monthly reviews'),
      tile('Change', (sum.change > 0 ? '+' : '') + score(sum.change), 'vs ' + (sum.previousAverage ? score(sum.previousAverage) : 'no data')),
      tile('Goals completed', sum.goalsCompleted + ' / ' + sum.goals.length, 'this quarter'),
      tile('Tasks on time', tk.onTimePct == null ? '—' : pct(tk.onTimePct), tk.done ? tk.done + ' done' + (tk.avgQuality != null ? ' · quality ' + score(tk.avgQuality) : '') : 'no finished tasks')
    ]));
    wrap.appendChild(el('div', { class: 'grid2' }, [
      card('Monthly scores', sum.info ? sum.info.months.map(monthShort).join(', ') : null, [
        sum.reviews.length ? el('div', { class: 'list' }, sum.reviews.map(r => el('div', { class: 'item' }, [
          el('span', { style: 'width:110px', text: monthName(r.period) }),
          el('span', { class: 'grow' }, [bar(r.overall / 5 * 100, r.overall >= 4 ? 'ok' : '')]),
          chip(score(r.overall))
        ]))) : empty('No approved monthly reviews', 'The monthly reviews for these months come first.')
      ]),
      card('Goals', null, [
        sum.goals.length ? el('div', { class: 'list' }, sum.goals.map(g => el('div', { class: 'item' }, [
          el('span', { class: 'grow' }, [el('b', { text: g.title }), el('small', { text: goalTypeName(g.type) })]),
          el('span', { style: 'width:80px' }, [bar(g.progress)]), statusChip(g.status)
        ]))) : empty('No goals', 'Nothing was set for this quarter.')
      ])
    ]));
    wrap.appendChild(el('div', { class: 'grid2', style: 'margin-top:14px' }, [
      card('Skills', 'Gaps to carry into next quarter', [
        sum.skills.gaps.length ? el('div', { class: 'list' }, sum.skills.gaps.slice(0, 6).map(g => el('div', { class: 'item' }, [
          el('span', { class: 'grow', text: g.name }), meter(g.level, g.required), chip(g.level + ' → ' + g.required, 'warn')
        ]))) : empty('No gaps', 'Skills meet the level.')
      ]),
      card('Promotion readiness', sum.readiness && sum.readiness.nextLevel ? 'Toward ' + sum.readiness.nextLevel.name : null, [
        sum.readiness ? el('div', { class: 'row', style: 'gap:18px;align-items:center' }, [
          donut(sum.readiness.percent),
          el('div', { class: 'grow list' }, Object.keys(sum.readiness.parts).map(k => {
            const p = sum.readiness.parts[k];
            return el('div', { class: 'row', style: 'gap:10px' }, [
              el('span', { style: 'flex:1;font-size:13px', text: p.label }), el('span', { style: 'width:80px' }, [bar(p.ratio * 100)]),
              el('span', { class: 'num muted', style: 'width:70px;text-align:right;font-size:12.5px', text: k === 'performance' ? score(p.done) + ' / 5' : p.done + ' / ' + p.total })
            ]);
          }))
        ]) : null,
        canManage(e.id) && e.id !== me().employeeId ? el('button', { class: 'sm', style: 'margin-top:12px', text: 'Record promotion decision', onclick: () => promotionModal(e, sum.readiness) }) : null
      ])
    ]));

    if (writer) {
      if (existing && existing.status !== 'draft') wrap.appendChild(el('div', { style: 'margin-top:14px' }, [signoffBlock(existing, true)]));
      if (existing && existing.status === 'draft' && existing.returnedAt) wrap.appendChild(el('div', { class: 'card', style: 'margin-top:14px;border-color:var(--bad)' }, [
        chip('Sent back by the founder', 'bad'), el('p', { style: 'margin-top:6px', text: existing.returnNote || 'No note given.' })
      ]));
      wrap.appendChild(el('div', { style: 'margin-top:14px' }, [card('The conversation', 'Fill this in with ' + e.name.split(' ')[0] + ' in the room.', [
        el('div', { class: 'grid2' }, [
          field('What was achieved?', textarea(draft.achieved, { oninput: ev => { draft.achieved = ev.target.value; } })),
          field('What was not achieved, and why?', textarea(draft.notAchieved, { oninput: ev => { draft.notAchieved = ev.target.value; } })),
          field('What improved most?', textarea(draft.improved, { oninput: ev => { draft.improved = ev.target.value; } })),
          field('What needs more work?', textarea(draft.needsWork, { oninput: ev => { draft.needsWork = ev.target.value; } }))
        ]),
        field('Reviewer recommendation', textarea(draft.recommendation, { oninput: ev => { draft.recommendation = ev.target.value; } })),
        el('div', { class: 'grid2' }, [
          field('Focus for next quarter', textarea(draft.nextFocus, { oninput: ev => { draft.nextFocus = ev.target.value; } })),
          field('Private note (management only)', textarea(draft.privateNote, { oninput: ev => { draft.privateNote = ev.target.value; } }))
        ]),
        field('Meeting date', input(draft.meetingDate, { type: 'date', oninput: ev => { draft.meetingDate = ev.target.value; } }))
      ])]));
      wrap.appendChild(el('div', { style: 'margin-top:14px' }, [card('Next quarter goals · ' + quarterLabel(draft.nextQuarter), quarterDates(draft.nextQuarter) + ' · created when you send the review', [
        el('div', { class: 'stack' }, draft.nextGoals.map((g, i) => el('div', { class: 'grid3' }, [
          field('Goal ' + (i + 1), input('', { placeholder: 'Title', oninput: ev => { g.title = ev.target.value; } })),
          field('Type', select(g.type, (settings().goalTypes || []).map(t => ({ value: t.id, label: t.name })), { onchange: ev => { g.type = ev.target.value; } })),
          field('Target (optional)', input('', { type: 'number', step: 'any', oninput: ev => { g.target = ev.target.value; } }))
        ])))
      ])]));
      wrap.appendChild(el('div', { class: 'row wrap', style: 'justify-content:flex-end;margin-top:16px;gap:10px' }, [
        ...(existing ? signoffActions(existing, 'quarterly', () => render()) : []),
        el('button', { text: 'Save draft', onclick: () => act({ action: 'saveQuarterly', quarterly: draft }, 'Draft saved') }),
        el('button', { class: 'primary', text: isAdmin() ? 'Approve and share' : 'Send for approval', onclick: () => {
          if (!confirm(isAdmin() ? 'Approve this quarterly review, share it with ' + e.name + ' and create next quarter’s goals?'
            : 'Send this quarterly review to the founder for approval and create next quarter’s goals?')) return;
          act({ action: 'saveQuarterly', quarterly: draft, finalize: true }, isAdmin() ? 'Approved and shared' : 'Sent to the founder for approval', () => go('#/people/' + e.id + '/reviews'));
        } })
      ]));
    } else if (existing && (existing.status === 'final' || isAdmin() || canManage(e.id))) {
      // read-only: the employee once it is approved, or a manager looking at a founder-written review
      const block = (label, text) => text ? el('div', { style: 'margin-bottom:10px' }, [
        el('div', { class: 'muted', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.08em', text: label }),
        el('p', { style: 'margin-top:3px;white-space:pre-wrap', text })
      ]) : null;
      wrap.appendChild(el('div', { style: 'margin-top:14px' }, [card('The conversation', existing.meetingDate ? 'Met on ' + dateShort(existing.meetingDate) : null, [
        block('What was achieved', existing.achieved), block('What was not achieved, and why', existing.notAchieved),
        block('What improved most', existing.improved), block('What needs more work', existing.needsWork),
        block('Recommendation', existing.recommendation), block('Focus for next quarter', existing.nextFocus),
        signoffBlock(existing, true),
        el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px;gap:10px' }, signoffActions(existing, 'quarterly', () => render()))
      ])]));
    }
  }).catch(err => { wrap.textContent = ''; wrap.appendChild(empty('Could not load', err.message)); });

  return frag([
    el('div', { class: 'row', style: 'margin-bottom:14px;gap:12px' }, [
      avatar(e.name), el('div', { class: 'grow' }, [el('b', { text: e.name }), el('div', { class: 'muted', style: 'font-size:13px', text: 'Quarterly review · ' + quarterLabel(quarter) + ' · ' + quarterDates(quarter) })]),
      existing ? reviewStateChip(existing) : null,
      el('button', { class: 'ghost sm', text: 'Back to profile', onclick: () => go('#/people/' + e.id) })
    ]),
    wrap
  ]);
}

/* ================= team reviews ================= */
export function viewTeamReviews() {
  const month = S.data.month;
  const list = manageable().filter(e => e.status !== 'inactive' && e.id !== me().employeeId && !partnerEmp(e));
  const rows = list.map(e => {
    const r = reviewsOf(e.id).find(x => x.period === month);
    return el('tr', {}, [
      el('td', { 'data-l': 'Name' }, [el('div', { class: 'row' }, [avatar(e.name, 'sm'), el('span', {}, [el('b', { text: e.name }), el('small', { class: 'muted', style: 'display:block', text: levelName(e.levelId) })])])]),
      el('td', { 'data-l': 'Last review', class: 'muted', text: e.performance.latestPeriod ? monthName(e.performance.latestPeriod) : 'never' }),
      el('td', { 'data-l': 'Score' }, [e.performance.latest ? chip(score(e.performance.latest), e.performance.latest >= 4 ? 'ok' : '') : '—']),
      el('td', { 'data-l': 'This month' }, [r ? reviewStateChip(r) : chip('Not started', 'warn')]),
      el('td', { class: 'right' }, [
        r ? el('button', { class: 'sm ghost', text: 'Read', onclick: () => reviewModal(r, e) }) : null,
        canReview(e) ? el('button', { class: 'sm primary', text: r ? 'Edit' : 'Review', onclick: () => go('#/review/' + e.id + '/' + month) }) : chip('Founder reviews')
      ])
    ]);
  });
  return el('div', { class: 'tablecard' }, [
    el('div', { class: 'toolbar' }, [el('b', { text: 'Monthly reviews · ' + monthName(month) }), el('span', { class: 'grow' }),
      chip(list.filter(e => e.reviewThisMonthStatus === 'awaiting_approval').length + ' waiting for approval', 'warn'),
      chip(list.filter(e => e.reviewThisMonthStatus === 'approved').length + ' of ' + list.length + ' approved', 'ok')]),
    el('table', { class: 'responsive' }, [
      el('thead', {}, [el('tr', {}, ['Name', 'Last review', 'Score', 'This month', ''].map(h => el('th', { text: h })))]),
      el('tbody', {}, rows)
    ])
  ]);
}

/* ================= approvals (founder) ================= */
export function viewApprovals() {
  if (!isAdmin()) return empty('Founder only', 'Reviews are approved by the founder.');
  const monthly = (S.data.reviews || []).filter(r => r.status === 'awaiting_approval').sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
  const quarterly = (S.data.quarterlies || []).filter(q => q.status === 'awaiting_approval');
  const recent = (S.data.reviews || []).filter(r => r.status === 'approved' && r.approvedAt)
    .sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt))).slice(0, 12);
  const who = r => empById(r.employeeId) || { name: 'Someone', id: r.employeeId };
  return frag([
    card('Monthly reviews waiting', monthly.length ? monthly.length + ' to approve' : null, [
      monthly.length ? el('div', { class: 'list' }, monthly.map(r => el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
        avatar(who(r).name, 'sm'),
        el('span', { class: 'grow', style: 'min-width:180px' }, [el('b', { text: who(r).name + ' · ' + monthName(r.period) }),
          el('small', { text: 'Sent by ' + ((r.sentBy && r.sentBy.name) || userName(r.reviewerId) || 'manager') + ' · ' + dateShort(String(r.sentAt || '').slice(0, 10)) })]),
        chip(score(r.overall) + ' / 5', r.overall >= 4 ? 'ok' : ''),
        el('button', { class: 'sm primary', text: 'Read and decide', onclick: () => reviewModal(r, who(r)) })
      ]))) : empty('Nothing waiting', 'Reviews your managers send will appear here.')
    ]),
    el('div', { style: 'margin-top:14px' }, [card('Quarterly reviews waiting', null, [
      quarterly.length ? el('div', { class: 'list' }, quarterly.map(q => el('div', { class: 'item' }, [
        avatar(who(q).name, 'sm'),
        el('span', { class: 'grow' }, [el('b', { text: who(q).name + ' · ' + quarterLabel(q.quarter) }), el('small', { text: 'Sent by ' + ((q.sentBy && q.sentBy.name) || 'manager') })]),
        el('button', { class: 'sm primary', text: 'Open', onclick: () => go('#/quarterly/' + q.employeeId + '/' + q.quarter) })
      ]))) : empty('Nothing waiting', '')
    ])]),
    el('div', { style: 'margin-top:14px' }, [card('Recently approved', null, [
      recent.length ? el('div', { class: 'list' }, recent.map(r => el('div', { class: 'item click', onclick: () => reviewModal(r, who(r)) }, [
        el('span', { class: 'grow' }, [el('b', { text: who(r).name + ' · ' + monthName(r.period) }), el('small', { text: 'Approved ' + dateShort(String(r.approvedAt).slice(0, 10)) })]),
        reviewStateChip(r)
      ]))) : empty('None yet', '')
    ])])
  ]);
}

/* ================= team goals ================= */
export function viewTeamGoals() {
  const quarter = S.data.quarter;
  const rows = [];
  manageable().forEach(e => goalsOf(e.id).filter(g => g.quarter === quarter).forEach(g => rows.push({ e, g })));
  rows.sort((a, b) => (a.g.status === 'at_risk' ? -1 : 1) - (b.g.status === 'at_risk' ? -1 : 1));
  return el('div', { class: 'tablecard' }, [
    el('div', { class: 'toolbar' }, [el('b', { text: 'Goals · ' + quarterLabel(quarter) + ' · ' + quarterDates(quarter) }), el('span', { class: 'grow' }),
      chip(rows.filter(r => r.g.status === 'at_risk').length + ' at risk', 'warn'),
      chip(rows.filter(r => r.g.status === 'completed').length + ' completed', 'ok')]),
    rows.length ? el('table', { class: 'responsive' }, [
      el('thead', {}, [el('tr', {}, ['Person', 'Goal', 'Type', 'Progress', 'Status', ''].map(h => el('th', { text: h })))]),
      el('tbody', {}, rows.map(({ e, g }) => el('tr', {}, [
        el('td', { 'data-l': 'Person' }, [el('div', { class: 'row' }, [avatar(e.name, 'sm'), el('b', { text: e.name })])]),
        el('td', { 'data-l': 'Goal', text: g.title }),
        el('td', { 'data-l': 'Type', class: 'muted', text: goalTypeName(g.type) }),
        el('td', { 'data-l': 'Progress' }, [el('div', { class: 'row', style: 'gap:8px' }, [el('span', { style: 'width:70px' }, [bar(g.progressPct)]), el('span', { class: 'num', text: pct(g.progressPct) })])]),
        el('td', { 'data-l': 'Status' }, [statusChip(g.status)]),
        el('td', { class: 'right' }, [el('button', { class: 'sm ghost', text: 'Open', onclick: () => goalModal(g, e, true) })])
      ])))
    ]) : empty('No goals yet', 'Add goals from a person’s page.')
  ]);
}

/* ================= team leave ================= */
export function viewTeamLeave() {
  const all = (S.data.leaveRequests || []).slice().sort((a, b) => String(b.from).localeCompare(String(a.from)));
  const pending = all.filter(l => l.status === 'pending');
  const upcoming = all.filter(l => l.status === 'approved' && l.to >= today());
  const people = manageable();
  return frag([
    el('div', { class: 'grid3', style: 'margin-bottom:14px' }, [
      tile('Waiting for approval', String(pending.length), 'requests'),
      tile('Away soon', String(upcoming.length), 'approved and upcoming'),
      tile('Team', String(people.length), 'people you manage')
    ]),
    card('Requests to approve', null, [
      pending.length ? el('div', { class: 'list' }, pending.map(l => leaveRow(l, empById(l.employeeId), true))) : empty('Nothing waiting', 'All requests have been answered.')
    ]),
    el('div', { style: 'margin-top:14px' }, [card('Who is away', 'Approved leave from today onward', [
      upcoming.length ? el('div', { class: 'list' }, upcoming.map(l => {
        const e = empById(l.employeeId);
        return el('div', { class: 'item' }, [
          avatar(e ? e.name : '?', 'sm'),
          el('span', { class: 'grow' }, [el('b', { text: e ? e.name : 'Someone' }), el('small', { text: dateShort(l.from) + ' → ' + dateShort(l.to) + ' · ' + l.days + ' days' })]),
          chip(l.type, 'ok')
        ]);
      })) : empty('Nobody is away', 'No approved leave coming up.')
    ])]),
    el('div', { style: 'margin-top:14px' }, [card('Balances', 'Leave year ' + (people[0] ? people[0].leave.year : '') + ' · 16 days a year, earned 1.33 per completed month', [
      el('table', { class: 'responsive' }, [
        el('thead', {}, [el('tr', {}, ['Person', 'Entitlement', 'Carried over', 'Earned to date', 'Taken', 'Available now', 'Sick left'].map(h => el('th', { text: h })))]),
        el('tbody', {}, people.map(e => el('tr', {}, [
          el('td', { 'data-l': 'Person' }, [el('div', { class: 'row' }, [avatar(e.name, 'sm'), el('span', {}, [el('b', { text: e.name }),
            el('small', { class: 'muted', style: 'display:block', text: e.leave.monthsWorked + ' completed months' })])])]),
          el('td', { 'data-l': 'Entitlement', class: 'num', text: e.leave.annual.allowance }),
          el('td', { 'data-l': 'Carried over', class: 'num', text: e.leave.annual.carried }),
          el('td', { 'data-l': 'Earned to date', class: 'num', text: e.leave.annual.accrued }),
          el('td', { 'data-l': 'Taken', class: 'num', text: e.leave.annual.used }),
          el('td', { 'data-l': 'Available now' }, [el('div', { class: 'row', style: 'gap:8px' }, [
            el('span', { style: 'width:60px' }, [bar(e.leave.annual.allowance ? e.leave.annual.available / e.leave.annual.allowance * 100 : 0, e.leave.annual.available > 3 ? 'ok' : 'warn')]),
            el('span', { class: 'num', text: e.leave.annual.available })])]),
          el('td', { 'data-l': 'Sick left', class: 'num', text: e.leave.sick.left })
        ])))
      ])
    ])])
  ]);
}

export function leaveRow(l, e, managing) {
  return el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
    e ? avatar(e.name, 'sm') : null,
    el('span', { class: 'grow', style: 'min-width:170px' }, [
      el('b', { text: (e ? e.name + ' · ' : '') + dateShort(l.from) + ' → ' + dateShort(l.to) }),
      el('small', { text: l.days + ' working days · ' + l.type + (l.note ? ' · ' + l.note : '') })
    ]),
    statusChip(l.status),
    managing && l.status === 'pending' ? el('button', { class: 'sm primary', text: 'Approve', onclick: () => act({ action: 'decideLeave', id: l.id, decision: 'approved' }, 'Leave approved') }) : null,
    managing && l.status === 'pending' ? el('button', { class: 'sm ghost', text: 'Decline', onclick: () => {
      const note = prompt('Reason (optional)') || '';
      act({ action: 'decideLeave', id: l.id, decision: 'declined', note }, 'Request declined');
    } }) : null
  ]);
}

/* ================= reports ================= */
export function viewReports() {
  const list = employees().filter(e => e.status !== 'inactive');
  const quarter = S.data.quarter;
  const months = lastMonths(6).reverse();
  const depts = settings().departments || [];

  const trend = card('Team performance trend', 'Average score by month', [
    el('div', { class: 'list' }, months.map(m => {
      const vals = list.map(e => (reviewsOf(e.id).find(r => r.period === m && r.status === 'approved') || {}).overall).filter(Boolean);
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      return el('div', { class: 'row', style: 'gap:12px' }, [
        el('span', { style: 'width:110px;font-size:13.5px', text: monthName(m) }),
        el('span', { class: 'grow' }, [bar(avg / 5 * 100, avg >= 4 ? 'ok' : avg >= 3 ? '' : 'warn')]),
        el('span', { class: 'num', style: 'width:60px;text-align:right', text: avg ? score(avg) + ' / 5' : '—' }),
        el('span', { class: 'muted', style: 'width:70px;text-align:right;font-size:12.5px', text: vals.length + ' reviews' })
      ]);
    }))
  ]);

  const goals = list.flatMap(e => goalsOf(e.id).filter(g => g.quarter === quarter));
  const goalReport = card('Goal completion · ' + quarterLabel(quarter), goals.length + ' goals', [
    el('div', { class: 'grid4' }, ['completed', 'active', 'at_risk', 'draft'].map(s =>
      tile(STATUS_LABEL[s], String(goals.filter(g => g.status === s).length), ''))),
    el('div', { class: 'list', style: 'margin-top:12px' }, depts.map(d => {
      const dg = goals.filter(g => { const e = empById(g.employeeId); return e && e.departmentId === d.id; });
      const done = dg.filter(g => g.status === 'completed').length;
      return el('div', { class: 'row', style: 'gap:12px' }, [
        el('span', { style: 'width:130px;font-size:13.5px', text: d.name }),
        el('span', { class: 'grow' }, [bar(dg.length ? done / dg.length * 100 : 0, 'ok')]),
        el('span', { class: 'num muted', style: 'width:70px;text-align:right;font-size:13px', text: done + ' / ' + dg.length })
      ]);
    }))
  ]);

  const gapCounts = {};
  list.forEach(e => skillGaps(e).forEach(g => { gapCounts[g.name] = (gapCounts[g.name] || 0) + 1; }));
  const topGaps = Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const skillReport = card('Skill gaps across the team', 'How many people are below the level required', [
    topGaps.length ? el('div', { class: 'list' }, topGaps.map(([name, n]) => el('div', { class: 'row', style: 'gap:12px' }, [
      el('span', { style: 'flex:1;min-width:150px;font-size:13.5px', text: name }),
      el('span', { style: 'width:110px' }, [bar(n / list.length * 100, 'warn')]),
      el('span', { class: 'num', style: 'width:30px;text-align:right', text: n })
    ]))) : empty('No gaps', 'Everyone meets their level requirements.')
  ]);

  const pipeline = card('Promotion pipeline', null, [
    el('div', { class: 'list' }, list.slice().sort((a, b) => (b.readiness ? b.readiness.percent : 0) - (a.readiness ? a.readiness.percent : 0)).map(e => el('div', { class: 'item click', onclick: () => go('#/people/' + e.id + '/career') }, [
      avatar(e.name, 'sm'),
      el('span', { class: 'grow' }, [el('b', { text: e.name }), el('small', { text: levelName(e.levelId) + (e.readiness && e.readiness.nextLevel ? ' → ' + e.readiness.nextLevel.name : '') })]),
      el('span', { style: 'width:90px' }, [bar(e.readiness ? e.readiness.percent : 0, 'plum')]),
      chip(e.readiness ? pct(e.readiness.percent) : '—'),
      statusChip(e.readiness ? (e.readiness.decision || e.readiness.suggested) : 'not_ready')
    ])))
  ]);

  const reviewReport = card('Reviews approved', monthName(S.data.month), [
    el('div', { class: 'list' }, depts.map(d => {
      const dl = list.filter(e => e.departmentId === d.id);
      const done = dl.filter(e => e.reviewThisMonthStatus === 'approved').length;
      return el('div', { class: 'row', style: 'gap:12px' }, [
        el('span', { style: 'width:130px;font-size:13.5px', text: d.name }),
        el('span', { class: 'grow' }, [bar(dl.length ? done / dl.length * 100 : 0, done === dl.length ? 'ok' : 'warn')]),
        el('span', { class: 'num muted', style: 'width:60px;text-align:right;font-size:13px', text: done + ' / ' + dl.length })
      ]);
    }))
  ]);

  const delivery = card('Tasks delivered on time', 'Team, by month', [onTimeChart(list)]);
  return frag([el('div', { class: 'grid2' }, [trend, delivery]),
    el('div', { style: 'margin-top:14px' }, [deliveryTable(list.filter(e => canManage(e.id)))]),
    el('div', { class: 'grid2', style: 'margin-top:14px' }, [goalReport, reviewReport]),
    el('div', { class: 'grid2', style: 'margin-top:14px' }, [skillReport, pipeline])]);
}

/* ================= settings ================= */
export function viewSettings() {
  if (!isAdmin()) return empty('Admins only', 'Ask an admin to change these.');
  const s = JSON.parse(JSON.stringify(settings()));
  const saveBtn = el('button', { class: 'primary', text: 'Save settings', onclick: () => act({ action: 'saveSettings', settings: s }, 'Settings saved') });

  const weights = card('Performance weights', 'They should add up to 100%.', [
    el('div', { class: 'grid3' }, s.universal.map((c, i) => field(c.name + ' %', input(Math.round(c.weight * 100), {
      type: 'number', min: 0, max: 100, oninput: ev => { s.universal[i].weight = Number(ev.target.value) / 100; }
    })))),
    el('p', { class: 'muted', style: 'font-size:12.5px', text: 'Changing these only affects reviews saved from now on.' })
  ]);

  const promo = card('Promotion readiness', 'How the percentage is worked out', [
    el('div', { class: 'grid4' }, Object.keys(s.promotion.components).map(k => field(k + ' %', input(Math.round(s.promotion.components[k] * 100), {
      type: 'number', oninput: ev => { s.promotion.components[k] = Number(ev.target.value) / 100; }
    })))),
    el('div', { class: 'grid3' }, [
      field('“Developing” from %', input(Math.round(s.promotion.thresholds.developing * 100), { type: 'number', oninput: ev => { s.promotion.thresholds.developing = Number(ev.target.value) / 100; } })),
      field('“Ready for review” from %', input(Math.round(s.promotion.thresholds.management_review * 100), { type: 'number', oninput: ev => { s.promotion.thresholds.management_review = Number(ev.target.value) / 100; } })),
      field('Responsibility examples needed', input(s.promotion.responsibilityExamplesRequired, { type: 'number', oninput: ev => { s.promotion.responsibilityExamplesRequired = Number(ev.target.value); } }))
    ])
  ]);

  const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(Date.UTC(2000, i, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) }));
  const yearStartText = () => new Date(Date.UTC(2000, (s.leave.yearStartMonth || 9) - 1, s.leave.yearStartDay || 11)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const leave = card('Leave policy', 'The leave year runs from ' + yearStartText() + ' (it also starts the review year). Annual leave is earned 1/12 each completed month.', [
    el('div', { class: 'grid3' }, [
      field('Year starts: month', select(String(s.leave.yearStartMonth || 9), MONTHS, { onchange: ev => { s.leave.yearStartMonth = Number(ev.target.value); } })),
      field('Year starts: day', input(s.leave.yearStartDay || 11, { type: 'number', min: 1, max: 28, oninput: ev => { s.leave.yearStartDay = Math.max(1, Math.min(28, Number(ev.target.value) || 1)); } }))
    ]),
    el('div', { class: 'grid4' }, [
      field('Annual days per year', input(s.leave.annualDays, { type: 'number', oninput: ev => { s.leave.annualDays = Number(ev.target.value); } })),
      field('Sick days per year', input(s.leave.sickDays, { type: 'number', oninput: ev => { s.leave.sickDays = Number(ev.target.value); } })),
      field('Goals per quarter', input(s.goalsPerQuarter, { type: 'number', oninput: ev => { s.goalsPerQuarter = Number(ev.target.value); } })),
      field('Currency', input(s.currency, { oninput: ev => { s.currency = ev.target.value; } }))
    ])
  ]);

  s.reviews = s.reviews || { acknowledge: true };
  const signoff = card('Review sign-off', 'Managers send reviews to you; you approve them; then the employee sees them. A manager’s own review is written and approved by you.', [
    checkbox('Ask employees to confirm they have read each approved review', s.reviews.acknowledge !== false, v => { s.reviews.acknowledge = v; }),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px', text: 'The review year starts on ' + yearStartText() + ' (Leave policy below). Quarters: ' + ['Q1', 'Q2', 'Q3', 'Q4'].map(q => q + ' ' + quarterDates('Y2026-' + q).replace(/ \d{4}/g, '')).join(', ') + '.' })
  ]);

  // structural changes save straight away, so they cannot be lost by a redraw
  const saveNow = msg => act({ action: 'saveSettings', settings: s }, msg || 'Saved');
  const newId = p => p + Math.random().toString(36).slice(2, 7);

  const positions = card('Departments and positions', 'A position is a level on a track. Adding one saves immediately.', [
    el('div', { class: 'stack' }, s.departments.map((d, di) => el('div', { class: 'card', style: 'background:var(--soft);border:0' }, [
      el('div', { class: 'row wrap' }, [
        input(d.name, { oninput: ev => { s.departments[di].name = ev.target.value; }, style: 'font-weight:500;max-width:280px' }),
        el('span', { class: 'grow' }),
        el('button', { class: 'sm', text: '+ Track', onclick: () => {
          d.tracks = d.tracks || [];
          d.tracks.push({ id: newId('t'), name: 'New track', levels: [] });
          saveNow('Track added');
        } }),
        el('button', { class: 'sm danger', text: 'Delete department', onclick: () => {
          if (!confirm('Delete ' + d.name + '? People in it keep their records but lose their position.')) return;
          s.departments.splice(di, 1); saveNow('Department deleted');
        } })
      ]),
      el('div', { class: 'stack', style: 'margin-top:10px' }, (d.tracks || []).map((t, ti) => el('div', {}, [
        el('div', { class: 'row wrap', style: 'margin-bottom:6px' }, [
          input(t.name, { oninput: ev => { s.departments[di].tracks[ti].name = ev.target.value; }, style: 'max-width:240px' }),
          el('span', { class: 'muted', style: 'font-size:12.5px', text: 'track' }), el('span', { class: 'grow' }),
          el('button', { class: 'sm danger', text: 'Delete track', onclick: () => {
            if (!confirm('Delete the ' + t.name + ' track and its positions?')) return;
            d.tracks.splice(ti, 1); saveNow('Track deleted');
          } })
        ]),
        el('div', { class: 'list' }, (t.levels || []).map((l, li) => el('div', { class: 'item' }, [
          chip(String(l.order)),
          input(l.name, { oninput: ev => { s.departments[di].tracks[ti].levels[li].name = ev.target.value; }, style: 'max-width:260px' }),
          el('span', { class: 'grow muted', style: 'font-size:12.5px', text: (s.levelSkills[l.id] || []).length + ' skills · ' + employees().filter(e => e.levelId === l.id).length + ' people' }),
          el('button', { class: 'sm ghost', text: 'Skills', onclick: () => levelSkillsModal(s, l, saveNow) }),
          el('button', { class: 'sm danger', text: 'Delete', onclick: () => {
            if (employees().some(e => e.levelId === l.id)) return toast('Move those people to another position first', true);
            if (!confirm('Delete the ' + l.name + ' position?')) return;
            s.departments[di].tracks[ti].levels.splice(li, 1); saveNow('Position deleted');
          } })
        ]))),
        el('button', { class: 'sm', style: 'margin-top:8px', text: '+ Add position', onclick: () => {
          const name = prompt('Name of the new position', 'New position');
          if (!name) return;
          const id = newId('lvl');
          t.levels = t.levels || [];
          t.levels.push({ id, name, order: (t.levels.length || 0) + 1, description: '' });
          s.levelSkills[id] = (s.levelSkills[(t.levels[t.levels.length - 2] || {}).id] || []).map(x => ({ ...x }));
          saveNow('Position added — it is now in the list when you add or edit a person');
        } })
      ]))),
      (d.tracks || []).length ? null : el('p', { class: 'muted', style: 'font-size:12.5px', text: 'Add a track first, then positions inside it.' })
    ]))),
    el('button', { class: 'primary sm', style: 'margin-top:12px', text: '+ Add department', onclick: () => {
      const name = prompt('Name of the new department');
      if (!name) return;
      s.departments.push({ id: newId('d'), name, tracks: [{ id: newId('t'), name, levels: [] }] });
      saveNow('Department added');
    } })
  ]);

  const demo = card('Demo data', 'Nine made-up people with reviews, goals, milestones, skills, tasks and leave.', [
    el('div', { class: 'row wrap' }, [
      el('button', { text: 'Load demo team', onclick: () => { if (confirm('Add the demo team? Existing demo people are replaced.')) act({ action: 'loadDemo' }, 'Demo team loaded'); } }),
      el('button', { class: 'danger', text: 'Remove all demo people', onclick: () => { if (confirm('Remove every demo person and their data?')) act({ action: 'clearDemo' }, 'Demo data removed'); } })
    ])
  ]);

  const tasksN = (S.data.tasks || []).length, projectsN = (S.data.projects || []).length;
  let withProjects = true;
  const fresh = card('Start fresh', 'Delete every task' + (projectsN ? ' and, if you like, every kicked-off project' : '') + '. Goals, milestones, reviews and people stay.', [
    el('p', { class: 'dim', text: tasksN + ' task' + (tasksN === 1 ? '' : 's') + ' and ' + projectsN + ' project' + (projectsN === 1 ? '' : 's') + ' in the system now. Quotes keep their contracts and invoices; a deleted project can be kicked off again from the Price Builder.' }),
    projectsN ? el('div', { style: 'margin:10px 0' }, [checkbox('Also delete the kicked-off projects', true, v => { withProjects = v; })]) : null,
    el('button', { class: 'danger', text: 'Delete all tasks', disabled: !tasksN && !projectsN, onclick: () => {
      const typed = prompt('This cannot be undone. Type DELETE to remove all ' + tasksN + ' tasks' + (projectsN && withProjects ? ' and ' + projectsN + ' projects' : '') + '.');
      if (typed == null) return;
      act({ action: 'clearTasks', confirm: typed, projects: !!(projectsN && withProjects) }, 'All tasks deleted. Ready for new projects.').catch(() => {});
    } })
  ]);

  const scaleCard = card('Skill ratings', s.skillScale === 10 ? 'Skills are rated out of 10.' : 'Skills are rated out of 5 now.', [
    s.skillScale === 10 ? el('p', { class: 'dim', text: '2 = learning · 4 = developing · 6 = solid · 8 = strong · 10 = exceptional.' })
      : el('div', {}, [
        el('p', { class: 'dim', text: 'Switch to ratings out of 10. What each position needs, and any ratings already given, are doubled, so nobody moves.' }),
        el('button', { class: 'primary', style: 'margin-top:10px', text: 'Rate skills out of 10', onclick: () => {
          if (confirm('Switch every skill rating to out of 10?')) act({ action: 'setSkillScale' }, 'Skills are now rated out of 10').catch(() => {});
        } })
      ])
  ]);

  const accounts = card('Accounts', 'Who can sign in, and what they can see.', [
    el('table', { class: 'responsive' }, [
      el('thead', {}, [el('tr', {}, ['Name', 'Email', 'Role', 'Password', ''].map(h => el('th', { text: h })))]),
      el('tbody', {}, (S.data.users || []).map(u => el('tr', {}, [
        el('td', { 'data-l': 'Name', text: u.name || '—' }),
        el('td', { 'data-l': 'Email', class: 'muted', text: u.email }),
        el('td', { 'data-l': 'Role' }, [chip(u.role, u.role === 'admin' ? 'plum' : u.role === 'manager' ? 'info' : '')]),
        el('td', { 'data-l': 'Password' }, [u.hasPassword ? chip('Set', 'ok') : chip('Not set yet', 'warn')]),
        el('td', { class: 'right' }, [
          el('button', { class: 'sm ghost', text: 'Edit', onclick: () => accountModal(u) }),
          u.id !== me().id ? el('button', { class: 'sm danger', text: 'Delete', onclick: () => { if (confirm('Delete the account for ' + u.email + '?')) act({ action: 'deleteUser', id: u.id }, 'Account deleted'); } }) : null
        ])
      ])))
    ]),
    el('button', { class: 'primary sm', style: 'margin-top:12px', text: 'Add account', onclick: () => accountModal(null) })
  ]);

  return frag([
    el('div', { class: 'row', style: 'justify-content:flex-end;margin-bottom:14px' }, [saveBtn]),
    el('div', { class: 'stack' }, [brandCard(), holidaysCard(s), scaleCard, fresh, weights, promo, signoff, leave, positions, accounts, demo])
  ]);
}

/* ---------- Brand & region: the agency's name, logo, colours, contact and bank details,
   currency and time zone. Saved on its own (not with "Save settings"). ---------- */
function brandCard() {
  const b = JSON.parse(JSON.stringify(brand()));
  b.colors = b.colors || {};
  const txt = (k, label, attrs) => field(label, input(b[k] || '', { ...(attrs || {}), oninput: ev => { b[k] = ev.target.value; } }));
  const area = (k, label) => field(label, textarea(b[k] || '', { oninput: ev => { b[k] = ev.target.value; }, style: 'min-height:84px' }));
  const logoBox = el('div', { class: 'row', style: 'gap:12px;align-items:center' });
  const drawLogo = () => {
    logoBox.textContent = '';
    logoBox.append(
      el('span', { style: 'width:52px;height:52px;border-radius:14px;background:' + (b.colors.accent || 'var(--orange)') + ';display:grid;place-items:center;color:#fff;font-weight:700;font-size:22px;overflow:hidden' },
        [b.logo ? el('img', { src: b.logo, alt: '', style: 'width:70%;height:70%;object-fit:contain' }) : String(b.name || 'T').charAt(0).toUpperCase()]),
      el('button', { class: 'sm', text: b.logo ? 'Change logo' : 'Upload logo', onclick: async () => {
        const f = await pickFile('image/png,image/jpeg,image/webp,image/svg+xml');
        if (!f) return;
        try { b.logo = await uploadFile(f, 'logo'); drawLogo(); toast('Logo uploaded. Press Save brand to use it.'); } catch (e) { toast(e.message, 'bad'); }
      } }),
      ...(b.logo ? [el('button', { class: 'sm ghost', text: 'Remove', onclick: () => { b.logo = ''; drawLogo(); } })] : []));
  };
  drawLogo();
  const colour = (k, label) => field(label, input(b.colors[k] || '#000000', { type: 'color', style: 'height:44px;padding:4px', oninput: ev => { b.colors[k] = ev.target.value; drawLogo(); } }));
  const presets = (S.data && S.data.presets) || {};
  const preset = select(b.preset || Object.keys(presets)[0] || '', Object.entries(presets).map(([value, label]) => ({ value, label })));
  const reload = async msg => { await loadState(); applyBrand(); toast(msg); window.dispatchEvent(new Event('gz:render')); };
  return card('Brand & region', 'Your name, logo, colours and details. They appear in the Team app, on proposals, contracts and invoices.', [
    el('div', { class: 'grid3' }, [txt('name', 'Agency name'), txt('tagline', 'Tagline'), txt('website', 'Website', { placeholder: 'https://…' })]),
    field('Logo', logoBox),
    el('div', { class: 'grid4' }, [colour('accent', 'Accent'), colour('accent2', 'Accent, lighter'), colour('ink', 'Text'), colour('highlight', 'Highlight')]),
    el('div', { class: 'grid3' }, [txt('email', 'Email', { type: 'email' }), txt('secondaryEmail', 'Second email', { type: 'email' }), txt('phone', 'Phone')]),
    el('div', { class: 'grid3' }, [txt('address', 'Address'), txt('city', 'City'), txt('country', 'Country')]),
    el('div', { class: 'grid4' }, [txt('tin', 'Tax number (TIN)'), txt('vatNumber', 'VAT number'), txt('signatory', 'Signs contracts'), txt('signatoryTitle', 'Their title')]),
    el('div', { class: 'grid2' }, [area('bank', 'Bank details (printed on invoices)'), area('services', 'What you sell (used in the leads prompt)')]),
    el('div', { class: 'grid3' }, [txt('currency', 'Currency (3 letters)', { maxlength: 3, placeholder: 'ETB' }), txt('timeZone', 'Time zone', { placeholder: 'e.g. Europe/London' }), txt('phoneCode', 'Phone country code', { placeholder: 'e.g. 44' })]),
    el('div', { class: 'row wrap', style: 'gap:10px;margin-top:6px' }, [
      el('button', { class: 'primary', text: 'Save brand', onclick: async () => {
        b.currency = String(b.currency || '').toUpperCase();
        try { await api({ action: 'saveBrand', brand: b }); await reload('Brand saved'); } catch (e) { toast(e.message, 'bad'); }
      } }),
      el('span', { class: 'grow' }),
      preset,
      el('button', { class: 'sm', text: 'Apply region preset', onclick: async () => {
        if (!confirm('Apply “' + presets[preset.value] + '”? It sets the currency, time zone, phone code, leave and review year, holidays, and the price list’s VAT and dollar settings. You can change each one afterwards.')) return;
        try { await api({ action: 'applyPreset', preset: preset.value }); await reload('Region preset applied'); } catch (e) { toast(e.message, 'bad'); }
      } })
    ])
  ]);
}

/* ---------- holidays: a ready-made list for the region, plus your own days ---------- */
function holidaysCard(s) {
  s.holidays = s.holidays || { preset: 'none', custom: [] };
  s.holidays.custom = Array.isArray(s.holidays.custom) ? s.holidays.custom : [];
  const names = { ethiopia: 'Ethiopian holidays', international: 'International days', none: 'No ready-made list' };
  const list = el('div', { class: 'stack' });
  const draw = () => {
    list.textContent = '';
    s.holidays.custom.forEach((h, i) => list.appendChild(el('div', { class: 'row wrap', style: 'gap:8px' }, [
      input(h.date || '', { placeholder: 'MM-DD', maxlength: 5, style: 'width:90px', oninput: ev => { h.date = ev.target.value.trim(); } }),
      input(h.emoji || '', { placeholder: '🎉', maxlength: 4, style: 'width:64px', oninput: ev => { h.emoji = ev.target.value; } }),
      input(h.title || '', { placeholder: 'Name of the day', style: 'flex:1;min-width:160px', oninput: ev => { h.title = ev.target.value; } }),
      input(h.body || '', { placeholder: 'Greeting for the team (optional)', style: 'flex:2;min-width:200px', oninput: ev => { h.body = ev.target.value; } }),
      el('button', { class: 'sm danger', text: 'Delete', onclick: () => { s.holidays.custom.splice(i, 1); draw(); } })
    ])));
    list.appendChild(el('button', { class: 'sm', style: 'align-self:flex-start', text: '+ Add a day', onclick: () => { s.holidays.custom.push({ date: '', emoji: '🎉', title: '', body: '' }); draw(); } }));
  };
  draw();
  return card('Holidays', 'The team gets a greeting on these days. Press Save settings after changing them.', [
    field('Ready-made list', select(s.holidays.preset || 'none', ((S.data && S.data.holidayPresets) || Object.keys(names)).map(v => ({ value: v, label: names[v] || v })),
      { onchange: ev => { s.holidays.preset = ev.target.value; } })),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin:8px 0', text: 'Your own days, every year (month-day, like 12-25):' }),
    list
  ]);
}

function levelSkillsModal(s, level, saveNow) {
  const list = (s.levelSkills[level.id] || []).map(x => ({ ...x }));
  const box = el('div', { class: 'stack' });
  const draw = () => {
    box.textContent = '';
    list.forEach((sk, i) => box.appendChild(el('div', { class: 'row', style: 'gap:8px' }, [
      input(sk.name, { oninput: ev => { list[i].name = ev.target.value; }, style: 'flex:1' }),
      select(String(sk.req || 3), Array.from({ length: skillScale() }, (_, k) => k + 1).map(v => ({ value: String(v), label: 'needs ' + v + ' / ' + skillScale() })), { onchange: ev => { list[i].req = Number(ev.target.value); }, style: 'width:140px' }),
      el('button', { class: 'sm danger', text: 'Delete', onclick: () => { list.splice(i, 1); draw(); } })
    ])));
    box.appendChild(el('button', { class: 'sm', text: '+ Add skill', onclick: () => { list.push({ name: 'New skill', req: 3 }); draw(); } }));
  };
  draw();
  modal('Skills for ' + level.name, [box], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save skills', onclick: () => {
      s.levelSkills[level.id] = list.filter(x => x.name.trim());
      closeModal();
      if (saveNow) saveNow('Skills for ' + level.name + ' saved'); else toast('Applied');
    } })
  ]);
}

export function accountModal(u) {
  const f = {
    name: input(u && u.name, { placeholder: 'Full name' }),
    email: input(u && u.email, { type: 'email' }),
    role: select((u && u.role) || 'employee', [{ value: 'employee', label: 'Employee — sees only their own page' }, { value: 'manager', label: 'Manager — sees their team' }, { value: 'admin', label: 'Admin — sees everything' }]),
    employeeId: select((u && u.employeeId) || '', [{ value: '', label: 'Not linked to a person' }].concat(employees().map(e => ({ value: e.id, label: e.name })))),
    password: input('', { type: 'text', placeholder: u && u.hasPassword ? 'Leave blank to keep the current one' : 'Set a first password (min 8 characters)' }),
    active: (u ? u.active !== false : true)
  };
  modal(u ? 'Account' : 'New account', [
    el('div', { class: 'grid2' }, [field('Name', f.name), field('Email', f.email)]),
    field('Role', f.role), field('Linked person', f.employeeId, 'Their dashboard shows this person’s goals, reviews and leave.'),
    field('Password', f.password, 'They can change it after signing in.'),
    checkbox('Account is active', f.active, v => { f.active = v; })
  ], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'primary', text: 'Save', onclick: () => act({
      action: 'saveUser', id: u && u.id, name: f.name.value, email: f.email.value, role: f.role.value,
      employeeId: f.employeeId.value, password: f.password.value || undefined, active: f.active
    }, 'Account saved', () => { closeModal(); render(); }) })
  ]);
}
