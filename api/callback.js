// Step 2 of the CMS sign-in: swap GitHub's code for a token and hand it to the CMS window
// The token only ever goes to a CMS window on this same site
function reply(req, res, status, content) {
    const message = `authorization:github:${status}:${JSON.stringify(content)}`;
    const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><body><script>
(function () {
    var origin = ${JSON.stringify(origin)};
    function receive(e) {
        if (e.origin !== origin) return;
        window.opener.postMessage(${JSON.stringify(message)}, origin);
        window.removeEventListener('message', receive, false);
    }
    window.addEventListener('message', receive, false);
    window.opener.postMessage('authorizing:github', origin);
})();
</script></body></html>`);
}

export default async function handler(req, res) {
    const { code, state } = req.query;
    const cookieState = /(?:^|;\s*)cms_oauth_state=([^;]+)/.exec(req.headers.cookie || '')?.[1];

    if (!code || !state || state !== cookieState) {
        reply(req, res, 'error', { message: 'Sign-in expired or was tampered with. Please try again.' });
        return;
    }

    try {
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            }),
        });
        const data = await response.json();
        if (!data.access_token) {
            reply(req, res, 'error', { message: data.error_description || 'GitHub did not return a token.' });
            return;
        }
        reply(req, res, 'success', { token: data.access_token, provider: 'github' });
    } catch {
        reply(req, res, 'error', { message: 'Could not reach GitHub. Please try again.' });
    }
}
