// Reusable stakeholder-relationship profiles. Each returns rule specs that a
// template composes; templates add specific rules where a pattern does not fit.
// These are candidate relationships — the impact engine evaluates scope and
// clarification answers before proposing anything.
import type { DimCode, RelationKind, RoleRule, RoleToken } from './types';

export type RuleSpec = Omit<RoleRule, 'id'>;
type Sev = [number, number, number, number];

export function rule(kind: RelationKind, roles: RoleToken[], mechanism: string, o: { fn?: boolean; dims?: DimCode[]; sev?: Sev | null; when?: [string, string[]]; info?: string } = {}): RuleSpec {
  return {
    kind, roles, mechanism, fnScoped: o.fn ?? false, dims: o.dims ?? [],
    severity: o.sev === undefined ? (kind === 'direct' ? [2, 1, 1, 2] : kind === 'indirect' ? [1, 1, 0, 1] : null) : o.sev,
    when: o.when ? { q: o.when[0], in: o.when[1] } : null, info: o.info ?? '',
  };
}

const fn = true;

/** Delivery of an activity moves to GBS (people, accountability, and service interface change). */
export function serviceTransfer(subject: string): RuleSpec[] {
  return [
    rule('direct', ['transferring'], `${subject} they currently perform moves into the GBS delivery model; day-to-day accountability and ways of working change.`, { fn, sev: [3, 2, 2, 3] }),
    rule('direct', ['new_hire'], `New GBS teams take on delivery of ${subject.toLowerCase()}.`, { sev: [3, 1, 2, 2] }),
    rule('direct', ['gbs_head', 'gbs_leader'], `GBS assumes service ownership and SLA accountability for ${subject.toLowerCase()}.`, { sev: [3, 1, 1, 2] }),
    rule('direct', ['process_owner'], `Process ownership shifts from running delivery to governing a GBS service for ${subject.toLowerCase()}.`, { fn, sev: [2, 2, 1, 2] }),
    rule('indirect', ['function_head', 'retained_leader'], `Keeps functional accountability but no longer directly manages delivery of ${subject.toLowerCase()}.`, { fn, sev: [1, 2, 0, 1] }),
    rule('indirect', ['team_lead'], 'Team composition and supervision change as activities move.', { fn, sev: [1, 2, 0, 1] }),
    rule('indirect', ['retained_ops'], 'Hand-offs and escalations for the transferred activities now run through GBS.', { fn, dims: ['IM'], sev: [1, 1, 1, 1] }),
    rule('indirect', ['business_user', 'service_recipient'], `Requests for ${subject.toLowerCase()} are fulfilled by GBS instead of local teams.`, { dims: ['IM'], sev: [0, 1, 1, 1] }),
    rule('indirect', ['sme'], 'Expected to provide knowledge transfer to GBS.', { fn, sev: [1, 1, 0, 1] }),
    rule('governance', ['$cxo'], 'Accountable functional executive endorses the service transfer and keeps functional accountability.'),
    rule('awareness', ['general_employee'], 'Enterprise awareness of the new service delivery model.'),
  ];
}

/** Ownership, decision rights, or accountability change without people necessarily moving. */
export function ownershipShift(subject: string): RuleSpec[] {
  return [
    rule('direct', ['process_owner'], `Ownership and decision rights for ${subject.toLowerCase()} are redefined.`, { fn, sev: [2, 2, 0, 2] }),
    rule('direct', ['gbs_head', 'gbs_leader'], `GBS takes on accountability for ${subject.toLowerCase()} under the new model.`, { sev: [2, 1, 0, 1] }),
    rule('indirect', ['function_head', 'retained_leader'], 'Counterparts, escalation routes, and accountabilities change.', { fn, sev: [1, 2, 0, 1] }),
    rule('indirect', ['governance_team'], 'Oversight shifts to the new ownership model.', { sev: [1, 1, 0, 1] }),
    rule('governance', ['$cxo'], 'Accountable executive approves the new ownership model.'),
  ];
}

