// ---------------------------------------------------------------------------
// Impact assessment engine — deterministic, explainable rules (Layer 1).
// Produces a recommendation for every selected stakeholder × selected dimension.
// ---------------------------------------------------------------------------
import type {
  Archetype, ChangeRecord, Directness, EngagementState, ImpactAssessment, ImpactClass, Severity, Stakeholder,
} from '../domain/types';

export interface PairResult {
  changeId: string;
  hit: 'direct' | 'indirect' | 'none' | 'unknown';
  severity: Severity | null;
  text: string;
  ruleId: string;
}

export interface ImpactRec {
  classification: ImpactClass;
  directness: Directness | null;
  severity: Severity | null;
  rationale: string[];
  changeIds: string[];
  assumptions: string[];
  gaps: string[];
  evidence: string[];
  ruleIds: string[];
  confidence: 'high' | 'medium' | 'low';
  pairs: PairResult[];
}

export interface EffectiveImpact {
  classification: ImpactClass;
  directness: Directness | null;
  severity: Severity | null;
  source: 'rule' | 'consultant';
  status: ImpactAssessment['status'];
  conflict: boolean; // consultant decision differs from the current recommendation it was based on
  changeIds: string[];
}

const IMPLICIT_FUNCTION: Partial<Record<Archetype, string>> = {
  cxo_finance: 'Finance & Accounting', cxo_hr: 'Human Resources', cxo_it: 'IT', procurement: 'Procurement',
  finance_support: 'Finance & Accounting', payroll: 'Human Resources',
};

/** Archetypes whose impact depends on belonging to the changing function. */
const FUNCTION_BOUND = new Set<Archetype>([
  'cxo_finance', 'cxo_hr', 'cxo_it', 'function_head', 'process_owner', 'transferring', 'retained_modified', 'redeployed',
  'team_lead', 'sme', 'retained_leader', 'retained_ops', 'retained_unchanged',
]);

interface Features {
  transfer: boolean; reporting: boolean; roles: boolean; system: boolean; supplier: boolean; customer: boolean;
  employeeFacing: boolean; helpdesk: boolean; approval: boolean; documented: boolean; hasSystemDetail: boolean;
}

export function changeFeatures(c: ChangeRecord): Features {
  const txt = `${c.title} ${c.description} ${c.asIs} ${c.toBe} ${c.operationalImpact} ${c.behaviouralImpact} ${c.process}`.toLowerCase();
  return {
    transfer: /transfer|move[sd]? (in)?to|relocat|migrat|centrali[sz]|consolidat/.test(txt),
    reporting: /report(s|ing)? (line|to|structure)|line manag|organi[sz]ation(al)? structure|headcount/.test(txt),
    roles: /role|responsib|job|position|redeploy|redesign/.test(txt),
    system: /system|tool|platform|portal|erp|software|automat|ocr|workflow|application|access|self-service|case management/.test(txt),
    supplier: /supplier|vendor|invoice|purchase|p2p|procure/.test(txt),
    customer: /customer|order-to-cash|receivable|billing/.test(txt),
    employeeFacing: /employee|manager|self-service|hr quer|onboard|payroll|people data/.test(txt),
    helpdesk: /helpdesk|help desk|service desk|ticket|quer(y|ies)|case|portal|mailbox|service catalogue/.test(txt),
    approval: /approv|control|policy|match|sign-off|compliance/.test(txt),
    documented: !!c.asIs.trim() && !!c.toBe.trim(),
    hasSystemDetail: !!c.toBe.trim() && /system|tool|platform|portal|erp|software|automat|ocr|workflow|application|self-service|case management/.test(`${c.toBe} ${c.title}`.toLowerCase()),
  };
}

const S = (responsibilities: number, relationships: number, tools: number, behaviours: number): Severity =>
  ({ responsibilities, relationships, tools, behaviours });

