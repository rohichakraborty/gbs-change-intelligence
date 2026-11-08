// Domain actions: every user operation goes through the store's mutate() so it
// is persisted, audited, and undoable.
import type {
  ArtifactLength, ArtifactSection, ArtifactType, CommStatus, CommunicationRecord, ImpactAssessment, ImpactDecision, Tone,
} from '../domain/types';
import { commFromRec } from '../domain/factory';
import { COMM_STATUS_LABEL } from '../domain/library';
import { nowIso, uid } from '../domain/util';
import { derive } from '../engine/derive';
import { artifactTitle, generateVersion } from '../engine/artifacts';
import { useApp } from './store';

const app = () => useApp.getState();
const cur = () => app().current!;

// ----------------------------- Impact --------------------------------------

export function setImpactDecision(stakeholderId: string, dimensionId: string, decision: Omit<ImpactDecision, 'decidedAt' | 'basedOnRec'> | null, status: ImpactAssessment['status'], summary: string) {
  const key = `${stakeholderId}|${dimensionId}`;
  const rec = derive(cur()).impactRecs.get(key);
  app().mutate((d) => {
    const a = d.assessments[key] ?? { id: key, stakeholderId, dimensionId, decision: null, status: 'proposed', comments: [] };
    a.decision = decision ? { ...decision, decidedAt: nowIso(), basedOnRec: rec?.classification ?? null } : null;
    a.status = status;
    d.assessments[key] = a;
  }, { entityType: 'impact', entityId: key, action: 'decide', summary });
}

export function addImpactComment(stakeholderId: string, dimensionId: string, text: string) {
  const key = `${stakeholderId}|${dimensionId}`;
  app().mutate((d) => {
    const a = d.assessments[key] ?? { id: key, stakeholderId, dimensionId, decision: null, status: 'proposed', comments: [] };
    a.comments.push({ id: uid('cm'), text, at: nowIso() });
    d.assessments[key] = a;
  }, { entityType: 'impact', entityId: key, action: 'comment', summary: 'Reviewer comment added' });
}

// ----------------------------- Audience / comms ----------------------------

export function acceptSuggestions(keys: string[]) {
  const d = derive(cur());
  const sel = d.suggestions.filter((s) => keys.includes(s.key));
  if (!sel.length) return 0;
  app().mutate((st) => {
    for (const s of sel) {
      if (s.kind === 'add') {
        const ar = d.audienceRecs.get(`${s.milestoneId}|${s.stakeholderId}`);
        if (ar) st.comms.push(commFromRec(st as never, ar));
      } else if (s.commId) {
        const c = st.comms.find((x) => x.id === s.commId);
        if (c) { c.status = 'cancelled'; c.updatedAt = nowIso(); c.comments.push({ id: uid('cm'), text: 'Cancelled: no longer recommended after upstream change (suggestion accepted).', at: nowIso() }); }
      }
    }
  }, { entityType: 'communication', entityId: 'bulk', action: 'accept-suggestions', summary: `Accepted ${sel.length} downstream suggestion(s)` });
  return sel.length;
}

export function dismissSuggestions(keys: string[]) {
  const d = derive(cur());
  const sel = d.suggestions.filter((s) => keys.includes(s.key));
  app().mutate((st) => { for (const s of sel) st.dismissedSuggestions[s.key] = s.fingerprint; },
    { entityType: 'communication', entityId: 'bulk', action: 'dismiss-suggestions', summary: `Rejected ${sel.length} downstream suggestion(s)` });
}

export function addCommunication(milestoneId: string, audienceId: string, patch: Partial<CommunicationRecord> = {}) {
  let id = '';
  app().mutate((st) => {
    st.counters.comm += 1;
    const now = nowIso();
    id = uid('com');
    st.comms.push({
      id, code: `COM-${String(st.counters.comm).padStart(3, '0')}`, milestoneId, audienceId, objective: 'inform', commTypeId: 'ct_awareness', priority: 'medium',
      origin: 'consultant', manualReason: 'Added by consultant.', intendedOutcome: '', rolesOverride: null, channelsOverride: null, messageOverride: null,
      changeIdsOverride: null, plannedDateOverride: null, status: 'confirmed', hrReviewed: false, reviewedFingerprint: null, comments: [], createdAt: now, updatedAt: now, ...patch,
    });
  }, { entityType: 'communication', entityId: milestoneId, action: 'add', summary: 'Communication added by consultant' });
  return id;
}

export function updateComm(id: string, fn: (c: CommunicationRecord) => void, summary: string) {
  app().mutate((st) => {
    const c = st.comms.find((x) => x.id === id);
    if (!c) return;
    fn(c as CommunicationRecord);
    c.updatedAt = nowIso();
  }, { entityType: 'communication', entityId: id, action: 'update', summary });
}

const ORDER: CommStatus[] = ['proposed', 'needs_review', 'confirmed', 'draft_prepared', 'pending_approval', 'approved', 'ready', 'completed'];