/** Process steps change for the people who perform or own the process. */
export function processChange(subject: string, o: { requesters?: boolean; controls?: boolean; suppliers?: boolean } = {}): RuleSpec[] {
  const r: RuleSpec[] = [
    rule('direct', ['transferring', 'new_hire'], `Perform the redesigned ${subject.toLowerCase()} steps.`, { fn, sev: [2, 1, 2, 2] }),
    rule('direct', ['process_owner'], `Owns the redesigned ${subject.toLowerCase()} process, controls, and adoption.`, { fn, sev: [2, 0, 1, 2] }),
    rule('direct', ['team_lead'], 'Supervises teams through the new process steps.', { fn, sev: [1, 1, 1, 2] }),
    rule('direct', ['gbs_leader'], 'GBS operates the redesigned process.', { sev: [2, 0, 1, 1] }),
    rule('indirect', ['retained_ops', 'retained_leader'], 'Retained hand-offs and inputs to the process change.', { fn, sev: [1, 1, 1, 1] }),
    rule('indirect', ['sme'], 'Contributes to process design and testing.', { fn, sev: [1, 0, 0, 1] }),
    rule('indirect', ['lnd'], 'Training content needed for the new process.', { sev: [1, 0, 0, 0] }),
    rule('governance', ['$cxo'], 'Approves the process design as accountable executive.'),
  ];
  if (o.requesters) r.push(rule('direct', ['business_user', 'service_recipient'], `Requesters/approvers follow new steps in ${subject.toLowerCase()}.`, { sev: [1, 0, 2, 2], when: ['requester_impact', ['yes']], info: 'Confirm whether business users follow new steps.' }));
  if (o.controls) r.push(rule('indirect', ['compliance', 'legal_risk_leader'], 'Control points change; control framework and testing need updating.', { sev: [1, 0, 1, 1] }));
  if (o.suppliers) r.push(rule('direct', ['supplier'], 'Supplier-facing steps change.', { dims: ['IM'], sev: [1, 1, 1, 1], when: ['supplier_facing', ['yes']], info: 'Confirm whether suppliers see a change.' }));
  return r;
}

/** People and organisation changes (transfers, role changes, reporting lines). */
export function orgPeople(subject: string, o: { employment?: boolean; populations?: RoleToken[] } = {}): RuleSpec[] {
  const pops = o.populations ?? ['transferring'];
  const r: RuleSpec[] = [
    rule('direct', pops, `${subject}: reporting line, role expectations, and people management change.`, { fn, sev: [3, 3, 1, 3] }),
    rule('direct', ['team_lead'], 'People-management responsibilities and team composition change.', { fn, sev: [2, 3, 0, 2] }),
    rule('direct', ['function_head'], 'Line management of affected teams is reshaped.', { fn, sev: [2, 3, 0, 2] }),
    rule('direct', ['gbs_head', 'gbs_leader'], 'Receives or reshapes teams and line-management accountability.', { sev: [2, 3, 0, 1] }),
    rule('direct', ['hr_support'], 'HR executes the organisation change (records, role mapping, employee support).', { sev: [2, 1, 1, 1] }),
    rule('governance', ['cxo_hr'], 'People strategy and employment decisions require HR leadership approval.'),
    rule('governance', ['$cxo'], 'Accountable executive approves the organisation design.'),
    rule('awareness', ['general_employee'], 'General awareness of organisation changes.'),
  ];
  if (o.employment) {
    r.push(rule('indirect', ['payroll'], 'Payroll records change for transferring employees.', { sev: [1, 0, 1, 0], when: ['employment_effect', ['transfer']], info: 'Confirm whether employment transfers.' }));
    r.push(rule('indirect', ['legal'], 'Employment transfer may require legal review and consultation per jurisdiction.', { sev: [1, 0, 0, 0], when: ['employment_effect', ['transfer', 'secondment']] }));
    r.push(rule('direct', ['retained_modified', 'redeployed'], 'Work moves to new GBS hires; current role content or redeployment decisions follow.', { fn, sev: [3, 2, 1, 3], when: ['employment_effect', ['new_hires']] }));
  }
  return r;
}

