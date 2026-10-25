/* The agency's brand and region: one small document (config/brand.json in the private
   store) that every tool reads. The admin edits it in Team → Settings → Brand & region;
   the company fields can also be edited from Price list → Contracts & invoices.

   Server code reads it once per request with readBrand(); after that, brand() returns
   the same copy without another storage read. */
import { readJson, writeJson, LEADS_TOKEN } from './_lib.js';

export const BRAND_PATH = 'config/brand.json';

/* ready-made regional setups. Picking one fills these fields; each stays editable. */
export const PRESETS = {
  ethiopia: {
    label: 'Ethiopia (ETB, 15% VAT, year from 11 September)',
    brand: { currency: 'ETB', timeZone: 'Africa/Addis_Ababa', phoneCode: '251', country: 'Ethiopia' },
    money: { vatOn: true, vatPct: 15, usdRate: 163.4, usdDiscountPct: 15 },
    team: { yearStartMonth: 9, yearStartDay: 11, annualDays: 16, sickDays: 10, workDays: [1, 2, 3, 4, 5], holidays: 'ethiopia' }
  },
  international: {
    label: 'International (USD, no VAT, calendar year)',
    brand: { currency: 'USD', timeZone: 'UTC', phoneCode: '', country: '' },
    money: { vatOn: false, vatPct: 0, usdRate: 0, usdDiscountPct: 0 },
    team: { yearStartMonth: 1, yearStartDay: 1, annualDays: 20, sickDays: 10, workDays: [1, 2, 3, 4, 5], holidays: 'international' }
  }
};

export const DEFAULT_BRAND = {
  name: 'Your Agency',
  tagline: 'Brand and design',
  logo: '',                       // a picture link; empty shows the first letter of the name
  colors: { accent: '#F2541B', accent2: '#FF7A45', ink: '#141414', highlight: '#C8F23C' },
  email: '',
  secondaryEmail: '',
  phone: '',
  address: '',
  city: '',
  website: '',
  tin: '',
  vatNumber: '',
  signatory: '',
  signatoryTitle: 'Director',
  bank: 'Bank name: \nAccount name: \nAccount number: \nSWIFT (for USD): ',
  // what the agency sells, used in the "Get leads from Claude" prompt
  services: 'brand identity and logos, packaging, websites, social media content and campaigns',
  preset: 'ethiopia',
  // 'solo' hides the team-only screens, 'team' shows everything, 'auto' decides by headcount
  workMode: 'auto',
  ...PRESETS.ethiopia.brand
};

const COLOR_KEYS = Object.keys(DEFAULT_BRAND.colors);
const STRING_KEYS = ['name', 'tagline', 'logo', 'email', 'secondaryEmail', 'phone', 'address', 'city', 'website', 'tin', 'vatNumber',
  'signatory', 'signatoryTitle', 'bank', 'services', 'preset', 'currency', 'timeZone', 'phoneCode', 'country', 'workMode'];

const clip = (v, n) => String(v == null ? '' : v).slice(0, n || 400);
const isHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
const validZone = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };

export function mergeBrand(saved) {
  const s = saved || {};
  const out = { ...DEFAULT_BRAND, ...s, colors: { ...DEFAULT_BRAND.colors, ...(s.colors || {}) } };
  COLOR_KEYS.forEach(k => { if (!isHex(out.colors[k])) out.colors[k] = DEFAULT_BRAND.colors[k]; });
  if (!validZone(out.timeZone)) out.timeZone = 'UTC';
  out.currency = /^[A-Z]{3}$/.test(out.currency) ? out.currency : 'ETB';
  out.phoneCode = String(out.phoneCode || '').replace(/\D/g, '').slice(0, 4);
  if (!['auto', 'solo', 'team'].includes(out.workMode)) out.workMode = 'auto';
  return out;
}

/* only these keys are accepted from the settings screens */
export function cleanBrand(patch, current) {
  const next = mergeBrand(current);
  const p = patch || {};
  STRING_KEYS.forEach(k => { if (p[k] !== undefined) next[k] = clip(p[k], k === 'bank' || k === 'services' ? 1000 : 400).trim(); });
  if (p.colors && typeof p.colors === 'object') COLOR_KEYS.forEach(k => { if (isHex(p.colors[k])) next.colors[k] = p.colors[k]; });
  if (next.logo && !/^(https:\/\/|\/)/i.test(next.logo)) next.logo = '';
  if (!next.name) next.name = DEFAULT_BRAND.name;
  return mergeBrand(next);
}

/* safe for anyone to see: the client proposal page and the sign-in screens use it */
export function publicBrand(b) {
  const x = mergeBrand(b);
  return { name: x.name, tagline: x.tagline, logo: x.logo, colors: x.colors, email: x.email, secondaryEmail: x.secondaryEmail,
    phone: x.phone, website: x.website, address: x.address, city: x.city, country: x.country, currency: x.currency,
    timeZone: x.timeZone, phoneCode: x.phoneCode, workMode: x.workMode };
}

/* contracts and invoices print these (the price list's "company" block) */
export function companyOf(b) {
  const x = mergeBrand(b);
  return { name: x.name, address: x.address, phone: x.phone, email: x.email, secondaryEmail: x.secondaryEmail, website: x.website,
    tin: x.tin, vatNumber: x.vatNumber, signatory: x.signatory, signatoryTitle: x.signatoryTitle, bank: x.bank,
    country: x.country, city: x.city, logo: x.logo, accent: x.colors.accent };
}

let current = mergeBrand(null);
export const brand = () => current;

export async function readBrand() {
  current = mergeBrand(await readJson(BRAND_PATH, LEADS_TOKEN, null, 'private'));
  return current;
}

export async function saveBrand(patch) {
  const saved = await readJson(BRAND_PATH, LEADS_TOKEN, null, 'private');
  const next = cleanBrand(patch, saved);
  await writeJson(BRAND_PATH, LEADS_TOKEN, next, 'private');
  current = next;
  return next;
}

/* minutes ahead of UTC in the agency's time zone at a given moment (handles summer time) */
export function zoneOffsetMs(timeZone, atMs = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(atMs)).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - Math.floor(atMs / 1000) * 1000;
}
