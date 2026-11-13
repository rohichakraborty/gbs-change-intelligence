// ---------------------------------------------------------------------------
// Template-driven stakeholder relationship evaluation.
// For one stakeholder × one template-derived change: evaluate the template's
// relationship rules against the engagement scope and clarification answers.
// Results are cached per (change object, stakeholder object): immer keeps
// unchanged records referentially identical, so only modified pairs recompute.
// ---------------------------------------------------------------------------
import type { Archetype, ChangeRecord, EngagementState, Severity, Stakeholder } from '../domain/types';
import { ARCHETYPE_LABELS } from '../domain/library';
import { catalogueRevision, getTemplate } from '../catalogue/registry';
import { QUESTIONS } from '../catalogue/questions';
import type { ChangeTemplate, DimCode, RoleRule } from '../catalogue/types';
import { changeFunctions, IMPLICIT_FUNCTION, scopeMatch, type HitKind, type PairResult } from './impact';

const CXO_BY_FUNCTION: Record<string, Archetype> = {
  'Finance & Accounting': 'cxo_finance', 'Human Resources': 'cxo_hr', IT: 'cxo_it', Procurement: 'cxo_procurement', 'Data & Analytics': 'cxo_data',
};
const RANK: Record<HitKind, number> = { direct: 6, indirect: 5, unknown: 4, governance: 3, awareness: 2, none: 1 };
const LABEL: Record<HitKind, string> = {
  direct: 'Potential direct impact', indirect: 'Potential indirect impact', governance: 'Governance responsibility', awareness: 'Communication / awareness relevance',
  none: 'No established relationship', unknown: 'Requires further assessment',
};
export const relationLabel = (h: HitKind) => LABEL[h];

type PairOut = { hit: Omit<PairResult, 'changeId'>; assumption?: string };
type DimMap = Partial<Record<DimCode, PairOut>>;
interface CacheEntry { rev: number; fns: unknown; snaps: unknown; roles: unknown; byDim: DimMap; noRuleText: PairOut }
const cache = new WeakMap<ChangeRecord, WeakMap<Stakeholder, CacheEntry>>();

function cxoTokens(s: EngagementState, c: ChangeRecord): Archetype[] {
  const fns = changeFunctions(c);
  const pool = fns.length ? fns : s.engagement.functions.map((f) => f.name);
  const out = pool.map((f) => CXO_BY_FUNCTION[f] ?? 'cxo_other');
  return Array.from(new Set(out.length ? out : (['cxo_other'] as Archetype[])));
}

const toSev = (v: RoleRule['severity']): Severity | null => (v ? { responsibilities: v[0], relationships: v[1], tools: v[2], behaviours: v[3] } : null);

