import { formatDate, formatMoney, invoiceTotals, lineTotal, quantityLabel, totals, usdEstimate } from './money.js';

const INK = [14, 14, 14];
const SOFT = [75, 90, 99];
const BLUE = [42, 109, 151];
const LINE = [200, 208, 212];

const fileName = (title, fallback) => `${(title || fallback).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || fallback}.pdf`;

// A4 documents drawn with jsPDF, loaded only when someone asks for one.
// Its built-in Helvetica covers Latin text only, so Ethiopic characters won't show in the PDFs.
async function createWriter() {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 56;
    const right = width - margin;
    const qtyX = right - 210;
    const priceX = right - 105;
    const labelX = right - 230;
    const w = { doc, margin, right, y: margin };

    const font = (style, size, color) => {
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        doc.setTextColor(...color);
    };
    w.ensure = (space) => {
        if (w.y + space > height - margin) {
            doc.addPage();
            w.y = margin;
        }
    };
    w.text = (value, x, options = {}) => doc.text(String(value ?? ''), x, w.y, options);
    w.gap = (space) => {
        w.y += space;
    };
    w.paragraph = (value, size = 10, color = INK, style = 'normal') => {
        if (!value) return;
        font(style, size, color);
        doc.splitTextToSize(String(value), right - margin).forEach((line) => {
            w.ensure(size * 1.5);
            w.text(line, margin);
            w.y += size * 1.45;
        });
    };
    w.rule = (color = INK, weight = 1) => {
        doc.setDrawColor(...color);
        doc.setLineWidth(weight);
        doc.line(margin, w.y, right, w.y);
    };

    // Who it's from on the left, how to reach them on the right, then a big title and meta lines
    w.header = (details, title, metaLines) => {
        font('bold', 12, INK);
        w.text(details.name || '', margin);
        font('normal', 9, SOFT);
        [details.email, details.phone, details.website].filter(Boolean).forEach((line, i) => doc.text(line, right, w.y + i * 12, { align: 'right' }));
        w.y += 56;
        font('bold', 28, INK);
        doc.splitTextToSize(title, right - margin).forEach((line) => {
            w.text(line, margin);
            w.y += 32;
        });
        w.y += 4;
        font('normal', 10, SOFT);
        metaLines.filter(Boolean).forEach((line) => {
            w.text(line, margin);
            w.y += 14;
        });
        w.y += 14;
    };

    w.heading = (value) => {
        w.ensure(40);
        w.y += 8;
        font('bold', 9, SOFT);
        w.text(value.toUpperCase(), margin);
        w.y += 16;
    };

    w.items = (items, currency) => {
        w.ensure(40);
        w.rule(INK, 1.5);
        w.y += 16;
        font('bold', 8, SOFT);
        w.text('ITEM', margin);
        w.text('QTY', qtyX, { align: 'right' });
        w.text('PRICE', priceX, { align: 'right' });
        w.text('AMOUNT', right, { align: 'right' });
        w.y += 10;
        (items ?? []).forEach((item) => {
            const descriptionLines = item.description ? doc.splitTextToSize(item.description, qtyX - margin - 70) : [];
            w.ensure(30 + descriptionLines.length * 12);
            w.y += 4;
            w.rule(LINE, 0.75);
            w.y += 16;
            font('bold', 10, INK);
            w.text(item.name, margin);
            doc.setFont('helvetica', 'normal');
            w.text(quantityLabel(item), qtyX, { align: 'right' });
            w.text(formatMoney(Number(item.price) || 0, currency), priceX, { align: 'right' });
            w.text(formatMoney(lineTotal(item), currency), right, { align: 'right' });
            font('normal', 9, SOFT);
            descriptionLines.forEach((line) => {
                w.y += 12;
                w.text(line, margin);
            });
            w.y += 6;
        });
        w.ensure(110);
        w.y += 6;
        w.rule(INK, 1.5);
        w.y += 20;
    };

    w.totalRow = (label, value, bold = false) => {
        font(bold ? 'bold' : 'normal', bold ? 13 : 10, bold ? INK : SOFT);
        w.text(label, labelX);
        doc.setTextColor(...INK);
        w.text(value, right, { align: 'right' });
        w.y += bold ? 20 : 15;
    };

    w.note = (value, color = BLUE) => {
        w.ensure(20);
        font('bold', 10, color);
        w.text(value, margin);
        w.y += 20;
    };

    w.save = (name) => doc.save(name);
    return w;
}

const clientLine = (client) => [client.client_name ?? client.name, client.client_company ?? client.company].filter(Boolean).join(', ');

export async function downloadProposalPdf(proposal) {
    const w = await createWriter();
    const business = proposal.business ?? {};
    const details = business.business ?? {};
    const sums = totals(proposal);
    const preparedFor = clientLine(proposal);

    w.header(details, proposal.title || 'Proposal', [
        preparedFor && `Prepared for ${preparedFor}`,
        [proposal.sent_at && `Sent ${formatDate(proposal.sent_at)}`, proposal.valid_until && `Valid until ${formatDate(proposal.valid_until)}`].filter(Boolean).join('  ·  '),
    ]);
    if (proposal.intro) {
        w.paragraph(proposal.intro, 11);
        w.gap(16);
    }
    w.items(proposal.items, proposal.currency);
    w.totalRow('Subtotal', formatMoney(sums.subtotal, proposal.currency));
    if (sums.discount) w.totalRow(`Discount (${Number(proposal.discount_pct)}%)`, `- ${formatMoney(sums.discount, proposal.currency)}`);
    if (Number(proposal.vat_rate)) w.totalRow(`VAT (${Number(proposal.vat_rate)}%)`, formatMoney(sums.vat, proposal.currency));
    w.gap(4);
    w.totalRow('Total', formatMoney(sums.total, proposal.currency), true);
    const usd = usdEstimate(proposal, sums.total);
    if (usd) w.totalRow('About', formatMoney(usd, 'USD'));

    w.gap(20);
    if (proposal.status === 'accepted' && proposal.responded_at) w.note(`Accepted by the client on ${formatDate(proposal.responded_at)}`);
    if (business.payment?.tin) w.paragraph(`TIN ${business.payment.tin}`, 9, SOFT);
    if (details.address) w.paragraph(details.address, 9, SOFT);
    w.save(fileName(proposal.title, 'proposal'));
}

