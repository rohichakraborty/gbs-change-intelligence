// ---------------------------------------------------------------------------
// Derivation layer: every matrix, recommendation, conflict flag, and
// validation issue is computed from the canonical records here.
// ---------------------------------------------------------------------------
import type {
  Artifact, ArtifactType, ChangeDimension, ChangeRecord, ChannelPlan, CommunicationRecord, EngagementState,
  MessageBrief, Milestone, RoleAssignment, Stakeholder,
} from '../domain/types';
import { CT } from '../domain/library';
import { hash } from '../domain/util';
import { effectiveImpact, recommendImpact, type EffectiveImpact, type ImpactRec } from './impact';
import { recommendAudience, type AudienceRec } from './audience';
import { recommendCommunicator, roleName, type RoleRec } from './communicator';
import { recommendChannels, type ChannelRec } from './channel';
import { recommendMessage } from './messaging';
import { commPlannedDate, milestoneDate, milestoneOffset } from './timing';
import { artifactSourceFingerprint, recommendArtifactTypes } from './artifactMeta';

export interface CommView {
  rec: CommunicationRecord;
  milestone: Milestone;
  audience: Stakeholder;
  active: boolean;
  outOfScopeReason: string | null;
  audienceRec: AudienceRec | null;
  changeIds: string[];
  changes: ChangeRecord[];
  rolesRec: RoleRec;
  roles: RoleAssignment;
  rolesOverridden: boolean;
  rolesConflict: boolean;
  channelRec: ChannelRec;
  channels: ChannelPlan;
  channelsOverridden: boolean;
  channelsConflict: boolean;
  disabledInUse: string[];
  briefRec: MessageBrief;
  brief: MessageBrief;
  messageOverridden: boolean;
  plannedDate: string | null;
  milestoneDate: string | null;
  offset: number | null;
  fingerprint: string;
  upstreamChanged: boolean;
  sensitive: boolean;
  readinessGaps: string[];
  executionReady: boolean;
  artifacts: Artifact[];
  artifactTypes: ArtifactType[];
}

export interface Suggestion {
  key: string;
  kind: 'add' | 'remove';
  milestoneId: string;
  stakeholderId: string;
  commId?: string;
  text: string;
  fingerprint: string;
}

export type IssueSeverity = 'critical' | 'warning' | 'info';
export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: string;
  message: string;
  view: string;
  targetId?: string;
}

export interface ArtifactState {
  outdated: boolean;
  reasons: string[];
}

export interface Derived {
  selectedDims: ChangeDimension[];
  selectedStakeholders: Stakeholder[];
  activeMilestones: Milestone[];
  impactRecs: Map<string, ImpactRec>;
  impacts: Map<string, EffectiveImpact>;
  audienceRecs: Map<string, AudienceRec>;
  comms: CommView[];
  commById: Map<string, CommView>;
  activeComms: CommView[];
  commsByCell: Map<string, CommView[]>;
  suggestions: Suggestion[];
  artifactStates: Map<string, ArtifactState>;
  issues: Issue[];
}

const cache = new WeakMap<EngagementState, Derived>();

const ACTIVE_STATUSES = new Set(['proposed', 'needs_review', 'confirmed', 'draft_prepared', 'pending_approval', 'approved', 'ready', 'completed']);
const CONFIRMED_PLUS = new Set(['confirmed', 'draft_prepared', 'pending_approval', 'approved', 'ready', 'completed']);

const sameRoles = (a: RoleAssignment, b: RoleAssignment) =>
  a.primary === b.primary && a.owner === b.owner && a.creator === b.creator &&
  [...a.supporting].sort().join() === [...b.supporting].sort().join() && [...a.approvers].sort().join() === [...b.approvers].sort().join();
const sameChannels = (a: ChannelPlan, b: ChannelPlan) =>
  a.primary === b.primary && a.reinforcement === b.reinforcement && a.followUp === b.followUp && [...a.secondary].sort().join() === [...b.secondary].sort().join();

