import { memo, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Info, Search, CheckSquare, Square, ListChecks, HelpCircle, Layers } from 'lucide-react';
import { useApp } from '../../store/store';
import type { ChangeRecord } from '../../domain/types';
import { listLatestTemplates } from '../../catalogue/registry';
import { CATALOGUE_FUNCTIONS, DIM_ID, FUNCTION_SHORT, type ChangeTemplate, type DimCode } from '../../catalogue/types';
import { setTemplatesSelected, updateChanges } from '../../store/changeActions';
import { derive } from '../../engine/derive';
import { Badge, Btn, Empty, Section, Select, useConfirm } from '../../ui/kit';
import { BulkScopeModal } from './BulkScopeModal';

export const DIM_LABEL: Record<DimCode, string> = { OM: 'Operating Model', PR: 'Process', OS: 'Organization Structure', TE: 'Technology', IM: 'Interaction Model' };
const DIMS: DimCode[] = ['OM', 'PR', 'OS', 'TE', 'IM'];

export function useSelection() {
  const s = useApp((x) => x.current)!;
  useApp((x) => x.catalogueRev);
  const templates = listLatestTemplates();
  const byTemplate = useMemo(() => {
    const m = new Map<string, ChangeRecord>();
    for (const c of s.changes) if (c.templateId && c.active) m.set(c.templateId, c);
    return m;
  }, [s.changes]);
  return { s, templates, byTemplate };
}

export function functionOrder(engFns: string[]): string[] {
  const all = [...CATALOGUE_FUNCTIONS] as string[];
  for (const f of engFns) if (!all.includes(f)) all.push(f);
  return ['Enterprise', ...all.filter((f) => f !== 'Enterprise' && engFns.includes(f)), ...all.filter((f) => f !== 'Enterprise' && !engFns.includes(f))];
}

