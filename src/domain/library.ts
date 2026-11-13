import type {
  Archetype, ArtifactType, Channel, ChangeDimension, CommType, CommunicatorRole, Focus, MilestoneKind,
  Objective, Phase, StakeholderRoleFlags, Tone, ReasonKind,
} from './types';

// ----------------------------- Taxonomies ---------------------------------

export const TRANSFORMATION_TYPES = [
  'New GBS setup', 'New GCC setup', 'Shared Services Centre setup', 'Existing GBS expansion',
  'GBS transformation', 'GBS consolidation', 'Outsourcing-to-captive transition',
  'Captive-to-outsourced transition', 'Hybrid service delivery transformation', 'Lift-and-shift',
  'Lift-and-transform', 'Technology-enabled transformation', 'Custom engagement type',
];

export const FUNCTION_LIBRARY = [
  'Finance & Accounting', 'Human Resources', 'Procurement', 'IT', 'Supply Chain', 'Customer Service',
  'Sales Operations', 'Marketing Operations', 'Legal Operations', 'Risk & Compliance',
  'Data & Analytics', 'Enterprise Reporting', 'Administration & Facilities',
];

export const TRANSITION_APPROACHES = ['Lift-and-shift', 'Lift-and-transform', 'Transform-then-shift', 'Phased migration', 'Outsourced transition', 'To be determined'];

export const DEFAULT_DIMENSIONS: ChangeDimension[] = [
  { id: 'dim_om', code: 'OM', short: 'Operating Model', label: 'Change in Operating Model', isDefault: true,
    description: 'Changes to where and how services are delivered, service ownership, and governance.' },
  { id: 'dim_pr', code: 'PR', short: 'Process', label: 'Change in Process', isDefault: true,
    description: 'Changes to process steps, controls, hand-offs, approvals, and policies.' },
  { id: 'dim_os', code: 'OS', short: 'Organization Structure', label: 'Change in Organization Structure', isDefault: true,
    description: 'Changes to reporting lines, roles, team composition, spans, and employment arrangements.' },
  { id: 'dim_te', code: 'TE', short: 'Technology', label: 'Change in Technology Used to Perform or Deliver Services', isDefault: true,
    description: 'New or changed systems, tools, platforms, and access used to perform or deliver services.' },
  { id: 'dim_im', code: 'IM', short: 'Interaction Model', label: 'Change in Interaction Model', isDefault: true,
    description: 'Changes to how stakeholders request, receive, and escalate services, and who they interact with.' },
];

export const DIM = { OM: 'dim_om', PR: 'dim_pr', OS: 'dim_os', TE: 'dim_te', IM: 'dim_im' } as const;

// ----------------------------- Stakeholders -------------------------------

const f = (s: Partial<StakeholderRoleFlags>): StakeholderRoleFlags => ({
  decisionMaker: false, approver: false, sponsor: false, communicator: false,
  executionOwner: false, recipient: true, support: false, ...s,
});

export interface StakeholderTemplate {
  key: string;
  roleName: string;
  archetype: Archetype;
  roles: StakeholderRoleFlags;
}

export interface GroupTemplate {
  code: string;
  name: string;
  members: StakeholderTemplate[];
}

const t = (key: string, roleName: string, archetype: Archetype, roles: Partial<StakeholderRoleFlags> = {}): StakeholderTemplate =>
  ({ key, roleName, archetype, roles: f(roles) });

