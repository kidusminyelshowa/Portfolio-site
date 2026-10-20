import { randomBytes } from 'node:crypto';

// Step 1 of the CMS sign-in: send the editor to GitHub to approve access
export default function handler(req, res) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        res.status(500).send('GITHUB_CLIENT_ID is not set in the Vercel project settings.');
        return;
    }

    const state = randomBytes(16).toString('hex');
    const params = new URLSearchParams({ client_id: clientId, scope: 'repo,user', state });
    res.setHeader('Set-Cookie', `cms_oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
}
