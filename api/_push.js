/* Web push (phones and desktops that turned notifications on in the Team app).
   Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on the Vercel project; without
   them notifications still appear in the app's bell, just not as pushes. */
import webpush from 'web-push';

const PUB = process.env.VAPID_PUBLIC_KEY || '', PRIV = process.env.VAPID_PRIVATE_KEY || '';
let ready = false;
/* push services want a contact address; VAPID_SUBJECT can be a mailto: or https: link */
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
try { if (PUB && PRIV) { webpush.setVapidDetails(SUBJECT, PUB, PRIV); ready = true; } } catch (e) { ready = false; }
export const VAPID_PUBLIC_KEY = PUB;
export const pushReady = () => ready;

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, bad) => setTimeout(() => bad(Object.assign(new Error('timeout'), { statusCode: 0 })), ms))]);

/* send every queued notification to the devices of its people; returns endpoints that are gone */
export async function sendPush(db, outbox) {
  if (!ready || !outbox || !outbox.length) return [];
  const subs = db.pushSubs || [];
  const jobs = [];
  outbox.forEach(n => subs.filter(s => n.to.includes(s.userId)).forEach(s => {
    const payload = JSON.stringify({ title: n.title, body: n.body, href: n.href, tag: n.tag });
    jobs.push(withTimeout(webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 60 * 60 * 24, urgency: 'normal' }), 6000)
      .then(() => null).catch(e => (e && (e.statusCode === 404 || e.statusCode === 410) ? s.endpoint : null)));
  }));
  const res = await Promise.all(jobs.slice(0, 200));
  return res.filter(Boolean);
}