export const STAKEHOLDER_LIBRARY: GroupTemplate[] = [
  { code: 'A', name: 'Enterprise Leadership', members: [
    t('board', 'Board of Directors', 'board', { decisionMaker: true, approver: true }),
    t('nrc', 'Nomination & Remuneration Committee (NRC)', 'board', { approver: true }),
    t('ceo', 'CEO', 'ceo', { decisionMaker: true, sponsor: true, communicator: true }),
    t('entity_leadership', 'Entity Leadership', 'bu_head', { decisionMaker: true }),
    t('cfo', 'CFO', 'cxo_finance', { decisionMaker: true, sponsor: true, communicator: true, approver: true }),
    t('chro', 'CHRO', 'cxo_hr', { decisionMaker: true, sponsor: true, communicator: true, approver: true }),
    t('cio', 'CIO / CTO', 'cxo_it', { decisionMaker: true, communicator: true }),
    t('cdo', 'CDO', 'cxo_data', { decisionMaker: true }),
    t('cpo', 'CPO', 'cxo_procurement', { communicator: true, decisionMaker: true }),
    t('coo', 'COO', 'cxo_other', { decisionMaker: true }),
    t('bu_heads', 'Business Unit Heads', 'bu_head', {}),
    t('country_heads', 'Country Heads', 'country_head', {}),
    t('transformation_sponsor', 'Enterprise Transformation Sponsor', 'sponsor', { sponsor: true, decisionMaker: true, communicator: true }),
    t('legal_leadership', 'Legal & Compliance Leadership', 'legal_risk_leader', { approver: true }),
    t('risk_leadership', 'Risk Leadership', 'legal_risk_leader', { approver: true }),
  ] },
  { code: 'B', name: 'GBS/GCC Leadership', members: [
    t('gbs_head', 'Global GBS Head', 'gbs_head', { decisionMaker: true, communicator: true, executionOwner: true, sponsor: true }),
    t('gcc_head', 'GCC Head', 'gbs_head', { communicator: true, executionOwner: true }),
    t('ssc_head', 'Shared Services Centre Head', 'gbs_head', { communicator: true, executionOwner: true }),
    t('gbs_site_head', 'GBS Site Head', 'gbs_leader', { executionOwner: true }),
    t('service_delivery_head', 'Service Delivery Head', 'gbs_leader', { executionOwner: true }),
    t('operations_head', 'Operations Head', 'gbs_leader', { executionOwner: true }),
    t('governance_lead', 'Governance Lead', 'gbs_leader', { executionOwner: true }),
    t('gbs_transformation_lead', 'Transformation Lead', 'gbs_leader', { executionOwner: true }),
  ] },
  { code: 'C', name: 'Delivery / Programme Leadership', members: [
    t('programme_manager', 'Programme Manager', 'programme_lead', { executionOwner: true, communicator: true }),
    t('transition_lead', 'Transition Lead', 'programme_lead', { executionOwner: true }),
    t('function_head', 'Function Head', 'function_head', { executionOwner: true, communicator: true }),
    t('process_owner', 'Process Owner', 'process_owner', { executionOwner: true }),
    t('tower_lead', 'Tower Lead', 'process_owner', { executionOwner: true }),
    t('workstream_lead', 'Workstream Lead', 'programme_lead', { executionOwner: true }),
    t('change_lead', 'Change Management Lead', 'change_lead', { executionOwner: true, communicator: true }),
    t('pmo_lead', 'PMO Lead', 'programme_lead', { executionOwner: true, communicator: true }),
    t('sdm', 'Service Delivery Manager', 'gbs_leader', { executionOwner: true }),
    t('functional_sponsor', 'Functional Sponsor', 'sponsor', { sponsor: true }),
  ] },
  { code: 'D', name: 'Delivery Teams', members: [
    t('transferring', 'Employees to be transferred to GBS', 'transferring'),
    t('retained_modified', 'Employees retained with modified roles', 'retained_modified'),
    t('redeployed', 'Employees retained and redeployed', 'redeployed'),
    t('retained_unchanged', 'Employees retained with no material role change', 'retained_unchanged'),
    t('new_hires', 'New GBS hires', 'new_hire'),
    t('process_smes', 'Process SMEs', 'sme', { support: true }),
    t('kt_smes', 'Knowledge Transfer SMEs', 'sme', { support: true, executionOwner: true }),
    t('team_leads', 'Team Leads and Supervisors', 'team_lead', { communicator: true }),
    t('business_users', 'Business Users', 'business_user'),
    t('service_delivery_personnel', 'Service Delivery Personnel', 'new_hire'),
    t('hypercare_team', 'Hypercare Support Team', 'hypercare_team', { support: true, executionOwner: true }),
  ] },
  { code: 'E', name: 'Retained Organisation', members: [
    t('retained_leadership', 'Retained Functional Leadership', 'retained_leader'),
    t('retained_process_owners', 'Retained Process Owners', 'retained_leader'),
    t('retained_ops', 'Retained Operations Teams', 'retained_ops'),
    t('brm', 'Business Relationship Managers', 'retained_leader'),
    t('service_recipients', 'Service Recipients', 'service_recipient'),
    t('local_business', 'Local Business Teams', 'service_recipient'),
    t('governance_oversight', 'Governance and Oversight Teams', 'governance_team'),
  ] },
  { code: 'F', name: 'Back-Office / Support Functions', members: [
    t('hr', 'HR', 'hr_support', { support: true }),
    t('hrbp', 'HR Business Partners', 'hr_support', { support: true, communicator: true }),
    t('ta', 'Talent Acquisition', 'hr_support', { support: true }),
    t('lnd', 'Learning & Development', 'lnd', { support: true }),
    t('int_comms', 'Internal Communications', 'internal_comms', { support: true }),
    t('it', 'IT', 'it_support', { support: true }),
    t('infosec', 'Information Security', 'infosec', { support: true }),
    t('legal', 'Legal', 'legal', { support: true, approver: true }),
    t('procurement', 'Procurement', 'procurement', { support: true }),
    t('finance_support', 'Finance', 'finance_support', { support: true }),
    t('payroll', 'Payroll', 'payroll', { support: true }),
    t('admin', 'Administration', 'facilities', { support: true }),
    t('facilities', 'Facilities', 'facilities', { support: true }),
    t('er', 'Employee Relations', 'hr_support', { support: true }),
    t('compliance', 'Compliance', 'compliance', { support: true }),
    t('privacy', 'Data Privacy', 'compliance', { support: true }),
    t('bcp', 'Business Continuity', 'compliance', { support: true }),
    t('data_governance_lead', 'Data Governance Lead', 'data_governance', { support: true, executionOwner: true }),
    t('data_owners', 'Data Owners', 'process_owner', { support: true }),
  ] },
  { code: 'G', name: 'External Stakeholders', members: [
    t('suppliers', 'Suppliers', 'supplier'),
    t('customers', 'Customers', 'customer'),
    t('outsourcing_partners', 'Outsourcing Partners', 'partner'),
    t('tech_vendors', 'Technology Vendors', 'partner'),
    t('impl_partners', 'Implementation Partners', 'partner', { support: true }),
    t('regulators', 'Regulators', 'regulator'),
    t('other_providers', 'Other Service Providers', 'partner'),
  ] },
  { code: 'H', name: 'Other Employees', members: [
    t('not_impacted', 'Employees not directly impacted', 'general_employee'),
    t('general_awareness', 'Employees requiring general transformation awareness', 'general_employee'),
  ] },
];

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  board: 'Board / governance body', ceo: 'Chief executive', cxo_finance: 'Finance executive', cxo_hr: 'HR executive',
  cxo_it: 'Technology executive', cxo_other: 'Other executive', bu_head: 'Business / entity leader', country_head: 'Country leader',
  sponsor: 'Sponsor', legal_risk_leader: 'Legal / risk leader', gbs_head: 'GBS/GCC head', gbs_leader: 'GBS leadership',
  programme_lead: 'Programme leadership', change_lead: 'Change lead', function_head: 'Function head', process_owner: 'Process owner',
  transferring: 'Transferring employees', retained_modified: 'Retained — modified role', redeployed: 'Redeployed employees',
  retained_unchanged: 'Retained — no material change', new_hire: 'New GBS staff', sme: 'Subject-matter experts',
  team_lead: 'Team leads / line managers', business_user: 'Business users', hypercare_team: 'Hypercare team',
  retained_leader: 'Retained leadership', retained_ops: 'Retained operations', service_recipient: 'Service recipients',
  governance_team: 'Governance & oversight', hr_support: 'HR support', lnd: 'Learning & development',
  internal_comms: 'Internal communications', it_support: 'IT support', infosec: 'Information security', legal: 'Legal',
  procurement: 'Procurement', finance_support: 'Finance support', payroll: 'Payroll', facilities: 'Facilities / admin',
  compliance: 'Compliance / privacy / continuity', supplier: 'Suppliers', customer: 'Customers', partner: 'External partners',
  regulator: 'Regulators', general_employee: 'General employees',
  cxo_data: 'Data executive (CDO)', cxo_procurement: 'Procurement executive (CPO)', data_governance: 'Data governance / data owners',
};

