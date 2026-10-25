/* Storage adapter. Everything the suite stores goes through these functions, which
   mirror the parts of @vercel/blob the code uses (put, get, head, list, del, and the
   signed upload links).

   STORAGE=blob (default): Vercel Blob, unchanged behaviour.
   STORAGE=supabase (picked by itself when SUPABASE_SERVICE_ROLE_KEY is set): one table,
   suite_files, in a Supabase project, reached with the project's secret key. Saves go
   through the suite_put function, which does the etag check inside the database.
   STORAGE=local: plain files under STORAGE_DIR (default ./data), for running the
   suite on any server or PC with server.js. Each document gets an etag (a hash of its
   bytes), and a save with ifMatch is refused when the file changed in between, the
   same way Blob does, so mutate()'s retry logic works on both. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as blob from '@vercel/blob';
import { secret } from './_secret.js';

const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const SB_URL = String(process.env.SUPABASE_URL || 'https://vuzxysgjuvgovcxmnfae.supabase.co').replace(/\/+$/, '');
const CHOSEN = (process.env.STORAGE || (SB_KEY ? 'supabase' : 'blob')).toLowerCase();
export const BACKEND = ['local', 'supabase'].includes(CHOSEN) ? CHOSEN : 'blob';
const ROOT = path.resolve(process.env.STORAGE_DIR || './data');

/* photos, backgrounds and the logo are served under this path: by server.js from the local
   folder, or by api/media.js from the private Blob store when there is no public store */
export const LOCAL_MEDIA_PREFIX = '/media/';
/* Supabase, or Blob without MEDIA_BLOB_TOKEN: pictures go into the one private store,
   through api/media.js */
export const MEDIA_PRIVATE = BACKEND === 'supabase' || (BACKEND === 'blob' && !process.env.MEDIA_BLOB_TOKEN);

class StorageError extends Error {
  constructor(name, message) { super(message); this.name = name; }
}

// private and public files live side by side under one root, split by access
const fileOf = (pathname, access) => {
  const clean = path.posix.normalize('/' + String(pathname || '')).slice(1);
  if (!clean || clean.startsWith('..')) throw new StorageError('BlobError', 'Bad path: ' + pathname);
  return path.join(ROOT, access === 'public' ? 'public' : 'private', clean);
};
const etagOf = buf => '"' + crypto.createHash('sha1').update(buf).digest('hex') + '"';

// one write at a time per file, so the etag check and the write happen together
const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const mine = new Promise(r => { release = r; });
  locks.set(key, prev.then(() => mine));
  await prev;
  try { return await fn(); } finally { release(); if (locks.get(key) === mine) locks.delete(key); }
}

