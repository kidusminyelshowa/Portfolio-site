/* The friendly side of the Team app: the team playlist and its player, the
   notification bell, everyone's profile (photo, background, phone
   notifications, install), achievements and the admin's messages. */
import {
  el, frag, S, me, isAdmin, isManager, employees, empById, chip, card, empty, field, input, textarea, select, checkbox,
  modal, closeModal, act, toast, avatar, dateShort, today, resizeImage, uploadFile, pickFile, myEmp
} from '/team/ui.js';
import { brandName } from '/team/ui.js';
import { icon } from '/team/icons.js';

const render = () => window.dispatchEvent(new Event('gz:render'));
const go = h => { location.hash = h; };
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
export const timeAgo = iso => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago'; return dateShort(String(iso).slice(0, 10));
};

/* ================= background ================= */
export const BG_PRESETS = [
  // ids stay the same so saved choices keep working; colours follow the off-white / black / orange / lime palette
  { id: 'ivory', label: 'Off-white', css: 'linear-gradient(160deg,#F7F7F5 0%,#E8E8E5 100%)' },
  { id: 'petrol', label: 'Lime glow', css: 'radial-gradient(circle at 12% 0%,rgba(200,242,60,.45),transparent 45%),linear-gradient(160deg,#F4F4F2,#E9E9E6)' },
  { id: 'wine', label: 'Graphite', css: 'radial-gradient(circle at 90% 0%,rgba(20,20,20,.28),transparent 50%),linear-gradient(150deg,#E4E4E1,#F0F0EE 65%)' },
  { id: 'red', label: 'Orange glow', css: 'radial-gradient(circle at 85% 6%,rgba(242,84,27,.4),transparent 40%),radial-gradient(circle at 0% 100%,rgba(255,122,69,.18),transparent 40%),#F0F0EE' },
  { id: 'stone', label: 'Grey', css: 'linear-gradient(160deg,#E6E6E3,#D6D6D2)' },
  { id: 'dawn', label: 'Dawn', css: 'linear-gradient(135deg,#F1FBD6 0%,#F0F0EE 48%,#FDE9DF 100%)' },
  { id: 'lines', label: 'Lines', css: 'repeating-linear-gradient(45deg,rgba(20,20,20,.06) 0 2px,transparent 2px 16px),#F0F0EE' }
];
export function applyBackground() {
  const bg = (me() && me().prefs && me().prefs.bg) || { type: 'none' };
  const b = document.body;
  let fill = '';
  if (bg.type === 'image' && bg.value) fill = 'url("' + String(bg.value).replace(/"/g, '') + '")';
  else if (bg.type === 'preset') fill = (BG_PRESETS.find(p => p.id === bg.value) || {}).css || '';
  b.classList.toggle('bg', !!fill);
  b.style.setProperty('--bgfill', fill || 'var(--page)');
  b.style.setProperty('--veil', String(((bg.dim != null ? bg.dim : 55)) / 100));
}

/* ================= app install + phone notifications ================= */
let installEvent = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; render(); });
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canInstall = () => !isStandalone() && (!!installEvent || isIOS());
export async function installApp() {
  if (installEvent) { installEvent.prompt(); const r = await installEvent.userChoice.catch(() => null); installEvent = null; if (r && r.outcome === 'accepted') toast('Installed. Open ' + brandName() + ' from your home screen.'); render(); return; }
  modal('Add ' + brandName() + ' to your home screen', [
    el('ol', { style: 'padding-left:20px;line-height:1.9' }, [
      el('li', { text: 'Open ' + location.host + '/team in Safari.' }),
      el('li', {}, ['Tap the Share button ', el('b', { text: '(the square with an arrow)' }), '.']),
      el('li', {}, ['Choose ', el('b', { text: 'Add to Home Screen' }), ', then Add.']),
      el('li', { text: 'Open ' + brandName() + ' from the new icon and sign in. Then turn on notifications in your profile.' })
    ])
  ], [el('button', { class: 'primary', text: 'Got it', onclick: closeModal })], { sub: 'It then opens like an app, full screen, and can send you notifications.' });
}
let swReg = null;
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { swReg = await navigator.serviceWorker.register('/team/sw.js', { scope: '/team' }); } catch (e) { swReg = null; }
  navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.go) location.href = ev.data.go; });
  return swReg;
}
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushState = async () => {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'install-first' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try { const reg = swReg || await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); return sub ? 'on' : 'off'; } catch (e) { return 'off'; }
};
const b64 = s => { const pad = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
export async function enablePush() {
  const st = await pushState();
  if (st === 'install-first') return installApp();
  if (st === 'unsupported') return toast('This browser cannot show notifications. Try Chrome, or install the app.', true);
  if (st === 'blocked') return toast('Notifications are blocked for this site. Allow them in the browser settings.', true);
  if (!S.data.push || !S.data.push.ready || !S.data.push.publicKey) return toast('Phone notifications are not switched on for the studio yet. You still see everything in the bell.', true);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return toast('Notifications were not allowed.', true);
  try {
    const reg = swReg || await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(S.data.push.publicKey) });
    await act({ action: 'pushSubscribe', subscription: sub.toJSON(), ua: navigator.userAgent.slice(0, 150) }, 'Notifications are on for this device');
  } catch (e) { toast('Could not turn on notifications: ' + e.message, true); }
}
export async function disablePush() {
  try {
    const reg = swReg || await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await act({ action: 'pushUnsubscribe', endpoint: sub.endpoint }, 'Notifications are off for this device'); await sub.unsubscribe(); }
  } catch (e) { toast(e.message, true); }
}

