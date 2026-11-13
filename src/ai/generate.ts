// AI change-generation pipeline (function-agnostic).
// function name + engagement context → LLM → JSON extraction → per-record schema
// validation → repair retry → de-duplication → ChangeTemplate (same structure as
// the built-in library, so the downstream engine treats both identically).
import type { Archetype, EngagementState } from '../domain/types';
import { MILESTONE_LIBRARY, OBJECTIVES } from '../domain/library';
import { nowIso } from '../domain/util';
import { buildTemplate } from '../catalogue/templates';
import { rule } from '../catalogue/profiles';
import { similarity } from '../catalogue/instance';
import type { AIRole, ChangeTemplate, DimCode, RelationKind } from '../catalogue/types';
import { AIError, type LLMProvider } from './providers';
import { buildContext, dimensionPrompt, repairPrompt, rolesPrompt, SYSTEM, type GenerationInput } from './prompts';
import { changeSchema, changesResponseSchema, extractJson, issueText, roleSchema, rolesResponseSchema, toDim, toObjective, type GeneratedChange } from './schema';
import { roleKey } from './roles';

export const DIMS: DimCode[] = ['OM', 'PR', 'OS', 'TE', 'IM'];

export function checkFunctionName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || !/[a-z]/i.test(name)) throw new AIError('bad_input', 'Enter a recognisable business function name (at least two letters).');
  if (name.length > 80) throw new AIError('bad_input', 'Function name is too long — use a short name and put detail in the description.');
  return name;
}

interface Attempted<T> { value: T; attempts: number; model: string }

/** One request with up to `retries` repair attempts when the reply is unusable. */
async function requestValidated<T>(provider: LLMProvider, purpose: string, user: string, parse: (json: unknown, truncated: boolean) => T, retries: number, signal?: AbortSignal): Promise<Attempted<T>> {
  let prompt = user, lastErr = '', model = '';
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const res = await provider.complete({ purpose, system: SYSTEM, user: prompt, maxTokens: 16000 }, signal);
    model = res.model;
    try {
      const json = extractJson(res.text);
      return { value: parse(json, res.truncated), attempts: attempt, model };
    } catch (e) {
      if (e instanceof AIError && e.code !== 'invalid_output') throw e;
      lastErr = res.truncated ? 'the reply was cut short before the JSON was complete; return fewer, shorter items' : (e as Error).message;
      prompt = repairPrompt(user, lastErr);
    }
  }
  throw new AIError('invalid_output', `The model returned output that failed validation after ${retries + 1} attempt(s): ${lastErr}`, true);
}

function guessArchetype(role: string): Archetype {
  const r = role.toLowerCase();
  if (/\bgbs\b|\bgcc\b|shared service/.test(r)) return /head|director|vp|lead/.test(r) ? 'gbs_leader' : 'new_hire';
  if (/chief|\bc[a-z]o\b|officer/.test(r)) return 'cxo_other';
  if (/customer|client/.test(r)) return 'customer';
  if (/supplier|vendor|partner/.test(r)) return 'supplier';
  if (/head|director|\bvp\b|vice president/.test(r)) return 'function_head';
  if (/manager|lead|supervisor/.test(r)) return 'team_lead';
  if (/admin|analyst|specialist|owner/.test(r)) return 'process_owner';
  return 'business_user';
}

export interface RolesResult { roles: AIRole[]; interpretation: string; clarityWarning: string | null; rejected: { title: string; reason: string }[]; attempts: number; model: string }

export async function generateRoles(provider: LLMProvider, s: EngagementState, input: GenerationInput, signal?: AbortSignal): Promise<RolesResult> {
  const ctx = buildContext(s, input);
  const retries = provider.id === 'claude-artifact' ? 1 : 2;
  const rejected: { title: string; reason: string }[] = [];
  const r = await requestValidated(provider, 'roles', rolesPrompt(ctx), (json) => {
    const top = rolesResponseSchema.safeParse(json);
    if (!top.success) throw new AIError('invalid_output', `roles response: ${issueText(top.error)}`);
    const roles: AIRole[] = [];
    for (const raw of top.data.roles) {
      const p = roleSchema.safeParse(raw);
      if (!p.success) { rejected.push({ title: String((raw as { role?: unknown })?.role ?? 'role'), reason: issueText(p.error) }); continue; }
      const key = roleKey(p.data.role);
      if (roles.some((x) => x.key === key)) continue;
      roles.push({ key, role: p.data.role, archetype: p.data.archetype, functionSpecific: p.data.functionSpecific, description: p.data.description });
    }
    if (roles.length < 2) throw new AIError('invalid_output', 'fewer than two valid stakeholder roles returned');
    return { roles, interpretation: top.data.functionInterpretation, clarityWarning: top.data.clarityWarning };
  }, retries, signal);
  return { ...r.value, rejected, attempts: r.attempts, model: r.model };
}

const KIND: Record<string, RelationKind> = {
  potential_direct_impact: 'direct', potential_indirect_impact: 'indirect', governance_relevance: 'governance', communication_relevance: 'awareness', requires_review: 'review',
};