// Archetype families used by the engines.
export const A = {
  executive: ['board', 'ceo', 'cxo_finance', 'cxo_hr', 'cxo_it', 'cxo_other', 'cxo_data', 'cxo_procurement', 'bu_head', 'country_head', 'sponsor', 'legal_risk_leader'] as Archetype[],
  board: ['board'] as Archetype[],
  gbsLeaders: ['gbs_head', 'gbs_leader'] as Archetype[],
  programme: ['programme_lead', 'change_lead'] as Archetype[],
  functionLeaders: ['function_head', 'process_owner', 'retained_leader'] as Archetype[],
  sensitive: ['transferring', 'redeployed', 'retained_modified'] as Archetype[],
  employees: ['transferring', 'retained_modified', 'redeployed', 'retained_unchanged', 'new_hire', 'sme', 'team_lead', 'business_user', 'hypercare_team', 'retained_ops', 'service_recipient', 'general_employee'] as Archetype[],
  hr: ['hr_support', 'lnd', 'payroll'] as Archetype[],
  it: ['it_support', 'infosec'] as Archetype[],
  external: ['supplier', 'customer', 'partner', 'regulator'] as Archetype[],
  supportFns: ['hr_support', 'lnd', 'internal_comms', 'it_support', 'infosec', 'legal', 'procurement', 'finance_support', 'payroll', 'facilities', 'compliance', 'data_governance'] as Archetype[],
  retained: ['retained_leader', 'retained_ops', 'service_recipient', 'business_user', 'governance_team', 'retained_unchanged', 'retained_modified'] as Archetype[],
  mass: ['general_employee', 'business_user', 'service_recipient', 'retained_unchanged'] as Archetype[],
};

// ----------------------------- Milestones ---------------------------------

export const PHASES: Phase[] = [
  { id: 'ph1', num: 1, name: 'Mobilisation & Strategic Alignment', short: 'Mobilise' },
  { id: 'ph2', num: 2, name: 'Assessment & Current-State Understanding', short: 'Assess' },
  { id: 'ph3', num: 3, name: 'Design & Build', short: 'Design & Build' },
  { id: 'ph4', num: 4, name: 'Transition Preparation', short: 'Prepare' },
  { id: 'ph5', num: 5, name: 'Transition & Go-Live', short: 'Transition' },
  { id: 'ph6', num: 6, name: 'Hypercare & Stabilisation', short: 'Hypercare' },
];

export interface MilestoneTemplate {
  key: string;
  phaseId: string;
  name: string;
  focus: Focus[];
  required: boolean;
  objective: string;
  lead: number; // lead time in engagement units before the milestone
  hints: ArtifactType[];
  kind?: MilestoneKind;
  waveSpecific?: boolean;
  defaultOffset: number; // typical position vs go-live in months (scaled when unit differs)
}

const m = (key: string, phaseId: string, name: string, focus: Focus[], defaultOffset: number, opts: Partial<MilestoneTemplate> = {}): MilestoneTemplate => ({
  key, phaseId, name, focus, defaultOffset, required: focus.length > 0, objective: '', lead: 0, hints: [], ...opts,
});

