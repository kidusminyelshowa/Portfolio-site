/* Proposal, contract and invoice PDFs, drawn as real text (not screenshots), so they are
   sharp, small and searchable. Uses jsPDF, loaded from a CDN only when someone
   downloads a document.

   One visual system for every document: the portfolio's paper background, Figtree (the
   site's typeface, embedded from /price/fonts), big heavy titles, and each service as a
   rounded colour block with its price on a pill, the way a printed pricing sheet reads.
   The colours are the site's (mist, blue, navy, paper grey); the blue and the mist follow
   the brand colours in Team → Settings → Brand & region. No logo or portrait is printed.
   If the font files cannot be fetched, the built-in Helvetica is used and characters it
   cannot draw are swapped for close equivalents. */
import { money, dateLong, termContext, fillTerms, paymentPlan, paidSoFar, invoiceLineText, KIND_LABELS } from '/price/deal.js';
import { clientTotals, toDisplay, defaultSelection, homeCurrency, timelinePlan } from '/price/engine.js';

/* the portfolio's colours (src/styles/style.css and suite.css) */
const C = {
  paper: [238, 241, 242], card: [248, 250, 250], soft: [226, 232, 235], soft2: [215, 223, 227], line: [203, 211, 215],
  ink: [14, 14, 14], ink2: [75, 90, 99], mute: [86, 99, 107], navy: [26, 54, 71], white: [255, 255, 255],
  accent: [59, 132, 177], highlight: [201, 221, 233], ok: [21, 114, 56], review: [246, 196, 69]
};
const lum = rgb => { const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/* text for a colour block: navy, then ink, then white, the first that reads (4.5:1) */
const textFor = fill => [C.navy, C.ink, C.white].find(t => contrast(t, fill) >= 4.5) || (contrast(C.white, fill) > contrast(C.ink, fill) ? C.white : C.ink);
/* a block's colours: the fill, its text, and a pill in the text colour with the fill as its text */
const toneOf = fill => { const text = textFor(fill); return { fill, text, sub: text, pill: text, pillText: fill }; };

const W = 210, H = 297, M = 18, CW = W - M * 2, FOOT = 20;
const PT = 0.3528;                       // mm per point

/* Figtree when it loaded (it has dashes, curly quotes and bullets), else only what Helvetica can draw */
let RICH = false;
export const clean = s => {
  let t = String(s == null ? '' : s).replace(/[  ]/g, ' ');
  if (RICH) return t.replace(/[→⇄]/g, '-').replace(/[✓✔]/g, '•').replace(/[^\n\x20-\x7E\xA0-\xFFıŒœ‐-‧‰-›€™−]/g, '');
  return t.replace(/[‘’‚′`]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, '-')
    .replace(/…/g, '...').replace(/[•●○✓✔→⇄]/g, '-').replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '');
};
const DASH = () => (RICH ? '—' : '-');
const DOT = () => (RICH ? '  ·  ' : '  |  ');

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

/* Figtree regular, semibold and extrabold, fetched once and kept for the next download */
const FONTS = { normal: 'Figtree-400.ttf', bold: 'Figtree-600.ttf', heavy: 'Figtree-800.ttf' };
let fontData = null;
function loadFonts() {
  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  return fontData || (fontData = Promise.all(Object.entries(FONTS).map(([style, file]) =>
    fetch('/price/fonts/' + file).then(r => { if (!r.ok) throw new Error(file); return r.arrayBuffer(); }).then(buf => [style, file, b64(buf)])))
    .catch(() => { fontData = null; return null; }));
}

/* a tiny layout helper: keeps a cursor (y) and starts a new page when needed */
class Sheet {
  constructor(jsPDF, company, docLabel, fonts) {
    this.d = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.company = company || {};
    this.family = 'helvetica';
    if (fonts) {
      try {
        fonts.forEach(([style, file, data]) => { this.d.addFileToVFS(file, data); this.d.addFont(file, 'Figtree', style); });
        this.family = 'Figtree';
      } catch (e) { this.family = 'helvetica'; }
    }
    RICH = this.family === 'Figtree';
    const acc = hexRgb(this.company.accent) || C.accent;
    const hi = hexRgb(this.company.highlight) || acc.map(v => Math.round(v * 0.32 + 255 * 0.68));
    this.accent = toneOf(acc);
    this.tones = [toneOf(hi), toneOf(acc), toneOf(C.navy), toneOf(C.soft2)];
    this.docLabel = docLabel;
    this.paint();
    this.y = M;
  }
  tone(i) { return this.tones[i % this.tones.length]; }
  pw() { return this.d.internal.pageSize.getWidth(); }
  ph() { return this.d.internal.pageSize.getHeight(); }
  paint() { this.d.setFillColor(...C.paper); this.d.rect(0, 0, this.pw(), this.ph(), 'F'); }
  font(size, style, color) {
    const st = this.family === 'Figtree' ? (style || 'normal') : (style === 'heavy' ? 'bold' : style || 'normal');
    this.d.setFont(this.family, st); this.d.setFontSize(size); this.d.setTextColor(...(color || C.ink)); this.size = size; return this;
  }
  lh(size, k) { return (size || this.size) * PT * (k || 1.42); }
  wrap(str, w) { return this.d.splitTextToSize(clean(str), w); }
  room(h) { if (this.y + h > this.ph() - FOOT) this.page(); }
  page(orientation) { this.d.addPage('a4', orientation || 'portrait'); this.paint(); this.y = M; }
  text(str, opts) {
    const o = opts || {};
    const x = o.x != null ? o.x : M, w = o.w || CW;
    this.font(o.size || 10, o.style || (o.bold ? 'bold' : 'normal'), o.color);
    this.wrap(str, w).forEach(line => {
      this.room(this.lh());
      this.d.text(line, o.align === 'right' ? x + w : x, this.y, { baseline: 'top', align: o.align || 'left' });
      this.y += this.lh();
    });
    if (o.gap) this.y += o.gap;
    return this;
  }
  /* a rounded label: [fill, text colour], returns its width */
  pill(x, y, str, fill, color, opts) {
    const o = opts || {}, size = o.size || 9, h = o.h || 7, padX = o.pad || 3.2;
    const parts = Array.isArray(str) ? str : [[str, o.style || 'normal']];
    const widths = parts.map(([t, st]) => { this.font(size, st); return this.d.getTextWidth(clean(t)); });
    const w = widths.reduce((a, b) => a + b, 0) + padX * 2;
    const x0 = o.align === 'right' ? x - w : x;
    this.d.setFillColor(...fill); this.d.roundedRect(x0, y, w, h, o.r || 1.8, o.r || 1.8, 'F');
    let xx = x0 + padX;
    parts.forEach(([t, st], i) => { this.font(size, st, color); this.d.text(clean(t), xx, y + h / 2, { baseline: 'middle' }); xx += widths[i]; });
    return w;
  }
  heading(str, sub) {
    this.room(30);                     // keep a heading with the first lines under it
    this.y += 4;
    this.font(19, 'heavy', C.ink);
    this.wrap(str, CW).forEach(l => { this.d.text(l, M, this.y, { baseline: 'top' }); this.y += this.lh(19, 1.12); });
    this.y += 1.5;
    if (sub) this.text(sub, { size: 9.5, color: C.ink2, gap: 1 });
    this.y += 3;
  }
  /* the top of the first page: a label pill ("Invoice | CLIENT"), the studio on the right, a big title */
  header(kind, who, title, subtitle) {
    const d = this.d, co = this.company;
    this.pill(M, M, who ? [[kind + ' | ', 'normal'], [String(who).toUpperCase(), 'bold']] : [[kind, 'normal']], this.accent.fill, this.accent.text, { size: 10, h: 8.5, pad: 3.6 });
    const right = [co.website, co.email, co.phone].filter(Boolean);
    this.font(9.5, 'bold', C.ink); d.text(clean(co.name || 'Studio'), W - M, M, { baseline: 'top', align: 'right' });
    this.font(8.3, 'normal', C.mute);
    right.forEach((t, i) => d.text(clean(t), W - M, M + 5 + i * 3.9, { baseline: 'top', align: 'right' }));
    this.y = Math.max(M + 13, M + 5 + right.length * 3.9 + 2);
    this.font(32, 'heavy', C.ink);
    this.wrap(title, CW).forEach(l => { d.text(l, M - 0.6, this.y, { baseline: 'top' }); this.y += this.lh(32, 1.05); });
    this.y += 2;
    if (subtitle) this.text(subtitle, { size: 10.5, color: C.ink2 });
    this.y += 6;
  }
  /* the top of a later section page: a label pill and a big title */
  pageTitle(label, title, sub) {
    this.pill(M, this.y, [[label, 'normal']], this.accent.fill, this.accent.text, { size: 10, h: 8.5, pad: 3.6 });
    this.y += 11;
    this.font(32, 'heavy', C.ink);
    this.wrap(title, CW).forEach(l => { this.d.text(l, M - 0.6, this.y, { baseline: 'top' }); this.y += this.lh(32, 1.05); });
    this.y += 2;
    if (sub) this.text(sub, { size: 10.5, color: C.ink2 });
    this.y += 5;
  }
  /* a colour block, the main unit of every document: a heavy title, "— " lines, an optional price pill */
  block(tone, b) {
    const pad = 7, iw = CW - pad * 2, d = this.d, ts = b.size || 20;
    this.font(ts, 'heavy');
    const title = this.wrap(b.title, iw - (b.tag ? 30 : 0));
    const rows = (b.lines || []).filter(Boolean).map(l => {
      const [main, note] = Array.isArray(l) ? l : [l, ''];
      this.font(9.8, 'normal'); const a = this.wrap(DASH() + ' ' + main, iw - 4);
      this.font(8.6, 'normal'); const n = note ? this.wrap(note, iw - 8) : [];
      return { a, n };
    });
    const tH = title.length * this.lh(ts, 1.08);
    const lH = rows.reduce((s, r) => s + r.a.length * this.lh(9.8, 1.38) + r.n.length * this.lh(8.6, 1.3) + 0.8, 0);
    const pillH = b.price ? 8 : 0;
    const h = Math.max(b.minH || 0, pad + tH + (rows.length ? 4 : 0) + lH + (pillH ? 4 + pillH : 0) + pad - 1);
    this.room(h + 5);
    const y0 = this.y;
    d.setFillColor(...tone.fill); d.roundedRect(M, y0, CW, h, 4, 4, 'F');
    let yy = y0 + pad;
    this.font(ts, 'heavy', tone.text);
    title.forEach(l => { d.text(l, M + pad, yy, { baseline: 'top' }); yy += this.lh(ts, 1.08); });
    if (b.tag) this.pill(M + CW - pad, y0 + pad, b.tag, tone.pill, tone.pillText, { align: 'right', size: 8.5, h: 6.5 });
    if (rows.length) yy += 4;
    rows.forEach(r => {
      this.font(9.8, 'normal', tone.text);
      r.a.forEach((l, i) => { d.text(l, M + pad + (i ? 4 : 0), yy, { baseline: 'top' }); yy += this.lh(9.8, 1.38); });
      this.font(8.6, 'normal', tone.sub);
      r.n.forEach(l => { d.text(l, M + pad + 4, yy, { baseline: 'top' }); yy += this.lh(8.6, 1.3); });
      yy += 0.8;
    });
    if (b.price) this.pill(M + CW - pad + 2, y0 + h - pad + 2 - pillH, b.price, tone.pill, tone.pillText, { align: 'right', size: 10, h: pillH, pad: 3.6 });
    this.y = y0 + h + 5;
  }
  /* cards side by side on the lighter surface: [{ title, lines: [] }] */
  cards(list, opts) {
    const o = opts || {}, gap = 5, n = list.length, w = (CW - gap * (n - 1)) / n, pad = 5;
    const fill = o.fill || C.card;
    const heights = list.map(c => 7 + c.lines.filter(Boolean).reduce((h, l, li) => { this.font(li === 0 ? 10 : 9.2, li === 0 ? 'bold' : 'normal'); return h + this.wrap(l, w - pad * 2).length * this.lh(); }, 0) + pad * 1.6);
    const h = Math.max(...heights);
    this.room(h + 5);
    list.forEach((c, i) => {
      const x = M + i * (w + gap);
      this.d.setFillColor(...fill); this.d.roundedRect(x, this.y, w, h, 4, 4, 'F');
      this.font(8.3, 'normal', C.mute); this.d.text(clean(c.title), x + pad, this.y + pad, { baseline: 'top' });
      let yy = this.y + pad + 6;
      c.lines.filter(Boolean).forEach((l, li) => {
        this.font(li === 0 ? 10 : 9.2, li === 0 ? 'bold' : 'normal', li === 0 ? C.ink : C.ink2);
        this.wrap(l, w - pad * 2).forEach(line => { this.d.text(line, x + pad, yy, { baseline: 'top' }); yy += this.lh(); });
      });
    });
    this.y += h + 5;
  }
  /* label / value pairs in columns, on the lighter surface */
  pairs(list, opts) {
    const o = opts || {}, cols = o.cols || 3, pad = 5, gap = 4;
    const colW = (CW - pad * 2 - gap * (cols - 1)) / cols;
    const rowsOf = [];
    for (let i = 0; i < list.length; i += cols) rowsOf.push(list.slice(i, i + cols));
    const rowH = row => { this.font(10, 'bold'); return 5 + Math.max(...row.map(([, v]) => this.wrap(v || '-', colW).length)) * this.lh(10) + 2.5; };
    const h = rowsOf.reduce((s, r) => s + rowH(r), 0) + pad * 1.6;
    this.room(h + 5);
    this.d.setFillColor(...(o.fill || C.card)); this.d.roundedRect(M, this.y, CW, h, 4, 4, 'F');
    let yy = this.y + pad;
    rowsOf.forEach(row => {
      row.forEach(([k, v], j) => {
        const x = M + pad + j * (colW + gap);
        this.font(8.3, 'normal', C.mute); this.d.text(clean(k), x, yy, { baseline: 'top' });
        this.font(10, 'bold', C.ink);
        this.wrap(v || '-', colW).forEach((line, li) => this.d.text(line, x, yy + 4.6 + li * this.lh(10), { baseline: 'top' }));
      });
      yy += rowH(row);
    });
    this.y += h + 5;
  }
  /* a table on the lighter surface: cols = [{ label, w (share of the width), align }], rows = [[...]] */
  table(cols, rows, opts) {
    const o = opts || {}, pad = 5, cp = 2.2, iw = CW - pad * 2;
    const ws = cols.map(c => c.w * iw);
    const cell = (v, i) => { const [a, b] = String(v).split('\n'); this.font(9.6, i === 0 ? 'bold' : 'normal'); const A = this.wrap(a, ws[i] - cp * 2); this.font(8.4, 'normal'); return { A, B: b ? this.wrap(b, ws[i] - cp * 2) : [] }; };
    const measured = rows.map(r => { const cs = r.map(cell); return { cs, h: Math.max(...cs.map(c => c.A.length * this.lh(9.6) + c.B.length * this.lh(8.4))) + cp * 2 }; });
    const headH = 8;
    let i = 0;
    while (i < measured.length) {
      // as many rows as fit on this page, in one rounded card
      this.room(headH + measured[i].h + pad * 2);
      const avail = this.ph() - FOOT - this.y - headH - pad * 2;
      let j = i, used = 0;
      while (j < measured.length && (used + measured[j].h <= avail || j === i)) { used += measured[j].h; j++; }
      const y0 = this.y, h = headH + used + pad * 1.4;
      this.d.setFillColor(...C.card); this.d.roundedRect(M, y0, CW, h, 4, 4, 'F');
      let x = M + pad;
      this.font(8.3, 'normal', C.mute);
      cols.forEach((c, k) => { this.d.text(clean(c.label), c.align === 'right' ? x + ws[k] - cp : x + cp, y0 + pad, { baseline: 'top', align: c.align || 'left' }); x += ws[k]; });
      let yy = y0 + headH + pad * 0.4;
      for (let r = i; r < j; r++) {
        this.d.setDrawColor(...C.line); this.d.setLineWidth(0.25); this.d.line(M + pad, yy, M + CW - pad, yy);
        x = M + pad;
        measured[r].cs.forEach((c, k) => {
          const col = cols[k], tx = col.align === 'right' ? x + ws[k] - cp : x + cp, opt = { baseline: 'top', align: col.align || 'left' };
          let ty = yy + cp;
          this.font(9.6, k === 0 ? 'bold' : 'normal', k === 0 ? C.ink : C.ink2);
          c.A.forEach(l => { this.d.text(l, tx, ty, opt); ty += this.lh(9.6); });
          this.font(8.4, 'normal', C.mute);
          c.B.forEach(l => { this.d.text(l, tx, ty, opt); ty += this.lh(8.4); });
          x += ws[k];
        });
        yy += measured[r].h;
      }
      this.y = y0 + h + 5;
      i = j;
    }
    if (o.after) this.y += o.after;
  }
  /* "Project total", the amount in big heavy type, and coloured chips under it: [{ text, tone }] */
  bigTotal(label, value, chips, note) {
    this.room(48);
    this.y += 4;
    this.text(label, { size: 10.5, color: C.ink2, gap: 0.5 });
    this.font(42, 'heavy', C.ink);
    this.wrap(value, CW).forEach(l => { this.d.text(l, M - 0.8, this.y, { baseline: 'top' }); this.y += this.lh(42, 1.02); });
    this.y += 2.5;
    if (chips && chips.length) {
      let x = M;
      chips.forEach(c => {
        this.font(9.5, 'normal'); const w = this.d.getTextWidth(clean(c.text)) + 7.2;
        if (x + w > M + CW) { x = M; this.y += 9.5; }
        this.pill(x, this.y, c.text, c.tone.fill, c.tone.text, { size: 9.5, h: 7.5, pad: 3.6 });
        x += w + 3;
      });
      this.y += 11;
    }
    if (note) this.text(note, { size: 9, color: C.mute, gap: 1 });
    this.y += 3;
  }
  /* label and amount rows, right column, the last can be strong */
  rows(list) {
    const x = M + CW * 0.42, w = CW * 0.58;
    list.forEach(([k, v, strong]) => {
      this.room(9);
      this.font(strong ? 11 : 9.6, strong ? 'heavy' : 'normal', strong ? C.ink : C.ink2);
      this.d.text(clean(k), x, this.y, { baseline: 'top' });
      this.d.text(clean(v), x + w, this.y, { baseline: 'top', align: 'right' });
      this.y += strong ? 7 : 5.8;
      if (!strong) { this.d.setDrawColor(...C.line); this.d.setLineWidth(0.2); this.d.line(x, this.y - 1.4, x + w, this.y - 1.4); }
    });
    this.y += 3;
  }
  /* a small bold label and a paragraph, like "Payment terms" on the reference sheet */
  note(title, body) {
    if (!body) return;
    this.room(16);
    this.text(title, { size: 10, style: 'bold', color: C.ink, gap: 1 });
    this.text(body, { size: 9.8, color: C.ink2, gap: 4 });
  }
  signatures(blocks) {
    const gap = 5, w = (CW - gap) / 2, pad = 7, h = 86;
    this.room(h + 5);
    const top = this.y;
    blocks.forEach((b, i) => {
      const x = M + i * (w + gap), t = this.tone(i === 0 ? 0 : 3);
      this.d.setFillColor(...t.fill); this.d.roundedRect(x, top, w, h, 4, 4, 'F');
      let yy = top + pad;
      this.font(15, 'heavy', t.text);
      this.wrap(b.title, w - pad * 2).slice(0, 2).forEach(l => { this.d.text(l, x + pad, yy, { baseline: 'top' }); yy += this.lh(15, 1.1); });
      yy = top + 24;
      [['Name', b.name], ['Title', b.role], ['Signature', ''], ['Date', '']].forEach(([k, v]) => {
        const lineY = yy + (k === 'Signature' ? 13 : 9);
        this.font(8.3, 'normal', t.text); this.d.text(k, x + pad, yy, { baseline: 'top' });
        if (v) { this.font(10.5, 'bold', t.text); this.d.text(clean(v), x + pad, lineY - 1.2, { baseline: 'bottom' }); }
        this.d.setDrawColor(...t.text); this.d.setLineWidth(0.3); this.d.line(x + pad, lineY, x + w - pad, lineY);
        yy = lineY + 4;
      });
    });
    this.y = top + h + 6;
  }
  stamp(text, color) {
    this.pill(W - M, M + 22, text, color, C.white, { align: 'right', size: 11, h: 8.5, pad: 4, style: 'heavy' });
  }
  finish(filename) {
    const n = this.d.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      this.d.setPage(i);
      const pw = this.pw(), ph = this.ph();
      this.font(7.8, 'normal', C.mute);
      this.d.text(clean([this.company.name, this.company.website, this.docLabel].filter(Boolean).join(DOT())), M, ph - 11, { baseline: 'top' });
      this.d.text(i + ' / ' + n, pw - M, ph - 11, { baseline: 'top', align: 'right' });
    }
    this.d.save(clean(filename).replace(/[^\w.-]+/g, '-'));
  }
}
async function sheet(company, label) {
  const [jsPDF, fonts] = await Promise.all([loadJsPdf(), loadFonts()]);
  return new Sheet(jsPDF, company, label, fonts);
}
/* 241000 → "241K", 1250000 → "1.25M", for the chips under a total */
const short = (n, cur) => {
  const a = Math.abs(n), f = (v, s) => String(Math.round(v * 10) / 10).replace(/\.0+$/, '') + s;
  const t = a >= 1e6 ? f(n / 1e6, 'M') : a >= 1e4 ? f(n / 1e3, 'K') : money(n, cur);
  return a >= 1e4 && cur === 'USD' ? '$' + t : t;
};

const clientLines = c => [c.clientName, c.clientRep ? 'Attn: ' + c.clientRep + (c.clientTitle ? ', ' + c.clientTitle : '') : '',
  c.clientAddress, c.clientTin ? 'TIN ' + c.clientTin : '', c.clientEmail, c.clientPhone];
const studioLines = co => [co.name, co.address, co.tin ? 'TIN ' + co.tin : '', co.vatNumber ? 'VAT reg. ' + co.vatNumber : '', co.email, co.secondaryEmail ? 'Also: ' + co.secondaryEmail : '', co.phone];
const letter = i => String.fromCharCode(65 + (i % 26));

/* ================= contract: terms, then the project breakdown, then signatures ================= */
export async function contractPdf(q, company) {
  const c = q.deal.contract, a = c.amounts, s = q.setup || {};
  const ctx = termContext(q, c, company);
  const m = n => money(n, a.currency);
  const doc = await sheet(company, 'Agreement ' + c.number);
  doc.header('Service agreement', c.clientName || ctx.client, 'Service agreement', [s.project || s.typeLabel || 'Project', c.number, dateLong(c.date)].join(DOT()));

  doc.cards([{ title: 'The studio', lines: studioLines(company) }, { title: 'The client', lines: clientLines(c) }]);
  doc.text('This agreement is between ' + ctx.studio + ' ("the studio") and ' + ctx.client + ' ("the client") for ' + ctx.project + '. The project breakdown that follows is Schedule A.', { size: 9.8, color: C.ink2, gap: 2 });

  /* 1. terms */
  doc.heading('Terms');
  (c.terms || []).forEach((t, i) => {
    doc.room(15);
    doc.text((i + 1) + '.  ' + fillTerms(t.title, ctx), { size: 10.5, style: 'bold', gap: 0.6 });
    doc.text(fillTerms(t.body, ctx), { size: 9.6, color: C.ink2, gap: 3, x: M + 5.5, w: CW - 5.5 });
  });
  if (c.notes) doc.note('Additional notes', fillTerms(c.notes, ctx));

  /* 2. project breakdown (Schedule A) */
  doc.page();
  doc.pageTitle('Schedule A', 'Project breakdown', 'What ' + ctx.studio + ' will deliver. Anything not listed here is quoted separately.');
  const choice = id => ((a.choices || []).find(x => x.id === id) || {}).label;
  doc.pairs([
    ['Project', s.project || '-'], ['Type', s.typeLabel || '-'], ['Start date', dateLong(c.startDate)],
    ['Delivery', (a.timeline.label || '-') + (a.timeline.days ? ', ' + a.timeline.days + ' days' : '')],
    ['Revisions', choice('revisions') || '-'], ['Team', choice('team') || '-']
  ]);
  const groups = [];
  a.scope.forEach(it => { let g = groups.find(x => x.title === it.category); if (!g) groups.push(g = { title: it.category, items: [] }); g.items.push(it); });
  groups.forEach((g, i) => doc.block(doc.tone(i), {
    title: g.title,
    tag: g.items.length + (g.items.length === 1 ? ' item' : ' items'),
    lines: g.items.map(it => [it.title + (it.qty > 1 ? ' × ' + it.qty + (it.unit ? ' ' + it.unit : '') : ''), it.desc])
  }));

  const plan = paymentPlan(a, c.depositPct);
  doc.bigTotal('Project total' + (a.vatOn ? ', including ' + a.vatPct + '% VAT' : ''), m(a.total),
    plan.map((p, i) => ({ text: KIND_LABELS[p.kind] + ' ' + p.pct + '%  ' + short(p.total, a.currency), tone: doc.tone(i) })),
    a.currency === 'USD' ? 'Amounts in US dollars (1 USD = ' + a.rate + ' ' + homeCurrency() + ', as agreed).' : 'Amounts in ' + homeCurrency() + '.');
  doc.rows([
    ['Project fee', m(a.subtotal)],
    ...(a.vatOn ? [['VAT ' + a.vatPct + '%', m(a.vat)]] : []),
    ...plan.map(p => [KIND_LABELS[p.kind] + ' (' + p.pct + '%), ' + (p.kind === 'balance' ? 'on delivery' : 'on signing'), m(p.total)])
  ]);
  doc.note('Payment terms', ctx.paymentSchedule + ' Each invoice is payable within ' + ctx.paymentDays + ' days of its date. Work starts once the first payment is received.');

  /* 3. signatures */
  doc.page();
  doc.pageTitle('Agreement ' + c.number, 'Signatures', 'Signed by both parties, this agreement and Schedule A take effect from the date of the last signature.');
  doc.signatures([
    { title: 'For ' + ctx.studio, name: company.signatory || '', role: company.signatoryTitle || '' },
    { title: 'For ' + ctx.client, name: c.clientRep || '', role: c.clientTitle || '' }
  ]);
  doc.finish(fileName(company, c.number + ' ' + (c.clientName || 'agreement')));
}

/* ================= invoice ================= */
export async function invoicePdf(q, inv, company) {
  const c = q.deal.contract, s = q.setup || {};
  const m = n => money(n, inv.currency);
  const doc = await sheet(company, 'Invoice ' + inv.number);
  doc.header('Invoice', c.clientName, 'Invoice ' + inv.number, [s.project || s.typeLabel, dateLong(inv.date)].filter(Boolean).join(DOT()));
  if (inv.status === 'paid') doc.stamp('PAID', C.ok);
  if (inv.status === 'void') doc.stamp('CANCELLED', C.mute);

  const billTo = inv.billTo && inv.billTo.trim() ? inv.billTo.split('\n') : clientLines(c);
  doc.cards([{ title: 'Bill to', lines: billTo }, { title: 'From', lines: studioLines(company) },
    { title: 'Details', lines: ['Invoice ' + inv.number, 'Issued ' + dateLong(inv.date), 'Due ' + dateLong(inv.dueDate), 'Agreement ' + (inv.contractNumber || c.number), s.project || s.typeLabel || ''] }]);

  const lines = (inv.lines && inv.lines.length) ? inv.lines
    : [{ text: invoiceLineText(inv.kind, inv.pct, s.project, inv.contractNumber || c.number), amount: inv.subtotal }];
  doc.table([{ label: 'Description', w: 0.72 }, { label: 'Amount', w: 0.28, align: 'right' }], lines.map(l => [l.text, m(l.amount)]));

  const all = (q.deal.invoices || []).filter(i => i.status !== 'void');
  const before = all.filter(i => i.number !== inv.number && i.status === 'paid' && String(i.createdAt) < String(inv.createdAt));
  const paidBefore = paidSoFar(before, inv.currency);
  const contractTotal = c.amounts.total;
  const left = Math.max(0, contractTotal - paidBefore - inv.total);
  doc.bigTotal(inv.status === 'paid' ? 'Total paid' : 'Total due' + (inv.dueDate ? ' by ' + dateLong(inv.dueDate) : ''), m(inv.total), [
    { text: 'Agreement ' + short(contractTotal, inv.currency), tone: doc.tone(0) },
    { text: 'Paid before ' + short(paidBefore, inv.currency), tone: doc.tone(3) },
    { text: 'This invoice ' + short(inv.total, inv.currency), tone: doc.tone(1) },
    { text: 'Left after this ' + short(left, inv.currency), tone: doc.tone(2) }
  ], inv.currency === 'USD' ? 'Amounts in US dollars. Exchange rate in the agreement: 1 USD = ' + inv.rate + ' ' + homeCurrency() + '.' : '');
  if (inv.vatOn) doc.rows([['Subtotal', m(inv.subtotal)], ['VAT ' + inv.vatPct + '%', m(inv.vat)]]);

  const bank = inv.bank != null && String(inv.bank).trim() ? inv.bank : company.bank;
  if (bank) doc.block(doc.tone(0), { title: 'How to pay', size: 15, lines: String(bank).split('\n').filter(l => l.trim()) });
  if (inv.note) doc.note('Note', inv.note);
  doc.finish(fileName(company, inv.number + ' ' + (c.clientName || '')));
}

/* ================= proposal (the client link as a PDF, for people who ask for one) =================
   Drawn from the published snapshot, so it shows exactly what the client link shows by default. */
/* each service's steps on a week grid on a landscape page, like the client page: the service's
   block colour on the left, its steps as bars, reviews in yellow */
function timelineChart(doc, plan, toneOfService) {
  if (!plan.services.length) return;
  doc.page('landscape');
  const d = doc.d, PW = doc.pw(), PH = doc.ph(), X0 = M, XW = PW - M * 2;
  const weeks = Math.max(1, Math.ceil(plan.total / 5)), span = weeks * 5;
  const LW = 46, TX = X0 + LW, TW = XW - LW - 4, GAP = 4;
  doc.pill(X0, doc.y, [['Project timeline', 'normal']], doc.accent.fill, doc.accent.text, { size: 11, h: 9, pad: 4 });
  doc.font(9, 'normal', C.mute);
  d.text(clean(plan.total + ' working days, about ' + weeks + ' week' + (weeks === 1 ? '' : 's') + '. Yellow steps are your reviews.'), X0 + XW, doc.y + 4.5, { baseline: 'middle', align: 'right' });
  doc.y += 15;
  doc.font(8.5, 'normal', C.ink2);
  for (let w = 0; w < weeks; w++) d.text('WK ' + (w + 1), TX + (w + 0.5) * TW / weeks, doc.y, { baseline: 'top', align: 'center' });
  doc.y += 6;
  const rowsTotal = plan.services.reduce((s, sv) => s + sv.phases.length, 0);
  const room = PH - FOOT - doc.y - GAP * plan.services.length;
  const ROW = Math.max(4.2, Math.min(6.4, (room - plan.services.length * 7) / Math.max(1, rowsTotal)));
  plan.services.forEach(sv => {
    const h = sv.phases.length * ROW + 7;
    if (doc.y + h > PH - FOOT) doc.page('landscape');
    const y0 = doc.y, t = toneOfService(sv.index);
    d.setFillColor(...C.soft); d.roundedRect(X0, y0, XW, h, 3, 3, 'F');
    d.setFillColor(...t.fill); d.roundedRect(X0, y0, LW, h, 3, 3, 'F'); d.rect(X0 + LW - 3, y0, 3, h, 'F');
    d.setDrawColor(...C.line); d.setLineWidth(0.2); d.setLineDashPattern([0.8, 0.8], 0);
    for (let w = 1; w < weeks; w++) d.line(TX + w * TW / weeks, y0, TX + w * TW / weeks, y0 + h);
    d.setLineDashPattern([], 0);
    doc.font(10.5, 'bold', t.text);
    const tl = doc.wrap(sv.title, LW - 8);
    const tH = tl.length * doc.lh(10.5, 1.1) + 4;
    let ty = y0 + h / 2 - tH / 2;
    tl.forEach(l => { d.text(l, X0 + 4, ty, { baseline: 'top' }); ty += doc.lh(10.5, 1.1); });
    doc.font(8, 'normal', t.text); d.text(sv.days + ' days', X0 + 4, ty + 0.6, { baseline: 'top' });
    sv.phases.forEach((ph, i) => {
      const x = TX + ph.start / span * TW, bw = Math.max(1.5, (ph.end - ph.start) / span * TW), y = y0 + 3.5 + i * ROW + 0.5, bh = ROW - 1.4;
      d.setFillColor(...(ph.review ? C.review : t.fill)); d.roundedRect(x, y, bw, bh, 0.9, 0.9, 'F');
      doc.font(7.2, 'normal', C.ink);
      const right = (x + bw) > TX + TW * 0.78;
      d.text(clean(ph.label), right ? x - 1.4 : x + bw + 1.4, y + bh / 2, { baseline: 'middle', align: right ? 'right' : 'left' });
    });
    doc.y = y0 + h + GAP;
  });
}

export async function proposalPdf(p, company, link) {
  const cur = p.currency || 'ETB';
  const sel = defaultSelection(p);
  const t = clientTotals(p, sel);
  const m = n => money(toDisplay(p, n, cur), cur);
  const doc = await sheet(company, 'Proposal');
  doc.header('Pricing proposal', p.company || p.client, p.project || p.projectType || 'Proposal',
    [p.projectType && p.project ? p.projectType : '', p.company && p.client ? 'For ' + p.client : '', 'Prepared ' + dateLong(p.preparedAt)].filter(Boolean).join(DOT()));
  if (p.intro) doc.text(p.intro, { size: 10.5, color: C.ink2, gap: 5 });

  const qtyText = it => it.qty > 1 ? ' × ' + it.qty + (it.unit ? ' ' + it.unit : '') : '';
  const extras = [], chips = [];
  let n = 0;
  const toneByCat = {};
  p.categories.forEach((c, ci) => {
    const inScope = c.items.filter(it => it.locked || it.on);
    c.items.filter(it => !it.locked && !it.on).forEach(it => extras.push(it));
    if (!inScope.length) return;
    const tone = doc.tone(n), sum = inScope.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    toneByCat[ci] = tone;
    doc.block(tone, { title: c.title, lines: inScope.map(it => [it.title + qtyText(it), it.desc]), price: m(sum) });
    chips.push({ text: letter(n) + '  ' + short(toDisplay(p, sum, cur), cur), tone });
    n++;
  });
  if ((p.costs || []).length) {
    const tone = doc.tone(n), sum = p.costs.reduce((s, c) => s + c.amount, 0);
    doc.block(tone, { title: 'Also included', lines: p.costs.map(c => [c.title + '  ' + DASH() + '  ' + m(c.amount)]), price: m(sum) });
    chips.push({ text: letter(n) + '  ' + short(toDisplay(p, sum, cur), cur), tone });
  }
  if (extras.length) {
    doc.heading('Optional add-ons', 'Not in the total. Ask us to add any of them.');
    doc.table([{ label: 'Add-on', w: 0.74 }, { label: 'Price', w: 0.26, align: 'right' }],
      extras.map(it => [it.title + qtyText(it) + (it.desc ? '\n' + it.desc : ''), '+ ' + m(it.unitPrice * it.qty)]));
  }

  const total = cur === 'USD' && t.usdAmount != null ? money(t.usdAmount, 'USD') : money(t.etb, 'ETB');
  doc.bigTotal('Project total' + (t.vatOn ? ', including ' + t.vatPct + '% VAT' : ''), total, chips,
    cur === 'USD' && p.usd.rate ? 'Amounts in US dollars at 1 USD = ' + p.usd.rate + ' ' + homeCurrency() + '.' : '');
  const adjust = [
    ...(t.goodwillOn ? [['Goodwill discount ' + p.goodwill.pct + '%', '- ' + m(t.goodwill)]] : []),
    ...(t.usd ? [['Paying in USD ' + p.usd.pct + '% discount', '- ' + m(t.usdDiscount)]] : []),
    ...(t.vatOn ? [['VAT ' + t.vatPct + '%', m(t.vat)]] : [])
  ];
  if (adjust.length) doc.rows([['Deliverables and options', m(t.original)], ...adjust, ['Total', total, true]]);
  const picks = t.picks.map(x => [x.title, x.option.label + (x.id === 'timeline' && t.days ? ', ' + t.days + ' days' : '')]);
  if (picks.length) { doc.room(30); doc.text('How we work', { size: 10, style: 'bold', gap: 1.5 }); doc.pairs(picks); }
  doc.note('Valid until ' + dateLong(p.expiresAt), (link ? 'The interactive version, where you can change the scope and send your choice: ' + link + '. ' : '') +
    (company.email ? 'Questions: ' + company.email + (company.phone ? ', ' + company.phone : '') : ''));
  timelineChart(doc, timelinePlan(p, sel), i => toneByCat[i] || doc.tone(i));
  doc.finish(fileName(company, 'proposal ' + (p.company || p.client || '')));
}