export function ChangeLibrary({ onReview, onClarify }: { onReview: () => void; onClarify: () => void }) {
  const { s, templates, byTemplate } = useSelection();
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const toast = useApp((x) => x.toast);
  const d = useMemo(() => derive(s), [s]);
  const engFns = s.engagement.functions.map((f) => f.name);
  const [dim, setDim] = useState<DimCode | ''>('');
  const [fn, setFn] = useState<string>('scope');
  const [proc, setProc] = useState('');
  const [selState, setSelState] = useState<'all' | 'selected' | 'unselected'>('all');
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<string[] | null>(null);
  const { ask, node } = useConfirm();
  const focusId = inspector?.kind === 'template' ? inspector.templateId : null;

  const inFn = (t: ChangeTemplate, f: string) => f === 'all' ? true : f === 'scope' ? t.functionTags.includes('Enterprise') || t.functionTags.some((x) => engFns.includes(x)) : t.functionTags.includes(f);
  const visible = templates.filter((t) => (t.active || byTemplate.has(t.templateId)) && (!dim || t.primaryChangeDimension === dim) && inFn(t, fn)
    && (!proc || t.processTags.includes(proc)) && (selState === 'all' || (selState === 'selected') === byTemplate.has(t.templateId))
    && (!q.trim() || `${t.title} ${t.description} ${t.processTags.join(' ')} ${t.templateId}`.toLowerCase().includes(q.trim().toLowerCase())));
  const processes = Array.from(new Set(templates.filter((t) => (!dim || t.primaryChangeDimension === dim) && inFn(t, fn)).flatMap((t) => t.processTags))).sort();

  // Group: by function (or by process when one function is chosen).
  const groupKey = (t: ChangeTemplate) => (fn !== 'all' && fn !== 'scope' ? t.processTags[0] ?? 'General' : t.functionTags[0] === 'Enterprise' ? 'Enterprise' : t.functionTags.find((f) => engFns.includes(f)) ?? t.functionTags[0]);
  const groups = new Map<string, ChangeTemplate[]>();
  for (const t of visible) { const k = groupKey(t); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(t); }
  const order = functionOrder(engFns);
  const groupList = [...groups.entries()].sort((a, b) => (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) - (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0])) || a[0].localeCompare(b[0]));
  for (const [, list] of groupList) list.sort((a, b) => DIMS.indexOf(a.primaryChangeDimension) - DIMS.indexOf(b.primaryChangeDimension) || a.templateId.localeCompare(b.templateId));

  const selectedTemplates = templates.filter((t) => byTemplate.has(t.templateId));
  const activeChanges = s.changes.filter((c) => c.active);
  const toggle = (ids: string[], on: boolean) => {
    const r = setTemplatesSelected(ids, on);
    if (on && r.added + r.reactivated) toast(`${r.added + r.reactivated} change(s) added to the Change Register`);
    if (!on && r.removed) toast(`${r.removed} change(s) removed from scope — records kept for traceability`);
  };
  const outstandingQs = d.clarificationQueue.filter((x) => x.impactCritical).reduce((n, x) => n + x.changeIds.length, 0);
  const allCollapsed = groupList.length > 0 && groupList.every(([k]) => collapsed.has(k));

  return (
    <>
      <div className="lib-grid">
        <aside className="lib-nav">
          <Section title="Change dimensions" flush>
            <div style={{ padding: 6 }}>
              <button className={`navrow ${!dim ? 'on' : ''}`} onClick={() => setDim('')}><Layers size={14} />All dimensions<span className="cnt sel">{selectedTemplates.length}</span></button>
              {DIMS.map((k) => {
                const total = templates.filter((t) => t.active && t.primaryChangeDimension === k).length;
                const sel = activeChanges.filter((c) => c.dimensionId === DIM_ID[k]).length;
                return <button key={k} className={`navrow ${dim === k ? 'on' : ''}`} onClick={() => setDim(k)}><span className="tag dim">{k}</span>Change in {DIM_LABEL[k]}<span className={`cnt ${sel ? 'sel' : ''}`}>{sel}/{total}</span></button>;
              })}
            </div>
          </Section>
          <Section title="Selected by function" flush>
            <div style={{ padding: '8px 12px' }} className="stack">
              {functionOrder(engFns).map((f) => {
                const n = activeChanges.filter((c) => (f === 'Enterprise' ? !c.functionTags.length : c.functionTags.includes(f))).length;
                return n ? <div key={f} className="row small" style={{ justifyContent: 'space-between' }}><span>{FUNCTION_SHORT[f] ?? f}</span><span className="num strong">{n}</span></div> : null;
              })}
              {!activeChanges.length && <span className="small muted">Nothing selected yet.</span>}
            </div>
          </Section>
        </aside>

        <div style={{ minWidth: 0 }}>
          <div className="chips" style={{ marginBottom: 10 }}>
            <button className={`chip ${fn === 'scope' ? 'on' : ''}`} onClick={() => { setFn('scope'); setProc(''); }} title="Enterprise-wide plus the functions selected in Engagement Setup">In-scope functions</button>
            {functionOrder(engFns).map((f) => (
              <button key={f} className={`chip ${fn === f ? 'on' : ''}`} style={{ opacity: f === 'Enterprise' || engFns.includes(f) ? 1 : 0.65 }} onClick={() => { setFn(f); setProc(''); }}>
                {FUNCTION_SHORT[f] ?? f}{engFns.includes(f) && ' •'}
              </button>
            ))}
            <button className={`chip ${fn === 'all' ? 'on' : ''}`} onClick={() => { setFn('all'); setProc(''); }}>All functions</button>
          </div>
          <Section flush title={<span>{dim ? `Change in ${DIM_LABEL[dim]}` : 'All change dimensions'} · {fn === 'scope' ? 'In-scope functions' : fn === 'all' ? 'All functions' : FUNCTION_SHORT[fn] ?? fn}</span>}
            hint={`${visible.length} change(s) shown · ${visible.filter((t) => byTemplate.has(t.templateId)).length} selected`}
            actions={<>
              <Btn size="sm" icon={<CheckSquare size={13} />} disabled={!visible.some((t) => !byTemplate.has(t.templateId))} onClick={() => toggle(visible.map((t) => t.templateId), true)}>Select all visible</Btn>
              <Btn size="sm" icon={<Square size={13} />} disabled={!visible.some((t) => byTemplate.has(t.templateId))} onClick={async () => {
                const n = visible.filter((t) => byTemplate.has(t.templateId)).length;
                if (await ask('Clear visible selections', `${n} change(s) will be removed from scope. Records, clarification answers, and consultant decisions are kept and restored if you select them again.`, 'Clear')) toggle(visible.map((t) => t.templateId), false);
              }}>Clear visible</Btn>
              <Btn size="sm" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupList.map(([k]) => k)))}>{allCollapsed ? 'Expand all' : 'Collapse all'}</Btn>
            </>}>
            <div className="mx-toolbar">
              <div className="row" style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-2)' }} />
                <input className="input" style={{ paddingLeft: 28, width: 260 }} placeholder="Search changes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search changes" />
              </div>
              <Select value={proc} placeholder="All processes / towers" options={processes.map((p) => ({ value: p, label: p }))} onChange={setProc} />
              <Select value={selState} options={[{ value: 'all', label: 'Selected and unselected' }, { value: 'selected', label: 'Selected only' }, { value: 'unselected', label: 'Unselected only' }]} onChange={(v) => setSelState(v as typeof selState)} />
            </div>
            {!visible.length ? <Empty title="No changes match these filters">Try another function, dimension, or search term.</Empty> : groupList.map(([k, list]) => {
              const nSel = list.filter((t) => byTemplate.has(t.templateId)).length;
              const isCollapsed = collapsed.has(k);
              return (
                <div key={k}>
                  <div className="lib-group-head">
                    <button className="btn ghost sm" style={{ padding: 2 }} onClick={() => { const n = new Set(collapsed); if (n.has(k)) n.delete(k); else n.add(k); setCollapsed(n); }} aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}>{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
                    <span className="t">{FUNCTION_SHORT[k] ?? k}</span><span className="small muted">{nSel}/{list.length} selected</span>
                    <span style={{ flex: 1 }} />
                    <Btn size="sm" variant="ghost" disabled={nSel === list.length} onClick={() => toggle(list.map((t) => t.templateId), true)}>Select group</Btn>
                    <Btn size="sm" variant="ghost" disabled={!nSel} onClick={() => toggle(list.map((t) => t.templateId), false)}>Clear group</Btn>
                  </div>
                  {!isCollapsed && list.map((t) => <TemplateRow key={t.templateId} t={t} change={byTemplate.get(t.templateId)} focused={focusId === t.templateId}
                    pending={byTemplate.get(t.templateId) ? t.clarificationQuestions.filter((qq) => { const a = byTemplate.get(t.templateId)!.clarificationAnswers[qq]; return !a || a === 'skip'; }).length : 0}
                    onToggle={(on) => toggle([t.templateId], on)} onDetails={() => inspect({ kind: 'template', templateId: t.templateId })} />)}
                </div>
              );
            })}
          </Section>
          <div className="sel-bar">
            <ListChecks size={16} />
            <span title={DIMS.map((k) => `${DIM_LABEL[k]}: ${activeChanges.filter((c) => c.dimensionId === DIM_ID[k]).length}`).join('\n')}><strong className="num">{activeChanges.length}</strong> in register</span>
            <span style={{ flex: 1 }} />
            {outstandingQs > 0 && <Btn size="sm" icon={<HelpCircle size={13} />} onClick={onClarify}>{outstandingQs} clarification(s)</Btn>}
            <Btn size="sm" disabled={!activeChanges.length} onClick={() => setBulk(activeChanges.map((c) => c.id))}>Bulk scope / wave</Btn>
            <Btn size="sm" disabled={!activeChanges.some((c) => c.source === 'template' && c.status === 'draft')} onClick={async () => {
              const ids = activeChanges.filter((c) => c.source === 'template' && c.status === 'draft').map((c) => c.id);
              if (await ask('Confirm selection', `${ids.length} draft selection(s) will be marked as confirmed as applicable to this engagement. Library-default descriptions remain marked for review until you edit or confirm them in the Change Register.`, 'Confirm selection')) updateChanges(ids, { status: 'confirmed' }, `${ids.length} selection(s) confirmed as applicable`);
            }}>Confirm selection</Btn>
            <Btn size="sm" variant="teal" onClick={onReview}>Review selected</Btn>
          </div>
        </div>
      </div>
      {bulk && <BulkScopeModal changeIds={bulk} onClose={() => setBulk(null)} />}
      {node}
    </>
  );
}

