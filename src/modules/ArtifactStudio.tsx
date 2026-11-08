import { useEffect, useMemo, useState } from 'react';
import { Download, FilePlus2, RefreshCw, RotateCcw, Eye, Pencil, Trash2, Plus, Send, Check, AlertTriangle, Presentation } from 'lucide-react';
import { useApp } from '../store/store';
import type { ArtifactLength, ArtifactSection, ArtifactType, KTItem, Tone } from '../domain/types';
import { ARTIFACT_TYPES, OBJECTIVES, TONES } from '../domain/library';
import { countPlaceholders, fmtDateTime, slug, uid, includesCI, PLACEHOLDER_RE } from '../domain/util';
import { derive } from '../engine/derive';
import { regenerateSection } from '../engine/artifacts';
import { milestoneLabel } from '../engine/matrixText';
import { generateArtifact, regenerateArtifact, saveArtifactVersion, setArtifactApproval } from '../store/actions';
import { artifactDocx } from '../services/docx';
import { trainingDeckPptx } from '../services/office';
import { saveFile } from '../services/download';
import { Badge, Btn, Empty, Field, PageHeader, PhText, Section, Select, Tabs, useConfirm, TextIn, Prov } from '../ui/kit';

type T = 'artifacts' | 'generate' | 'kt';

export function ArtifactStudio() {
  const s = useApp((x) => x.current)!;
  const [tab, setTab] = useState<T>('artifacts');
  const [selected, setSelected] = useState<string | null>(() => { try { return sessionStorage.getItem('gbs-ci:open-artifact'); } catch { return null; } });
  useEffect(() => { try { sessionStorage.removeItem('gbs-ci:open-artifact'); } catch { /* ignore */ } }, []);
  const d = useMemo(() => derive(s), [s]);
  const outdated = [...d.artifactStates.values()].filter((x) => x.outdated).length;
  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="Communication Artifact Studio"
        sub="Generate editable Word (.docx) communication documents from communication records. Every document is a draft until approved, keeps its version history, and is traceable to its communication record. Nothing is sent from here."
        actions={<>{outdated > 0 && <Badge tone="warn">{outdated} potentially outdated</Badge>}<Badge tone="info">{s.artifacts.length} artifact(s)</Badge></>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'artifacts', label: `Artifacts (${s.artifacts.length})` }, { value: 'generate', label: 'Generate new' }, { value: 'kt', label: `KT tracker (${s.kt.length})` }]} />
      {tab === 'artifacts' && <ArtifactList selected={selected} setSelected={setSelected} goGenerate={() => setTab('generate')} />}
      {tab === 'generate' && <Generator onDone={(id) => { setSelected(id); setTab('artifacts'); }} />}
      {tab === 'kt' && <KTTracker />}
    </>
  );
}

