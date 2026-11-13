// Versioned output contract for AI change generation. Every model reply is
// validated against these schemas before anything is shown or saved. Records
// are validated individually so one bad record does not discard the rest.
import { z } from 'zod';
import { ARCHETYPE_LABELS } from '../domain/library';
import type { Archetype, Objective } from '../domain/types';
import type { DimCode } from '../catalogue/types';

export const SCHEMA_ID = 'gbs-ci.change-generation.v1';

const DIM_ALIASES: Record<string, DimCode> = {
  om: 'OM', 'operating model': 'OM', 'change in operating model': 'OM',
  pr: 'PR', process: 'PR', 'change in process': 'PR',
  os: 'OS', 'organization structure': 'OS', 'organisation structure': 'OS', 'change in organization structure': 'OS', 'change in organisation structure': 'OS',
  te: 'TE', technology: 'TE', 'change in technology': 'TE',
  im: 'IM', 'interaction model': 'IM', 'change in interaction model': 'IM',
};
export const toDim = (v: unknown): DimCode | undefined => (typeof v === 'string' ? DIM_ALIASES[v.trim().toLowerCase()] : undefined);

const OBJ_ALIASES: Record<string, Objective> = {
  inform: 'inform', awareness: 'inform', aware: 'inform', informing: 'inform', align: 'align', alignment: 'align', 'seek approval': 'seek_approval', seek_approval: 'seek_approval',
  approval: 'seek_approval', prepare: 'prepare', preparation: 'prepare', readiness: 'prepare', engage: 'engage', engagement: 'engage', train: 'train', training: 'train',
  reassure: 'reassure', reassurance: 'reassure', 'request action': 'request_action', request_action: 'request_action', action: 'request_action', escalate: 'escalate',
  'confirm readiness': 'confirm_readiness', confirm_readiness: 'confirm_readiness', announce: 'announce', announcement: 'announce', reinforce: 'reinforce',
  'reinforce adoption': 'reinforce', adoption: 'reinforce', 'collect feedback': 'collect_feedback', collect_feedback: 'collect_feedback', feedback: 'collect_feedback',
};
export const toObjective = (v: string): Objective | undefined => OBJ_ALIASES[v.trim().toLowerCase().replace(/-/g, ' ')] ?? OBJ_ALIASES[v.trim().toLowerCase()];

const ARCHETYPES = Object.keys(ARCHETYPE_LABELS) as [Archetype, ...Archetype[]];

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const roleSchema = z.object({
  role: text(2, 90),
  archetype: z.enum(ARCHETYPES).catch('business_user'),
  functionSpecific: z.boolean().catch(true),
  description: z.string().max(400).catch(''),
});
export const rolesResponseSchema = z.object({
  schemaVersion: z.string().optional(),
  functionInterpretation: z.string().max(600).catch(''),
  clarityWarning: z.string().max(600).nullable().catch(null),
  roles: z.array(z.unknown()).min(1).max(40),
});

export const RELATIONSHIPS = ['potential_direct_impact', 'potential_indirect_impact', 'governance_relevance', 'communication_relevance', 'requires_review'] as const;

export const changeSchema = z.object({
  temporaryId: z.string().max(60).catch(''),
  title: text(8, 180),
  primaryDimension: z.string().transform((v, ctx) => { const d = toDim(v); if (!d) { ctx.addIssue({ code: 'custom', message: `unknown dimension "${v}"` }); return z.NEVER; } return d; }),
  function: z.string().max(120).catch(''),
  processArea: text(2, 120),
  description: text(15, 700),
  typicalAsIs: text(10, 600),
  typicalToBe: text(10, 600),
  changeMechanisms: z.array(z.string().max(60)).max(10).catch([]),
  stakeholderRelationships: z.array(z.object({
    role: text(2, 90),
    relationship: z.enum(RELATIONSHIPS),
    reason: text(5, 400),
    dimensions: z.array(z.string()).optional(),
  })).min(1).max(20),
  possibleMilestones: z.array(z.string().max(120)).max(10).catch([]),
  communicationObjectives: z.array(z.string().max(40)).max(8).catch([]),
  assumptions: z.array(z.string().max(300)).max(8).catch([]),
  requiresValidation: z.boolean().catch(true),
});
export type GeneratedChange = z.infer<typeof changeSchema>;

export const changesResponseSchema = z.object({
  schemaVersion: z.string().optional(),
  changes: z.array(z.unknown()).max(40),
});

/** Pull one JSON value out of a model reply (whole reply, a code fence, or first {…last }). */
export function extractJson(raw: string): unknown {
  const t = raw.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new Error('The model reply contained no valid JSON object.');
}

export function issueText(e: z.ZodError): string {
  return e.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'record'}: ${i.message}`).join('; ');
}
