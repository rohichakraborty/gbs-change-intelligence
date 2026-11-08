// ---------------------------------------------------------------------------
// Communicator assignment engine — conditional responsibility rules.
// Returns "requires review" instead of guessing when accountability is unclear.
// ---------------------------------------------------------------------------
import type { Archetype, CommunicationRecord, EngagementState, Milestone, RoleAssignment, Stakeholder } from '../domain/types';
import { A, CT } from '../domain/library';

export interface RoleRec {
  assignment: RoleAssignment;
  ruleId: string;
  rationale: string[];
  authority: string;
  relationship: string;
  alternatives: string[];
  approvalNotes: string;
  needsReview: boolean;
  gaps: string[];
}

const SELF_ROLE: Partial<Record<Archetype, string>> = {
  ceo: 'cr_ceo', sponsor: 'cr_ceo', cxo_finance: 'cr_cfo', cxo_hr: 'cr_chro', gbs_head: 'cr_gbs_head', programme_lead: 'cr_programme_head',
  change_lead: 'cr_change_lead', function_head: 'cr_function_head', it_support: 'cr_it_lead', procurement: 'cr_procurement',
};

export function functionalCxo(fn: string): string {
  if (fn === 'Finance & Accounting') return 'cr_cfo';
  if (fn === 'Human Resources') return 'cr_chro';
  return 'cr_cxo';
}

export function roleName(s: EngagementState, id: string | null): string {
  if (!id) return '';
  return s.communicatorRoles.find((r) => r.id === id)?.name ?? 'Unknown role';
}

export function roleShort(s: EngagementState, id: string | null): string {
  if (!id) return '';
  return s.communicatorRoles.find((r) => r.id === id)?.short ?? 'Unknown';
}

/** The named person for a communicator role, from governance configuration. */
export function rolePerson(s: EngagementState, id: string | null): string | null {
  if (!id) return null;
  const g = s.engagement.governance.find((x) => x.communicatorRoleId === id && x.personName.trim());
  return g ? g.personName.trim() : null;
}

