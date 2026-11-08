// Shared matrix builders used by both the UI and the exporters, so exported
// deliverables always match what the consultant sees on screen.
import type { EngagementState, Milestone, Phase, Stakeholder, StakeholderGroup } from '../domain/types';
import { formatT } from '../domain/util';
import type { CommView, Derived } from './derive';
import { roleShort } from './communicator';
import { milestoneOffset, waveName } from './timing';

export interface GroupedStakeholders { group: StakeholderGroup; members: Stakeholder[] }

export function groupStakeholders(s: EngagementState, sts: Stakeholder[]): GroupedStakeholders[] {
  return s.groups
    .slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ group: g, members: sts.filter((x) => x.groupId === g.id) }))
    .filter((g) => g.members.length);
}

export interface PhaseRows { phase: Phase; milestones: Milestone[] }

export function groupMilestones(s: EngagementState, ms: Milestone[]): PhaseRows[] {
  return s.phases.map((p) => ({ phase: p, milestones: ms.filter((m) => m.phaseId === p.id) })).filter((x) => x.milestones.length);
}

export function milestoneLabel(s: EngagementState, m: Milestone): string {
  const w = m.waveId && s.waves.length > 1 ? ` [${waveName(s, m.waveId)}]` : '';
  const k = m.kind === 'recurring' ? ` (${m.recurrence?.cadence ?? 'recurring'})` : m.kind !== 'milestone' ? ` (${m.kind})` : '';
  return `${m.name}${w}${k}`;
}

export function timingLabel(s: EngagementState, m: Milestone): string {
  if (m.kind === 'recurring') return m.recurrence ? m.recurrence.cadence[0].toUpperCase() + m.recurrence.cadence.slice(1) : 'Recurring';
  if (m.kind !== 'milestone') return 'As needed';
  return formatT(milestoneOffset(s, m));
}

export const IMPACT_SYMBOL = { impacted: '✓', not_impacted: '×', review: '?' } as const;

export function impactCellText(d: Derived, stId: string, dimId: string): string {
  const e = d.impacts.get(`${stId}|${dimId}`);
  return e ? IMPACT_SYMBOL[e.classification] : '';
}

export type CommMatrixKind = 'audience' | 'communicator' | 'channel';

export function cellComms(d: Derived, mId: string, stId: string): CommView[] {
  return (d.commsByCell.get(`${mId}|${stId}`) ?? []).filter((c) => c.active);
}

export function commCellText(s: EngagementState, d: Derived, kind: CommMatrixKind, mId: string, stId: string): string {
  const cs = cellComms(d, mId, stId);
  if (!cs.length) return d.suggestions.some((x) => x.kind === 'add' && x.milestoneId === mId && x.stakeholderId === stId) && kind === 'audience' ? '?' : '';
  if (kind === 'audience') return '✓';
  if (kind === 'communicator') {
    return cs.map((c) => c.roles.primary ? [roleShort(s, c.roles.primary), ...c.roles.supporting.map((r) => `+${roleShort(s, r)}`)].join(' ') : 'Review').join(' / ');
  }
  return cs.map((c) => {
    const p = c.channels.primary ? s.channels.find((x) => x.id === c.channels.primary)?.name ?? '' : 'No channel';
    const extra = c.channels.secondary.length + (c.channels.reinforcement ? 1 : 0) + (c.channels.followUp ? 1 : 0);
    return `${p}${extra ? ` (+${extra})` : ''}`;
  }).join(' / ');
}
