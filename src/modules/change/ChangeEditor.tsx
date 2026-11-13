import { useMemo } from 'react';
import { ArrowUpCircle, RotateCcw } from 'lucide-react';
import { useApp } from '../../store/store';
import type { ChangeRecord } from '../../domain/types';
import { ARCHETYPE_LABELS, MILESTONE_LIBRARY, OBJECTIVES, ARTIFACT_TYPES } from '../../domain/library';
import { derive } from '../../engine/derive';
import { waveName } from '../../engine/timing';
import { relationshipsFor, relationLabel } from '../../engine/templateImpact';
import { getLatestTemplate, getTemplate, latestVersionNumber } from '../../catalogue/registry';
import { QUESTIONS } from '../../catalogue/questions';
import { duplicateCandidates } from '../../catalogue/instance';
import { FUNCTION_SHORT, type ChangeTemplate } from '../../catalogue/types';
import { clearClarification, setChangesActive, setClarification, setTemplatesSelected, updateChanges, upgradeTemplateVersion } from '../../store/changeActions';
import { Badge, Btn, Chips, Empty, ListIn, Prov, TextIn } from '../../ui/kit';
import { changeSuggestions } from './suggestions';

const roleLabel = (r: string) => (r === '$cxo' ? 'Accountable functional executive' : ARCHETYPE_LABELS[r as keyof typeof ARCHETYPE_LABELS] ?? r);