const TemplateRow = memo(function TemplateRow({ t, change, focused, pending, onToggle, onDetails }: { t: ChangeTemplate; change?: ChangeRecord; focused: boolean; pending: number; onToggle: (on: boolean) => void; onDetails: () => void }) {
  const roles = [...t.potentialDirectImpactRoles.slice(0, 3)];
  return (
    <div className={`lib-item ${change ? 'on' : ''} ${focused ? 'focus' : ''}`}>
      <input type="checkbox" checked={!!change} onChange={(e) => onToggle(e.target.checked)} aria-label={`Select ${t.title}`} style={{ marginTop: 3 }} />
      <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={onDetails}>
        <div className="ttl">{t.title}</div>
        <div className="desc">{t.description}</div>
        <div className="meta">
          <span className="tag dim" title={`Primary dimension; also reaches ${t.secondaryImpactDimensions.join(', ') || 'no other dimension'}`}>{t.primaryChangeDimension}{t.secondaryImpactDimensions.length ? `+${t.secondaryImpactDimensions.join('+')}` : ''}</span>
          {t.functionTags.map((f) => <span key={f} className="tag">{FUNCTION_SHORT[f] ?? f}</span>)}
          {t.processTags.slice(0, 2).map((p) => <span key={p} className="tag">{p}</span>)}
          {roles.map((r) => <span key={r} className="tag role" title="Potential relationship — evaluated against scope and clarifications">{r}</span>)}
          {!t.active && <span className="tag" style={{ color: 'var(--warn)' }}>deprecated</span>}
        </div>
      </div>
      <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
        {change && <span className="mono tiny">{change.code}</span>}
        {change && pending > 0 && <Badge tone="warn">{pending} question{pending > 1 ? 's' : ''}</Badge>}
        {change && change.status === 'confirmed' && <Badge tone="ok">confirmed</Badge>}
        <Btn size="sm" variant="ghost" icon={<Info size={13} />} onClick={onDetails}>Details</Btn>
      </div>
    </div>
  );
});
