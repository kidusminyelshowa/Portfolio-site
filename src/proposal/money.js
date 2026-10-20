// Shared by the price builder, the client's proposal page and the PDF, so all three show the same numbers
export const units = ['project', 'day', 'hour', 'item'];

const round = (n) => Math.round(n * 100) / 100;

export function totals({ items = [], discount_pct = 0, vat_rate = 0 }) {
    const subtotal = round(items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0));
    const discount = round((subtotal * (Number(discount_pct) || 0)) / 100);
    const vat = round(((subtotal - discount) * (Number(vat_rate) || 0)) / 100);
    return { subtotal, discount, vat, total: round(subtotal - discount + vat) };
}

// An invoice can ask for part of the proposal (a deposit, say): the share applies after discount, before VAT
export function invoiceTotals(invoice) {
    const base = totals({ ...invoice, vat_rate: 0 });
    const net = round(((base.subtotal - base.discount) * (Number(invoice.share_pct) || 100)) / 100);
    const vat = round((net * (Number(invoice.vat_rate) || 0)) / 100);
    return { subtotal: base.subtotal, discount: base.discount, net, vat, total: round(net + vat) };
}

export function formatMoney(amount, currency = 'ETB') {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);
    } catch {
        return `${currency} ${Number(amount).toFixed(2)}`;
    }
}

// The total in USD, when the proposal is in another currency and a rate is set
export function usdEstimate(proposal, total) {
    const rate = Number(proposal.usd_rate);
    if (!rate || proposal.currency?.toUpperCase() === 'USD') return null;
    return round(total / rate);
}

export const formatDate = (iso) =>
    iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const lineTotal = (item) => round((Number(item.qty) || 0) * (Number(item.price) || 0));

export const quantityLabel = (item) => {
    const qty = Number(item.qty) || 0;
    if (!item.unit || item.unit === 'project') return String(qty);
    return `${qty} ${item.unit}${qty === 1 ? '' : 's'}`;
};
