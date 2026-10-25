/* The brand colours from Settings → Brand & region, applied the same way in the Team app, the
   Price Builder and the client proposal. Sets the --accent family that suite.css defines, and
   picks white or near-black for text on the accent so it stays readable whatever colour is chosen. */
const INK = '#0E0E0E';

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function luminance(rgb) {
  const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const la = luminance(hexToRgb(a)), lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/* white or ink, whichever reads better on this colour */
export function textOn(hex) {
  if (!hexToRgb(hex)) return '#fff';
  return contrast(hex, '#ffffff') >= contrast(hex, INK) ? '#fff' : INK;
}

export function applyTheme(colors) {
  const c = colors || {}, r = document.documentElement.style;
  if (hexToRgb(c.accent)) {
    r.setProperty('--accent', c.accent);
    r.setProperty('--on-accent', textOn(c.accent));
  }
  if (hexToRgb(c.accent2)) r.setProperty('--accent-2', c.accent2);
  if (hexToRgb(c.highlight)) {
    r.setProperty('--highlight', c.highlight);
    r.setProperty('--on-highlight', textOn(c.highlight));
  }
}
