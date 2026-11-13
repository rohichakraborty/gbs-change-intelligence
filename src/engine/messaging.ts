// ---------------------------------------------------------------------------
// Messaging engine — audience-specific briefs built only from engagement facts.
// Missing facts become conspicuous [PLACEHOLDERS]; nothing is invented.
// ---------------------------------------------------------------------------
import type {
  Archetype, ChangeRecord, ChannelPlan, CommunicationRecord, EngagementState, MessageBrief, Milestone,
  RoleAssignment, Stakeholder, Tone,
} from '../domain/types';
import { A, CT, OBJECTIVES } from '../domain/library';
import { fmtDate, listJoin, ph } from '../domain/util';
import { anchorGoLive, milestoneDate } from './timing';
import { roleName, rolePerson } from './communicator';
import type { EffectiveImpact } from './impact';
import { severityBand, severityScore } from './impact';

export type Lens =
  | 'executive' | 'gbs' | 'programme' | 'transferring' | 'retained_role' | 'manager' | 'employee'
  | 'support' | 'supplier' | 'customer' | 'partner' | 'general';

export function lensFor(a: Archetype): Lens {
  if (A.executive.includes(a)) return 'executive';
  if (A.gbsLeaders.includes(a)) return 'gbs';
  if (A.programme.includes(a)) return 'programme';
  if (a === 'transferring') return 'transferring';
  if (a === 'retained_modified' || a === 'redeployed') return 'retained_role';
  if (['team_lead', 'function_head', 'process_owner', 'retained_leader'].includes(a)) return 'manager';
  if (a === 'supplier') return 'supplier';
  if (a === 'customer') return 'customer';
  if (a === 'partner' || a === 'regulator') return 'partner';
  if (a === 'general_employee') return 'general';
  if (A.supportFns.includes(a) || a === 'governance_team') return 'support';
  return 'employee';
}

export interface MessageContext {
  s: EngagementState;
  c: CommunicationRecord;
  st: Stakeholder;
  m: Milestone;
  changes: ChangeRecord[];
  roles: RoleAssignment;
  channels: ChannelPlan;
  impacts: Map<string, EffectiveImpact>;
}

export function contextFacts(ctx: MessageContext) {
  const { s, m, changes } = ctx;
  const e = s.engagement;
  const mDate = milestoneDate(s, m);
  const goLive = anchorGoLive(s, m.waveId);
  const wave = m.waveId ? s.waves.find((w) => w.id === m.waveId) : null;
  const location = e.gbsLocations.length ? listJoin(e.gbsLocations) : ph('confirm GBS location');
  const allFns = listJoin(e.functions.map((f) => f.name));
  const waveFns = wave?.functions.length ? listJoin(wave.functions) : '';
  const scope = (changes.length ? listJoin(Array.from(new Set(changes.map((c) => c.functionName).filter(Boolean)))) : '') || waveFns || allFns;
  return {
    engagement: e.name,
    org: e.client || ph('confirm organisation name'),
    location,
    scope: scope || ph('confirm functions in scope'),
    milestone: m.name,
    milestoneDate: mDate ? fmtDate(mDate) : ph(`confirm ${m.name} date`),
    goLive: goLive ? fmtDate(goLive) : ph('confirm go-live date'),
    waveLabel: wave ? wave.name : (s.waves.length > 1 ? 'all waves' : ''),
    rationale: Array.from(new Set(changes.map((c) => c.rationale.trim()).filter(Boolean))),
  };
}

const changeLine = (c: ChangeRecord) =>
  `${c.title}${c.toBe ? ` — To-Be: ${c.toBe}` : ''}${c.effectiveDate ? ` (effective ${fmtDate(c.effectiveDate)})` : ''}${c.source === 'template' && !c.defaultsReviewed ? ' [CONFIRM — LIBRARY DEFAULT DESCRIPTION]' : ''}`;

export function defaultTone(ctx: MessageContext): Tone {
  const lens = lensFor(ctx.st.archetype);
  if (ctx.c.commTypeId === CT.sensitive) return 'sensitive';
  if (ctx.c.commTypeId === CT.crisis) return 'urgent';
  if (ctx.c.commTypeId === CT.training) return 'instructional';
  if (lens === 'executive') return 'executive';
  if (lens === 'supplier' || lens === 'customer' || lens === 'partner') return 'formal';
  if (lens === 'transferring' || lens === 'retained_role') return 'reassuring';
  if (lens === 'general') return 'informative';
  return 'operational';
}

