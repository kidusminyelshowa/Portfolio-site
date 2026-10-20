import { site } from './content.js';

// Inquiries go into a private Supabase table that only accepts inserts from the site.
// The publishable key is meant to be public; row-level security keeps the table unreadable.
const SUPABASE_URL = '';
const SUPABASE_KEY = '';

export const inquiryBackendReady = Boolean(SUPABASE_URL && SUPABASE_KEY);

export async function submitInquiry(inquiry) {
    if (!inquiryBackendReady) {
        // No backend yet: hand the answers to the visitor's email app instead
        const body = Object.entries(inquiry)
            .filter(([, value]) => value && value.length !== 0)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('\n');
        window.location.href = `mailto:${site.email}?subject=${encodeURIComponent('New project inquiry')}&body=${encodeURIComponent(body)}`;
        return;
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/inquiries`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify({
            project_types: inquiry.projectTypes,
            message: inquiry.message,
            company: inquiry.company || null,
            timeline: inquiry.timeline || null,
            budget: inquiry.budget || null,
            name: inquiry.name,
            email: inquiry.email,
        }),
    });
    if (!response.ok) throw new Error(`Inquiry failed with ${response.status}`);
}
