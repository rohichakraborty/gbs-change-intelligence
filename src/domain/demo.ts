// ---------------------------------------------------------------------------
// Project Atlas — entirely fictional demonstration engagement.
// No real organisation, person, or project is represented. Nothing here is validated.
// ---------------------------------------------------------------------------
import type { ChangeRecord, EngagementState, Milestone, Stakeholder } from './types';
import { createBlankState, commFromRec, customChange, milestoneFromTemplate, nextChangeCode } from './factory';
import { getTemplate } from '../catalogue/registry';
import { instanceFromTemplate } from '../catalogue/instance';
import { MILESTONE_LIBRARY } from './library';
import { nowIso, uid } from './util';
import { derive } from '../engine/derive';
import { artifactTitle, generateVersion } from '../engine/artifacts';
import type { ArtifactType } from './types';

const FIN = 'Finance & Accounting';
const HR = 'Human Resources';

export function createDemoState(): EngagementState {
  const s = createBlankState('Project Atlas — Finance & HR GBS Transformation');
  const e = s.engagement;
  e.isDemo = true;
  e.client = 'Meridian Holdings (fictional)';
  e.industry = 'Industrial manufacturing';
  e.description = 'DEMONSTRATION DATA. A fictional multinational is consolidating selected Finance and HR processes into a new GBS centre to standardise processes, strengthen controls, and create a scalable service platform.';
  e.entities = ['Meridian UK Ltd', 'Meridian GmbH', 'Meridian Nederland BV'];
  e.geographies = ['United Kingdom', 'Germany', 'Netherlands', 'Poland'];
  e.gbsLocations = ['Kraków, Poland'];
  e.additionalLanguages = ['German', 'Dutch', 'Polish'];
  e.transformationTypes = ['New GBS setup', 'Lift-and-transform', 'Technology-enabled transformation'];
  e.functions = [
    { id: uid('fn'), name: FIN, approach: 'Lift-and-transform' },
    { id: uid('fn'), name: HR, approach: 'Lift-and-shift' },
  ];
  e.startDate = '2026-05-04';
  e.timeUnit = 'months';
  e.currentPhaseId = 'ph3';
  e.originOrg = 'Local Finance and HR teams (UK, DE, NL)';
  e.destinationOrg = 'Meridian GBS — Kraków';
  e.confidentiality = 'Confidential — demonstration data';
  e.setupComplete = true;

  const w1 = s.waves[0];
  Object.assign(w1, { name: 'Wave 1 — Finance', goLiveDate: '2027-04-05', scope: 'Accounts payable, accounts receivable, general ledger', functions: [FIN], geographies: ['United Kingdom', 'Germany', 'Netherlands'] });
  const w2 = { id: uid('wave'), name: 'Wave 2 — HR', goLiveDate: '2027-07-05', scope: 'HR operations, employee data management, payroll input', functions: [HR], geographies: ['United Kingdom', 'Germany', 'Netherlands'] };
  s.waves.push(w2);
  e.plannedGoLive = w1.goLiveDate;

  const names: Record<string, string> = {
    'Executive Sponsor': 'Helena Marsh (CEO)', 'Programme Manager': 'Tomasz Wierzba', 'GBS/GCC Head': 'Priya Raman',
    'Change Management Lead': 'Daniel Okafor', 'HR Lead': 'Sofia Lindqvist', 'CHRO / HR Leadership': 'Mark Bennett',
    CFO: 'Anna Keller', 'Communication Lead': 'Claire Dubois', 'PMO Lead': 'Lucas Meyer', 'IT Lead': 'Rahul Mehta',
    'Functional Sponsor': 'Jonas Vermeer', 'HR Business Partner lead': 'Eva Novak',
  };
  for (const g of e.governance) g.personName = names[g.title] ?? '';
  // Legal/Compliance Approver, Training Lead and Procurement Lead are intentionally left unnamed to demonstrate governance gaps.

  // --- Stakeholders
  const byKey = (k: string) => s.stakeholders.find((x) => x.libraryKey === k)!;
  const pick = (k: string, patch: Partial<Stakeholder> = {}) => Object.assign(byKey(k), { selected: true }, patch);
  pick('board', { entity: 'Meridian Holdings', population: 9 });
  pick('ceo', { influence: 'high', readiness: 'champion', owner: 'Helena Marsh' });
  pick('cfo', { influence: 'high', readiness: 'supportive', owner: 'Anna Keller' });
  pick('chro', { influence: 'high', readiness: 'supportive', owner: 'Mark Bennett' });
  pick('gbs_head', { roleName: 'GBS Head', influence: 'high', readiness: 'champion', geography: 'Poland', owner: 'Priya Raman' });
  pick('programme_manager', { influence: 'medium', readiness: 'champion' });
  pick('change_lead', { influence: 'medium', readiness: 'champion' });
  const finHead = pick('function_head', { roleName: 'Finance Function Head', functionName: FIN, waveIds: [w1.id], influence: 'high', readiness: 'aware', population: 3 });
  const hrHead: Stakeholder = { ...finHead, id: uid('st'), roleName: 'HR Function Head', functionName: HR, waveIds: [w2.id], isCustom: true, libraryKey: null, sortOrder: finHead.sortOrder + 1, readiness: 'concerned', roles: { ...finHead.roles } };
  s.stakeholders.push(hrHead);
  pick('transferring', { roleName: 'Transferring Employees (Finance AP/AR/GL)', functionName: FIN, waveIds: [w1.id], population: 46, readiness: 'concerned', geography: 'United Kingdom, Germany, Netherlands', notes: 'Demo assumption: 46 roles in scope pending HR confirmation.' });
  pick('retained_modified', { roleName: 'Retained Employees — modified roles (HR advisory)', functionName: HR, waveIds: [w2.id], population: 28, readiness: 'resistant', geography: 'United Kingdom, Germany, Netherlands' });
  pick('retained_unchanged', { roleName: 'Retained Employees — no material change', population: 140, readiness: 'aware' });
  pick('team_leads', { functionName: FIN, waveIds: [w1.id], population: 8 });
  pick('business_users', { roleName: 'Business Users (budget holders & requesters)', population: 1200, geography: 'United Kingdom, Germany, Netherlands' });
  pick('hypercare_team', { population: 12 });
  pick('hrbp', { roleName: 'HR Support (HR Business Partners)', population: 10 });
  pick('it', { roleName: 'IT Support', population: 15 });
  pick('procurement', { population: 6 });
  pick('legal', { population: 3 });
  pick('suppliers', { roleName: 'External Suppliers', population: 2400, notes: 'Approx. active supplier count (demo).' });
  pick('not_impacted', { population: 3800 });

  // --- Milestones (select and add wave-specific copies)
  const ms = (k: string) => s.milestones.find((m) => m.libraryKey === k && m.waveId !== w2.id)!;
  const selectKeys = ['kickoff', 'business_case', 'sponsor_align', 'initial_leadership_comms', 'findings', 'fom', 'org_final', 'transfer_plan',
    'cm_strategy', 'impacted_comms', 'external_notify', 'access', 'transition_kickoff', 'kt_start', 'employee_training', 'gonogo_live', 'golive',
    'enterprise_golive', 'hypercare_start', 'employee_feedback', 'issue_escalation', 'weekly_update', 'steerco'];
  const waveScoped = ['impacted_comms', 'external_notify', 'access', 'transition_kickoff', 'kt_start', 'employee_training', 'gonogo_live', 'golive', 'hypercare_start', 'employee_feedback'];
  for (const k of selectKeys) {
    const m = ms(k);
    m.selected = true;
    if (waveScoped.includes(k)) m.waveId = w1.id;
  }
  ms('kickoff').anchor = 'date';
  ms('kickoff').date = '2026-05-11';
  ms('golive').owner = 'Priya Raman';
  ms('impacted_comms').gating = 'Employee impact confirmed by HR; Legal review complete.';
  ms('impacted_comms').dependencies = [ms('transfer_plan').id];
  const addWave2 = (k: string) => {
    const t = MILESTONE_LIBRARY.find((x) => x.key === k)!;
    const base = ms(k);
    const copy: Milestone = { ...milestoneFromTemplate(t, 'months', base.sortOrder + 1, w2.id), selected: true };
    s.milestones.push(copy);
    return copy;
  };
  const w2Impacted = addWave2('impacted_comms');
  addWave2('employee_training');
  const w2Golive = addWave2('golive');

  // --- Change selection from the GBS Change Library (synthetic engagement facts layered on top)
  const pickT = (id: string, patch: Partial<ChangeRecord> = {}, answers: Record<string, string> = {}) => {
    const tpl = getTemplate(id, 1)!;
    const c = { ...instanceFromTemplate(s, tpl, nextChangeCode(s)), ...patch };
    c.clarificationAnswers = { ...answers };
    s.changes.push(c);
    return c;
  };
  const w1Golive = ms('golive');
  // Finance — Wave 1
  pickT('OM-FIN-01', { toBe: 'GBS Kraków delivers Accounts Payable processing for UK, DE and NL under agreed SLAs; retained Finance governs the service.', rationale: 'Standardise finance operations, strengthen controls, and create a scalable service platform (demo rationale).', notChanging: 'Local CFO accountability for statutory reporting and financial control remains with each entity.', effectiveDate: '2027-04-05', milestoneId: w1Golive.id, owner: 'Anna Keller', status: 'confirmed', defaultsReviewed: true }, { supplier_facing: 'yes', employment_effect: 'transfer' });
  pickT('OM-FIN-02', { status: 'confirmed', effectiveDate: '2027-04-05' }, { customer_facing: 'no', employment_effect: 'transfer' });
  pickT('OM-FIN-03', { status: 'confirmed', effectiveDate: '2027-04-05' }, { employment_effect: 'transfer' });
  pickT('PR-FIN-01', { status: 'confirmed' }, { supplier_facing: 'yes', requester_impact: 'yes' });
  pickT('PR-FIN-02', {}, { requester_impact: 'yes' });
  pickT('PR-FIN-05');
  pickT('OS-FIN-01', { peopleAffected: 46, effectiveDate: '2027-04-05', status: 'confirmed', defaultsReviewed: true, asIs: 'AP/AR/GL staff report to country Finance Managers in UK, DE and NL.', toBe: 'AP/AR/GL staff report to GBS Finance Operations leads in the GBS organisation.', assumptions: 'Transfer mechanism and employment terms to be confirmed by HR and Legal per jurisdiction.' }, { employment_effect: 'transfer' });
  pickT('TE-FIN-01', { owner: 'Rahul Mehta' }, { tech_type: 'supplement', supplier_facing: 'yes', automation_effect: 'augment' });
  pickT('TE-FIN-02', {}, { supplier_facing: 'yes' });
  pickT('IM-PRO-01', {}, { supplier_facing: 'yes' });
  pickT('IM-FIN-01', {}, { supplier_facing: 'yes' });
  // HR — Wave 2
  pickT('OM-HR-01', { status: 'needs_review', effectiveDate: '2027-07-05' }, { employment_effect: 'transfer' });
  pickT('OM-HR-05', { effectiveDate: '2027-07-05' });
  pickT('PR-HR-03', {}, { requester_impact: 'yes' });
  pickT('PR-HR-02', {}, { requester_impact: 'yes' });
  pickT('OS-HR-01', { peopleAffected: 28, status: 'needs_review' }, { employment_effect: 'role_change' });
  pickT('TE-HR-02', {}, { portal_population: 'all_employees' });
  pickT('IM-HR-01', { effectiveDate: '2027-07-05' });
  // Enterprise-wide
  pickT('OM-ENT-01', { status: 'confirmed' });
  pickT('OM-ENT-03');
  pickT('TE-ENT-01'); // clarification intentionally left unanswered to demonstrate "Requires review"
  pickT('IM-ENT-07');
  // One consultant-authored custom change (keyword rules), with an undocumented To-Be
  const custom = customChange(s, 'dim_te');
  Object.assign(custom, { title: 'HR case management platform selection', functionName: HR, functionTags: [HR], waveIds: [w2.id], process: 'HR enquiries',
    description: 'Platform selection in progress — To-Be not yet documented.', owner: 'Rahul Mehta', status: 'draft' });
  s.changes.push(custom);
  void w2Impacted;

  // --- Consultant decisions on the impact matrix (demonstrate overrides)
  const proc = byKey('procurement'), board = byKey('board');
  const at = nowIso();
  s.assessments[`${proc.id}|dim_te`] = { id: `${proc.id}|dim_te`, stakeholderId: proc.id, dimensionId: 'dim_te', status: 'confirmed', comments: [],
    decision: { classification: 'impacted', directness: 'indirect', severity: { responsibilities: 1, relationships: 0, tools: 2, behaviours: 1 }, rationale: 'Consultant override: Procurement administers supplier master data used by the new AP workflow platform (confirmed in design workshop — fictional).', decidedAt: at, basedOnRec: 'not_impacted' } };
  s.assessments[`${board.id}|dim_om`] = { id: `${board.id}|dim_om`, stakeholderId: board.id, dimensionId: 'dim_om', status: 'confirmed', comments: [],
    decision: { classification: 'not_impacted', directness: null, severity: null, rationale: 'Oversight role. Strategic updates handled through governance communications, not as an impacted group.', decidedAt: at, basedOnRec: 'not_impacted' } };

  // --- KT tracking data (user-entered style, fictional)
  s.kt = [
    { id: uid('kt'), workstream: 'Finance — Wave 1', process: 'AP invoice processing', waveId: w1.id, ktPhase: 'Documentation', reportingPeriod: 'Demo period: 26 Oct – 06 Nov 2026',
      plannedActivities: 'SOP walkthroughs for UK and DE; exception handling sessions.', completedActivities: 'UK SOP walkthrough held.', openActivities: 'DE and NL walkthroughs; exception catalogue.',
      readiness: 'on_track', issues: '', dependencies: 'SME availability during month-end.', decisions: '', nextSteps: 'Schedule DE walkthrough.' },
    { id: uid('kt'), workstream: 'Finance — Wave 1', process: 'Vendor master data', waveId: w1.id, ktPhase: 'Planning', reportingPeriod: 'Demo period: 26 Oct – 06 Nov 2026',
      plannedActivities: 'Data ownership agreement; SOP drafting.', completedActivities: '', openActivities: 'Agree data ownership between Procurement and GBS.',
      readiness: 'at_risk', issues: 'Ownership of supplier bank-detail changes not agreed.', dependencies: 'Procurement policy decision.', decisions: 'Confirm owner of supplier bank-detail verification.', nextSteps: 'Raise at steering committee.' },
    { id: uid('kt'), workstream: 'Finance — Wave 1', process: 'GL month-end close', waveId: w1.id, ktPhase: 'Planning', reportingPeriod: 'Demo period: 26 Oct – 06 Nov 2026',
      plannedActivities: 'Close calendar mapping.', completedActivities: '', openActivities: 'Close calendar mapping.', readiness: 'not_assessed', issues: '', dependencies: '', decisions: '', nextSteps: '' },
  ];

  // --- Materialise the communication plan from rule recommendations
  let d = derive({ ...s });
  for (const ar of d.audienceRecs.values()) s.comms.push(commFromRec(s, ar));
  d = derive({ ...s });
  const today = '2026-11-08';
  for (const v of d.comms) {
    if (v.plannedDate && v.plannedDate < today && v.milestone.kind === 'milestone') v.rec.status = 'completed';
    else if (v.milestone.phaseId === 'ph3' && v.rec.commTypeId !== 'ct_sensitive') { v.rec.status = 'confirmed'; v.rec.reviewedFingerprint = v.fingerprint; }
    else if (v.rec.commTypeId === 'ct_sensitive') v.rec.status = 'needs_review';
  }

  // --- Generate a few artifacts to show the studio
  d = derive({ ...s });
  const gen = (milestoneKey: string, archetype: string, type: ArtifactType, waveId: string | null = w1.id) => {
    const v = d.comms.find((c) => c.milestone.libraryKey === milestoneKey && c.audience.archetype === archetype && (waveId === null || c.milestone.waveId === waveId));
    if (!v) return;
    s.counters.artifact += 1;
    const version = generateVersion({ ...s }, v, type, { v: 1, origin: 'generated', note: 'Generated from communication record', length: 'standard' });
    s.artifacts.push({ id: uid('art'), code: `ART-${String(s.counters.artifact).padStart(3, '0')}`, communicationRecordId: v.rec.id, type,
      title: artifactTitle(s, v, type), versions: [version], approvalStatus: 'draft', createdAt: nowIso(), updatedAt: nowIso() });
    if (v.rec.status === 'confirmed' || v.rec.status === 'proposed') v.rec.status = 'draft_prepared';
  };
  gen('impacted_comms', 'transferring', 'impacted_email');
  gen('golive', 'ceo', 'exec_briefing');
  gen('golive', 'transferring', 'golive_announcement');
  gen('enterprise_golive', 'general_employee', 'general_announcement', null);
  gen('kt_start', 'gbs_head', 'kt_report');

  s.audit.push({ id: uid('aud'), at: nowIso(), entityType: 'engagement', entityId: e.id, action: 'create', summary: 'Demonstration engagement created (fictional data).' });
  return s;
}