export const MILESTONE_LIBRARY: MilestoneTemplate[] = [
  // Phase 1
  m('mob', 'ph1', 'Engagement mobilisation', ['programme'], -12, { objective: 'Mobilise programme team and confirm ways of working.' }),
  m('kickoff', 'ph1', 'Programme kickoff', ['programme', 'leadership'], -12, { objective: 'Launch the programme and align leadership on scope and governance.', hints: ['exec_briefing'] }),
  m('vision', 'ph1', 'Transformation vision and objectives alignment', ['leadership'], -11, { objective: 'Align leadership on transformation vision and objectives.', hints: ['leadership_announcement'] }),
  m('business_case', 'ph1', 'Business case approval', ['governance'], -11, { objective: 'Secure approval of the GBS business case.', hints: ['exec_briefing'] }),
  m('sponsor_align', 'ph1', 'Executive sponsor alignment', ['leadership'], -11, { objective: 'Confirm sponsorship roles and visible leadership commitments.', hints: ['exec_briefing'] }),
  m('governance_setup', 'ph1', 'Governance setup', ['governance', 'programme'], -11, { objective: 'Establish programme governance forums and decision rights.' }),
  m('charter', 'ph1', 'Project charter approval', ['governance'], -11, { objective: 'Approve the programme charter.', hints: ['exec_briefing'] }),
  m('stakeholder_id', 'ph1', 'Stakeholder identification', [], -11, { required: false }),
  m('initial_leadership_comms', 'ph1', 'Initial leadership communications', ['leadership', 'managers'], -10, { objective: 'Equip leaders to talk about the transformation consistently.', hints: ['leadership_announcement', 'manager_cascade'] }),
  // Phase 2
  m('asis', 'ph2', 'As-Is process assessment', ['programme', 'retained'], -10, { objective: 'Engage process owners and SMEs in the current-state assessment.' }),
  m('scope_id', 'ph2', 'Service scope identification', ['programme'], -10, {}),
  m('baseline', 'ph2', 'Process and organisation baseline', ['programme', 'hr'], -10, {}),
  m('om_assessment', 'ph2', 'Current operating model assessment', ['programme'], -9, {}),
  m('tech_assessment', 'ph2', 'Technology assessment', ['programme', 'it'], -9, {}),
  m('workforce_assessment', 'ph2', 'Workforce impact assessment', ['hr', 'governance'], -9, { objective: 'Confirm workforce impacts with HR and authorised leadership (confidential).' }),
  m('feasibility', 'ph2', 'Transition feasibility assessment', ['programme'], -9, {}),
  m('stakeholder_assessment', 'ph2', 'Stakeholder assessment', [], -9, { required: false }),
  m('findings', 'ph2', 'Assessment findings socialisation', ['leadership', 'programme'], -8, { objective: 'Share assessment findings and implications with leadership.', hints: ['exec_briefing'] }),
  m('gonogo_assess', 'ph2', 'Go/No-Go decision', ['governance'], -8, { objective: 'Secure the go/no-go decision to proceed to design.', hints: ['exec_briefing'] }),
  // Phase 3
  m('fom', 'ph3', 'Future operating model development', ['leadership', 'programme'], -7, { objective: 'Align on the future operating model.', hints: ['leadership_announcement'] }),
  m('tobe', 'ph3', 'To-Be process design', ['programme', 'retained'], -7, { objective: 'Design future processes with process owners.' }),
  m('org_final', 'ph3', 'GBS organisation structure finalisation', ['governance', 'hr'], -6, { objective: 'Approve the GBS organisation structure.' }),
  m('retained_design', 'ph3', 'Retained organisation design', ['governance', 'retained', 'hr'], -6, {}),
  m('raci', 'ph3', 'RACI finalisation', ['programme', 'retained'], -6, {}),
  m('sla', 'ph3', 'SLA/KPI design', ['programme', 'retained'], -6, {}),
  m('gov_model', 'ph3', 'Governance model design', ['governance', 'programme'], -6, {}),
  m('tech_req', 'ph3', 'Technology requirements finalisation', ['it', 'programme'], -6, {}),
  m('infra', 'ph3', 'Infrastructure design', ['it', 'support'], -6, {}),
  m('recruitment_plan', 'ph3', 'Recruitment planning', ['hr'], -5, {}),
  m('transfer_plan', 'ph3', 'Employee transfer planning', ['hr', 'governance'], -5, { objective: 'Plan employee transfer arrangements with HR, Legal and authorised leadership.' }),
  m('cm_strategy', 'ph3', 'Change Management Strategy approval', ['governance'], -5, { hints: ['exec_briefing'] }),
  m('comm_plan_final', 'ph3', 'Communication Plan finalisation', ['governance', 'programme'], -5, {}),
  m('tna', 'ph3', 'Training needs assessment', ['programme', 'hr'], -5, {}),
  // Phase 4
  m('transition_plan', 'ph4', 'Transition plan approval', ['governance', 'programme'], -4, { hints: ['exec_briefing'] }),
  m('impact_confirm', 'ph4', 'Employee impact confirmation', ['hr', 'governance'], -4, { objective: 'Confirm individual employee impacts before any announcement.' }),
  m('hr_leadership_align', 'ph4', 'HR/leadership alignment', ['hr', 'leadership', 'managers'], -4, { objective: 'Prepare leaders and HR for impacted-employee conversations.', hints: ['manager_cascade'] }),
  m('impacted_comms', 'ph4', 'Communication to impacted personnel', ['sensitive_people', 'managers', 'hr', 'awareness'], -3, { objective: 'Inform impacted employees of confirmed changes with appropriate HR handling.', lead: 0, hints: ['impacted_email', 'faq', 'townhall_pack'], waveSpecific: true }),
  m('external_notify', 'ph4', 'External stakeholder notifications', ['external', 'procurement'], -3, { objective: 'Notify external stakeholders of relevant interaction changes.', hints: ['vendor', 'customer'], waveSpecific: true }),
  m('kt_plan', 'ph4', 'Knowledge Transfer planning', ['programme', 'managers'], -3, { waveSpecific: true }),
  m('sop', 'ph4', 'SOP documentation', ['programme'], -3, {}),
  m('access', 'ph4', 'System access readiness', ['it', 'training'], -2, { objective: 'Confirm system access readiness and issue access instructions.', waveSpecific: true }),
  m('training_prep', 'ph4', 'Training material preparation', ['programme', 'hr'], -2, { hints: ['training_pack'] }),
  m('cutover_plan', 'ph4', 'Cutover planning', ['programme', 'it'], -2, { waveSpecific: true }),
  m('readiness_assess', 'ph4', 'Transition readiness assessment', ['governance', 'programme'], -2, { waveSpecific: true, hints: ['exec_briefing'] }),
  m('transition_kickoff', 'ph4', 'Transition kickoff announcement', ['awareness', 'impacted', 'leadership'], -2, { objective: 'Announce transition launch to the organisation.', hints: ['general_announcement', 'townhall_pack'], waveSpecific: true }),
  // Phase 5
  m('onboarding', 'ph5', 'Recruitment and onboarding', ['hr'], -2, { waveSpecific: true }),
  m('kt_start', 'ph5', 'Knowledge Transfer commencement', ['programme', 'managers', 'impacted'], -2, { objective: 'Launch knowledge transfer and set expectations for SMEs and receiving teams.', hints: ['kt_report'], waveSpecific: true }),
  m('shadow', 'ph5', 'Shadow operations', ['programme'], -1, { waveSpecific: true, hints: ['kt_report'] }),
  m('reverse_shadow', 'ph5', 'Reverse shadow operations', ['programme'], -1, { waveSpecific: true, hints: ['kt_report'] }),
  m('kt_signoff', 'ph5', 'KT sign-off', ['governance', 'programme'], -1, { waveSpecific: true, hints: ['kt_report'] }),
  m('process_readiness', 'ph5', 'Process readiness validation', ['programme', 'retained'], -1, { waveSpecific: true }),
  m('employee_training', 'ph5', 'Employee training', ['training'], -1, { objective: 'Equip impacted users with skills for the new processes and tools.', hints: ['training_comm', 'training_pack'], waveSpecific: true }),
  m('system_readiness', 'ph5', 'System readiness', ['it'], -1, { waveSpecific: true }),
  m('cutover_readiness', 'ph5', 'Cutover readiness', ['programme', 'it', 'retained'], -1, { waveSpecific: true }),
  m('gonogo_live', 'ph5', 'Go/No-Go approval', ['governance'], 0, { objective: 'Secure go-live approval.', hints: ['exec_briefing'], waveSpecific: true }),
  m('golive', 'ph5', 'Wave-specific go-live', ['golive', 'impacted', 'retained', 'external', 'leadership'], 0, { objective: 'Announce go-live, effective changes, and support arrangements.', hints: ['golive_announcement'], waveSpecific: true }),
  m('enterprise_golive', 'ph5', 'Enterprise go-live communication', ['awareness', 'leadership'], 0, { objective: 'Communicate GBS go-live across the enterprise.', hints: ['general_announcement'] }),
  // Phase 6
  m('hypercare_start', 'ph6', 'Hypercare commencement', ['hypercare'], 0, { objective: 'Explain hypercare support, escalation, and expectations.', hints: ['hypercare'], waveSpecific: true }),
  m('perf_monitor', 'ph6', 'Service performance monitoring', ['status'], 1, { waveSpecific: true }),
  m('issue_escalation', 'ph6', 'Issue escalation communications', ['crisis'], 1, { kind: 'exception', objective: 'Communicate material service issues through approved escalation routes.' }),
  m('employee_feedback', 'ph6', 'Employee feedback', ['feedback'], 1, { hints: ['survey'], waveSpecific: true }),
  m('sentiment', 'ph6', 'Stakeholder sentiment assessment', ['feedback', 'leadership'], 2, { hints: ['survey'] }),
  m('stabilisation', 'ph6', 'Service stabilisation', ['status', 'retained'], 2, { waveSpecific: true }),
  m('sla_updates', 'ph6', 'SLA/KPI performance updates', ['status', 'retained'], 2, {}),
  m('hypercare_close', 'ph6', 'Hypercare closure', ['hypercare', 'governance'], 3, { waveSpecific: true }),
  m('bau', 'ph6', 'BAU handover', ['retained', 'programme'], 3, { waveSpecific: true }),
  m('benefits', 'ph6', 'Programme benefits communication', ['leadership', 'awareness'], 4, { hints: ['exec_briefing'] }),
  // Recurring
  m('weekly_update', 'ph1', 'Weekly programme status update', ['status', 'programme'], -12, { kind: 'recurring', objective: 'Keep programme leadership informed of progress, risks, and decisions.' }),
  m('steerco', 'ph1', 'Biweekly steering committee report', ['status', 'governance'], -12, { kind: 'recurring', objective: 'Provide steering committee with status, risks, and decisions required.', hints: ['exec_briefing'] }),
];