/** Technology platform change; impacts depend on the type of technology change. */
export function techPlatform(subject: string, o: { endUsers?: RoleToken[]; businessUsers?: boolean; data?: boolean } = {}): RuleSpec[] {
  const users = o.endUsers ?? ['transferring', 'new_hire', 'retained_modified', 'team_lead', 'sme'];
  const userChange = ['replace', 'supplement', 'consolidate'];
  const r: RuleSpec[] = [
    rule('direct', users, `Use ${subject}; screens, transactions, and work steps change.`, { fn, sev: [1, 0, 3, 2], when: ['tech_type', userChange], info: 'Confirm the type of technology change.' }),
    rule('indirect', users, `Minor changes to how they use ${subject} after the upgrade.`, { fn, sev: [0, 0, 1, 1], when: ['tech_type', ['upgrade']] }),
    rule('direct', ['process_owner'], 'Processes are redesigned around the new platform.', { fn, dims: ['PR'], sev: [2, 0, 2, 1], when: ['tech_type', ['replace', 'consolidate']] }),
    rule('direct', ['it_support'], `Deploys, supports, and provisions access for ${subject}.`, { sev: [2, 0, 2, 1], when: ['tech_type', ['replace', 'supplement', 'consolidate', 'upgrade']] }),
    rule('direct', ['it_support'], `Support ownership for ${subject} changes; escalation and service accountability move.`, { dims: ['OM'], sev: [2, 2, 1, 1], when: ['tech_type', ['ownership']] }),
    rule('direct', ['gbs_leader'], `Takes service accountability for supporting ${subject}.`, { dims: ['OM'], sev: [2, 1, 0, 1], when: ['tech_type', ['ownership']] }),
    rule('awareness', ['business_user', 'service_recipient'], `Escalation route for ${subject} support changes.`, { dims: ['IM'], when: ['tech_type', ['ownership']] }),
    rule('indirect', ['infosec'], 'Access roles and security controls apply to the new platform.', { sev: [1, 0, 1, 0], when: ['tech_type', ['replace', 'supplement', 'consolidate']] }),
    rule('indirect', ['lnd'], 'Training is needed for users of the new platform.', { sev: [1, 0, 0, 1], when: ['tech_type', userChange] }),
    rule('indirect', ['hypercare_team'], 'Supports users through cut-over and stabilisation.', { sev: [1, 0, 2, 1], when: ['tech_type', ['replace', 'consolidate']] }),
    rule('governance', ['cxo_it'], 'Technology investment and platform decisions sit with the technology executive.'),
    rule('governance', ['$cxo'], 'Business owner of the platform endorses the change.'),
  ];
  if (o.businessUsers) r.push(rule('direct', ['business_user', 'service_recipient'], `Interact with ${subject} for requests or approvals.`, { sev: [1, 0, 2, 1], when: ['tech_type', userChange] }));
  if (o.data) r.push(rule('indirect', ['data_governance'], 'Data migration and data quality ownership need confirmation.', { sev: [1, 0, 1, 1], when: ['tech_type', ['replace', 'consolidate']] }));
  return r;
}

/** How stakeholders request, receive, or escalate services changes. */
export function interaction(subject: string, o: { suppliers?: boolean; customers?: boolean; requesters?: boolean } = {}): RuleSpec[] {
  const r: RuleSpec[] = [
    rule('direct', ['gbs_head', 'gbs_leader'], `Owns the new ${subject.toLowerCase()} and its performance.`, { sev: [2, 2, 0, 1] }),
    rule('indirect', ['retained_leader', 'retained_ops'], 'Engages GBS through the new interaction model rather than direct line management.', { fn, sev: [1, 2, 0, 1] }),
    rule('indirect', ['transferring', 'new_hire'], 'Now serve former colleagues through defined interaction channels.', { fn, sev: [1, 2, 1, 1] }),
    rule('indirect', ['function_head', 'process_owner'], 'Counterparts and escalation routes change.', { fn, sev: [1, 2, 0, 1] }),
  ];
  if (o.requesters !== false) r.push(rule('direct', ['business_user', 'service_recipient'], `How they request and escalate changes under the ${subject.toLowerCase()}.`, { sev: [1, 1, 1, 2] }));
  if (o.suppliers) r.push(rule('direct', ['supplier'], 'Supplier contact points and query routes change.', { sev: [1, 2, 1, 2], when: ['supplier_facing', ['yes']], info: 'Confirm whether suppliers see a change.' }), rule('indirect', ['procurement'], 'Supplier relationships are managed through new contact routes.', { sev: [1, 1, 0, 1] }));
  if (o.customers) r.push(rule('direct', ['customer'], 'Customer contact points change.', { sev: [1, 2, 1, 2], when: ['customer_facing', ['yes']], info: 'Confirm whether customers see a change.' }));
  return r;
}
