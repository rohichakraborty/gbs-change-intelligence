// Template resolution. Built-in templates (v1) + shared-catalogue edits (overlay
// versions) + snapshots stored inside an engagement. An engagement change always
// resolves the exact version it was selected from.
import { z } from 'zod';
import type { EngagementState } from '../domain/types';
import { BUILTIN_TEMPLATES } from './templates';
import type { CatalogueOverlay, ChangeTemplate } from './types';

let overlay: CatalogueOverlay = { versions: [], deprecated: {}, updatedAt: null };
let rev = 0;
const builtinById = new Map(BUILTIN_TEMPLATES.map((t) => [t.templateId, t]));
let latestCache: { rev: number; list: ChangeTemplate[] } | null = null;

export function setCatalogueOverlay(o: CatalogueOverlay) { overlay = o; rev += 1; latestCache = null; }
export function getCatalogueOverlay(): CatalogueOverlay { return overlay; }
export function catalogueRevision(): number { return rev; }

export function latestVersionNumber(id: string): number {
  const vs = overlay.versions.filter((v) => v.templateId === id).map((v) => v.templateVersion);
  return Math.max(builtinById.has(id) ? 1 : 0, ...vs);
}

function fromCatalogue(id: string, version: number): ChangeTemplate | undefined {
  if (version === 1 && builtinById.has(id)) return builtinById.get(id);
  return overlay.versions.find((v) => v.templateId === id && v.templateVersion === version);
}

/** Exact version, looking in the engagement's snapshots first so exported engagements stay self-contained. */
export function getTemplate(id: string | null, version: number | null, s?: EngagementState): ChangeTemplate | undefined {
  if (!id) return undefined;
  const v = version ?? latestVersionNumber(id);
  const snap = s?.templateSnapshots?.[`${id}@${v}`] as ChangeTemplate | undefined;
  return snap ?? fromCatalogue(id, v);
}

export function getLatestTemplate(id: string): ChangeTemplate | undefined {
  const t = fromCatalogue(id, latestVersionNumber(id));
  return t && overlay.deprecated[id] ? { ...t, active: false } : t;
}

/** Latest version of every template; deprecated templates are returned with active=false. */
export function listLatestTemplates(): ChangeTemplate[] {
  if (latestCache?.rev === rev) return latestCache.list;
  const ids = new Set<string>([...builtinById.keys(), ...overlay.versions.map((v) => v.templateId)]);
  const list = [...ids].map((id) => getLatestTemplate(id)!).filter(Boolean);
  latestCache = { rev, list };
  return list;
}

const ruleSchema = z.object({
  id: z.string(), roles: z.array(z.string()).min(1), kind: z.enum(['direct', 'indirect', 'governance', 'awareness']), fnScoped: z.boolean(),
  dims: z.array(z.enum(['OM', 'PR', 'OS', 'TE', 'IM'])), mechanism: z.string(), severity: z.array(z.number().min(0).max(3)).length(4).nullable(),
  when: z.object({ q: z.string(), in: z.array(z.string()) }).nullable(), info: z.string(),
});

export const templateSchema = z.object({
  templateId: z.string().min(1), templateVersion: z.number().int().min(1), active: z.boolean(), origin: z.enum(['builtin', 'custom']),
  title: z.string().min(1), primaryChangeDimension: z.enum(['OM', 'PR', 'OS', 'TE', 'IM']), secondaryImpactDimensions: z.array(z.string()),
  functionTags: z.array(z.string()), processTags: z.array(z.string()), applicableTransformationTypes: z.array(z.string()),
  description: z.string(), typicalAsIs: z.string(), typicalToBe: z.string(), rules: z.array(ruleSchema),
  potentialDirectImpactRoles: z.array(z.string()), potentialIndirectImpactRoles: z.array(z.string()), governanceRoles: z.array(z.string()),
  awarenessRoles: z.array(z.string()), impactMechanisms: z.array(z.string()), ruleIds: z.array(z.string()), defaultImpactSeverityGuidance: z.string(),
  typicalMilestoneTriggers: z.array(z.string()), possibleCommunicationObjectives: z.array(z.string()), potentialCommunicationTypes: z.array(z.string()),
  suggestedChannels: z.array(z.string()), typicalArtifactTypes: z.array(z.string()), clarificationQuestions: z.array(z.string()), employmentImplication: z.boolean(),
}).passthrough();

export const overlaySchema = z.object({ versions: z.array(templateSchema), deprecated: z.record(z.boolean()), updatedAt: z.string().nullable() });

export function safeOverlay(raw: unknown): CatalogueOverlay {
  const r = overlaySchema.safeParse(raw);
  return r.success ? (r.data as unknown as CatalogueOverlay) : { versions: [], deprecated: {}, updatedAt: null };
}

export { BUILTIN_TEMPLATES };