function ArtifactList({ selected, setSelected, goGenerate }: { selected: string | null; setSelected: (id: string | null) => void; goGenerate: () => void }) {
  const s = useApp((x) => x.current)!;
  const d = useMemo(() => derive(s), [s]);
  const [q, setQ] = useState('');
  if (!s.artifacts.length) return <Empty title="No artifacts yet" actions={<Btn variant="primary" icon={<FilePlus2 size={14} />} onClick={goGenerate}>Generate an artifact</Btn>}>Pick a communication record and generate its document.</Empty>;
  const list = s.artifacts.filter((a) => !q || includesCI(`${a.code} ${a.title}`, q));
  const cur = s.artifacts.find((a) => a.id === selected) ?? list[0];
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr)', alignItems: 'start' }}>
      <Section title="Documents" flush>
        <div style={{ padding: 10 }}><input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search artifacts" /></div>
        <div style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
          {list.map((a) => {
            const st = d.artifactStates.get(a.id);
            const last = a.versions[a.versions.length - 1];
            return (
              <button key={a.id} onClick={() => setSelected(a.id)} className="issue" style={{ width: '100%', border: 0, borderBottom: '1px solid var(--divider)', background: cur?.id === a.id ? 'var(--pale)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                <div className="grow"><div className="small strong">{ARTIFACT_TYPES[a.type].letter}. {ARTIFACT_TYPES[a.type].label}</div><div className="tiny muted">{a.code} · v{last.v} · {d.commById.get(a.communicationRecordId)?.audience.roleName}</div></div>
                <div className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
                  <Badge tone={a.approvalStatus === 'approved' ? 'ok' : a.approvalStatus === 'pending' ? 'warn' : 'info'}>{a.approvalStatus}</Badge>
                  {st?.outdated && <Badge tone="warn">outdated</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      </Section>
      {cur && <ArtifactEditor key={cur.id} id={cur.id} onDeleted={() => setSelected(null)} />}
    </div>
  );
}

function ArtifactEditor({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const mutate = useApp((x) => x.mutate);
  const inspect = useApp((x) => x.inspect);
  const d = useMemo(() => derive(s), [s]);
  const a = s.artifacts.find((x) => x.id === id)!;
  const v = d.commById.get(a.communicationRecordId);
  const state = d.artifactStates.get(a.id);
  const [viewIdx, setViewIdx] = useState(a.versions.length - 1);
  const ver = a.versions[Math.min(viewIdx, a.versions.length - 1)];
  const isLatest = viewIdx >= a.versions.length - 1;
  const [sections, setSections] = useState<ArtifactSection[]>(ver.sections);
  const [meta, setMeta] = useState(ver.meta);
  const [tone, setTone] = useState<Tone>(ver.tone);
  const [length, setLength] = useState<ArtifactLength>(ver.length);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const { ask, node } = useConfirm();
  useEffect(() => { setSections(ver.sections); setMeta(ver.meta); setTone(ver.tone); setLength(ver.length); setDirty(false); }, [ver]);
  useEffect(() => { setViewIdx(a.versions.length - 1); }, [a.versions.length]);

  const all = sections.filter((x) => !x.removed).map((x) => x.body).join('\n') + meta.subject + meta.from;
  const phs = Array.from(new Set(all.match(new RegExp(PLACEHOLDER_RE.source, 'g')) ?? []));
  const editSec = (sid: string, patch: Partial<ArtifactSection>) => { setSections(sections.map((x) => (x.id === sid ? { ...x, ...patch } : x))); setDirty(true); };
  const save = (note = 'Consultant edits') => { saveArtifactVersion(a.id, sections, meta, 'edited', note, tone, length); setDirty(false); toast(`Saved as v${a.versions[a.versions.length - 1].v + 1}${a.approvalStatus === 'approved' ? ' — approval reset to draft' : ''}`); };
  const download = async () => {
    setBusy(true);
    try {
      const blob = await artifactDocx(s, a, dirty ? { ...ver, sections, meta } : ver);
      const r = await saveFile(`${slug(s.engagement.name)}_${a.code}_${slug(ARTIFACT_TYPES[a.type].label)}_v${ver.v}${dirty ? '-unsaved' : ''}.docx`, blob);
      toast(r.message, r.ok ? 'ok' : 'warn');
    } catch (e) { toast(`DOCX generation failed: ${(e as Error).message}`, 'error'); }
    setBusy(false);
  };

  return (
    <div>
      <Section title={a.title} hint={`${a.code} · traceable to ${v?.rec.code ?? 'missing record'}`}
        actions={<>
          <Btn size="sm" icon={preview ? <Pencil size={13} /> : <Eye size={13} />} onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</Btn>
          <Btn size="sm" variant="primary" icon={<Download size={13} />} onClick={() => void download()} disabled={busy}>{busy ? 'Building…' : 'Download DOCX'}</Btn>
          {a.type === 'training_pack' && <Btn size="sm" icon={<Presentation size={13} />} onClick={async () => { const b = await trainingDeckPptx(s, a.title, sections.filter((x) => !x.removed)); const r = await saveFile(`${slug(s.engagement.name)}_${a.code}_training-deck_v${ver.v}.pptx`, b); toast(r.message, r.ok ? 'ok' : 'warn'); }}>Training deck (PPTX)</Btn>}
        </>}>
        <div className="row" style={{ marginBottom: 10 }}>
          <Badge tone={a.approvalStatus === 'approved' ? 'ok' : a.approvalStatus === 'pending' ? 'warn' : 'info'}>{a.approvalStatus === 'approved' ? 'Approved' : a.approvalStatus === 'pending' ? 'Pending approval' : 'Draft'}</Badge>
          <span className="small muted">Version v{ver.v} ({ver.origin}) · {fmtDateTime(ver.createdAt)}</span>
          {!isLatest && <Badge tone="warn">Viewing an earlier version</Badge>}
          {dirty && <Badge tone="warn">Unsaved edits</Badge>}
          {phs.length > 0 && <Badge tone="warn">{phs.length} placeholder(s) to confirm</Badge>}
          {v && <Btn size="sm" variant="ghost" onClick={() => inspect({ kind: 'comm', commId: v.rec.id, tab: 'plan' })}>Open communication record</Btn>}
        </div>
        {state?.outdated && (
          <div className="banner warn"><AlertTriangle size={15} /><div className="grow small"><strong>Potentially outdated.</strong> {state.reasons.join(' ')}</div>
            <Btn size="sm" icon={<RefreshCw size={13} />} onClick={async () => {
              if (a.approvalStatus === 'approved' && !(await ask('Regenerate approved document', 'A new draft version will be created from current data. The approved version is preserved in history, and the document returns to draft.', 'Regenerate'))) return;
              regenerateArtifact(a.id, tone, length); toast('Regenerated as a new version; earlier versions preserved.');
            }}>Regenerate (keep history)</Btn></div>
        )}
        {v?.rec.commTypeId === 'ct_sensitive' && <div className="banner warn small"><AlertTriangle size={14} /><div className="grow">Sensitive HR communication. Employment details must be supplied or approved by authorised personnel. {v.rec.hrReviewed ? 'HR review recorded.' : 'HR review not yet recorded — approval is blocked.'}</div></div>}

        <div className="grid g3" style={{ marginBottom: 12 }}>
          <Field label="To / Audience"><input className="input" value={meta.to} onChange={(e) => { setMeta({ ...meta, to: e.target.value }); setDirty(true); }} /></Field>
          <Field label="From / Communicator"><input className="input" value={meta.from} onChange={(e) => { setMeta({ ...meta, from: e.target.value }); setDirty(true); }} /></Field>
          <Field label="Subject"><input className="input" value={meta.subject} onChange={(e) => { setMeta({ ...meta, subject: e.target.value }); setDirty(true); }} /></Field>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ width: 210 }}><Select value={tone} options={Object.entries(TONES).map(([k, x]) => ({ value: k as Tone, label: x }))} onChange={setTone} /></div>
          <div style={{ width: 150 }}><Select value={length} options={[{ value: 'concise', label: 'Concise' }, { value: 'standard', label: 'Standard' }, { value: 'detailed', label: 'Detailed' }]} onChange={(x) => setLength(x as ArtifactLength)} /></div>
          <Btn size="sm" icon={<RefreshCw size={13} />} disabled={tone === ver.tone && length === ver.length} onClick={() => { regenerateArtifact(a.id, tone, length); toast('Regenerated with new tone/length as a new version'); }}>Apply tone & length</Btn>
          <span style={{ flex: 1 }} />
          {dirty && <><Btn size="sm" onClick={() => { setSections(ver.sections); setMeta(ver.meta); setDirty(false); }}>Discard edits</Btn><Btn size="sm" variant="primary" onClick={() => save()}>Save new version</Btn></>}
        </div>

        {preview ? (
          <div className="doc-preview">
            <div className="small muted">To: {meta.to}<br />From: <PhText text={meta.from} /><br />Subject: <strong>{meta.subject}</strong></div>
            {sections.filter((x) => !x.removed).map((x) => <div key={x.id}><h2>{x.heading}</h2><div className="doc-body"><PhText text={x.body.replace(/\*\*/g, '')} /></div></div>)}
          </div>
        ) : (
          <div>
            {sections.map((x) => (
              <div key={x.id} className={`sec-edit ${x.removed ? 'removed' : ''}`}>
                <div className="sec-edit-head">
                  <input className="input" style={{ flex: 1, fontWeight: 600, background: 'transparent', border: 0 }} value={x.heading} onChange={(e) => editSec(x.id, { heading: e.target.value })} aria-label="Section heading" />
                  {countPlaceholders(x.body) > 0 && <Badge tone="warn">{countPlaceholders(x.body)}</Badge>}
                  {v && x.key !== 'custom' && <Btn size="sm" variant="ghost" icon={<RefreshCw size={12} />} title="Regenerate this section from current data" onClick={() => { const n = regenerateSection(s, v, a.type, x.key, tone, length); if (n) { editSec(x.id, { body: n.body, heading: n.heading }); toast('Section regenerated — save to keep it'); } else toast('This section is not produced at the current length.', 'warn'); }}>Regenerate</Btn>}
                  <Btn size="sm" variant="ghost" icon={x.removed ? <RotateCcw size={12} /> : <Trash2 size={12} />} onClick={() => editSec(x.id, { removed: !x.removed })}>{x.removed ? 'Restore' : 'Remove'}</Btn>
                </div>
                {!x.removed && <textarea className="textarea" value={x.body} rows={Math.min(14, Math.max(3, x.body.split('\n').length + 1))} onChange={(e) => editSec(x.id, { body: e.target.value })} aria-label={x.heading} />}
              </div>
            ))}
            <Btn size="sm" icon={<Plus size={13} />} onClick={() => { setSections([...sections, { id: uid('sec'), key: 'custom', heading: 'Additional messaging', body: '', removed: false }]); setDirty(true); }}>Insert section</Btn>
            <p className="tiny muted" style={{ marginTop: 6 }}>Formatting: blank line = paragraph · “- ” bullet · “### ” subheading · “| a | b |” table row · **bold line**.</p>
          </div>
        )}
      </Section>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Section title="Approval" hint={<Prov kind="consultant" label="Human-in-the-loop" />}>
          <div className="row">
            <Btn size="sm" icon={<Send size={13} />} disabled={a.approvalStatus !== 'draft' || dirty} onClick={() => { const e = setArtifactApproval(a.id, 'pending'); toast(e ?? 'Submitted for approval', e ? 'warn' : 'ok'); }}>Submit for approval</Btn>
            <Btn size="sm" variant="primary" icon={<Check size={13} />} disabled={a.approvalStatus === 'approved' || dirty} onClick={async () => {
              if (phs.length && !(await ask('Approve with open placeholders?', `${phs.length} placeholder(s) remain (e.g. ${phs[0]}). Approving records the consultant's decision; placeholders will still appear in the document.`, 'Approve anyway'))) return;
              const e = setArtifactApproval(a.id, 'approved'); toast(e ?? 'Approved — the document is not sent anywhere.', e ? 'warn' : 'ok');
            }}>Approve</Btn>
            <Btn size="sm" disabled={a.approvalStatus === 'draft'} onClick={() => setArtifactApproval(a.id, 'draft')}>Return to draft</Btn>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Content approver(s): {v?.roles.approvers.map((r) => s.communicatorRoles.find((x) => x.id === r)?.name).join(', ') || 'not assigned'}. Approved documents are never overwritten automatically; edits create a new draft version.</p>
          {phs.length > 0 && <div className="small" style={{ marginTop: 8 }}><strong>Placeholders to confirm:</strong> <PhText text={phs.slice(0, 12).join(' ')} /></div>}
        </Section>
        <Section title="Version history" hint={`${a.versions.length} version(s)`} flush>
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            {[...a.versions].reverse().map((x) => {
              const idx = a.versions.indexOf(x);
              return (
                <div key={x.v} className="issue">
                  <div className="grow small"><strong>v{x.v}</strong> · {x.origin} · {fmtDateTime(x.createdAt)}<div className="muted">{x.note} · tone {x.tone}, {x.length}</div></div>
                  <Btn size="sm" variant={idx === viewIdx ? 'primary' : 'default'} onClick={() => setViewIdx(idx)}>View</Btn>
                  {idx !== a.versions.length - 1 && <Btn size="sm" onClick={() => { saveArtifactVersion(a.id, x.sections, x.meta, 'restored', `Restored from v${x.v}`, x.tone, x.length); toast(`v${x.v} restored as a new version`); }}>Restore</Btn>}
                </div>
              );
            })}
          </div>
          <div style={{ padding: 10 }}>
            <Btn size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={async () => {
              if (await ask(`Delete ${a.code}`, 'The artifact and all of its versions will be deleted. The communication record is kept.', 'Delete artifact', true)) {
                mutate((dd) => { dd.artifacts = dd.artifacts.filter((y) => y.id !== a.id); }, { entityType: 'artifact', entityId: a.id, action: 'delete', summary: `${a.code} deleted` });
                onDeleted();
              }
            }}>Delete artifact</Btn>
          </div>
        </Section>
      </div>
      {node}
    </div>
  );
}

function Generator({ onDone }: { onDone: (id: string) => void }) {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const d = useMemo(() => derive(s), [s]);
  const [q, setQ] = useState('');
  const [commId, setCommId] = useState<string>('');
  const [type, setType] = useState<ArtifactType | ''>('');
  const [tone, setTone] = useState<Tone | ''>('');
  const [length, setLength] = useState<ArtifactLength>('standard');
  const v = commId ? d.commById.get(commId) : undefined;
  const list = d.activeComms.filter((c) => !q || includesCI(`${c.rec.code} ${c.audience.roleName} ${c.milestone.name}`, q));
  const steps = ['Communication record', 'Artifact type (from milestone, audience, channel)', 'Engagement facts & linked changes', 'Impact assessment & messaging brief', 'Communicator & timing', 'Editable draft with placeholders'];
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Section title="1. Select communication record" flush>
        <div style={{ padding: 10 }}><input className="input" placeholder="Search audience, milestone, or ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search communication records" /></div>
        <div style={{ maxHeight: 460, overflow: 'auto' }}>
          {!list.length && <Empty title="No active communication records" />}
          {list.map((c) => (
            <button key={c.rec.id} className="issue" onClick={() => { setCommId(c.rec.id); setType(c.artifactTypes[0]); setTone(''); }} style={{ width: '100%', border: 0, borderBottom: '1px solid var(--divider)', textAlign: 'left', cursor: 'pointer', background: commId === c.rec.id ? 'var(--pale)' : 'transparent' }}>
              <div className="grow"><div className="small strong">{c.audience.roleName}</div><div className="tiny muted">{c.rec.code} · {milestoneLabel(s, c.milestone)} · {OBJECTIVES[c.rec.objective]}</div></div>
              {c.artifacts.length > 0 && <Badge tone="ok">{c.artifacts.length} doc</Badge>}
            </button>
          ))}
        </div>
      </Section>
      <Section title="2. Configure and generate">
        {!v ? <Empty title="Select a communication record">The artifact type is recommended from the milestone, audience, and channel plan.</Empty> : (
          <div className="stack">
            <dl className="kv"><dt>Record</dt><dd>{v.rec.code} — {v.audience.roleName}</dd><dt>Milestone</dt><dd>{milestoneLabel(s, v.milestone)}</dd><dt>Communicator</dt><dd>{v.roles.primary ? s.communicatorRoles.find((r) => r.id === v.roles.primary)?.name : 'Requires review'}</dd>
              <dt>Channels</dt><dd>{[v.channels.primary, ...v.channels.secondary].filter(Boolean).map((x) => s.channels.find((c) => c.id === x)?.name).join(', ')}</dd><dt>Linked changes</dt><dd>{v.changes.map((c) => c.code).join(', ') || 'None'}</dd></dl>
            <Field label="Artifact type">
              <select className="select" value={type} onChange={(e) => setType(e.target.value as ArtifactType)}>
                <optgroup label="Recommended">{v.artifactTypes.map((t) => <option key={t} value={t}>{ARTIFACT_TYPES[t].letter}. {ARTIFACT_TYPES[t].label}</option>)}</optgroup>
                <optgroup label="All templates">{(Object.keys(ARTIFACT_TYPES) as ArtifactType[]).filter((t) => !v.artifactTypes.includes(t)).map((t) => <option key={t} value={t}>{ARTIFACT_TYPES[t].letter}. {ARTIFACT_TYPES[t].label}</option>)}</optgroup>
              </select>
            </Field>
            {type && <p className="small muted">{ARTIFACT_TYPES[type].description}</p>}
            <div className="grid g2">
              <Field label="Tone"><Select value={tone} placeholder={`Default — ${TONES[v.brief.tone]}`} options={Object.entries(TONES).map(([k, x]) => ({ value: k as Tone, label: x }))} onChange={setTone} /></Field>
              <Field label="Length"><Select value={length} options={[{ value: 'concise', label: 'Concise' }, { value: 'standard', label: 'Standard' }, { value: 'detailed', label: 'Detailed' }]} onChange={(x) => setLength(x as ArtifactLength)} /></Field>
            </div>
            <ol className="clean small muted">{steps.map((x) => <li key={x}>{x}</li>)}</ol>
            <Btn variant="primary" icon={<FilePlus2 size={14} />} disabled={!type} onClick={() => { const id = generateArtifact(v.rec.id, type as ArtifactType, tone || undefined, length); if (id) { toast('Draft generated — review placeholders before approval'); onDone(id); } }}>Generate draft</Btn>
            <p className="tiny muted">Generation is template-based and deterministic (no external AI service is configured). Missing facts appear as [PLACEHOLDERS].</p>
          </div>
        )}
      </Section>
    </div>
  );
}

function KTTracker() {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const set = (id: string, patch: Partial<KTItem>) => mutate((d) => { Object.assign(d.kt.find((k) => k.id === id)!, patch); }, { entityType: 'kt', entityId: id, action: 'update', summary: 'KT tracking updated' });
  const cols: { k: keyof KTItem; label: string; w: number }[] = [
    { k: 'workstream', label: 'Workstream', w: 140 }, { k: 'process', label: 'Process', w: 150 }, { k: 'reportingPeriod', label: 'Reporting period', w: 150 },
    { k: 'plannedActivities', label: 'Planned', w: 200 }, { k: 'completedActivities', label: 'Completed', w: 200 }, { k: 'openActivities', label: 'Open', w: 200 },
    { k: 'issues', label: 'Issues & risks', w: 180 }, { k: 'dependencies', label: 'Dependencies', w: 160 }, { k: 'decisions', label: 'Decisions required', w: 160 }, { k: 'nextSteps', label: 'Next steps', w: 160 },
  ];
  return (
    <Section title="Knowledge Transfer tracker" hint="KT status reports are generated only from these entries — progress, completion, and sign-off are never estimated."
      actions={<Btn size="sm" icon={<Plus size={13} />} onClick={() => mutate((d) => { d.kt.push({ id: uid('kt'), workstream: '', process: 'New process', waveId: d.waves[0]?.id ?? null, ktPhase: 'Planning', reportingPeriod: '', plannedActivities: '', completedActivities: '', openActivities: '', readiness: 'not_assessed', issues: '', dependencies: '', decisions: '', nextSteps: '' }); }, { entityType: 'kt', entityId: 'new', action: 'add', summary: 'KT item added' })}>Add KT item</Btn>} flush>
      {!s.kt.length ? <Empty title="No KT data">Add KT items to enable KT status reports.</Empty> : (
        <div className="mx-scroll"><table className="tbl">
          <thead><tr><th>Wave</th><th>KT phase</th><th>Readiness</th>{cols.map((c) => <th key={c.k}>{c.label}</th>)}<th /></tr></thead>
          <tbody>{s.kt.map((k) => (
            <tr key={k.id}>
              <td><select className="select" value={k.waveId ?? ''} onChange={(e) => set(k.id, { waveId: e.target.value || null })} aria-label="Wave"><option value="">All</option>{s.waves.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></td>
              <td><select className="select" value={k.ktPhase} onChange={(e) => set(k.id, { ktPhase: e.target.value as KTItem['ktPhase'] })} aria-label="KT phase">{['Planning', 'Documentation', 'Shadow', 'Reverse shadow', 'Sign-off', 'Complete'].map((x) => <option key={x}>{x}</option>)}</select></td>
              <td><select className="select" value={k.readiness} onChange={(e) => set(k.id, { readiness: e.target.value as KTItem['readiness'] })} aria-label="Readiness"><option value="not_assessed">Not assessed</option><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="off_track">Off track</option></select></td>
              {cols.map((c) => <td key={c.k} style={{ minWidth: c.w }}><TextIn multiline={c.w >= 160} rows={2} value={String(k[c.k] ?? '')} onCommit={(x) => set(k.id, { [c.k]: x } as Partial<KTItem>)} /></td>)}
              <td><Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label="Delete KT item" onClick={() => mutate((d) => { d.kt = d.kt.filter((x) => x.id !== k.id); }, { entityType: 'kt', entityId: k.id, action: 'delete', summary: 'KT item deleted' })} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Section>
  );
}
