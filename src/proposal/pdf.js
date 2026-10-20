import { formatDate, formatMoney, lineTotal, quantityLabel, totals, usdEstimate } from './money.js';

const INK = [14, 14, 14];
const SOFT = [75, 90, 99];
const BLUE = [42, 109, 151];
const LINE = [200, 208, 212];

// A4 proposal PDF drawn with jsPDF, loaded only when someone asks for it.
// Its built-in Helvetica covers Latin text only, so Ethiopic characters won't show in the PDF.
export async function downloadProposalPdf(proposal) {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 56;
    const right = width - margin;
    let y = margin;

    const ensure = (space) => {
        if (y + space > height - margin) {
            doc.addPage();
            y = margin;
        }
    };
    const text = (value, x, options = {}) => doc.text(String(value ?? ''), x, y, options);
    const paragraph = (value, size = 10, color = INK, maxWidth = right - margin) => {
        if (!value) return;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(size);
        doc.setTextColor(...color);
        doc.splitTextToSize(String(value), maxWidth).forEach((line) => {
            ensure(size * 1.5);
            text(line, margin);
            y += size * 1.45;
        });
    };
    const rule = (color = INK, weight = 1) => {
        doc.setDrawColor(...color);
        doc.setLineWidth(weight);
        doc.line(margin, y, right, y);
    };

    const business = proposal.business ?? {};
    const details = business.business ?? {};
    const sums = totals(proposal);

    // Header: who it's from, then the title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    text(details.name || 'Proposal', margin);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SOFT);
    [details.email, details.phone, details.website].filter(Boolean).forEach((line, i) => doc.text(line, right, y + i * 12, { align: 'right' }));
    y += 56;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...INK);
    doc.splitTextToSize(proposal.title || 'Proposal', right - margin).forEach((line) => {
        text(line, margin);
        y += 32;
    });
    y += 4;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SOFT);
    const preparedFor = [proposal.client_name, proposal.client_company].filter(Boolean).join(', ');
    if (preparedFor) {
        text(`Prepared for ${preparedFor}`, margin);
        y += 14;
    }
    text([proposal.sent_at && `Sent ${formatDate(proposal.sent_at)}`, proposal.valid_until && `Valid until ${formatDate(proposal.valid_until)}`].filter(Boolean).join('  ·  '), margin);
    y += 28;

    if (proposal.intro) {
        paragraph(proposal.intro, 11);
        y += 16;
    }

    // Line items
    const qtyX = right - 210;
    const priceX = right - 105;
    const labelX = right - 230;
    ensure(40);
    rule(INK, 1.5);
    y += 16;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...SOFT);
    text('ITEM', margin);
    text('QTY', qtyX, { align: 'right' });
    text('PRICE', priceX, { align: 'right' });
    text('AMOUNT', right, { align: 'right' });
    y += 10;

    (proposal.items ?? []).forEach((item) => {
        const descriptionLines = item.description ? doc.splitTextToSize(item.description, qtyX - margin - 70) : [];
        ensure(30 + descriptionLines.length * 12);
        y += 4;
        rule(LINE, 0.75);
        y += 16;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...INK);
        text(item.name, margin);
        doc.setFont('helvetica', 'normal');
        text(quantityLabel(item), qtyX, { align: 'right' });
        text(formatMoney(Number(item.price) || 0, proposal.currency), priceX, { align: 'right' });
        text(formatMoney(lineTotal(item), proposal.currency), right, { align: 'right' });
        doc.setFontSize(9);
        doc.setTextColor(...SOFT);
        descriptionLines.forEach((line) => {
            y += 12;
            text(line, margin);
        });
        y += 6;
    });

    // Totals
    ensure(110);
    y += 6;
    rule(INK, 1.5);
    y += 20;
    const totalRow = (label, value, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(bold ? 13 : 10);
        doc.setTextColor(...(bold ? INK : SOFT));
        text(label, labelX);
        doc.setTextColor(...INK);
        text(value, right, { align: 'right' });
        y += bold ? 20 : 15;
    };
    totalRow('Subtotal', formatMoney(sums.subtotal, proposal.currency));
    if (sums.discount) totalRow(`Discount (${Number(proposal.discount_pct)}%)`, `- ${formatMoney(sums.discount, proposal.currency)}`);
    if (Number(proposal.vat_rate)) totalRow(`VAT (${Number(proposal.vat_rate)}%)`, formatMoney(sums.vat, proposal.currency));
    y += 4;
    totalRow('Total', formatMoney(sums.total, proposal.currency), true);
    const usd = usdEstimate(proposal, sums.total);
    if (usd) totalRow('About', formatMoney(usd, 'USD'));

    // Status and sign-off
    y += 20;
    if (proposal.status === 'accepted' && proposal.responded_at) {
        ensure(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BLUE);
        text(`Accepted by the client on ${formatDate(proposal.responded_at)}`, margin);
        y += 20;
    }
    const payment = business.payment ?? {};
    if (payment.tin) paragraph(`TIN ${payment.tin}`, 9, SOFT);
    if (details.address) paragraph(details.address, 9, SOFT);

    const fileName = `${(proposal.title || 'proposal').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'proposal'}.pdf`;
    doc.save(fileName);
}
