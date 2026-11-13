// Role register helper shared by library and AI selection paths.
import type { Archetype, EngagementState } from '../domain/types';
import type { AIRole } from '../catalogue/types';
import { matchRole } from '../ai/roles';

/** Add AI-suggested roles to the role register, auto-mapping only exact equivalents. */
export function ensureRoleSuggestions(d: EngagementState, roles: AIRole[], fn: string, generationId: string | null) {
  const selected = d.stakeholders.filter((x) => x.selected);
  for (const r of roles) {
    if (d.roleSuggestions.some((x) => x.key === r.key)) continue;
    const exact = matchRole(r.role, selected).find((m) => m.exact);
    d.roleSuggestions.push({
      key: r.key, role: r.role, archetype: r.archetype as Archetype, functionName: r.functionSpecific ? fn : '', functionSpecific: r.functionSpecific, description: r.description,
      status: exact ? 'mapped' : 'proposed', stakeholderId: exact?.stakeholder.id ?? null, autoMatched: !!exact, generationId,
    });
  }
}