// ----------------------------- Communication types ------------------------

export const COMM_TYPES: CommType[] = [
  { id: 'ct_strategic', name: 'Strategic Alignments', short: 'Strategic', sensitivity: 'medium', description: 'Vision, decisions, and sponsorship among senior leadership.' },
  { id: 'ct_programme', name: 'Programme Orchestration', short: 'Programme', sensitivity: 'low', description: 'Programme status, milestones, readiness, and coordination.' },
  { id: 'ct_sensitive', name: 'Critical / Sensitive Communication', short: 'Sensitive', sensitivity: 'high', description: 'Employment, role, or confidential matters requiring authorised handling.' },
  { id: 'ct_training', name: 'Trainings', short: 'Training', sensitivity: 'low', description: 'Learning programmes, invitations, and capability enablement.' },
  { id: 'ct_awareness', name: 'Stakeholder Awareness', short: 'Awareness', sensitivity: 'low', description: 'Announcements and awareness of changes and their implications.' },
  { id: 'ct_operational', name: 'Operational / Transactional Updates', short: 'Operational', sensitivity: 'low', description: 'Instructions, cut-over details, access, and service updates.' },
  { id: 'ct_crisis', name: 'Crisis / Incident Communications', short: 'Crisis', sensitivity: 'high', description: 'Incidents and material service issues via approved spokespersons.' },
];

export const CT = {
  strategic: 'ct_strategic', programme: 'ct_programme', sensitive: 'ct_sensitive', training: 'ct_training',
  awareness: 'ct_awareness', operational: 'ct_operational', crisis: 'ct_crisis',
} as const;

// ----------------------------- Communicator roles -------------------------

