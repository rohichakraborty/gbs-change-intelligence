// Generation context and prompts. Context is assembled from whatever the
// engagement already holds; nothing is required beyond a function name.
import type { EngagementState } from '../domain/types';
import { ARCHETYPE_LABELS, MILESTONE_LIBRARY, OBJECTIVES } from '../domain/library';
import { fmtDate } from '../domain/util';
import type { AIRole, DimCode } from '../catalogue/types';
import { RELATIONSHIPS, SCHEMA_ID } from './schema';

export interface GenerationInput {
  function: string;
  functionDescription: string;
  processes: string[];
  technologies: string[];
  documentExcerpt: string;
}

export const DIM_DEFINITIONS: Record<DimCode, { name: string; definition: string }> = {
  OM: { name: 'Change in Operating Model', definition: 'Where and by whom services are delivered: service ownership, delivery location, centralisation, governance and decision rights, SLAs, retained vs GBS responsibilities.' },
  PR: { name: 'Change in Process', definition: 'How the work is done: redesigned or standardised process steps, approvals, controls, hand-offs, policies, and exception handling.' },
  OS: { name: 'Change in Organization Structure', definition: 'People and organisation: transfers to GBS, new or modified roles, reporting lines, spans of control, new teams and leadership roles.' },
  TE: { name: 'Change in Technology', definition: 'Systems and tools used to perform or deliver the service: new platforms, upgrades, consolidation, automation, access, data and reporting tools.' },
  IM: { name: 'Change in Interaction Model', definition: 'How stakeholders request, receive and escalate services: contact points, intake channels, service desks, relationship management, service reviews and feedback.' },
};

export function buildContext(s: EngagementState, input: GenerationInput) {
  const e = s.engagement;
  const fnRec = e.functions.find((f) => f.name.toLowerCase() === input.function.toLowerCase());
  const existing = s.changes.filter((c) => c.active && (c.functionTags.includes(input.function) || c.functionName === input.function)).map((c) => c.title);
  return {
    engagementType: e.transformationTypes.length ? e.transformationTypes : ['GBS/GCC transformation (type not specified)'],
    transformationApproach: fnRec?.approach || 'not specified',
    selectedFunction: input.function,
    functionDescription: input.functionDescription || 'not provided',
    processesInScope: input.processes.length ? input.processes : ['not specified — infer typical processes for this function'],
    currentServiceDeliveryModel: e.originOrg || 'not specified',
    futureGbsModel: [e.destinationOrg, e.gbsLocations.length ? `GBS/GCC location(s): ${e.gbsLocations.join(', ')}` : ''].filter(Boolean).join('; ') || 'not specified',
    geographies: e.geographies.length ? e.geographies : ['not specified'],
    transitionWaves: s.waves.map((w) => ({ name: w.name, goLive: fmtDate(w.goLiveDate, 'not set'), functions: w.functions })),
    technologiesKnown: input.technologies.length ? input.technologies : ['not specified'],
    industry: e.industry || 'not specified',
    existingSelectedChangesForThisFunction: existing.slice(0, 60),
    stakeholderRegisterRoles: s.stakeholders.filter((x) => x.selected).map((x) => x.roleName),
    documentExcerpt: input.documentExcerpt ? input.documentExcerpt.slice(0, 6000) : 'none provided',
  };
}

export const SYSTEM = `You are an experienced GBS/GCC transformation and Change Management consultant.
You identify realistic, specific transformation changes for a business function moving into, or changing within, a Global Business Services (GBS) or Global Capability Centre (GCC) model, and the stakeholder roles they affect.
Rules:
- Phrase every change as a selectable transformation scenario: what concretely changes, for which activity. Good: "Ownership of sales order processing transfers from regional teams to GBS". Bad: "Improve sales operations".
- Be specific to the named function and its real processes. Never pad a list with generic or irrelevant items to reach a number.
- Distinguish a real impact on a role (its responsibilities, reporting, tools, or ways of working change) from governance relevance (it must approve or oversee) and communication relevance (it needs to know). Do not mark executives as impacted merely for being senior.
- When a relationship depends on something unknown, use "requires_review" and state the condition in the reason.
- Everything is a preliminary hypothesis for consultant validation. Do not invent client facts, numbers, names, dates, or contractual terms.
- Reply with ONLY one JSON object matching the requested schema. No prose before or after.`;

