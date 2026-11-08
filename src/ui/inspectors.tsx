import { useMemo, useState } from 'react';
import { X, Check, RotateCcw, AlertTriangle, FileText, Plus } from 'lucide-react';
import { useApp } from '../store/store';
import type { ChannelPlan, CommStatus, Directness, ImpactClass, MessageBrief, Objective, RoleAssignment, Severity, Tone } from '../domain/types';
import { ARTIFACT_TYPES, COMM_STATUS_LABEL, OBJECTIVES, REASON_LABELS, TONES } from '../domain/library';
import { fmtDate, fmtDateTime, formatT } from '../domain/util';
import { derive } from '../engine/derive';
import { severityBand, severityScore } from '../engine/impact';
import { roleName, rolePerson } from '../engine/communicator';
import { milestoneLabel } from '../engine/matrixText';
import { waveName } from '../engine/timing';
import { addCommunication, addImpactComment, markReviewed, setCommStatus, setImpactDecision, updateComm, generateArtifact } from '../store/actions';
import { Badge, Btn, Empty, Prov, PhText, Tabs, TextIn, Seg } from './kit';
import { ChangeEditor } from '../modules/ChangeIdentification';
import { StakeholderEditor } from '../modules/StakeholderRegister';
import { MilestoneEditor } from '../modules/MilestonePlanner';

export function InspectorPanel() {
  const ins = useApp((x) => x.inspector)!;
  const inspect = useApp((x) => x.inspect);
  const s = useApp((x) => x.current)!;
  const title = ins.kind === 'impact' ? 'Impact assessment' : ins.kind === 'comm' ? 'Communication record' : ins.kind === 'cell' ? 'Audience cell' : ins.kind === 'change' ? 'Change record' : ins.kind === 'stakeholder' ? 'Stakeholder' : 'Milestone';
  const sub = ins.kind === 'change' ? s.changes.find((c) => c.id === ins.changeId)?.code : ins.kind === 'stakeholder' ? s.stakeholders.find((c) => c.id === ins.stakeholderId)?.roleName : ins.kind === 'milestone' ? s.milestones.find((c) => c.id === ins.milestoneId)?.name : '';
  return (
    <>
      <div className="insp-head"><div className="row"><div style={{ flex: 1, minWidth: 0 }}><div className="eyebrow" style={{ marginBottom: 0 }}>Inspector</div><div className="t">{title}</div>{sub && <div className="small muted">{sub}</div>}</div><Btn variant="ghost" icon={<X size={16} />} onClick={() => inspect(null)} aria-label="Close inspector" /></div></div>
      <div className="insp-body">
        {ins.kind === 'impact' && <ImpactInspector key={`${ins.stakeholderId}|${ins.dimensionId}`} stakeholderId={ins.stakeholderId} dimensionId={ins.dimensionId} />}
        {ins.kind === 'comm' && <CommInspector key={ins.commId} commId={ins.commId} initialTab={ins.tab} />}
        {ins.kind === 'cell' && <CellInspector key={`${ins.milestoneId}|${ins.stakeholderId}`} milestoneId={ins.milestoneId} stakeholderId={ins.stakeholderId} />}
        {ins.kind === 'change' && <ChangeEditor key={ins.changeId} id={ins.changeId} />}
        {ins.kind === 'stakeholder' && <StakeholderEditor key={ins.stakeholderId} id={ins.stakeholderId} />}
        {ins.kind === 'milestone' && <MilestoneEditor key={ins.milestoneId} id={ins.milestoneId} />}
      </div>
    </>
  );
}

// ----------------------------- Impact --------------------------------------

const SEV_KEYS: { k: keyof Severity; label: string }[] = [
  { k: 'responsibilities', label: 'Responsibilities / ways of working' }, { k: 'relationships', label: 'Relationships / reporting' },
  { k: 'tools', label: 'Tools / processes / technology' }, { k: 'behaviours', label: 'Behaviours / capabilities' },
];
const CLASS_LABEL: Record<ImpactClass, string> = { impacted: '✓ Impacted', not_impacted: '× Not impacted', review: '? Requires review' };

