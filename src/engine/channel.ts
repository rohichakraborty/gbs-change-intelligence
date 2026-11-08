// ---------------------------------------------------------------------------
// Channel recommendation engine. Only enabled channels are ever recommended.
// ---------------------------------------------------------------------------
import type { ChannelPlan, CommunicationRecord, EngagementState, Milestone, Stakeholder } from '../domain/types';
import { A, CT } from '../domain/library';

export interface ChannelRec {
  plan: ChannelPlan;
  ruleId: string;
  rationale: string[];
  gaps: string[];
}

export function estimatedPopulation(st: Stakeholder): number {
  if (st.population !== null && st.population !== undefined) return st.population;
  if (A.mass.includes(st.archetype)) return 500;
  if (A.employees.includes(st.archetype)) return 40;
  if (A.external.includes(st.archetype)) return 100;
  return 6;
}

export function recommendChannels(s: EngagementState, c: CommunicationRecord, st: Stakeholder, m: Milestone): ChannelRec {
  const enabled = new Set(s.channels.filter((x) => x.enabled).map((x) => x.id));
  const name = (id: string) => s.channels.find((x) => x.id === id)?.name ?? id;
  const r: ChannelRec = { plan: { primary: null, secondary: [], reinforcement: null, followUp: null }, ruleId: '', rationale: [], gaps: [] };
  const skipped: string[] = [];
  const pick = (prefs: string[]): string | null => {
    for (const p of prefs) {
      if (enabled.has(p)) return p;
      if (s.channels.some((x) => x.id === p)) skipped.push(name(p));
    }
    return null;
  };
  const a = st.archetype;
  const pop = estimatedPopulation(st);
  const distributed = s.engagement.geographies.length > 1 && (!st.geography || /,|;|global|all/i.test(st.geography));
  const ct = c.commTypeId;
  const plan = (primary: string[], secondary: string[][] = [], reinforcement: string[] = [], followUp: string[] = []) => {
    r.plan.primary = pick(primary);
    r.plan.secondary = secondary.map((g) => pick(g)).filter((x): x is string => !!x && x !== r.plan.primary);
    r.plan.reinforcement = pick(reinforcement);
    r.plan.followUp = pick(followUp);
  };

  if (ct === CT.sensitive) {
    r.ruleId = 'CH-SENS';
    plan(pop <= 12 ? ['ch_1to1', 'ch_small_group', 'ch_virtual_meeting'] : ['ch_small_group', 'ch_1to1', 'ch_employee_briefing'],
      [], ['ch_faq', 'ch_office_hours'], ['ch_letter', 'ch_hr_notice', 'ch_email']);
    r.rationale.push('Sensitive employment matters are delivered in authorised 1:1 or small-group conversations to allow dialogue and individual handling.');
    r.rationale.push('A formal written follow-up provides an auditable record of what was communicated.');
    if (pop > 12) r.rationale.push(`Population (~${pop}) is large for individual meetings alone: small-group sessions with 1:1 follow-ups are recommended.`);
  } else if (ct === CT.crisis) {
    r.ruleId = 'CH-CRISIS';
    plan(['ch_escalation', 'ch_email', 'ch_teams'], [['ch_leadership_briefing', 'ch_virtual_meeting']], ['ch_intranet'], ['ch_faq', 'ch_email']);
    r.rationale.push('Incidents require fast, auditable notification through the approved crisis protocol, with a leadership briefing for accountable owners.');
  } else if (A.board.includes(a)) {
    r.ruleId = 'CH-BOARD';
    plan(['ch_leadership_briefing', 'ch_in_person', 'ch_virtual_meeting'], [], [], ['ch_gov_memo', 'ch_email']);
    r.rationale.push('Board matters are presented in a formal briefing with a governance memorandum for the record.');
  } else if (A.executive.includes(a) && (c.objective === 'seek_approval' || ct === CT.strategic)) {
    r.ruleId = 'CH-EXEC';
    plan(['ch_leadership_briefing', 'ch_in_person', 'ch_virtual_meeting'], [['ch_email']], [], c.objective === 'seek_approval' ? ['ch_gov_memo', 'ch_email'] : []);
    r.rationale.push('Executive alignment and decisions need a dedicated, confidential briefing with two-way discussion.');
  } else if (ct === CT.training) {
    r.ruleId = 'CH-TRAIN';
    plan(distributed ? ['ch_vilt', 'ch_ilt', 'ch_training_workshop', 'ch_webinar'] : ['ch_ilt', 'ch_vilt', 'ch_training_workshop'],
      [['ch_demo', 'ch_walkthrough'], ['ch_email']], ['ch_lms', 'ch_job_aids'], ['ch_office_hours', 'ch_kb']);
    r.rationale.push('Process and system change is best learned through instructor-led sessions with demonstrations, reinforced by self-paced LMS content and job aids.');
    if (distributed) r.rationale.push('Audience spans multiple geographies — virtual instructor-led delivery is preferred.');
  } else if (a === 'supplier') {
    r.ruleId = 'CH-SUP';
    plan(['ch_supplier_letter', 'ch_email', 'ch_contract_notice'], [['ch_email']], ['ch_faq'], ['ch_in_person', 'ch_virtual_meeting']);
    r.rationale.push('Supplier changes need an approved written notification for audit trail; key suppliers get a relationship-owner conversation.');
  } else if (a === 'customer') {
    r.ruleId = 'CH-CUS';
    plan(['ch_customer_notice', 'ch_email'], [['ch_email']], ['ch_faq'], []);
    r.rationale.push('Customer notifications must be approved and written; only necessary information is shared.');
  } else if (A.external.includes(a)) {
    r.ruleId = 'CH-EXT';
    plan(['ch_contract_notice', 'ch_email', 'ch_virtual_meeting'], [], [], []);
    r.rationale.push('Formal written notification through the relationship owner.');
  } else if (m.kind === 'recurring' || ct === CT.programme && m.trigger.focus.includes('status')) {
    r.ruleId = 'CH-CADENCE';
    const steer = st.roles.decisionMaker || st.roles.sponsor;
    plan(steer ? ['ch_steerco_report', 'ch_leadership_briefing'] : ['ch_weekly_status', 'ch_email'], [['ch_dashboard']], [], []);
    r.rationale.push(steer ? 'Steering-level audiences receive a structured steering committee report.' : 'Programme teams receive a weekly written status update with a dashboard for detail.');
  } else if (m.trigger.focus.includes('hypercare') || c.objective === 'reinforce') {
    r.ruleId = 'CH-HYPER';
    plan(['ch_hypercare_updates', 'ch_teams', 'ch_email'], [['ch_office_hours', 'ch_qa']], ['ch_kb', 'ch_faq'], ['ch_pulse']);
    r.rationale.push('Hypercare needs frequent written updates, live office hours for issues, and a pulse check for sentiment.');
  } else if (c.objective === 'collect_feedback') {
    r.ruleId = 'CH-FEEDBACK';
    plan(['ch_pulse', 'ch_listening', 'ch_focus_group'], [['ch_focus_group', 'ch_listening']], [], ['ch_email']);
    r.rationale.push('Feedback needs structured, confidential input mechanisms.');
  } else if (pop >= 50 && ['inform', 'announce', 'reassure'].includes(c.objective)) {
    r.ruleId = 'CH-MASS';
    plan(distributed ? ['ch_webinar', 'ch_townhall', 'ch_email'] : ['ch_townhall', 'ch_webinar', 'ch_email'], [['ch_email']], ['ch_intranet', 'ch_faq'], ['ch_manager_cascade', 'ch_huddle']);
    r.rationale.push(`Large audience (~${pop}): a leadership-fronted ${distributed ? 'webinar' : 'town hall'} with written confirmation by email, reinforced on the intranet and through manager cascade.`);
  } else if (A.supportFns.includes(a)) {
    r.ruleId = 'CH-SUPPORT';
    plan(['ch_virtual_meeting', 'ch_in_person'], [['ch_email']], [], []);
    r.rationale.push('Enabling functions need a working session to agree actions, confirmed by email.');
  } else if (['team_lead', 'function_head', 'process_owner', 'retained_leader'].includes(a) && c.objective === 'prepare') {
    r.ruleId = 'CH-MGR';
    plan(['ch_leadership_workshop', 'ch_virtual_meeting', 'ch_in_person'], [['ch_email']], ['ch_manager_cascade', 'ch_faq'], []);
    r.rationale.push('Leaders preparing to cascade need a briefing workshop and a manager cascade pack.');
  } else if (A.gbsLeaders.includes(a) || A.programme.includes(a)) {
    r.ruleId = 'CH-LEAD';
    plan(['ch_leadership_briefing', 'ch_virtual_meeting', 'ch_in_person'], [['ch_email', 'ch_teams']], [], []);
    r.rationale.push('Programme and GBS leadership need an interactive briefing to agree responsibilities.');
  } else {
    r.ruleId = 'CH-DEFAULT';
    plan(pop >= 50 ? ['ch_email', 'ch_intranet'] : ['ch_virtual_meeting', 'ch_employee_briefing', 'ch_email'], [['ch_email']], ['ch_faq'], []);
    r.rationale.push(pop >= 50 ? 'Written communication reaches a large audience with an audit trail.' : 'A small-group session enables dialogue, with email confirmation.');
  }
  if (skipped.length) r.rationale.push(`Skipped disabled channel(s): ${Array.from(new Set(skipped)).join(', ')}.`);
  if (!r.plan.primary) r.gaps.push('No enabled channel satisfies this communication — enable a suitable channel or set one manually.');
  return r;
}
