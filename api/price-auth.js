import { json, readBody, readAuthRecord, writeJson, hashPassword, verifyPassword,
         makeSession, setSessionCookie, isAuthed, setupTokenOk, LEADS_TOKEN, AUTH_PATH } from './_lib.js';

export default async function handler(req, res) {
  let record;
  try {
    record = await readAuthRecord();
  } catch (e) {
    // never report "not configured" because storage was unreachable:
    // that would let anyone claim the admin during an outage.
    return json(res, 503, { error: 'Account storage is unreachable. Try again shortly.' });
  }
  const configured = !!(record && record.hash);

  if (req.method === 'GET') {
    return json(res, 200, { configured, authed: isAuthed(req) });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = await readBody(req);
  const action = body.action;

  if (action === 'setup') {
    if (configured) return json(res, 409, { error: 'A password is already set.' });
    if (!setupTokenOk(body.setupToken)) return json(res, 403, { error: 'The setup key is wrong, or SETUP_TOKEN is not set on the server.' });
    const pw = String(body.password || '');
    if (pw.length < 8) return json(res, 400, { error: 'Use at least 8 characters.' });
    const rec = hashPassword(pw);
    await writeJson(AUTH_PATH, LEADS_TOKEN, { ...rec, createdAt: new Date().toISOString() }, 'private');
    setSessionCookie(res, makeSession(12));
    return json(res, 200, { ok: true, authed: true });
  }

  if (action === 'login') {
    if (!configured) return json(res, 409, { error: 'No password set yet.' });
    if (!verifyPassword(String(body.password || ''), record)) {
      await new Promise(r => setTimeout(r, 600));   // slow down guessing
      return json(res, 401, { error: 'Wrong password.' });
    }
    setSessionCookie(res, makeSession(12));
    return json(res, 200, { ok: true, authed: true });
  }

  if (action === 'change') {
    if (!isAuthed(req)) return json(res, 401, { error: 'Not signed in' });
    if (!verifyPassword(String(body.password || ''), record)) {
      return json(res, 401, { error: 'Current password is wrong.' });
    }
    const np = String(body.newPassword || '');
    if (np.length < 8) return json(res, 400, { error: 'Use at least 8 characters.' });
    const rec = hashPassword(np);
    await writeJson(AUTH_PATH, LEADS_TOKEN, { ...rec, createdAt: new Date().toISOString() }, 'private');
    return json(res, 200, { ok: true });
  }

  if (action === 'logout') {
    setSessionCookie(res, '', 0);
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Unknown action' });
}
