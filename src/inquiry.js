// Inquiries go into a private Supabase table that only accepts inserts from the site.
// The publishable key is meant to be public; row-level security keeps the table unreadable.
export const SUPABASE_URL = 'https://vuzxysgjuvgovcxmnfae.supabase.co';
export const SUPABASE_KEY = 'sb_publishable__AvHZoRcFSWGQgHTA31hNA_Yq3nPJc4';

export async function submitInquiry(inquiry) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/inquiries`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify({
            name: inquiry.name.trim(),
            email: inquiry.email.trim(),
            company: inquiry.company.trim() || null,
            project_types: inquiry.projectTypes,
            message: inquiry.message.trim(),
            timeline: inquiry.timeline || null,
            budget: inquiry.budget || null,
        }),
    });
    if (!response.ok) throw new Error(`Inquiry failed with ${response.status}`);
}
