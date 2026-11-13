import type {
  ChangeRecord, CommunicationRecord, Engagement, EngagementState, GovernanceRole, Milestone, Stakeholder, StakeholderGroup, TimeUnit,
} from './types';
import {
  CHANNEL_LIBRARY, COMMUNICATOR_ROLES, COMM_TYPES, DEFAULT_DIMENSIONS, DEFAULT_FRAMEWORK, MILESTONE_LIBRARY, PHASES,
  STAKEHOLDER_LIBRARY, type MilestoneTemplate,
} from './library';
import { nowIso, uid } from './util';
import type { AudienceRec } from '../engine/audience';

export const SCHEMA_VERSION = 2;

export const DEFAULT_GOVERNANCE: { title: string; role: string | null }[] = [
  { title: 'Executive Sponsor', role: 'cr_ceo' },
  { title: 'Programme Sponsor', role: null },
  { title: 'Programme Manager', role: 'cr_programme_head' },
  { title: 'GBS/GCC Head', role: 'cr_gbs_head' },
  { title: 'Change Management Lead', role: 'cr_change_lead' },
  { title: 'HR Lead', role: 'cr_hr_lead' },
  { title: 'CHRO / HR Leadership', role: 'cr_chro' },
  { title: 'CFO', role: 'cr_cfo' },
  { title: 'Communication Lead', role: 'cr_corp_comms' },
  { title: 'Legal/Compliance Approver', role: 'cr_legal' },
  { title: 'PMO Lead', role: 'cr_pmo' },
  { title: 'Training Lead', role: 'cr_training' },
  { title: 'IT Lead', role: 'cr_it_lead' },
  { title: 'Procurement Lead', role: 'cr_procurement' },
  { title: 'Functional Sponsor', role: 'cr_function_head' },
  { title: 'HR Business Partner lead', role: 'cr_hrbp' },
];

export function scaleOffset(monthsOffset: number, unit: TimeUnit): number {
  if (unit === 'months') return monthsOffset;
  if (unit === 'weeks') return Math.round(monthsOffset * 4.35);
  return Math.round(monthsOffset * 30.44);
}

export function milestoneFromTemplate(t: MilestoneTemplate, unit: TimeUnit, sortOrder: number, waveId: string | null = null): Milestone {
  return {
    id: uid('ms'), phaseId: t.phaseId, libraryKey: t.key, name: t.name, description: t.objective, selected: false,
    kind: t.kind ?? 'milestone', waveId, anchor: 'relative', date: null, relativeOffset: scaleOffset(t.defaultOffset, unit),
    owner: '', dependencies: [], gating: '', functions: [], sortOrder,
    trigger: { required: t.required, focus: [...t.focus], objective: t.objective, leadTime: t.lead, followUp: '', artifactHints: [...t.hints] },
    recurrence: t.kind === 'recurring' ? { cadence: t.key === 'steerco' ? 'biweekly' : 'weekly', until: 'Hypercare closure' } : null,
  };
}

export function buildStakeholderLibrary(): { groups: StakeholderGroup[]; stakeholders: Stakeholder[] } {
  const groups: StakeholderGroup[] = [];
  const stakeholders: Stakeholder[] = [];
  STAKEHOLDER_LIBRARY.forEach((g, gi) => {
    const gid = `grp_${g.code}`;
    groups.push({ id: gid, code: g.code, name: g.name, sortOrder: gi });
    g.members.forEach((t, i) => stakeholders.push({
      id: uid('st'), groupId: gid, roleName: t.roleName, archetype: t.archetype, libraryKey: t.key, isCustom: false, selected: false,
      entity: '', functionName: '', geography: '', waveIds: [], population: null, owner: '', influence: null, readiness: 'unknown',
      roles: { ...t.roles }, responsibilities: '', dependencies: '', notes: '', sortOrder: i * 10,
    }));
  });
  return { groups, stakeholders };
}

