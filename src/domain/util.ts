import type { ISODate, TimeUnit } from './types';

export const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export const nowIso = () => new Date().toISOString();

export function parseDate(d: ISODate | null | undefined): Date | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addUnits(date: ISODate, n: number, unit: TimeUnit): ISODate {
  const d = parseDate(date)!;
  if (unit === 'days') d.setUTCDate(d.getUTCDate() + n);
  else if (unit === 'weeks') d.setUTCDate(d.getUTCDate() + n * 7);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return toISO(d);
}

/** Signed difference (a - b) expressed in the engagement time unit, rounded. */
export function diffUnits(a: ISODate, b: ISODate, unit: TimeUnit): number {
  const da = parseDate(a)!, db = parseDate(b)!;
  const days = Math.round((da.getTime() - db.getTime()) / 86400000);
  if (unit === 'days') return days;
  if (unit === 'weeks') return Math.round(days / 7);
  return Math.round(days / 30.44);
}

export function formatT(offset: number | null): string {
  if (offset === null || Number.isNaN(offset)) return 'T?';
  if (offset === 0) return 'T';
  return offset > 0 ? `T+${offset}` : `T${offset}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(d: ISODate | null | undefined, fallback = '—'): string {
  const p = parseDate(d ?? null);
  if (!p) return fallback;
  return `${String(p.getUTCDate()).padStart(2, '0')} ${MONTHS[p.getUTCMonth()]} ${p.getUTCFullYear()}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fmtDate(toISO(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Small stable string hash (FNV-1a) used for fingerprints. */
export function hash(input: unknown): string {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const PLACEHOLDER_RE = /\[(?:CONFIRM|INSERT|APPROVED|TBC|ADD|NAME|DATE|SPECIFY|DEFINE)[^\]]*\]/g;

export function countPlaceholders(text: string): number {
  return (text.match(PLACEHOLDER_RE) || []).length;
}

export const ph = (label: string) => `[${label.toUpperCase()}]`;

export function listJoin(items: string[]): string {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a[0] ?? '';
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

export function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
}

export function includesCI(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.trim().toLowerCase());
}

export function uniq<T>(a: T[]): T[] {
  return Array.from(new Set(a));
}