function milestoneKeys(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const exact = MILESTONE_LIBRARY.find((m) => m.name.toLowerCase() === n.trim().toLowerCase());
    const best = exact ?? MILESTONE_LIBRARY.map((m) => ({ m, sc: similarity(n, m.name) })).sort((a, b) => b.sc - a.sc).find((x) => x.sc >= 0.4)?.m;
    if (best && !out.includes(best.key)) out.push(best.key);
  }
  return out;
}

export function toTemplate(ch: GeneratedChange, dim: DimCode, fn: string, id: string, roles: AIRole[], meta: { generationId: string; provider: string; model: string; at: string }): { template: ChangeTemplate; newRoles: AIRole[] } {
  const newRoles: AIRole[] = [];
  const specs = ch.stakeholderRelationships.map((rel) => {
    const key = roleKey(rel.role);
    let role = roles.find((r) => r.key === key) ?? newRoles.find((r) => r.key === key);
    if (!role) { role = { key, role: rel.role, archetype: guessArchetype(rel.role), functionSpecific: true, description: '' }; newRoles.push(role); }
    const kind = KIND[rel.relationship];
    const dims = (rel.dimensions ?? []).map(toDim).filter((x): x is DimCode => !!x);
    const spec = rule(kind === 'review' ? 'indirect' : kind, [role.archetype as Archetype], rel.reason, { dims, info: kind === 'review' ? `Confirm whether this applies: ${rel.reason}` : '' });
    return { ...spec, kind, severity: kind === 'direct' || kind === 'indirect' ? spec.severity : null, roleKey: key, roleLabel: rel.role };
  });
  const obj = ch.communicationObjectives.map(toObjective).filter((x): x is NonNullable<typeof x> => !!x && x in OBJECTIVES);
  const ms = milestoneKeys(ch.possibleMilestones);
  const t = buildTemplate(id, dim, [fn], [ch.processArea], ch.title, ch.description, ch.typicalAsIs, ch.typicalToBe, specs, { ms: ms.length ? ms : undefined, obj: obj.length ? Array.from(new Set(obj)) : undefined });
  const referenced = Array.from(new Set(specs.map((x) => x.roleKey)));
  return {
    template: {
      ...t, origin: 'ai', aiRoles: [...roles, ...newRoles].filter((r) => referenced.includes(r.key)), changeMechanisms: ch.changeMechanisms, assumptions: ch.assumptions,
      provenance: { generationId: meta.generationId, provider: meta.provider, model: meta.model, generatedAt: meta.at, requiresValidation: true },
    },
    newRoles,
  };
}

export interface DimResult { templates: ChangeTemplate[]; newRoles: AIRole[]; rejected: { title: string; reason: string }[]; duplicates: number; attempts: number; model: string }

export async function generateDimension(provider: LLMProvider, s: EngagementState, input: GenerationInput, dim: DimCode, roles: AIRole[], avoidTitles: string[], mode: 'initial' | 'more',
  ids: { generationId: string; next: (dim: DimCode) => string }, signal?: AbortSignal): Promise<DimResult> {
  const ctx = buildContext(s, input);
  const retries = provider.id === 'claude-artifact' ? 1 : 2;
  const rejected: { title: string; reason: string }[] = [];
  let duplicates = 0;
  const r = await requestValidated(provider, `changes:${dim}`, dimensionPrompt(ctx, dim, roles, avoidTitles, mode), (json, truncated) => {
    const top = changesResponseSchema.safeParse(json);
    if (!top.success) throw new AIError('invalid_output', `changes response: ${issueText(top.error)}`);
    const valid: GeneratedChange[] = [];
    rejected.length = 0; duplicates = 0;
    for (const raw of top.data.changes) {
      const p = changeSchema.safeParse(raw);
      const title = String((raw as { title?: unknown })?.title ?? 'untitled');
      if (!p.success) { rejected.push({ title, reason: issueText(p.error) }); continue; }
      if (p.data.primaryDimension !== dim) { rejected.push({ title, reason: `assigned to ${p.data.primaryDimension}, requested ${dim}` }); continue; }
      const seen = [...avoidTitles, ...valid.map((v) => v.title)];
      if (seen.some((x) => x.trim().toLowerCase() === p.data.title.trim().toLowerCase() || similarity(x, p.data.title) >= 0.62)) { duplicates++; continue; }
      valid.push(p.data);
    }
    if (!valid.length && top.data.changes.length && !duplicates) throw new AIError('invalid_output', `no change records passed validation (${rejected.slice(0, 2).map((x) => x.reason).join(' | ')})`);
    if (!valid.length && truncated) throw new AIError('invalid_output', 'reply cut short');
    return valid;
  }, retries, signal);
  const at = nowIso();
  const newRoles: AIRole[] = [];
  const templates = r.value.map((ch) => {
    const out = toTemplate(ch, dim, input.function, ids.next(dim), [...roles, ...newRoles], { generationId: ids.generationId, provider: provider.label, model: r.model, at });
    newRoles.push(...out.newRoles);
    return out.template;
  });
  return { templates, newRoles, rejected: [...rejected], duplicates, attempts: r.attempts, model: r.model };
}
