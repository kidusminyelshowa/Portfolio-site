/* Boot, sign-in, navigation and routing for the Team app.
   Desktop: a floating sidebar. Phones: a bottom tab bar and a "More" sheet,
   so it works like an app (and installs as one from the home screen). */
import {
  el, $, frag, S, me, settings, employees, empById, subject, isAdmin, isManager, isPartner, canManage,
  avatar, chip, card, field, input, empty, select, toast, modal, closeModal, api, loadState, act,
  initials, monthName, thisMonth, quarterLabel, appName, brandMark, applyBrand
} from '/team/ui.js';
import { icon } from '/team/icons.js';
import { viewDashboard, viewGoals, viewMilestones, viewSkills, viewReviews, viewCareer, viewLeave } from '/team/me.js';
import {
  viewOverview, viewPeople, viewPerson, viewReview, viewQuarterly, viewTeamReviews,
  viewTeamGoals, viewTeamLeave, viewReports, viewSettings, viewApprovals, personModal
} from '/team/team.js';
import { viewMyTasks, viewTeamTasks } from '/team/tasks.js';
import { viewProjects, viewProject, projects } from '/team/projects.js';
import { viewSales } from '/team/sales.js';
import { leadModal } from '/team/leads.js';
import { viewGantt } from '/team/gantt.js';
import { viewInsights } from '/team/insights.js';
import {
  viewMusic, drawPlayer, toggleBell, drawBell, closeBell, profileModal, applyBackground, registerSW, viewNotify
} from '/team/social.js';

const markImg = () => brandMark();

