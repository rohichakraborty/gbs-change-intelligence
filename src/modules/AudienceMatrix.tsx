import { useMemo, useState, type MouseEvent, type KeyboardEvent } from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import { useApp } from '../store/store';
import { derive } from '../engine/derive';
import { groupMilestones, groupStakeholders, milestoneLabel, timingLabel } from '../engine/matrixText';
import { acceptSuggestions, addCommunication, bulkSetCommStatus, dismissSuggestions, updateComm } from '../store/actions';
import { Matrix, type MxGroup } from '../ui/Matrix';
import { Badge, Btn, Empty, Modal, PageHeader, Select } from '../ui/kit';
import { waveName } from '../engine/timing';

export function useMilestoneRows(phaseFilter: string, waveFilter: string) {
  const s = useApp((x) => x.current)!;
  const d = useMemo(() => derive(s), [s]);
  const groups: MxGroup[] = groupMilestones(s, d.activeMilestones.filter((m) => (!phaseFilter || m.phaseId === phaseFilter) && (!waveFilter || (waveFilter === 'none' ? !m.waveId : m.waveId === waveFilter))))
    .map((pr) => ({ id: pr.phase.id, label: `Phase ${pr.phase.num} — ${pr.phase.name}`, rows: pr.milestones.map((m) => ({ id: m.id, searchText: `${m.name} ${waveName(s, m.waveId)}`, label: <span title={m.description}>{milestoneLabel(s, m)}</span>, meta: [<span className="num strong" key="t">{timingLabel(s, m)}</span>] })) }));
  return { s, d, groups };
}

export function MatrixFilters({ phase, setPhase, wave, setWave, colGroup, setColGroup }: { phase: string; setPhase: (v: string) => void; wave: string; setWave: (v: string) => void; colGroup: string; setColGroup: (v: string) => void }) {
  const s = useApp((x) => x.current)!;
  const d = useMemo(() => derive(s), [s]);
  return (
    <>
      <div style={{ width: 170 }}><Select value={phase} placeholder="All phases" options={s.phases.map((p) => ({ value: p.id, label: `${p.num}. ${p.short}` }))} onChange={setPhase} /></div>
      {s.waves.length > 1 && <div style={{ width: 170 }}><Select value={wave} placeholder="All waves" options={[...s.waves.map((w) => ({ value: w.id, label: w.name })), { value: 'none', label: 'Engagement-wide' }]} onChange={setWave} /></div>}
      <div style={{ width: 200 }}><Select value={colGroup} placeholder="All stakeholder groups" options={groupStakeholders(s, d.selectedStakeholders).map((g) => ({ value: g.group.id, label: `${g.group.code}. ${g.group.name}` }))} onChange={setColGroup} /></div>
    </>
  );
}