/* ================= notification bell ================= */
let panel = null;
export function toggleBell() {
  if (panel) { closeBell(); return; }
  panel = el('div', { class: 'npanel', role: 'dialog', 'aria-label': 'Notifications' });
  drawBell();
  document.body.appendChild(panel);
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}
function outside(ev) { if (panel && !panel.contains(ev.target) && !ev.target.closest('#bellBtn')) closeBell(); }
export function closeBell() { if (panel) panel.remove(); panel = null; document.removeEventListener('pointerdown', outside, true); }
export function drawBell() {
  if (!panel) return;
  const list = (S.data && S.data.notifications) || [];
  panel.textContent = '';
  panel.append(
    el('div', { class: 'row', style: 'justify-content:space-between;margin:4px 4px 10px' }, [
      el('h3', { text: 'Notifications' }),
      el('div', { class: 'row' }, [
        S.data.unread ? el('button', { class: 'sm ghost', text: 'Mark all read', onclick: () => act({ action: 'readNotifications' }, null, () => { drawBell(); render(); }).catch(() => {}) }) : null,
        el('button', { class: 'icon', 'aria-label': 'Close', onclick: closeBell }, [icon('close', 18)])
      ])
    ]),
    list.length ? el('div', {}, list.map(n => el('div', { class: 'note' + (n.read ? '' : ' unread'), onclick: () => {
      closeBell();
      if (!n.read) act({ action: 'readNotifications', ids: [n.id] }, null, () => render()).catch(() => {});
      go(n.href || '#/');
    } }, [el('span', { class: 'e', text: n.emoji || '🔔' }), el('span', { class: 'grow' }, [el('b', { text: n.title }), n.body ? el('small', { text: n.body }) : null, el('time', { text: timeAgo(n.at) })])])))
      : empty('All quiet', 'New tasks, kick-offs, reviews and wins show up here.')
  );
}