function scopeMatch(st: Stakeholder, c: ChangeRecord): { ok: boolean; why: string; assumption?: string } {
  const sFn = st.functionName || IMPLICIT_FUNCTION[st.archetype] || '';
  if (FUNCTION_BOUND.has(st.archetype) && c.functionName && sFn && sFn !== c.functionName) {
    return { ok: false, why: `${c.code} is scoped to ${c.functionName}; stakeholder sits in ${sFn}.` };
  }
  let assumption: string | undefined;
  if (FUNCTION_BOUND.has(st.archetype) && c.functionName && !sFn) {
    assumption = `No function recorded for this stakeholder — treated as within ${c.functionName} scope for ${c.code}.`;
  }
  if (st.geography && c.geography) {
    const a = st.geography.toLowerCase(), b = c.geography.toLowerCase();
    const overlap = a.split(/[,;/]/).some((x) => x.trim() && b.includes(x.trim())) || b.split(/[,;/]/).some((x) => x.trim() && a.includes(x.trim()));
    if (!overlap && !/global|all/.test(a) && !/global|all/.test(b)) {
      return { ok: false, why: `${c.code} applies to ${c.geography}; stakeholder located in ${st.geography}.` };
    }
  }
  if (st.waveIds.length && c.waveIds.length && !st.waveIds.some((w) => c.waveIds.includes(w))) {
    return { ok: false, why: `${c.code} belongs to a different transition wave than this stakeholder.` };
  }
  return { ok: true, why: '', assumption };
}

type Hit = Omit<PairResult, 'changeId'>;
const direct = (ruleId: string, sev: Severity, text: string): Hit => ({ hit: 'direct', severity: sev, text, ruleId });
const indirect = (ruleId: string, sev: Severity, text: string): Hit => ({ hit: 'indirect', severity: sev, text, ruleId });
const none = (ruleId: string, text: string): Hit => ({ hit: 'none', severity: null, text, ruleId });
const unknown = (ruleId: string, text: string): Hit => ({ hit: 'unknown', severity: null, text, ruleId });

const GOVERNANCE_ONLY = new Set<Archetype>(['board', 'ceo', 'bu_head', 'country_head', 'sponsor', 'legal_risk_leader', 'programme_lead', 'change_lead']);