export function AudienceMatrix() {
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const setView = useApp((x) => x.setView);
  const toast = useApp((x) => x.toast);
  const [phase, setPhase] = useState('');
  const [wave, setWave] = useState('');
  const [colGroup, setColGroup] = useState('');
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const { s, d, groups } = useMilestoneRows(phase, wave);
  const sugAdd = d.suggestions.filter((x) => x.kind === 'add');
  const sugRemove = d.suggestions.filter((x) => x.kind === 'remove');
  const neverGenerated = s.comms.length === 0;
  const sel = inspector?.kind === 'cell' ? { r: inspector.milestoneId, c: inspector.stakeholderId } : inspector?.kind === 'comm' ? (() => { const c = d.commById.get(inspector.commId); return c ? { r: c.rec.milestoneId, c: c.rec.audienceId } : null; })() : null;

  const onCell = (r: string, c: string, e: MouseEvent | KeyboardEvent) => {
    const me = e as MouseEvent;
    if (me.shiftKey || me.metaKey || me.ctrlKey) { const k = `${r}|${c}`; const n = new Set(multi); if (n.has(k)) n.delete(k); else n.add(k); setMulti(n); return; }
    setMulti(new Set());
    const cs = (d.commsByCell.get(`${r}|${c}`) ?? []).filter((x) => x.active);
    if (cs.length === 1) inspect({ kind: 'comm', commId: cs[0].rec.id, tab: 'audience' });
    else inspect({ kind: 'cell', milestoneId: r, stakeholderId: c });
  };

  const bulk = (action: 'include' | 'exclude' | 'confirm') => {
    const keys = [...multi];
    if (action === 'include') {
      const sugKeys = keys.map((k) => `add|${k}`).filter((k) => d.suggestions.some((x) => x.key === k));
      acceptSuggestions(sugKeys);
      for (const k of keys) {
        const [m, st] = k.split('|');
        if (!d.commsByCell.get(k)?.some((x) => x.active) && !sugKeys.includes(`add|${k}`)) addCommunication(m, st, { manualReason: 'Added by consultant via bulk edit.' });
      }
    } else if (action === 'exclude') {
      for (const k of keys) for (const c of d.commsByCell.get(k) ?? []) if (c.active) updateComm(c.rec.id, (x) => { x.status = 'cancelled'; }, 'Audience removed (bulk)');
    } else {
      const ids = keys.flatMap((k) => (d.commsByCell.get(k) ?? []).filter((c) => c.active && ['proposed', 'needs_review'].includes(c.rec.status)).map((c) => c.rec.id));
      const errs = bulkSetCommStatus(ids, 'confirmed');
      if (errs.length) toast(errs[0], 'warn');
    }
    toast(`Applied to ${keys.length} cell(s)`);
    setMulti(new Set());
  };

  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="Communication Audience Matrix"
        sub="Who needs to be communicated with at each selected milestone. Audiences are selected on impact, decision authority, sponsorship, execution, dependency, awareness, external relationship, and readiness — not on impact alone."
        actions={<Btn onClick={() => setView('deliverables')}>Export</Btn>} />
      {!d.activeMilestones.length ? <Empty title="No milestones selected" actions={<Btn variant="primary" onClick={() => setView('milestone-planner')}>Open Milestone Planner</Btn>}>Select GBS milestones to plan audiences.</Empty> : (
        <>
          {neverGenerated && d.audienceRecs.size > 0 && (
            <div className="banner info"><Sparkles size={16} /><div className="grow"><strong>{d.audienceRecs.size} audience recommendations are ready.</strong> Generate them to create communication records. Each record starts as “Rule proposed” and stays editable.</div>
              <Btn variant="primary" onClick={() => { const n = acceptSuggestions(d.suggestions.filter((x) => x.kind === 'add').map((x) => x.key)); toast(`${n} communication records created`); }}>Generate audience recommendations</Btn></div>
          )}
          {!neverGenerated && (sugAdd.length > 0 || sugRemove.length > 0) && (
            <div className="banner warn"><Sparkles size={16} /><div className="grow"><strong>Upstream inputs changed.</strong> {sugAdd.length} new audience recommendation(s) and {sugRemove.length} record(s) no longer recommended. Nothing changes until you accept.</div>
              <Btn onClick={() => setReviewOpen(true)}>Review changes</Btn></div>
          )}
          {multi.size > 0 && (
            <div className="banner info"><div className="grow">{multi.size} cell(s) selected — apply to the selected milestones and audiences:</div>
              <Btn size="sm" onClick={() => bulk('include')}>Include audience</Btn><Btn size="sm" onClick={() => bulk('confirm')}>Confirm</Btn><Btn size="sm" onClick={() => bulk('exclude')}>Remove audience</Btn>
              <Btn size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setMulti(new Set())}>Clear</Btn></div>
          )}
          <Matrix title="To be communicated with" subtitle="Click to inspect rationale · Shift/Ctrl-click to multi-select"
            cols={d.selectedStakeholders.map((x) => ({ id: x.id, label: x.roleName, group: x.groupId }))} colFilter={(c) => !colGroup || c.group === colGroup}
            groups={groups} rowHeader="Milestone / event" metaHeaders={['Timing']} metaWidths={[64]} rowHeadWidth={280} colWidth={78}
            selected={sel} multi={multi} onCell={onCell}
            toolbar={<MatrixFilters phase={phase} setPhase={setPhase} wave={wave} setWave={setWave} colGroup={colGroup} setColGroup={setColGroup} />}
            cell={(r, c) => {
              const cs = (d.commsByCell.get(`${r}|${c}`) ?? []).filter((x) => x.active);
              const sug = d.suggestions.find((x) => x.milestoneId === r && x.stakeholderId === c);
              if (!cs.length) return sug?.kind === 'add' ? { node: <div className="cell-inner"><span className="sym sug">?</span></div>, title: `Unresolved recommendation: ${sug.text}` } : { node: <div className="cell-inner" /> };
              const confirmed = cs.every((x) => !['proposed', 'needs_review'].includes(x.rec.status));
              const flag = cs.some((x) => x.upstreamChanged) || sug?.kind === 'remove';
              return {
                node: <div className="cell-inner"><span className={`sym ${confirmed ? 'yes' : 'rec'}`}>✓</span>{cs.length > 1 && <span className="tiny strong">{cs.length}</span>}
                  {cs.some((x) => x.rec.origin === 'consultant') && <span className="dot-override" />}{flag && <span className="dot-conflict" />}{cs.some((x) => x.sensitive) && <span className="dot-review" />}</div>,
                title: `${cs.map((x) => `${x.rec.code} · ${x.rec.status}`).join('; ')}${flag ? ' · upstream change — review' : ''}`,
              };
            }}
            legend={<>
              <span><span className="sym yes">✓</span> Confirmed</span><span><span className="sym rec">✓</span> Rule proposed</span><span><span className="sym sug">?</span> Unresolved recommendation</span><span>Blank — no communication planned</span>
              <span className="row"><span className="swatch" style={{ background: 'var(--ok)', borderRadius: 6 }} /> Added by consultant</span>
              <span className="row"><span className="swatch" style={{ background: 'var(--crit)', borderRadius: 6 }} /> Upstream change to review</span>
              <span className="row"><span className="swatch" style={{ background: 'var(--warn)', borderRadius: 6 }} /> Sensitive (HR-led)</span>
            </>} />
        </>
      )}
      {reviewOpen && <SuggestionReview onClose={() => setReviewOpen(false)} />}
    </>
  );
}