/* ================= profile ================= */
export function profileModal() {
  const m = me(), emp = myEmp();
  const face = el('div', { class: 'row', style: 'gap:16px;margin-bottom:16px' });
  const drawFace = () => {
    const m = me();                          // fresh after every save
    face.textContent = '';
    face.append(avatar(m.name, 'xl', m.photo || ''), el('div', { class: 'stack', style: 'gap:6px' }, [
      el('b', { text: m.name }), el('span', { class: 'muted', style: 'font-size:13px', text: m.email }),
      el('div', { class: 'row wrap' }, [
        emp ? el('button', { class: 'sm', text: m.photo ? 'Change photo' : 'Add a photo', onclick: async ev => {
          const f = await pickFile('image/*'); if (!f) return;
          ev.target.disabled = true; ev.target.textContent = 'Uploading…';
          try {
            const url = await uploadFile(await resizeImage(f, 400, 0.85, true), 'avatar');
            await act({ action: 'savePrefs', photo: url }, 'Photo saved');
            drawFace(); render();
          } catch (e) { toast(e.message, true); ev.target.disabled = false; ev.target.textContent = 'Add a photo'; }
        } }) : el('span', { class: 'muted', text: 'Link this account to a team member to add a photo.' }),
        m.photo ? el('button', { class: 'sm ghost', text: 'Remove', onclick: () => act({ action: 'savePrefs', photo: '' }, 'Photo removed', () => { drawFace(); render(); }).catch(() => {}) }) : null
      ])
    ]));
  };
  drawFace();

  // background
  const cur = (m.prefs && m.prefs.bg) || { type: 'none', dim: 55 };
  const bgs = el('div', { class: 'bgs' });
  const dim = el('input', { type: 'range', min: 20, max: 85, value: cur.dim != null ? cur.dim : 55, 'aria-label': 'Soften the background' });
  const saveBg = (bg, msg) => act({ action: 'savePrefs', bg: { ...bg, dim: Number(dim.value) } }, msg || 'Background saved', () => { applyBackground(); drawBgs(); }).catch(() => {});
  const drawBgs = () => {
    const b = (me().prefs && me().prefs.bg) || { type: 'none' };
    bgs.textContent = '';
    bgs.append(el('button', { class: 'bgopt', 'aria-pressed': String(b.type === 'none'), title: 'Plain', style: 'background:var(--page)', onclick: () => saveBg({ type: 'none' }) }),
      ...BG_PRESETS.map(p => el('button', { class: 'bgopt', 'aria-pressed': String(b.type === 'preset' && b.value === p.id), title: p.label, style: 'background:' + p.css, onclick: () => saveBg({ type: 'preset', value: p.id }) })),
      el('button', { class: 'bgopt', 'aria-pressed': String(b.type === 'image'), title: 'Your own photo', style: b.type === 'image' ? 'background-image:url("' + b.value + '")' : '', onclick: async ev => {
        const f = await pickFile('image/*'); if (!f) return;
        toast('Uploading your background…');
        try { const url = await uploadFile(await resizeImage(f, 1800, 0.8), 'background'); saveBg({ type: 'image', value: url }, 'Background saved'); }
        catch (e) { toast(e.message, true); }
      } }, [b.type === 'image' ? null : icon('upload', 20)]));
  };
  drawBgs();
  dim.addEventListener('change', () => { const b = me().prefs && me().prefs.bg; if (b && b.type !== 'none') saveBg(b, 'Saved'); });
  dim.addEventListener('input', () => document.body.style.setProperty('--veil', String(dim.value / 100)));

  // notifications on this device + install
  const pushBox = el('div', {});
  const drawPush = async () => {
    const stt = await pushState();
    pushBox.textContent = '';
    const line = (title, sub, btn) => el('div', { class: 'switch' }, [el('span', {}, [el('b', { text: title }), el('div', { class: 'muted', style: 'font-size:12.5px', text: sub })]), btn]);
    pushBox.append(...[
      line('Notifications on this device', { on: 'On. Tasks, kick-offs, reviews and wins arrive here.', off: 'Off', blocked: 'Blocked in the browser settings', 'install-first': 'On iPhone, add the app to your home screen first', unsupported: 'This browser cannot show them' }[stt],
        stt === 'on' ? el('div', { class: 'row' }, [el('button', { class: 'sm ghost', text: 'Test', onclick: () => act({ action: 'testPush' }, 'Sent. It should pop up in a moment.').catch(() => {}) }),
          el('button', { class: 'sm', text: 'Turn off', onclick: () => disablePush().then(drawPush) })])
          : el('button', { class: 'sm accent', text: stt === 'install-first' ? 'How to install' : 'Turn on', onclick: () => enablePush().then(drawPush) })),
      canInstall() ? line('Install the app', 'Opens full screen from your home screen, like any app.', el('button', { class: 'sm', text: 'Install', onclick: installApp })) : null
    ].filter(Boolean));
  };
  drawPush();

  // password
  const cur0 = input('', { type: 'password', placeholder: 'Current password', autocomplete: 'current-password' });
  const next = input('', { type: 'password', placeholder: 'New password (min 8)', autocomplete: 'new-password' });

  modal('Your profile', [
    face,
    el('h4', { style: 'margin:6px 0 8px', text: 'Background' }), bgs,
    el('div', { class: 'row', style: 'margin:10px 0 16px' }, [el('span', { class: 'muted', style: 'font-size:12.5px;width:120px', text: 'Soften it' }), dim]),
    el('h4', { style: 'margin:6px 0 2px', text: 'App' }), pushBox,
    el('details', { style: 'margin-top:14px' }, [el('summary', { style: 'cursor:pointer;font-weight:500', text: 'Change password' }),
      el('div', { class: 'grid2', style: 'margin-top:10px' }, [field('Current password', cur0), field('New password', next)]),
      el('button', { class: 'sm', text: 'Change password', onclick: () => act({ action: 'changePassword', current: cur0.value, password: next.value }, 'Password changed').catch(() => {}) })])
  ], [el('button', { class: 'ghost', text: 'Sign out', onclick: async () => { await act({ action: 'logout' }, null, () => location.reload()).catch(() => location.reload()); } }),
    el('button', { class: 'primary', text: 'Done', onclick: closeModal })]);
}