export const COMMUNICATOR_ROLES: CommunicatorRole[] = [
  { id: 'cr_ceo', name: 'CEO / Executive Sponsor', short: 'CEO', description: 'Enterprise leadership and executive sponsorship.', isCustom: false },
  { id: 'cr_cfo', name: 'CFO', short: 'CFO', description: 'Finance function executive (functional CXO for Finance).', isCustom: false },
  { id: 'cr_chro', name: 'CHRO / HR Leadership', short: 'CHRO', description: 'People strategy, employment matters, HR policy.', isCustom: false },
  { id: 'cr_cxo', name: 'Functional CXO', short: 'Functional CXO', description: 'Accountable executive for an in-scope function.', isCustom: false },
  { id: 'cr_gbs_head', name: 'GBS Head', short: 'GBS Head', description: 'GBS/GCC leadership and service delivery accountability.', isCustom: false },
  { id: 'cr_programme_head', name: 'Programme Head', short: 'Programme Head', description: 'Programme leadership, orchestration, and readiness.', isCustom: false },
  { id: 'cr_pmo', name: 'PMO Lead', short: 'PMO Lead', description: 'Status reporting and governance cadence.', isCustom: false },
  { id: 'cr_function_head', name: 'Function Head / Process Owner', short: 'Function Head', description: 'Function-specific operational impacts and adoption.', isCustom: false },
  { id: 'cr_training', name: 'Training Lead / Programme Team', short: 'Training Team', description: 'Learning delivery and capability enablement.', isCustom: false },
  { id: 'cr_corp_comms', name: 'Corporate Communications / CCO', short: 'Corp Comms', description: 'Enterprise and external communications, crisis response.', isCustom: false },
  { id: 'cr_it_lead', name: 'IT / Technology Lead', short: 'IT Lead', description: 'Technology rollout, access, and technical support.', isCustom: false },
  { id: 'cr_hrbp', name: 'HR Business Partner / Line Manager', short: 'HRBP / Line Mgr', description: 'Individual employee conversations and follow-ups.', isCustom: false },
  { id: 'cr_procurement', name: 'Procurement Lead / Supplier Relationship Owner', short: 'Procurement Lead', description: 'Supplier relationships and commercial communications.', isCustom: false },
  { id: 'cr_legal', name: 'Legal / Compliance Approver', short: 'Legal', description: 'Legal, regulatory, and contractual approval.', isCustom: false },
  { id: 'cr_change_lead', name: 'Change Management Lead', short: 'Change Lead', description: 'Change strategy, content creation, and coordination.', isCustom: false },
  { id: 'cr_hr_lead', name: 'HR Lead (Programme)', short: 'HR Lead', description: 'Programme HR workstream lead.', isCustom: false },
];

export const DEFAULT_FRAMEWORK: Record<string, Record<string, string>> = {
  cr_ceo: {
    ct_strategic: 'Transformation vision, major decisions, sponsorship messages to Board and leadership.',
    ct_programme: 'Not typical; visible endorsement at key gates only.',
    ct_sensitive: 'Enterprise-level framing only; individual matters are HR-led.',
    ct_training: 'Not typical.',
    ct_awareness: 'Enterprise-wide announcements and selected town halls.',
    ct_operational: 'Not typical.',
    ct_crisis: 'Spokesperson for material incidents when governance designates.',
  },
  cr_cfo: {
    ct_strategic: 'Finance-specific strategic alignment and business case sponsorship.',
    ct_awareness: 'Finance function impact updates.',
    ct_operational: 'Escalation point for Finance service issues.',
  },
  cr_chro: {
    ct_strategic: 'People strategy and workforce implications at leadership level.',
    ct_sensitive: 'People transfer strategy, role changes, employment-related announcements, employee relations.',
    ct_awareness: 'HR policy implications and people-related updates.',
    ct_crisis: 'People-related incidents with Legal and Corporate Communications.',
  },
  cr_cxo: {
    ct_strategic: 'Function-specific strategic alignment and sponsorship.',
    ct_awareness: 'Business impact updates; customer or supplier messages where accountable.',
  },
  cr_gbs_head: {
    ct_strategic: 'Future operating model alignment with leadership.',
    ct_programme: 'Milestone updates, transition readiness, go-live updates.',
    ct_awareness: 'Programme-wide and go-live communication.',
    ct_operational: 'Service delivery updates and hypercare status.',
  },
  cr_programme_head: {
    ct_programme: 'Programme orchestration, milestone status, readiness, coordination.',
    ct_operational: 'Cut-over plans and transition logistics.',
  },
  cr_pmo: { ct_programme: 'Weekly status updates, steering committee reports, dashboards.' },
  cr_function_head: {
    ct_awareness: 'Function-specific operational impacts and new ways of working.',
    ct_operational: 'Process changes and team-level adoption.',
    ct_training: 'Sponsors training for own teams.',
  },
  cr_training: { ct_training: 'Training invitations, delivery, operating model orientation, follow-ups.' },
  cr_corp_comms: {
    ct_awareness: 'Approved enterprise-wide and external communications.',
    ct_sensitive: 'Coordinates timing and wording with HR leadership.',
    ct_crisis: 'Crisis response and approved external statements.',
  },
  cr_it_lead: {
    ct_operational: 'Technology rollout, access instructions, platform changes, technical support.',
    ct_training: 'System training with the training team.',
  },
  cr_hrbp: {
    ct_sensitive: 'Individual employee conversations and approved follow-up communications.',
    ct_operational: 'Team-level cascade of approved messages.',
  },
  cr_procurement: { ct_awareness: 'Supplier notifications and relationship conversations.', ct_operational: 'Procurement process changes for suppliers.' },
  cr_legal: { ct_sensitive: 'Approves employment-related content per jurisdiction.', ct_crisis: 'Approves crisis and external statements.' },
  cr_change_lead: { ct_programme: 'Coordinates the communication plan and content creation.', ct_awareness: 'Drafts awareness content for approval.' },
  cr_hr_lead: { ct_sensitive: 'Owns delivery of HR-led communications.', ct_operational: 'HR process and policy logistics.' },
};

