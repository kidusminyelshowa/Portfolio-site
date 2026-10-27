/* Team app: works offline for the app itself (not the data), and shows
   push notifications. Pages and scripts are fetched fresh when online and
   fall back to the last copy when offline. The API is never cached. */
const CACHE = 'team-v8';
const SHELL = ['/team', '/team/ui.js', '/team/app.js', '/team/me.js', '/team/team.js', '/team/tasks.js', '/team/projects.js',
  '/team/sales.js', '/team/social.js', '/team/icons.js', '/team/gantt.js', '/team/insights.js', '/team/icons/icon-192.png', '/team/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (!(url.pathname === '/team' || url.pathname.startsWith('/team/') || url.pathname.startsWith('/assets/'))) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match('/team'))));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Team', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Team', {
    body: d.body || '', tag: d.tag, renotify: false,
    icon: '/team/icons/icon-192.png', badge: '/team/icons/badge-96.png',
    data: { href: d.href || '#/' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = '/team' + ((e.notification.data && e.notification.data.href) || '#/');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).pathname.startsWith('/team'));
    if (open) { open.focus(); return open.navigate ? open.navigate(target).catch(() => open.postMessage({ go: target })) : open.postMessage({ go: target }); }
    return self.clients.openWindow(target);
  }));
});