/** Core rule table: one stakeholder against one change record. */
export function assessPair(st: Stakeholder, c: ChangeRecord, dimCode: string): Hit {
  const a = st.archetype;
  const ft = changeFeatures(c);
  const fnName = c.functionName || 'the in-scope function';

  if (GOVERNANCE_ONLY.has(a)) {
    return none('R-GOV-00', `${st.roleName} holds an oversight/decision role; ${c.code} does not change their own responsibilities, tools, or reporting. Communication need (governance, sponsorship) is assessed separately.`);
  }
  if (a === 'general_employee') {
    return none('R-GEN-00', `Population defined as not directly impacted; awareness needs are handled in audience planning.`);
  }

  switch (dimCode) {
    case 'OM': {
      if (a === 'transferring' || a === 'new_hire') return direct('R-OM-01', S(3, 2, 2, 3), `Work moves into the GBS delivery model under ${c.code} (${c.toBe || 'To-Be not documented'}); day-to-day service delivery and accountability change.`);
      if (a === 'retained_modified' || a === 'redeployed') return direct('R-OM-02', S(2, 2, 1, 2), `Role remains in the retained organisation but its place in the operating model changes as ${fnName} services shift to GBS.`);
      if (a === 'function_head' || a === 'process_owner' || a === 'retained_leader') return direct('R-OM-03', S(2, 2, 1, 2), `Accountability for ${fnName} delivery moves from line ownership to service governance of GBS (${c.code}).`);
      if (a === 'gbs_head' || a === 'gbs_leader') return direct('R-OM-04', S(3, 1, 1, 2), `GBS assumes delivery accountability for the scope in ${c.code}.`);
      if (a === 'cxo_finance' || a === 'cxo_hr' || a === 'cxo_it' || a === 'cxo_other') return indirect('R-OM-05', S(1, 1, 0, 1), `Functional accountability remains, but ${fnName} services are delivered through the GBS service model.`);
      if (a === 'team_lead') return direct('R-OM-06', S(2, 2, 1, 2), `Team leads in ${fnName} manage teams within a changed delivery model.`);
      if (a === 'sme') return indirect('R-OM-07', S(1, 1, 0, 1), `SMEs are expected to support knowledge transfer for ${c.code}.`);
      if (a === 'hypercare_team') return indirect('R-OM-08', S(1, 0, 1, 1), `Provides post-go-live support for services moving under ${c.code}.`);
      if (a === 'governance_team') return indirect('R-OM-09', S(1, 1, 0, 1), `Oversight shifts to governing a GBS service model.`);
      if (a === 'business_user' || a === 'service_recipient' || a === 'retained_ops') {
        return ft.helpdesk || ft.employeeFacing
          ? indirect('R-OM-10', S(1, 0, 1, 1), `Receives ${fnName} services from GBS rather than local teams.`)
          : none('R-OM-10N', `No change to how this group receives services is described in ${c.code}.`);
      }
      if (a === 'hr_support') {
        if (c.functionName === 'Human Resources') return direct('R-OM-11', S(2, 1, 1, 2), `HR operations scope moves to GBS (${c.code}).`);
        return ft.transfer ? indirect('R-OM-12', S(1, 0, 0, 1), `HR supports the movement of work and people described in ${c.code}.`) : none('R-OM-12N', `No HR role in ${c.code}.`);
      }
      if (a === 'payroll' || a === 'finance_support') return c.functionName === IMPLICIT_FUNCTION[a] ? indirect('R-OM-13', S(1, 1, 0, 1), `Adjacent team within ${fnName}; interfaces with GBS change.`) : none('R-OM-13N', `${c.code} sits outside this team's function.`);
      if (a === 'it_support') return ft.system ? indirect('R-OM-14', S(1, 0, 1, 0), `Supports systems used by the new delivery model.`) : none('R-OM-14N', `No technology component described in ${c.code}.`);
      if (a === 'supplier') return ft.supplier ? indirect('R-OM-15', S(0, 1, 0, 1), `Supplier-facing ${fnName} activity moves to GBS.`) : none('R-OM-15N', `${c.code} does not describe supplier-facing activity.`);
      if (a === 'customer') return ft.customer ? indirect('R-OM-16', S(0, 1, 0, 1), `Customer-facing activity moves to GBS.`) : none('R-OM-16N', `${c.code} does not describe customer-facing activity.`);
      if (a === 'retained_unchanged') return none('R-OM-17', `Defined as retained with no material role change.`);
      break;
    }
    case 'PR': {
      if (['transferring', 'new_hire', 'retained_modified', 'team_lead', 'process_owner', 'sme'].includes(a)) return direct('R-PR-01', S(2, 1, 2, 2), `Performs or owns process steps redesigned in ${c.code} (${c.toBe || 'To-Be not documented'}).`);
      if (a === 'function_head') return indirect('R-PR-02', S(1, 0, 1, 1), `Process outcomes in ${fnName} change; accountable for adoption.`);
      if (a === 'gbs_head' || a === 'gbs_leader') return direct('R-PR-03', S(2, 0, 1, 1), `GBS operates the redesigned process.`);
      if (a === 'retained_ops' || a === 'retained_leader') return direct('R-PR-04', S(1, 1, 1, 1), `Retained hand-offs and controls change under ${c.code}.`);
      if (a === 'business_user' || a === 'service_recipient') {
        return ft.approval || ft.helpdesk || ft.employeeFacing
          ? direct('R-PR-05', S(1, 0, 2, 1), `Requests, approvals, or submissions change under ${c.code}.`)
          : none('R-PR-05N', `${c.code} does not change steps performed by this group.`);
      }
      if (a === 'supplier') return ft.supplier ? direct('R-PR-06', S(1, 0, 2, 1), `Supplier-facing process steps (e.g. invoice submission) change under ${c.code}.`) : none('R-PR-06N', `No supplier-facing steps in ${c.code}.`);
      if (a === 'customer') return ft.customer ? direct('R-PR-07', S(1, 0, 2, 1), `Customer-facing process steps change.`) : none('R-PR-07N', `No customer-facing steps in ${c.code}.`);
      if (a === 'procurement') return ft.supplier ? direct('R-PR-08', S(1, 0, 1, 1), `Procurement policy and supplier process interfaces change.`) : none('R-PR-08N', `No procurement interface in ${c.code}.`);
      if (a === 'hr_support') return c.functionName === 'Human Resources' ? direct('R-PR-09', S(2, 0, 2, 1), `HR process steps change under ${c.code}.`) : none('R-PR-09N', `${c.code} is not an HR process.`);
      if (a === 'compliance' || a === 'legal') return ft.approval ? indirect('R-PR-10', S(0, 0, 1, 1), `Controls/approvals change; compliance oversight affected.`) : none('R-PR-10N', `No control change described.`);
      if (a === 'finance_support' || a === 'payroll') return c.functionName === IMPLICIT_FUNCTION[a] ? indirect('R-PR-11', S(1, 0, 1, 0), `Adjacent process interfaces change.`) : none('R-PR-11N', `Outside this team's function.`);
      if (a === 'hypercare_team') return indirect('R-PR-12', S(1, 0, 1, 1), `Supports adoption of the redesigned process.`);
      break;
    }
    case 'OS': {
      if (a === 'transferring') return direct('R-OS-01', ft.transfer || ft.reporting ? S(3, 3, 1, 3) : S(2, 3, 1, 2), `Reporting line moves under ${c.code} (${c.asIs || 'As-Is not documented'} → ${c.toBe || 'To-Be not documented'}); people management, escalation routes, and role expectations change.`);
      if (a === 'redeployed') return direct('R-OS-02', S(3, 3, 2, 3), `Redeployment changes role, team, and reporting line.`);
      if (a === 'retained_modified') return ft.roles ? direct('R-OS-03', S(3, 2, 1, 2), `Role content is redesigned under ${c.code}.`) : unknown('R-OS-03U', `${c.code} does not describe how retained roles change — confirm role impact.`);
      if (a === 'team_lead') return direct('R-OS-04', S(2, 3, 0, 2), `People-management responsibilities and team composition change.`);
      if (a === 'function_head') return direct('R-OS-05', S(2, 3, 0, 2), `Loses or reshapes direct line management of teams affected by ${c.code}.`);
      if (a === 'gbs_head' || a === 'gbs_leader') return direct('R-OS-06', S(2, 3, 0, 1), `Receives teams and line-management accountability under ${c.code}.`);
      if (a === 'cxo_finance' || a === 'cxo_hr' || a === 'cxo_it' || a === 'cxo_other') return indirect('R-OS-07', S(1, 2, 0, 1), `Functional organisation changes shape under ${c.code}.`);
      if (a === 'hr_support') return ft.transfer || ft.roles ? direct('R-OS-08', S(2, 1, 1, 1), `HR executes the people changes in ${c.code} (transfers, role changes, records).`) : indirect('R-OS-08I', S(1, 0, 0, 1), `HR maintains organisation records for ${c.code}.`);
      if (a === 'payroll') return ft.transfer ? indirect('R-OS-09', S(1, 0, 1, 0), `Payroll records change for transferring employees.`) : none('R-OS-09N', `No payroll change described.`);
      if (a === 'legal') return ft.transfer ? indirect('R-OS-10', S(1, 0, 0, 0), `Employment transfer may carry legal review requirements depending on jurisdiction.`) : none('R-OS-10N', `No employment change described.`);
      if (a === 'facilities') return /relocat|site|office|seat/.test(`${c.toBe} ${c.description}`.toLowerCase()) ? indirect('R-OS-11', S(1, 0, 0, 0), `Workplace arrangements change.`) : none('R-OS-11N', `No workplace change described.`);
      if (a === 'process_owner' || a === 'retained_leader') return indirect('R-OS-12', S(1, 2, 0, 1), `Counterparts and escalation routes change as teams move.`);
      if (a === 'retained_unchanged') return none('R-OS-13', `Defined as retained with no material role change.`);
      if (a === 'sme') return indirect('R-OS-14', S(1, 1, 0, 1), `Team composition around SMEs changes.`);
      break;
    }
    case 'TE': {
      if (!ft.hasSystemDetail) return unknown('R-TE-00', `${c.code} does not identify the system or tool in its To-Be state — technology impact cannot be determined.`);
      if (['transferring', 'new_hire', 'retained_modified', 'team_lead', 'sme', 'process_owner'].includes(a)) return direct('R-TE-01', S(1, 0, 3, 2), `Uses the new or changed technology described in ${c.code}.`);
      if (a === 'business_user' || a === 'service_recipient') return ft.employeeFacing || ft.helpdesk ? direct('R-TE-02', S(1, 0, 2, 1), `Interacts with the new user-facing technology (${c.code}).`) : none('R-TE-02N', `${c.code} technology is back-office only.`);
      if (a === 'it_support') return direct('R-TE-03', S(2, 0, 2, 1), `Deploys, supports, and provisions access for the technology in ${c.code}.`);
      if (a === 'infosec') return indirect('R-TE-04', S(1, 0, 1, 0), `Access and security controls apply to the new technology.`);
      if (a === 'lnd') return indirect('R-TE-05', S(1, 0, 0, 1), `Training content required for the new technology.`);
      if (a === 'supplier') return ft.supplier && /portal|e-?invoic|mailbox|ocr/.test(`${c.toBe}`.toLowerCase()) ? direct('R-TE-06', S(1, 0, 2, 1), `Suppliers use a new submission channel/technology.`) : none('R-TE-06N', `No supplier-facing technology in ${c.code}.`);
      if (a === 'gbs_head' || a === 'gbs_leader') return indirect('R-TE-07', S(1, 0, 1, 1), `GBS operations depend on the new technology.`);
      if (a === 'function_head' || a === 'retained_leader') return indirect('R-TE-08', S(1, 0, 1, 1), `Team tools and reporting change.`);
      if (a === 'retained_ops') return indirect('R-TE-09', S(0, 0, 1, 1), `Interfaces with the new technology.`);
      if (a === 'hr_support') return c.functionName === 'Human Resources' ? direct('R-TE-10', S(1, 0, 3, 2), `HR uses the new HR technology.`) : none('R-TE-10N', `Not an HR system.`);
      if (a === 'hypercare_team') return direct('R-TE-11', S(2, 0, 2, 1), `Supports users of the new technology after go-live.`);
      if (a === 'cxo_it') return indirect('R-TE-12', S(1, 0, 1, 0), `Technology estate accountability extends to ${c.code}.`);
      break;
    }
    case 'IM': {
      if (a === 'business_user' || a === 'service_recipient' || a === 'retained_ops' || a === 'retained_leader') {
        return ft.helpdesk || ft.employeeFacing ? direct('R-IM-01', S(1, 1, 1, 2), `How this group requests and escalates services changes (${c.toBe || 'To-Be not documented'}).`) : none('R-IM-01N', `${c.code} does not change how this group interacts with the service.`);
      }
      if (a === 'supplier') return ft.supplier ? direct('R-IM-02', S(1, 2, 1, 2), `Supplier contact points and query routes change.`) : none('R-IM-02N', `No supplier interaction change in ${c.code}.`);
      if (a === 'customer') return ft.customer ? direct('R-IM-03', S(1, 2, 1, 2), `Customer contact points change.`) : none('R-IM-03N', `No customer interaction change in ${c.code}.`);
      if (a === 'procurement') return ft.supplier ? indirect('R-IM-04', S(1, 1, 0, 1), `Supplier relationships are managed through new contact routes.`) : none('R-IM-04N', `No supplier interaction change.`);
      if (a === 'transferring' || a === 'new_hire') return direct('R-IM-05', S(2, 2, 1, 2), `Becomes a service provider to former colleagues through the new interaction model.`);
      if (a === 'gbs_head' || a === 'gbs_leader') return direct('R-IM-06', S(2, 2, 0, 1), `Owns the new service interaction and escalation model.`);
      if (a === 'team_lead') return indirect('R-IM-07', S(1, 1, 0, 1), `Escalation routes for the team change.`);
      if (a === 'function_head' || a === 'process_owner') return indirect('R-IM-08', S(1, 2, 0, 1), `Engages GBS through service governance rather than direct line management.`);
      if (a === 'retained_unchanged') return ft.helpdesk ? indirect('R-IM-09', S(0, 1, 1, 1), `Uses new request routes even though role is unchanged.`) : none('R-IM-09N', `No interaction change described.`);
      if (a === 'hr_support') return c.functionName === 'Human Resources' ? direct('R-IM-10', S(1, 2, 1, 1), `HR query routing changes (${c.code}).`) : none('R-IM-10N', `Not an HR interaction change.`);
      if (a === 'hypercare_team') return indirect('R-IM-11', S(1, 1, 0, 0), `Handles escalations via the new model.`);
      break;
    }
  }
  return none('R-DEF-00', `No rule links a ${st.roleName} to the type of change described in ${c.code}.`);
}