// ----------------------------- Channels -----------------------------------

const ch = (id: string, name: string, category: Channel['category'], color: Channel['color'], scale: Channel['attrs']['scale'], twoWay: boolean, confidential: boolean, auditTrail: boolean): Channel =>
  ({ id, name, category, color, enabled: true, isCustom: false, attrs: { scale, twoWay, confidential, auditTrail } });

export const CHANNEL_LIBRARY: Channel[] = [
  ch('ch_1to1', '1:1 Meetings', 'In-Person / Leadership', 'purple', 'individual', true, true, false),
  ch('ch_in_person', 'In-Person Meetings', 'In-Person / Leadership', 'amber', 'group', true, true, false),
  ch('ch_leadership_briefing', 'Leadership Briefings', 'In-Person / Leadership', 'amber', 'group', true, true, false),
  ch('ch_townhall', 'Town Halls', 'In-Person / Leadership', 'blue', 'mass', true, false, false),
  ch('ch_huddle', 'Team Huddles', 'In-Person / Leadership', 'blue', 'group', true, false, false),
  ch('ch_leadership_workshop', 'Leadership Workshops', 'In-Person / Leadership', 'blue', 'group', true, true, false),
  ch('ch_employee_briefing', 'Employee Briefings', 'In-Person / Leadership', 'blue', 'group', true, false, false),
  ch('ch_small_group', 'Small-group Conversations', 'In-Person / Leadership', 'purple', 'group', true, true, false),
  ch('ch_email', 'Email', 'Digital', 'green', 'mass', false, false, true),
  ch('ch_newsletter', 'Newsletters', 'Digital', 'green', 'mass', false, false, true),
  ch('ch_teams', 'Microsoft Teams', 'Digital', 'yellow', 'group', true, false, true),
  ch('ch_slack', 'Slack', 'Digital', 'yellow', 'group', true, false, true),
  ch('ch_intranet', 'Corporate Intranet', 'Digital', 'yellow', 'mass', false, false, true),
  ch('ch_social', 'Internal Social Platform', 'Digital', 'yellow', 'mass', true, false, true),
  ch('ch_noticeboard', 'Digital Noticeboards', 'Digital', 'yellow', 'mass', false, false, false),
  ch('ch_video', 'Recorded Video Messages', 'Digital', 'yellow', 'mass', false, false, true),
  ch('ch_virtual_meeting', 'Virtual Meetings', 'Interactive', 'indigo', 'group', true, true, false),
  ch('ch_webinar', 'Webinars', 'Interactive', 'blue', 'mass', true, false, false),
  ch('ch_qa', 'Q&A Sessions', 'Interactive', 'indigo', 'group', true, false, false),
  ch('ch_listening', 'Employee Listening Sessions', 'Interactive', 'indigo', 'group', true, true, false),
  ch('ch_focus_group', 'Focus Groups', 'Interactive', 'indigo', 'group', true, true, false),
  ch('ch_pulse', 'Pulse Surveys', 'Interactive', 'indigo', 'mass', true, true, true),
  ch('ch_forum', 'Feedback Forums', 'Interactive', 'indigo', 'mass', true, false, true),
  ch('ch_office_hours', 'Office Hours', 'Interactive', 'indigo', 'group', true, false, false),
  ch('ch_ilt', 'Instructor-led Training', 'Training & Enablement', 'teal', 'group', true, false, true),
  ch('ch_vilt', 'Virtual Instructor-led Training', 'Training & Enablement', 'teal', 'group', true, false, true),
  ch('ch_lms', 'LMS Modules', 'Training & Enablement', 'teal', 'mass', false, false, true),
  ch('ch_demo', 'Demonstrations', 'Training & Enablement', 'teal', 'group', true, false, false),
  ch('ch_walkthrough', 'Process Walkthroughs', 'Training & Enablement', 'teal', 'group', true, false, false),
  ch('ch_job_aids', 'Job Aids', 'Training & Enablement', 'teal', 'mass', false, false, true),
  ch('ch_kb', 'Knowledge Base Articles', 'Training & Enablement', 'teal', 'mass', false, false, true),
  ch('ch_training_workshop', 'Training Workshops', 'Training & Enablement', 'teal', 'group', true, false, true),
  ch('ch_letter', 'Official Letters', 'Formal', 'rose', 'individual', false, true, true),
  ch('ch_hr_notice', 'HR Notices', 'Formal', 'rose', 'individual', false, true, true),
  ch('ch_policy', 'Policy Communications', 'Formal', 'rose', 'mass', false, false, true),
  ch('ch_contract_notice', 'Contractual Notifications', 'Formal', 'rose', 'individual', false, true, true),
  ch('ch_supplier_letter', 'Supplier Letters', 'Formal', 'rose', 'group', false, true, true),
  ch('ch_customer_notice', 'Customer Notifications', 'Formal', 'rose', 'mass', false, false, true),
  ch('ch_gov_memo', 'Formal Governance Memoranda', 'Formal', 'rose', 'group', false, true, true),
  ch('ch_kt_report', 'KT Status Reports', 'Operational', 'slate', 'group', false, false, true),
  ch('ch_dashboard', 'Programme Dashboards', 'Operational', 'slate', 'group', false, false, true),
  ch('ch_weekly_status', 'Weekly Status Updates', 'Operational', 'slate', 'group', false, false, true),
  ch('ch_steerco_report', 'Steering Committee Reports', 'Operational', 'slate', 'group', false, true, true),
  ch('ch_readiness_bulletin', 'Service Readiness Bulletins', 'Operational', 'slate', 'mass', false, false, true),
  ch('ch_golive_checklist', 'Go-Live Checklists', 'Operational', 'slate', 'group', false, false, true),
  ch('ch_hypercare_updates', 'Hypercare Updates', 'Operational', 'slate', 'mass', false, false, true),
  ch('ch_escalation', 'Escalation Notifications', 'Operational', 'slate', 'group', false, true, true),
  ch('ch_faq', 'FAQs', 'Awareness Materials', 'brown', 'mass', false, false, true),
  ch('ch_poster', 'Posters', 'Awareness Materials', 'brown', 'mass', false, false, false),
  ch('ch_infographic', 'Infographics', 'Awareness Materials', 'brown', 'mass', false, false, false),
  ch('ch_campaign', 'Internal Campaigns', 'Awareness Materials', 'brown', 'mass', false, false, false),
  ch('ch_manager_cascade', 'Manager Cascade Packs', 'Awareness Materials', 'brown', 'group', true, false, true),
];