/** Status changes with guardrails (Rules 3, 4, 5). Returns an error message when blocked. */
export function setCommStatus(id: string, status: CommStatus): string | null {
  const v = derive(cur()).commById.get(id);
  if (!v) return 'Communication not found.';
  const idx = ORDER.indexOf(status);
  if (v.rec.commTypeId === 'ct_sensitive' && idx >= ORDER.indexOf('approved') && !v.rec.hrReviewed) {
    return 'Sensitive communication: record HR review before approval.';
  }
  if (idx >= ORDER.indexOf('approved') && !v.roles.approvers.length) return 'Assign a content approver before approval.';
  if ((status === 'ready' || status === 'completed') && !v.executionReady) return `Not execution-ready: ${v.readinessGaps.join(' ')}`;
  updateComm(id, (c) => {
    c.status = status;
    if (['confirmed', 'draft_prepared', 'pending_approval', 'approved', 'ready'].includes(status)) c.reviewedFingerprint = v.fingerprint;
  }, `Status → ${COMM_STATUS_LABEL[status]}`);
  return null;
}

export function bulkSetCommStatus(ids: string[], status: CommStatus) {
  const errors: string[] = [];
  for (const id of ids) { const e = setCommStatus(id, status); if (e) errors.push(e); }
  return errors;
}

export function markReviewed(id: string) {
  const v = derive(cur()).commById.get(id);
  if (!v) return;
  updateComm(id, (c) => { c.reviewedFingerprint = v.fingerprint; }, 'Upstream changes reviewed and accepted');
}

// ----------------------------- Artifacts -----------------------------------

export function generateArtifact(commId: string, type: ArtifactType, tone?: Tone, length: ArtifactLength = 'standard') {
  const s = cur();
  const v = derive(s).commById.get(commId);
  if (!v) return null;
  const version = generateVersion(s, v, type, { v: 1, origin: 'generated', note: 'Generated from communication record', tone, length });
  let id = '';
  app().mutate((st) => {
    st.counters.artifact += 1;
    id = uid('art');
    st.artifacts.push({ id, code: `ART-${String(st.counters.artifact).padStart(3, '0')}`, communicationRecordId: commId, type, title: artifactTitle(s, v, type),
      versions: [version], approvalStatus: 'draft', createdAt: nowIso(), updatedAt: nowIso() });
    const c = st.comms.find((x) => x.id === commId);
    if (c && ['proposed', 'needs_review', 'confirmed'].includes(c.status)) { c.status = 'draft_prepared'; c.updatedAt = nowIso(); }
  }, { entityType: 'artifact', entityId: commId, action: 'generate', summary: `Generated ${type} for ${v.rec.code}` });
  return id;
}

export function saveArtifactVersion(artId: string, sections: ArtifactSection[], meta: { to: string; from: string; subject: string }, origin: 'edited' | 'section_regenerated' | 'restored', note: string, tone?: Tone, length?: ArtifactLength) {
  app().mutate((st) => {
    const a = st.artifacts.find((x) => x.id === artId);
    if (!a) return;
    const last = a.versions[a.versions.length - 1];
    a.versions.push({ ...last, v: last.v + 1, createdAt: nowIso(), origin, note, meta, sections: JSON.parse(JSON.stringify(sections)), tone: tone ?? last.tone, length: length ?? last.length });
    if (a.approvalStatus === 'approved') a.approvalStatus = 'draft';
    a.updatedAt = nowIso();
  }, { entityType: 'artifact', entityId: artId, action: origin, summary: `New version saved (${note})` });
}

export function regenerateArtifact(artId: string, tone?: Tone, length?: ArtifactLength) {
  const s = cur();
  const a = s.artifacts.find((x) => x.id === artId);
  if (!a) return;
  const v = derive(s).commById.get(a.communicationRecordId);
  if (!v) return;
  const last = a.versions[a.versions.length - 1];
  const nv = generateVersion(s, v, a.type, { v: last.v + 1, origin: 'regenerated', note: 'Regenerated from current source data (earlier versions preserved)', tone: tone ?? last.tone, length: length ?? last.length });
  app().mutate((st) => {
    const x = st.artifacts.find((y) => y.id === artId)!;
    x.versions.push(nv);
    x.approvalStatus = 'draft';
    x.title = artifactTitle(s, v, a.type);
    x.updatedAt = nowIso();
  }, { entityType: 'artifact', entityId: artId, action: 'regenerate', summary: `Regenerated ${a.code} as v${nv.v}` });
}

export function setArtifactApproval(artId: string, status: 'draft' | 'pending' | 'approved'): string | null {
  const s = cur();
  const a = s.artifacts.find((x) => x.id === artId);
  if (!a) return 'Artifact not found';
  const v = derive(s).commById.get(a.communicationRecordId);
  if (status === 'approved' && v?.rec.commTypeId === 'ct_sensitive' && !v.rec.hrReviewed) return 'Sensitive communication: HR review must be recorded on the communication record before approving its artifact.';
  app().mutate((st) => {
    const x = st.artifacts.find((y) => y.id === artId)!;
    x.approvalStatus = status;
    x.updatedAt = nowIso();
    const c = st.comms.find((y) => y.id === x.communicationRecordId);
    if (c && status === 'pending' && ['draft_prepared', 'confirmed'].includes(c.status)) c.status = 'pending_approval';
  }, { entityType: 'artifact', entityId: artId, action: 'approval', summary: `${a.code} → ${status}` });
  return null;
}
