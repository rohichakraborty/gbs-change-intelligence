// ---------------------------------------------------------------------------
// Audience recommendation engine. Communication relevance is NOT the same as
// impact: decision authority, sponsorship, execution, dependency, awareness,
// external relationship, and readiness are evaluated separately.
// ---------------------------------------------------------------------------
import type {
  AudienceReason, EngagementState, Focus, Level3, Milestone, Objective, ReasonKind, Stakeholder,
} from '../domain/types';
import { A, CT, DIM } from '../domain/library';
import type { EffectiveImpact } from './impact';

export interface AudienceRec {
  milestoneId: string;
  stakeholderId: string;
  reasons: AudienceReason[];
  objective: Objective;
  commTypeId: string;
  priority: Level3;
  changeIds: string[];
  intendedOutcome: string;
  fingerprint: string;
}

interface Candidate { kind: ReasonKind; text: string; focus: Focus; objective: Objective; commTypeId: string; weight: number }

const REASON_WEIGHT: Record<ReasonKind, number> = {
  decision: 100, external: 85, readiness: 75, direct_impact: 70, sponsorship: 65, execution: 55, dependency: 45, indirect_impact: 35, awareness: 10,
};

export interface StakeholderImpactSummary {
  dims: { dimensionId: string; directness: 'direct' | 'indirect' | null; changeIds: string[] }[];
  direct: boolean;
  any: boolean;
  changeIds: string[];
}

export function impactSummaryFor(
  s: EngagementState, st: Stakeholder, impacts: Map<string, EffectiveImpact>, waveId: string | null,
): StakeholderImpactSummary {
  const dims: StakeholderImpactSummary['dims'] = [];
  for (const dimId of s.engagement.selectedDimensionIds) {
    const e = impacts.get(`${st.id}|${dimId}`);
    if (!e || e.classification !== 'impacted') continue;
    let changeIds = e.changeIds;
    if (waveId && changeIds.length) {
      changeIds = changeIds.filter((id) => {
        const c = s.changes.find((x) => x.id === id);
        return c && (!c.waveIds.length || c.waveIds.includes(waveId));
      });
      if (!changeIds.length && e.source === 'rule') continue; // impact belongs to another wave
    }
    dims.push({ dimensionId: dimId, directness: e.directness, changeIds });
  }
  const changeIds = Array.from(new Set(dims.flatMap((d) => d.changeIds)));
  return { dims, direct: dims.some((d) => d.directness === 'direct'), any: dims.length > 0, changeIds };
}

const OUTCOME: Record<Objective, string> = {
  inform: 'Audience understands what is changing, when, and what it means for them.',
  align: 'Leaders are aligned and able to sponsor the change consistently.',
  seek_approval: 'Decision is formally recorded by the authorised body.',
  prepare: 'Audience is ready to perform their role in the milestone.',
  engage: 'Audience actively contributes input and ownership.',
  train: 'Audience can perform new processes and use new tools.',
  reassure: 'Concerns are addressed and support routes are known.',
  request_action: 'Required actions are completed by the stated deadline.',
  escalate: 'Issue is escalated to the accountable owners with a clear response.',
  confirm_readiness: 'Readiness is confirmed against gating criteria.',
  announce: 'Audience knows the change is live and how to get support.',
  reinforce: 'New ways of working are adopted and sustained.',
  collect_feedback: 'Feedback is captured to inform stabilisation actions.',
};

