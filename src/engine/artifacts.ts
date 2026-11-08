// ---------------------------------------------------------------------------
// Artifact generation engine — template-based, audience-specific drafts.
// Content comes from the communication record, its messaging brief, linked
// change records, timing, communicators, and tracked KT data. Missing facts
// become [PLACEHOLDERS]. Every artifact is a draft until approved.
// ---------------------------------------------------------------------------
import type {
  ArtifactLength, ArtifactSection, ArtifactType, ArtifactVersion, EngagementState, Tone,
} from '../domain/types';
import { ARTIFACT_TYPES, CT, OBJECTIVES } from '../domain/library';
import { fmtDate, listJoin, nowIso, ph, uid } from '../domain/util';
import { contextFacts, lensFor, type Lens } from './messaging';
import { roleName, rolePerson } from './communicator';
import { derive, type CommView } from './derive';
import { artifactSourceFingerprint } from './artifactMeta';
import { anchorGoLive, milestoneDate, waveName } from './timing';
import { severityBand, severityScore } from './impact';

interface Ctx {
  s: EngagementState;
  v: CommView;
  tone: Tone;
  length: ArtifactLength;
  lens: Lens;
  f: ReturnType<typeof contextFacts>;
  from: string;
  fromRole: string;
  to: string;
}

type SectionDef = { key: string; heading: string; body: string; optional?: boolean; detailedOnly?: boolean };

const bullets = (items: string[]) => items.filter(Boolean).map((x) => `- ${x}`).join('\n');

const GREETING: Record<Tone, (aud: string) => string> = {
  executive: () => 'Dear colleagues,',
  formal: () => 'Dear colleagues,',
  reassuring: () => 'Dear colleague,',
  operational: () => 'Hello team,',
  informative: () => 'Dear colleagues,',
  instructional: () => 'Hello,',
  sensitive: () => 'Dear colleague,',
  urgent: () => 'Important — please read:',
};

const OPENING: Record<Tone, string> = {
  executive: 'This note sets out the position, the decisions required, and the implications for leadership.',
  formal: 'We are writing to inform you of changes connected to our Global Business Services programme.',
  reassuring: 'We know change raises questions, so we want to share what we can confirm today, what is not yet decided, and where you can get support.',
  operational: 'This update sets out what is changing, the actions required, and the key dates.',
  informative: 'We want to keep you informed about our Global Business Services programme and what it means for you.',
  instructional: 'This note explains the training available and what you need to do to be ready.',
  sensitive: 'We want to speak with you openly about changes that affect your role. This message follows, and does not replace, a conversation with HR or your line manager.',
  urgent: 'We are writing to inform you of an issue that requires your attention and to explain the actions being taken.',
};

const CLOSING: Record<Tone, string> = {
  executive: 'I would welcome your continued sponsorship and any questions ahead of the next steering committee.',
  formal: 'Thank you for your cooperation.',
  reassuring: 'Thank you for everything you do. Please do not hesitate to reach out — your questions matter to us.',
  operational: 'Thank you for your support in making this transition a success.',
  informative: 'Thank you. Further updates will follow as the programme progresses.',
  instructional: 'We look forward to seeing you at the session.',
  sensitive: 'Please take the time you need to consider this information. Confidential support is available through the contacts above.',
  urgent: 'We will provide the next update at [CONFIRM NEXT UPDATE TIME].',
};

function keyMilestonesTable(ctx: Ctx): string {
  const { s, v } = ctx;
  const d = derive(s);
  const rows = d.activeMilestones
    .filter((m) => m.kind === 'milestone' && (!v.milestone.waveId || !m.waveId || m.waveId === v.milestone.waveId))
    .filter((m) => ['impacted_comms', 'transition_kickoff', 'kt_start', 'employee_training', 'golive', 'hypercare_start', 'hypercare_close', 'enterprise_golive'].includes(m.libraryKey ?? '') || m.id === v.milestone.id)
    .slice(0, 8)
    .map((m) => `| ${m.name}${m.waveId ? ` (${waveName(s, m.waveId)})` : ''} | ${milestoneDate(s, m) ? fmtDate(milestoneDate(s, m)) : ph('confirm date')} |`);
  return ['| Milestone | Date |', ...rows].join('\n');
}