async function readFileOrNull(file) {
  try { return await fs.readFile(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

/* the private store holds documents; the public one holds uploads. Blob tells
   them apart by token; locally we keep a note of which access each path used. */
const local = {
  async put(pathname, body, opts = {}) {
    const access = opts.access === 'private' ? 'private' : 'public';
    const file = fileOf(pathname, access);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : await new Response(body).arrayBuffer());
    return withLock(file, async () => {
      if (opts.ifMatch) {
        const cur = await readFileOrNull(file);
        if (!cur || etagOf(cur) !== opts.ifMatch) throw new StorageError('BlobPreconditionFailedError', 'Precondition failed: etag mismatch');
      } else if (opts.allowOverwrite === false && await readFileOrNull(file)) {
        throw new StorageError('BlobError', 'This blob already exists');
      }
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
      await fs.writeFile(tmp, buf);
      await fs.rename(tmp, file);
      const url = access === 'public' ? LOCAL_MEDIA_PREFIX + pathname : 'local:' + pathname;
      return { url, downloadUrl: url, pathname, contentType: opts.contentType || '', etag: etagOf(buf) };
    });
  },
  async get(pathname, opts = {}) {
    const buf = await readFileOrNull(fileOf(pathname, opts.access));
    if (!buf) return null;
    return { stream: buf, blob: { pathname, etag: etagOf(buf), size: buf.length } };
  },
  async head(pathname, opts = {}) {
    // head does not say which access; documents are private, so look there first
    const buf = (await readFileOrNull(fileOf(pathname, 'private'))) || (await readFileOrNull(fileOf(pathname, 'public')));
    if (!buf) throw new StorageError('BlobNotFoundError', 'The requested blob does not exist');
    return { pathname, etag: etagOf(buf), size: buf.length };
  },
  async list(opts = {}) {
    const prefix = String(opts.prefix || '');
    const out = [];
    for (const access of ['private', 'public']) {
      const base = path.join(ROOT, access);
      const walk = async dir => {
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
        for (const d of entries) {
          const full = path.join(dir, d.name);
          if (d.isDirectory()) await walk(full);
          else if (!d.name.endsWith('.tmp')) {
            const rel = path.relative(base, full).split(path.sep).join('/');
            if (rel.startsWith(prefix)) {
              const st = await fs.stat(full);
              out.push({ pathname: rel, size: st.size, uploadedAt: st.mtime, url: access === 'public' ? LOCAL_MEDIA_PREFIX + rel : 'local:' + rel });
            }
          }
        }
      };
      await walk(base);
    }
    out.sort((a, b) => a.pathname.localeCompare(b.pathname));
    return { blobs: out.slice(0, opts.limit || 1000), hasMore: out.length > (opts.limit || 1000) };
  },
  async del(pathnames) {
    for (const p of [].concat(pathnames)) {
      const name = String(p).replace(/^local:/, '').replace(LOCAL_MEDIA_PREFIX, '');
      for (const access of ['private', 'public']) await fs.rm(fileOf(name, access), { force: true });
    }
  },
  /* signed upload links: a short-lived HMAC over the path, checked by server.js */
  issueSignedToken: async opts => signUpload(opts),
  async presignUrl(token) {
    return { presignedUrl: '/api/local-upload?token=' + encodeURIComponent(token) };
  }
};

/* Supabase: the table is closed to the public keys; only the secret key can reach it */
async function sb(method, route, body) {
  if (!SB_KEY) throw new StorageError('BlobError', 'Supabase storage: SUPABASE_SERVICE_ROLE_KEY is not set');
  let r;
  try {
    r = await fetch(SB_URL + route, {
      method,
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (e) {
    throw new StorageError('BlobError', 'Supabase storage: cannot reach ' + SB_URL + ' (' + (e.cause && e.cause.code || e.message) + ')');
  }
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const m = String((data && data.message) || text || r.status);
    if (/precondition_failed/.test(m)) throw new StorageError('BlobPreconditionFailedError', 'Precondition failed: etag mismatch');
    if (/already_exists/.test(m)) throw new StorageError('BlobError', 'This blob already exists');
    if (r.status === 401 || r.status === 403) throw new StorageError('BlobError', 'Supabase storage: the secret key was refused (' + m.slice(0, 120) + ')');
    if (r.status === 404 || /suite_(put|get|files)/.test(m)) throw new StorageError('BlobError', 'Supabase storage: the suite_files table is missing (' + m.slice(0, 120) + ')');
    throw new StorageError('BlobError', 'Supabase storage: ' + m.slice(0, 200));
  }
  return data;
}
const q = v => encodeURIComponent(v);

const supabase = {
  async put(pathname, body, opts = {}) {
    fileOf(pathname, 'private'); // same path rules as the local folder
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : await new Response(body).arrayBuffer());
    const access = opts.access === 'private' ? 'private' : 'public';
    const rows = await sb('POST', '/rest/v1/rpc/suite_put', {
      p_path: pathname, p_body: buf.toString('base64'), p_type: opts.contentType || 'application/octet-stream', p_access: access,
      p_if_match: opts.ifMatch || null, p_overwrite: opts.allowOverwrite !== false
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    const url = access === 'public' ? LOCAL_MEDIA_PREFIX + pathname : 'supabase:' + pathname;
    return { url, downloadUrl: url, pathname, contentType: opts.contentType || '', etag: row && row.etag };
  },
  async get(pathname) {
    const rows = await sb('POST', '/rest/v1/rpc/suite_get', { p_path: pathname });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    const buf = Buffer.from(row.body || '', 'base64');
    return { stream: buf, blob: { pathname, etag: row.etag, size: buf.length, contentType: row.content_type } };
  },
  async head(pathname) {
    const rows = await sb('GET', '/rest/v1/suite_files?select=etag,size&path=eq.' + q(pathname));
    if (!rows || !rows[0]) throw new StorageError('BlobNotFoundError', 'The requested blob does not exist');
    return { pathname, etag: rows[0].etag, size: rows[0].size };
  },
  async list(opts = {}) {
    const prefix = String(opts.prefix || '');
    const limit = opts.limit || 1000;
    const rows = await sb('GET', '/rest/v1/suite_files?select=path,size,updated_at,access&order=path&limit=' + (limit + 1) +
      (prefix ? '&path=like.' + q(prefix.replace(/[*%]/g, '') + '*') : ''));
    const out = (rows || []).filter(r => r.path.startsWith(prefix)).map(r => ({
      pathname: r.path, size: r.size, uploadedAt: new Date(r.updated_at),
      url: r.access === 'public' ? LOCAL_MEDIA_PREFIX + r.path : 'supabase:' + r.path
    }));
    return { blobs: out.slice(0, limit), hasMore: out.length > limit };
  },
  async del(pathnames) {
    for (const p of [].concat(pathnames)) {
      const name = String(p).replace(/^supabase:/, '').replace(LOCAL_MEDIA_PREFIX, '');
      await sb('DELETE', '/rest/v1/suite_files?path=eq.' + q(name));
    }
  },
  issueSignedToken: async opts => signUpload(opts),
  async presignUrl(token) {
    return { presignedUrl: '/api/media?token=' + encodeURIComponent(token) };
  }
};

/* an upload link of our own (local folder, or the private store through api/media.js) */
export function signUpload(opts) {
  const exp = opts.validUntil || Date.now() + 15 * 60 * 1000;
  const claims = { p: opts.pathname, e: exp, s: opts.maximumSizeInBytes || 0, t: (opts.allowedContentTypes || []).join(',') };
  const raw = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return raw + '.' + crypto.createHmac('sha256', secret()).update(raw).digest('base64url');
}

/* checks an upload link made by issueSignedToken; returns its claims or null */
export function checkUploadToken(token) {
  const [raw, sig] = String(token || '').split('.');
  if (!raw || !sig || !secret()) return null;
  const expect = crypto.createHmac('sha256', secret()).update(raw).digest('base64url');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const claims = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  return claims.e > Date.now() ? claims : null;
}

export const localMediaFile = pathname => fileOf(pathname, 'public');

const impl = BACKEND === 'local' ? local : BACKEND === 'supabase' ? supabase : blob;
export const put = (...a) => impl.put(...a);
export const get = (...a) => impl.get(...a);
export const head = (...a) => impl.head(...a);
export const list = (...a) => impl.list(...a);
export const del = (...a) => impl.del(...a);
export const issueSignedToken = (...a) => impl.issueSignedToken(...a);
export const presignUrl = (...a) => impl.presignUrl(...a);
