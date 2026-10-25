/* Proposal, contract and invoice PDFs, drawn as real text (not screenshots), so they are
   sharp, small and searchable. Uses jsPDF, loaded from a CDN only when someone
   downloads a document. Built-in PDF fonts only cover
   Latin letters, so other characters are swapped for close equivalents. */
import { money, dateLong, termContext, fillTerms, paymentPlan, paidSoFar, invoiceLineText, KIND_LABELS } from '/price/deal.js';
import { clientTotals, toDisplay, defaultSelection, homeCurrency, timelinePlan } from '/price/engine.js';

/* palette: the same neutrals as suite.css; the accent ("pink") and its tint follow the brand's
   accent colour (Team → Settings → Brand & region), and text on it is white or ink, whichever reads */
const C = {
  plum: [20, 20, 20], ink: [20, 20, 20], ink2: [94, 94, 90], mute: [107, 107, 102],
  pink: [242, 84, 27], pinkSoft: [254, 236, 229], onPink: [20, 20, 20], cream: [245, 245, 243], line: [234, 234, 231], ok: [21, 114, 56], white: [255, 255, 255]
};
const lum = rgb => { const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const onColour = rgb => (1.05 / (lum(rgb) + 0.05) >= (lum(rgb) + 0.05) / (lum(C.ink) + 0.05) ? C.white : C.ink);
const W = 210, H = 297, M = 18, CW = W - M * 2;
const PT = 0.3528;                       // mm per point

export const clean = s => String(s == null ? '' : s)
  .replace(/[‘’‚′`]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, '-')
  .replace(/…/g, '...').replace(/[•●○✓✔→⇄]/g, '-').replace(/[  ]/g, ' ')
  .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '');

/* jsPDF 2.5.2 from a public CDN (a second CDN if the first fails); the integrity
   hash makes the browser refuse any copy that is not exactly that release. */
const JSPDF = ['https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js', 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js'];
const JSPDF_SRI = 'sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/';
let loading = null;
function loadScript(src) {
  return new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = src; s.integrity = JSPDF_SRI; s.crossOrigin = 'anonymous';
    s.onload = () => (window.jspdf ? ok(window.jspdf.jsPDF) : bad(new Error('no jsPDF')));
    s.onerror = () => { s.remove(); bad(new Error('load failed')); };
    document.head.appendChild(s);
  });
}
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  return loading || (loading = loadScript(JSPDF[0]).catch(() => loadScript(JSPDF[1])).catch(() => {
    loading = null;
    throw new Error('Could not load the PDF maker. Check the internet connection and try again.');
  }));
}
const hexRgb = h => /^#[0-9a-f]{6}$/i.test(String(h || '')) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null;
/* the agency's own name for file names: "Studio Agreement A-001 Client.pdf" */
const fileName = (co, rest) => clean([co && co.name, rest].filter(Boolean).join(' ')).replace(/[\\/:*?"<>|]+/g, '') + '.pdf';
let logo = null, logoSrc = '';
async function logoData(src) {
  if (!src) return '';
  if (logo != null && logoSrc === src) return logo;
  logoSrc = src;
  try {
    // shrink the mark to print size first; a full-size PNG made every PDF ~800 KB
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = Math.round(96 * img.naturalHeight / img.naturalWidth);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    logo = cv.toDataURL('image/png');
  } catch (e) { logo = ''; }
  return logo;
}

/* a tiny layout helper: keeps a cursor (y) and starts a new page when needed */
class Sheet {
  constructor(jsPDF, company, docLabel) {
    this.d = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.company = company || {};
    const acc = hexRgb(this.company.accent);
    if (acc) C.pink = acc;
    C.pinkSoft = C.pink.map(v => Math.round(v * 0.14 + 255 * 0.86));
    C.onPink = onColour(C.pink);
    this.docLabel = docLabel;
    this.y = M;
  }
  font(size, style, color) { this.d.setFont('helvetica', style || 'normal'); this.d.setFontSize(size); this.d.setTextColor(...(color || C.ink)); this.size = size; return this; }
  lh(size) { return (size || this.size) * PT * 1.42; }
  room(h) { if (this.y + h > H - 22) this.page(); }
  page() {
    this.d.addPage();
    this.y = M;
    this.font(8, 'normal', C.mute);
    this.d.text(clean(this.company.name + ' · ' + this.docLabel), M, this.y, { baseline: 'top' });
    this.y += 9;
  }
  text(str, opts) {
    const o = opts || {};
    const x = o.x != null ? o.x : M, w = o.w || CW;
    this.font(o.size || 10, o.bold ? 'bold' : 'normal', o.color);
    const lines = this.d.splitTextToSize(clean(str), w);
    lines.forEach(line => {
      this.room(this.lh());
      this.d.text(line, o.align === 'right' ? x + w : x, this.y, { baseline: 'top', align: o.align || 'left' });
      this.y += this.lh();
    });
    if (o.gap) this.y += o.gap;
    return this;
  }
  rule(color, gap) { this.d.setDrawColor(...(color || C.line)); this.d.setLineWidth(0.35); this.d.line(M, this.y, W - M, this.y); this.y += gap == null ? 5 : gap; }
  heading(str, sub) {
    this.room(32);                     // keep a heading with the first lines under it
    this.y += 3;
    this.font(13, 'bold', C.plum);
    this.d.text(clean(str), M, this.y, { baseline: 'top' });
    this.y += this.lh() + 1;
    if (sub) this.text(sub, { size: 9, color: C.mute, gap: 1 });
    this.d.setDrawColor(...C.pink); this.d.setLineWidth(0.8); this.d.line(M, this.y, M + 14, this.y);
    this.y += 4;
  }
  /* letterhead: brand mark, studio name, contact details on the right */
  async letterhead(title, subtitle) {
    const d = this.d, co = this.company;
    d.setFillColor(...C.pink); d.roundedRect(M, M, 14, 14, 3.5, 3.5, 'F');
    const img = await logoData(co.logo);
    let drawn = false;
    if (img) { try { d.addImage(img, 'PNG', M + 2.5, M + 2.5, 9, 9); drawn = true; } catch (e) { /* draw the letter instead */ } }
    if (!drawn) { this.font(13, 'bold', C.onPink); d.text(clean(String(co.name || 'S').charAt(0).toUpperCase()), M + 7, M + 7, { baseline: 'middle', align: 'center' }); }
    this.font(15, 'bold', C.ink); d.text(clean(co.name || 'Studio'), M + 18, M + 2.2, { baseline: 'top' });
    this.font(8.5, 'normal', C.mute); d.text(clean(co.website || ''), M + 18, M + 9, { baseline: 'top' });
    const right = [co.address, co.phone, co.email, co.tin ? 'TIN ' + co.tin : '', co.vatNumber ? 'VAT reg. ' + co.vatNumber : ''].filter(Boolean);
    this.font(8.5, 'normal', C.ink2);
    right.forEach((t, i) => d.text(clean(t), W - M, M + i * 4.1, { baseline: 'top', align: 'right' }));
    this.y = Math.max(M + 18, M + right.length * 4.1 + 3);
    d.setFillColor(...C.pink); d.rect(M, this.y, CW, 1.2, 'F');
    this.y += 9;
    this.font(24, 'bold', C.plum); d.text(clean(title), M, this.y, { baseline: 'top' });
    this.y += this.lh(24);
    if (subtitle) this.text(subtitle, { size: 10.5, color: C.ink2 });
    this.y += 5;
  }
  /* two cards side by side: [{ title, lines: [] }] */
  cards(list) {
    const gap = 6, w = (CW - gap) / 2, pad = 4.5;
    this.font(9.5);
    const heights = list.map(c => 6.5 + c.lines.filter(Boolean).reduce((h, l) => h + this.d.splitTextToSize(clean(l), w - pad * 2).length * this.lh(9.5), 0) + pad * 1.6);
    const h = Math.max(...heights);
    this.room(h + 4);
    list.forEach((c, i) => {
      const x = M + i * (w + gap);
      this.d.setFillColor(...C.cream); this.d.roundedRect(x, this.y, w, h, 3, 3, 'F');
      this.font(8, 'bold', C.mute); this.d.text(clean(c.title).toUpperCase(), x + pad, this.y + pad, { baseline: 'top' });
      let yy = this.y + pad + 5.5;
      c.lines.filter(Boolean).forEach((l, li) => {
        this.font(9.5, li === 0 ? 'bold' : 'normal', li === 0 ? C.ink : C.ink2);
        this.d.splitTextToSize(clean(l), w - pad * 2).forEach(line => { this.d.text(line, x + pad, yy, { baseline: 'top' }); yy += this.lh(9.5); });
      });
    });
    this.y += h + 6;
  }
  /* label / value pairs in two columns */
  pairs(list) {
    const colW = CW / 2, lw = 30;
    for (let i = 0; i < list.length; i += 2) {
      const row = list.slice(i, i + 2);
      this.font(9.5);
      const h = Math.max(...row.map(([, v]) => this.d.splitTextToSize(clean(v || '-'), colW - lw - 4).length)) * this.lh(9.5) + 1.6;
      this.room(h);
      row.forEach(([k, v], j) => {
        const x = M + j * colW;
        this.font(8.5, 'normal', C.mute); this.d.text(clean(k), x, this.y + 0.4, { baseline: 'top' });
        this.font(9.5, 'normal', C.ink);
        this.d.splitTextToSize(clean(v || '-'), colW - lw - 4).forEach((line, li) => this.d.text(line, x + lw, this.y + li * this.lh(9.5), { baseline: 'top' }));
      });
      this.y += h;
    }
    this.y += 3;
  }
  /* a simple table: cols = [{ label, w, align }], rows = [[...]], opts.bold = index set of bold rows */
  table(cols, rows, opts) {
    const o = opts || {};
    const pad = 2.6;
    const head = () => {
      this.room(9);
      this.d.setFillColor(...C.pinkSoft); this.d.rect(M, this.y, CW, 7.5, 'F');
      let x = M;
      this.font(8.5, 'bold', C.ink);
      cols.forEach(c => { this.d.text(clean(c.label), c.align === 'right' ? x + c.w - pad : x + pad, this.y + 2.2, { baseline: 'top', align: c.align || 'left' }); x += c.w; });
      this.y += 7.5;
    };
    head();
    rows.forEach((r, ri) => {
      const strong = o.bold && o.bold.includes(ri);
      this.font(9.5, strong ? 'bold' : 'normal');
      const cells = r.map((v, i) => this.d.splitTextToSize(clean(v), cols[i].w - pad * 2));
      const h = Math.max(...cells.map(c => c.length)) * this.lh(9.5) + pad * 1.6;
      if (this.y + h > H - 22) { this.page(); head(); }
      let x = M;
      cells.forEach((lines, i) => {
        const c = cols[i];
        this.font(9.5, strong ? 'bold' : 'normal', i === 0 || strong ? C.ink : C.ink2);
        lines.forEach((line, li) => this.d.text(line, c.align === 'right' ? x + c.w - pad : x + pad, this.y + pad * 0.8 + li * this.lh(9.5), { baseline: 'top', align: c.align || 'left' }));
        x += c.w;
      });
      this.y += h;
      this.d.setDrawColor(...C.line); this.d.setLineWidth(0.25); this.d.line(M, this.y, W - M, this.y);
    });
    this.y += 5;
  }
  /* a row of totals on the right: [label, value, strong] */
  totals(list) {
    const x = M + CW * 0.45, w = CW * 0.55;
    list.forEach(([k, v, strong]) => {
      this.room(10);
      if (strong) { this.d.setFillColor(...C.plum); this.d.roundedRect(x, this.y - 1, w, 9.5, 2.5, 2.5, 'F'); }
      this.font(strong ? 11.5 : 9.5, strong ? 'bold' : 'normal', strong ? C.white : C.ink2);
      this.d.text(clean(k), x + 4, this.y + (strong ? 1.4 : 0.6), { baseline: 'top' });
      this.d.text(clean(v), x + w - 4, this.y + (strong ? 1.4 : 0.6), { baseline: 'top', align: 'right' });
      this.y += strong ? 11 : 6.5;
    });
    this.y += 3;
  }
  signatures(blocks) {
    this.room(52);
    const gap = 10, w = (CW - gap) / 2;
    const top = this.y;
    blocks.forEach((b, i) => {
      const x = M + i * (w + gap);
      let yy = top;
      this.font(8, 'bold', C.mute); this.d.text(clean(b.title).toUpperCase(), x, yy, { baseline: 'top' }); yy += 7;
      [['Name', b.name], ['Title', b.role], ['Signature', ''], ['Date', '']].forEach(([k, v]) => {
        this.font(8.5, 'normal', C.mute); this.d.text(k, x, yy + 3.2, { baseline: 'top' });
        this.font(10, 'normal', C.ink); if (v) this.d.text(clean(v), x + 22, yy + 2.6, { baseline: 'top' });
        this.d.setDrawColor(...C.ink2); this.d.setLineWidth(0.25); this.d.line(x + 21, yy + 8, x + w, yy + 8);
        yy += k === 'Signature' ? 13 : 9.5;
      });
    });
    this.y = top + 50;
  }
  stamp(text, color) {
    const d = this.d;
    d.setDrawColor(...color); d.setLineWidth(0.9);
    this.font(16, 'bold', color);
    const w = d.getTextWidth(text) + 10;
    d.roundedRect(W - M - w, M + 34, w, 11, 2, 2, 'S');
    d.text(text, W - M - w / 2, M + 36.6, { baseline: 'top', align: 'center' });
  }
  finish(filename) {
    const n = this.d.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      this.d.setPage(i);
      this.font(7.5, 'normal', C.mute);
      this.d.text(clean([this.company.name, this.company.website, this.docLabel].filter(Boolean).join('  ·  ')), M, H - 11, { baseline: 'top' });
      this.d.text('Page ' + i + ' of ' + n, W - M, H - 11, { baseline: 'top', align: 'right' });
    }
    this.d.save(clean(filename).replace(/[^\w.-]+/g, '-'));
  }
}

const clientLines = c => [c.clientName, c.clientRep ? 'Attn: ' + c.clientRep + (c.clientTitle ? ', ' + c.clientTitle : '') : '',
  c.clientAddress, c.clientTin ? 'TIN ' + c.clientTin : '', c.clientEmail, c.clientPhone];
const studioLines = co => [co.name, co.address, co.tin ? 'TIN ' + co.tin : '', co.vatNumber ? 'VAT reg. ' + co.vatNumber : '', co.email, co.secondaryEmail ? 'Also: ' + co.secondaryEmail : '', co.phone];

/* ================= contract ================= */
export async function contractPdf(q, company) {
  const jsPDF = await loadJsPdf();
  const c = q.deal.contract, a = c.amounts, s = q.setup || {};
  const ctx = termContext(q, c, company);
  const m = n => money(n, a.currency);
  const doc = new Sheet(jsPDF, company, 'Agreement ' + c.number);
  await doc.letterhead('Service agreement', (s.project || s.typeLabel || 'Project') + '  ·  ' + c.number + '  ·  ' + dateLong(c.date));

  doc.cards([{ title: 'The studio', lines: studioLines(company) }, { title: 'The client', lines: clientLines(c) }]);
  doc.text('This agreement is between ' + ctx.studio + ' ("the studio") and ' + ctx.client + ' ("the client") for the project described below.', { size: 10, color: C.ink2, gap: 3 });

  doc.heading('The project');
  const choice = id => ((a.choices || []).find(x => x.id === id) || {}).label;
  doc.pairs([
    ['Project', s.project || '-'], ['Type', s.typeLabel || '-'],
    ['Start date', dateLong(c.startDate)], ['Delivery', (a.timeline.label || '-') + (a.timeline.days ? ', ' + a.timeline.days + ' days' : '')],
    ['Revisions', choice('revisions') || '-'], ['Team', choice('team') || '-']
  ]);

  doc.heading('Fees and payment', a.currency === 'USD' ? 'Amounts in US dollars (1 USD = ' + a.rate + ' ' + homeCurrency() + ', as agreed).' : 'Amounts in ' + homeCurrency() + '.');
  doc.totals([
    ['Project fee', m(a.subtotal)],
    ...(a.vatOn ? [['VAT ' + a.vatPct + '%', m(a.vat)]] : []),
    ['Total', m(a.total), true]
  ]);
  const plan = paymentPlan(a, c.depositPct);
  doc.table([{ label: 'Payment', w: CW * 0.42 }, { label: 'When', w: CW * 0.33 }, { label: 'Amount', w: CW * 0.25, align: 'right' }],
    plan.map(p => [KIND_LABELS[p.kind] + ' (' + p.pct + '%)', p.kind === 'balance' ? 'On delivery of the final work' : 'On signing', m(p.total)]));

  doc.heading('Terms');
  (c.terms || []).forEach((t, i) => {
    doc.room(16);
    doc.text((i + 1) + '.  ' + fillTerms(t.title, ctx), { size: 10.5, bold: true, gap: 0.6 });
    doc.text(fillTerms(t.body, ctx), { size: 9.8, color: C.ink2, gap: 3.2, x: M + 6, w: CW - 6 });
  });
  if (c.notes) { doc.heading('Additional notes'); doc.text(fillTerms(c.notes, ctx), { size: 9.8, color: C.ink2, gap: 2 }); }

  doc.heading('Schedule A: scope of work', 'What ' + ctx.studio + ' will deliver. Anything else is quoted separately.');
  let cat = null;
  a.scope.forEach(it => {
    if (it.category !== cat) { cat = it.category; doc.room(14); doc.y += 1.5; doc.text(cat, { size: 10, bold: true, color: C.plum, gap: 0.8 }); }
    doc.text('-  ' + it.title + (it.qty > 1 ? ' x ' + it.qty + (it.unit ? ' ' + it.unit : '') : ''), { size: 9.8, x: M + 3, w: CW - 3 });
    if (it.desc) doc.text(it.desc, { size: 8.8, color: C.mute, x: M + 7, w: CW - 7, gap: 0.6 });
  });

  doc.y += 6;
  doc.heading('Signatures', 'Signed by both parties, this agreement and Schedule A take effect from the date of the last signature.');
  doc.signatures([
    { title: 'For ' + ctx.studio, name: company.signatory || '', role: company.signatoryTitle || '' },
    { title: 'For ' + ctx.client, name: c.clientRep || '', role: c.clientTitle || '' }
  ]);
  doc.finish(fileName(company, c.number + ' ' + (c.clientName || 'agreement')));
}

/* ================= invoice ================= */
export async function invoicePdf(q, inv, company) {
  const jsPDF = await loadJsPdf();
  const c = q.deal.contract, s = q.setup || {};
  const m = n => money(n, inv.currency);
  const doc = new Sheet(jsPDF, company, 'Invoice ' + inv.number);
  await doc.letterhead('Invoice', inv.number + '  ·  ' + dateLong(inv.date));
  if (inv.status === 'paid') doc.stamp('PAID', C.ok);
  if (inv.status === 'void') doc.stamp('CANCELLED', C.mute);

  const billTo = inv.billTo && inv.billTo.trim() ? inv.billTo.split('\n') : clientLines(c);
  doc.cards([{ title: 'Bill to', lines: billTo }, { title: 'From', lines: studioLines(company) }]);
  doc.pairs([
    ['Invoice no.', inv.number], ['Invoice date', dateLong(inv.date)],
    ['Contract', inv.contractNumber || c.number], ['Payment due', dateLong(inv.dueDate)],
    ['Project', s.project || s.typeLabel || '-']
  ]);

  const lines = (inv.lines && inv.lines.length) ? inv.lines
    : [{ text: invoiceLineText(inv.kind, inv.pct, s.project, inv.contractNumber || c.number), amount: inv.subtotal }];
  doc.table([{ label: 'Description', w: CW * 0.72 }, { label: 'Amount', w: CW * 0.28, align: 'right' }],
    lines.map(l => [l.text, m(l.amount)]));
  doc.totals([
    ['Subtotal', m(inv.subtotal)],
    ...(inv.vatOn ? [['VAT ' + inv.vatPct + '%', m(inv.vat)]] : []),
    [inv.status === 'paid' ? 'Total paid' : 'Total due', m(inv.total), true]
  ]);

  const all = (q.deal.invoices || []).filter(i => i.status !== 'void');
  const before = all.filter(i => i.number !== inv.number && i.status === 'paid' && String(i.createdAt) < String(inv.createdAt));
  const paidBefore = paidSoFar(before, inv.currency);
  const contractTotal = c.amounts.total;
  doc.heading('Payment summary');
  doc.pairs([
    ['Agreement total', m(contractTotal)], ['Paid before', m(paidBefore)],
    ['This invoice', m(inv.total)], ['Left after this', m(Math.max(0, contractTotal - paidBefore - inv.total))]
  ]);
  if (inv.currency === 'USD') doc.text('Amounts in US dollars. Exchange rate in the agreement: 1 USD = ' + inv.rate + ' ' + homeCurrency() + '.', { size: 8.8, color: C.mute, gap: 2 });

  const bank = inv.bank != null && String(inv.bank).trim() ? inv.bank : company.bank;
  if (bank) { doc.heading('How to pay'); doc.text(bank, { size: 10, gap: 2 }); }
  if (inv.note) doc.text(inv.note, { size: 9.5, color: C.ink2, gap: 2 });
  doc.finish(fileName(company, inv.number + ' ' + (c.clientName || '')));
}

/* ================= proposal (the client link as a PDF, for people who ask for one) =================
   Drawn from the published snapshot, so it shows exactly what the client link shows by default. */
/* each service's steps on a week grid, like the client page; service colours are tints of the brand accent */
function timelineChart(doc, plan) {
  if (!plan.services.length) return;
  const d = doc.d, weeks = Math.max(1, Math.ceil(plan.total / 5)), span = weeks * 5;
  const LW = 44, TX = M + LW, TW = CW - LW, ROW = 5.6, PAD = 3;
  const tint = k => C.pink.map(v => Math.round(v * k + 255 * (1 - k)));
  const tints = [tint(0.55), tint(0.32), tint(0.75), tint(0.2)];
  const REV = [255, 225, 90];
  doc.heading('Project timeline', plan.total + ' working days, about ' + weeks + ' week' + (weeks === 1 ? '' : 's') + '. Yellow steps are your reviews.');
  doc.room(8);
  doc.font(7.5, 'normal', C.ink2);
  for (let w = 0; w < weeks; w++) d.text('Wk ' + (w + 1), TX + w * TW / weeks + 1, doc.y, { baseline: 'top' });
  doc.y += 5;
  plan.services.forEach((sv, n) => {
    const h = sv.phases.length * ROW + PAD * 2;
    doc.room(h + 3);
    const y0 = doc.y, col = tints[n % tints.length];
    d.setFillColor(...col); d.roundedRect(M, y0, LW, h, 2.5, 2.5, 'F');
    d.setFillColor(...C.cream); d.rect(TX, y0, TW, h, 'F');
    d.setDrawColor(...C.line); d.setLineWidth(0.2);
    for (let w = 1; w < weeks; w++) d.line(TX + w * TW / weeks, y0, TX + w * TW / weeks, y0 + h);
    const on = onColour(col);
    doc.font(9.5, 'bold', on);
    d.text(d.splitTextToSize(clean(sv.title), LW - 6), M + 3, y0 + 4, { baseline: 'top' });
    doc.font(7.5, 'normal', on);
    d.text(sv.days + ' working days', M + 3, y0 + h - 3, { baseline: 'bottom' });
    sv.phases.forEach((ph, i) => {
      const x = TX + ph.start / span * TW, bw = Math.max(1.2, (ph.end - ph.start) / span * TW), y = y0 + PAD + i * ROW + 0.8;
      d.setFillColor(...(ph.review ? REV : col));
      if (ph.review) { d.setDrawColor(110, 100, 60); d.setLineWidth(0.25); }
      d.roundedRect(x, y, bw, ROW - 1.6, 1, 1, ph.review ? 'FD' : 'F');
      doc.font(6.8, 'normal', C.ink);
      const label = clean(ph.label), right = (x + bw) > TX + TW * 0.7;
      d.text(label, right ? x - 1.2 : x + bw + 1.2, y + (ROW - 1.6) / 2, { baseline: 'middle', align: right ? 'right' : 'left' });
    });
    doc.y = y0 + h + 3;
  });
  doc.y += 2;
}

export async function proposalPdf(p, company, link) {
  const jsPDF = await loadJsPdf();
  const cur = p.currency || 'ETB';
  const sel = defaultSelection(p);
  const t = clientTotals(p, sel);
  const m = n => money(toDisplay(p, n, cur), cur);
  const doc = new Sheet(jsPDF, company, 'Proposal');
  await doc.letterhead('Proposal', [p.project || p.projectType, 'prepared ' + dateLong(p.preparedAt)].filter(Boolean).join('  ·  '));
  doc.cards([{ title: 'Prepared for', lines: [p.company || p.client, p.company && p.client ? 'Attn: ' + p.client : ''] }, { title: 'From', lines: studioLines(company) }]);
  if (p.intro) doc.text(p.intro, { size: 10.5, color: C.ink2, gap: 3 });

  const qtyText = it => it.qty > 1 ? it.qty + (it.unit ? ' ' + it.unit : '') : (it.unit ? '1 ' + it.unit.replace(/s$/, '') : '1');
  const cols = [{ label: 'Deliverable', w: CW * 0.6 }, { label: 'Qty', w: CW * 0.16 }, { label: 'Price', w: CW * 0.24, align: 'right' }];
  const extras = [];
  p.categories.forEach(c => {
    const inScope = c.items.filter(it => it.locked || it.on);
    c.items.filter(it => !it.locked && !it.on).forEach(it => extras.push(it));
    if (!inScope.length) return;
    doc.heading(c.title);
    doc.table(cols, inScope.map(it => [it.title + (it.desc ? '\n' + it.desc : ''), qtyText(it), m(it.unitPrice * it.qty)]));
  });
  if (extras.length) {
    doc.heading('Optional add-ons', 'Not in the total above. Ask us to add any of them.');
    doc.table(cols, extras.map(it => [it.title + (it.desc ? '\n' + it.desc : ''), qtyText(it), '+ ' + m(it.unitPrice * it.qty)]));
  }
  const picks = t.picks.map(x => [x.title, x.option.label + (x.id === 'timeline' && t.days ? ', ' + t.days + ' days' : '') + (x.option.desc ? ' (' + x.option.desc + ')' : '')]);
  if (picks.length) { doc.heading('How we work'); doc.pairs(picks); }
  timelineChart(doc, timelinePlan(p, sel));
  if ((p.costs || []).length) {
    doc.heading('Also included');
    doc.table([{ label: 'Item', w: CW * 0.76 }, { label: 'Amount', w: CW * 0.24, align: 'right' }], p.costs.map(c => [c.title, m(c.amount)]));
  }

  doc.heading('Total');
  doc.totals([
    ['Deliverables and options', m(t.original)],
    ...(t.goodwillOn ? [['Goodwill discount ' + p.goodwill.pct + '%', '- ' + m(t.goodwill)]] : []),
    ...(t.usd ? [['Paying in USD ' + p.usd.pct + '% discount', '- ' + m(t.usdDiscount)]] : []),
    ...(t.vatOn && (t.goodwillOn || t.usd) ? [['Subtotal', m(t.subtotal)]] : []),
    ...(t.vatOn ? [['VAT ' + t.vatPct + '%', m(t.vat)]] : []),
    ['Total' + (t.vatOn ? ' incl. VAT' : ''), cur === 'USD' && t.usdAmount != null ? money(t.usdAmount, 'USD') : money(t.etb, 'ETB'), true]
  ]);
  if (cur === 'USD' && p.usd.rate) doc.text('Amounts in US dollars at 1 USD = ' + p.usd.rate + ' ' + homeCurrency() + '.', { size: 8.8, color: C.mute, gap: 2 });
  doc.text('Valid until ' + dateLong(p.expiresAt) + '.' + (link ? ' The interactive version, where you can change the scope and send your choice: ' + link : ''), { size: 9.5, color: C.ink2, gap: 2 });
  if (company.email) doc.text('Questions: ' + company.email + (company.phone ? ' · ' + company.phone : ''), { size: 9.5, color: C.ink2 });
  doc.finish(fileName(company, 'proposal ' + (p.company || p.client || '')));
}
