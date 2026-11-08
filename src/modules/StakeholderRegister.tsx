import { useMemo, useState } from 'react';
import { Plus, Trash2, Copy } from 'lucide-react';
import { useApp } from '../store/store';
import type { Archetype, Stakeholder, StakeholderRoleFlags } from '../domain/types';
import { ARCHETYPE_LABELS } from '../domain/library';
import { uid, includesCI } from '../domain/util';
import { Badge, Btn, Empty, PageHeader, Section, Seg, TextIn, useConfirm, Prov } from '../ui/kit';
import { waveName } from '../engine/timing';

export const ROLE_FLAG_LABELS: Record<keyof StakeholderRoleFlags, string> = {
  decisionMaker: 'Decision maker', approver: 'Approver', sponsor: 'Sponsor', communicator: 'Communicator',
  executionOwner: 'Execution owner', recipient: 'Recipient', support: 'Support / enabling',
};

export function StakeholderRegister() {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const [filter, setFilter] = useState<'all' | 'selected'>('all');
  const [q, setQ] = useState('');
  const { ask, node } = useConfirm();
  const selectedId = inspector?.kind === 'stakeholder' ? inspector.stakeholderId : null;
  const groups = useMemo(() => [...s.groups].sort((a, b) => a.sortOrder - b.sortOrder), [s.groups]);
  const nSel = s.stakeholders.filter((x) => x.selected).length;

  const toggle = (st: Stakeholder) => mutate((d) => { const x = d.stakeholders.find((y) => y.id === st.id)!; x.selected = !x.selected; },
    { entityType: 'stakeholder', entityId: st.id, action: st.selected ? 'exclude' : 'include', summary: `${st.roleName} ${st.selected ? 'excluded' : 'included'}` });

  const addCustom = (groupId: string) => {
    const id = uid('st');
    mutate((d) => {
      const maxSort = Math.max(0, ...d.stakeholders.filter((x) => x.groupId === groupId).map((x) => x.sortOrder));
      d.stakeholders.push({ id, groupId, roleName: 'Custom stakeholder', archetype: 'business_user', libraryKey: null, isCustom: true, selected: true, entity: '', functionName: '', geography: '', waveIds: [],
        population: null, owner: '', influence: null, readiness: 'unknown', roles: { decisionMaker: false, approver: false, sponsor: false, communicator: false, executionOwner: false, recipient: true, support: false },
        responsibilities: '', dependencies: '', notes: '', sortOrder: maxSort + 10 });
    }, { entityType: 'stakeholder', entityId: id, action: 'add', summary: 'Custom stakeholder added' });
    inspect({ kind: 'stakeholder', stakeholderId: id });
  };

  return (
    <>
      <PageHeader eyebrow="Stage 2 · Change Assessment & Stakeholder Analysis" title="Stakeholder Register"
        sub="Select the stakeholder groups relevant to this engagement. A stakeholder can need communication without being directly impacted — role flags (sponsor, approver, execution owner…) drive audience planning separately from impact."
        actions={<><Badge tone="info">{nSel} selected</Badge><Seg options={[{ value: 'all', label: 'Full library' }, { value: 'selected', label: 'Selected only' }]} value={filter} onChange={setFilter} /></>} />
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search stakeholders…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stakeholders" />
      </div>
      {groups.map((g) => {
        const members = s.stakeholders.filter((x) => x.groupId === g.id && (filter === 'all' || x.selected) && (!q || includesCI(`${x.roleName} ${x.functionName} ${x.notes}`, q))).sort((a, b) => a.sortOrder - b.sortOrder);
        const all = s.stakeholders.filter((x) => x.groupId === g.id);
        const allOn = all.every((x) => x.selected);
        if (!members.length && (filter === 'selected' || q)) return null;
        return (
          <Section key={g.id} title={`${g.code}. ${g.name}`} hint={`${all.filter((x) => x.selected).length} of ${all.length} selected`} flush
            actions={<>
              <Btn size="sm" onClick={() => mutate((d) => { d.stakeholders.forEach((x) => { if (x.groupId === g.id) x.selected = !allOn; }); }, { entityType: 'group', entityId: g.id, action: 'bulk', summary: `${g.name}: ${allOn ? 'all excluded' : 'all included'}` })}>{allOn ? 'Exclude all' : 'Include all'}</Btn>
              <Btn size="sm" icon={<Plus size={13} />} onClick={() => addCustom(g.id)}>Add custom</Btn>
            </>}>
            {!members.length ? <Empty title="No stakeholders in this group" /> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th style={{ width: 40 }}>In</th><th>Stakeholder</th><th>Archetype</th><th>Function</th><th>Waves</th><th>Population</th><th>Influence</th><th>Readiness</th><th>Roles</th><th /></tr></thead>
                  <tbody>{members.map((st) => (
                    <tr key={st.id} className={`clickable ${selectedId === st.id ? 'sel' : ''}`} onClick={() => inspect({ kind: 'stakeholder', stakeholderId: st.id })} style={{ opacity: st.selected ? 1 : 0.6 }}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={st.selected} onChange={() => toggle(st)} aria-label={`Include ${st.roleName}`} /></td>
                      <td style={{ minWidth: 220 }}><span className="strong">{st.roleName}</span> {st.isCustom && <Badge tone="ai">custom</Badge>}</td>
                      <td className="small muted">{ARCHETYPE_LABELS[st.archetype]}</td>
                      <td className="small">{st.functionName || '—'}</td>
                      <td className="small">{st.waveIds.map((w) => waveName(s, w)).join(', ') || 'All'}</td>
                      <td className="small num">{st.population ?? '—'}</td>
                      <td className="small">{st.influence ?? '—'}</td>
                      <td className="small">{st.readiness}</td>
                      <td style={{ minWidth: 160 }}><div className="chips">{(Object.keys(st.roles) as (keyof StakeholderRoleFlags)[]).filter((k) => st.roles[k] && k !== 'recipient').map((k) => <span key={k} className="badge b-muted">{ROLE_FLAG_LABELS[k]}</span>)}</div></td>
                      <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        <Btn size="sm" variant="ghost" icon={<Copy size={13} />} aria-label="Duplicate" title="Duplicate (e.g. split by function)" onClick={() => {
                          const id = uid('st');
                          mutate((d) => { d.stakeholders.push({ ...JSON.parse(JSON.stringify(st)), id, roleName: `${st.roleName} (copy)`, isCustom: true, libraryKey: null, sortOrder: st.sortOrder + 1 }); }, { entityType: 'stakeholder', entityId: id, action: 'duplicate', summary: `${st.roleName} duplicated` });
                        }} />
                        {st.isCustom && <Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label="Delete" onClick={async () => {
                          const n = s.comms.filter((c) => c.audienceId === st.id).length;
                          if (await ask(`Delete ${st.roleName}`, n ? `${n} communication record(s) reference this stakeholder and will be removed with it.` : 'This custom stakeholder will be removed.', 'Delete', true)) {
                            mutate((d) => { d.stakeholders = d.stakeholders.filter((x) => x.id !== st.id); d.comms = d.comms.filter((c) => c.audienceId !== st.id); const ids = new Set(d.comms.map((c) => c.id)); d.artifacts = d.artifacts.filter((a) => ids.has(a.communicationRecordId)); Object.keys(d.assessments).forEach((k) => { if (k.startsWith(`${st.id}|`)) delete d.assessments[k]; }); },
                              { entityType: 'stakeholder', entityId: st.id, action: 'delete', summary: `${st.roleName} deleted` });
                            inspect(null);
                          }
                        }} />}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Section>
        );
      })}
      {node}
    </>
  );
}

export function StakeholderEditor({ id }: { id: string }) {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const st = s.stakeholders.find((x) => x.id === id);
  if (!st) return <Empty title="Stakeholder not found" />;
  const set = <K extends keyof Stakeholder>(k: K, v: Stakeholder[K], label?: string) => mutate((d) => { (d.stakeholders.find((x) => x.id === id)! as Stakeholder)[k] = v; }, { entityType: 'stakeholder', entityId: id, action: 'update', summary: `${st.roleName}: ${label ?? String(k)} updated` });
  return (
    <div className="stack">
      <div className="row"><Prov kind="fact" label="Engagement fact" /><span className="small muted">ID {st.id}</span></div>
      <label className="check"><input type="checkbox" checked={st.selected} onChange={() => set('selected', !st.selected, 'selection')} /> Included in this engagement</label>
      <div className="field"><label>Stakeholder label</label><TextIn value={st.roleName} onCommit={(v) => set('roleName', v, 'label')} /></div>
      <div className="grid g2">
        <div className="field"><label>Group</label><select className="select" value={st.groupId} onChange={(e) => set('groupId', e.target.value, 'group')}>{s.groups.map((g) => <option key={g.id} value={g.id}>{g.code}. {g.name}</option>)}</select></div>
        <div className="field"><label>Archetype (drives rules)</label><select className="select" value={st.archetype} onChange={(e) => set('archetype', e.target.value as Archetype, 'archetype')}>{(Object.keys(ARCHETYPE_LABELS) as Archetype[]).map((a) => <option key={a} value={a}>{ARCHETYPE_LABELS[a]}</option>)}</select></div>
        <div className="field"><label>Organisation / entity</label><TextIn value={st.entity} onCommit={(v) => set('entity', v)} /></div>
        <div className="field"><label>Function</label><select className="select" value={st.functionName} onChange={(e) => set('functionName', e.target.value, 'function')}><option value="">Cross-functional</option>{s.engagement.functions.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}</select></div>
        <div className="field"><label>Geography</label><TextIn value={st.geography} onCommit={(v) => set('geography', v)} /></div>
        <div className="field"><label>Approx. population</label><TextIn type="number" value={st.population === null ? '' : String(st.population)} onCommit={(v) => set('population', v === '' ? null : Math.max(0, Number(v)), 'population')} /></div>
        <div className="field"><label>Contact / role owner</label><TextIn value={st.owner} onCommit={(v) => set('owner', v, 'owner')} /></div>
        <div className="field"><label>Influence</label><select className="select" value={st.influence ?? ''} onChange={(e) => set('influence', (e.target.value || null) as Stakeholder['influence'], 'influence')}><option value="">Not assessed</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
        <div className="field"><label>Current engagement / readiness</label><select className="select" value={st.readiness} onChange={(e) => set('readiness', e.target.value as Stakeholder['readiness'], 'readiness')}>{['unknown', 'resistant', 'concerned', 'aware', 'supportive', 'champion'].map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
      </div>
      <div className="field"><label>Transition waves</label><div className="chips">{s.waves.map((w) => { const on = st.waveIds.includes(w.id); return <button key={w.id} className={`chip ${on ? 'on' : ''}`} onClick={() => set('waveIds', on ? st.waveIds.filter((x) => x !== w.id) : [...st.waveIds, w.id], 'waves')}>{w.name}</button>; })}</div><span className="help">None selected = all waves.</span></div>
      <div className="field"><label>Stakeholder roles (not mutually exclusive)</label>
        <div className="chips">{(Object.keys(ROLE_FLAG_LABELS) as (keyof StakeholderRoleFlags)[]).map((k) => <button key={k} className={`chip ${st.roles[k] ? 'on' : ''}`} onClick={() => set('roles', { ...st.roles, [k]: !st.roles[k] }, ROLE_FLAG_LABELS[k])}>{ROLE_FLAG_LABELS[k]}</button>)}</div>
        <span className="help">Decision maker / approver / sponsor / execution owner make a stakeholder a communication audience even when not impacted.</span>
      </div>
      <div className="field"><label>Responsibilities</label><TextIn multiline value={st.responsibilities} onCommit={(v) => set('responsibilities', v)} /></div>
      <div className="field"><label>Relationship dependencies</label><TextIn multiline value={st.dependencies} onCommit={(v) => set('dependencies', v)} /></div>
      <div className="field"><label>Notes and assumptions</label><TextIn multiline value={st.notes} onCommit={(v) => set('notes', v)} /></div>
    </div>
  );
}