export function createBlankState(name = 'New engagement'): EngagementState {
  const now = nowIso();
  const governance: GovernanceRole[] = DEFAULT_GOVERNANCE.map((g) => ({ id: uid('gov'), title: g.title, personName: '', communicatorRoleId: g.role }));
  const engagement: Engagement = {
    id: uid('eng'), name, client: '', industry: '', isDemo: false, description: '', entities: [], geographies: [], gbsLocations: [],
    primaryLanguage: 'English', additionalLanguages: [], transformationTypes: [], customType: '', functions: [], startDate: null,
    plannedGoLive: null, timeUnit: 'months', currentPhaseId: 'ph1', originOrg: '', destinationOrg: '', governance,
    confidentiality: 'Confidential — internal draft', selectedDimensionIds: DEFAULT_DIMENSIONS.map((d) => d.id), primaryWaveId: null,
    setupComplete: false, settings: { weights: { responsibilities: 1, relationships: 1, tools: 1, behaviours: 1 }, thresholds: { medium: 1.0, high: 2.0 } },
    createdAt: now, updatedAt: now,
  };
  const waveId = uid('wave');
  const { groups, stakeholders } = buildStakeholderLibrary();
  engagement.primaryWaveId = waveId;
  return {
    schemaVersion: SCHEMA_VERSION, engagement,
    waves: [{ id: waveId, name: 'Wave 1', goLiveDate: null, scope: '', functions: [], geographies: [] }],
    dimensions: DEFAULT_DIMENSIONS.map((d) => ({ ...d })), changes: [], groups, stakeholders, assessments: {},
    phases: PHASES.map((p) => ({ ...p })),
    milestones: MILESTONE_LIBRARY.map((t, i) => milestoneFromTemplate(t, 'months', i * 10)),
    commTypes: COMM_TYPES.map((c) => ({ ...c })), communicatorRoles: COMMUNICATOR_ROLES.map((r) => ({ ...r })),
    framework: JSON.parse(JSON.stringify(DEFAULT_FRAMEWORK)), channels: CHANNEL_LIBRARY.map((c) => ({ ...c, attrs: { ...c.attrs } })),
    comms: [], artifacts: [], kt: [], audit: [], dismissedSuggestions: {}, counters: { change: 0, comm: 0, artifact: 0 },
    changeAssessments: {}, templateSnapshots: {}, importQueue: [], lastPropagation: null,
  };
}

/** A consultant-authored change (secondary to library selection). */
export function customChange(s: EngagementState, dimensionId: string): ChangeRecord {
  s.counters.change = Math.max(s.counters.change + 1, s.changes.length + 1);
  const now = nowIso();
  return {
    id: uid('chg'), code: `CHG-${String(s.counters.change).padStart(3, '0')}`, dimensionId, title: 'New custom change', description: '', asIs: '', toBe: '',
    notChanging: '', rationale: '', functionName: '', geography: '', process: '', effectiveDate: null, milestoneId: null, waveIds: [], peopleAffected: null,
    owner: '', operationalImpact: '', behaviouralImpact: '', dependencies: '', assumptions: '', evidence: '', status: 'draft',
    source: 'custom', templateId: null, templateVersion: null, active: true, functionTags: [], processTags: [], entities: [], clarificationAnswers: {},
    scopeOverrides: [], customDescription: '', defaultsReviewed: true, selectedAt: now, lastModifiedAt: now,
  };
}

export function nextChangeCode(s: EngagementState): string {
  s.counters.change = Math.max(s.counters.change + 1, s.changes.length + 1);
  return `CHG-${String(s.counters.change).padStart(3, '0')}`;
}

export function commFromRec(s: EngagementState, ar: AudienceRec): CommunicationRecord {
  s.counters.comm += 1;
  const now = nowIso();
  return {
    id: uid('com'), code: `COM-${String(s.counters.comm).padStart(3, '0')}`, milestoneId: ar.milestoneId, audienceId: ar.stakeholderId,
    objective: ar.objective, commTypeId: ar.commTypeId, priority: ar.priority, origin: 'rule', manualReason: '', intendedOutcome: ar.intendedOutcome,
    rolesOverride: null, channelsOverride: null, messageOverride: null, changeIdsOverride: null, plannedDateOverride: null,
    status: 'proposed', hrReviewed: false, reviewedFingerprint: null, comments: [], createdAt: now, updatedAt: now,
  };
}
