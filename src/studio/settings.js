import { useCallback, useEffect, useState } from 'react';
import { site } from '../content.js';
import { supabase } from './supabase.js';

// Ready-made money and time setups; picking one fills those fields, which stay editable
export const presets = {
    ethiopia: { label: 'Ethiopia (ETB, 15% VAT)', currency: 'ETB', vatEnabled: true, vatRate: 15, timeZone: 'Africa/Addis_Ababa', phonePrefix: '+251' },
    international: { label: 'International (USD, no VAT)', currency: 'USD', vatEnabled: false, vatRate: 0, timeZone: 'UTC', phonePrefix: '' },
};

// Starting terms for contracts; meant to be rewritten in Settings to fit how Kidus works
export const sampleClauses = [
    'The Designer will deliver the work described in the scope above. Changes to the scope are agreed in writing and may change the fee and timeline.',
    'Two rounds of revisions are included for each deliverable. Further rounds are billed at the rates in the proposal.',
    'Work starts once this agreement is signed and the first invoice is paid.',
    'Ownership of the final approved designs passes to the Client once all invoices are paid in full. Drafts and unused concepts stay with the Designer.',
    'The Designer may show the finished work in their portfolio unless the Client asks otherwise in writing.',
    'Either party may end this agreement with written notice. The Client pays for work done up to that date.',
].join('\n\n');

export const defaultSettings = {
    business: { name: site.name, email: site.email, phone: '', address: site.location, website: site.url },
    payment: { bankName: '', accountName: site.name, accountNumber: '', tin: '' },
    money: { preset: 'ethiopia', ...presets.ethiopia, usdRate: '' },
    documents: { signatory: site.name, paymentTermsDays: 14, contractClauses: sampleClauses, invoiceNote: '' },
};

// Saved values on top of the defaults, so new fields appear without a migration
const merge = (saved) =>
    Object.fromEntries(Object.entries(defaultSettings).map(([group, fields]) => [group, { ...fields, ...saved?.[group] }]));

export function useSettings() {
    const [settings, setSettings] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        supabase
            .from('studio_settings')
            .select('data')
            .eq('id', 1)
            .maybeSingle()
            .then(({ data, error: loadError }) => {
                if (loadError) setError(loadError.message);
                setSettings(merge(data?.data));
            });
    }, []);

    const save = useCallback(async (next) => {
        const { error: saveError } = await supabase.from('studio_settings').upsert({ id: 1, data: next });
        if (saveError) throw saveError;
        setSettings(next);
    }, []);

    return { settings, error, save };
}
