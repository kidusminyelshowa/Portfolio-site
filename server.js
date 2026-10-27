/* Self-hosting server: runs the whole site without Vercel.
   - serves the built site (dist/, made by `npm run build`)
   - runs every api/*.js function the way Vercel does (req.query, req.body, res.status/json/send/redirect)
   - applies the rewrites and headers from vercel.json
   - runs the cron jobs from vercel.json on a timer (CRON_SECRET, or a random one per run)
   - with STORAGE=local, accepts signed photo uploads and serves them from /media/
   Start: `npm run build && npm start` (reads .env if present). */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// a tiny .env reader, so no extra package is needed
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const { BACKEND, checkUploadToken, localMediaFile, LOCAL_MEDIA_PREFIX, put } = await import('./api/_storage.js');
const { ensureSecret } = await import('./api/_lib.js');
// the cron jobs below call this same server, so without CRON_SECRET a random one for this run is enough
if (!process.env.CRON_SECRET) process.env.CRON_SECRET = (await import('node:crypto')).randomBytes(24).toString('hex');
const STATIC = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.otf': 'font/otf', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.pdf': 'application/pdf'
};

/* vercel.json "source" patterns: /:param, (.*) groups and literal paths */
function compile(source) {
  const keys = [];
  let re = '';
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (c === '(') {                       // a regex group, copied as written: (.*) or ((?!api/).*)
      let depth = 0, j = i;
      for (; j < source.length; j++) { if (source[j] === '(') depth++; if (source[j] === ')' && --depth === 0) break; }
      keys.push(String(keys.length + 1));
      re += source.slice(i, j + 1);
      i = j + 1;
    } else if (c === ':' && /\w/.test(source[i + 1] || '')) {
      const name = /^\w+/.exec(source.slice(i + 1))[0];
      keys.push(name);
      re += '([^/]+)';
      i += name.length + 1;
    } else { re += c.replace(/[.+?^${}|[\]\\*]/g, '\\$&'); i++; }
  }
  return { re: new RegExp('^' + re + '$'), keys };
}
function match(source, pathname) {
  const { re, keys } = compile(source);
  const m = re.exec(pathname);
  if (!m) return null;
  const params = {};
  keys.forEach((k, i) => { params[k] = m[i + 1]; });
  return params;
}
const fill = (dest, params) => dest.replace(/[:$](\w+)/g, (_, k) => params[k] ?? '');

async function fileFor(pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  const file = path.join(STATIC, path.posix.normalize(rel));
  if (!file.startsWith(STATIC)) return null;
  for (const f of [file, file + '.html', path.join(file, 'index.html')]) {
    try { if ((await fsp.stat(f)).isFile()) return f; } catch {}
  }
  return null;
}

/* ---------- api functions ---------- */
const handlers = new Map();
async function apiHandler(name) {
  if (!/^[a-z0-9-]+$/i.test(name)) return null;
  const file = path.join(ROOT, 'api', name + '.js');
  if (!fs.existsSync(file)) return null;
  if (!handlers.has(name)) handlers.set(name, (await import(pathToFileURL(file).href)).default);
  return handlers.get(name);
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function vercelify(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); return res; };
  res.send = body => {
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(body); return res;
  };
  res.redirect = (a, b) => { const [code, to] = typeof a === 'number' ? [a, b] : [307, a]; res.statusCode = code; res.setHeader('Location', to); res.end(); return res; };
}

async function runApi(name, req, res, url) {
  const handler = await apiHandler(name);
  if (!handler) { res.statusCode = 404; return res.end('Not found'); }
  vercelify(req, res, url);
  if (!['GET', 'HEAD'].includes(req.method)) {
    const raw = await readRaw(req);
    req.rawBody = raw;   // uploads (api/media.js) need the bytes, not text
    const type = String(req.headers['content-type'] || '');
    if (/json/.test(type)) { try { req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { req.body = {}; } }
    else if (/urlencoded/.test(type)) req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
    else req.body = raw.length ? raw.toString('utf8') : undefined;
  }
  try { await handler(req, res); }
  catch (e) {
    console.error('[api/' + name + ']', e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); }
    res.end(JSON.stringify({ error: 'Server error' }));
  }
}

