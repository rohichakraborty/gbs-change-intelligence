import { useMemo, useState } from 'react';
import { Plus, Copy, Trash2 } from 'lucide-react';
import { useApp } from '../store/store';
import type { ChangeRecord, EngagementState } from '../domain/types';
import { uid } from '../domain/util';
import { derive } from '../engine/derive';
import { assessPair, changeFeatures } from '../engine/impact';
import { Badge, Btn, Empty, PageHeader, Prov, Section, useConfirm, TextIn } from '../ui/kit';
import { waveName } from '../engine/timing';

export function newChange(s: EngagementState, dimensionId: string): ChangeRecord {
  const n = s.counters.change + 1;
  return {
    id: uid('chg'), code: `CHG-${String(Math.max(n, s.changes.length + 1)).padStart(3, '0')}`, dimensionId, title: 'New change', description: '', asIs: '', toBe: '', notChanging: '',
    rationale: '', functionName: '', geography: '', process: '', effectiveDate: null, milestoneId: null, waveIds: [], peopleAffected: null, owner: '',
    operationalImpact: '', behaviouralImpact: '', dependencies: '', assumptions: '', evidence: '', status: 'draft',
  };
}

const DIM_MILESTONES: Record<string, string[]> = {
  OM: ['fom', 'golive', 'enterprise_golive'], PR: ['tobe', 'employee_training', 'process_readiness'], OS: ['org_final', 'transfer_plan', 'impacted_comms'],
  TE: ['tech_req', 'access', 'employee_training', 'system_readiness'], IM: ['external_notify', 'golive', 'hypercare_start'],
};

/** Change-identification intelligence: suggestions, clearly separated from confirmed facts. */
export function changeSuggestions(s: EngagementState, c: ChangeRecord) {
  const dim = s.dimensions.find((d) => d.id === c.dimensionId);
  const ft = changeFeatures(c);
  const gaps: string[] = [];
  if (!c.asIs.trim()) gaps.push('As-Is state not documented');
  if (!c.toBe.trim()) gaps.push('To-Be state not documented');
  if (!c.rationale.trim()) gaps.push('Business rationale missing (artifacts will show a placeholder)');
  if (!c.notChanging.trim()) gaps.push('"What is not changing" not stated');
  if (!c.functionName) gaps.push('Function impacted not specified — scope matching treats it as cross-functional');
  if (!c.effectiveDate) gaps.push('Expected effective date missing');
  if (!c.waveIds.length && s.waves.length > 1) gaps.push('Transition wave not associated');
  if (!c.owner) gaps.push('Change owner not named');
  const related: string[] = [];
  if (ft.transfer || ft.reporting) related.push('Organization Structure');
  if (ft.system) related.push('Technology');
  if (ft.helpdesk) related.push('Interaction Model');
  if (ft.approval) related.push('Process');
  const relDims = related.filter((r) => !dim?.short.startsWith(r.split(' ')[0]));
  const impacted: { name: string; directness: string; selected: boolean }[] = [];
  if (dim?.isDefault) {
    for (const st of s.stakeholders) {
      const r = assessPair(st, c, dim.code);
      if (r.hit === 'direct' || r.hit === 'indirect') impacted.push({ name: st.roleName, directness: r.hit, selected: st.selected });
    }
  }
  const milestones = (DIM_MILESTONES[dim?.code ?? ''] ?? []).map((k) => s.milestones.find((m) => m.libraryKey === k)).filter(Boolean).map((m) => m!.name);
  return { gaps, relDims, impacted, milestones, deps: ft.transfer ? ['HR transfer planning and Legal review per jurisdiction'] : ft.system ? ['System access and training readiness'] : [] };
}