const ARCHETYPE_LIST = Object.entries(ARCHETYPE_LABELS).map(([k, v]) => `${k} (${v})`).join('; ');

export function rolesPrompt(ctx: ReturnType<typeof buildContext>): string {
  return `TASK: ROLES_REQUEST
Identify the stakeholder roles relevant to changes in the function "${ctx.selectedFunction}" for this engagement.

ENGAGEMENT CONTEXT (JSON):
${JSON.stringify(ctx, null, 2)}

Instructions:
- List 8 to 16 roles: the accountable executive, function leadership, process and team roles, specialist or system roles (for example a CRM administrator), the receiving GBS-side role(s), and recipient groups (internal users, customers, suppliers) where genuinely relevant.
- Where a role in stakeholderRegisterRoles already fits, reuse that exact name.
- If the function name is ambiguous or unusual, state how you interpreted it in functionInterpretation and explain the ambiguity in clarityWarning; otherwise set clarityWarning to null.
- archetype must be one of: ${ARCHETYPE_LIST}.

Reply with only this JSON shape:
{"schemaVersion":"${SCHEMA_ID}","functionInterpretation":"…","clarityWarning":null,"roles":[{"role":"Head of Sales Operations","archetype":"function_head","functionSpecific":true,"description":"Accountable for sales operations delivery"}]}`;
}

export function dimensionPrompt(ctx: ReturnType<typeof buildContext>, dim: DimCode, roles: AIRole[], avoid: string[], mode: 'initial' | 'more'): string {
  const d = DIM_DEFINITIONS[dim];
  const milestones = Array.from(new Set(MILESTONE_LIBRARY.map((m) => m.name)));
  return `TASK: DIMENSION_REQUEST ${dim}
Generate candidate transformation changes for the function "${ctx.selectedFunction}" under the dimension "${d.name}".
Dimension definition: ${d.definition}

ENGAGEMENT CONTEXT (JSON):
${JSON.stringify(ctx, null, 2)}

STAKEHOLDER ROLES (use these exact names in stakeholderRelationships; add a new role only if clearly needed):
${roles.map((r) => `- ${r.role} [${r.archetype}]`).join('\n')}

DO NOT DUPLICATE these existing or already-suggested changes:
${avoid.length ? avoid.slice(0, 120).map((x) => `- ${x}`).join('\n') : '- (none)'}

Instructions:
- ${mode === 'more' ? 'Add up to 8 further distinct changes not covered above.' : 'Aim for roughly 10 to 15 meaningful changes; fewer is correct if fewer are genuinely relevant for this dimension and function.'}
- primaryDimension must be "${d.name}" for every change.
- processArea: the specific sub-function or process affected.
- stakeholderRelationships: 3 to 8 per change, each with relationship one of ${RELATIONSHIPS.join(', ')}. Include the GBS-side role when GBS takes on work. Use requires_review for conditional relevance (for example a data officer only if data governance changes).
- possibleMilestones: up to 4 names chosen from: ${milestones.join('; ')}.
- communicationObjectives: from ${Object.keys(OBJECTIVES).join(', ')}.
- assumptions: what must be true for this change to apply; requiresValidation: true.

Reply with only this JSON shape:
{"schemaVersion":"${SCHEMA_ID}","changes":[{"temporaryId":"${dim}-001","title":"…","primaryDimension":"${d.name}","function":"${ctx.selectedFunction}","processArea":"…","description":"…","typicalAsIs":"…","typicalToBe":"…","changeMechanisms":["service_ownership"],"stakeholderRelationships":[{"role":"…","relationship":"potential_direct_impact","reason":"…"}],"possibleMilestones":["…"],"communicationObjectives":["align"],"assumptions":["…"],"requiresValidation":true}]}`;
}

export function repairPrompt(original: string, problem: string): string {
  return `${original}

YOUR PREVIOUS REPLY COULD NOT BE USED: ${problem}
Reply again with ONLY the JSON object in exactly the requested shape. Keep every required field; keep text concise.`;
}