function changeDetail(ctx: Ctx): string {
  if (!ctx.v.changes.length) return ph('link change records to this communication');
  return ctx.v.changes.map((c) => `### ${c.title}\n${bullets([
    c.asIs ? `Today: ${c.asIs}` : `Today: ${ph(`confirm As-Is for ${c.code}`)}`,
    c.toBe ? `Future: ${c.toBe}` : `Future: ${ph(`confirm To-Be for ${c.code}`)}`,
    c.effectiveDate ? `Effective: ${fmtDate(c.effectiveDate)}` : '',
  ])}`).join('\n\n');
}

function faqAnswer(q: string, ctx: Ctx): string {
  const b = ctx.v.brief;
  const ql = q.toLowerCase();
  if (/terms|conditions|secure|job|pay|salary|redundan/.test(ql)) return `${ph('HR-approved answer required — do not respond until confirmed by HR and Legal')}`;
  if (/manager|report/.test(ql)) return ctx.lens === 'transferring' ? `Your reporting line will be confirmed in your individual conversation. ${ph('confirm new reporting line')}` : ph('confirm answer with programme team');
  if (/location|working pattern|where.*work/.test(ql)) return ph('confirm location and working arrangements');
  if (/contact|who do i|who can i|where do i (raise|send)|where can i/.test(ql)) return `Use ${listJoin(b.supportChannels)}.`;
  if (/when|date|deadline/.test(ql)) return b.keyDates.join('; ') + '.';
  if (/training/.test(ql)) return `Training will be provided before go-live (${ctx.f.goLive}). ${ph('insert training schedule')}`;
  if (/differently|change|affect|what do i need/.test(ql)) return `${b.whatIsChanging.slice(0, 2).join(' ')} ${b.requiredActions[0] ?? ''}`.trim();
  if (/risk/.test(ql)) return ph('insert approved risk summary');
  if (/decision/.test(ql)) return `${b.mainMessage}`;
  if (/payment|invoice/.test(ql)) return `${b.requiredActions[0] ?? ''} ${ph('confirm with Procurement — no change to payment terms is implied')}`.trim();
  if (/measure|success|performance/.test(ql)) return ph('insert approved success measures / SLA framework');
  return `${b.mainMessage} ${ph('confirm detailed answer')}`;
}

function signOff(ctx: Ctx): string {
  return `${CLOSING[ctx.tone]}\n\n${ctx.from}\n${ctx.fromRole}`;
}

// ----------------------------- Templates ----------------------------------