export function ChangeIdentification() {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const d = useMemo(() => derive(s), [s]);
  const [newDim, setNewDim] = useState('');
  const { ask, node } = useConfirm();
  const selectedId = inspector?.kind === 'change' ? inspector.changeId : null;

  const add = (dimensionId: string) => {
    const c = newChange(s, dimensionId);
    mutate((dd) => { dd.counters.change = Math.max(dd.counters.change + 1, dd.changes.length + 1); dd.changes.push(c); }, { entityType: 'change', entityId: c.id, action: 'add', summary: `${c.code} created` });
    inspect({ kind: 'change', changeId: c.id });
  };

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Change Identification" title="Change Identification"
        sub="Select the change dimensions in play, then record each specific change. Assessments and communications use these descriptions directly." />
      <Section title="Change dimensions" hint="The five default dimensions are always available; custom dimensions have no default rules and require consultant assessment.">
        <div className="chips">
          {s.dimensions.map((dim) => {
            const on = s.engagement.selectedDimensionIds.includes(dim.id);
            return (
              <button key={dim.id} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} title={dim.description}
                onClick={() => mutate((dd) => { dd.engagement.selectedDimensionIds = on ? dd.engagement.selectedDimensionIds.filter((x) => x !== dim.id) : [...dd.engagement.selectedDimensionIds, dim.id]; },
                  { entityType: 'dimension', entityId: dim.id, action: on ? 'deselect' : 'select', summary: `${dim.label} ${on ? 'deselected' : 'selected'}` })}>
                {on ? '✓ ' : ''}{dim.label}{!dim.isDefault && ' (custom)'} <span className="muted">· {s.changes.filter((c) => c.dimensionId === dim.id).length}</span>
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 12, maxWidth: 520 }}>
          <input className="input" style={{ flex: 1 }} placeholder="Add a custom change dimension" value={newDim} onChange={(e) => setNewDim(e.target.value)} aria-label="Custom dimension name" />
          <Btn icon={<Plus size={13} />} disabled={!newDim.trim()} onClick={() => {
            const id = uid('dim');
            mutate((dd) => { dd.dimensions.push({ id, code: 'CUSTOM', short: newDim.trim(), label: newDim.trim(), description: 'Custom dimension', isDefault: false }); dd.engagement.selectedDimensionIds.push(id); },
              { entityType: 'dimension', entityId: id, action: 'add', summary: `Custom dimension "${newDim.trim()}" added` });
            setNewDim('');
          }}>Add dimension</Btn>
        </div>
      </Section>

      {d.selectedDims.length === 0 && <Empty title="No change dimensions selected">Select at least one dimension above to record changes.</Empty>}
      {d.selectedDims.map((dim) => {
        const rows = s.changes.filter((c) => c.dimensionId === dim.id);
        return (
          <Section key={dim.id} title={dim.label} hint={dim.description} flush actions={<Btn size="sm" icon={<Plus size={13} />} onClick={() => add(dim.id)}>Add change</Btn>}>
            {rows.length === 0 ? <Empty title="No changes recorded">Without change records, impact cells for this dimension show “? Requires review”.</Empty> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>ID</th><th>Change</th><th>As-Is → To-Be</th><th>Function</th><th>Wave</th><th>Effective</th><th>Gaps</th><th>Status</th><th /></tr></thead>
                  <tbody>{rows.map((c) => {
                    const sg = changeSuggestions(s, c);
                    return (
                      <tr key={c.id} className={`clickable ${selectedId === c.id ? 'sel' : ''}`} onClick={() => inspect({ kind: 'change', changeId: c.id })}>
                        <td className="mono">{c.code}</td>
                        <td style={{ minWidth: 220 }}><div className="strong">{c.title}</div><div className="small muted">{c.process}</div></td>
                        <td style={{ minWidth: 280 }} className="small"><div><span className="muted">As-Is:</span> {c.asIs || <span className="ph">[CONFIRM AS-IS]</span>}</div><div><span className="muted">To-Be:</span> {c.toBe || <span className="ph">[CONFIRM TO-BE]</span>}</div></td>
                        <td className="small">{c.functionName || '—'}</td>
                        <td className="small">{c.waveIds.map((w) => waveName(s, w)).join(', ') || '—'}</td>
                        <td className="small num">{c.effectiveDate ?? '—'}</td>
                        <td>{sg.gaps.length ? <Badge tone="warn">{sg.gaps.length}</Badge> : <Badge tone="ok">0</Badge>}</td>
                        <td><Badge tone={c.status === 'confirmed' ? 'ok' : c.status === 'needs_review' ? 'warn' : 'info'}>{c.status.replace('_', ' ')}</Badge></td>
                        <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                          <Btn size="sm" variant="ghost" icon={<Copy size={13} />} title="Duplicate" aria-label="Duplicate change" onClick={() => {
                            const copy = { ...c, id: uid('chg'), code: `CHG-${String(s.counters.change + 1).padStart(3, '0')}`, title: `${c.title} (copy)`, status: 'draft' as const };
                            mutate((dd) => { dd.counters.change += 1; dd.changes.push(copy); }, { entityType: 'change', entityId: copy.id, action: 'duplicate', summary: `${c.code} duplicated` });
                          }} />
                          <Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} title="Delete" aria-label="Delete change" onClick={async () => {
                            if (await ask(`Delete ${c.code}`, 'Impact recommendations and linked communications will be re-evaluated. Communications previously confirmed will be flagged for review, not deleted.', 'Delete change', true)) {
                              mutate((dd) => { dd.changes = dd.changes.filter((x) => x.id !== c.id); dd.comms.forEach((m) => { if (m.changeIdsOverride) m.changeIdsOverride = m.changeIdsOverride.filter((x) => x !== c.id); }); }, { entityType: 'change', entityId: c.id, action: 'delete', summary: `${c.code} deleted` });
                              inspect(null);
                            }
                          }} />
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </Section>
        );
      })}

      {s.changes.length > 0 && (
        <Section title="Change identification intelligence" hint={<><Prov kind="rule" /> Suggestions only — not confirmed engagement facts.</>}>
          <div className="grid g2">
            {s.changes.slice(0, 12).map((c) => {
              const sg = changeSuggestions(s, c);
              return (
                <div key={c.id} className="insp-block rec">
                  <div className="row" style={{ marginBottom: 6 }}><span className="mono">{c.code}</span><span className="strong small">{c.title}</span></div>
                  <div className="small"><span className="muted">Possibly impacted:</span> {sg.impacted.length ? sg.impacted.slice(0, 8).map((x) => `${x.name}${x.selected ? '' : ' (not selected)'}`).join('; ') : 'No library stakeholders match the rules for this change.'}</div>
                  {sg.relDims.length > 0 && <div className="small"><span className="muted">Related dimensions:</span> {sg.relDims.join(', ')}</div>}
                  {sg.milestones.length > 0 && <div className="small"><span className="muted">Relevant milestones:</span> {sg.milestones.join(', ')}</div>}
                  {sg.deps.length > 0 && <div className="small"><span className="muted">Potential dependencies:</span> {sg.deps.join(', ')}</div>}
                  {sg.gaps.length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>Information gaps: {sg.gaps.join('; ')}</div>}
                </div>
              );
            })}
          </div>
        </Section>
      )}
      {node}
    </>
  );
}

export function ChangeEditor({ id }: { id: string }) {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const c = s.changes.find((x) => x.id === id);
  if (!c) return <Empty title="Change not found" />;
  const set = <K extends keyof ChangeRecord>(k: K, v: ChangeRecord[K]) => mutate((d) => { (d.changes.find((x) => x.id === id)! as ChangeRecord)[k] = v; }, { entityType: 'change', entityId: id, action: 'update', summary: `${c.code} ${String(k)} updated` });
  const sg = changeSuggestions(s, c);
  const F = ({ k, label, multi }: { k: keyof ChangeRecord; label: string; multi?: boolean }) => (
    <div className="field"><label>{label}</label><TextIn multiline={multi} rows={2} value={String(c[k] ?? '')} onCommit={(v) => set(k, v as never)} /></div>
  );
  return (
    <div className="stack">
      <div className="row"><Prov kind="fact" label="Engagement fact" /><span className="small muted">Edits apply everywhere this change is used.</span></div>
      {F({ k: 'title', label: 'Change title' })}
      <div className="grid g2">
        <div className="field"><label>Dimension</label><select className="select" value={c.dimensionId} onChange={(e) => set('dimensionId', e.target.value)}>{s.dimensions.map((d) => <option key={d.id} value={d.id}>{d.short}</option>)}</select></div>
        <div className="field"><label>Review status</label><select className="select" value={c.status} onChange={(e) => set('status', e.target.value as ChangeRecord['status'])}><option value="draft">Draft</option><option value="needs_review">Needs review</option><option value="confirmed">Confirmed</option></select></div>
      </div>
      {F({ k: 'description', label: 'Description', multi: true })}
      {F({ k: 'asIs', label: 'As-Is state', multi: true })}
      {F({ k: 'toBe', label: 'To-Be state', multi: true })}
      {F({ k: 'notChanging', label: 'What is not changing', multi: true })}
      {F({ k: 'rationale', label: 'Business rationale', multi: true })}
      <div className="grid g2">
        <div className="field"><label>Function impacted</label><select className="select" value={c.functionName} onChange={(e) => set('functionName', e.target.value)}><option value="">Cross-functional</option>{s.engagement.functions.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}</select></div>
        {F({ k: 'geography', label: 'Geography / entity' })}
        {F({ k: 'process', label: 'Process / service' })}
        <div className="field"><label>Expected effective date</label><TextIn type="date" value={c.effectiveDate ?? ''} onCommit={(v) => set('effectiveDate', v || null)} /></div>
        <div className="field"><label>Associated milestone</label><select className="select" value={c.milestoneId ?? ''} onChange={(e) => set('milestoneId', e.target.value || null)}><option value="">—</option>{s.milestones.filter((m) => m.selected).map((m) => <option key={m.id} value={m.id}>{m.name}{m.waveId ? ` (${waveName(s, m.waveId)})` : ''}</option>)}</select></div>
        <div className="field"><label>People potentially affected</label><TextIn type="number" value={c.peopleAffected === null ? '' : String(c.peopleAffected)} onCommit={(v) => set('peopleAffected', v === '' ? null : Number(v))} /></div>
        {F({ k: 'owner', label: 'Change owner' })}
      </div>
      <div className="field"><label>Transition wave(s)</label>
        <div className="chips">{s.waves.map((w) => { const on = c.waveIds.includes(w.id); return <button key={w.id} className={`chip ${on ? 'on' : ''}`} onClick={() => set('waveIds', on ? c.waveIds.filter((x) => x !== w.id) : [...c.waveIds, w.id])}>{w.name}</button>; })}</div>
      </div>
      {F({ k: 'operationalImpact', label: 'Expected operational impact', multi: true })}
      {F({ k: 'behaviouralImpact', label: 'Expected behavioural impact', multi: true })}
      {F({ k: 'dependencies', label: 'Dependencies', multi: true })}
      {F({ k: 'assumptions', label: 'Assumptions', multi: true })}
      {F({ k: 'evidence', label: 'Evidence / source', multi: true })}
      <div className="insp-block rec">
        <h4>Rule suggestions <Prov kind="rule" label="Suggestion" /></h4>
        <div className="small"><strong>Possibly impacted:</strong> {sg.impacted.map((x) => `${x.name} (${x.directness}${x.selected ? '' : ', not selected'})`).join('; ') || 'None'}</div>
        {sg.relDims.length > 0 && <div className="small"><strong>Related dimensions:</strong> {sg.relDims.join(', ')}</div>}
      </div>
      {sg.gaps.length > 0 && <div className="insp-block gap"><h4>Information gaps</h4><ul className="clean small">{sg.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>}
    </div>
  );
}