export function recommendCommunicator(s: EngagementState, c: CommunicationRecord, st: Stakeholder, m: Milestone, changeIds: string[]): RoleRec {
  const a = st.archetype;
  const fnFromChanges = s.changes.filter((x) => changeIds.includes(x.id)).map((x) => x.functionName).find(Boolean) || st.functionName;
  const cxo = functionalCxo(fnFromChanges);
  const r: RoleRec = {
    assignment: { owner: null, primary: null, supporting: [], creator: 'cr_change_lead', approvers: [] },
    ruleId: '', rationale: [], authority: '', relationship: '', alternatives: [], approvalNotes: '', needsReview: false, gaps: [],
  };
  const set = (primary: string | null, owner: string | null, supporting: string[], approvers: string[], creator: string | null = 'cr_change_lead') => {
    r.assignment = { primary, owner, supporting: supporting.filter((x) => x !== primary), creator, approvers };
  };
  const ct = c.commTypeId;

  if (ct === CT.crisis) {
    r.ruleId = 'C-CRISIS';
    set('cr_corp_comms', 'cr_gbs_head', ['cr_gbs_head'], ['cr_ceo', 'cr_legal'], 'cr_corp_comms');
    r.rationale.push('Crisis/incident communications must go through the approved crisis protocol and designated spokespersons.');
    r.authority = 'Designated crisis spokesperson; executive and legal approval.';
    r.alternatives = ['CEO / Executive Sponsor (material incidents)', 'GBS Head (service incidents)'];
    r.approvalNotes = 'Approved crisis protocol; Legal review of any external statement.';
    r.needsReview = true;
  } else if (ct === CT.sensitive) {
    r.ruleId = 'C-SENS';
    set('cr_chro', 'cr_hr_lead', ['cr_hrbp', 'cr_function_head'], ['cr_chro', 'cr_legal']);
    r.rationale.push('Employment-related communication must be led by authorised HR leadership, with individual conversations handled by HR Business Partners or line managers.');
    r.rationale.push('Content requires HR and Legal approval; jurisdiction-specific consultation requirements are not assumed by the engine.');
    r.authority = 'Authorised HR leadership (CHRO or delegate).';
    r.relationship = 'HR holds the employment relationship; line managers hold the day-to-day relationship.';
    r.alternatives = ['Authorised HR representative', 'Functional CXO jointly with HR'];
    r.approvalNotes = 'HR and Legal/Compliance approval required before release. HR review must be recorded.';
    r.needsReview = true;
  } else if (ct === CT.strategic) {
    r.ruleId = 'C-STRAT';
    if (a === 'board') {
      set('cr_ceo', 'cr_programme_head', ['cr_gbs_head'], ['cr_ceo']);
      r.rationale.push('Board-level matters are presented by the CEO / Executive Sponsor.');
      r.authority = 'Executive authority to present to the Board.';
      r.alternatives = ['CFO (business case matters)'];
      r.approvalNotes = 'Board paper approval per company secretariat process [CONFIRM GOVERNANCE PROCESS].';
    } else if (a === 'ceo' || a === 'sponsor') {
      set('cr_gbs_head', 'cr_programme_head', ['cr_programme_head'], ['cr_gbs_head']);
      r.rationale.push('The executive sponsor is briefed by the GBS Head as accountable programme leader.');
      r.authority = 'Programme leadership accountability.';
      r.alternatives = ['Programme Head'];
    } else if (A.executive.includes(a)) {
      set('cr_ceo', 'cr_programme_head', ['cr_gbs_head'], ['cr_ceo']);
      r.rationale.push('Executive peers are aligned by the CEO / Executive Sponsor for visible sponsorship.');
      r.authority = 'Executive sponsorship.';
      r.alternatives = ['GBS Head', cxo === 'cr_cxo' ? 'Functional CXO' : 'Accountable functional CXO'];
    } else if (A.gbsLeaders.includes(a)) {
      set('cr_gbs_head', 'cr_programme_head', [], ['cr_gbs_head']);
      if (a === 'gbs_head') set('cr_ceo', 'cr_programme_head', [], ['cr_ceo']);
      r.rationale.push('GBS leadership alignment is led by the GBS Head (or the executive sponsor for the GBS Head).');
      r.authority = 'Line authority over GBS leadership.';
      r.alternatives = ['CEO / Executive Sponsor'];
    } else {
      set(cxo, 'cr_programme_head', ['cr_gbs_head'], [cxo]);
      r.rationale.push('Function leaders are aligned by their accountable functional executive.');
      r.authority = 'Functional accountability.';
      r.alternatives = ['GBS Head'];
    }
  } else if (ct === CT.training) {
    r.ruleId = 'C-TRAIN';
    const tech = s.changes.some((x) => changeIds.includes(x.id) && x.dimensionId === 'dim_te');
    set('cr_training', 'cr_training', [tech ? 'cr_it_lead' : 'cr_function_head'], ['cr_programme_head'], 'cr_training');
    r.rationale.push('Training is delivered by the training team; the functional leader sponsors attendance.');
    if (tech) r.rationale.push('Technology change involved — IT Lead supports system training.');
    r.authority = 'Learning delivery accountability.';
    r.alternatives = ['Process SMEs', 'Function Head / Process Owner'];
  } else if (ct === CT.programme) {
    if (m.kind === 'recurring') {
      r.ruleId = 'C-PROG-CAD';
      if (st.roles.decisionMaker || st.roles.sponsor) {
        set('cr_programme_head', 'cr_pmo', ['cr_pmo'], ['cr_gbs_head'], 'cr_pmo');
        r.rationale.push('Steering-level status is presented by the Programme Head, prepared by the PMO.');
      } else {
        set('cr_pmo', 'cr_pmo', [], ['cr_programme_head'], 'cr_pmo');
        r.rationale.push('Routine status updates are owned and issued by the PMO Lead.');
      }
    } else {
      r.ruleId = 'C-PROG';
      set('cr_programme_head', 'cr_programme_head', ['cr_change_lead'], ['cr_programme_head']);
      r.rationale.push('Programme orchestration communications are owned by the Programme Head.');
    }
    r.authority = 'Programme delivery accountability.';
    r.alternatives = ['GBS Head', 'PMO Lead'];
  } else if (A.external.includes(a)) {
    if (a === 'supplier') {
      r.ruleId = 'C-EXT-SUP';
      set('cr_procurement', 'cr_procurement', [cxo], ['cr_procurement', 'cr_legal']);
      r.rationale.push('Supplier notifications are issued by the Procurement Lead / supplier relationship owner, supported by the accountable functional CXO.');
      r.approvalNotes = 'Commercial and contractual implications must be confirmed with Procurement and Legal. No contractual change is assumed.';
      r.alternatives = [cxo === 'cr_cfo' ? 'CFO' : 'Functional CXO'];
      r.needsReview = true;
    } else if (a === 'customer') {
      r.ruleId = 'C-EXT-CUS';
      set(cxo, cxo, ['cr_corp_comms'], ['cr_legal', 'cr_corp_comms'], 'cr_corp_comms');
      r.rationale.push('Customer communications are issued by the accountable functional executive with Corporate Communications.');
      r.approvalNotes = 'Customer-facing content approved by Corporate Communications and Legal.';
      r.alternatives = ['Business Relationship Managers'];
      r.needsReview = true;
    } else {
      r.ruleId = 'C-EXT-OTH';
      set(null, a === 'regulator' ? 'cr_legal' : 'cr_procurement', [], ['cr_legal']);
      r.rationale.push(a === 'regulator'
        ? 'Regulatory communications require a designated authority — the engine does not assign a spokesperson.'
        : 'Partner communications depend on the contracting relationship — confirm the relationship owner.');
      r.needsReview = true;
    }
    r.authority = 'Relationship ownership.';
  } else if (ct === CT.awareness) {
    const enterprise = A.mass.includes(a) || m.trigger.focus.includes('awareness');
    if (enterprise) {
      r.ruleId = 'C-AWARE-ENT';
      const golive = m.trigger.focus.includes('golive') || c.objective === 'announce';
      set('cr_gbs_head', 'cr_programme_head', golive ? ['cr_ceo'] : [], ['cr_corp_comms'], 'cr_corp_comms');
      r.rationale.push('Broad awareness communications are fronted by the GBS Head, with content prepared and approved through Corporate/Internal Communications.');
      if (golive) r.rationale.push('Go-live announcements carry executive sponsorship where appropriate.');
      r.alternatives = ['CEO / Executive Sponsor (enterprise milestones)'];
    } else {
      r.ruleId = 'C-AWARE-FN';
      set('cr_function_head', 'cr_function_head', ['cr_gbs_head'], ['cr_programme_head']);
      r.rationale.push('Function-specific impacts are best explained by the Function Head / Process Owner, supported by GBS.');
      r.alternatives = ['GBS Head', 'Team Leads (cascade)'];
    }
    r.authority = 'Accountability for the affected service or function.';
  } else if (ct === CT.operational) {
    r.ruleId = 'C-OPS';
    if (A.it.includes(a)) set('cr_it_lead', 'cr_it_lead', [], ['cr_programme_head']);
    else if (A.hr.includes(a)) set('cr_hr_lead', 'cr_hr_lead', [], ['cr_programme_head']);
    else if (a === 'procurement') set('cr_procurement', 'cr_programme_head', [], ['cr_programme_head']);
    else if (A.supportFns.includes(a)) set('cr_programme_head', 'cr_programme_head', [], ['cr_programme_head']);
    else if (A.gbsLeaders.includes(a) || a === 'hypercare_team') set('cr_gbs_head', 'cr_gbs_head', ['cr_programme_head'], ['cr_gbs_head']);
    else if (A.retained.includes(a) || a === 'function_head' || a === 'process_owner') set('cr_function_head', 'cr_function_head', ['cr_gbs_head'], ['cr_programme_head']);
    else if (A.employees.includes(a)) {
      const tech = s.changes.some((x) => changeIds.includes(x.id) && x.dimensionId === 'dim_te');
      set(tech ? 'cr_it_lead' : 'cr_gbs_head', 'cr_gbs_head', ['cr_function_head'], ['cr_programme_head']);
    } else set(null, 'cr_programme_head', [], ['cr_programme_head']);
    r.rationale.push('Operational updates are issued by the role accountable for the affected service, system, or process.');
    r.authority = 'Operational accountability.';
    r.alternatives = ['Programme Head'];
  }

  // Avoid assigning the audience as its own communicator.
  const self = SELF_ROLE[a];
  if (self && r.assignment.primary === self) {
    const alt = self === 'cr_gbs_head' ? 'cr_ceo' : self === 'cr_programme_head' ? 'cr_gbs_head' : 'cr_programme_head';
    r.rationale.push(`Audience holds the ${roleName(s, self)} role, so the primary communicator is set to ${roleName(s, alt)}.`);
    r.assignment.primary = alt;
    r.assignment.supporting = r.assignment.supporting.filter((x) => x !== alt);
  }

  if (!r.ruleId || !r.assignment.primary) {
    r.needsReview = true;
    r.gaps.push('Communicator assignment requires review — no responsibility rule identifies an accountable communicator.');
    if (!r.ruleId) r.ruleId = 'C-NONE';
  }
  for (const [label, id] of [['Primary communicator', r.assignment.primary], ['Owner', r.assignment.owner]] as const) {
    if (id && !rolePerson(s, id)) r.gaps.push(`${label} role "${roleName(s, id)}" has no named person in governance configuration.`);
  }
  for (const id of r.assignment.approvers) {
    if (!rolePerson(s, id)) r.gaps.push(`Approver role "${roleName(s, id)}" has no named person in governance configuration.`);
  }
  if (r.gaps.some((g) => g.startsWith('Primary') || g.startsWith('Approver'))) r.needsReview = true;
  return r;
}
