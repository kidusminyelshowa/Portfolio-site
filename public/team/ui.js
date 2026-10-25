import { applyTheme } from '/team/theme.js';

/* Shared helpers: tiny DOM builder, formatting, chips/bars, modal, toast, API
   and the in-memory copy of everything this person is allowed to see. */

/* The original font had no arrows (→ ↗ × ⋯ …), so phones borrowed them from another font and they sat
   too high or low. In buttons, links and chips they (and a leading +) are drawn as small line icons instead. */
const GLYPH = { '→': '<path d="M5 12h14M13 6l6 6-6 6"/>', '←': '<path d="M19 12H5M11 6l-6 6 6 6"/>', '↗': '<path d="M7 17 17 7M8 7h9v9"/>',
  '↑': '<path d="M12 19V5M6 11l6-6 6 6"/>', '↓': '<path d="M12 5v14M6 13l6 6 6-6"/>', '×': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  '+': '<path d="M12 5.5v13M5.5 12h13"/>',
  '⋯': '<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>' };
const GLYPH_RE = /[→←↗↑↓×⋯]|^\+ /;
function setText(n, v) {
  const s = String(v);
  if (!GLYPH_RE.test(s) || !(n.tagName === 'BUTTON' || n.tagName === 'A' || /\bchip\b/.test(n.className))) { n.textContent = s; return; }
  s.split(/([→←↗↑↓×⋯]|^\+(?= ))/).forEach(part => {
    if (!part) return;
    if (!GLYPH[part]) { n.appendChild(document.createTextNode(part)); return; }
    const i = document.createElement('span');
    i.className = 'glyph'; i.setAttribute('aria-hidden', 'true');
    i.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + GLYPH[part] + '</svg>';
    n.appendChild(i);
  });
  if (!n.getAttribute('aria-label') && /^[→←↗↑↓×⋯]$/.test(s.trim())) n.setAttribute('aria-label', n.getAttribute('title') || ({ '×': 'Remove', '⋯': 'More' }[s.trim()] || s.trim()));
}
export function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'text') setText(n, v);
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = !!v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  (kids || []).forEach(c => c != null && c !== false && n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))));
  return n;
}
export const $ = s => document.querySelector(s);
export const frag = kids => { const f = document.createDocumentFragment(); (kids || []).forEach(k => k && f.appendChild(k)); return f; };

/* ---------- state ---------- */
export const S = { data: null, route: '#/', preview: null };
export const me = () => S.data && S.data.me;
export const settings = () => (S.data && S.data.settings) || {};
/* the agency's name, logo, colours and region (Settings → Brand & region) */
export const brand = () => (S.data && S.data.brand) || S.brand || { name: 'Team', colors: {} };
export const brandName = () => brand().name || 'Team';
/* "Just me" mode (Settings → Brand & region): a freelancer working alone. 'auto' means solo while
   nobody else is on the team (creative partners don't count: they only take tasks). */
