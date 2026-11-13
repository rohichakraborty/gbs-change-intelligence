import type { ArtifactType, EngagementState } from '../domain/types';
import { CT } from '../domain/library';
import { hash } from '../domain/util';
import { anchorGoLive } from './timing';
import { lensFor } from './messaging';
import { rolePerson } from './communicator';
import { getTemplate } from '../catalogue/registry';
import type { CommView } from './derive';

/** Facts an artifact depends on. A change to any of these flags the artifact as potentially outdated. */
export function artifactSourceFingerprint(s: EngagementState, v: CommView) {
  const facts = {
    engagement: [s.engagement.name, s.engagement.client, s.engagement.gbsLocations, s.engagement.confidentiality],
    dates: [v.plannedDate, v.milestoneDate, anchorGoLive(s, v.milestone.waveId)],
    milestone: v.milestone.name,
    audience: v.audience.roleName,
    roles: [v.roles.primary, rolePerson(s, v.roles.primary), v.roles.approvers, v.roles.approvers.map((id) => rolePerson(s, id))],
    channels: v.channels,
    brief: [v.brief.mainMessage, v.brief.whatIsChanging, v.brief.whatIsNotChanging, v.brief.keyDates, v.brief.requiredActions, v.brief.whyItMatters],
    changes: v.changes.map((c) => [c.title, c.asIs, c.toBe, c.effectiveDate, c.notChanging]),
    kt: s.kt.map((k) => [k.process, k.ktPhase, k.readiness, k.completedActivities, k.openActivities, k.issues]),
  };
  return { hash: hash(facts), facts };
}

/** Artifact template recommendation from milestone, audience, and channel (in priority order). */
export function recommendArtifactTypes(s: EngagementState, v: CommView): ArtifactType[] {
  const out: ArtifactType[] = [];
  const add = (t: ArtifactType) => { if (!out.includes(t)) out.push(t); };
  const lens = lensFor(v.audience.archetype);
  const chans = [v.channels.primary, ...v.channels.secondary, v.channels.reinforcement, v.channels.followUp].filter(Boolean) as string[];
  const key = v.milestone.libraryKey ?? '';

  if (lens === 'supplier') add('vendor');
  if (lens === 'customer') add('customer');
  if (v.rec.commTypeId === CT.sensitive) add('impacted_email');
  if (v.rec.commTypeId === CT.training) { add('training_comm'); add('training_pack'); }
  if (key === 'golive' && lens !== 'executive' && lens !== 'supplier' && lens !== 'customer') add('golive_announcement');
  if (key === 'hypercare_start' || key === 'hypercare_close') add('hypercare');
  if (['kt_start', 'shadow', 'reverse_shadow', 'kt_signoff'].includes(key)) add('kt_report');
  if (v.rec.objective === 'collect_feedback') add('survey');
  if (lens === 'executive' || lens === 'gbs') {
    add(v.rec.objective === 'seek_approval' || v.milestone.kind === 'recurring' || key === 'golive' || key === 'gonogo_live' ? 'exec_briefing' : 'leadership_announcement');
  }
  for (const h of v.milestone.trigger.artifactHints) {
    if (h === 'impacted_email' && !['transferring', 'retained_role', 'employee'].includes(lens)) continue;
    if ((h === 'vendor' && lens !== 'supplier') || (h === 'customer' && lens !== 'customer')) continue;
    if (h === 'exec_briefing' && !['executive', 'gbs', 'programme'].includes(lens)) continue;
    if (h === 'leadership_announcement' && !['executive', 'gbs', 'manager'].includes(lens)) continue;
    if (h === 'manager_cascade' && lens !== 'manager') continue;
    add(h);
  }
  for (const c of chans) {
    if (c === 'ch_townhall' || c === 'ch_webinar') add('townhall_pack');
    if (c === 'ch_manager_cascade') add('manager_cascade');
    if (c === 'ch_faq') add('faq');
    if (c === 'ch_pulse') add('survey');
    if (c === 'ch_kt_report') add('kt_report');
    if (c === 'ch_hypercare_updates') add('hypercare');
    if (c === 'ch_supplier_letter') add('vendor');
    if (c === 'ch_customer_notice') add('customer');
    if (c === 'ch_leadership_briefing' || c === 'ch_gov_memo' || c === 'ch_steerco_report') add('exec_briefing');
  }
  if (lens === 'manager' && v.rec.objective === 'prepare') add('manager_cascade');
  if (lens === 'general' || (chans.includes('ch_email') && (lens === 'employee'))) add('general_announcement');
  if (lens === 'transferring' || lens === 'retained_role') add('impacted_email');
  // Typical artifacts of the linked library templates (lower priority than audience/channel rules).
  for (const c of v.changes) {
    const t = c.source === 'template' ? getTemplate(c.templateId, c.templateVersion, s) : undefined;
    for (const a of t?.typicalArtifactTypes ?? []) {
      if ((a === 'vendor' && lens !== 'supplier') || (a === 'customer' && lens !== 'customer') || (a === 'impacted_email' && !['transferring', 'retained_role', 'employee'].includes(lens))) continue;
      if (out.length < 6) add(a);
    }
  }
  if (!out.length) add(lens === 'executive' ? 'exec_briefing' : 'general_announcement');
  return out;
}
