import { useCallback, useEffect, useState } from 'react';
import { site } from '../content.js';
import { supabase } from './supabase.js';

// Ready-made money and time setups; picking one fills those fields, which stay editable
export const presets = {
    ethiopia: { label: 'Ethiopia (ETB, 15% VAT)', currency: 'ETB', vatEnabled: true, vatRate: 15, timeZone: 'Africa/Addis_Ababa', phonePrefix: '+251' },
    international: { label: 'International (USD, no VAT)', currency: 'USD', vatEnabled: false, vatRate: 0, timeZone: 'UTC', phonePrefix: '' },
};

export const defaultSettings = {
    business: { name: site.name, email: site.email, phone: '', address: site.location, website: site.url },
    payment: { bankName: '', accountName: site.name, accountNumber: '', tin: '' },
    money: { preset: 'ethiopia', ...presets.ethiopia, usdRate: '' },
    documents: { signatory: site.name, paymentTermsDays: 14, contractClauses: '', invoiceNote: '' },
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