function mainMessage(lens: Lens, ctx: MessageContext, f: ReturnType<typeof contextFacts>): string {
  const o = ctx.c.objective;
  const titles = ctx.changes.slice(0, 3).map((c) => c.title);
  const what = titles.length ? listJoin(titles) : `the ${f.scope} GBS transition`;
  switch (lens) {
    case 'executive':
      if (o === 'seek_approval') return `Decision required at "${f.milestone}" (${f.milestoneDate}): approval to proceed with ${what}. The briefing sets out readiness, risks, governance implications, and the decision requested.`;
      if (o === 'announce' || o === 'confirm_readiness') return `${f.scope} services move to the GBS model on ${f.goLive}${f.waveLabel ? ` (${f.waveLabel})` : ''}. Readiness status: ${ph('confirm readiness outcome')}. Service continuity and escalation arrangements are summarised for leadership.`;
      if (o === 'escalate') return `A material service issue affecting ${f.scope} requires leadership awareness: ${ph('insert incident summary')}. Response owner and next update time are set out below.`;
      if (o === 'inform') return `Status for ${f.engagement}: progress against "${f.milestone}", key risks, and decisions required from steering members.`;
      return `${f.engagement} moves ${f.scope} activities into the GBS model in ${f.location}. Leadership alignment is needed at "${f.milestone}" on ${what}, and on the sponsorship role each leader plays.`;
    case 'gbs':
      if (o === 'announce' || o === 'confirm_readiness') return `GBS assumes operational responsibility for ${what} from ${f.goLive}. Confirm handover readiness, escalation routes, and performance monitoring for go-live.`;
      if (o === 'escalate') return `Incident response required: ${ph('insert incident summary')}. GBS leadership owns resolution and stakeholder updates through the approved escalation protocol.`;
      return `GBS leadership is accountable for delivering ${what}. "${f.milestone}" requires agreement on operational responsibilities, handovers, escalation, and performance monitoring.`;
    case 'programme':
      return `"${f.milestone}" (${f.milestoneDate}) — programme actions, owners, dependencies, and readiness checks for ${what}.`;
    case 'transferring':
      if (o === 'announce') return `From ${f.goLive}, your role is part of the GBS organisation. This note confirms what changes on day one, who you report to, and where to get support.`;
      if (o === 'train') return `Training is scheduled to prepare you for the new processes and tools in your GBS role, ahead of go-live on ${f.goLive}.`;
      if (o === 'collect_feedback' || o === 'reinforce') return `We want to hear how the move to GBS is working for you and make sure you have the support you need during stabilisation.`;
      return `Your role is moving into the GBS organisation as part of ${f.engagement}. Here is what we can confirm today about your reporting line, role expectations, working arrangements, onboarding, and support — and what will be confirmed by HR. ${ph('confirm employee transfer details')}`;
    case 'retained_role':
      return `Your role remains in ${f.org}, and its responsibilities change as ${f.scope} activities move to GBS. This sets out what changes in your role, what stays the same, and the support available. ${ph('confirm role change details with HR')}`;
    case 'manager':
      if (o === 'prepare') return `Leaders need to be ready to explain ${what} to their teams at "${f.milestone}": core messages, what is confirmed, what is not yet confirmed, and how to escalate questions.`;
      return `${what} changes how your area works with GBS: ownership, interfaces, escalation, and handovers for your team.`;
    case 'employee':
      if (o === 'train') return `Training on the new ${f.scope} processes and tools is available before go-live on ${f.goLive}. Please complete it so you are ready on day one.`;
      if (o === 'announce') return `From ${f.goLive}, ${f.scope} services are delivered by GBS. Here is how to request support, what changes for you, and who to contact.`;
      if (o === 'reinforce') return `Hypercare support is in place after go-live. Here is how to raise issues, expected response times, and where to find guidance.`;
      if (o === 'collect_feedback') return `Tell us how the new ${f.scope} services are working for you — your feedback directly shapes stabilisation priorities.`;
      return `${what} changes how you request and receive ${f.scope} services. Here is what is changing, when, and what you need to do.`;
    case 'support':
      return `"${f.milestone}" depends on your function: specific actions, owners, and timings needed to enable ${what}.`;
    case 'supplier':
      return `From ${f.goLive}, there are changes to how ${f.org} manages ${f.scope} interactions with suppliers. This letter sets out what changes for you, what you need to do, and who to contact. No change to your contractual terms is implied by this notification unless separately confirmed.`;
    case 'customer':
      return `We are making changes to how some ${f.scope} services are delivered from ${f.goLive}. Your service continues, and this note explains any changes to how you contact us.`;
    case 'partner':
      return `Notification of changes relevant to your relationship with ${f.org}: ${what}. ${ph('confirm relationship owner and approved content')}`;
    case 'general':
      return `${f.org} is establishing a Global Business Services model for ${f.scope}. Most employees will see no change to their role; this explains what the transformation is and where to find more information.`;
  }
}