// The agreement: parties, scope from the proposal, fee, the clauses from Settings and two signature lines
export async function downloadContractPdf(contract, proposal) {
    const w = await createWriter();
    const business = proposal.business ?? {};
    const details = business.business ?? {};
    const documents = business.documents ?? {};
    const sums = totals(proposal);

    w.header(details, 'Service agreement', [`Agreement ${contract.number}`, `Based on "${proposal.title}"`, contract.signed_on && `Signed ${formatDate(contract.signed_on)}`]);

    w.heading('Between');
    w.paragraph([details.name, details.address, business.payment?.tin && `TIN ${business.payment.tin}`].filter(Boolean).join(', '), 10, INK, 'bold');
    w.paragraph('("the Designer")', 9, SOFT);
    w.gap(6);
    w.paragraph(clientLine(proposal) || 'The client', 10, INK, 'bold');
    w.paragraph('("the Client")', 9, SOFT);

    w.heading('Scope of work');
    (proposal.items ?? []).forEach((item) => w.paragraph(`•  ${item.name} (${quantityLabel(item)})${item.description ? `: ${item.description}` : ''}`));

    w.heading('Fee');
    w.paragraph(
        `${formatMoney(sums.total, proposal.currency)} in total${Number(proposal.vat_rate) ? `, including ${Number(proposal.vat_rate)}% VAT` : ''}. ` +
            `Invoices are due within ${Number(documents.paymentTermsDays) || 14} days of their date.`,
    );

    const clauses = (contract.clauses ?? '').split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
    if (clauses.length) {
        w.heading('Terms');
        clauses.forEach((clause, i) => {
            w.paragraph(`${i + 1}.  ${clause}`);
            w.gap(4);
        });
    }

    // Signature blocks side by side
    w.ensure(110);
    w.gap(40);
    const half = (w.right - w.margin) / 2;
    const signature = (x, who, name) => {
        w.doc.setDrawColor(...INK);
        w.doc.setLineWidth(0.75);
        w.doc.line(x, w.y, x + half - 30, w.y);
        w.doc.setFont('helvetica', 'normal');
        w.doc.setFontSize(9);
        w.doc.setTextColor(...SOFT);
        w.doc.text(`${who}${name ? `: ${name}` : ''}`, x, w.y + 14);
        w.doc.text('Date:', x, w.y + 30);
    };
    signature(w.margin, 'For the Designer', documents.signatory || details.name);
    signature(w.margin + half, 'For the Client', proposal.client_name);
    w.save(fileName(`agreement-${contract.number}`, 'agreement'));
}

export async function downloadInvoicePdf(invoice) {
    const w = await createWriter();
    const business = invoice.business ?? {};
    const details = business.business ?? {};
    const payment = business.payment ?? {};
    const sums = invoiceTotals(invoice);
    const currency = invoice.currency;
    const isPart = Number(invoice.share_pct) < 100;

    w.header(details, `Invoice ${invoice.number}`, [
        `Issued ${formatDate(invoice.issued_on)}${invoice.due_on ? `  ·  Due ${formatDate(invoice.due_on)}` : ''}`,
        invoice.label,
    ]);

    w.heading('Bill to');
    w.paragraph(clientLine(invoice.client ?? {}) || 'Client', 10, INK, 'bold');
    if (invoice.client?.client_email) w.paragraph(invoice.client.client_email, 9, SOFT);
    w.gap(10);

    w.items(invoice.items, currency);
    w.totalRow('Subtotal', formatMoney(sums.subtotal, currency));
    if (sums.discount) w.totalRow(`Discount (${Number(invoice.discount_pct)}%)`, `- ${formatMoney(sums.discount, currency)}`);
    if (isPart) w.totalRow(`This invoice: ${Number(invoice.share_pct)}%`, formatMoney(sums.net, currency));
    if (Number(invoice.vat_rate)) w.totalRow(`VAT (${Number(invoice.vat_rate)}%)`, formatMoney(sums.vat, currency));
    w.gap(4);
    w.totalRow('Amount due', formatMoney(sums.total, currency), true);

    w.gap(16);
    if (invoice.status === 'paid') w.note(`Paid${invoice.paid_on ? ` on ${formatDate(invoice.paid_on)}` : ''}. Thank you.`);
    const bank = [payment.bankName && `Bank: ${payment.bankName}`, payment.accountName && `Account name: ${payment.accountName}`, payment.accountNumber && `Account number: ${payment.accountNumber}`];
    if (bank.some(Boolean)) {
        w.heading('How to pay');
        bank.filter(Boolean).forEach((line) => w.paragraph(line));
    }
    if (payment.tin) w.paragraph(`TIN ${payment.tin}`, 9, SOFT);
    if (business.documents?.invoiceNote) {
        w.gap(10);
        w.paragraph(business.documents.invoiceNote, 9, SOFT);
    }
    w.save(fileName(`invoice-${invoice.number}`, 'invoice'));
}
