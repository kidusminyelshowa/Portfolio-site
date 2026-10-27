/* Pictures (profile photos, backgrounds, the logo) when the suite runs on one private
   Blob store, without a public one (no MEDIA_BLOB_TOKEN):
   PUT /api/media?token=…   saves an upload, with a link from the uploadUrl action
   GET /media/<path>        (rewritten to /api/media?path=…) shows it
   Only files under team/ can be read here, never the documents. */
import { get, put, checkUploadToken, LOCAL_MEDIA_PREFIX } from './_storage.js';
import { json, ensureSecret, failure, LEADS_TOKEN } from './_lib.js';

const readRaw = req => new Promise((ok, bad) => {
  const parts = [];
  req.on('data', c => parts.push(c)); req.on('end', () => ok(Buffer.concat(parts))); req.on('error', bad);
});

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'PUT') {
      await ensureSecret();
      const claims = checkUploadToken(url.searchParams.get('token'));
      if (!claims) return json(res, 403, { error: 'Upload link expired or invalid' });
      const type = String(req.headers['content-type'] || '').toLowerCase();
      if (claims.t && !claims.t.split(',').includes(type)) return json(res, 400, { error: 'File type not allowed' });
      // never touch req.body here: on Vercel that would parse the picture as text
      const body = req.rawBody || await readRaw(req);
      if (claims.s && body.length > claims.s) return json(res, 413, { error: 'File too large' });
      await put(claims.p, body, { access: 'private', token: LEADS_TOKEN, contentType: type, allowOverwrite: true, addRandomSuffix: false });
      return json(res, 200, { url: LOCAL_MEDIA_PREFIX + claims.p, pathname: claims.p });
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    // after the /media/… rewrite the path arrives in req.query; req.url can still be the original
    const p = String((req.query && req.query.path) || url.searchParams.get('path') ||
      (url.pathname.startsWith(LOCAL_MEDIA_PREFIX) ? decodeURIComponent(url.pathname.slice(LOCAL_MEDIA_PREFIX.length)) : ''));
    if (!/^team\/(avatar|background|logo)\/[\w.-]+$/.test(p)) return json(res, 404, { error: 'Not found' });
    let r;
    try { r = await get(p, { token: LEADS_TOKEN, access: 'private' }); }
    catch (e) { if (/not found|does not exist/i.test(String(e && e.message))) return json(res, 404, { error: 'Not found' }); throw e; }
    if (!r || !r.stream) return json(res, 404, { error: 'Not found' });
    const ext = p.split('.').pop();
    res.statusCode = 200;
    res.setHeader('Content-Type', (r.blob && r.blob.contentType) || { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || 'application/octet-stream');
    // each upload gets a new name, so a picture never changes
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ext === 'svg') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return res.end(Buffer.from(await new Response(r.stream).arrayBuffer()));
  } catch (e) {
    const [status, error] = failure(e);
    return json(res, status, { error });
  }
}