function ImpactInspector({ stakeholderId, dimensionId }: { stakeholderId: string; dimensionId: string }) {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const d = useMemo(() => derive(s), [s]);
  const key = `${stakeholderId}|${dimensionId}`;
  const st = s.stakeholders.find((x) => x.id === stakeholderId);
  const dim = s.dimensions.find((x) => x.id === dimensionId);
  const rec = d.impactRecs.get(key);
  const eff = d.impacts.get(key);
  const a = s.assessments[key];
  const [cls, setCls] = useState<ImpactClass>(a?.decision?.classification ?? rec?.classification ?? 'review');
  const [dir, setDir] = useState<Directness | null>(a?.decision?.directness ?? rec?.directness ?? null);
  const [sev, setSev] = useState<Severity | null>(a?.decision?.severity ?? rec?.severity ?? null);
  const [why, setWhy] = useState(a?.decision?.rationale ?? '');
  const [comment, setComment] = useState('');
  if (!st || !dim || !rec || !eff) return <Empty title="Cell not available">The stakeholder or dimension is no longer selected.</Empty>;
  const w = s.engagement.settings.weights, th = s.engagement.settings.thresholds;
  const recScore = severityScore(rec.severity, w);
  const commNeeds = d.activeComms.filter((c) => c.audience.id === stakeholderId);

  const save = (status: 'confirmed' | 'needs_review' | 'rejected') => {
    if (status !== 'needs_review' && (cls !== rec.classification || JSON.stringify(sev) !== JSON.stringify(rec.severity)) && !why.trim()) { toast('Add a rationale for the override before saving.', 'warn'); return; }
    setImpactDecision(stakeholderId, dimensionId, { classification: cls, directness: cls === 'impacted' ? dir ?? 'direct' : null, severity: cls === 'impacted' ? sev : null, rationale: why.trim() || 'Consultant accepted the rule recommendation.' }, status,
      `${st.roleName} × ${dim.short}: ${CLASS_LABEL[cls]} (${status})`);
    toast(status === 'needs_review' ? 'Marked as needs review' : 'Assessment saved. Dependent audience recommendations re-evaluated.');
  };

  return (
    <>
      <dl className="kv"><dt>Stakeholder</dt><dd className="strong">{st.roleName}</dd><dt>Dimension</dt><dd>{dim.label}</dd><dt>Effective result</dt><dd>{CLASS_LABEL[eff.classification]} {eff.directness && `(${eff.directness})`} {eff.source === 'consultant' ? <Prov kind="consultant" /> : <Prov kind="rule" />}</dd>
        <dt>Status</dt><dd><Badge tone={eff.status === 'confirmed' ? 'ok' : eff.status === 'needs_review' ? 'warn' : eff.status === 'rejected' ? 'crit' : 'info'}>{eff.status.replace('_', ' ')}</Badge></dd></dl>
      {eff.conflict && <div className="banner crit"><AlertTriangle size={15} /><div className="grow small">The rule recommendation has changed to <strong>{CLASS_LABEL[rec.classification]}</strong> since this decision was made. Your decision is kept; review and re-confirm or revert.</div></div>}

      <div className="insp-block rec">
        <h4>Why was this recommended? <Prov kind="rule" /></h4>
        <div className="strong" style={{ marginBottom: 4 }}>{CLASS_LABEL[rec.classification]}{rec.directness ? ` · ${rec.directness}` : ''} <Badge tone="muted" title="Evidence sufficiency, not a statistical probability">{rec.confidence} evidence sufficiency</Badge></div>
        <ul className="clean small">{rec.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {rec.severity && <div className="small" style={{ marginTop: 6 }}>Severity: {SEV_KEYS.map((x) => `${x.label.split(' ')[0]} ${rec.severity![x.k]}`).join(' · ')} → <strong>{recScore?.toFixed(2)} ({severityBand(recScore, th)})</strong></div>}
        {rec.classification === 'impacted' && !rec.severity && <div className="small" style={{ marginTop: 6, color: 'var(--warn)' }}>Severity not scored — insufficient information.</div>}
        <div className="tiny muted" style={{ marginTop: 6 }}>Rules: {rec.ruleIds.join(', ') || '—'}</div>
      </div>
      <div className="insp-block">
        <h4>Specific changes considered</h4>
        {rec.pairs.length === 0 ? <p className="small muted">No change records in this dimension.</p> : rec.pairs.map((p) => {
          const c = s.changes.find((x) => x.id === p.changeId)!;
          return <div key={p.changeId} className="small" style={{ marginBottom: 6 }}><span className="mono">{c.code}</span> <strong>{c.title}</strong> <Badge tone={p.hit === 'direct' ? 'ok' : p.hit === 'indirect' ? 'info' : p.hit === 'unknown' ? 'warn' : 'muted'}>{p.hit === 'none' ? 'no impact' : p.hit}</Badge><div className="muted">{p.text}</div></div>;
        })}
      </div>
      {(rec.gaps.length > 0 || rec.assumptions.length > 0) && (
        <div className="insp-block gap">
          {rec.gaps.length > 0 && <><h4>Missing information</h4><ul className="clean small">{rec.gaps.map((g) => <li key={g}>{g}</li>)}</ul></>}
          {rec.assumptions.length > 0 && <><h4 style={{ marginTop: 8 }}>Assumptions</h4><ul className="clean small">{rec.assumptions.map((g) => <li key={g}>{g}</li>)}</ul></>}
        </div>
      )}
      {rec.evidence.length > 0 && <div className="insp-block"><h4>Supporting evidence</h4><ul className="clean small">{rec.evidence.map((g) => <li key={g}>{g}</li>)}</ul></div>}

      <div className="insp-block dec">
        <h4>Consultant assessment <Prov kind="consultant" /></h4>
        <div className="field"><label>Classification</label><Seg options={[{ value: 'impacted', label: '✓ Impacted' }, { value: 'not_impacted', label: '× Not impacted' }, { value: 'review', label: '? Review' }]} value={cls} onChange={(v) => { setCls(v); if (v === 'impacted' && !dir) setDir('direct'); }} /></div>
        {cls === 'impacted' && (
          <>
            <div className="field" style={{ marginTop: 8 }}><label>Directness</label><Seg options={[{ value: 'direct', label: 'Direct' }, { value: 'indirect', label: 'Indirect' }]} value={dir ?? 'direct'} onChange={(v) => setDir(v)} /></div>
            <div className="field" style={{ marginTop: 8 }}><label>Severity (0–3 per dimension)</label>
              <label className="check small"><input type="checkbox" checked={!sev} onChange={(e) => setSev(e.target.checked ? null : (rec.severity ?? { responsibilities: 1, relationships: 1, tools: 1, behaviours: 1 }))} /> Not scored (insufficient information)</label>
              {sev && SEV_KEYS.map((x) => (
                <div key={x.k} className="row small" style={{ justifyContent: 'space-between' }}><span>{x.label}</span>
                  <select className="select" style={{ width: 70 }} value={sev[x.k]} onChange={(e) => setSev({ ...sev, [x.k]: Number(e.target.value) })} aria-label={x.label}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
              ))}
              {sev && <span className="help">Weighted score {severityScore(sev, w)?.toFixed(2)} → {severityBand(severityScore(sev, w), th)}</span>}
            </div>
          </>
        )}
        <div className="field" style={{ marginTop: 8 }}><label>Rationale (required for an override)</label><textarea className="textarea" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why this assessment is correct for this engagement" /></div>
        <div className="row" style={{ marginTop: 10 }}>
          <Btn variant="primary" icon={<Check size={14} />} onClick={() => save('confirmed')}>Confirm assessment</Btn>
          <Btn onClick={() => { setCls(rec.classification); setDir(rec.directness); setSev(rec.severity); setImpactDecision(stakeholderId, dimensionId, null, 'confirmed', `${st.roleName} × ${dim.short}: recommendation accepted`); toast('Recommendation accepted'); }} disabled={rec.classification === 'review'}>Accept recommendation</Btn>
          <Btn onClick={() => { const flipped: ImpactClass = rec.classification === 'impacted' ? 'not_impacted' : 'impacted'; setCls(flipped); if (flipped === 'impacted') setDir('direct'); toast('Recommendation rejected — set the classification, add a rationale, then confirm.', 'warn'); }}>Reject recommendation</Btn>
          <Btn onClick={() => save('needs_review')}>Mark needs review</Btn>
          {a?.decision && <Btn variant="ghost" icon={<RotateCcw size={13} />} onClick={() => { setImpactDecision(stakeholderId, dimensionId, null, 'proposed', `${st.roleName} × ${dim.short}: override cleared`); setCls(rec.classification); setDir(rec.directness); setSev(rec.severity); setWhy(''); toast('Override cleared — rule recommendation applies'); }}>Clear override</Btn>}
        </div>
        {a?.decision && <p className="tiny muted" style={{ marginTop: 6 }}>Decided {fmtDateTime(a.decision.decidedAt)} against recommendation “{a.decision.basedOnRec ?? '—'}”.</p>}
      </div>
      <div className="insp-block">
        <h4>Communication relevance (separate from impact)</h4>
        <p className="small">{commNeeds.length ? `${commNeeds.length} active communication(s) for this stakeholder: ${Array.from(new Set(commNeeds.map((c) => c.milestone.name))).slice(0, 5).join(', ')}${commNeeds.length > 5 ? '…' : ''}.` : 'No active communications for this stakeholder.'}</p>
      </div>
      <div className="insp-block">
        <h4>Reviewer comments</h4>
        {(a?.comments ?? []).map((c) => <div key={c.id} className="small" style={{ marginBottom: 4 }}><span className="muted">{fmtDateTime(c.at)}</span> — {c.text}</div>)}
        <div className="row"><input className="input" style={{ flex: 1 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" aria-label="Reviewer comment" /><Btn size="sm" disabled={!comment.trim()} onClick={() => { addImpactComment(stakeholderId, dimensionId, comment.trim()); setComment(''); }}>Add</Btn></div>
      </div>
    </>
  );
}

// ----------------------------- Empty / suggested cell ----------------------

function CellInspector({ milestoneId, stakeholderId }: { milestoneId: string; stakeholderId: string }) {
  const s = useApp((x) => x.current)!;
  const inspect = useApp((x) => x.inspect);
  const toast = useApp((x) => x.toast);
  const d = useMemo(() => derive(s), [s]);
  const m = s.milestones.find((x) => x.id === milestoneId);
  const st = s.stakeholders.find((x) => x.id === stakeholderId);
  const ar = d.audienceRecs.get(`${milestoneId}|${stakeholderId}`);
  const cs = (d.commsByCell.get(`${milestoneId}|${stakeholderId}`) ?? []);
  const [obj, setObj] = useState<Objective>(ar?.objective ?? 'inform');
  const [ct, setCt] = useState(ar?.commTypeId ?? 'ct_awareness');
  const [reason, setReason] = useState('');
  if (!m || !st) return <Empty title="Cell not available" />;
  return (
    <>
      <dl className="kv"><dt>Milestone</dt><dd className="strong">{milestoneLabel(s, m)}</dd><dt>Audience</dt><dd>{st.roleName}</dd><dt>Wave</dt><dd>{waveName(s, m.waveId)}</dd></dl>
      {cs.length > 0 && (
        <div className="insp-block"><h4>Communication records in this cell</h4>
          {cs.map((c) => <div key={c.rec.id} className="row small" style={{ marginBottom: 4 }}><span className="mono">{c.rec.code}</span><span>{OBJECTIVES[c.rec.objective]}</span><Badge tone={c.active ? 'info' : 'muted'}>{COMM_STATUS_LABEL[c.rec.status]}</Badge><Btn size="sm" onClick={() => inspect({ kind: 'comm', commId: c.rec.id })}>Open</Btn></div>)}
        </div>
      )}
      {ar ? (
        <div className="insp-block rec">
          <h4>Why is this audience recommended? <Prov kind="rule" /></h4>
          <ul className="clean small">{ar.reasons.map((r) => <li key={r.kind}><strong>{REASON_LABELS[r.kind]}:</strong> {r.text}</li>)}</ul>
          <div className="small" style={{ marginTop: 6 }}>Objective: <strong>{OBJECTIVES[ar.objective]}</strong> · Type: {s.commTypes.find((t) => t.id === ar.commTypeId)?.name}</div>
          {!cs.some((c) => c.active) && <div className="row" style={{ marginTop: 8 }}>
            <Btn variant="primary" icon={<Plus size={13} />} onClick={() => { const key = `add|${milestoneId}|${stakeholderId}`; import('../store/actions').then((mod) => { mod.acceptSuggestions([key]); toast('Audience added'); }); }}>Accept recommendation</Btn>
            <Btn onClick={() => { import('../store/actions').then((mod) => { mod.dismissSuggestions([`add|${milestoneId}|${stakeholderId}`]); toast('Recommendation rejected'); inspect(null); }); }}>Reject</Btn>
          </div>}
        </div>
      ) : <div className="insp-block"><h4>No rule recommendation</h4><p className="small muted">The rules did not identify a communication need for this audience at this milestone. You can still add one.</p></div>}
      <div className="insp-block dec">
        <h4>Add a communication manually <Prov kind="consultant" /></h4>
        <div className="grid g2">
          <div className="field"><label>Objective</label><select className="select" value={obj} onChange={(e) => setObj(e.target.value as Objective)}>{Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label>Communication type</label><select className="select" value={ct} onChange={(e) => setCt(e.target.value)}>{s.commTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        </div>
        <div className="field" style={{ marginTop: 8 }}><label>Reason selected</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Needs awareness for local works council briefing" /></div>
        <Btn style={{ marginTop: 8 }} icon={<Plus size={13} />} onClick={() => { const id = addCommunication(milestoneId, stakeholderId, { objective: obj, commTypeId: ct, manualReason: reason || 'Added by consultant.', priority: ct === 'ct_sensitive' ? 'high' : 'medium', status: ct === 'ct_sensitive' ? 'needs_review' : 'confirmed' }); inspect({ kind: 'comm', commId: id }); toast('Communication added'); }}>{cs.some((c) => c.active) ? 'Add another communication' : 'Add communication'}</Btn>
        <p className="tiny muted" style={{ marginTop: 6 }}>A stakeholder can have several communications at one milestone when objectives, timing, messages, or channels differ.</p>
      </div>
    </>
  );
}

// ----------------------------- Communication record ------------------------

type CTab = 'audience' | 'communicator' | 'channel' | 'message' | 'plan';

function CommInspector({ commId, initialTab }: { commId: string; initialTab?: CTab }) {
  const s = useApp((x) => x.current)!;
  const d = useMemo(() => derive(s), [s]);
  const [tab, setTab] = useState<CTab>(initialTab ?? 'audience');
  const v = d.commById.get(commId);
  if (!v) return <Empty title="Communication not found" />;
  return (
    <>
      <div className="row"><span className="mono strong">{v.rec.code}</span><Badge tone={v.rec.status === 'approved' || v.rec.status === 'ready' || v.rec.status === 'completed' ? 'ok' : v.rec.status === 'needs_review' || v.rec.status === 'pending_approval' ? 'warn' : v.rec.status === 'cancelled' || v.rec.status === 'deferred' ? 'muted' : 'info'}>{COMM_STATUS_LABEL[v.rec.status]}</Badge>
        {v.sensitive && <Badge tone="warn">Sensitive</Badge>}{v.rec.origin === 'consultant' ? <Prov kind="consultant" label="Consultant-added" /> : <Prov kind="rule" label="Rule-generated" />}</div>
      <dl className="kv"><dt>Milestone</dt><dd className="strong">{milestoneLabel(s, v.milestone)}</dd><dt>Audience</dt><dd>{v.audience.roleName}</dd>
        <dt>Timing</dt><dd>{v.milestone.kind === 'milestone' ? formatT(v.offset) : v.milestone.recurrence?.cadence ?? v.milestone.kind} · planned {v.plannedDate ? fmtDate(v.plannedDate) : 'not dated'}</dd></dl>
      {v.outOfScopeReason && <div className="banner warn small"><AlertTriangle size={14} /><div className="grow">Inactive: {v.outOfScopeReason}</div></div>}
      {v.upstreamChanged && <div className="banner warn"><AlertTriangle size={15} /><div className="grow small">Upstream inputs (impact, audience reasons, timing, or rule outputs) changed since this was confirmed.</div><Btn size="sm" onClick={() => markReviewed(v.rec.id)}>Mark reviewed</Btn></div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'audience', label: 'Audience' }, { value: 'communicator', label: 'Communicator' }, { value: 'channel', label: 'Channel' }, { value: 'message', label: 'Message' }, { value: 'plan', label: 'Plan & status' }]} />
      {tab === 'audience' && <AudienceTab id={commId} />}
      {tab === 'communicator' && <CommunicatorTab id={commId} />}
      {tab === 'channel' && <ChannelTab id={commId} />}
      {tab === 'message' && <MessageTab id={commId} />}
      {tab === 'plan' && <PlanTab id={commId} />}
    </>
  );
}

function useView(id: string) { const s = useApp((x) => x.current)!; const d = useMemo(() => derive(s), [s]); return { s, d, v: d.commById.get(id)! }; }

function AudienceTab({ id }: { id: string }) {
  const { s, v } = useView(id);
  return (
    <>
      <div className={`insp-block ${v.audienceRec ? 'rec' : 'dec'}`}>
        <h4>Why this audience? {v.audienceRec ? <Prov kind="rule" /> : <Prov kind="consultant" />}</h4>
        {v.audienceRec ? <ul className="clean small">{v.audienceRec.reasons.map((r) => <li key={r.kind}><strong>{REASON_LABELS[r.kind]}:</strong> {r.text}</li>)}</ul>
          : <p className="small">{v.rec.manualReason || 'Added by consultant.'}{v.rec.origin === 'rule' && ' The rules no longer recommend this audience — see Audience Matrix suggestions.'}</p>}
      </div>
      <div className="grid g2">
        <div className="field"><label>Communication objective</label><select className="select" value={v.rec.objective} onChange={(e) => updateComm(id, (c) => { c.objective = e.target.value as Objective; }, 'Objective changed')}>{Object.entries(OBJECTIVES).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
        <div className="field"><label>Communication type</label><select className="select" value={v.rec.commTypeId} onChange={(e) => updateComm(id, (c) => { c.commTypeId = e.target.value; if (e.target.value === 'ct_sensitive' && ['approved', 'ready'].includes(c.status)) c.status = 'needs_review'; }, 'Communication type changed')}>{s.commTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="field"><label>Priority</label><select className="select" value={v.rec.priority} onChange={(e) => updateComm(id, (c) => { c.priority = e.target.value as 'high'; }, 'Priority changed')}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
      </div>
      <div className="field"><label>Intended outcome</label><TextIn multiline value={v.rec.intendedOutcome} onCommit={(x) => updateComm(id, (c) => { c.intendedOutcome = x; }, 'Intended outcome')} /></div>
      {v.rec.origin === 'consultant' && <div className="field"><label>Reason selected</label><TextIn value={v.rec.manualReason} onCommit={(x) => updateComm(id, (c) => { c.manualReason = x; }, 'Reason')} /></div>}
      <div className="field"><label>Related changes {v.rec.changeIdsOverride ? <Prov kind="consultant" label="Overridden" /> : <Prov kind="rule" label="From impact" />}</label>
        <div className="chips">{s.changes.map((c) => { const on = v.changeIds.includes(c.id); return <button key={c.id} className={`chip ${on ? 'on' : ''}`} title={c.title} onClick={() => updateComm(id, (r) => { r.changeIdsOverride = on ? v.changeIds.filter((x) => x !== c.id) : [...v.changeIds, c.id]; }, 'Linked changes edited')}>{c.code}</button>; })}</div>
        {v.rec.changeIdsOverride && <Btn size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={() => updateComm(id, (r) => { r.changeIdsOverride = null; }, 'Linked changes reverted')}>Revert to impact-derived changes</Btn>}
      </div>
      <div className="row">
        {v.rec.status !== 'cancelled' ? <Btn variant="danger" onClick={() => updateComm(id, (c) => { c.status = 'cancelled'; }, 'Audience removed (record cancelled, kept for audit)')}>Remove audience</Btn>
          : <Btn onClick={() => updateComm(id, (c) => { c.status = 'needs_review'; }, 'Record restored')}>Restore</Btn>}
      </div>
    </>
  );
}

function RoleSelect({ value, onChange, label, allowEmpty = true }: { value: string | null; onChange: (v: string | null) => void; label: string; allowEmpty?: boolean }) {
  const s = useApp((x) => x.current)!;
  return (
    <div className="field"><label>{label}</label>
      <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        {allowEmpty && <option value="">— Not assigned —</option>}
        {s.communicatorRoles.map((r) => <option key={r.id} value={r.id}>{r.name}{rolePerson(s, r.id) ? ` — ${rolePerson(s, r.id)}` : ''}</option>)}
      </select>
    </div>
  );
}

function MultiRole({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const s = useApp((x) => x.current)!;
  return (
    <div className="field"><label>{label}</label>
      <select className="select" value="" onChange={(e) => { const x = e.target.value; if (x) onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x]); }}>
        <option value="">{value.length ? value.map((x) => roleName(s, x)).join(', ') : '— None —'}</option>
        {s.communicatorRoles.map((r) => <option key={r.id} value={r.id}>{value.includes(r.id) ? '✓ ' : ''}{r.name}</option>)}
      </select>
    </div>
  );
}

function CommunicatorTab({ id }: { id: string }) {
  const { s, v } = useView(id);
  const r = v.rolesRec;
  const cur = v.roles;
  const setRoles = (patch: Partial<RoleAssignment>) => updateComm(id, (c) => { c.rolesOverride = { ...cur, ...patch }; }, 'Communicator assignment overridden');
  const name = (x: string | null) => x ? `${roleName(s, x)}${rolePerson(s, x) ? ` (${rolePerson(s, x)})` : ''}` : '—';
  return (
    <>
      <div className="insp-block rec">
        <h4>Why this communicator? <Prov kind="rule" /> <span className="tiny muted">{r.ruleId}</span></h4>
        <dl className="kv" style={{ marginBottom: 6 }}>
          <dt>Recommended</dt><dd className="strong">{r.assignment.primary ? name(r.assignment.primary) : <span style={{ color: 'var(--crit)' }}>Communicator assignment requires review</span>}</dd>
          <dt>Communication type</dt><dd>{s.commTypes.find((t) => t.id === v.rec.commTypeId)?.name}</dd>
          <dt>Required authority</dt><dd>{r.authority || '—'}</dd>
          {r.relationship && <><dt>Relationship</dt><dd>{r.relationship}</dd></>}
          <dt>Alternatives</dt><dd>{r.alternatives.join('; ') || '—'}</dd>
          <dt>Approvals</dt><dd>{r.approvalNotes ? <PhText text={r.approvalNotes} /> : r.assignment.approvers.map((x) => roleName(s, x)).join(', ')}</dd>
        </dl>
        <ul className="clean small">{r.rationale.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
      {r.gaps.length > 0 && <div className="insp-block gap"><h4>Gaps</h4><ul className="clean small">{r.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>}
      {v.rolesConflict && <div className="banner crit small"><AlertTriangle size={14} /><div className="grow">Your override differs from the current recommendation. It is kept; revert if the recommendation is now preferred.</div></div>}
      <div className="insp-block dec">
        <h4>Assignment {v.rolesOverridden ? <Prov kind="consultant" label="Overridden" /> : <Prov kind="rule" label="Following rules" />} {r.needsReview && !v.rolesOverridden && <Badge tone="warn">Requires review</Badge>}</h4>
        <div className="stack">
          <RoleSelect label="Communication owner (accountable)" value={cur.owner} onChange={(x) => setRoles({ owner: x })} />
          <RoleSelect label="Primary communicator (delivers)" value={cur.primary} onChange={(x) => setRoles({ primary: x })} />
          <MultiRole label="Supporting communicator(s)" value={cur.supporting} onChange={(x) => setRoles({ supporting: x })} />
          <RoleSelect label="Content creator" value={cur.creator} onChange={(x) => setRoles({ creator: x })} />
          <MultiRole label="Content approver(s)" value={cur.approvers} onChange={(x) => setRoles({ approvers: x })} />
        </div>
        {v.rolesOverridden && <Btn style={{ marginTop: 8 }} size="sm" icon={<RotateCcw size={13} />} onClick={() => updateComm(id, (c) => { c.rolesOverride = null; }, 'Communicator reverted to recommendation')}>Revert to recommendation</Btn>}
      </div>
    </>
  );
}

function ChannelSelect({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label: string }) {
  const s = useApp((x) => x.current)!;
  const cur = value ? s.channels.find((c) => c.id === value) : null;
  return (
    <div className="field"><label>{label}</label>
      <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— None —</option>
        {cur && !cur.enabled && <option value={cur.id}>{cur.name} (DISABLED)</option>}
        {Array.from(new Set(s.channels.filter((c) => c.enabled).map((c) => c.category))).map((cat) => (
          <optgroup key={cat} label={cat}>{s.channels.filter((c) => c.enabled && c.category === cat).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
        ))}
      </select>
    </div>
  );
}

function ChannelTab({ id }: { id: string }) {
  const { s, v } = useView(id);
  const cur = v.channels;
  const setPlan = (patch: Partial<ChannelPlan>) => updateComm(id, (c) => { c.channelsOverride = { ...cur, ...patch }; }, 'Channel overridden');
  const nm = (x: string | null) => (x ? s.channels.find((c) => c.id === x)?.name ?? x : '—');
  return (
    <>
      <div className="insp-block rec">
        <h4>Why these channels? <Prov kind="rule" /> <span className="tiny muted">{v.channelRec.ruleId}</span></h4>
        <dl className="kv" style={{ marginBottom: 6 }}><dt>Primary</dt><dd className="strong">{nm(v.channelRec.plan.primary)}</dd><dt>Secondary</dt><dd>{v.channelRec.plan.secondary.map(nm).join(', ') || '—'}</dd><dt>Reinforcement</dt><dd>{nm(v.channelRec.plan.reinforcement)}</dd><dt>Follow-up</dt><dd>{nm(v.channelRec.plan.followUp)}</dd></dl>
        <ul className="clean small">{v.channelRec.rationale.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
      {v.channelRec.gaps.length > 0 && <div className="insp-block gap"><ul className="clean small">{v.channelRec.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>}
      {v.disabledInUse.length > 0 && <div className="banner crit small"><AlertTriangle size={14} /><div className="grow">Uses disabled channel(s): {v.disabledInUse.map(nm).join(', ')}. Select an enabled channel.</div></div>}
      <div className="insp-block dec">
        <h4>Channel plan {v.channelsOverridden ? <Prov kind="consultant" label="Overridden" /> : <Prov kind="rule" label="Following rules" />}</h4>
        <div className="stack">
          <ChannelSelect label="Primary channel" value={cur.primary} onChange={(x) => setPlan({ primary: x })} />
          <div className="field"><label>Secondary channel(s)</label>
            <select className="select" value="" onChange={(e) => { const x = e.target.value; if (x) setPlan({ secondary: cur.secondary.includes(x) ? cur.secondary.filter((y) => y !== x) : [...cur.secondary, x] }); }}>
              <option value="">{cur.secondary.length ? cur.secondary.map(nm).join(', ') : '— None —'}</option>
              {s.channels.filter((c) => c.enabled).map((c) => <option key={c.id} value={c.id}>{cur.secondary.includes(c.id) ? '✓ ' : ''}{c.name}</option>)}
            </select></div>
          <ChannelSelect label="Reinforcement channel" value={cur.reinforcement} onChange={(x) => setPlan({ reinforcement: x })} />
          <ChannelSelect label="Follow-up channel" value={cur.followUp} onChange={(x) => setPlan({ followUp: x })} />
        </div>
        {v.channelsOverridden && <Btn style={{ marginTop: 8 }} size="sm" icon={<RotateCcw size={13} />} onClick={() => updateComm(id, (c) => { c.channelsOverride = null; }, 'Channel reverted to recommendation')}>Revert to recommendation</Btn>}
      </div>
      <div className="insp-block"><h4>Artifact options for this channel plan</h4>
        <div className="chips">{v.artifactTypes.map((t) => <span key={t} className="chip static">{ARTIFACT_TYPES[t].letter}. {ARTIFACT_TYPES[t].label}</span>)}</div>
        <p className="tiny muted" style={{ marginTop: 6 }}>Re-evaluated whenever the channel plan changes.</p>
      </div>
    </>
  );
}

const BRIEF_FIELDS: { k: keyof MessageBrief; label: string; list?: boolean }[] = [
  { k: 'mainMessage', label: 'Main message' }, { k: 'supportingMessages', label: 'Supporting messages', list: true }, { k: 'whyItMatters', label: 'Why the change matters' },
  { k: 'whatIsChanging', label: 'What is changing', list: true }, { k: 'whatIsNotChanging', label: 'What is not changing' }, { k: 'expectedImpact', label: 'Expected impact' },
  { k: 'keyDates', label: 'Key dates', list: true }, { k: 'requiredActions', label: 'Required stakeholder actions', list: true }, { k: 'supportChannels', label: 'Support channels', list: true },
  { k: 'potentialConcerns', label: 'Potential concerns', list: true }, { k: 'confidentiality', label: 'Confidentiality considerations' }, { k: 'anticipatedQuestions', label: 'Anticipated questions', list: true },
  { k: 'approvalRequirements', label: 'Content approval requirements' },
];

export function BriefEditor({ id, compact }: { id: string; compact?: boolean }) {
  const { v } = useView(id);
  const ov = v.rec.messageOverride ?? {};
  const set = (k: keyof MessageBrief, val: unknown) => updateComm(id, (c) => { c.messageOverride = { ...(c.messageOverride ?? {}), [k]: val }; }, `Message: ${k} edited`);
  const revert = (k: keyof MessageBrief) => updateComm(id, (c) => { const o = { ...(c.messageOverride ?? {}) }; delete o[k]; c.messageOverride = Object.keys(o).length ? o : null; }, `Message: ${k} reverted`);
  return (
    <div className="stack">
      <div className="field"><label>Tone {ov.tone ? <Prov kind="consultant" label="Override" /> : <Prov kind="rule" label="Default" />}</label>
        <select className="select" value={v.brief.tone} onChange={(e) => set('tone', e.target.value as Tone)}>{Object.entries(TONES).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
      {BRIEF_FIELDS.filter((f) => !compact || ['mainMessage', 'supportingMessages', 'whatIsNotChanging', 'requiredActions', 'keyDates'].includes(f.k)).map((f) => {
        const val = v.brief[f.k];
        const text = Array.isArray(val) ? (val as string[]).join('\n') : String(val ?? '');
        const overridden = f.k in ov;
        return (
          <div className="field" key={f.k}>
            <label>{f.label} {overridden ? <Prov kind="consultant" label="Edited" /> : <Prov kind="rule" label="Generated" />} {overridden && <button className="btn ghost sm" onClick={() => revert(f.k)}>Revert</button>}</label>
            <TextIn multiline rows={f.list ? Math.min(5, Math.max(2, text.split('\n').length)) : 2} value={text} onCommit={(x) => set(f.k, f.list ? x.split('\n').map((y) => y.trim()).filter(Boolean) : x)} />
            {/\[[A-Z]/.test(text) && <span className="help"><PhText text={text.match(/\[[^\]]+\]/g)?.join(' ') ?? ''} /></span>}
          </div>
        );
      })}
    </div>
  );
}

function MessageTab({ id }: { id: string }) {
  const { v } = useView(id);
  return (
    <>
      <p className="small muted">Messaging brief generated from the linked change records, impact assessment, timing, and communicators. Placeholders mark facts that must be confirmed — nothing is invented. Edits are kept as overrides.</p>
      {v.messageOverridden && <Badge tone="ok">{Object.keys(v.rec.messageOverride ?? {}).length} field(s) edited</Badge>}
      <BriefEditor id={id} />
    </>
  );
}

const STATUS_FLOW: CommStatus[] = ['proposed', 'needs_review', 'confirmed', 'draft_prepared', 'pending_approval', 'approved', 'ready', 'completed', 'deferred', 'cancelled'];

function PlanTab({ id }: { id: string }) {
  const { s, v } = useView(id);
  const toast = useApp((x) => x.toast);
  const setView = useApp((x) => x.setView);
  const inspect = useApp((x) => x.inspect);
  const [comment, setComment] = useState('');
  return (
    <>
      <div className="grid g2">
        <div className="field"><label>Planned date {v.rec.plannedDateOverride ? <Prov kind="consultant" label="Rescheduled" /> : <Prov kind="rule" label="Milestone − lead time" />}</label>
          <TextIn type="date" value={v.plannedDate ?? ''} onCommit={(x) => updateComm(id, (c) => { c.plannedDateOverride = x || null; }, `Rescheduled to ${x || 'milestone date'}`)} /></div>
        <div className="field"><label>Milestone date</label><input className="input" disabled value={v.milestoneDate ? fmtDate(v.milestoneDate) : 'Not dated'} /></div>
      </div>
      {v.rec.plannedDateOverride && <Btn size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={() => updateComm(id, (c) => { c.plannedDateOverride = null; }, 'Planned date reverted to milestone timing')}>Revert to milestone timing</Btn>}
      {v.milestone.recurrence && <p className="small">Recurring: {v.milestone.recurrence.cadence} until {v.milestone.recurrence.until}.</p>}
      {v.rec.commTypeId === 'ct_sensitive' && (
        <div className="insp-block gap"><h4>Sensitive communication safeguard</h4>
          <label className="check"><input type="checkbox" checked={v.rec.hrReviewed} onChange={() => updateComm(id, (c) => { c.hrReviewed = !c.hrReviewed; }, v.rec.hrReviewed ? 'HR review cleared' : 'HR review recorded')} /> HR review completed by authorised personnel</label>
          <p className="tiny muted" style={{ marginTop: 4 }}>Cannot be approved until HR review is recorded. Generated content is never treated as approved.</p>
        </div>
      )}
      <div className="field"><label>Status</label>
        <select className="select" value={v.rec.status} onChange={(e) => { const err = setCommStatus(id, e.target.value as CommStatus); if (err) toast(err, 'warn'); }}>
          {STATUS_FLOW.map((x) => <option key={x} value={x}>{COMM_STATUS_LABEL[x]}</option>)}
        </select>
        <span className="help">Approval does not send anything. Delivery is outside the application.</span>
      </div>
      <div className={`insp-block ${v.executionReady ? 'dec' : 'gap'}`}><h4>Execution readiness</h4>
        {v.executionReady ? <p className="small">Owner, communicator, approver, enabled channel, and planned date are in place.</p> : <ul className="clean small">{v.readinessGaps.map((g) => <li key={g}>{g}</li>)}</ul>}
      </div>
      <div className="insp-block"><h4>Artifacts</h4>
        {v.artifacts.length ? v.artifacts.map((a) => <div key={a.id} className="row small" style={{ marginBottom: 4 }}><FileText size={13} /><span className="mono">{a.code}</span><span style={{ flex: 1 }}>{ARTIFACT_TYPES[a.type].label} v{a.versions[a.versions.length - 1].v}</span><Badge tone={a.approvalStatus === 'approved' ? 'ok' : a.approvalStatus === 'pending' ? 'warn' : 'info'}>{a.approvalStatus}</Badge></div>) : <p className="small muted">No artifact generated yet.</p>}
        <div className="row" style={{ marginTop: 6 }}>
          {v.artifactTypes.slice(0, 2).map((t) => <Btn key={t} size="sm" icon={<Plus size={12} />} onClick={() => { const aid = generateArtifact(id, t); if (aid) { toast(`${ARTIFACT_TYPES[t].label} generated`); inspect(null); setView('artifact-studio'); sessionStorageSafe(aid); } }}>{ARTIFACT_TYPES[t].label}</Btn>)}
        </div>
      </div>
      <div className="insp-block"><h4>Comments</h4>
        {v.rec.comments.map((c) => <div key={c.id} className="small" style={{ marginBottom: 4 }}><span className="muted">{fmtDateTime(c.at)}</span> — {c.text}</div>)}
        <div className="row"><input className="input" style={{ flex: 1 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" aria-label="Comment" /><Btn size="sm" disabled={!comment.trim()} onClick={() => { updateComm(id, (c) => { c.comments.push({ id: `cm_${Date.now()}`, text: comment.trim(), at: new Date().toISOString() }); }, 'Comment added'); setComment(''); }}>Add</Btn></div>
      </div>
      <p className="tiny muted">Created {fmtDateTime(v.rec.createdAt)} · last modified {fmtDateTime(v.rec.updatedAt)} · {s.engagement.name}</p>
    </>
  );
}

export function sessionStorageSafe(artId: string) {
  try { sessionStorage.setItem('gbs-ci:open-artifact', artId); } catch { /* ignore */ }
}