const CONCERNS: Record<Lens, string[]> = {
  executive: ['Service continuity and operational risk during transition', 'Delivery of expected benefits', 'Control environment and compliance', 'Reputational and employee-relations risk'],
  gbs: ['Capacity and capability to absorb transferred work', 'Clarity of handover and acceptance criteria', 'Escalation and performance accountability'],
  programme: ['Dependencies and critical path', 'Resource availability for KT', 'Decision latency'],
  transferring: ['Job security and terms of employment', 'New reporting line and manager', 'Location and working arrangements', 'Career progression in GBS', 'Training and support'],
  retained_role: ['What the new role involves and whether it is secure', 'Loss of colleagues and knowledge', 'Workload during transition', 'Development support'],
  manager: ['How to answer team questions not yet confirmed', 'Retaining key people through transition', 'Workload and service continuity'],
  employee: ['Who to contact after go-live', 'Service quality and response times', 'Time needed to learn new tools'],
  support: ['Workload and timing of requests', 'Unclear ownership of actions'],
  supplier: ['Payment continuity and timing', 'New contact points and query routes', 'Any change to commercial terms'],
  customer: ['Service continuity', 'Changes to contact details'],
  partner: ['Contractual implications', 'Relationship ownership'],
  general: ['Whether the change affects me', 'Future scope of GBS'],
};

const QUESTIONS: Record<Lens, string[]> = {
  executive: ['What decision is required and by when?', 'What are the main risks and mitigations?', 'How will we know the transition is successful?'],
  gbs: ['What exactly are we accepting at handover?', 'What are the escalation routes?', 'How will performance be measured?'],
  programme: ['Which actions are on the critical path?', 'Who owns each dependency?'],
  transferring: ['Will my terms and conditions change?', 'Who will my manager be?', 'Will my location or working pattern change?', 'What training will I receive?', 'Who can I talk to confidentially?'],
  retained_role: ['How will my day-to-day work change?', 'Is my role secure?', 'What support will I get?'],
  manager: ['What can I say to my team today?', 'Where do I send questions I cannot answer?', 'When will individual details be confirmed?'],
  employee: ['What do I need to do differently?', 'Where do I raise a request?', 'What if something goes wrong after go-live?'],
  support: ['What do you need from us and by when?', 'Who is the programme contact?'],
  supplier: ['Where do I send invoices and queries from the effective date?', 'Will payment terms change?', 'Who is my contact?'],
  customer: ['Will my service be affected?', 'Who do I contact?'],
  partner: ['Does this affect our agreement?', 'Who is our contact?'],
  general: ['Does this affect my job?', 'Where can I find out more?'],
};

function requiredActions(lens: Lens, ctx: MessageContext, f: ReturnType<typeof contextFacts>): string[] {
  const o = ctx.c.objective;
  if (o === 'seek_approval') return [`Review the decision paper and record the decision at "${f.milestone}" (${f.milestoneDate}).`];
  if (o === 'train') return [`Attend the scheduled training before ${f.goLive}: ${ph('insert training dates and booking link')}.`, 'Complete any pre-reading or LMS modules assigned.'];
  if (o === 'collect_feedback') return [`Complete the feedback survey by ${ph('confirm survey close date')}.`];
  switch (lens) {
    case 'executive': return ['Endorse and visibly sponsor the change with your teams.', 'Raise risks or concerns through the steering committee.'];
    case 'gbs': return ['Confirm handover readiness against agreed criteria.', 'Confirm escalation contacts and performance reporting cadence.'];
    case 'programme': return ['Update action owners and dates in the programme plan.', 'Escalate blocked dependencies to the steering committee.'];
    case 'transferring': return ['Attend your individual conversation with HR / your line manager.', `Raise questions through ${ph('insert approved HR contact')}.`];
    case 'retained_role': return ['Attend the briefing on your updated role.', `Raise questions through ${ph('insert approved HR contact')}.`];
    case 'manager': return ['Brief your team using the manager cascade pack after it is approved.', 'Log questions you cannot answer and send them to the programme team.'];
    case 'employee': return o === 'announce' || o === 'reinforce'
      ? [`From ${f.goLive}, raise requests via ${ph('insert approved support channel')}.`, 'Use the FAQ and knowledge base before raising a ticket.']
      : ['Read the guidance and note the key dates.'];
    case 'support': return [`Complete enabling actions for "${f.milestone}" by ${f.milestoneDate}.`];
    case 'supplier': return [`From the effective date, submit invoices and queries to ${ph('insert approved supplier contact or submission address')}.`, 'Confirm receipt of this notification to your relationship owner.'];
    case 'customer': return [`Use ${ph('insert approved customer contact')} for service requests from ${f.goLive}.`];
    case 'partner': return ['Confirm receipt and nominate a contact.'];
    case 'general': return ['No action required. Find more information on the intranet.'];
  }
}