export const CHANNEL_COLOR_LABEL: Record<Channel['color'], string> = {
  amber: 'Meetings / Executive briefings', purple: '1:1 / Small-group', blue: 'Town halls / Workshops / Briefings',
  green: 'Email / Newsletter', yellow: 'Intranet / Digital collaboration', rose: 'Formal letters / Notices',
  teal: 'Training & enablement', slate: 'Operational reporting', indigo: 'Interactive / Feedback', brown: 'Awareness materials',
};

// ----------------------------- Labels -------------------------------------

export const OBJECTIVES: Record<Objective, string> = {
  inform: 'Inform', align: 'Align', seek_approval: 'Seek approval', prepare: 'Prepare', engage: 'Engage', train: 'Train',
  reassure: 'Reassure', request_action: 'Request action', escalate: 'Escalate', confirm_readiness: 'Confirm readiness',
  announce: 'Announce', reinforce: 'Reinforce adoption', collect_feedback: 'Collect feedback',
};

export const REASON_LABELS: Record<ReasonKind, string> = {
  direct_impact: 'Direct impact', indirect_impact: 'Indirect impact', decision: 'Decision authority', sponsorship: 'Sponsorship',
  execution: 'Execution responsibility', dependency: 'Functional dependency', awareness: 'Awareness requirement',
  external: 'External relationship', readiness: 'Readiness requirement',
};

export const TONES: Record<Tone, string> = {
  executive: 'Executive / Board-level', formal: 'Formal Corporate', reassuring: 'Reassuring / Employee-centric',
  operational: 'Direct / Operational', informative: 'Informative / Awareness', instructional: 'Instructional / Training',
  sensitive: 'Sensitive / HR-led', urgent: 'Urgent / Incident Response',
};

export const ARTIFACT_TYPES: Record<ArtifactType, { label: string; letter: string; description: string }> = {
  general_announcement: { letter: 'A', label: 'General GBS Announcement Email', description: 'Enterprise-wide announcement of the transformation or milestone.' },
  impacted_email: { letter: 'B', label: 'Impacted Personnel Email', description: 'Targeted message tailored to a specific impacted population.' },
  leadership_announcement: { letter: 'C', label: 'Leadership Announcement', description: 'Leadership communication with rationale, decisions, and expectations.' },
  vendor: { letter: 'D', label: 'Vendor / Supplier Communication', description: 'Interaction, contact, and process changes for suppliers.' },
  customer: { letter: 'E', label: 'Customer Communication', description: 'Service continuity and contact changes for customers.' },
  kt_report: { letter: 'F', label: 'Knowledge Transfer Status Report', description: 'KT status derived from tracked KT data.' },
  training_comm: { letter: 'G', label: 'Training Communication', description: 'Training invitation with objectives, schedule, and expectations.' },
  training_pack: { letter: 'H', label: 'Training Material / Training Pack', description: 'Editable training pack with modules, facilitator notes, and storyboard.' },
  townhall_pack: { letter: 'I', label: 'Town Hall Pack', description: 'Agenda, speaker roles, scripts, talking points, and Q&A.' },
  manager_cascade: { letter: 'J', label: 'Manager Cascade Pack', description: 'Core messages, tailoring guidance, and FAQs for managers.' },
  golive_announcement: { letter: 'K', label: 'Go-Live Announcement', description: 'Effective changes, support arrangements, and escalation.' },
  hypercare: { letter: 'L', label: 'Hypercare Communication', description: 'Hypercare purpose, support model, and escalation.' },
  faq: { letter: 'M', label: 'FAQ Document', description: 'Stakeholder-specific FAQs from known engagement facts.' },
  survey: { letter: 'N', label: 'Communication and Feedback Survey', description: 'Awareness, understanding, readiness, and feedback questions.' },
  exec_briefing: { letter: 'O', label: 'Executive Briefing Note', description: 'Situation, change, implications, decisions, and risks.' },
};

export const COMM_STATUS_LABEL: Record<string, string> = {
  proposed: 'Rule proposed', needs_review: 'Needs review', confirmed: 'Consultant confirmed', draft_prepared: 'Draft prepared',
  pending_approval: 'Pending approval', approved: 'Approved', ready: 'Ready for delivery', completed: 'Completed',
  deferred: 'Deferred', cancelled: 'Cancelled',
};

export const FOCUS_LABELS: Record<Focus, string> = {
  governance: 'Governance decision', leadership: 'Leadership alignment', programme: 'Programme team / execution',
  impacted: 'Directly impacted populations', sensitive_people: 'Employment-impacted populations (HR-led)',
  managers: 'Managers / cascade', hr: 'HR enablement', it: 'IT enablement', external: 'External stakeholders',
  procurement: 'Procurement enablement', training: 'Training / readiness', awareness: 'General awareness',
  retained: 'Retained organisation interfaces', support: 'Support functions', hypercare: 'Hypercare support',
  status: 'Status reporting', golive: 'Go-live announcement', feedback: 'Feedback collection', crisis: 'Incident / crisis',
};