function evaluate(s: EngagementState, st: Stakeholder, c: ChangeRecord, t: ChangeTemplate): { byDim: DimMap; noRuleText: PairOut } {
  const byDim: DimMap = {};
  const scope = scopeMatch(st, c, false);
  const tag = `${t.templateId} v${t.templateVersion}`;
  const sourceNote = t.origin === 'ai' ? `Source: AI-generated change (${t.provenance?.model ?? 'model'}, ${t.provenance?.generatedAt?.slice(0, 10) ?? ''}) — not client evidence${st.roles.decisionMaker || st.roles.approver || st.roles.sponsor ? '; stakeholder governance role flags' : ''}.` : `Source: GBS Change Library template ${tag}${st.roles.decisionMaker || st.roles.approver || st.roles.sponsor ? ' + stakeholder governance role flags' : ''}.`;
  if (!scope.ok) {
    const out: PairOut = { hit: { hit: 'none', severity: null, text: scope.why, ruleId: 'R-SCOPE', source: 'scope' } };
    for (const d of [t.primaryChangeDimension, ...t.secondaryImpactDimensions]) byDim[d] = out;
    return { byDim, noRuleText: out };
  }
  const cxo = cxoTokens(s, c);
  // Function-agnostic role matching for AI-generated rules: role key -> confirmed stakeholder.
  const mapped = new Map<string, string>();
  for (const r of s.roleSuggestions ?? []) if ((r.status === 'mapped' || r.status === 'added') && r.stakeholderId) mapped.set(r.key, r.stakeholderId);
  const fns = changeFunctions(c);
  const sFn = st.functionName || IMPLICIT_FUNCTION[st.archetype] || '';
  for (const r of t.rules) {
    const matches = r.roleKey ? mapped.get(r.roleKey) === st.id : r.roles.some((role) => (role === '$cxo' ? cxo.includes(st.archetype) : role === st.archetype));
    if (!matches) continue;
    const roleNote = r.roleKey ? ` (AI-suggested role "${r.roleLabel ?? r.roleKey}", mapped to ${st.roleName})` : '';
    let assumption: string | undefined;
    if (r.fnScoped && fns.length && !r.roleKey) {
      if (sFn && !fns.includes(sFn)) {
        const out: PairOut = { hit: { hit: 'none', severity: null, text: `${c.code} applies to ${fns.join(', ')}; ${st.roleName} sits in ${sFn} (rule ${r.id}).`, ruleId: r.id, source: 'scope' } };
        for (const d of r.dims) if (!byDim[d] || RANK[byDim[d]!.hit.hit] < RANK.none) byDim[d] = out;
        continue;
      }
      if (!sFn) assumption = `No function recorded for ${st.roleName} — treated as within ${fns.join(', ')} scope for ${c.code}.`;
    }
    let hit: HitKind = r.kind === 'review' ? 'unknown' : r.kind;
    let text = `${LABEL[hit]}${roleNote}: ${r.mechanism} ${sourceNote}`;
    let info = r.kind === 'review' ? r.info || `Confirm whether this applies: ${r.mechanism}` : r.info;
    if (r.when) {
      const ans = c.clarificationAnswers?.[r.when.q];
      const qq = QUESTIONS[r.when.q];
      if (!ans || ans === 'skip') {
        if (!qq?.impactCritical) continue;
        if (r.kind === 'governance' || r.kind === 'awareness') continue; // non-impact relationships do not create review cells
        hit = 'unknown';
        text = `Requires further assessment: rule ${r.id} (${LABEL[hit].toLowerCase()} — ${r.mechanism}) depends on the unanswered clarification "${qq?.text ?? r.when.q}". ${sourceNote}`;
        info = `Answer the clarification "${qq?.text ?? r.when.q}"${ans === 'skip' ? ' (skipped by consultant)' : ''}.`;
      } else if (!r.when.in.includes(ans)) {
        continue;
      } else {
        const opt = qq?.options.find((o) => o.id === ans);
        text += ` Applies because the clarification answer is "${opt?.label ?? ans}".`;
      }
    }
    const out: PairOut = { hit: { hit, severity: hit === 'direct' || hit === 'indirect' ? toSev(r.severity) : null, text, ruleId: r.id, source: 'template', info }, assumption };
    for (const d of r.dims) {
      const cur = byDim[d];
      if (!cur || RANK[hit] > RANK[cur.hit.hit]) byDim[d] = out;
    }
  }
  const noRuleText: PairOut = { hit: { hit: 'none', severity: null, text: `Template ${tag} defines no relationship for ${ARCHETYPE_LABELS[st.archetype] ?? st.archetype} in this dimension.`, ruleId: 'R-NONE', source: 'template' } };
  return { byDim, noRuleText };
}

export function assessTemplatePair(s: EngagementState, st: Stakeholder, c: ChangeRecord, dim: DimCode): PairOut {
  const t = getTemplate(c.templateId, c.templateVersion, s);
  if (!t) return { hit: { hit: 'unknown', severity: null, text: `Template ${c.templateId} v${c.templateVersion} is not available in this library — consultant assessment required.`, ruleId: 'R-MISSING', source: 'template', info: 'Restore the template or convert the change to a custom change.' } };
  let byStake = cache.get(c);
  if (!byStake) { byStake = new WeakMap(); cache.set(c, byStake); }
  let e = byStake.get(st);
  if (!e || e.rev !== catalogueRevision() || e.fns !== s.engagement.functions || e.snaps !== s.templateSnapshots || e.roles !== s.roleSuggestions) {
    const r = evaluate(s, st, c, t);
    e = { rev: catalogueRevision(), fns: s.engagement.functions, snaps: s.templateSnapshots, roles: s.roleSuggestions, ...r };
    byStake.set(st, e);
  }
  return e.byDim[dim] ?? e.noRuleText;
}

/** All relationships one template-derived change has with one stakeholder (for explanations). */
export function relationshipsFor(s: EngagementState, st: Stakeholder, c: ChangeRecord): { dim: DimCode; out: PairOut }[] {
  const t = getTemplate(c.templateId, c.templateVersion, s);
  if (!t) return [];
  const dims = Array.from(new Set([t.primaryChangeDimension, ...t.secondaryImpactDimensions]));
  return dims.map((d) => ({ dim: d, out: assessTemplatePair(s, st, c, d) })).filter((x) => x.out.hit.hit !== 'none');
}
