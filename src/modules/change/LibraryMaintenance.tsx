import { useState } from 'react';
import { Lock, Unlock, Plus, Trash2, Save } from 'lucide-react';
import { useApp } from '../../store/store';
import type { Archetype } from '../../domain/types';
import { ARCHETYPE_LABELS } from '../../domain/library';
import { getCatalogueOverlay, listLatestTemplates, templateSchema } from '../../catalogue/registry';
import { QUESTIONS } from '../../catalogue/questions';
import { buildTemplate } from '../../catalogue/templates';
import { CATALOGUE_FUNCTIONS, type ChangeTemplate, type DimCode, type RelationKind, type RoleRule } from '../../catalogue/types';
import { saveTemplateVersion, setTemplateDeprecated } from '../../store/changeActions';
import { Badge, Btn, Chips, Empty, Field, Section, Select, useConfirm, Prov } from '../../ui/kit';
import { DIM_LABEL } from './ChangeLibrary';

const ROLE_OPTIONS = ['$cxo', ...Object.keys(ARCHETYPE_LABELS)] as string[];
const roleName = (r: string) => (r === '$cxo' ? 'Accountable functional executive' : ARCHETYPE_LABELS[r as Archetype] ?? r);

export function LibraryMaintenance() {
  useApp((x) => x.catalogueRev);
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const [unlocked, setUnlocked] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChangeTemplate | null>(null);
  const { ask, node } = useConfirm();
  const list = listLatestTemplates().filter((t) => !q || `${t.templateId} ${t.title}`.toLowerCase().includes(q.toLowerCase()));
  const overlay = getCatalogueOverlay();
  const open = (t: ChangeTemplate) => { setSel(t.templateId); setDraft(JSON.parse(JSON.stringify(t))); };
  const used = (id: string) => s.changes.filter((c) => c.templateId === id).length;
  const set = (patch: Partial<ChangeTemplate>) => draft && setDraft({ ...draft, ...patch });
  const setRule = (i: number, patch: Partial<RoleRule>) => draft && setDraft({ ...draft, rules: draft.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <>
      <div className={`banner ${unlocked ? 'warn' : 'info'}`}>
        {unlocked ? <Unlock size={16} /> : <Lock size={16} />}
        <div className="grow small">
          <strong>Shared GBS Change Library.</strong> Changes here apply to every engagement you open on this account, not just this one. Saving creates a new template version; engagements keep the version they selected until you update them in the Change Register. Built-in originals are never overwritten.
        </div>
        <Btn size="sm" onClick={async () => { if (unlocked) setUnlocked(false); else if (await ask('Enable library editing', 'You are about to edit the shared change library, which affects future selections in all engagements. Engagement-specific edits belong in the Change Register instead.', 'Enable editing')) setUnlocked(true); }}>{unlocked ? 'Lock library' : 'Enable library editing'}</Btn>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 340px) minmax(0, 1fr)', alignItems: 'start' }}>
        <Section flush title="Templates" hint={`${list.length} · ${overlay.versions.length} edited version(s)`}
          actions={<Btn size="sm" icon={<Plus size={13} />} disabled={!unlocked} onClick={() => {
            const n = overlay.versions.filter((v) => v.templateId.startsWith('CUS-')).map((v) => Number(v.templateId.slice(4))).reduce((a, b) => Math.max(a, b), 0) + 1;
            const t = buildTemplate(`CUS-${String(n).padStart(3, '0')}`, 'OM', ['Enterprise'], ['General'], 'New custom change template', 'Describe the change.', 'Typical current state.', 'Typical future state.', [
              { kind: 'direct', roles: ['transferring'], fnScoped: true, dims: [], mechanism: 'Describe how this role is affected.', severity: [2, 1, 1, 2], when: null, info: '' },
            ]);
            setSel(t.templateId); setDraft({ ...t, origin: 'custom', templateVersion: 0 });
          }}>New template</Btn>}>
          <div style={{ padding: 10 }}><input className="input" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" /></div>
          <div style={{ maxHeight: 'calc(100vh - 340px)', overflow: 'auto' }}>
            {list.map((t) => (
              <button key={t.templateId} className="issue" onClick={() => open(t)} style={{ width: '100%', border: 0, borderBottom: '1px solid var(--divider)', textAlign: 'left', cursor: 'pointer', background: sel === t.templateId ? 'var(--pale)' : 'transparent' }}>
                <div className="grow"><div className="small strong">{t.title}</div><div className="tiny muted mono">{t.templateId} · v{t.templateVersion} · {t.origin}</div></div>
                <div className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>{!t.active && <Badge tone="warn">deprecated</Badge>}{used(t.templateId) > 0 && <Badge tone="info">in use</Badge>}</div>
              </button>
            ))}
          </div>
        </Section>
        {!draft ? <Empty title="Select a template">View its relationship rules and version history, or enable editing to change it.</Empty> : (
          <Section title={`${draft.templateId} — ${draft.title}`} hint={<><Prov kind="rule" label={draft.origin === 'builtin' ? 'Built-in template' : draft.origin === 'ai' ? 'AI-generated template' : 'Custom template'} /> version {draft.templateVersion || 'new'}</>}
            actions={<>
              {draft.templateVersion > 0 && <Btn size="sm" disabled={!unlocked} onClick={async () => { await setTemplateDeprecated(draft.templateId, draft.active); toast(draft.active ? 'Template deprecated — existing selections keep working' : 'Template restored'); setDraft({ ...draft, active: !draft.active }); }}>{draft.active ? 'Deprecate' : 'Restore'}</Btn>}
              <Btn size="sm" variant="primary" icon={<Save size={13} />} disabled={!unlocked} onClick={async () => {
                const t = buildTemplate(draft.templateId, draft.primaryChangeDimension, draft.functionTags, draft.processTags, draft.title, draft.description, draft.typicalAsIs, draft.typicalToBe,
                  draft.rules.map(({ id: _id, ...r }) => r), { ms: draft.typicalMilestoneTriggers, obj: draft.possibleCommunicationObjectives, ct: draft.potentialCommunicationTypes, ch: draft.suggestedChannels, art: draft.typicalArtifactTypes, emp: draft.employmentImplication, types: draft.applicableTransformationTypes });
                const full = { ...t, origin: draft.origin, active: draft.active };
                const v = templateSchema.safeParse(full);
                if (!v.success) { toast(`Template is not valid: ${v.error.issues[0]?.path.join('.')} ${v.error.issues[0]?.message}`, 'error'); return; }
                if (!full.rules.length) { toast('Add at least one stakeholder relationship rule.', 'warn'); return; }
                const ver = await saveTemplateVersion(full);
                toast(`Saved ${draft.templateId} v${ver}. Engagements using earlier versions are unchanged until updated.`);
                setDraft({ ...full, templateVersion: ver });
              }}>Save as new version</Btn>
            </>}>
            <fieldset disabled={!unlocked} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <div className="grid g2">
                <Field label="Title"><input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} /></Field>
                <Field label="Primary change dimension"><Select value={draft.primaryChangeDimension} options={(Object.keys(DIM_LABEL) as DimCode[]).map((k) => ({ value: k, label: DIM_LABEL[k] }))} onChange={(v) => set({ primaryChangeDimension: v })} /></Field>
              </div>
              <Field label="Description"><textarea className="textarea" value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
              <div className="grid g2">
                <Field label="Typical As-Is"><textarea className="textarea" value={draft.typicalAsIs} onChange={(e) => set({ typicalAsIs: e.target.value })} /></Field>
                <Field label="Typical To-Be"><textarea className="textarea" value={draft.typicalToBe} onChange={(e) => set({ typicalToBe: e.target.value })} /></Field>
              </div>
              <Field label="Functions"><Chips options={CATALOGUE_FUNCTIONS.map((f) => ({ value: f, label: f }))} value={draft.functionTags} onChange={(v) => set({ functionTags: v })} /></Field>
              <Field label="Processes / towers (comma separated)"><input className="input" value={draft.processTags.join(', ')} onChange={(e) => set({ processTags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
              <div className="label" style={{ marginTop: 6 }}>Stakeholder relationship rules</div>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Roles</th><th>Relationship</th><th>Function-scoped</th><th>Dimensions</th><th>Condition</th><th>Mechanism (explanation)</th><th /></tr></thead>
                <tbody>{draft.rules.map((r, i) => (
                  <tr key={i}>
                    <td style={{ minWidth: 170 }}>
                      <div className="chips">{r.roles.map((role) => <span key={role} className="tag">{roleName(role)} <button className="btn ghost sm" style={{ padding: 0 }} aria-label="Remove role" onClick={() => setRule(i, { roles: r.roles.filter((x) => x !== role) })}>×</button></span>)}</div>
                      <select className="select" value="" onChange={(e) => e.target.value && setRule(i, { roles: [...r.roles, e.target.value as Archetype] })} aria-label="Add role"><option value="">+ role</option>{ROLE_OPTIONS.filter((x) => !r.roles.includes(x as Archetype)).map((x) => <option key={x} value={x}>{roleName(x)}</option>)}</select>
                    </td>
                    <td><select className="select" value={r.kind} onChange={(e) => setRule(i, { kind: e.target.value as RelationKind })} aria-label="Relationship"><option value="direct">Direct impact</option><option value="indirect">Indirect impact</option><option value="governance">Governance</option><option value="awareness">Awareness</option><option value="review">Requires review</option></select></td>
                    <td><input type="checkbox" checked={r.fnScoped} onChange={(e) => setRule(i, { fnScoped: e.target.checked })} aria-label="Function scoped" /></td>
                    <td style={{ minWidth: 120 }}><Chips options={(['OM', 'PR', 'OS', 'TE', 'IM'] as DimCode[]).map((k) => ({ value: k, label: k }))} value={r.dims} onChange={(v) => setRule(i, { dims: v as DimCode[] })} /></td>
                    <td style={{ minWidth: 170 }}>
                      <select className="select" value={r.when?.q ?? ''} onChange={(e) => setRule(i, { when: e.target.value ? { q: e.target.value, in: [QUESTIONS[e.target.value].options[0].id] } : null })} aria-label="Condition question"><option value="">Always applies</option>{Object.values(QUESTIONS).map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}</select>
                      {r.when && <Chips options={QUESTIONS[r.when.q].options.map((o) => ({ value: o.id, label: o.label }))} value={r.when.in} onChange={(v) => setRule(i, { when: { q: r.when!.q, in: v } })} />}
                    </td>
                    <td style={{ minWidth: 220 }}><textarea className="textarea" rows={2} value={r.mechanism} onChange={(e) => setRule(i, { mechanism: e.target.value })} aria-label="Mechanism" /></td>
                    <td><Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label="Delete rule" onClick={() => set({ rules: draft.rules.filter((_, j) => j !== i) })} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
              <Btn size="sm" icon={<Plus size={13} />} onClick={() => set({ rules: [...draft.rules, { id: '', kind: 'indirect', roles: ['business_user'], fnScoped: false, dims: [], mechanism: '', severity: [1, 1, 0, 1], when: null, info: '' }] })}>Add rule</Btn>
            </fieldset>
            <div className="divider" />
            <div className="small"><strong>Versions:</strong> {[...(draft.origin === 'builtin' ? ['v1 (built-in)'] : []), ...overlay.versions.filter((v) => v.templateId === draft.templateId).map((v) => `v${v.templateVersion}`)].join(', ') || 'unsaved'} · used by {used(draft.templateId)} change(s) in this engagement</div>
          </Section>
        )}
      </div>
      {node}
    </>
  );
}