function sectionsFor(type: ArtifactType, ctx: Ctx): SectionDef[] {
  const { s, v, f, lens } = ctx;
  const b = v.brief;
  const e = s.engagement;
  const greet = GREETING[ctx.tone](v.audience.roleName);
  switch (type) {
    case 'general_announcement':
      return [
        { key: 'opening', heading: 'Opening', body: `${greet}\n\n${OPENING[ctx.tone]}` },
        { key: 'context', heading: 'Transformation context', body: `${f.org} is establishing a Global Business Services (GBS) model for ${f.scope}, delivered from ${f.location}. ${b.whyItMatters}` },
        { key: 'purpose', heading: 'Purpose of the GBS', body: e.description.trim() || ph('approved GBS purpose statement required') },
        { key: 'changing', heading: 'What is changing', body: bullets(b.whatIsChanging) },
        { key: 'unchanged', heading: 'What remains unchanged', body: b.whatIsNotChanging },
        { key: 'milestones', heading: 'Key milestones', body: keyMilestonesTable(ctx), optional: true },
        { key: 'meaning', heading: 'What this means for you', body: `${b.mainMessage}\n\n${b.expectedImpact}` },
        { key: 'next', heading: 'Next steps', body: bullets(b.requiredActions) },
        { key: 'support', heading: 'Support contacts', body: bullets(b.supportChannels) },
        { key: 'signoff', heading: 'Sign-off', body: signOff(ctx) },
      ];
    case 'impacted_email': {
      const roleBullets = lens === 'transferring' ? [
        `Reporting line: ${ph('confirm new reporting line')}`,
        `Employment terms: ${ph('confirm employee transfer details — HR approved')}`,
        `Location and working arrangements: ${ph('confirm location and working arrangements')}`,
        `Onboarding into GBS: ${ph('insert onboarding steps and dates')}`,
        `Training: training will be provided before go-live on ${f.goLive}.`,
      ] : lens === 'retained_role' ? [
        `Updated responsibilities: ${v.changes.map((c) => c.toBe).filter(Boolean).join(' ') || ph('confirm role change details')}`,
        `Role details: ${ph('confirm role change details with HR')}`,
        `Who you will work with: the GBS team in ${f.location} for activities that move.`,
        `Development support: ${ph('insert approved development and training support')}`,
      ] : v.audience.archetype === 'redeployed' ? [
        `New role: ${ph('confirm redeployment details')}`,
        `Effective date: ${ph('confirm effective date')}`,
      ] : [b.expectedImpact];
      return [
        { key: 'header', heading: 'Confidentiality', body: b.confidentiality },
        { key: 'opening', heading: 'Opening', body: `${greet}\n\n${OPENING[ctx.tone]}` },
        { key: 'changing', heading: 'What is changing for you', body: `${b.mainMessage}\n\n${bullets(b.whatIsChanging)}` },
        { key: 'role', heading: 'What this means for your role', body: bullets(roleBullets) },
        { key: 'unchanged', heading: 'What is not changing', body: b.whatIsNotChanging },
        { key: 'dates', heading: 'Key dates', body: bullets(b.keyDates) },
        { key: 'support', heading: 'Support available', body: bullets(b.supportChannels) },
        { key: 'next', heading: 'Next steps', body: bullets(b.requiredActions) },
        { key: 'faq', heading: 'Questions you may have', body: b.anticipatedQuestions.map((q) => `**${q}**\n${faqAnswer(q, ctx)}`).join('\n\n'), optional: true },
        { key: 'signoff', heading: 'Sign-off', body: signOff(ctx) },
      ];
    }
    case 'leadership_announcement':
      return [
        { key: 'opening', heading: 'Leadership communication', body: `${greet}\n\n${b.mainMessage}` },
        { key: 'rationale', heading: 'Strategic rationale', body: b.whyItMatters },
        { key: 'objectives', heading: 'Transformation objectives', body: e.description.trim() ? e.description : ph('confirm approved transformation objectives') },
        { key: 'messaging', heading: 'Executive messaging', body: bullets(b.supportingMessages) },
        { key: 'decisions', heading: 'Key decisions', body: bullets(derive(s).activeMilestones.filter((m) => m.trigger.focus.includes('governance') && m.kind === 'milestone').slice(0, 6).map((m) => `${m.name} — ${milestoneDate(s, m) ? fmtDate(milestoneDate(s, m)) : ph('confirm date')}`)) },
        { key: 'expectations', heading: 'Expectations of leaders', body: bullets(['Sponsor the change visibly and consistently with your teams.', 'Use approved messaging only; route questions you cannot answer to the programme.', 'Identify risks to service continuity early through governance forums.']) },
        { key: 'impact', heading: 'Implications for your area', body: b.expectedImpact, optional: true },
        { key: 'next', heading: 'Next steps', body: bullets(b.requiredActions) },
        { key: 'signoff', heading: 'Sign-off', body: signOff(ctx) },
      ];
    case 'vendor':
      return [
        { key: 'opening', heading: 'Opening', body: `Dear Supplier,\n\n${b.mainMessage}` },
        { key: 'changing', heading: 'What is changing', body: bullets(b.supportingMessages) },
        { key: 'contacts', heading: 'Updated contacts', body: bullets([`Invoice submission: ${ph('insert approved invoice submission address')}`, `Queries: ${ph('insert approved supplier helpdesk contact')}`, `Relationship owner: ${ph('confirm relationship owner')}`]) },
        { key: 'process', heading: 'Procurement process changes', body: v.changes.filter((c) => c.dimensionId === 'dim_pr').map((c) => c.toBe).filter(Boolean).join(' ') || ph('confirm procurement process changes relevant to suppliers') },
        { key: 'ownership', heading: 'Service ownership', body: `From the effective date, ${f.scope} transactions will be processed by ${f.org}'s Global Business Services team in ${f.location}.` },
        { key: 'escalation', heading: 'Escalation', body: ph('insert approved escalation route for suppliers') },
        { key: 'timing', heading: 'Transition timing', body: bullets(b.keyDates) },
        { key: 'actions', heading: 'Actions required', body: bullets(b.requiredActions) },
        { key: 'contract', heading: 'Contractual position', body: 'This notification describes operational changes only. It does not amend your agreement with us. Any contractual change will be communicated separately and formally. [CONFIRM WITH LEGAL/PROCUREMENT]' },
        { key: 'signoff', heading: 'Sign-off', body: `Yours faithfully,\n\n${ctx.from}\n${ctx.fromRole}` },
      ];
    case 'customer':
      return [
        { key: 'opening', heading: 'Opening', body: `Dear Customer,\n\n${b.mainMessage}` },
        { key: 'continuity', heading: 'Service continuity', body: `Your service continues without interruption. ${ph('confirm service continuity statement')}` },
        { key: 'changes', heading: 'What changes for you', body: bullets(b.supportingMessages) },
        { key: 'contacts', heading: 'Contact changes', body: bullets([`From ${f.goLive}: ${ph('insert approved customer contact')}`]) },
        { key: 'instructions', heading: 'What you need to do', body: bullets(b.requiredActions) },
        { key: 'signoff', heading: 'Sign-off', body: `Kind regards,\n\n${ctx.from}\n${ctx.fromRole}` },
      ];
    case 'kt_report': {
      const items = s.kt.filter((k) => !v.milestone.waveId || !k.waveId || k.waveId === v.milestone.waveId);
      if (!items.length) {
        return [
          { key: 'period', heading: 'Reporting period', body: ph('insert reporting period') },
          { key: 'nodata', heading: 'KT status', body: 'No knowledge transfer tracking data has been entered for this scope. Record KT activities in the KT tracker (Artifact Studio → KT Tracker) to populate this report. No progress, completion, or sign-off status is reported without tracked data.' },
        ];
      }
      const R = { not_assessed: 'Not assessed', on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' } as const;
      return [
        { key: 'period', heading: 'Reporting period', body: Array.from(new Set(items.map((k) => k.reportingPeriod).filter(Boolean))).join('; ') || ph('insert reporting period') },
        { key: 'summary', heading: 'Status summary', body: ['| Workstream | Process | KT phase | Readiness |', ...items.map((k) => `| ${k.workstream || '—'} | ${k.process || '—'} | ${k.ktPhase} | ${R[k.readiness]} |`)].join('\n') },
        { key: 'planned', heading: 'Planned KT activities', body: bullets(items.map((k) => `${k.process}: ${k.plannedActivities || ph('not recorded')}`)) },
        { key: 'completed', heading: 'Completed KT activities', body: bullets(items.map((k) => `${k.process}: ${k.completedActivities || 'None recorded'}`)) },
        { key: 'open', heading: 'Open activities', body: bullets(items.map((k) => `${k.process}: ${k.openActivities || 'None recorded'}`)) },
        { key: 'readiness', heading: 'Readiness indicators', body: bullets(items.map((k) => `${k.process}: ${R[k.readiness]} (as recorded in the KT tracker)`)) },
        { key: 'issues', heading: 'Issues and risks', body: bullets(items.filter((k) => k.issues).map((k) => `${k.process}: ${k.issues}`)) || 'None recorded.' },
        { key: 'deps', heading: 'Dependencies', body: bullets(items.filter((k) => k.dependencies).map((k) => `${k.process}: ${k.dependencies}`)) || 'None recorded.' },
        { key: 'decisions', heading: 'Decisions required', body: bullets(items.filter((k) => k.decisions).map((k) => `${k.process}: ${k.decisions}`)) || 'None recorded.' },
        { key: 'next', heading: 'Next steps', body: bullets(items.filter((k) => k.nextSteps).map((k) => `${k.process}: ${k.nextSteps}`)) || 'None recorded.' },
      ];
    }
    case 'training_comm':
      return [
        { key: 'invite', heading: 'Training invitation', body: `${greet}\n\n${b.mainMessage}` },
        { key: 'objectives', heading: 'Learning objectives', body: bullets(v.changes.length ? v.changes.map((c) => `Work confidently with: ${c.toBe || c.title}`) : [ph('define learning objectives')]) },
        { key: 'audience', heading: 'Target audience', body: `${v.audience.roleName}${v.audience.population ? ` (approx. ${v.audience.population} people)` : ''}.` },
        { key: 'topics', heading: 'Topics covered', body: bullets(v.changes.map((c) => c.title).concat(['Where to get help after go-live'])) },
        { key: 'schedule', heading: 'Schedule', body: `${ph('insert training dates, times, and booking link')}\nAll sessions complete before go-live on ${f.goLive}.` },
        { key: 'prereq', heading: 'Prerequisites', body: ph('confirm prerequisites (e.g., system access, pre-reading)') },
        { key: 'attendance', heading: 'Attendance expectations', body: `Attendance is ${ph('confirm whether mandatory')}. Please speak to your line manager if you cannot attend.` },
        { key: 'post', heading: 'Post-training actions', body: bullets(['Complete the knowledge check.', 'Bookmark the job aids and knowledge base.', 'Raise questions at office hours.']) },
        { key: 'signoff', heading: 'Sign-off', body: signOff(ctx) },
      ];
    case 'training_pack': {
      const modules = [
        { t: 'Module 1 — Why we are changing', c: b.whyItMatters },
        ...v.changes.map((c, i) => ({ t: `Module ${i + 2} — ${c.title}`, c: `${c.asIs ? `Current: ${c.asIs}\n` : ''}${c.toBe ? `Future: ${c.toBe}` : ph(`confirm To-Be for ${c.code}`)}` })),
        { t: `Module ${v.changes.length + 2} — Getting support`, c: bullets(b.supportChannels) },
      ];
      return [
        { key: 'objectives', heading: 'Training objectives', body: bullets(v.changes.map((c) => `Explain and apply: ${c.title}`).concat(['Know how to get support after go-live'])) },
        { key: 'audience', heading: 'Audience and prerequisites', body: `Audience: ${v.audience.roleName}.\nPrerequisites: ${ph('confirm prerequisites')}` },
        { key: 'modules', heading: 'Modules', body: bullets(modules.map((m) => m.t)) },
        { key: 'sequence', heading: 'Recommended session sequence', body: ['| Session | Module | Format | Duration |', ...modules.map((m, i) => `| ${i + 1} | ${m.t.split(' — ')[1]} | ${i === 0 ? 'Presentation' : 'Demonstration and exercise'} | ${ph('confirm')} |`)].join('\n') },
        { key: 'facilitator', heading: 'Facilitator notes', body: bullets(['Open by acknowledging what changes and what does not.', 'Use real process examples from the audience\'s own work.', 'Park employment questions — route them to HR; do not speculate.', 'Capture questions you cannot answer for the FAQ.']) },
        { key: 'content', heading: 'Detailed content', body: modules.map((m) => `### ${m.t}\n${m.c}`).join('\n\n') },
        { key: 'examples', heading: 'Process examples', body: v.changes.map((c) => `### ${c.title}\n${ph(`insert worked example for ${c.process || c.title}`)}`).join('\n\n') || ph('insert process examples') },
        { key: 'exercises', heading: 'Exercises', body: bullets(v.changes.map((c) => `Scenario: a request that previously went via "${c.asIs || 'the current route'}" — walk through the new steps in "${c.toBe || c.title}".`)) },
        { key: 'checks', heading: 'Knowledge checks', body: bullets(v.changes.filter((c) => c.asIs && c.toBe).map((c) => `Q: What replaces "${c.asIs}"? — A: ${c.toBe}`)) || ph('define knowledge checks') },
        { key: 'faq', heading: 'FAQs', body: b.anticipatedQuestions.map((q) => `**${q}**\n${faqAnswer(q, ctx)}`).join('\n\n') },
        { key: 'followup', heading: 'Follow-up actions', body: bullets(['Complete LMS refresher modules.', 'Attend office hours in the first weeks after go-live.']) },
        { key: 'storyboard', heading: 'Slide-by-slide storyboard', body: ['| Slide | Title | Content |', `| 1 | ${f.engagement} — Training | Title, audience, date |`, '| 2 | Agenda | Modules overview |', ...modules.map((m, i) => `| ${i + 3} | ${m.t.split(' — ')[1]} | Key points, visuals, demo cue |`), `| ${modules.length + 3} | Knowledge check | Questions |`, `| ${modules.length + 4} | Support and next steps | Contacts and follow-up |`].join('\n') },
      ];
    }
    case 'townhall_pack':
      return [
        { key: 'agenda', heading: 'Suggested agenda', body: ['| Time | Item | Speaker |', `| 0:00 | Welcome and context | ${roleName(s, v.roles.primary) || ph('confirm speaker')} |`, `| 0:10 | What is changing and why | ${roleName(s, v.roles.primary) || ph('confirm speaker')} |`, `| 0:25 | What it means for you | ${v.roles.supporting.map((r) => roleName(s, r)).join(', ') || ph('confirm speaker')} |`, '| 0:40 | Q&A | Panel |', '| 0:55 | Close and next steps | Primary speaker |'].join('\n') },
        { key: 'speakers', heading: 'Speaker roles', body: bullets([`Lead: ${ctx.from} (${ctx.fromRole})`, ...v.roles.supporting.map((r) => `Supporting: ${roleName(s, r)}${rolePerson(s, r) ? ` — ${rolePerson(s, r)}` : ''}`), 'Moderator: [CONFIRM MODERATOR]']) },
        { key: 'opening', heading: 'Opening script', body: `Thank you for joining. Today we want to explain ${f.scope} changes under ${f.engagement}, what they mean for you, and answer your questions. ${b.mainMessage}` },
        { key: 'talking', heading: 'Talking points', body: bullets(b.supportingMessages) },
        { key: 'messages', heading: 'Key messages', body: bullets([b.mainMessage, `What is not changing: ${b.whatIsNotChanging}`, `Key dates: ${b.keyDates.join('; ')}`]) },
        { key: 'concerns', heading: 'Employee concerns to anticipate', body: bullets(b.potentialConcerns) },
        { key: 'qa', heading: 'Anticipated Q&A', body: b.anticipatedQuestions.map((q) => `**${q}**\n${faqAnswer(q, ctx)}`).join('\n\n') },
        { key: 'closing', heading: 'Closing remarks', body: `${CLOSING[ctx.tone]} ${b.requiredActions[0] ?? ''}` },
        { key: 'followup', heading: 'Follow-up communications', body: bullets(['Email summary with slides and FAQ within 24 hours.', 'Manager cascade pack issued to team leads.', 'Questions log reviewed and published as FAQ updates.']) },
      ];
    case 'manager_cascade':
      return [
        { key: 'instructions', heading: 'Leadership instructions', body: bullets([`Brief your team after ${f.milestone} (${f.milestoneDate}) and not before the approved release time ${ph('confirm release time')}.`, 'Use the core messages below; do not speculate about details that are not confirmed.', 'Log questions and send them to the programme within 48 hours.']) },
        { key: 'core', heading: 'Core messages', body: bullets([b.mainMessage, ...b.supportingMessages.slice(0, 3)]) },
        { key: 'tailoring', heading: 'Tailoring guidance', body: bullets(['Explain what changes for your specific team and processes.', 'Be clear about what is not changing.', 'Acknowledge uncertainty honestly and say when more will be known.']) },
        { key: 'discussion', heading: 'Team discussion points', body: bullets(['What questions or concerns do you have?', 'What support do you need to prepare?', 'What risks do you see for service continuity?']) },
        { key: 'faq', heading: 'FAQs', body: b.anticipatedQuestions.map((q) => `**${q}**\n${faqAnswer(q, ctx)}`).join('\n\n') },
        { key: 'escalation', heading: 'Escalation guidance', body: bullets([`Employment or personal questions → ${ph('insert approved HR contact')}`, `Programme questions → ${roleName(s, v.roles.owner) || ph('confirm programme contact')}`, 'Signs of significant concern or distress → contact HR the same day.']) },
      ];
    case 'golive_announcement':
      return [
        { key: 'announcement', heading: 'Go-live announcement', body: `${greet}\n\n${b.mainMessage}` },
        { key: 'summary', heading: 'Change summary', body: bullets(b.whatIsChanging) },
        { key: 'effective', heading: 'Effective date', body: `${f.goLive}${f.waveLabel ? ` (${f.waveLabel})` : ''}` },
        { key: 'service', heading: 'Service and process changes', body: bullets(b.supportingMessages) },
        { key: 'support', heading: 'Support arrangements', body: bullets(b.supportChannels) },
        { key: 'escalation', heading: 'Escalation contacts', body: ph('insert approved escalation contacts') },
        { key: 'next', heading: 'Expectations and next steps', body: bullets(b.requiredActions) },
        { key: 'signoff', heading: 'Sign-off', body: signOff(ctx) },
      ];
    case 'hypercare':
      return [
        { key: 'purpose', heading: 'Hypercare purpose', body: `Following go-live on ${f.goLive}, a period of enhanced support (hypercare) is in place to resolve issues quickly and stabilise services.` },
        { key: 'model', heading: 'Support model', body: bullets([`Hypercare period: ${ph('confirm hypercare duration')}`, ...b.supportChannels]) },
        { key: 'status', heading: 'Service status', body: ph('insert current service status from monitoring data — do not estimate') },
        { key: 'resolution', heading: 'Issue resolution mechanisms', body: bullets(['Raise issues through the support channel with as much detail as possible.', `Target response times: ${ph('confirm hypercare SLAs')}`]) },
        { key: 'escalation', heading: 'Escalation contacts', body: ph('insert approved escalation contacts') },
        { key: 'actions', heading: 'Expected actions', body: bullets(b.requiredActions) },
        { key: 'stabilisation', heading: 'Stabilisation messaging', body: 'Some issues are expected in the first weeks of any transition. Your feedback helps us prioritise fixes and stabilise services as quickly as possible.' },
        { key: 'signoff', heading: 'Sign-off', body: signOff(ctx) },
      ];
    case 'faq':
      return [
        { key: 'intro', heading: 'About this FAQ', body: `Questions and draft answers for ${v.audience.roleName} on "${f.milestone}". Answers are drafted from confirmed engagement facts; items marked with placeholders require confirmation before publication.` },
        { key: 'qa', heading: 'Questions and answers', body: [...b.anticipatedQuestions, 'What is changing?', 'Where can I find more information?'].map((q) => `**${q}**\n${faqAnswer(q, ctx)}`).join('\n\n') },
      ];
    case 'survey': {
      const L = '(1 Strongly disagree – 5 Strongly agree)';
      return [
        { key: 'intro', heading: 'Introduction', body: `This short survey asks about your experience of ${f.engagement}${f.waveLabel ? ` (${f.waveLabel})` : ''}. Responses are ${ph('confirm anonymity statement')}.` },
        { key: 'awareness', heading: 'Awareness', body: bullets([`I am aware of the changes to ${f.scope} services. ${L}`, `I know when the changes take effect. ${L}`]) },
        { key: 'understanding', heading: 'Understanding', body: bullets([`I understand why the change is being made. ${L}`, ...v.changes.slice(0, 3).map((c) => `I understand what "${c.title}" means for me. ${L}`)]) },
        { key: 'impact', heading: 'Perceived impact', body: bullets([`How much will the change affect your day-to-day work? (None / Minor / Moderate / Major)`]) },
        { key: 'readiness', heading: 'Readiness', body: bullets([`I have what I need to work in the new way. ${L}`, `I know where to get support. ${L}`]) },
        { key: 'confidence', heading: 'Confidence', body: bullets([`I am confident the transition will be well managed. ${L}`]) },
        { key: 'training', heading: 'Training effectiveness', body: bullets([`The training prepared me for the new processes and tools. ${L}`, 'Which topics need more support? (free text)']) },
        { key: 'concerns', heading: 'Concerns', body: bullets(['What concerns do you have? (free text)']) },
        { key: 'feedback', heading: 'Feedback', body: bullets(['What would improve communication about this change? (free text)']) },
      ];
    }
    case 'exec_briefing': {
      const d = derive(s);
      const dimSummary = d.selectedDims.map((dim) => {
        const direct = d.selectedStakeholders.filter((st) => { const x = d.impacts.get(`${st.id}|${dim.id}`); return x?.classification === 'impacted' && x.directness === 'direct'; }).length;
        const review = d.selectedStakeholders.filter((st) => d.impacts.get(`${st.id}|${dim.id}`)?.classification === 'review').length;
        return `| ${dim.short} | ${direct} | ${review} |`;
      });
      const high = d.selectedStakeholders.filter((st) => d.selectedDims.some((dim) => {
        const x = d.impacts.get(`${st.id}|${dim.id}`);
        return severityBand(severityScore(x?.severity ?? null, e.settings.weights), e.settings.thresholds) === 'High';
      })).map((st) => st.roleName);
      return [
        { key: 'situation', heading: 'Situation', body: `${f.engagement} — "${f.milestone}" (${f.milestoneDate}). ${b.mainMessage}` },
        { key: 'change', heading: 'Key change', body: bullets(b.whatIsChanging) },
        { key: 'implications', heading: 'Stakeholder implications', body: `${['| Change dimension | Directly impacted groups | Assessments needing review |', ...dimSummary].join('\n')}\n\nHigh-impact groups (assessed): ${high.length ? listJoin(high) : 'none scored as High'}.` },
        { key: 'decisions', heading: 'Decisions required', body: v.rec.objective === 'seek_approval' ? bullets([`Approve: ${f.milestone}.`, ph('insert specific decision wording')]) : ph('insert decisions required, if any') },
        { key: 'risks', heading: 'Risks', body: bullets([...new Set(v.changes.map((c) => c.assumptions).filter(Boolean))].map((a) => `Assumption to validate: ${a}`).concat([ph('insert approved programme risks')])) },
        { key: 'actions', heading: 'Recommended actions', body: bullets(b.requiredActions) },
      ];
    }
  }
}

function subjectFor(type: ArtifactType, ctx: Ctx): string {
  const { f } = ctx;
  const base: Record<ArtifactType, string> = {
    general_announcement: `${f.engagement}: ${f.milestone}`,
    impacted_email: `Changes to your role — ${f.engagement}`,
    leadership_announcement: `Leadership update: ${f.milestone}`,
    vendor: `Changes to ${f.org} ${f.scope} interactions from ${f.goLive}`,
    customer: `Service update from ${f.org}`,
    kt_report: `KT status report — ${f.milestone}`,
    training_comm: `Training invitation: preparing for ${f.scope} changes`,
    training_pack: `Training pack — ${f.scope} transition`,
    townhall_pack: `Town hall pack — ${f.milestone}`,
    manager_cascade: `Manager cascade pack — ${f.milestone}`,
    golive_announcement: `${f.scope} GBS go-live${f.waveLabel ? ` — ${f.waveLabel}` : ''}`,
    hypercare: `Hypercare support after go-live`,
    faq: `FAQ — ${f.milestone}`,
    survey: `Feedback survey — ${f.engagement}`,
    exec_briefing: `Executive briefing: ${f.milestone}`,
  };
  return base[type];
}

export function buildContext(s: EngagementState, v: CommView, tone?: Tone, length: ArtifactLength = 'standard'): Ctx {
  const d = derive(s);
  const f = contextFacts({ s, c: v.rec, st: v.audience, m: v.milestone, changes: v.changes, roles: v.roles, channels: v.channels, impacts: d.impacts });
  const person = rolePerson(s, v.roles.primary);
  return {
    s, v, tone: tone ?? v.brief.tone, length, lens: lensFor(v.audience.archetype), f,
    from: person ?? (v.roles.primary ? ph(`confirm name — ${roleName(s, v.roles.primary)}`) : ph('confirm communicator')),
    fromRole: v.roles.primary ? roleName(s, v.roles.primary) : ph('communicator assignment requires review'),
    to: `${v.audience.roleName}${v.audience.population ? ` (approx. ${v.audience.population})` : ''}`,
  };
}

export function generateSections(type: ArtifactType, ctx: Ctx): ArtifactSection[] {
  let defs = sectionsFor(type, ctx);
  if (ctx.length === 'concise') defs = defs.filter((d) => !d.optional);
  if (ctx.length === 'detailed' && !['kt_report', 'survey'].includes(type)) {
    defs = [...defs];
    const idx = Math.max(1, defs.findIndex((d) => d.key === 'signoff'));
    defs.splice(idx === -1 ? defs.length : idx, 0,
      { key: 'detail_changes', heading: 'Change detail', body: changeDetail(ctx) },
      { key: 'detail_concerns', heading: 'Anticipated concerns (for author reference — remove before release)', body: bullets(ctx.v.brief.potentialConcerns) });
  }
  return defs.map((d) => ({ id: uid('sec'), key: d.key, heading: d.heading, body: d.body, removed: false }));
}

export function generateVersion(
  s: EngagementState, v: CommView, type: ArtifactType, opts: { tone?: Tone; length?: ArtifactLength; v: number; origin: ArtifactVersion['origin']; note: string },
): ArtifactVersion {
  const ctx = buildContext(s, v, opts.tone, opts.length ?? 'standard');
  return {
    v: opts.v, createdAt: nowIso(), origin: opts.origin, note: opts.note,
    meta: { to: ctx.to, from: `${ctx.from}, ${ctx.fromRole}`, subject: subjectFor(type, ctx) },
    sections: generateSections(type, ctx), sourceFingerprint: artifactSourceFingerprint(s, v).hash,
    tone: ctx.tone, length: ctx.length,
  };
}

export function regenerateSection(s: EngagementState, v: CommView, type: ArtifactType, key: string, tone: Tone, length: ArtifactLength): ArtifactSection | null {
  const ctx = buildContext(s, v, tone, length);
  return generateSections(type, ctx).find((x) => x.key === key) ?? null;
}

export function artifactTitle(s: EngagementState, v: CommView, type: ArtifactType) {
  return `${ARTIFACT_TYPES[type].label} — ${v.audience.roleName} — ${v.milestone.name}`;
}

export const objectiveText = (o: string) => OBJECTIVES[o as keyof typeof OBJECTIVES];
export const isSensitive = (v: CommView) => v.rec.commTypeId === CT.sensitive;
export { anchorGoLive };
