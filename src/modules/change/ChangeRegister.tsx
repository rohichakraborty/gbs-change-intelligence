import { useMemo, useState } from 'react';
import { Plus, Copy, Trash2, RotateCcw, Download, ArrowUpCircle } from 'lucide-react';
import { useApp } from '../../store/store';
import type { RecordStatus } from '../../domain/types';
import { includesCI, slug } from '../../domain/util';
import { derive } from '../../engine/derive';
import { waveName } from '../../engine/timing';
import { getTemplate } from '../../catalogue/registry';
import { duplicateCandidates } from '../../catalogue/instance';
import { FUNCTION_SHORT } from '../../catalogue/types';
import { addCustomChange, duplicateChange, setChangesActive, updateChanges, upgradeTemplateVersion } from '../../store/changeActions';
import { buildXlsx } from '../../services/office';
import { saveFile } from '../../services/download';
import { Badge, Btn, Empty, Section, Select, useConfirm } from '../../ui/kit';
import { BulkScopeModal } from './BulkScopeModal';

export function ChangeRegister() {
  const s = useApp((x) => x.current)!;
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const toast = useApp((x) => x.toast);
  const d = useMemo(() => derive(s), [s]);
  const [f, setF] = useState({ q: '', dim: '', fn: '', source: '', status: '', wave: '', scope: 'active' });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const [newDim, setNewDim] = useState('dim_om');
  const { ask, node } = useConfirm();
  const selId = inspector?.kind === 'change' ? inspector.changeId : null;
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  const rows = s.changes.filter((c) => (f.scope === 'active' ? c.active : f.scope === 'removed' ? !c.active : true)
    && (!f.q || includesCI(`${c.code} ${c.title} ${c.description} ${c.process} ${c.templateId ?? ''}`, f.q)) && (!f.dim || c.dimensionId === f.dim)
    && (!f.fn || (f.fn === '__all' ? !c.functionTags.length : c.functionTags.includes(f.fn))) && (!f.source || c.source === f.source)
    && (!f.status || c.status === f.status) && (!f.wave || (f.wave === '__all' ? !c.waveIds.length : c.waveIds.includes(f.wave))))
    .sort((a, b) => a.dimensionId.localeCompare(b.dimensionId) || a.code.localeCompare(b.code));
  const ids = [...picked].filter((id) => rows.some((r) => r.id === id));
  const pending = (cid: string) => d.clarificationQueue.filter((x) => x.changeIds.includes(cid));

  return (
    <>
      <Section flush title="Change Register" hint={`${s.changes.filter((c) => c.active).length} active · ${s.changes.filter((c) => c.active && c.source === 'template').length} from the library · ${s.changes.filter((c) => c.active && c.source === 'custom').length} custom · ${s.changes.filter((c) => !c.active).length} removed`}
        actions={<>
          <Btn size="sm" icon={<Download size={13} />} onClick={async () => { const r = await saveFile(`${slug(s.engagement.name)}_change-register_${new Date().toISOString().slice(0, 10)}.xlsx`, await buildXlsx(s, 'changes')); toast(r.message, r.ok ? 'ok' : 'warn'); }}>Export</Btn>
          <select className="select" style={{ width: 150 }} value={newDim} onChange={(e) => setNewDim(e.target.value)} aria-label="Dimension for custom change">{s.dimensions.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}</select>
          <Btn size="sm" icon={<Plus size={13} />} onClick={() => { const id = addCustomChange(newDim); inspect({ kind: 'change', changeId: id }); }}>Add custom change</Btn>
        </>}>
        <div className="mx-toolbar">
          <input className="input" placeholder="Search register…" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Search register" />
          <Select value={f.dim} placeholder="All dimensions" options={s.dimensions.map((x) => ({ value: x.id, label: x.short }))} onChange={(v) => set('dim', v)} />
          <Select value={f.fn} placeholder="All functions" options={[{ value: '__all', label: 'Cross-functional' }, ...s.engagement.functions.map((x) => ({ value: x.name, label: x.name }))]} onChange={(v) => set('fn', v)} />
          <Select value={f.source} placeholder="Library and custom" options={[{ value: 'template', label: 'From library' }, { value: 'custom', label: 'Custom' }]} onChange={(v) => set('source', v)} />
          <Select value={f.status} placeholder="All statuses" options={[{ value: 'draft', label: 'Draft' }, { value: 'needs_review', label: 'Needs review' }, { value: 'confirmed', label: 'Confirmed' }]} onChange={(v) => set('status', v)} />
          {s.waves.length > 1 && <Select value={f.wave} placeholder="All waves" options={[{ value: '__all', label: 'All-wave changes' }, ...s.waves.map((w) => ({ value: w.id, label: w.name }))]} onChange={(v) => set('wave', v)} />}
          <Select value={f.scope} options={[{ value: 'active', label: 'In scope' }, { value: 'removed', label: 'Removed from scope' }, { value: 'all', label: 'All records' }]} onChange={(v) => set('scope', v)} />
        </div>
        {ids.length > 0 && (
          <div className="banner info" style={{ margin: 10 }}><div className="grow">{ids.length} change(s) selected</div>
            <Btn size="sm" onClick={() => setBulk(true)}>Assign scope / wave</Btn>
            <select className="select" style={{ width: 150 }} value="" onChange={(e) => { if (e.target.value) { updateChanges(ids, { status: e.target.value as RecordStatus }, `Status → ${e.target.value} (${ids.length})`); toast(`${ids.length} updated`); } }} aria-label="Set status">
              <option value="">Set status…</option><option value="draft">Draft</option><option value="needs_review">Needs review</option><option value="confirmed">Confirmed</option>
            </select>
            <Btn size="sm" onClick={() => { updateChanges(ids, { defaultsReviewed: true }, `Library defaults reviewed (${ids.length})`); toast('Marked as reviewed'); }}>Mark descriptions reviewed</Btn>
            {ids.some((id) => d.templateUpdates.includes(id)) && <Btn size="sm" icon={<ArrowUpCircle size={13} />} onClick={() => upgradeTemplateVersion(ids.filter((id) => d.templateUpdates.includes(id)))}>Update template version</Btn>}
            {f.scope !== 'removed' && <Btn size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={async () => { if (await ask('Remove from scope', `${ids.length} change(s) will be removed from scope. They stay in the register (filter "Removed from scope") with their answers and decisions; downstream recommendations are recalculated and reviewed work is flagged, not deleted.`, 'Remove', true)) { setChangesActive(ids, false); setPicked(new Set()); } }}>Remove</Btn>}
            {f.scope !== 'active' && <Btn size="sm" icon={<RotateCcw size={13} />} onClick={() => { setChangesActive(ids, true); setPicked(new Set()); }}>Restore</Btn>}
            <Btn size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Btn>
          </div>
        )}
        {!rows.length ? <Empty title="No changes match">Select changes in the Change Library tab, or add a custom change.</Empty> : (
          <div className="mx-scroll"><table className="tbl">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && rows.every((r) => picked.has(r.id))} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th>ID</th><th>Change</th><th>Dim</th><th>Functions</th><th>Waves</th><th>Source</th><th>Clarifications</th><th>Status</th><th />
            </tr></thead>
            <tbody>{rows.map((c) => {
              const tpl = c.source === 'template' ? getTemplate(c.templateId, c.templateVersion, s) : undefined;
              const pq = pending(c.id);
              const dups = c.active ? duplicateCandidates(s, c) : [];
              return (
                <tr key={c.id} className={`clickable ${selId === c.id ? 'sel' : ''}`} style={{ opacity: c.active ? 1 : 0.55 }} onClick={() => inspect({ kind: 'change', changeId: c.id })}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(c.id)} aria-label={`Select ${c.code}`} onChange={() => { const n = new Set(picked); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setPicked(n); }} /></td>
                  <td className="mono">{c.code}</td>
                  <td style={{ minWidth: 260 }}><div className="strong">{c.title}</div><div className="small muted" style={{ maxWidth: 460 }}>{c.customDescription || c.description}</div>
                    {dups.length > 0 && <Badge tone="warn" title={dups.map((x) => `${x.code} ${x.title}`).join('; ')}>Possible duplicate of {dups.map((x) => x.code).join(', ')}</Badge>}</td>
                  <td><span className="tag dim">{s.dimensions.find((x) => x.id === c.dimensionId)?.code}</span></td>
                  <td className="small">{c.functionTags.length ? c.functionTags.map((x) => FUNCTION_SHORT[x] ?? x).join(', ') : 'All in-scope'}</td>
                  <td className="small">{c.waveIds.map((w) => waveName(s, w)).join(', ') || 'All'}</td>
                  <td className="small">{c.source === 'template' ? <><Badge tone="info">Library</Badge><div className="tiny muted mono">{c.templateId} v{c.templateVersion}{d.templateUpdates.includes(c.id) ? ' · update available' : ''}</div></> : <Badge tone="ai">Custom</Badge>}</td>
                  <td className="small">{tpl ? (pq.length ? <Badge tone={pq.some((x) => x.impactCritical) ? 'warn' : 'muted'}>{pq.length} open</Badge> : tpl.clarificationQuestions.length ? <Badge tone="ok">answered</Badge> : <span className="muted">none</span>) : '—'}</td>
                  <td><Badge tone={c.status === 'confirmed' ? 'ok' : c.status === 'needs_review' ? 'warn' : 'info'}>{c.status.replace('_', ' ')}</Badge>{c.source === 'template' && !c.defaultsReviewed && <div className="tiny muted">library defaults</div>}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <Btn size="sm" variant="ghost" icon={<Copy size={13} />} title="Duplicate as a custom change" aria-label="Duplicate" onClick={() => { const id = duplicateChange(c.id); inspect({ kind: 'change', changeId: id }); }} />
                    {c.active ? <Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} title="Remove from scope" aria-label="Remove" onClick={() => setChangesActive([c.id], false)} />
                      : <Btn size="sm" variant="ghost" icon={<RotateCcw size={13} />} title="Restore" aria-label="Restore" onClick={() => setChangesActive([c.id], true)} />}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Section>
      {bulk && <BulkScopeModal changeIds={ids} onClose={() => setBulk(false)} />}
      {node}
    </>
  );
}
