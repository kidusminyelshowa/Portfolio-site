import crypto from 'node:crypto';
import { put, get, head, list, del } from './_storage.js';
import { secret, setSecret } from './_secret.js';

export const MEDIA_TOKEN = process.env.MEDIA_BLOB_TOKEN;
/* the private store: its own token, or the one Vercel adds when a Blob store is connected */
export const LEADS_TOKEN = process.env.LEADS_BLOB_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

export const CONTENT_PATH = 'content.json';
// overridable so local development can hold its own password
export const AUTH_PATH = process.env.AUTH_PATH || 'config/auth.json';

/* ---------- responses ---------- */
export function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}

/* ---------- blob json helpers ---------- */
/* Private documents (team database, quotes, leads, passwords) are read straight
   from storage, never from the CDN copy: the CDN can hand back a version up to a
   minute old, and saving on top of that silently erased the change before it.
   Returns { data, etag }; data is null when the blob genuinely does not exist.
   A read that fails for any other reason throws, so callers can fail closed
   rather than mistake an outage for "nothing is stored here yet". */
export async function readJsonMeta(pathname, token, access, withEtag) {
  const acc = access || 'public';
  // the etag for a safe save comes from the metadata lookup (the download's header is
  // not in the same form); taken first, so a save in between makes ours retry
  let etag = null;
  if (withEtag) {
    try { etag = (await head(pathname, { token })).etag || null; }
    catch (e) { if (!(e && (e.name === 'BlobNotFoundError' || /not found|does not exist/i.test(String(e.message))))) throw e; }
  }
  let r;
  try {
    r = await get(pathname, { token, access: acc, ...(acc === 'private' ? { useCache: false } : {}) });
  } catch (e) {
    if (e && (e.name === 'BlobNotFoundError' || /not found/i.test(String(e.message)))) return { data: null, etag: null };
    throw e;
  }
  if (!r || !r.stream) return { data: null, etag: null };
  const text = await new Response(r.stream).text();
  return { data: text ? JSON.parse(text) : null, etag };
}

export async function readJson(pathname, token, fallback, access) {
  const { data } = await readJsonMeta(pathname, token, access);
  return data == null ? fallback : data;
}

/* opts.ifMatch: only save if nobody else saved since we read it (etag from readJsonMeta) */
export async function writeJson(pathname, token, data, access, opts) {
  return put(pathname, JSON.stringify(data, null, 2), {
    access: access || 'public',
    token,
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
    ...(opts && opts.ifMatch ? { ifMatch: opts.ifMatch } : {})
  });
}

export const isWriteConflict = e => !!e && (e.name === 'BlobPreconditionFailedError' || /precondition|etag mismatch/i.test(String(e.message)));

export { put, get, list, del };

/* ---------- password hashing ---------- */
export function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash: h };
}

export function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const { hash } = hashPassword(password, record.salt);
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(record.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- sessions ---------- */
const COOKIE = 'gz_session';

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

export function makeSession(hours) {
  const exp = String(Date.now() + (hours || 12) * 3600 * 1000);
  return exp + '.' + sign(exp);
}

export function validSession(token) {
  if (!token || !secret()) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const exp = token.slice(0, i), sig = token.slice(i + 1);
  const expect = sign(exp);
  if (sig.length !== expect.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return false;
  return Number(exp) > Date.now();
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function setSessionCookie(res, token, maxAgeSeconds) {
  const parts = [
    COOKIE + '=' + encodeURIComponent(token),
    'Path=/', 'HttpOnly', 'SameSite=Strict', 'Secure',
    'Max-Age=' + (maxAgeSeconds === 0 ? 0 : (maxAgeSeconds || 43200))
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function isAuthed(req) {
  return validSession(parseCookies(req)[COOKIE]);
}

export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  json(res, 401, { error: 'Not signed in' });
  return false;
}

/* ---------- first-run setup ----------
   The first admin account (Team app) and the Price Builder password can only be
   created by someone who knows SETUP_TOKEN, an environment variable set when the
   suite is installed. Without it set, setup is closed. */
export function setupTokenOk(given) {
  const want = String(process.env.SETUP_TOKEN || '');
  const got = String(given || '');
  if (want.length < 12 || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function readAuthRecord() {
  return readJson(AUTH_PATH, LEADS_TOKEN, null, 'private');
}

/* ---------- errors for the API's catch blocks ----------
   Expected errors (e.status) pass through. Anything else is logged for the server logs;
   a storage problem (missing or wrong Blob token, unreachable store) says so, so setup
   problems can be fixed without reading logs. Other details stay hidden. */
export function failure(e) {
  if (e && e.status) return [e.status, e.message];
  console.error(e);
  const cause = e && e.cause ? String(e.cause.hostname || e.cause.message || '') : '';
  const msg = String((e && e.message) || '') + (cause ? ': ' + cause : '');
  if (/vercel blob|blob|token|storage/i.test(msg + ' ' + String((e && e.name) || ''))) {
    return [503, 'File storage is not working (' + msg.replace(/^Vercel Blob:\s*/i, '').slice(0, 200) +
      '). In Vercel, check that a private Blob store is connected to this project (Storage → the store → Connect Project), then redeploy.'];
  }
  return [500, 'Something went wrong. Please try again.'];
}

/* ---------- the signing key ----------
   With SESSION_SECRET set this does nothing. Without it, the first request makes a random
   key and keeps it in the private store; later requests (and other servers) read the same
   one. Call at the start of every handler that signs or checks cookies or upload links. */
const SECRET_PATH = 'config/secret.json';
export async function ensureSecret() {
  if (secret()) return;
  let saved = await readJson(SECRET_PATH, LEADS_TOKEN, null, 'private');
  if (!saved || !saved.key) {
    const key = crypto.randomBytes(32).toString('hex');
    try {
      // no overwrite: if two requests race, the first key wins and the other reads it back
      await put(SECRET_PATH, JSON.stringify({ key, createdAt: new Date().toISOString() }), { access: 'private', token: LEADS_TOKEN,
        contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
      saved = { key };
    } catch (e) {
      saved = await readJson(SECRET_PATH, LEADS_TOKEN, null, 'private');
      if (!saved || !saved.key) throw e;
    }
  }
  setSecret(saved.key);
}