/* ---------- sign in / first run ---------- */
function gate(mode) {
  $('#boot').hidden = true;
  $('#app').hidden = true;
  const g = $('#gate');
  g.hidden = false;
  g.textContent = '';
  const err = el('p', { class: 'err' });

  if (mode === 'setup') {
    const f = { name: input('', { placeholder: 'Your name' }), email: input('', { type: 'email', placeholder: 'you@example.com' }), password: input('', { type: 'password', placeholder: 'At least 8 characters' }),
      key: input('', { type: 'password', placeholder: 'The SETUP_TOKEN from your server settings', autocomplete: 'off' }) };
    const btn = el('button', { class: 'accent', style: 'width:100%;min-height:48px', text: 'Create admin account' });
    g.appendChild(el('form', { class: 'box', onsubmit: async ev => {
      ev.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        await api({ action: 'setup', name: f.name.value, email: f.email.value, password: f.password.value, setupToken: f.key.value });
        // the Price Builder has its own password; it starts as the same one (change it there later)
        await fetch('/api/price-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setup', password: f.password.value, setupToken: f.key.value }) }).catch(() => {});
        await start();
      }
      catch (e) { err.textContent = e.message; btn.disabled = false; }
    } }, [
      markImg(), el('h1', { text: 'Set up ' + appName() }),
      el('p', { class: 'sub', text: 'This is the first time anyone has opened it. Create the founder account; you can add everyone else afterwards. The same password also opens the Price Builder.' }),
      field('Setup key', f.key), field('Name', f.name), field('Email', f.email), field('Password', f.password), err, btn
    ]));
    f.key.focus();
    return;
  }

  const f = { email: input('', { type: 'email', placeholder: 'you@example.com', autocomplete: 'username' }), password: input('', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' }) };
  const btn = el('button', { class: 'accent', style: 'width:100%;min-height:48px', text: 'Sign in' });
  g.appendChild(el('form', { class: 'box', onsubmit: async ev => {
    ev.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    try { await api({ action: 'login', email: f.email.value, password: f.password.value }); history.replaceState(null, '', '/team#/'); await start(); }
    catch (e) { err.textContent = e.message; btn.disabled = false; }
  } }, [
    markImg(), el('h1', { text: appName() }),
    el('p', { class: 'sub', text: 'Sign in with your work email.' }),
    field('Email', f.email), field('Password', f.password), err, btn,
    el('p', { class: 'alt', text: 'Forgot your password? Ask an admin to set a new one.' })
  ]));
  f.email.focus();
}

/* ---------- navigation ---------- */
const NAV_ME = [
  ['#/', 'Dashboard', 'home'], ['#/tasks', 'My tasks', 'tasks'], ['#/goals', 'My goals', 'goals'], ['#/milestones', 'My milestones', 'milestones'],
  ['#/skills', 'My skills', 'skills'], ['#/reviews', 'My reviews', 'reviews'], ['#/career', 'Career path', 'career'], ['#/leave', 'Leave', 'leave'],
  ['#/gantt', 'Timeline', 'gantt'],
  ['#/music', 'Music', 'music']
];
const NAV_TEAM = [
  ['#/team', 'Overview', 'overview'], ['#/sales', 'Sales pipeline', 'sales'], ['#/people', 'People', 'people'], ['#/projects', 'Projects', 'projects'],
  ['#/tasks-team', 'Team tasks', 'tasks'], ['#/insights', 'Insights', 'insights'], ['#/reviews-team', 'Reviews', 'reviews'], ['#/goals-team', 'Goals', 'goals'], ['#/team-leave', 'Leave requests', 'leave'],
  ['#/reports', 'Reports', 'reports']
];
const NAV_PARTNER = [['#/', 'Home', 'home'], ['#/tasks', 'My tasks', 'tasks'], ['#/gantt', 'Timeline', 'gantt'], ['#/music', 'Music', 'music']];
const PARTNER_PAGES = ['#/', '#/tasks', '#/gantt', '#/music'];
const NAV_ADMIN = [['#/approvals', 'Approvals', 'approvals'], ['#/notify', 'Messages', 'send'], ['#/settings', 'Settings', 'settings']];

const current = (hash, href) => hash === href || hash.startsWith(href + '/') || (href === '#/projects' && hash.startsWith('#/project/')) ||
  (href === '#/people' && hash.startsWith('#/people/'));
function countFor(href) {
  const actions = S.data.actions || [];
  return actions.filter(a => a.href === href || (href === '#/team-leave' && a.kind === 'leave') || (href === '#/projects' && a.kind === 'project') ||
    (href === '#/reviews-team' && a.kind === 'review' && a.level !== 'warn') || (href === '#/approvals' && a.kind === 'approval')).length;
}
function sections() {
  if (isPartner()) return [['Creative partner', NAV_PARTNER]];
  // skill ratings are for the founder and managers; team members see readiness and progress instead
  const mine = isManager() ? NAV_ME : NAV_ME.filter(([href]) => href !== '#/skills');
  return [['My growth', mine]].concat(isManager() ? [['Team', NAV_TEAM]] : []).concat(isAdmin() ? [['Admin', NAV_ADMIN]] : []);
}

function renderNav() {
  const links = $('#navlinks');
  links.textContent = '';
  const hash = location.hash || '#/';
  sections().forEach(([title, items]) => {
    links.appendChild(el('div', { class: 'navsec', text: title }));
    items.forEach(([href, label, ic]) => {
      const n = countFor(href);
      links.appendChild(el('a', { href, 'aria-current': current(hash, href) ? 'page' : null }, [icon(ic, 19), label, n ? el('span', { class: 'n', text: String(n) }) : null]));
    });
  });

  // phones: five tabs; everything else lives under "More"
  const tabs = isPartner() ? [['#/', 'Home', 'home'], ['#/tasks', 'Tasks', 'tasks'], ['#/music', 'Music', 'music']]
    : [['#/', 'Home', 'home'], ['#/tasks', 'Tasks', 'tasks'],
      isManager() ? ['#/projects', 'Projects', 'projects'] : ['#/goals', 'Goals', 'goals'], ['#/music', 'Music', 'music']];
  const bar = $('#tabbar');
  bar.textContent = '';
  bar.style.gridTemplateColumns = 'repeat(' + (tabs.length + 1) + ',1fr)';
  tabs.forEach(([href, label, ic]) => {
    const n = countFor(href);
    bar.appendChild(el('a', { href, 'aria-current': current(hash, href) ? 'page' : null }, [icon(ic, 21), label, n ? el('span', { class: 'n', text: String(n) }) : null]));
  });
  const inTabs = tabs.some(([href]) => current(hash, href));
  const moreCount = sections().flatMap(s => s[1]).filter(([href]) => !tabs.some(t => t[0] === href)).reduce((t, [href]) => t + countFor(href), 0);
  bar.appendChild(el('button', { type: 'button', 'aria-current': inTabs ? null : 'page', onclick: moreSheet }, [icon('more', 21), 'More', moreCount ? el('span', { class: 'n', text: String(moreCount) }) : null]));

  // you, and the bell
  const m = me();
  $('#meAvatar').replaceWith(Object.assign(avatar(m.name, 'sm', m.photo || ''), { id: 'meAvatar' }));
  $('#meAvatarTop').replaceWith(Object.assign(avatar(m.name, '', m.photo || ''), { id: 'meAvatarTop' }));
  $('#meName').textContent = m.name;
  $('#meRole').textContent = m.role === 'admin' ? 'Admin' : m.role === 'manager' ? 'Manager' : m.partner ? 'Creative partner' : 'Team member';
  const bell = $('#bellBtn');
  if (!bell.querySelector('.ic')) bell.prepend(icon('bell', 20));
  const n = S.data.unread || 0;
  $('#bellN').hidden = !n;
  $('#bellN').textContent = n > 9 ? '9+' : String(n);
  drawBell();
}

function moreSheet() {
  const hash = location.hash || '#/';
  const body = sections().map(([title, items]) => frag([
    el('div', { class: 'navsec', style: 'padding:12px 2px 8px', text: title }),
    el('div', { class: 'sheet-grid' }, items.map(([href, label, ic]) => {
      const n = countFor(href);
      return el('a', { href, 'aria-current': current(hash, href) ? 'page' : null, onclick: () => closeModal() }, [icon(ic, 22), label, n ? el('span', { class: 'n', text: String(n) }) : null]);
    }))
  ]));
  modal('Menu', body, [
    el('button', { class: 'ghost', onclick: () => { closeModal(); profileModal(); } }, [icon('user', 18), 'Your profile']),
    el('button', { class: 'primary', text: 'Close', onclick: closeModal })
  ]);
}

const TITLES = {
  '#/': 'Dashboard', '#/goals': 'My goals', '#/milestones': 'My milestones', '#/skills': 'My skills',
  '#/reviews': 'My reviews', '#/career': 'Career path', '#/leave': 'Leave', '#/team': 'Team overview',
  '#/people': 'People', '#/reviews-team': 'Reviews', '#/goals-team': 'Goals', '#/team-leave': 'Leave requests',
  '#/reports': 'Reports', '#/settings': 'Settings', '#/tasks': 'My tasks', '#/tasks-team': 'Team tasks', '#/approvals': 'Approvals',
  '#/projects': 'Projects', '#/sales': 'Sales pipeline', '#/music': 'Music', '#/notify': 'Messages', '#/gantt': 'Timeline', '#/insights': 'Insights'
};

/* ---------- router ---------- */
let lastHash = null;
function route() {
  const view = $('#view');
  let hash = location.hash || '#/';
  // creative partners: tasks, music and their profile only
  if ((isPartner() && !PARTNER_PAGES.includes(hash)) || (hash === '#/skills' && !isManager())) { hash = '#/'; if (location.hash && location.hash !== '#/') history.replaceState(null, '', '#/'); }
  const parts = hash.replace(/^#\//, '').split('/');
  const head = parts[0] || '';
  let node, title = TITLES[hash] || 'Dashboard', crumb = '';
  const topActions = $('#topActions');
  topActions.textContent = '';

  try {
    if (head === 'people' && parts[1]) {
      const e = empById(parts[1]);
      title = e ? e.name : 'Person';
      crumb = e ? (e.email || '') : '';
      node = viewPerson(parts[1], parts[2]);
    } else if (head === 'review' && parts[1]) {
      title = 'Monthly review';
      crumb = monthName(parts[2] || thisMonth());
      node = viewReview(parts[1], parts[2] || thisMonth());
    } else if (head === 'project' && parts[1]) {
      const p = projects().find(x => x.id === parts[1]);
      title = p ? p.name : 'Project';
      crumb = p ? [p.client, 'Projects'].filter(Boolean).join(' · ') : '';
      node = viewProject(parts[1]);
    } else if (head === 'sales' && parts[1] === 'lead' && parts[2]) {
      // a link to one lead (from a task or a notification): the Leads tab with the lead open
      try { localStorage.setItem('gz-sales-tab', 'leads'); } catch (e) { /* private mode */ }
      title = 'Sales pipeline';
      node = viewSales();
      setTimeout(() => leadModal(parts[2]), 50);
    } else if (head === 'quarterly' && parts[1]) {
      title = 'Quarterly review';
      crumb = quarterLabel(parts[2] || S.data.quarter);
      node = viewQuarterly(parts[1], parts[2] || S.data.quarter);
    } else {
      switch (hash) {
        case '#/goals': node = viewGoals(); break;
        case '#/tasks': node = viewMyTasks(); break;
        case '#/tasks-team': node = viewTeamTasks(); break;
        case '#/projects': node = viewProjects(); crumb = 'Deals kicked off from the Price Builder'; break;
        case '#/sales': node = viewSales(); crumb = 'Every price proposal, where it stands, and who to call'; break;
        case '#/approvals': node = viewApprovals(); crumb = 'Reviews wait here until you approve them. Only then does the employee see them.'; break;
        case '#/milestones': node = viewMilestones(); break;
        case '#/skills': node = viewSkills(); break;
        case '#/reviews': node = viewReviews(); break;
        case '#/career': node = viewCareer(); break;
        case '#/leave': node = viewLeave(); break;
        case '#/music': node = viewMusic(); crumb = 'The team playlist'; break;
        case '#/gantt': node = viewGantt(); crumb = isManager() ? 'Everyone’s tasks over time' : 'Your tasks over time'; break;
        case '#/insights': node = isManager() ? viewInsights() : empty('Managers only', ''); crumb = 'When and how the team works best'; break;
        case '#/notify': node = viewNotify(); crumb = 'Greetings and news for the team'; break;
        case '#/team': node = viewOverview(); break;
        case '#/people': node = viewPeople(); break;
        case '#/reviews-team': node = viewTeamReviews(); break;
        case '#/goals-team': node = viewTeamGoals(); break;
        case '#/team-leave': node = viewTeamLeave(); break;
        case '#/reports': node = viewReports(); break;
        case '#/settings': node = viewSettings(); break;
        default: node = viewDashboard(); title = 'Dashboard'; crumb = quarterLabel(S.data.quarter) + ' · ' + monthName(S.data.month);
      }
    }
  } catch (e) {
    console.error(e);
    node = empty('Something broke on this screen', e.message);
  }

  if (['#/team', '#/people'].includes(hash) && isAdmin()) {
    topActions.appendChild(el('button', { class: 'primary sm', text: 'Add person', onclick: () => personModal(null) }));
  }
  if (hash === '#/' && isManager()) {
    topActions.appendChild(el('button', { class: 'sm ghost', text: 'Team overview', onclick: () => { location.hash = '#/team'; } }));
  }

  $('#title').textContent = title;
  $('#crumb').textContent = crumb;
  view.textContent = '';
  // a temporary password: a reminder on the dashboard instead of opening the profile at every sign-in
  if (me().mustChange && (hash === '#/' || hash === '')) view.appendChild(el('div', { class: 'promo', style: 'margin-bottom:14px' }, [
    el('div', { class: 'grow' }, [el('b', { text: 'You are using a temporary password' }), el('div', { style: 'font-size:13.5px;opacity:.85', text: 'Set your own in your profile, so only you can sign in.' })]),
    el('button', { text: 'Set password', onclick: profileModal })]));
  view.appendChild(node);
  renderNav();
  drawPlayer();
  // only a new page starts at the top; a redraw after saving keeps your place
  if (hash !== lastHash) { closeBell(); if (!parts[2]) window.scrollTo(0, 0); }
  lastHash = hash;
}

/* ---------- keep it fresh: when you come back to the app, and every two minutes ---------- */
let refreshing = false;
async function refresh() {
  if (refreshing || document.hidden || !S.data || $('#dlg').open) return;
  refreshing = true;
  // only the badges and the bell are redrawn, so nothing you are typing is lost
  try { await loadState(); if (S.data) renderNav(); } catch (e) { /* offline */ }
  refreshing = false;
}

/* ---------- boot ---------- */
async function start() {
  const state = await loadState();
  applyBrand();
  if (!state.configured) return gate('setup');
  if (!state.signedIn) return gate('login');
  $('#boot').hidden = true;
  $('#gate').hidden = true;
  $('#app').hidden = false;
  applyBackground();
  route();
}

window.addEventListener('hashchange', route);
window.addEventListener('gz:render', () => { if (S.data) { applyBackground(); route(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(refresh, 120000);
$('#bellBtn').addEventListener('click', toggleBell);
$('#meBtn').addEventListener('click', profileModal);
$('#whoBtn').addEventListener('click', profileModal);
$('#signOut').addEventListener('click', async () => { await api({ action: 'logout' }); location.reload(); });
registerSW();

start().catch(e => {
  $('#boot').textContent = '';
  $('#boot').appendChild(empty('Could not load', e.message));
});
