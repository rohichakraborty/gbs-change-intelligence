// Schema migrations for stored engagements. Idempotent: only fills what is missing,
// never rewrites consultant data. v1 → v2 adds template-derived change support.
import type { ChangeRecord, EngagementState, Stakeholder } from './types';
import { STAKEHOLDER_LIBRARY } from './library';
import { uid } from './util';

export const CURRENT_SCHEMA = 2;

export function migrateState(input: EngagementState): EngagementState {
  const s = input as EngagementState & Record<string, unknown>;
  if ((s.schemaVersion ?? 1) >= CURRENT_SCHEMA && s.changeAssessments && s.importQueue) return s;
  const changes = (s.changes ?? []).map((c) => {
    const x = c as Partial<ChangeRecord> & ChangeRecord;
    return {
      ...x,
      source: x.source ?? (x.templateId ? 'template' : 'custom'),
      templateId: x.templateId ?? null,
      templateVersion: x.templateVersion ?? null,
      active: x.active ?? true,
      functionTags: x.functionTags ?? (x.functionName ? [x.functionName] : []),
      processTags: x.processTags ?? (x.process ? [x.process] : []),
      entities: x.entities ?? [],
      clarificationAnswers: x.clarificationAnswers ?? {},
      scopeOverrides: x.scopeOverrides ?? [],
      customDescription: x.customDescription ?? '',
      // Manually entered changes were written by the consultant, so their text is not a library default.
      defaultsReviewed: x.defaultsReviewed ?? true,
      selectedAt: x.selectedAt ?? null,
      lastModifiedAt: x.lastModifiedAt ?? null,
    } as ChangeRecord;
  });
  // New library stakeholder types; correct archetypes only where the consultant has not changed them.
  const stakeholders: Stakeholder[] = (s.stakeholders ?? []).map((st) => {
    if (st.libraryKey === 'cdo' && st.archetype === 'cxo_other') return { ...st, archetype: 'cxo_data' };
    if (st.libraryKey === 'cpo' && st.archetype === 'cxo_other') return { ...st, archetype: 'cxo_procurement' };
    return st;
  });
  for (const g of STAKEHOLDER_LIBRARY) {
    const gid = `grp_${g.code}`;
    g.members.forEach((t, i) => {
      if (stakeholders.some((x) => x.libraryKey === t.key)) return;
      if (!(s.groups ?? []).some((x) => x.id === gid)) return;
      stakeholders.push({
        id: uid('st'), groupId: gid, roleName: t.roleName, archetype: t.archetype, libraryKey: t.key, isCustom: false, selected: false,
        entity: '', functionName: '', geography: '', waveIds: [], population: null, owner: '', influence: null, readiness: 'unknown',
        roles: { ...t.roles }, responsibilities: '', dependencies: '', notes: '', sortOrder: i * 10 + 5,
      });
    });
  }
  return {
    ...s, schemaVersion: CURRENT_SCHEMA, changes, stakeholders,
    changeAssessments: (s.changeAssessments as EngagementState['changeAssessments']) ?? {},
    templateSnapshots: (s.templateSnapshots as EngagementState['templateSnapshots']) ?? {},
    importQueue: (s.importQueue as EngagementState['importQueue']) ?? [],
    lastPropagation: (s.lastPropagation as EngagementState['lastPropagation']) ?? null,
  };
}