export function SuggestionReview({ onClose }: { onClose: () => void }) {
  const s = useApp((x) => x.current)!;
  const d = useMemo(() => derive(s), [s]);
  const toast = useApp((x) => x.toast);
  const [picked, setPicked] = useState<Set<string>>(new Set(d.suggestions.map((x) => x.key)));
  return (
    <Modal title={`Review downstream changes (${d.suggestions.length})`} wide onClose={onClose}
      footer={<>
        <Btn onClick={() => { dismissSuggestions([...picked]); toast(`${picked.size} suggestion(s) rejected`); onClose(); }} disabled={!picked.size}>Reject selected</Btn>
        <Btn variant="primary" icon={<Check size={14} />} disabled={!picked.size} onClick={() => { const n = acceptSuggestions([...picked]); toast(`${n} change(s) applied`); onClose(); }}>Accept selected</Btn>
      </>}>
      {!d.suggestions.length ? <Empty title="No pending changes" /> : (
        <div className="tbl-wrap" style={{ maxHeight: 480 }}><table className="tbl">
          <thead><tr><th><input type="checkbox" aria-label="Select all" checked={picked.size === d.suggestions.length} onChange={(e) => setPicked(e.target.checked ? new Set(d.suggestions.map((x) => x.key)) : new Set())} /></th><th>Change</th><th>Milestone</th><th>Audience</th><th>Reason</th></tr></thead>
          <tbody>{d.suggestions.map((x) => (
            <tr key={x.key}>
              <td><input type="checkbox" checked={picked.has(x.key)} onChange={() => { const n = new Set(picked); if (n.has(x.key)) n.delete(x.key); else n.add(x.key); setPicked(n); }} aria-label="Select suggestion" /></td>
              <td>{x.kind === 'add' ? <Badge tone="info">Add audience</Badge> : <Badge tone="warn">Cancel record</Badge>}</td>
              <td className="small">{s.milestones.find((m) => m.id === x.milestoneId)?.name}</td>
              <td className="small strong">{s.stakeholders.find((m) => m.id === x.stakeholderId)?.roleName}</td>
              <td className="small">{x.kind === 'add' ? d.audienceRecs.get(`${x.milestoneId}|${x.stakeholderId}`)?.reasons.map((r) => r.text).join(' ') : x.text}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>Rejected suggestions stay dismissed until the underlying recommendation changes again. Cancelled records are kept for audit, not deleted.</p>
    </Modal>
  );
}