/* ---------- local uploads (STORAGE=local only) ---------- */
async function localUpload(req, res, url) {
  await ensureSecret();
  const claims = BACKEND === 'local' && checkUploadToken(url.searchParams.get('token'));
  if (!claims || req.method !== 'PUT') { res.statusCode = 403; return res.end(JSON.stringify({ error: 'Upload link expired or invalid' })); }
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (claims.t && !claims.t.split(',').includes(type)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'File type not allowed' })); }
  const body = await readRaw(req);
  if (claims.s && body.length > claims.s) { res.statusCode = 413; return res.end(JSON.stringify({ error: 'File too large' })); }
  const saved = await put(claims.p, body, { access: 'public', contentType: type, allowOverwrite: true });
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ url: saved.url, pathname: saved.pathname }));
}

async function serveFile(res, file, status = 200) {
  res.statusCode = status;
  if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}

/* ---------- requests ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  let pathname = url.pathname;

  for (const h of config.headers || []) {
    if (match(h.source, pathname)) h.headers.forEach(({ key, value }) => res.setHeader(key, value));
  }
  for (const r of config.redirects || []) {
    const p = match(r.source, pathname);
    if (p) { res.statusCode = r.permanent ? 308 : 307; res.setHeader('Location', fill(r.destination, p)); return res.end(); }
  }

  if (pathname === '/api/local-upload') return localUpload(req, res, url);
  if (BACKEND === 'local' && pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
    const file = localMediaFile(decodeURIComponent(pathname.slice(LOCAL_MEDIA_PREFIX.length)));
    if (fs.existsSync(file)) { res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); return serveFile(res, file); }
    res.statusCode = 404; return res.end('Not found');
  }
  const apiMatch = /^\/api\/([^/]+?)(?:\.js)?\/?$/.exec(pathname);
  if (apiMatch) return runApi(apiMatch[1], req, res, url);

  // the filesystem first, then the rewrites in order (as on Vercel)
  let file = await fileFor(pathname);
  if (!file) {
    for (const r of config.rewrites || []) {
      const p = match(r.source, pathname);
      if (!p) continue;
      const dest = new URL(fill(r.destination, p), url);
      dest.searchParams.forEach((v, k) => url.searchParams.set(k, v));
      const apiDest = /^\/api\/([^/]+?)(?:\.js)?\/?$/.exec(dest.pathname);
      if (apiDest) return runApi(apiDest[1], req, res, url);
      file = await fileFor(dest.pathname);
      if (file) break;
    }
  }
  if (file) return serveFile(res, file);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not found');
});

/* ---------- cron jobs from vercel.json ---------- */
function fieldMatches(field, value) {
  return field.split(',').some(part => {
    const [range, step] = part.split('/');
    const [lo, hi] = range === '*' ? [-Infinity, Infinity] : range.split('-').map(Number);
    const within = value >= lo && value <= (hi ?? lo);
    return within && (!step || (value - (lo === -Infinity ? 0 : lo)) % Number(step) === 0);
  });
}
function cronDue(expr, d) {
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  return fieldMatches(min, d.getUTCMinutes()) && fieldMatches(hour, d.getUTCHours()) && fieldMatches(dom, d.getUTCDate())
    && fieldMatches(mon, d.getUTCMonth() + 1) && fieldMatches(dow, d.getUTCDay());
}
/* the hourly due-date reminders are left out of vercel.json because Vercel's free
   (Hobby) plan only allows daily cron jobs; this server can run them itself */
const EXTRA_CRONS = [{ path: '/api/cron?run=hourly', schedule: '5 * * * *' }];
function startCron() {
  const jobs = (config.crons || []).concat(EXTRA_CRONS.filter(x => !(config.crons || []).some(j => j.path === x.path)));
  if (!jobs.length) return;
  let last = '';
  setInterval(() => {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16);
    if (stamp === last) return;
    last = stamp;
    jobs.filter(j => cronDue(j.schedule, now)).forEach(j => {
      fetch('http://127.0.0.1:' + PORT + j.path, { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } })
        .then(r => r.text().then(t => console.log('[cron]', j.path, r.status, t.slice(0, 200))))
        .catch(e => console.error('[cron]', j.path, e.message));
    });
  }, 20 * 1000);
}

if (!fs.existsSync(STATIC)) console.warn('dist/ is missing. Run `npm run build` first.');
server.listen(PORT, () => {
  console.log('Listening on http://localhost:' + PORT + ' (storage: ' + BACKEND + ')');
  startCron();
});