export function ChangeEditor({ id }: { id: string }) {
  const s = useApp((x) => x.current)!;
  const inspect = useApp((x) => x.inspect);
  const d = useMemo(() => derive(s), [s]);
  const c = s.changes.find((x) => x.id === id);
  if (!c) return <Empty title="Change not found" />;
  const tpl = c.source === 'template' ? getTemplate(c.templateId, c.templateVersion, s) : undefined;
  const set = <K extends keyof ChangeRecord>(k: K, v: ChangeRecord[K]) => updateChanges([id], { [k]: v } as Partial<ChangeRecord>, `${c.code} ${String(k)} updated`);
  const revert = (k: 'description' | 'asIs' | 'toBe' | 'title') => tpl && updateChanges([id], { [k]: k === 'description' ? tpl.description : k === 'asIs' ? tpl.typicalAsIs : k === 'toBe' ? tpl.typicalToBe : tpl.title } as Partial<ChangeRecord>, `${c.code} ${k} reverted to library default`);
  const F = (k: keyof ChangeRecord, label: string, multi = false, rev?: 'description' | 'asIs' | 'toBe' | 'title') => (
    <div className="field"><label>{label}{rev && tpl && String(c[k]) !== (rev === 'description' ? tpl.description : rev === 'asIs' ? tpl.typicalAsIs : rev === 'toBe' ? tpl.typicalToBe : tpl.title) && <button className="btn ghost sm" onClick={() => revert(rev)}><RotateCcw size={11} /> Library default</button>}</label>
      <TextIn multiline={multi} rows={2} value={String(c[k] ?? '')} onCommit={(v) => set(k, v as never)} /></div>
  );
  const dups = duplicateCandidates(s, c);
  const rels = c.source === 'template' ? d.selectedStakeholders.map((st) => ({ st, rels: relationshipsFor(s, st, c) })).filter((x) => x.rels.length) : [];
  const sg = c.source === 'custom' ? changeSuggestions(s, c) : null;
  return (
    <div className="stack">
      <div className="row">
        {c.source === 'template' ? <Prov kind="rule" label={`Library ${c.templateId} v${c.templateVersion}`} /> : <Prov kind="fact" label="Custom change" />}
        <Badge tone={c.active ? 'ok' : 'muted'}>{c.active ? 'in scope' : 'removed from scope'}</Badge>
        {c.source === 'template' && !c.defaultsReviewed && <Badge tone="warn">library-default text</Badge>}
      </div>
      {c.source === 'template' && c.templateId && (c.templateVersion ?? 1) < latestVersionNumber(c.templateId) && (
        <div className="banner info small"><div className="grow">A newer library version (v{latestVersionNumber(c.templateId)}) of this template exists. This change keeps v{c.templateVersion} until you update it.</div><Btn size="sm" icon={<ArrowUpCircle size={13} />} onClick={() => upgradeTemplateVersion([id])}>Update</Btn></div>
      )}
      {dups.length > 0 && <div className="banner warn small"><div className="grow">Possible duplicate of {dups.map((x) => `${x.code} “${x.title}”`).join('; ')}.</div></div>}
      {!c.active && <Btn onClick={() => setChangesActive([id], true)}>Restore to scope</Btn>}
      {F('title', 'Change title', false, 'title')}
      <div className="grid g2">
        <div className="field"><label>Primary dimension</label><select className="select" value={c.dimensionId} disabled={c.source === 'template'} onChange={(e) => set('dimensionId', e.target.value)}>{s.dimensions.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}</select>{c.source === 'template' && <span className="help">Set by the library template.</span>}</div>
        <div className="field"><label>Review status</label><select className="select" value={c.status} onChange={(e) => set('status', e.target.value as ChangeRecord['status'])}><option value="draft">Draft</option><option value="needs_review">Needs review</option><option value="confirmed">Confirmed</option></select></div>
      </div>

      {tpl && tpl.clarificationQuestions.length > 0 && (
        <div className="insp-block gap">
          <h4>Clarifications</h4>
          {tpl.clarificationQuestions.map((qid) => {
            const qq = QUESTIONS[qid];
            const ans = c.clarificationAnswers?.[qid];
            return (
              <div key={qid} className="field" style={{ marginBottom: 8 }}>
                <label>{qq?.text ?? qid} {qq?.impactCritical && <Badge tone="warn">affects impact</Badge>}</label>
                <select className="select" value={ans ?? ''} onChange={(e) => (e.target.value ? setClarification([id], qid, e.target.value) : clearClarification([id], qid))}>
                  <option value="">— Not answered —</option>
                  {qq?.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  <option value="skip">Skip — mark dependent relationships as requiring review</option>
                </select>
                {ans && ans !== 'skip' && <span className="help">{qq?.options.find((o) => o.id === ans)?.effect}</span>}
              </div>
            );
          })}
        </div>
      )}

      {F('description', 'Description', true, 'description')}
      {F('asIs', c.source === 'template' ? 'As-Is (typical — confirm)' : 'As-Is state', true, 'asIs')}
      {F('toBe', c.source === 'template' ? 'To-Be (typical — confirm)' : 'To-Be state', true, 'toBe')}
      {c.source === 'template' && <label className="check small"><input type="checkbox" checked={c.defaultsReviewed} onChange={() => set('defaultsReviewed', !c.defaultsReviewed)} /> I have reviewed the description, As-Is and To-Be for this engagement</label>}
      {F('customDescription', 'Engagement-specific note (optional)', true)}
      {F('notChanging', 'What is not changing', true)}
      {F('rationale', 'Business rationale', true)}
      <div className="field"><label>Applicable functions (none = all in-scope functions)</label>
        <Chips options={Array.from(new Set([...s.engagement.functions.map((f) => f.name), ...c.functionTags])).map((f) => ({ value: f, label: FUNCTION_SHORT[f] ?? f }))} value={c.functionTags} onChange={(v) => updateChanges([id], { functionTags: v, functionName: v[0] ?? '' }, `${c.code} functions updated`)} /></div>
      <div className="field"><label>Transition waves (none = all waves)</label>
        <div className="chips">{s.waves.map((w) => { const on = c.waveIds.includes(w.id); return <button key={w.id} className={`chip ${on ? 'on' : ''}`} onClick={() => set('waveIds', on ? c.waveIds.filter((x) => x !== w.id) : [...c.waveIds, w.id])}>{w.name}</button>; })}</div></div>
      <div className="grid g2">
        <div className="field"><label>Processes / towers</label><ListIn value={c.processTags} onCommit={(v) => updateChanges([id], { processTags: v, process: v.join(', ') }, `${c.code} processes updated`)} /></div>
        {F('geography', 'Geography')}
        <div className="field"><label>Entities</label><ListIn value={c.entities} onCommit={(v) => set('entities', v)} /></div>
        <div className="field"><label>Expected effective date</label><TextIn type="date" value={c.effectiveDate ?? ''} onCommit={(v) => set('effectiveDate', v || null)} /></div>
        <div className="field"><label>Associated milestone</label><select className="select" value={c.milestoneId ?? ''} onChange={(e) => set('milestoneId', e.target.value || null)}><option value="">—</option>{s.milestones.filter((m) => m.selected).map((m) => <option key={m.id} value={m.id}>{m.name}{m.waveId ? ` (${waveName(s, m.waveId)})` : ''}</option>)}</select></div>
        <div className="field"><label>People potentially affected</label><TextIn type="number" value={c.peopleAffected === null ? '' : String(c.peopleAffected)} onCommit={(v) => set('peopleAffected', v === '' ? null : Number(v))} /></div>
        {F('owner', 'Change owner')}
      </div>
      {F('operationalImpact', 'Expected operational impact', true)}
      {F('behaviouralImpact', 'Expected behavioural impact', true)}
      {F('dependencies', 'Dependencies', true)}
      {F('assumptions', 'Assumptions', true)}
      {F('evidence', 'Evidence / source', true)}

      {c.source === 'template' && (
        <div className="insp-block rec">
          <h4>Stakeholder relationships from this change <Prov kind="rule" /></h4>
          {!rels.length ? <p className="small muted">No selected stakeholder has a relationship with this change under its current scope and answers.</p> : rels.map(({ st, rels: rr }) => (
            <div key={st.id} className="rel-row">
              <div><strong>{st.roleName}</strong>{rr.map((r) => <div key={r.dim} className="tiny muted">{r.dim}: {r.out.hit.text}</div>)}</div>
              <div className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>{rr.map((r) => <Badge key={r.dim} tone={r.out.hit.hit === 'direct' ? 'ok' : r.out.hit.hit === 'indirect' ? 'info' : r.out.hit.hit === 'unknown' ? 'warn' : 'ai'}>{r.dim} · {relationLabel(r.out.hit.hit)}</Badge>)}</div>
            </div>
          ))}
          <p className="tiny muted" style={{ marginTop: 6 }}>Candidate relationships from the library, evaluated against scope and clarifications. They are reviewed and confirmed in the Impact Assessment.</p>
        </div>
      )}
      {sg && (
        <div className="insp-block rec"><h4>Rule suggestions <Prov kind="rule" label="Suggestion" /></h4>
          <div className="small"><strong>Possibly impacted:</strong> {sg.impacted.map((x) => `${x.name} (${x.directness}${x.selected ? '' : ', not selected'})`).join('; ') || 'None'}</div>
          {sg.gaps.length > 0 && <ul className="clean small" style={{ marginTop: 6, color: 'var(--warn)' }}>{sg.gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
        </div>
      )}
      {tpl && <Btn size="sm" variant="ghost" onClick={() => inspect({ kind: 'template', templateId: tpl.templateId })}>View library template</Btn>}
    </div>
  );
}

export function TemplateDetail({ templateId }: { templateId: string }) {
  const s = useApp((x) => x.current)!;
  useApp((x) => x.catalogueRev);
  const inspect = useApp((x) => x.inspect);
  const t = getLatestTemplate(templateId);
  if (!t) return <Empty title="Template not found" />;
  const inst = s.changes.find((c) => c.templateId === templateId);
  const selected = !!inst?.active;
  const engFns = s.engagement.functions.map((f) => f.name);
  return (
    <div className="stack">
      <div className="row"><span className="mono">{t.templateId}</span><Prov kind="rule" label={`${t.origin === 'builtin' ? 'Built-in' : 'Custom'} library · v${t.templateVersion}`} />{!t.active && <Badge tone="warn">deprecated</Badge>}</div>
      <div className="t strong" style={{ fontSize: 14 }}>{t.title}</div>
      <div className="row">
        <Btn variant={selected ? 'default' : 'primary'} onClick={() => setTemplatesSelected([templateId], !selected)}>{selected ? 'Deselect' : 'Select this change'}</Btn>
        {inst && <Btn onClick={() => inspect({ kind: 'change', changeId: inst.id })}>Open {inst.code}</Btn>}
      </div>
      <p className="small">{t.description}</p>
      <dl className="kv"><dt>Dimension</dt><dd>{t.primaryChangeDimension}{t.secondaryImpactDimensions.length ? ` (also ${t.secondaryImpactDimensions.join(', ')})` : ''}</dd>
        <dt>Functions</dt><dd>{t.functionTags.map((f) => `${FUNCTION_SHORT[f] ?? f}${engFns.includes(f) ? ' (in scope)' : ''}`).join(', ')}</dd><dt>Processes</dt><dd>{t.processTags.join(', ')}</dd></dl>
      <div className="insp-block"><h4>Typical transformation</h4><div className="small"><span className="muted">As-Is:</span> {t.typicalAsIs}</div><div className="small"><span className="muted">To-Be:</span> {t.typicalToBe}</div></div>
      <TemplateRelations t={t} />
      <div className="insp-block"><h4>Applicable milestones</h4><div className="chips">{t.typicalMilestoneTriggers.map((k) => <span key={k} className="chip static">{MILESTONE_LIBRARY.find((m) => m.key === k)?.name ?? k}</span>)}</div></div>
      {t.clarificationQuestions.length > 0 && <div className="insp-block gap"><h4>Clarification questions</h4>{t.clarificationQuestions.map((q) => <div key={q} className="small" style={{ marginBottom: 6 }}><strong>{QUESTIONS[q]?.text}</strong><ul className="clean tiny muted">{QUESTIONS[q]?.options.map((o) => <li key={o.id}>{o.label} — {o.effect}</li>)}</ul></div>)}</div>}
      <div className="insp-block"><h4>Communication defaults</h4>
        <div className="small"><span className="muted">Objectives:</span> {t.possibleCommunicationObjectives.map((o) => OBJECTIVES[o]).join(', ')}</div>
        <div className="small"><span className="muted">Types:</span> {t.potentialCommunicationTypes.map((x) => s.commTypes.find((c) => c.id === x)?.short ?? x).join(', ')}</div>
        <div className="small"><span className="muted">Channels:</span> {t.suggestedChannels.map((x) => s.channels.find((c) => c.id === x)?.name ?? x).join(', ')}</div>
        <div className="small"><span className="muted">Artifacts:</span> {t.typicalArtifactTypes.map((a) => ARTIFACT_TYPES[a].label).join(', ')}</div>
        <div className="small"><span className="muted">Severity guidance:</span> {t.defaultImpactSeverityGuidance}</div>
      </div>
      <p className="tiny muted">Source: GBS Change Library (template {t.templateId} v{t.templateVersion}). Relationships are candidates, not confirmed client evidence.</p>
    </div>
  );
}

function TemplateRelations({ t }: { t: ChangeTemplate }) {
  const kinds: [string, string][] = [['direct', 'Potentially directly impacted'], ['indirect', 'Potentially indirectly impacted'], ['governance', 'Governance involvement'], ['awareness', 'Potential communication / awareness audiences']];
  return (
    <div className="insp-block rec"><h4>Stakeholder relationships <Prov kind="rule" label="Candidate" /></h4>
      {kinds.map(([k, label]) => {
        const rules = t.rules.filter((r) => r.kind === k);
        if (!rules.length) return null;
        return (
          <div key={k} style={{ marginBottom: 8 }}>
            <div className="small strong">{label}</div>
            <ul className="clean tiny">{rules.map((r) => <li key={r.id}><strong>{r.roles.map(roleLabel).join(', ')}</strong>{r.fnScoped ? ' (in the change’s functions)' : ''} — {r.mechanism}{r.when ? <em className="muted"> Only if “{QUESTIONS[r.when.q]?.text}” = {r.when.in.map((o) => QUESTIONS[r.when!.q]?.options.find((x) => x.id === o)?.label ?? o).join(' / ')}.</em> : null} <span className="muted mono">[{r.id} · {r.dims.join('/')}]</span></li>)}</ul>
          </div>
        );
      })}
    </div>
  );
}