export function recommendAudience(
  s: EngagementState, m: Milestone, st: Stakeholder, impacts: Map<string, EffectiveImpact>,
): AudienceRec | null {
  if (!m.trigger.required || !m.trigger.focus.length) return null;
  if (m.waveId && st.waveIds.length && !st.waveIds.includes(m.waveId)) return null;
  const a = st.archetype;
  const imp = impactSummaryFor(s, st, impacts, m.waveId);
  const has = (dim: string) => imp.dims.some((d) => d.dimensionId === dim);
  const impactKind: ReasonKind = imp.direct ? 'direct_impact' : 'indirect_impact';
  const impactText = () => {
    const dims = imp.dims.map((d) => s.dimensions.find((x) => x.id === d.dimensionId)?.short).filter(Boolean);
    return `${imp.direct ? 'Directly' : 'Indirectly'} impacted (${dims.join(', ')}) per the impact assessment.`;
  };
  const cands: Candidate[] = [];
  const add = (kind: ReasonKind, text: string, focus: Focus, objective: Objective, commTypeId: string) =>
    cands.push({ kind, text, focus, objective, commTypeId, weight: REASON_WEIGHT[kind] });

  const isExec = A.executive.includes(a);
  const isEmployee = A.employees.includes(a);

  for (const focus of m.trigger.focus) {
    switch (focus) {
      case 'governance':
        if (st.roles.decisionMaker || st.roles.approver) add('decision', `Holds decision/approval authority required at "${m.name}".`, focus, 'seek_approval', CT.strategic);
        else if (st.roles.sponsor) add('sponsorship', `Sponsors the programme; must endorse the "${m.name}" outcome.`, focus, 'align', CT.strategic);
        break;
      case 'leadership':
        if ((isExec && a !== 'board') || A.gbsLeaders.includes(a)) {
          const lo: Objective = m.trigger.focus.includes('golive') ? 'announce' : 'align';
          if (st.roles.sponsor) add('sponsorship', 'Programme sponsor — needs to visibly lead and align on this milestone.', focus, lo, CT.strategic);
          else if (imp.any) add(impactKind, `${impactText()} Leadership alignment needed.`, focus, lo, CT.strategic);
          else if (a !== 'legal_risk_leader') add('awareness', 'Senior leader who needs strategic awareness even without a direct change to their own role.', focus, lo, CT.strategic);
        } else if ((a === 'function_head' || a === 'retained_leader') && imp.any) {
          add(impactKind, `${impactText()} Function leadership alignment needed.`, focus, 'align', CT.strategic);
        }
        break;
      case 'programme':
        if (st.roles.executionOwner || A.programme.includes(a)) add('execution', `Has execution responsibility for "${m.name}".`, focus, 'prepare', CT.programme);
        break;
      case 'impacted':
        if (imp.any && (isEmployee || a === 'function_head' || a === 'process_owner' || a === 'retained_leader') && a !== 'general_employee') {
          add(impactKind, impactText(), focus, 'inform', CT.awareness);
        }
        break;
      case 'sensitive_people':
        if (A.sensitive.includes(a) && imp.direct) add('direct_impact', `${impactText()} Employment-related implications require HR-led handling.`, focus, 'inform', CT.sensitive);
        break;
      case 'managers':
        if (['team_lead', 'function_head', 'process_owner', 'retained_leader'].includes(a) && (imp.any || st.roles.communicator)) {
          add('execution', 'Line leaders must be prepared to cascade messages and handle team questions.', focus, 'prepare', CT.programme);
        }
        break;
      case 'hr':
        if (A.hr.includes(a)) add('dependency', `HR enables "${m.name}" (people processes, records, employee support).`, focus, 'prepare', CT.operational);
        break;
      case 'it':
        if (A.it.includes(a)) add('dependency', `IT enables "${m.name}" (systems, access, support).`, focus, 'prepare', CT.operational);
        break;
      case 'procurement':
        if (a === 'procurement') add('dependency', 'Procurement owns supplier relationships affected by the change.', focus, 'prepare', CT.operational);
        break;
      case 'external':
        if (A.external.includes(a) && imp.any) {
          add('external', `External relationship affected: ${impactText()}`, focus, has(DIM.PR) || has(DIM.TE) || has(DIM.IM) ? 'request_action' : 'inform', CT.awareness);
        }
        break;
      case 'training':
        if ((has(DIM.PR) || has(DIM.TE)) && (isEmployee || A.hr.includes(a) || a === 'it_support') && a !== 'general_employee') {
          add('readiness', `Needs training: impacted in ${[has(DIM.PR) ? 'Process' : '', has(DIM.TE) ? 'Technology' : ''].filter(Boolean).join(' and ')}.`, focus, 'train', CT.training);
        }
        break;
      case 'awareness':
        if (a === 'general_employee' || a === 'retained_unchanged') add('awareness', 'Needs general awareness of the transformation even though not directly impacted.', focus, 'inform', CT.awareness);
        else if (isEmployee && !imp.any) add('awareness', 'In-scope employee population with no assessed impact — awareness communication only.', focus, 'inform', CT.awareness);
        break;
      case 'retained':
        if ((A.retained.includes(a) || a === 'process_owner' || a === 'function_head') && imp.any) add(impactKind, `${impactText()} Retained interfaces and hand-offs change.`, focus, 'prepare', CT.operational);
        break;
      case 'support':
        if (A.supportFns.includes(a) && !A.hr.includes(a) && !A.it.includes(a)) add('dependency', `Support function enabling "${m.name}".`, focus, 'prepare', CT.operational);
        break;
      case 'hypercare':
        if (imp.any && isEmployee && a !== 'hypercare_team') add('readiness', `${impactText()} Needs to know how to get support during hypercare.`, focus, 'reinforce', CT.operational);
        if (a === 'hypercare_team' || a === 'it_support') add('execution', 'Provides hypercare support.', focus, 'prepare', CT.operational);
        if (A.gbsLeaders.includes(a)) add('execution', 'Accountable for service stabilisation.', focus, 'confirm_readiness', CT.operational);
        break;
      case 'status':
        if ((st.roles.decisionMaker || st.roles.sponsor) && (isExec || A.gbsLeaders.includes(a)) && a !== 'board') add('decision', 'Steering/sponsor role requiring regular status, risks, and decisions.', focus, 'inform', CT.programme);
        else if (A.programme.includes(a) || (A.gbsLeaders.includes(a) && st.roles.executionOwner)) add('execution', 'Programme leadership requiring regular status.', focus, 'inform', CT.programme);
        break;
      case 'golive':
        if (imp.any && (isEmployee || A.retained.includes(a))) add(impactKind, `${impactText()} Must know what changes at go-live and how to get support.`, focus, 'announce', CT.awareness);
        if (A.gbsLeaders.includes(a)) add('execution', 'Accountable for go-live delivery.', focus, 'confirm_readiness', CT.operational);
        break;
      case 'feedback':
        if (imp.any && isEmployee) add('readiness', 'Impacted population whose feedback informs stabilisation.', focus, 'collect_feedback', CT.awareness);
        break;
      case 'crisis':
        if (A.gbsLeaders.includes(a)) add('execution', 'Accountable for incident response.', focus, 'escalate', CT.crisis);
        else if (isExec && (st.roles.sponsor || st.roles.decisionMaker) && a !== 'board') add('decision', 'Must be informed of material service incidents.', focus, 'escalate', CT.crisis);
        else if (imp.direct && (a === 'business_user' || a === 'service_recipient')) add('direct_impact', 'Service users affected by incidents.', focus, 'inform', CT.crisis);
        break;
    }
  }
  if (!cands.length) return null;
  // Deduplicate reasons by kind (keep strongest text); primary objective from strongest reason.
  cands.sort((x, y) => y.weight - x.weight);
  const seen = new Set<ReasonKind>();
  const reasons: AudienceReason[] = [];
  for (const c of cands) if (!seen.has(c.kind)) { seen.add(c.kind); reasons.push({ kind: c.kind, text: c.text, focus: c.focus }); }
  const top = cands[0];
  // A sensitive classification always wins over generic awareness for the same audience.
  const sensitive = cands.find((c) => c.commTypeId === CT.sensitive);
  const primary = sensitive ?? top;
  const priority: Level3 = primary.commTypeId === CT.sensitive || primary.kind === 'decision' || primary.kind === 'external' ? 'high'
    : primary.weight >= 55 ? 'medium' : 'low';
  const fingerprint = `${reasons.map((r) => r.kind).join(',')}|${primary.objective}|${primary.commTypeId}`;
  return {
    milestoneId: m.id, stakeholderId: st.id, reasons, objective: primary.objective, commTypeId: primary.commTypeId,
    priority, changeIds: imp.changeIds, intendedOutcome: OUTCOME[primary.objective], fingerprint,
  };
}

export { OUTCOME as OBJECTIVE_OUTCOMES };
