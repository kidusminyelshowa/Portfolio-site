/* Visitor analytics for client proposals (/price/<slug>).
   Storage (private store): visits/<quoteId>.json = { visits: [visit, …] }, newest last, kept apart from
   the quote so a stream of small saves never races with an edit to the quote itself.

   A visit is one opening of the page in one browser tab:
     { id, visitor, at, last, secs, depth, sections: { scope: 34, … }, acts, form, usd, device, country, city }
   No IP address, no cookie and no third party: the visitor id is a random value the page keeps in the
   browser's storage, so repeat visits from the same device can be told apart from new people. */
import { readJsonMeta, writeJson, isWriteConflict, LEADS_TOKEN } from './_lib.js';

export const SECTIONS = ['hero', 'glance', 'scope', 'choices', 'included', 'investment', 'timeline'];
const MAX_VISITS = 200;
const MAX_SECS = 6 * 3600;
const path = quoteId => 'visits/' + quoteId + '.json';
const token = s => (/^[a-z0-9]{8,32}$/i.test(String(s || '')) ? String(s) : '');
const int = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

export function deviceOf(ua) {
  ua = String(ua || '');
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'phone';
  return 'desktop';
}

/* what the page sends, trimmed to known fields and sane sizes; null when it is not a usable visit */
export function cleanVisit(body, req) {
  const b = body || {};
  const id = token(b.vid), visitor = token(b.visitor);
  if (!id || !visitor) return null;
  const sections = {};
  const raw = b.sections && typeof b.sections === 'object' ? b.sections : {};
  SECTIONS.forEach(k => { const s = int(raw[k], MAX_SECS); if (s) sections[k] = s; });
  const h = req.headers || {};
  let city = '';
  try { city = decodeURIComponent(String(h['x-vercel-ip-city'] || '')).slice(0, 60); } catch (e) { city = ''; }
  const country = /^[A-Z]{2}$/.test(String(h['x-vercel-ip-country'] || '')) ? String(h['x-vercel-ip-country']) : '';
  return { id, visitor, secs: int(b.secs, MAX_SECS), depth: int(b.depth, 100), sections, acts: int(b.acts, 10000),
           form: !!b.form, usd: !!b.usd, device: deviceOf(h['user-agent']), country, city };
}

/* add a visit, or update the one this tab already started; numbers only ever go up.
   Returns { isNew, previous } so the caller can tell the team when a client comes back. */
export async function recordVisit(quoteId, v) {
  const now = new Date().toISOString();
  for (let attempt = 1; ; attempt++) {
    const { data, etag } = await readJsonMeta(path(quoteId), LEADS_TOKEN, 'private', true);
    const safe = etag && attempt <= 4;
    const doc = data && Array.isArray(data.visits) ? data : { visits: [] };
    const found = doc.visits.find(x => x.id === v.id);
    const previous = doc.visits.length ? doc.visits[doc.visits.length - 1] : null;
    if (found) {
      found.last = now;
      found.secs = Math.max(found.secs || 0, v.secs);
      found.depth = Math.max(found.depth || 0, v.depth);
      found.acts = Math.max(found.acts || 0, v.acts);
      found.form = !!(found.form || v.form);
      found.usd = !!(found.usd || v.usd);
      found.sections = found.sections || {};
      Object.keys(v.sections).forEach(k => { found.sections[k] = Math.max(found.sections[k] || 0, v.sections[k]); });
    } else {
      doc.visits.push({ ...v, at: now, last: now });
      if (doc.visits.length > MAX_VISITS) doc.visits = doc.visits.slice(-MAX_VISITS);
    }
    try {
      await writeJson(path(quoteId), LEADS_TOKEN, doc, 'private', safe ? { ifMatch: etag } : null);
      return { isNew: !found, previous };
    } catch (e) {
      if (!isWriteConflict(e) || !safe) throw e;
      await new Promise(r => setTimeout(r, 100 * attempt));
    }
  }
}

export async function readVisits(quoteId) {
  try {
    const { data } = await readJsonMeta(path(quoteId), LEADS_TOKEN, 'private', false);
    return data && Array.isArray(data.visits) ? data.visits : [];
  } catch (e) { return []; }
}

export const visitsPath = path;
