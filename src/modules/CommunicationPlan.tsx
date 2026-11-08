import { useMemo, useState } from 'react';
import { Plus, AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { useApp } from '../store/store';
import type { CommStatus, Objective } from '../domain/types';
import { COMM_STATUS_LABEL, OBJECTIVES } from '../domain/library';
import { fmtDate, includesCI } from '../domain/util';
import { derive, type CommView } from '../engine/derive';
import { roleShort } from '../engine/communicator';
import { milestoneLabel, timingLabel } from '../engine/matrixText';
import { waveName } from '../engine/timing';
import { addCommunication, bulkSetCommStatus } from '../store/actions';
import { Badge, Btn, Empty, Field, Modal, PageHeader, Section, Select, Seg } from '../ui/kit';
import { CommCalendar } from './MilestonePlanner';

const statusTone = (st: CommStatus) => (['approved', 'ready', 'completed'].includes(st) ? 'ok' : ['needs_review', 'pending_approval'].includes(st) ? 'warn' : ['cancelled', 'deferred'].includes(st) ? 'muted' : 'info') as 'ok' | 'warn' | 'muted' | 'info';

export function CommunicationPlan() {
  const s = useApp((x) => x.current)!;
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const setView = useApp((x) => x.setView);
  const toast = useApp((x) => x.toast);
  const d = useMemo(() => derive(s), [s]);
  const [mode, setMode] = useState<'table' | 'calendar'>('table');
  const [f, setF] = useState({ q: '', phase: '', audience: '', wave: '', owner: '', type: '', status: '', scope: 'active' });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<CommStatus | ''>('');
  const selId = inspector?.kind === 'comm' ? inspector.commId : null;

  const rows = (f.scope === 'active' ? d.activeComms : f.scope === 'inactive' ? d.comms.filter((c) => !c.active) : d.comms).filter((c) =>
    (!f.q || includesCI(`${c.rec.code} ${c.audience.roleName} ${c.milestone.name} ${c.brief.mainMessage}`, f.q)) && (!f.phase || c.milestone.phaseId === f.phase) &&
    (!f.audience || c.audience.id === f.audience) && (!f.wave || (f.wave === 'none' ? !c.milestone.waveId : c.milestone.waveId === f.wave)) &&
    (!f.owner || c.roles.owner === f.owner || c.roles.primary === f.owner) && (!f.type || c.rec.commTypeId === f.type) && (!f.status || c.rec.status === f.status))
    .sort((a, b) => (a.plannedDate ?? '9999') < (b.plannedDate ?? '9999') ? -1 : (a.plannedDate ?? '9999') > (b.plannedDate ?? '9999') ? 1 : a.rec.code.localeCompare(b.rec.code));
  const planIssues = d.issues.filter((i) => ['communication-plan', 'communicator-matrix', 'channel-matrix', 'artifact-studio', 'audience-matrix'].includes(i.view));
  const setFilter = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const flags = (c: CommView) => [
    !c.roles.primary && <Badge key="c" tone="crit">No communicator</Badge>,
    !c.roles.approvers.length && <Badge key="a" tone="warn">No approver</Badge>,
    c.disabledInUse.length > 0 && <Badge key="d" tone="crit">Disabled channel</Badge>,
    c.upstreamChanged && <Badge key="u" tone="warn">Upstream change</Badge>,
    c.rec.commTypeId === 'ct_sensitive' && !c.rec.hrReviewed && <Badge key="h" tone="warn">HR review</Badge>,
    (c.rolesOverridden || c.channelsOverridden || c.messageOverridden || c.rec.plannedDateOverride) && <Badge key="o" tone="ok">Override</Badge>,
    c.artifacts.some((a) => d.artifactStates.get(a.id)?.outdated) && <Badge key="art" tone="warn">Artifact outdated</Badge>,
  ].filter(Boolean);

  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="Master Communication Plan"
        sub="One record per communication — the same records that drive the Audience, Communicator, and Channel matrices. Creating an artifact is not the same as delivering the communication; nothing is sent from this application."
        actions={<><Seg options={[{ value: 'table', label: 'Table' }, { value: 'calendar', label: 'Calendar' }]} value={mode} onChange={setMode} /><Btn icon={<Plus size={13} />} onClick={() => setAdding(true)}>Add communication</Btn><Btn onClick={() => setView('deliverables')}>Export</Btn></>} />

      {planIssues.length > 0 && (
        <Section title="Plan warnings" hint={`${planIssues.filter((i) => i.severity === 'critical').length} critical · ${planIssues.filter((i) => i.severity === 'warning').length} warnings`} flush>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {planIssues.slice(0, 50).map((i) => (
              <div key={i.id} className="issue">
                {i.severity === 'critical' ? <AlertOctagon size={14} color="var(--crit)" /> : i.severity === 'warning' ? <AlertTriangle size={14} color="var(--warn)" /> : <Info size={14} color="var(--info)" />}
                <div className="grow small"><strong>{i.category}:</strong> {i.message}</div>
                {i.targetId && d.commById.has(i.targetId) && <Btn size="sm" onClick={() => inspect({ kind: 'comm', commId: i.targetId!, tab: 'plan' })}>Open</Btn>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {mode === 'calendar' ? <CommCalendar /> : !d.comms.length ? (
        <Empty title="No communication records yet" actions={<Btn variant="primary" onClick={() => setView('audience-matrix')}>Generate from the Audience Matrix</Btn>}>Communication records are created from audience recommendations or added manually.</Empty>
      ) : (
        <Section title="Communication records" hint={`${rows.length} shown`} flush>
          <div className="mx-toolbar">
            <input className="input" placeholder="Search…" value={f.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search plan" />
            <div style={{ width: 140 }}><Select value={f.phase} placeholder="All phases" options={s.phases.map((p) => ({ value: p.id, label: `${p.num}. ${p.short}` }))} onChange={(v) => setFilter('phase', v)} /></div>
            <div style={{ width: 190 }}><Select value={f.audience} placeholder="All audiences" options={d.selectedStakeholders.map((x) => ({ value: x.id, label: x.roleName }))} onChange={(v) => setFilter('audience', v)} /></div>
            {s.waves.length > 1 && <div style={{ width: 150 }}><Select value={f.wave} placeholder="All waves" options={[...s.waves.map((w) => ({ value: w.id, label: w.name })), { value: 'none', label: 'Engagement-wide' }]} onChange={(v) => setFilter('wave', v)} /></div>}
            <div style={{ width: 170 }}><Select value={f.owner} placeholder="All owners / communicators" options={s.communicatorRoles.map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => setFilter('owner', v)} /></div>
            <div style={{ width: 150 }}><Select value={f.type} placeholder="All types" options={s.commTypes.map((t) => ({ value: t.id, label: t.short }))} onChange={(v) => setFilter('type', v)} /></div>
            <div style={{ width: 150 }}><Select value={f.status} placeholder="All statuses" options={Object.entries(COMM_STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))} onChange={(v) => setFilter('status', v)} /></div>
            <div style={{ width: 150 }}><Select value={f.scope} options={[{ value: 'active', label: 'Active plan' }, { value: 'inactive', label: 'Inactive / cancelled' }, { value: 'all', label: 'All records' }]} onChange={(v) => setFilter('scope', v)} /></div>
          </div>
          {picked.size > 0 && (
            <div className="banner info" style={{ margin: 10 }}><div className="grow">{picked.size} selected</div>
              <div style={{ width: 200 }}><Select value={bulkStatus} placeholder="Set status…" options={Object.entries(COMM_STATUS_LABEL).map(([k, v]) => ({ value: k as CommStatus, label: v }))} onChange={setBulkStatus} /></div>
              <Btn size="sm" disabled={!bulkStatus} onClick={() => { const errs = bulkSetCommStatus([...picked], bulkStatus as CommStatus); toast(errs.length ? `${picked.size - errs.length} updated; ${errs.length} blocked: ${errs[0]}` : `${picked.size} updated`, errs.length ? 'warn' : 'ok'); setPicked(new Set()); }}>Apply</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Btn></div>
          )}
          <div className="mx-scroll">
            <table className="tbl">
              <thead><tr>
                <th><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && picked.size === rows.length} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.rec.id)) : new Set())} /></th>
                <th>ID</th><th>Planned</th><th>Milestone</th><th>Timing</th><th>Audience</th><th>Objective</th><th>Type</th><th>Communicator</th><th>Owner</th><th>Approver</th><th>Channel(s)</th><th>Artifact</th><th>Status</th><th>Flags</th>
              </tr></thead>
              <tbody>{rows.map((c) => (
                <tr key={c.rec.id} className={`clickable ${selId === c.rec.id ? 'sel' : ''}`} onClick={() => inspect({ kind: 'comm', commId: c.rec.id, tab: 'plan' })}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(c.rec.id)} aria-label={`Select ${c.rec.code}`} onChange={() => { const n = new Set(picked); if (n.has(c.rec.id)) n.delete(c.rec.id); else n.add(c.rec.id); setPicked(n); }} /></td>
                  <td className="mono">{c.rec.code}</td>
                  <td className="num small" style={{ whiteSpace: 'nowrap' }}>{c.milestone.kind === 'recurring' ? <Badge tone="info">{c.milestone.recurrence?.cadence}</Badge> : c.plannedDate ? fmtDate(c.plannedDate) : '—'}</td>
                  <td className="small" style={{ minWidth: 180 }}>{milestoneLabel(s, c.milestone)}<div className="tiny muted">{waveName(s, c.milestone.waveId)}</div></td>
                  <td className="num small strong">{timingLabel(s, c.milestone)}</td>
                  <td className="small strong" style={{ minWidth: 150 }}>{c.audience.roleName}</td>
                  <td className="small">{OBJECTIVES[c.rec.objective]}</td>
                  <td className="small">{s.commTypes.find((t) => t.id === c.rec.commTypeId)?.short}</td>
                  <td className="small">{c.roles.primary ? roleShort(s, c.roles.primary) : <span style={{ color: 'var(--crit)' }}>Review</span>}</td>
                  <td className="small">{roleShort(s, c.roles.owner) || '—'}</td>
                  <td className="small">{c.roles.approvers.map((r) => roleShort(s, r)).join(', ') || '—'}</td>
                  <td className="small" style={{ minWidth: 150 }}>{[c.channels.primary, ...c.channels.secondary].filter(Boolean).map((id) => s.channels.find((x) => x.id === id)?.name).join(', ') || '—'}</td>
                  <td className="small">{c.artifacts.map((a) => a.code).join(', ') || <span className="muted">—</span>}</td>
                  <td><Badge tone={statusTone(c.rec.status)}>{COMM_STATUS_LABEL[c.rec.status]}</Badge></td>
                  <td><div className="chips">{flags(c)}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      )}
      {adding && <AddCommModal onClose={() => setAdding(false)} />}
    </>
  );
}

function AddCommModal({ onClose }: { onClose: () => void }) {
  const s = useApp((x) => x.current)!;
  const inspect = useApp((x) => x.inspect);
  const toast = useApp((x) => x.toast);
  const d = useMemo(() => derive(s), [s]);
  const [m, setM] = useState(d.activeMilestones[0]?.id ?? '');
  const [a, setA] = useState(d.selectedStakeholders[0]?.id ?? '');
  const [obj, setObj] = useState<Objective>('inform');
  const [ct, setCt] = useState('ct_awareness');
  const [reason, setReason] = useState('');
  return (
    <Modal title="Add communication event" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!m || !a} onClick={() => {
      const id = addCommunication(m, a, { objective: obj, commTypeId: ct, manualReason: reason || 'Added by consultant.', status: ct === 'ct_sensitive' ? 'needs_review' : 'confirmed', priority: ct === 'ct_sensitive' ? 'high' : 'medium' });
      toast('Communication added'); onClose(); inspect({ kind: 'comm', commId: id, tab: 'plan' });
    }}>Add</Btn></>}>
      <div className="stack">
        <Field label="Milestone, recurrence, or scenario trigger"><Select value={m} options={d.activeMilestones.map((x) => ({ value: x.id, label: milestoneLabel(s, x) }))} onChange={setM} /></Field>
        <Field label="Audience"><Select value={a} options={d.selectedStakeholders.map((x) => ({ value: x.id, label: x.roleName }))} onChange={setA} /></Field>
        <div className="grid g2">
          <Field label="Objective"><Select value={obj} options={Object.entries(OBJECTIVES).map(([k, v]) => ({ value: k as Objective, label: v }))} onChange={setObj} /></Field>
          <Field label="Communication type"><Select value={ct} options={s.commTypes.map((t) => ({ value: t.id, label: t.name }))} onChange={setCt} /></Field>
        </div>
        <Field label="Reason selected"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="small muted">Communicator, channels, and messaging are recommended automatically from the rules and can be overridden in the inspector.</p>
      </div>
    </Modal>
  );
}