/* ================= dashboard pieces ================= */
export function hello() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const roster = (S.data && S.data.roster) || [];
  return el('div', { class: 'hello' }, [
    el('div', { class: 'grow', style: 'min-width:240px' }, [
      el('h2', {}, [greet + ', ', el('em', { text: first(me().name) })]),
      el('p', { text: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · here is your day' })
    ]),
    roster.length > 1 ? teamStrip(roster) : null
  ]);
}
export function teamStrip(roster) {
  return el('div', { class: 'teamstrip' }, [
    el('span', { class: 'muted', style: 'font-size:12.5px;white-space:nowrap', text: 'The team · ' + roster.length }),
    el('div', { class: 'faces' }, roster.slice(0, 24).map(p => {
      const a = avatar(p.name, 'sm', p.photo);
      a.addEventListener('click', () => { if (empById(p.id) && isManager()) go('#/people/' + p.id); else toast(p.name); });
      return a;
    }))
  ]);
}
export function promoCards(prefix) {
  const out = el('div', { class: 'stack', style: 'margin-bottom:14px' });
  pushState().then(stt => {
    if (stt === 'off' || stt === 'install-first') out.appendChild(el('div', { class: 'promo' }, [icon('bell', 26),
      el('div', { class: 'grow' }, [el('b', { text: 'Never miss a task or a kick-off' }), el('span', { text: stt === 'install-first' ? 'Add the app to your home screen, then turn on notifications.' : 'Turn on notifications for this device.' })]),
      el('button', { text: stt === 'install-first' ? 'Install' : 'Turn on', onclick: () => (stt === 'install-first' ? installApp() : enablePush().then(render)) })]));
    else if (canInstall() && store.get('gz-install-dismissed') !== '1') out.appendChild(el('div', { class: 'promo' }, [icon('phone', 26),
      el('div', { class: 'grow' }, [el('b', { text: 'Use ' + brandName() + ' like an app' }), el('span', { text: 'Add it to your home screen for one-tap access.' })]),
      el('button', { text: 'Install', onclick: installApp }), el('button', { class: 'icon', style: 'color:#fff', 'aria-label': 'Hide', onclick: () => { store.set('gz-install-dismissed', '1'); out.textContent = ''; } }, [icon('close', 16)])]));
  });
  return out;
}
export function achievementsCard(employeeId, title) {
  const mine = ((S.data && S.data.achievements) || []).filter(a => a.employeeId === employeeId).slice(0, 12);
  return card(title || 'Achievements', mine.length ? mine.length + ' recent' : 'Earned for on-time streaks, quality, goals and more', [
    mine.length ? el('div', { class: 'badges' }, mine.map(a => el('div', { class: 'badge-card' }, [el('span', { class: 'e', text: a.emoji }), el('b', { text: a.title }), el('small', { text: timeAgo(a.at) })])))
      : el('div', { class: 'badges' }, ((S.data && S.data.achievementList) || []).filter(a => a.on).slice(0, 6).map(a => el('div', { class: 'badge-card', style: 'opacity:.55' }, [el('span', { class: 'e', text: a.emoji }), el('b', { text: a.title }), el('small', { text: a.text })])))
  ]);
}

/* ================= music: the studio's Spotify playlist =================
   One Spotify player for the whole app. It lives outside the page, so moving
   between pages never stops the song: on the Music page it sits in the page,
   everywhere else it floats as a small player (or a pill when minimised).
   It loads only when someone opens it, so it costs nothing until then. */
const SP = { box: null, frame: null, src: '', loaded: false, slot: null, ro: null };
const spotifyId = () => (S.data && S.data.music && S.data.music.spotify) || '';
const spMin = () => store.get('gz-sp-min') !== '0';          // minimised until someone opens it
function spLoad() {
  const id = spotifyId();
  if (!id || (SP.loaded && SP.src === id)) return;
  SP.src = id; SP.loaded = true;
  SP.frame = el('iframe', { src: 'https://open.spotify.com/embed/' + id + '?utm_source=generator&theme=0', height: String(floatH()), title: brandName() + ' playlist on Spotify',
    allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture', loading: 'eager' });
  const body = SP.box.querySelector('.spbody');
  body.textContent = '';
  body.appendChild(SP.frame);
}
// floating: a slim bar on phones, a card on bigger screens, the track list when made taller
const floatH = () => (SP.box && SP.box.classList.contains('tall') ? 352 : window.matchMedia('(max-width:620px)').matches ? 80 : 152);
function spPlace() {
  if (!SP.box) return;
  const onPage = SP.slot && SP.slot.isConnected;
  SP.box.classList.toggle('page', !!onPage);
  SP.box.classList.toggle('min', !onPage && spMin());
  if (onPage) {
    const r = SP.slot.getBoundingClientRect();
    Object.assign(SP.box.style, { left: (r.left + window.scrollX) + 'px', top: (r.top + window.scrollY) + 'px', width: r.width + 'px' });
    if (SP.frame) SP.frame.height = String(Math.max(352, Math.round(r.height) - 16));
  } else {
    Object.assign(SP.box.style, { left: '', top: '', width: '' });
    if (SP.frame) SP.frame.height = String(floatH());
  }
  const h = onPage || spMin() ? 0 : floatH() + 58;
  document.documentElement.style.setProperty('--playh', h + 'px');
}
export function drawPlayer() {
  const id = spotifyId();
  if (!S.data || !id) {
    if (SP.box) { SP.box.remove(); SP.box = null; SP.frame = null; SP.loaded = false; }
    document.documentElement.style.setProperty('--playh', '0px');
    return;
  }
  if (!SP.box) {
    SP.box = el('div', { class: 'spdock', role: 'region', 'aria-label': 'Music player' }, [
      el('button', { class: 'sppill', type: 'button', 'aria-label': 'Open the ' + brandName() + ' playlist', onclick: () => { store.set('gz-sp-min', '0'); spLoad(); spPlace(); } }, [
        SP.loaded ? el('span', { class: 'eq' }, [el('i'), el('i'), el('i')]) : icon('music', 18), el('span', { text: brandName() + ' playlist' })]),
      el('div', { class: 'sphead' }, [icon('music', 16), el('b', { class: 'grow', text: brandName() + ' playlist' }),
        el('button', { type: 'button', 'aria-label': 'Bigger', title: 'Show the track list', onclick: () => { SP.box.classList.toggle('tall'); spPlace(); } }, [icon('list', 16)]),
        el('button', { type: 'button', 'aria-label': 'Minimise', title: 'Minimise (keeps playing)', onclick: () => { store.set('gz-sp-min', '1'); spPlace(); drawPill(); } }, [icon('close', 16)])]),
      el('div', { class: 'spbody' })
    ]);
    document.body.appendChild(SP.box);
    window.addEventListener('resize', spPlace);
  }
  if (SP.loaded && SP.src !== id) { SP.loaded = false; }
  if (!spMin() || (SP.slot && SP.slot.isConnected)) spLoad();
  drawPill();
  spPlace();
}
function drawPill() {
  const pill = SP.box && SP.box.querySelector('.sppill');
  if (!pill) return;
  pill.firstChild.replaceWith(SP.loaded ? el('span', { class: 'eq' }, [el('i'), el('i'), el('i')]) : icon('music', 18));
}

export function viewMusic() {
  const id = spotifyId();
  if (SP.ro) { SP.ro.disconnect(); SP.ro = null; }
  SP.slot = null;
  const admin = isAdmin() ? card('Playlist link', id ? 'Paste a different link to change it, or clear it to remove the player.' : 'Paste the link of the studio’s Spotify playlist (Spotify → Share → Copy link to playlist).', [
    el('div', { class: 'row' }, (() => {
      const i = input(id ? 'https://open.spotify.com/' + id : '', { placeholder: 'https://open.spotify.com/playlist/…' });
      return [i, el('button', { class: 'sm accent', text: 'Save', onclick: () => act({ action: 'setSpotify', url: i.value.trim() }, i.value.trim() ? 'Playlist linked' : 'Playlist removed', render).catch(() => {}) })];
    })())
  ]) : null;
  if (!id) return frag([empty('No playlist yet', isAdmin() ? 'Link the studio’s Spotify playlist below and it plays for the whole team, on every page.' : 'An admin will link the studio’s Spotify playlist here.'),
    admin ? el('div', { style: 'margin-top:14px' }, [admin]) : null]);
  const slot = el('div', { class: 'spslot', style: 'height:min(520px,70vh)' });
  SP.slot = slot;
  store.set('gz-sp-min', '0');                      // after the Music page, the player follows you as a small card
  // the floating player moves into this space; it keeps playing when you leave the page
  requestAnimationFrame(() => { drawPlayer(); spPlace(); });
  if ('ResizeObserver' in window) { SP.ro = new ResizeObserver(spPlace); SP.ro.observe(slot); }
  return frag([
    el('div', { class: 'musicgrid' }, [
      slot,
      el('div', { class: 'stack' }, [
        card('How it works', null, [
          el('p', { class: 'dim', text: 'Press play here, then keep working: the song carries on while you move around the app. Outside this page the player shrinks to the corner; minimise it to a small pill.' }),
          el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:8px', text: 'Full songs play when you are signed in to Spotify in this browser (free or Premium); otherwise Spotify plays 30-second previews.' }),
          el('div', { class: 'row wrap', style: 'margin-top:12px' }, [
            el('a', { class: 'chip accent', href: 'https://open.spotify.com/' + id, target: '_blank', rel: 'noopener', text: 'Open in Spotify ↗' })
          ])
        ]),
        admin
      ])
    ])
  ]);
}
window.addEventListener('hashchange', () => { if ((location.hash || '#/') !== '#/music') { SP.slot = null; if (SP.ro) { SP.ro.disconnect(); SP.ro = null; } setTimeout(spPlace, 0); } });

/* ================= admin: messages to the team ================= */
const EMOJIS = ['🎉', '🎊', '🌼', '🔥', '🎄', '💧', '🐣', '🌙', '🇪🇹', '💐', '🙏', '🚀', '⭐', '🏆', '❤️', '☕', '📣', '👋'];
const LINKS = [['#/', 'Dashboard'], ['#/tasks', 'My tasks'], ['#/music', 'Music'], ['#/leave', 'Leave'], ['#/reviews', 'My reviews'], ['#/goals', 'My goals']];
export function viewNotify() {
  if (!isAdmin()) return empty('Admins only', '');
  const d = { emoji: '🎉', title: '', body: '', audience: 'all', people: [], href: '#/', sendOn: '' };
  const titleIn = input('', { placeholder: 'e.g. Happy New Year!' });
  const bodyIn = textarea('', { placeholder: 'Your message to the team' });
  const emojiRow = el('div', { class: 'emojis' });
  const drawEmoji = () => { emojiRow.textContent = ''; EMOJIS.forEach(e => emojiRow.appendChild(el('button', { type: 'button', 'aria-pressed': String(d.emoji === e), style: d.emoji === e ? 'background:var(--ink);color:#fff' : '', text: e, onclick: () => { d.emoji = e; drawEmoji(); drawPreview(); } }))); };
  const aud = select('all', [{ value: 'all', label: 'The team' }, { value: 'everyone', label: 'The team and creative partners' }, { value: 'partners', label: 'Creative partners only' },
    { value: 'managers', label: 'Managers and admins' }, { value: 'pick', label: 'Choose people' }]);
  const peopleBox = el('div', { class: 'list', hidden: true, style: 'max-height:220px;overflow:auto;margin-bottom:12px' },
    employees().filter(e => e.status !== 'inactive').map(e => checkbox(e.name, false, on => { d.people = on ? d.people.concat(e.id) : d.people.filter(x => x !== e.id); })));
  aud.addEventListener('change', () => { d.audience = aud.value; peopleBox.hidden = aud.value !== 'pick'; });
  const link = select('#/', LINKS.map(([v, l]) => ({ value: v, label: l })), { onchange: ev => { d.href = ev.target.value; } });
  const when = input('', { type: 'date', min: today() });
  const preview = el('div', { class: 'note unread', style: 'background:var(--soft);cursor:default' });
  const drawPreview = () => { preview.textContent = ''; preview.append(el('span', { class: 'e', text: d.emoji }), el('span', { class: 'grow' }, [el('b', { text: titleIn.value || 'Your title' }), el('small', { text: bodyIn.value || 'Your message' }), el('time', { text: brandName() + ' · now' })])); };
  titleIn.addEventListener('input', drawPreview); bodyIn.addEventListener('input', drawPreview);
  drawEmoji(); drawPreview();
  const fill = r => { d.emoji = r.emoji; titleIn.value = r.title; bodyIn.value = r.body; if (r.when && r.when > today()) when.value = r.when; drawEmoji(); drawPreview(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const recs = (S.data.recommendations || []);
  const sent = (S.data.broadcasts || []);
  return frag([
    el('div', { class: 'grid2', style: 'align-items:start' }, [
      card('New message', 'Goes to the bell in the app, and as a phone notification to everyone who turned them on.', [
        field('Emoji', emojiRow), field('Title', titleIn), field('Message', bodyIn),
        el('div', { class: 'grid2' }, [field('Who', aud), field('Opens', link)]), peopleBox,
        field('Send on (leave empty to send now)', when),
        el('label', { class: 'lb', text: 'Preview' }), preview,
        el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' }, [el('button', { class: 'accent', onclick: ev => {
          if (!titleIn.value.trim()) { titleIn.focus(); return; }
          const audience = d.audience === 'pick' ? d.people : d.audience;
          if (Array.isArray(audience) && !audience.length) return toast('Choose at least one person.', true);
          ev.target.disabled = true;
          act({ action: 'sendBroadcast', emoji: d.emoji, title: titleIn.value, body: bodyIn.value, audience, href: d.href, sendOn: when.value },
            when.value && when.value > today() ? 'Scheduled for ' + dateShort(when.value) : 'Sent to the team', () => render()).catch(() => { ev.target.disabled = false; });
        } }, [icon('send', 16), 'Send'])])
      ]),
      el('div', { class: 'stack' }, [
        card('Suggested', 'Ideas for the next few weeks. Tap one to use it.', [recs.length ? el('div', { class: 'list' }, recs.map(r => el('div', { class: 'rec' }, [
          el('span', { class: 'e', text: r.emoji }), el('div', { class: 'grow' }, [el('b', { text: r.title }), el('div', { class: 'muted', style: 'font-size:12.5px', text: r.why })]),
          el('button', { class: 'sm', text: 'Use', onclick: () => fill(r) })]))) : empty('No suggestions right now', 'Holidays, work anniversaries, streaks and deliveries show up here.')]),
        card('Sent and scheduled', null, [sent.length ? el('div', { class: 'list' }, sent.map(b => el('div', { class: 'item' }, [
          el('span', { style: 'font-size:20px', text: b.emoji }), el('span', { class: 'grow' }, [el('b', { text: b.title }),
            el('small', { text: (b.status === 'sent' ? 'Sent ' + timeAgo(b.sentAt) + ' · ' + (b.reach || 0) + ' people' : 'Scheduled for ' + dateShort(b.sendOn)) })]),
          b.status === 'scheduled' ? el('button', { class: 'sm ghost', text: 'Cancel', onclick: () => act({ action: 'deleteBroadcast', id: b.id }, 'Cancelled').catch(() => {}) }) : chip('Sent', 'ok')
        ]))) : empty('Nothing sent yet', '')])
      ])
    ]),
    el('div', { style: 'margin-top:14px' }, [achievementSettings()])
  ]);
}
function achievementSettings() {
  const list = (S.data.achievementList || []).map(a => ({ ...a }));
  let adminCopies = S.data.adminAchievements !== false;
  return card('Achievements', 'Which wins the app celebrates. Each person is told, and you get a copy.', [
    el('div', { class: 'grid2' }, list.map(a => el('label', { class: 'switch', style: 'cursor:pointer' }, [
      el('span', { class: 'row' }, [el('span', { style: 'font-size:22px', text: a.emoji }), el('span', {}, [el('b', { text: a.title }), el('div', { class: 'muted', style: 'font-size:12.5px', text: a.text })])]),
      el('input', { type: 'checkbox', checked: a.on, onchange: ev => { a.on = ev.target.checked; } })
    ]))),
    el('div', { class: 'row wrap', style: 'margin-top:12px;justify-content:space-between' }, [
      checkbox('Send me a copy of everyone’s achievements', adminCopies, v => { adminCopies = v; }),
      el('button', { class: 'primary', text: 'Save achievements', onclick: () => act({ action: 'saveAchievementSettings', enabled: Object.fromEntries(list.map(a => [a.key, a.on])), adminAchievements: adminCopies }, 'Saved').catch(() => {}) })
    ])
  ]);
}
