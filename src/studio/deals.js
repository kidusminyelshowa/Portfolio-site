import { supabase } from './supabase.js';

export const today = () => new Date().toISOString().slice(0, 10);

export const addDays = (iso, days) => {
    const date = new Date(`${iso}T00:00:00`);
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
};

// Numbers run per year and never reuse a number, even after a delete: A-2026-001, INV-2026-002…
export async function nextNumber(table, prefix) {
    const year = new Date().getFullYear();
    const { data } = await supabase
        .from(table)
        .select('number')
        .like('number', `${prefix}-${year}-%`)
        .order('number', { ascending: false })
        .limit(1);
    const last = Number(data?.[0]?.number.split('-').pop()) || 0;
    return `${prefix}-${year}-${String(last + 1).padStart(3, '0')}`;
}

export function invoiceState(invoice) {
    if (invoice.status === 'paid') return { key: 'paid', label: 'Paid' };
    if (invoice.status === 'void') return { key: 'void', label: 'Void' };
    if (invoice.due_on && invoice.due_on < today()) return { key: 'overdue', label: 'Overdue' };
    return { key: 'due', label: 'Waiting' };
}
