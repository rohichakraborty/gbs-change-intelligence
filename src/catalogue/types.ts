// ---------------------------------------------------------------------------
// GBS Change Library — reusable change templates (shared across engagements).
// A template is never modified by engagement work: selecting one creates an
// engagement-specific ChangeRecord that references templateId + templateVersion.
// ---------------------------------------------------------------------------
import type { Archetype, ArtifactType, Objective } from '../domain/types';

export type DimCode = 'OM' | 'PR' | 'OS' | 'TE' | 'IM';

/** How a stakeholder role relates to a change. Only direct/indirect are impacts. */
/** direct/indirect are impacts; governance/awareness are communication relevance; review = depends on an unknown. */
export type RelationKind = 'direct' | 'indirect' | 'governance' | 'awareness' | 'review';

/** `$cxo` resolves to the accountable functional executive of the change's functions. */
export type RoleToken = Archetype | '$cxo';

export interface RoleRule {
  id: string;
  roles: RoleToken[];
  kind: RelationKind;
  /** Stakeholder must belong to one of the change's applicable functions. */
  fnScoped: boolean;
  /** Impact dimensions this relationship lands in (defaults to the template's primary dimension). */
  dims: DimCode[];
  /** Why the relationship exists — shown verbatim in explanations. */
  mechanism: string;
  /** Typical severity guidance [responsibilities, relationships, tools, behaviours], 0–3. */
  severity: [number, number, number, number] | null;
  /** Applies only when the clarification answer is one of these options. */
  when: { q: string; in: string[] } | null;
  /** What must be confirmed before the relationship can be treated as established. */
  info: string;
  /** AI-generated rules name a role instead of a role type; it is matched to the Stakeholder Register via role mappings. */
  roleKey?: string;
  roleLabel?: string;
}

/** A stakeholder role named by an AI-generated change (function-agnostic). */
export interface AIRole {
  key: string;
  role: string;
  archetype: string;
  functionSpecific: boolean;
  description: string;
}

export interface ClarificationOption {
  id: string;
  label: string;
  /** Plain description of how this answer changes the likely impacts. */
  effect: string;
}

export interface ClarificationQuestion {
  id: string;
  text: string;
  help: string;
  options: ClarificationOption[];
  /** True when an unanswered/skipped question leaves dependent relationships as "Requires review". */
  impactCritical: boolean;
}

export interface ChangeTemplate {
  templateId: string;
  templateVersion: number;
  active: boolean;
  origin: 'builtin' | 'custom' | 'ai';
  title: string;
  primaryChangeDimension: DimCode;
  secondaryImpactDimensions: DimCode[];
  /** Catalogue function keys; 'Enterprise' marks a cross-functional template. */
  functionTags: string[];
  processTags: string[];
  applicableTransformationTypes: string[];
  description: string;
  typicalAsIs: string;
  typicalToBe: string;
  rules: RoleRule[];
  // Derived (kept on the entity so consumers and exports do not recompute them).
  potentialDirectImpactRoles: string[];
  potentialIndirectImpactRoles: string[];
  governanceRoles: string[];
  awarenessRoles: string[];
  impactMechanisms: string[];
  ruleIds: string[];
  defaultImpactSeverityGuidance: string;
  typicalMilestoneTriggers: string[]; // milestone library keys
  possibleCommunicationObjectives: Objective[];
  potentialCommunicationTypes: string[]; // communication type ids
  suggestedChannels: string[]; // channel ids
  typicalArtifactTypes: ArtifactType[];
  clarificationQuestions: string[]; // question ids
  employmentImplication: boolean;
  /** AI-generated templates only. */
  aiRoles?: AIRole[];
  changeMechanisms?: string[];
  assumptions?: string[];
  provenance?: { generationId: string; provider: string; model: string; generatedAt: string; requiresValidation: boolean; packId?: string; packVersion?: number };
}

/** Shared-catalogue changes made through Library maintenance (all versions are kept). */
export interface CatalogueOverlay {
  versions: ChangeTemplate[];
  deprecated: Record<string, boolean>;
  updatedAt: string | null;
}

export const DIM_ID: Record<DimCode, string> = { OM: 'dim_om', PR: 'dim_pr', OS: 'dim_os', TE: 'dim_te', IM: 'dim_im' };
export const DIM_CODE_BY_ID: Record<string, DimCode> = { dim_om: 'OM', dim_pr: 'PR', dim_os: 'OS', dim_te: 'TE', dim_im: 'IM' };

/** Catalogue function navigation. Engagement functions are prioritised in the UI. */
export const CATALOGUE_FUNCTIONS = [
  'Enterprise', 'Finance & Accounting', 'Human Resources', 'Procurement', 'IT', 'Supply Chain', 'Customer Service',
  'Risk & Compliance', 'Legal Operations', 'Administration & Facilities', 'Data & Analytics',
] as const;

export const FUNCTION_SHORT: Record<string, string> = {
  Enterprise: 'Enterprise-wide', 'Finance & Accounting': 'Finance', 'Human Resources': 'HR', Procurement: 'Procurement', IT: 'IT',
  'Supply Chain': 'Supply Chain', 'Customer Service': 'Customer Service', 'Risk & Compliance': 'Risk & Compliance', 'Legal Operations': 'Legal',
  'Administration & Facilities': 'Admin & Facilities', 'Data & Analytics': 'Data & Analytics',
};
