// ---------------------------------------------------------------------------
// Project Atlas — entirely fictional demonstration engagement.
// No real organisation, person, or project is represented. Nothing here is validated.
// ---------------------------------------------------------------------------
import type { ChangeRecord, EngagementState, Milestone, Stakeholder } from './types';
import { createBlankState, commFromRec, milestoneFromTemplate } from './factory';
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

  // --- Change records (synthetic)
  let n = 0;
  const chg = (p: Partial<ChangeRecord> & Pick<ChangeRecord, 'dimensionId' | 'title'>): ChangeRecord => {
    n += 1;
    const c: ChangeRecord = {
      id: uid('chg'), code: `CHG-${String(n).padStart(3, '0')}`, description: '', asIs: '', toBe: '', notChanging: '', rationale: '', functionName: '',
      geography: '', process: '', effectiveDate: null, milestoneId: null, waveIds: [], peopleAffected: null, owner: '', operationalImpact: '',
      behaviouralImpact: '', dependencies: '', assumptions: '', evidence: '', status: 'confirmed', ...p,
    };
    s.changes.push(c);
    return c;
  };
  const w1Golive = ms('golive');
  chg({ dimensionId: 'dim_om', title: 'AP, AR and GL processing move to the GBS centre', functionName: FIN, waveIds: [w1.id], process: 'Accounts payable, accounts receivable, general ledger',
    asIs: 'Transactional finance is performed by local Finance teams in each country with local practices.', toBe: 'AP, AR and GL transactions are delivered by GBS Kraków under a service catalogue with SLAs.',
    notChanging: 'Local CFO accountability for statutory reporting and financial control remains with each entity.', rationale: 'Standardise finance operations, strengthen controls, and create a scalable service platform (demo rationale).',
    effectiveDate: '2027-04-05', milestoneId: w1Golive.id, owner: 'Anna Keller', operationalImpact: 'Service levels are governed through SLAs rather than local line management.', evidence: 'Design workshop outputs, Sep 2026 (fictional).' });
  chg({ dimensionId: 'dim_om', title: 'HR operations move to the GBS centre', functionName: HR, waveIds: [w2.id], process: 'Onboarding administration, employee data management, payroll input',
    asIs: 'HR administration is handled by local HR administrators in each country.', toBe: 'HR operations are delivered by GBS Kraków through a tiered HR service model.',
    rationale: 'Consistent employee experience and HR data quality (demo rationale).', effectiveDate: '2027-07-05', milestoneId: w2Golive.id, owner: 'Mark Bennett', status: 'needs_review',
    assumptions: 'Payroll calculation remains with the existing payroll provider.' });
  chg({ dimensionId: 'dim_pr', title: 'Standardised purchase-to-pay with central invoice receipt', functionName: FIN, waveIds: [w1.id], process: 'Purchase-to-pay',
    asIs: 'Invoices are received by local AP teams by post and email with varying approval routes.', toBe: 'All supplier invoices are received centrally, matched three-way against PO and goods receipt, and routed by workflow for approval.',
    notChanging: 'Budget holders keep the same approval authority limits.', rationale: 'Reduce manual effort and late payments; strengthen control (demo rationale).', effectiveDate: '2027-04-05', owner: 'Anna Keller',
    behaviouralImpact: 'Requesters must raise purchase orders before ordering ("no PO, no pay").' });
  chg({ dimensionId: 'dim_pr', title: 'Single global employee data change process', functionName: HR, waveIds: [w2.id], process: 'Employee data management',
    asIs: 'Managers email local HR to request employee data changes.', toBe: 'Managers and employees submit data changes through HR case management with standard approval rules.', effectiveDate: '2027-07-05', owner: 'Mark Bennett' });
  chg({ dimensionId: 'dim_os', title: 'AP/AR/GL employees transfer from local Finance into the GBS organisation', functionName: FIN, waveIds: [w1.id], process: 'Finance operations',
    asIs: 'Local Finance reporting structure — employees report to country Finance Managers.', toBe: 'Central GBS reporting structure — employees report to GBS Finance Operations leads.',
    rationale: 'Single accountable service organisation (demo rationale).', peopleAffected: 46, effectiveDate: '2027-04-05', owner: 'Mark Bennett',
    operationalImpact: 'Reporting lines, people-management responsibilities, escalation routes, and role expectations change.', assumptions: 'Transfer mechanism and employment terms to be confirmed by HR and Legal per jurisdiction.' });
  chg({ dimensionId: 'dim_os', title: 'Local HR administrator roles redesigned as HR advisory roles', functionName: HR, waveIds: [w2.id], process: 'HR service delivery',
    asIs: 'Local HR administrators perform transactional HR administration.', toBe: 'Retained HR team members move into HR advisory roles focused on employee relations and manager support; transactional work moves to GBS.',
    peopleAffected: 28, effectiveDate: '2027-07-05', owner: 'Mark Bennett', status: 'needs_review' });
  chg({ dimensionId: 'dim_te', title: 'Invoice automation and AP workflow platform', functionName: FIN, waveIds: [w1.id], process: 'Accounts payable',
    asIs: 'Manual invoice keying into local ERP instances.', toBe: 'OCR invoice capture with an AP workflow platform integrated with the ERP; requesters approve invoices in the workflow tool.',
    effectiveDate: '2027-04-05', owner: 'Rahul Mehta' });
  chg({ dimensionId: 'dim_te', title: 'HR case management and employee self-service', functionName: HR, waveIds: [w2.id], process: 'HR enquiries',
    asIs: '', toBe: '', description: 'Platform selection in progress — To-Be not yet documented.', owner: 'Rahul Mehta', status: 'draft' });
  chg({ dimensionId: 'dim_im', title: 'Suppliers submit invoices and queries to a central GBS helpdesk', functionName: FIN, waveIds: [w1.id], process: 'Supplier queries',
    asIs: 'Suppliers contact local AP teams by phone and email.', toBe: 'Suppliers send invoices to a central e-invoicing mailbox and raise payment queries with the GBS supplier helpdesk.',
    effectiveDate: '2027-04-05', owner: 'Anna Keller' });
  chg({ dimensionId: 'dim_im', title: 'Tiered HR service desk for employee and manager queries', functionName: HR, waveIds: [w2.id], process: 'HR enquiries',
    asIs: 'Employees and managers contact their local HR administrator directly.', toBe: 'Employees and managers raise HR queries through the HR portal (tier 0), GBS HR service desk (tier 1), with retained HR advisory for complex cases.',
    effectiveDate: '2027-07-05', owner: 'Mark Bennett' });
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