const sevMax = (a: Severity | null, b: Severity | null): Severity | null => {
  if (!a) return b; if (!b) return a;
  return S(Math.max(a.responsibilities, b.responsibilities), Math.max(a.relationships, b.relationships), Math.max(a.tools, b.tools), Math.max(a.behaviours, b.behaviours));
};

export function recommendImpact(s: EngagementState, st: Stakeholder, dimensionId: string): ImpactRec {
  const dim = s.dimensions.find((d) => d.id === dimensionId)!;
  const changes = s.changes.filter((c) => c.dimensionId === dimensionId);
  const rec: ImpactRec = {
    classification: 'not_impacted', directness: null, severity: null, rationale: [], changeIds: [], assumptions: [],
    gaps: [], evidence: [], ruleIds: [], confidence: 'medium', pairs: [],
  };
  if (!changes.length) {
    rec.classification = 'review';
    rec.confidence = 'low';
    rec.gaps.push(`No change records captured under "${dim.short}" — add change records before this cell can be assessed.`);
    rec.rationale.push('Dimension is selected but has no specific change records.');
    return rec;
  }
  const dimCode = dim.isDefault ? dim.code : 'CUSTOM';
  let anyDirect = false, anyIndirect = false, anyUnknown = false, undocumented = false;
  for (const c of changes) {
    const scope = scopeMatch(st, c);
    let r: Hit;
    if (!scope.ok) r = none('R-SCOPE', scope.why);
    else if (dimCode === 'CUSTOM') r = unknown('R-CUSTOM', `Custom dimension "${dim.label}" has no default rules — consultant assessment required for ${c.code}.`);
    else r = assessPair(st, c, dimCode);
    if (scope.assumption && r.hit !== 'none') rec.assumptions.push(scope.assumption);
    rec.pairs.push({ ...r, changeId: c.id });
    if (r.hit === 'direct' || r.hit === 'indirect') {
      if (r.hit === 'direct') anyDirect = true; else anyIndirect = true;
      rec.changeIds.push(c.id);
      rec.rationale.push(`${c.code}: ${r.text}`);
      rec.ruleIds.push(r.ruleId);
      rec.severity = sevMax(rec.severity, r.severity);
      if (!c.asIs.trim() || !c.toBe.trim()) { undocumented = true; rec.gaps.push(`${c.code} lacks a documented As-Is/To-Be — severity not scored.`); }
      if (c.evidence.trim()) rec.evidence.push(`${c.code}: ${c.evidence}`);
      if (c.assumptions.trim()) rec.assumptions.push(`${c.code}: ${c.assumptions}`);
      if (c.status !== 'confirmed') rec.gaps.push(`${c.code} is not yet confirmed (status: ${c.status.replace('_', ' ')}).`);
    } else if (r.hit === 'unknown') {
      anyUnknown = true;
      rec.changeIds.push(c.id);
      rec.ruleIds.push(r.ruleId);
      rec.gaps.push(r.text);
    }
  }
  if (anyDirect || anyIndirect) {
    rec.classification = 'impacted';
    rec.directness = anyDirect ? 'direct' : 'indirect';
    if (undocumented) rec.severity = null;
    const allConfirmed = rec.changeIds.every((id) => s.changes.find((c) => c.id === id)?.status === 'confirmed');
    rec.confidence = undocumented || anyUnknown ? 'low' : allConfirmed ? 'high' : 'medium';
  } else if (anyUnknown) {
    rec.classification = 'review';
    rec.confidence = 'low';
    rec.rationale.push('Insufficient information to determine impact for at least one change record.');
  } else {
    rec.classification = 'not_impacted';
    const scoped = rec.pairs.filter((p) => p.ruleId === 'R-SCOPE');
    rec.rationale.push(scoped.length === rec.pairs.length
      ? 'All change records in this dimension are outside this stakeholder\'s function, geography, or wave.'
      : `No rule links this stakeholder to the ${changes.length} change record(s) in this dimension.`);
    rec.pairs.slice(0, 3).forEach((p) => rec.rationale.push(`${s.changes.find((c) => c.id === p.changeId)?.code}: ${p.text}`));
    rec.ruleIds = Array.from(new Set(rec.pairs.map((p) => p.ruleId)));
    const allConfirmed = changes.every((c) => c.status === 'confirmed');
    rec.confidence = allConfirmed ? 'high' : 'medium';
  }
  rec.assumptions = Array.from(new Set(rec.assumptions));
  rec.gaps = Array.from(new Set(rec.gaps));
  return rec;
}