export function recommendMessage(ctx: MessageContext): MessageBrief {
  const { s, c, st, changes, roles, channels } = ctx;
  const lens = lensFor(st.archetype);
  const f = contextFacts(ctx);
  const tone = defaultTone(ctx);
  const chName = (id: string | null) => (id ? s.channels.find((x) => x.id === id)?.name ?? '' : '');

  // Expected impact from the assessment (not invented).
  const dimLines: string[] = [];
  for (const dimId of s.engagement.selectedDimensionIds) {
    const e = ctx.impacts.get(`${st.id}|${dimId}`);
    if (e?.classification === 'impacted') {
      const band = severityBand(severityScore(e.severity, s.engagement.settings.weights), s.engagement.settings.thresholds);
      dimLines.push(`${s.dimensions.find((d) => d.id === dimId)?.short} (${e.directness ?? 'impacted'}${band ? `, ${band.toLowerCase()} severity` : ', severity not scored'})`);
    }
  }
  const opImpacts = Array.from(new Set(changes.flatMap((x) => [x.operationalImpact, x.behaviouralImpact]).map((x) => x.trim()).filter(Boolean)));
  const expectedImpact = dimLines.length
    ? `Assessed impact: ${dimLines.join('; ')}.${opImpacts.length ? ` ${opImpacts.slice(0, 3).join(' ')}` : ''}`
    : `No direct change to this audience's role, tools, or reporting has been assessed; communication is required for ${c.objective === 'seek_approval' ? 'decision authority' : 'governance, sponsorship, or awareness'} reasons.`;

  const keyDates = [`${f.milestone}: ${f.milestoneDate}`];
  if (lens !== 'programme' || ctx.m.trigger.focus.includes('golive')) keyDates.push(`Go-live${f.waveLabel ? ` (${f.waveLabel})` : ''}: ${f.goLive}`);
  changes.filter((x) => x.effectiveDate).slice(0, 3).forEach((x) => keyDates.push(`${x.code} effective: ${fmtDate(x.effectiveDate)}`));

  const support = [chName(channels.reinforcement), chName(channels.followUp)].filter(Boolean);
  support.push(ph('insert approved support contact'));

  const sensitive = c.commTypeId === CT.sensitive;
  const external = ['supplier', 'customer', 'partner'].includes(lens);
  const approverNames = roles.approvers.map((id) => `${roleName(s, id)}${rolePerson(s, id) ? ` (${rolePerson(s, id)})` : ''}`);

  const supporting: string[] = changes.slice(0, 4).map(changeLine);
  if (lens === 'supplier' || lens === 'customer') supporting.splice(0, supporting.length, ...changes.filter((x) => x.dimensionId === 'dim_im' || x.dimensionId === 'dim_pr' || x.dimensionId === 'dim_te').slice(0, 3).map((x) => x.toBe ? `${x.title}: ${x.toBe}` : x.title));
  if (lens === 'general') supporting.splice(0, supporting.length, `The GBS centre in ${f.location} will deliver selected ${f.scope} services.`, 'Further updates will follow through the intranet and your line manager.');

  return {
    mainMessage: mainMessage(lens, ctx, f),
    supportingMessages: supporting.length ? supporting : [ph('add supporting message — no linked change records')],
    whyItMatters: f.rationale.length ? f.rationale.join(' ') : ph('approved business rationale required'),
    whatIsChanging: changes.length ? changes.map(changeLine) : [ph('link change records to this communication')],
    whatIsNotChanging: Array.from(new Set(changes.map((x) => x.notChanging.trim()).filter(Boolean))).join(' ') || ph(`confirm what is not changing for ${st.roleName}`),
    expectedImpact,
    keyDates,
    requiredActions: requiredActions(lens, ctx, f),
    supportChannels: support,
    potentialConcerns: CONCERNS[lens],
    tone,
    confidentiality: sensitive ? 'Strictly confidential until approved for release. Share only with named recipients; individual details are communicated by authorised HR personnel.'
      : external ? 'External communication — share only approved information. Do not disclose internal organisational detail.'
      : c.commTypeId === CT.strategic ? 'Confidential — leadership audience only.' : c.commTypeId === CT.crisis ? 'Restricted — approved crisis protocol applies.' : 'Internal.',
    anticipatedQuestions: QUESTIONS[lens],
    approvalRequirements: approverNames.length
      ? `Approval by ${listJoin(approverNames)} before release.${sensitive ? ' HR review must be recorded before approval; jurisdiction-specific requirements to be confirmed by HR/Legal.' : ''}${external ? ' No contractual commitments may be made without Legal/Procurement confirmation.' : ''}`
      : ph('confirm content approver'),
  };
}

export const objectiveLabel = (o: string) => OBJECTIVES[o as keyof typeof OBJECTIVES] ?? o;