export const teamSize = () => ((S.data && S.data.employees) || []).filter(e => e.status !== 'inactive' && !(e.partner || e.departmentId === 'partners')).length;
export const isSolo = () => {
  const m = brand().workMode || 'auto';
  return m === 'solo' || (m === 'auto' && !!(S.data && S.data.employees) && teamSize() <= 1);
};
/* "Kidus Studio Team" ("… Workspace" when working alone), or just "Team" before the brand is known */
export const appName = () => {
  const word = isSolo() ? 'Workspace' : 'Team';
  return brand().name && brand().name !== 'Team' ? brand().name + ' ' + word : word;
};
/* the home currency (ETB in the Ethiopia preset) and the agency's time zone */
export const cur = () => brand().currency || settings().currency || 'ETB';
export const brandZone = () => brand().timeZone || 'UTC';
/* the logo, or the first letter of the name when there is no logo */
export function brandMark() {
  const b = brand();
  return el('span', { class: 'mark' + (b.logo ? '' : ' letter') }, [b.logo ? el('img', { src: b.logo, alt: '' }) : String(b.name || 'T').trim().charAt(0).toUpperCase()]);
}
/* the brand colours become the app's accent colours */
export function applyBrand() {
  const b = brand();
  applyTheme(b.colors);
  const mark = document.getElementById('brandMark'), name = document.getElementById('brandName');
  if (mark) mark.replaceWith(Object.assign(brandMark(), { id: 'brandMark' }));
  if (name) name.textContent = brandName();
  const sub = name && name.parentElement && name.parentElement.querySelector('small');
  if (sub) sub.textContent = isSolo() ? 'Workspace' : 'Team';
  document.title = appName();
}
export const employees = () => (S.data && S.data.employees) || [];
export const empById = id => employees().find(e => e.id === id) || null;
export const myEmp = () => empById(me() && me().employeeId);
/* the person whose "my" pages we are showing (admins can preview someone else's view) */
export const subject = () => (S.preview ? empById(S.preview) : myEmp());
export const isAdmin = () => me() && me().role === 'admin';
export const isManager = () => me() && (me().role === 'admin' || me().role === 'manager');
/* creative partners (freelancers) only use tasks, music and their profile */
export const isPartner = () => !!(me() && me().partner);
export const partnerEmp = e => !!e && (e.partner || e.departmentId === 'partners');
export const canManage = id => {
  if (isAdmin()) return true;
  if (!isManager()) return false;
  const seen = new Set();
  const walk = m => employees().filter(e => e.managerId === m).forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); walk(e.id); } });
  walk(me().employeeId);
  return seen.has(id);
};
export const goalsOf = id => ((S.data && S.data.goals) || []).filter(g => g.employeeId === id);
export const milestonesOf = id => ((S.data && S.data.milestones) || []).filter(m => m.employeeId === id);
export const reviewsOf = id => ((S.data && S.data.reviews) || []).filter(r => r.employeeId === id).sort((a, b) => String(b.period).localeCompare(String(a.period)));
export const skillsOf = id => ((S.data && S.data.skills) || []).filter(s => s.employeeId === id);
export const leaveOf = id => ((S.data && S.data.leaveRequests) || []).filter(l => l.employeeId === id).sort((a, b) => String(b.from).localeCompare(String(a.from)));
export const notesOf = id => ((S.data && S.data.notes) || []).filter(n => n.employeeId === id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
export const quarterliesOf = id => ((S.data && S.data.quarterlies) || []).filter(q => q.employeeId === id);
export const tasksOf = id => ((S.data && S.data.tasks) || []).filter(t => t.employeeId === id);
export const userName = id => ((S.data && S.data.users) || []).find(u => u.id === id)?.name || '';

/* ---------- review year: starts on the day set in Settings → Leave ----------
   (11 September in the Ethiopia preset, 1 January in the International one).
   Quarter ids look like "Y2026-Q1": with 11 September, Q1 11 Sep–10 Dec, Q2 11 Dec–10 Mar,
   Q3 11 Mar–10 Jun, Q4 11 Jun–10 Sep. */
const parseQ = q => { const m = /^Y(\d{4})-Q([1-4])$/.exec(String(q || '')); return m ? { y: Number(m[1]), n: Number(m[2]) } : null; };
const yearStart = () => { const l = settings().leave || {}; return { m: (Number(l.yearStartMonth) || 9) - 1, d: Number(l.yearStartDay) || 11 }; };
export function quarterLabel(q) {
  const p = parseQ(q), ys = yearStart();
  return p ? 'Q' + p.n + ' ' + p.y + (ys.m === 0 && ys.d === 1 ? '' : '/' + String(p.y + 1).slice(2)) : String(q || '—');
}
export function quarterRange(q) {
  const p = parseQ(q), ys = yearStart();
  if (!p) return { start: '', end: '' };
  const start = new Date(Date.UTC(p.y, ys.m + (p.n - 1) * 3, ys.d)), end = new Date(Date.UTC(p.y, ys.m + p.n * 3, ys.d - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
export const quarterDates = q => { const r = quarterRange(q); return r.start ? dateShort(r.start).replace(/ \d{4}$/, '') + ' – ' + dateShort(r.end) : ''; };
export const nextQuarterOf = q => { const p = parseQ(q); return !p ? q : p.n === 4 ? 'Y' + (p.y + 1) + '-Q1' : 'Y' + p.y + '-Q' + (p.n + 1); };

/* ---------- config lookups ---------- */
export function allLevels() {
  const out = [];
  (settings().departments || []).forEach(d => (d.tracks || []).forEach(t => (t.levels || []).forEach(l =>
    out.push({ ...l, departmentId: d.id, departmentName: d.name, trackId: t.id, trackName: t.name }))));
  return out;
}
export const levelOf = id => allLevels().find(l => l.id === id) || null;
export function nextLevelOf(id) {
  const cur = levelOf(id);
  return cur ? allLevels().find(l => l.trackId === cur.trackId && l.order === cur.order + 1) || null : null;
}
export const levelName = id => (levelOf(id) || {}).name || '—';
export const deptName = id => ((settings().departments || []).find(d => d.id === id) || {}).name || '—';
export const levelSkills = id => (settings().levelSkills || {})[id] || [];
export const universal = () => settings().universal || [];
export const ratingScale = () => settings().ratingScale || [];
export const goalTypeName = t => ((settings().goalTypes || []).find(x => x.id === t) || {}).name || t;

/* ---------- formatting ---------- */
export const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const money = n => Math.round(Number(n) || 0).toLocaleString('en-US') + ' ' + cur();
export const pct = n => Math.round(Number(n) || 0) + '%';
export const score = n => (Math.round((Number(n) || 0) * 10) / 10).toFixed(1);
export const dateShort = d => d ? new Date(d.length === 7 ? d + '-01' : d).toLocaleDateString('en-GB', { day: d.length === 7 ? undefined : 'numeric', month: 'short', year: 'numeric' }) : '—';
export const monthName = m => m ? new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—';
export const monthShort = m => m ? new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short' }) : '—';
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
export function sinceText(d) {
  if (!d) return '—';
  const days = daysBetween(d, today());
  if (days < 45) return days + ' days';
  const months = Math.round(days / 30.4);
  return months < 18 ? months + ' months' : (Math.round(months / 12 * 10) / 10) + ' years';
}
export const STATUS_LABEL = {
  draft: 'Draft', active: 'Active', at_risk: 'At risk', completed: 'Completed', cancelled: 'Cancelled',
  not_started: 'Not started', in_progress: 'In progress', achieved: 'Achieved', blocked: 'Blocked', reviewed: 'Reviewed',
  pending: 'Waiting', approved: 'Approved', declined: 'Declined',
  not_ready: 'Not ready', developing: 'Developing', management_review: 'Ready for review',
  awaiting_approval: 'Waiting for approval', final: 'Approved', returned: 'Sent back', acknowledged: 'Read',
  todo: 'To do', submitted: 'Handed in', done: 'Done'
};
export const STATUS_TONE = {
  active: 'info', at_risk: 'warn', completed: 'ok', cancelled: '', draft: '',
  not_started: '', in_progress: 'info', achieved: 'ok', blocked: 'bad', reviewed: 'ok',
  pending: 'warn', approved: 'ok', declined: 'bad',
  not_ready: '', developing: 'info', management_review: 'warn',
  awaiting_approval: 'warn', final: 'ok', returned: 'bad', acknowledged: 'ok',
  todo: '', submitted: 'plum', done: 'ok'
};
export const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

/* ---------- small components ---------- */
export const chip = (text, tone) => el('span', { class: 'chip ' + (tone || ''), text });
export const statusChip = s => chip(STATUS_LABEL[s] || s, STATUS_TONE[s]);
/* a round face: the person's photo when they added one, otherwise their initials */
const photoOf = name => { const r = ((S.data && S.data.roster) || []).find(p => p.name === name); return r ? r.photo : ''; };
export const avatar = (name, cls, photo) => {
  const src = photo != null ? photo : photoOf(name);
  return el('span', { class: 'avatar ' + (cls || ''), title: name || '' }, [src ? el('img', { src, alt: '', loading: 'lazy' }) : initials(name)]);
};
export function bar(value, tone) {
  return el('div', { class: 'bar ' + (tone || '') }, [el('i', { style: 'width:' + Math.max(0, Math.min(100, Number(value) || 0)) + '%' })]);
}
/* skills are rated out of 10 once the admin switches the scale in Settings (out of 5 before) */
export const skillScale = () => (settings().skillScale === 10 ? 10 : 5);
export function meter(level, required) {
  const n = skillScale();
  return el('div', { class: 'meter', title: level + ' of ' + n + (required ? ' · needs ' + required : '') },
    Array.from({ length: n }, (_, k) => k + 1).map(i => el('i', { class: i <= level ? 'on' : (required && i <= required ? 'need' : '') })));
}
export function donut(percent, label) {
  return el('div', { class: 'donut', style: '--p:' + Math.max(0, Math.min(100, percent)) }, [el('span', { text: label != null ? label : pct(percent) })]);
}
export function spark(values) {
  const max = Math.max(5, ...values.map(v => v.score || 0));
  return el('div', { class: 'spark' }, values.map(v => el('i', {
    style: 'height:' + Math.max(6, (v.score / max) * 100) + '%', title: monthShort(v.period) + ': ' + score(v.score)
  })));
}
/* ---------- charts ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
export function svgEl(tag, attrs, kids) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
  (kids || []).forEach(c => c && n.appendChild(c));
  return n;
}
/* a small line chart: points = [{label, value}] */
export function lineChart(points, opts) {
  const o = opts || {};
  const max = o.max || Math.max(1, ...points.map(p => p.value));
  const min = o.min != null ? o.min : 0;
  const W = 320, H = o.height || 120, padX = 6, padB = 18, padT = 8;
  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const x = i => points.length < 2 ? W / 2 : padX + i * (W - padX * 2) / (points.length - 1);
  const y = v => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  [0, 0.5, 1].forEach(g => svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: padT + g * (H - padT - padB), y2: padT + g * (H - padT - padB), stroke: 'var(--line)', 'stroke-width': 1 })));
  if (points.length) {
    const d = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ');
    const area = d + ' L' + x(points.length - 1).toFixed(1) + ' ' + (H - padB) + ' L' + x(0).toFixed(1) + ' ' + (H - padB) + ' Z';
    svg.appendChild(svgEl('path', { d: area, fill: o.fill || 'var(--plumSoft)', opacity: '.7' }));
    svg.appendChild(svgEl('path', { d, fill: 'none', stroke: o.color || 'var(--plum)', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    points.forEach((p, i) => svg.appendChild(svgEl('circle', { cx: x(i), cy: y(p.value), r: i === points.length - 1 ? 4.5 : 3, fill: o.color || 'var(--plum)' },
      [svgEl('title', {}, [document.createTextNode(p.label + ': ' + p.value)])])));
  }
  const labels = el('div', { class: 'chartlabels' }, points.map(p => el('span', { text: p.label })));
  return el('div', { class: 'chartwrap' }, [svg, labels]);
}
/* horizontal comparison bars: rows = [{label, value, max, tone, note}] */
export function barRows(rows) {
  return el('div', { class: 'list' }, rows.map(r => el('div', { class: 'row', style: 'gap:12px' }, [
    el('span', { style: 'flex:1;min-width:120px;font-size:13.5px', text: r.label }),
    el('span', { style: 'width:110px' }, [bar((r.value / (r.max || 1)) * 100, r.tone)]),
    el('span', { class: 'num', style: 'width:70px;text-align:right;font-size:13px', text: r.note != null ? r.note : r.value })
  ])));
}
/* stacked strip, e.g. goals by status */
export function stacked(parts) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return el('div', {}, [
    el('div', { class: 'stackbar' }, parts.filter(p => p.value).map(p => el('i', { style: 'width:' + (p.value / total * 100) + '%;background:' + p.color, title: p.label + ': ' + p.value }))),
    el('div', { class: 'legend' }, parts.map(p => el('span', {}, [el('i', { style: 'background:' + p.color }), p.label + ' ' + p.value])))
  ]);
}
export function tile(k, v, s, onclick) {
  return el('div', { class: 'tile' + (onclick ? ' click' : ''), onclick }, [
    el('div', { class: 'k', text: k }), el('div', { class: 'v num', text: v }), s ? el('div', { class: 's', text: s }) : null
  ]);
}
export function card(title, sub, kids, actions) {
  return el('section', { class: 'card' }, [
    (title || actions) ? el('div', { class: 'cardhead' }, [
      el('div', {}, [title ? el('h3', { text: title }) : null, sub ? el('p', { class: 'sub', text: sub }) : null]),
      actions ? el('div', { class: 'row wrap' }, actions) : null
    ]) : null,
    ...kids.filter(Boolean)
  ]);
}
export function empty(title, text, action) {
  return el('div', { class: 'empty' }, [el('b', { text: title }), el('span', { text: text || '' }), action ? el('div', { style: 'margin-top:12px' }, [action]) : null]);
}
export function field(label, input, hint) {
  return el('div', { class: 'field' }, [el('label', { class: 'lb', text: label }), input, hint ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px', text: hint }) : null]);
}
export function input(value, attrs) { return el('input', { value: value == null ? '' : value, ...(attrs || {}) }); }
export function textarea(value, attrs) { return el('textarea', { ...(attrs || {}) }, [value == null ? '' : String(value)]); }
export function select(value, options, attrs) {
  const s = el('select', attrs || {}, options.map(o => el('option', { value: o.value, text: o.label })));
  s.value = value == null ? '' : value;
  return s;
}
export function checkbox(label, checked, onchange) {
  const c = el('input', { type: 'checkbox', checked, onchange: e => onchange(e.target.checked) });
  return el('label', { class: 'row', style: 'gap:9px;cursor:pointer;font-size:14px' }, [c, label]);
}

/* ---------- toast + modal ---------- */
let toastTimer;
export function toast(text, bad) {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}
export function modal(title, bodyKids, actions, opts) {
  const dlg = $('#dlg'), body = $('#dlgBody');
  body.textContent = '';
  body.appendChild(el('h2', { text: title }));
  if (opts && opts.sub) body.appendChild(el('p', { class: 'sub dim', style: 'margin-bottom:14px', text: opts.sub }));
  bodyKids.filter(Boolean).forEach(k => body.appendChild(k));
  body.appendChild(el('div', { class: 'acts' }, actions));
  if (!dlg.open) dlg.showModal();
  return dlg;
}
export const closeModal = () => $('#dlg').close();
/* a small window asking for an optional (or required) note before an action */
export function noteModal(title, sub, placeholder, okText, onOk, opts) {
  const o = opts || {};
  const box = textarea('', { placeholder: placeholder || '' });
  const err = el('p', { class: 'muted', style: 'font-size:12.5px;min-height:18px' });
  modal(title, [field(o.label || 'Note', box), err], [
    el('button', { class: 'ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: o.danger ? 'danger' : 'primary', text: okText, onclick: () => {
      if (o.required && !box.value.trim()) { err.textContent = 'Please write a short note.'; box.focus(); return; }
      onOk(box.value.trim());
    } })
  ], { sub });
  setTimeout(() => box.focus(), 50);
}

/* ---------- files ---------- */
/* shrink a photo in the browser before it is uploaded (small files, quick pages) */
export function resizeImage(file, max, quality, square) {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img, sx = 0, sy = 0, sw = w, sh = h;
      if (square) { const m = Math.min(w, h); sx = (w - m) / 2; sy = (h - m) / 2; sw = sh = m; w = h = m; }
      const k = Math.min(1, max / Math.max(w, h));
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      cv.toBlob(b => (b ? ok(b) : bad(new Error('Could not read that image.'))), 'image/jpeg', quality || 0.82);
    };
    img.onerror = () => bad(new Error('Could not read that image.'));
    img.src = URL.createObjectURL(file);
  });
}
/* put a file straight into storage through a short-lived link; resolves to its public URL */
export async function uploadFile(blob, kind, onProgress) {
  const type = blob.type || 'application/octet-stream';
  const r = await api({ action: 'uploadUrl', kind, contentType: type, size: blob.size });
  return new Promise((ok, bad) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', r.uploadUrl, true);
    xhr.setRequestHeader('content-type', type);
    xhr.upload.onprogress = ev => { if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { try { ok(JSON.parse(xhr.responseText).url); } catch (e) { bad(new Error('The upload finished but the answer was unreadable.')); } }
      else bad(new Error('Upload failed (' + xhr.status + ')'));
    };
    xhr.onerror = () => bad(new Error('Upload failed. Check the connection.'));
    xhr.send(blob);
  });
}
export function pickFile(accept) {
  return new Promise(ok => {
    const i = el('input', { type: 'file', accept, style: 'display:none' });
    document.body.appendChild(i);
    i.addEventListener('change', () => { ok(i.files[0] || null); i.remove(); });
    i.click();
  });
}
export const showMoney = () => !!(S.data && S.data.showMoney);

/* ---------- api ---------- */
export async function api(body) {
  const r = await fetch('/api/team', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const b = await r.json().catch(() => ({}));
  if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(b.error || 'Something went wrong');
  if (b.data) S.data = b.data;
  return b;
}
export async function loadState() {
  const r = await fetch('/api/team?state=1', { cache: 'no-store' });
  const b = await r.json().catch(() => ({}));
  // a server problem (storage not set up, for example) is shown, not mistaken for a first run
  if (!r.ok) throw new Error(b.error || 'The server answered ' + r.status);
  if (b.brand) S.brand = b.brand;
  if (b.data) S.data = b.data;
  return b;
}
export async function getSummary(employeeId, quarter) {
  const r = await fetch('/api/team?summary=' + encodeURIComponent(quarter) + '&employee=' + encodeURIComponent(employeeId), { cache: 'no-store' });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || 'Could not load the quarter');
  return b.summary;
}
/* run an action, show a message, re-render */
export async function act(body, okText, after) {
  try {
    const b = await api(body);
    if (okText) toast(okText);
    if (after) after(b);
    else window.dispatchEvent(new Event('gz:render'));
    return b;
  } catch (e) { toast(e.message, true); throw e; }
}