export function effectiveImpact(rec: ImpactRec, a: ImpactAssessment | undefined): EffectiveImpact {
  if (a?.decision) {
    return {
      classification: a.decision.classification,
      directness: a.decision.directness,
      severity: a.decision.severity,
      source: 'consultant',
      status: a.status,
      conflict: a.decision.basedOnRec !== null && a.decision.basedOnRec !== rec.classification,
      changeIds: rec.changeIds,
    };
  }
  return {
    classification: rec.classification, directness: rec.directness, severity: rec.severity, source: 'rule',
    status: a?.status ?? (rec.classification === 'review' ? 'needs_review' : 'proposed'), conflict: false, changeIds: rec.changeIds,
  };
}

export function severityScore(sev: Severity | null, w: EngagementState['engagement']['settings']['weights']): number | null {
  if (!sev) return null;
  const tot = w.responsibilities + w.relationships + w.tools + w.behaviours;
  if (!tot) return null;
  return (sev.responsibilities * w.responsibilities + sev.relationships * w.relationships + sev.tools * w.tools + sev.behaviours * w.behaviours) / tot;
}

export function severityBand(score: number | null, th: { medium: number; high: number }): 'Low' | 'Medium' | 'High' | null {
  if (score === null) return null;
  if (score >= th.high) return 'High';
  if (score >= th.medium) return 'Medium';
  return 'Low';
}