export function sortMilestones(s: EngagementState, ms: Milestone[]): Milestone[] {
  const phaseIdx = new Map(s.phases.map((p) => [p.id, p.num]));
  return [...ms].sort((a, b) => {
    const pa = phaseIdx.get(a.phaseId) ?? 99, pb = phaseIdx.get(b.phaseId) ?? 99;
    if (pa !== pb) return pa - pb;
    if (a.kind === 'recurring' && b.kind !== 'recurring') return -1;
    if (b.kind === 'recurring' && a.kind !== 'recurring') return 1;
    const da = milestoneDate(s, a), db = milestoneDate(s, b);
    if (da && db && da !== db) return da < db ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

export function sortStakeholders(s: EngagementState, sts: Stakeholder[]): Stakeholder[] {
  const gIdx = new Map(s.groups.map((g) => [g.id, g.sortOrder]));
  return [...sts].sort((a, b) => (gIdx.get(a.groupId) ?? 99) - (gIdx.get(b.groupId) ?? 99) || a.sortOrder - b.sortOrder);
}

export function derive(s: EngagementState): Derived {
  const hit = cache.get(s);
  if (hit) return hit;

  const selectedDims = s.dimensions.filter((d) => s.engagement.selectedDimensionIds.includes(d.id));
  const selectedStakeholders = sortStakeholders(s, s.stakeholders.filter((x) => x.selected));
  const activeMilestones = sortMilestones(s, s.milestones.filter((m) => m.selected));

  // 1. Impact
  const impactRecs = new Map<string, ImpactRec>();
  const impacts = new Map<string, EffectiveImpact>();
  for (const st of selectedStakeholders) {
    for (const d of selectedDims) {
      const key = `${st.id}|${d.id}`;
      const rec = recommendImpact(s, st, d.id);
      impactRecs.set(key, rec);
      impacts.set(key, effectiveImpact(rec, s.assessments[key]));
    }
  }

  // 2. Audience
  const audienceRecs = new Map<string, AudienceRec>();
  for (const m of activeMilestones) {
    for (const st of selectedStakeholders) {
      const r = recommendAudience(s, m, st, impacts);
      if (r) audienceRecs.set(`${m.id}|${st.id}`, r);
    }
  }

  // 3. Communication records (communicator, channel, messaging)
  const msById = new Map(s.milestones.map((m) => [m.id, m]));
  const stById = new Map(s.stakeholders.map((x) => [x.id, x]));
  const enabled = new Set(s.channels.filter((c) => c.enabled).map((c) => c.id));
  const comms: CommView[] = [];
  for (const rec of s.comms) {
    const milestone = msById.get(rec.milestoneId);
    const audience = stById.get(rec.audienceId);
    if (!milestone || !audience) continue;
    const audienceRec = audienceRecs.get(`${rec.milestoneId}|${rec.audienceId}`) ?? null;
    const outOfScopeReason = !milestone.selected ? 'Milestone is not selected for this engagement.' : !audience.selected ? 'Audience is not selected in the stakeholder register.' : null;
    const changeIds = rec.changeIdsOverride ?? audienceRec?.changeIds ?? [];
    const changes = s.changes.filter((c) => changeIds.includes(c.id));
    const rolesRec = recommendCommunicator(s, rec, audience, milestone, changeIds);
    const roles = rec.rolesOverride ?? rolesRec.assignment;
    const channelRec = recommendChannels(s, rec, audience, milestone);
    const channels = rec.channelsOverride ?? channelRec.plan;
    const allCh = [channels.primary, ...channels.secondary, channels.reinforcement, channels.followUp].filter((x): x is string => !!x);
    const disabledInUse = allCh.filter((id) => !enabled.has(id));
    const briefRec = recommendMessage({ s, c: rec, st: audience, m: milestone, changes, roles, channels, impacts });
    const brief = { ...briefRec, ...(rec.messageOverride ?? {}) } as MessageBrief;
    const plannedDate = commPlannedDate(s, rec, milestone);
    const mDate = milestoneDate(s, milestone);
    const fingerprint = hash([audienceRec?.fingerprint ?? 'none', rolesRec.assignment, channelRec.plan, plannedDate, changeIds, rec.objective, rec.commTypeId]);
    const sensitive = rec.commTypeId === CT.sensitive || rec.commTypeId === CT.crisis;
    const readinessGaps: string[] = [];
    if (!roles.primary) readinessGaps.push('No primary communicator assigned.');
    if (!roles.owner) readinessGaps.push('No communication owner assigned.');
    if (!roles.approvers.length) readinessGaps.push('No content approver assigned.');
    if (!channels.primary) readinessGaps.push('No primary channel selected.');
    if (disabledInUse.length) readinessGaps.push(`Uses disabled channel(s): ${disabledInUse.map((id) => s.channels.find((c) => c.id === id)?.name).join(', ')}.`);
    if (sensitive && !rec.hrReviewed && rec.commTypeId === CT.sensitive) readinessGaps.push('Sensitive communication — HR review not recorded.');
    if (!plannedDate) readinessGaps.push('No planned date (milestone date or go-live missing).');
    const artifacts = s.artifacts.filter((a) => a.communicationRecordId === rec.id);
    comms.push({
      rec, milestone, audience, active: !outOfScopeReason && ACTIVE_STATUSES.has(rec.status), outOfScopeReason, audienceRec,
      changeIds, changes, rolesRec, roles, rolesOverridden: !!rec.rolesOverride,
      rolesConflict: !!rec.rolesOverride && !sameRoles(rec.rolesOverride, rolesRec.assignment),
      channelRec, channels, channelsOverridden: !!rec.channelsOverride,
      channelsConflict: !!rec.channelsOverride && !sameChannels(rec.channelsOverride, channelRec.plan),
      disabledInUse, briefRec, brief, messageOverridden: !!rec.messageOverride && Object.keys(rec.messageOverride).length > 0,
      plannedDate, milestoneDate: mDate, offset: milestoneOffset(s, milestone), fingerprint,
      upstreamChanged: !!rec.reviewedFingerprint && rec.reviewedFingerprint !== fingerprint && CONFIRMED_PLUS.has(rec.status),
      sensitive, readinessGaps, executionReady: readinessGaps.length === 0, artifacts, artifactTypes: [],
    });
  }
  for (const v of comms) v.artifactTypes = recommendArtifactTypes(s, v);
  const commById = new Map(comms.map((c) => [c.rec.id, c]));
  const activeComms = comms.filter((c) => c.active);
  const commsByCell = new Map<string, CommView[]>();
  for (const c of comms) {
    if (c.outOfScopeReason) continue;
    const k = `${c.rec.milestoneId}|${c.rec.audienceId}`;
    if (!commsByCell.has(k)) commsByCell.set(k, []);
    commsByCell.get(k)!.push(c);
  }

  // 4. Suggestions (diff between live recommendations and stored records)
  const suggestions: Suggestion[] = [];
  for (const [key, ar] of audienceRecs) {
    if (commsByCell.has(key)) continue;
    const fp = ar.fingerprint;
    if (s.dismissedSuggestions[`add|${key}`] === fp) continue;
    const st = stById.get(ar.stakeholderId)!;
    const m = msById.get(ar.milestoneId)!;
    suggestions.push({ key: `add|${key}`, kind: 'add', milestoneId: ar.milestoneId, stakeholderId: ar.stakeholderId, fingerprint: fp,
      text: `Add ${st.roleName} at "${m.name}" — ${ar.reasons[0]?.text ?? ''}` });
  }
  for (const c of comms) {
    if (c.outOfScopeReason || c.rec.origin !== 'rule' || c.audienceRec || !ACTIVE_STATUSES.has(c.rec.status)) continue;
    const key = `remove|${c.rec.id}`;
    if (s.dismissedSuggestions[key] === 'none') continue;
    suggestions.push({ key, kind: 'remove', milestoneId: c.rec.milestoneId, stakeholderId: c.rec.audienceId, commId: c.rec.id, fingerprint: 'none',
      text: `${c.audience.roleName} at "${c.milestone.name}" is no longer recommended by the rules (upstream inputs changed).` });
  }

  // 5. Artifact staleness
  const artifactStates = new Map<string, ArtifactState>();
  for (const a of s.artifacts) {
    const v = commById.get(a.communicationRecordId);
    const cur = a.versions[a.versions.length - 1];
    if (!v) { artifactStates.set(a.id, { outdated: true, reasons: ['Linked communication record no longer exists.'] }); continue; }
    const fp = artifactSourceFingerprint(s, v);
    const reasons: string[] = [];
    if (cur && fp.hash !== cur.sourceFingerprint) {
      reasons.push('Source data changed since this version was generated (dates, communicator, channel, messaging, or linked change records).');
    }
    artifactStates.set(a.id, { outdated: reasons.length > 0, reasons });
  }

  // 6. Validation issues
  const issues: Issue[] = [];
  const push = (severity: Issue['severity'], category: string, message: string, view: string, targetId?: string) =>
    issues.push({ id: `${category}|${targetId ?? message}`, severity, category, message, view, targetId });
  for (const c of activeComms) {
    if (c.rec.status === 'completed' || c.rec.status === 'cancelled') continue;
    const label = `${c.rec.code} · ${c.audience.roleName} @ ${c.milestone.name}`;
    if (!c.roles.primary) push('critical', 'Missing communicator', `${label}: no primary communicator.`, 'communicator-matrix', c.rec.id);
    if (!c.roles.approvers.length) push('warning', 'Missing approver', `${label}: no content approver.`, 'communication-plan', c.rec.id);
    if (c.disabledInUse.length) push('critical', 'Disabled channel', `${label}: uses a disabled channel.`, 'channel-matrix', c.rec.id);
    if (!c.channels.primary) push('critical', 'Missing channel', `${label}: no enabled primary channel.`, 'channel-matrix', c.rec.id);
    if (c.rec.commTypeId === CT.sensitive && !c.rec.hrReviewed) push('warning', 'HR review', `${label}: sensitive communication awaiting HR review.`, 'communication-plan', c.rec.id);
    if (c.plannedDate && c.milestoneDate && c.plannedDate > c.milestoneDate && c.milestone.kind === 'milestone') push('warning', 'Timing conflict', `${label}: planned ${c.plannedDate} is after the milestone date ${c.milestoneDate}.`, 'communication-plan', c.rec.id);
    if (c.upstreamChanged) push('warning', 'Upstream change', `${label}: upstream inputs changed since it was confirmed — review.`, 'communication-plan', c.rec.id);
    if (c.rolesConflict) push('info', 'Override differs', `${label}: communicator override differs from the current recommendation.`, 'communicator-matrix', c.rec.id);
    if (CONFIRMED_PLUS.has(c.rec.status) && c.artifactTypes.length && !c.artifacts.length && c.milestone.kind === 'milestone') push('info', 'Missing artifact', `${label}: confirmed but no artifact generated.`, 'artifact-studio', c.rec.id);
    if (c.rec.status === 'needs_review' || c.rec.status === 'proposed') { /* counted separately */ }
  }
  for (const a of s.artifacts) {
    if (artifactStates.get(a.id)?.outdated) push('warning', 'Outdated artifact', `${a.code} "${a.title}" may contain outdated information.`, 'artifact-studio', a.id);
  }
  for (const c of s.changes) {
    const m = c.milestoneId ? msById.get(c.milestoneId) : undefined;
    const md = m && m.selected ? milestoneDate(s, m) : null;
    if (c.effectiveDate && md && c.effectiveDate !== md) push('warning', 'Date inconsistency', `${c.code} effective date (${c.effectiveDate}) differs from its linked milestone "${m!.name}" (${md}). Confirm which date is correct.`, 'change-identification', c.id);
  }
  const undated = activeMilestones.filter((m) => m.kind === 'milestone' && !milestoneDate(s, m));
  if (undated.length) push('warning', 'Missing dates', `${undated.length} selected milestone(s) have no date: ${undated.slice(0, 4).map((m) => m.name).join(', ')}${undated.length > 4 ? '…' : ''}.`, 'milestone-planner');
  if (s.engagement.plannedGoLive && s.waves.length && !s.waves.some((w) => w.goLiveDate === s.engagement.plannedGoLive)) {
    push('warning', 'Go-live inconsistency', `Engagement planned go-live (${s.engagement.plannedGoLive}) does not match any wave go-live date.`, 'engagement-setup');
  }
  if (s.waves.some((w) => !w.goLiveDate)) push('warning', 'Missing dates', `Wave go-live date missing for ${s.waves.filter((w) => !w.goLiveDate).map((w) => w.name).join(', ')}.`, 'engagement-setup');
  // Directly impacted audiences with no active communication.
  for (const st of selectedStakeholders) {
    const direct = selectedDims.some((d) => impacts.get(`${st.id}|${d.id}`)?.directness === 'direct' && impacts.get(`${st.id}|${d.id}`)?.classification === 'impacted');
    if (direct && s.comms.length && !activeComms.some((c) => c.rec.audienceId === st.id)) push('warning', 'Missing audience', `${st.roleName} is directly impacted but has no planned communication.`, 'audience-matrix', st.id);
  }
  let reviewCells = 0, conflicts = 0;
  for (const [k, e] of impacts) { if (e.classification === 'review' && e.source === 'rule') reviewCells++; if (e.conflict) { conflicts++; push('warning', 'Assessment conflict', `Impact override for ${stById.get(k.split('|')[0])?.roleName} × ${s.dimensions.find((d) => d.id === k.split('|')[1])?.short} differs from the current recommendation.`, 'impact-assessment', k); } }
  if (reviewCells) push('info', 'Assessment review', `${reviewCells} impact cell(s) cannot be determined from current information and need consultant review.`, 'impact-assessment');
  const usedRoles = new Set(activeComms.flatMap((c) => [c.roles.primary, c.roles.owner, ...c.roles.approvers]).filter(Boolean) as string[]);
  const unnamed = [...usedRoles].filter((id) => !s.engagement.governance.some((g) => g.communicatorRoleId === id && g.personName.trim()));
  if (unnamed.length) push('info', 'Governance gap', `${unnamed.length} communicator/approver role(s) in use have no named person: ${unnamed.slice(0, 4).map((id) => roleName(s, id)).join(', ')}${unnamed.length > 4 ? '…' : ''}.`, 'engagement-setup');
  const outOfScopeConfirmed = comms.filter((c) => c.outOfScopeReason && CONFIRMED_PLUS.has(c.rec.status));
  if (outOfScopeConfirmed.length) push('info', 'Out of scope', `${outOfScopeConfirmed.length} confirmed communication(s) belong to deselected milestones or audiences and are retained but inactive.`, 'communication-plan');

  const order = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  const d: Derived = { selectedDims, selectedStakeholders, activeMilestones, impactRecs, impacts, audienceRecs, comms, commById, activeComms, commsByCell, suggestions, artifactStates, issues };
  cache.set(s, d);
  return d;
}
