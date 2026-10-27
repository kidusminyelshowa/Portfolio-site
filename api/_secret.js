/* The key that signs sign-in cookies and upload links. SESSION_SECRET when it is set;
   otherwise one made on first use and kept in the private store (config/secret.json),
   loaded by ensureSecret() in _lib.js at the start of each request. */
let current = process.env.SESSION_SECRET || '';
export const secret = () => current;
export const setSecret = v => { current = String(v || ''); };
