import { SUPABASE_URL } from '../src/inquiry.js';
import { needsAttention } from '../src/studio/checks.js';

// Runs every morning (see "crons" in vercel.json) and emails Kidus what the studio's Today page would show.
// Needs SUPABASE_SECRET_KEY, RESEND_API_KEY and CRON_SECRET in the Vercel project settings.
const SITE_URL = process.env.SITE_URL || 'https://kidusminyel.xyz';
const EMAIL_TO = process.env.DAILY_EMAIL_TO || 'hello@kidusminyel.xyz';
const EMAIL_FROM = process.env.DAILY_EMAIL_FROM || 'Studio <hello@kidusminyel.xyz>';

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function read(table, query, key) {
    const headers = { apikey: key };
    // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys must not
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
    return response.json();
}

export function digest(items) {
    const subject = `Studio: ${items.length} thing${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} you today`;
    const text = [
        ...items.map((item) => `${item.kind}: ${item.title} (${item.detail})\n${SITE_URL}${item.to}`),
        `Open the studio: ${SITE_URL}/studio/today`,
    ].join('\n\n');
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
<h2 style="margin:0 0 16px">${escape(subject)}</h2>
${items
    .map(
        (item) => `<p style="margin:0 0 14px"><span style="font-size:12px;font-weight:700;text-transform:uppercase;color:${item.urgent ? '#b3261e' : '#2d5d7b'}">${escape(item.kind)}</span><br>
<a href="${SITE_URL}${item.to}" style="color:#111;font-weight:700">${escape(item.title)}</a><br>
<span style="color:#555">${escape(item.detail)}</span></p>`,
    )
    .join('\n')}
<p style="margin-top:24px"><a href="${SITE_URL}/studio/today">Open the studio</a></p>
</div>`;
    return { subject, text, html };
}

export default async function handler(req, res) {
    const { CRON_SECRET, SUPABASE_SECRET_KEY, RESEND_API_KEY } = process.env;
    if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        res.status(401).json({ error: 'Not allowed' });
        return;
    }
    if (!SUPABASE_SECRET_KEY || !RESEND_API_KEY) {
        res.status(500).json({ error: 'SUPABASE_SECRET_KEY and RESEND_API_KEY need to be set in Vercel.' });
        return;
    }

    try {
        const [leads, proposals, invoices, projects, tasks] = await Promise.all([
            read('inquiries', 'select=id,name,company,email,status,created_at,updated_at&status=neq.archived', SUPABASE_SECRET_KEY),
            read('proposals', 'select=id,title,status,client_name,client_company,client_note,sent_at,viewed_at', SUPABASE_SECRET_KEY),
            read('invoices', 'select=*', SUPABASE_SECRET_KEY),
            read('projects', 'select=*', SUPABASE_SECRET_KEY),
            read('project_tasks', 'select=*', SUPABASE_SECRET_KEY),
        ]);
        const items = needsAttention({ leads, proposals, invoices, projects, tasks });
        if (items.length === 0) {
            res.status(200).json({ sent: false, items: 0 });
            return;
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: EMAIL_FROM, to: [EMAIL_TO], ...digest(items) }),
        });
        if (!response.ok) throw new Error(`Resend: ${response.status} ${await response.text()}`);
        res.status(200).json({ sent: true, items: items.length });
    } catch (error) {
        console.error(error);
        res.status(502).json({ error: error.message });
    }
}
