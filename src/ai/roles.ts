// Semantic role matching between AI-suggested roles and the Stakeholder Register.
// Exact equivalents (same normalised name) map automatically; anything else is a
// candidate that the consultant must confirm before roles are merged.
import type { Stakeholder } from '../domain/types';

const SENIOR = new Set(['vp', 'vice', 'president', 'head', 'director', 'svp', 'evp', 'avp', 'senior']);
const MANAGER = new Set(['manager', 'lead', 'leader', 'supervisor', 'coordinator', 'owner']);
const CHIEF = new Set(['chief', 'officer', 'cxo']);
const ACRONYMS: Record<string, string> = {
  ceo: 'chief executive officer', cfo: 'chief financial officer', chro: 'chief human resources officer', cio: 'chief information officer',
  cto: 'chief technology officer', cdo: 'chief data officer', cpo: 'chief procurement officer', coo: 'chief operating officer', cso: 'chief sales officer',
  cmo: 'chief marketing officer', cro: 'chief risk officer', cco: 'chief commercial officer', gbs: 'gbs', gcc: 'gcc', crm: 'crm', esg: 'esg', hr: 'human resources',
  it: 'it', ops: 'operations', mgr: 'manager', sr: 'senior', rnd: 'research development',
};
const STOP = new Set(['of', 'the', 'and', 'for', 'to', '&', 'a', 'an', 'in', '/', '-', 'team', 'teams', 'staff', 'function']);

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9& ]+/g, ' ').split(/\s+/).filter(Boolean)
    .flatMap((w) => (ACRONYMS[w] ?? w).split(' '))
    .map((w) => (w.endsWith('s') && w.length > 4 ? w.slice(0, -1) : w))
    .filter((w) => !STOP.has(w));
}

/** Seniority band and the remaining "domain" words of a role title. */
export function roleShape(s: string): { band: 'chief' | 'senior' | 'manager' | 'staff'; core: string[] } {
  const w = words(s);
  const band = w.some((x) => CHIEF.has(x)) ? 'chief' : w.some((x) => SENIOR.has(x)) ? 'senior' : w.some((x) => MANAGER.has(x)) ? 'manager' : 'staff';
  const core = w.filter((x) => !SENIOR.has(x) && !MANAGER.has(x) && !CHIEF.has(x));
  return { band, core: Array.from(new Set(core)).sort() };
}

/** Stable key for a role title (seniority band + sorted domain words). */
export function roleKey(s: string): string {
  const r = roleShape(s);
  return `${r.band}:${r.core.join('-')}`;
}

/** 0..1 similarity; same band and same domain words = 1. */
export function roleSimilarity(a: string, b: string): number {
  const A = roleShape(a), B = roleShape(b);
  if (!A.core.length || !B.core.length) return 0;
  const inter = A.core.filter((x) => B.core.includes(x)).length;
  const jac = inter / (A.core.length + B.core.length - inter);
  const bandAdj = A.band === B.band ? 1 : (A.band === 'senior' && B.band === 'manager') || (A.band === 'manager' && B.band === 'senior') ? 0.75 : 0.5;
  return Math.round(jac * bandAdj * 100) / 100;
}

export interface RoleMatch { stakeholder: Stakeholder; score: number; exact: boolean }

export function matchRole(role: string, stakeholders: Stakeholder[]): RoleMatch[] {
  const key = roleKey(role);
  return stakeholders
    .map((st) => ({ stakeholder: st, exact: roleKey(st.roleName) === key, score: roleSimilarity(role, st.roleName) }))
    .filter((m) => m.exact || m.score >= 0.34)
    .sort((x, y) => Number(y.exact) - Number(x.exact) || y.score - x.score)
    .slice(0, 4);
}
