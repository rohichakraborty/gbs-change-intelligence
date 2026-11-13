import { useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, Plus, Search, CheckSquare, Square, Pencil, Trash2, RotateCcw, Package, Upload, AlertTriangle, CheckCircle2, Loader2, XCircle, UserPlus, Link2, Ban } from 'lucide-react';
import { useApp } from '../../store/store';
import type { AICandidate, AIGeneration, AIStep, RoleSuggestion } from '../../domain/types';
import { DIM_ID, type DimCode } from '../../catalogue/types';
import { ARCHETYPE_LABELS } from '../../domain/library';
import { detectProvider, type ProviderStatus } from '../../ai/providers';
import { matchRole } from '../../ai/roles';
import { derive } from '../../engine/derive';
import { fmtDateTime } from '../../domain/util';
import { addRolesAsStakeholders, deletePack, editCandidate, mapRole, publishPack, runDimension, runGeneration, savePack, selectCandidates, setCandidatesRemoved, setRoleStatus } from '../../store/aiActions';
import { Badge, Btn, Empty, Field, Modal, Section, useConfirm } from '../../ui/kit';
import { DIM_LABEL } from './ChangeLibrary';

const DIMS: DimCode[] = ['OM', 'PR', 'OS', 'TE', 'IM'];
const REL_LABEL: Record<string, string> = { direct: 'Proposed direct', indirect: 'Proposed indirect', governance: 'Governance', awareness: 'Communication', review: 'Requires review' };
const REL_TONE: Record<string, 'crit' | 'warn' | 'info' | 'muted' | 'ai'> = { direct: 'crit', indirect: 'warn', governance: 'info', awareness: 'muted', review: 'ai' };

// Generation keeps running if the user switches tabs; the controller lives at module level.
let controller: AbortController | null = null;
const busy = new Set<string>();

export function AIGenerate({ initialFunction, onReview }: { initialFunction?: string; onReview: () => void }) {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const setView = useApp((x) => x.setView);
  const [status, setStatus] = useState<ProviderStatus>({ provider: null, state: 'checking', label: 'Checking AI provider…', detail: '' });
  const [fn, setFn] = useState(initialFunction ?? s.engagement.functions[0]?.name ?? '');
  const [newFn, setNewFn] = useState('');
  const [desc, setDesc] = useState('');
  const [procs, setProcs] = useState('');
  const [tech, setTech] = useState('');
  const [doc, setDoc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [genId, setGenId] = useState<string | null>(null);
  const [, force] = useState(0);
  const { ask, node } = useConfirm();

  const refresh = () => { setStatus({ provider: null, state: 'checking', label: 'Checking AI provider…', detail: '' }); detectProvider().then(setStatus); };
  useEffect(refresh, []);
  useEffect(() => { if (initialFunction) setFn(initialFunction); }, [initialFunction]);

  const target = (fn === '__new' ? newFn : fn).trim();
  const gens = s.aiGenerations;
  const g = gens.find((x) => x.id === genId) ?? gens.find((x) => x.function === target) ?? null;

  const generate = async () => {
    if (!status.provider) return;
    setError(null); setRunning(true);
    controller = new AbortController();
    try {
      const id = await runGeneration(status.provider, {
        function: target, functionDescription: desc.trim(), documentExcerpt: doc.trim().slice(0, 30000),
        processes: procs.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean), technologies: tech.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean),
      }, { signal: controller.signal });
      setGenId(id);
      const gg = useApp.getState().current!.aiGenerations.find((x) => x.id === id)!;
      toast(`${gg.candidates.length} candidate change(s) generated for ${gg.function}${gg.status === 'partial' ? ' — some dimensions failed, retry them below' : ''}`);
      if (fn === '__new') { setFn(target); setNewFn(''); }
    } catch (e) {
      setError((e as Error).message);
      const latest = useApp.getState().current!.aiGenerations[0];
      if (latest?.function.toLowerCase() === target.toLowerCase()) setGenId(latest.id);
    } finally { setRunning(false); controller = null; }
  };

  const dimAction = async (gen: AIGeneration, dim: DimCode, mode: 'initial' | 'more' | 'replace') => {
    if (!status.provider) return;
    const key = `${gen.id}|${dim}`;
    busy.add(key); force((n) => n + 1);
    try {
      const n = await runDimension(status.provider, gen.id, dim, mode);
      toast(mode === 'more' ? `${n} more change(s) added for ${DIM_LABEL[dim]}` : `${DIM_LABEL[dim]}: ${n} change(s) generated`);
    } catch (e) { toast(`${DIM_LABEL[dim]}: ${(e as Error).message}`); }
    finally { busy.delete(key); force((n) => n + 1); }
  };

  const fnOptions = Array.from(new Set([...s.engagement.functions.map((f) => f.name), ...gens.map((x) => x.function)]));

  return (
    <div className="stack">
      <ProviderCard status={status} onRefresh={refresh} />
      <Section title="Generate changes for any function" hint="The model drafts candidate changes across the five dimensions using the engagement context. Nothing enters the Change Register until you tick it.">
        <div className="grid g2">
          <Field label="Function" htmlFor="ai-fn" help="Pick an in-scope function or type any other (e.g. Sales Operations, Sustainability Management, Data Management Office). New functions are added to the engagement.">
            <select id="ai-fn" className="select" value={fn} onChange={(e) => setFn(e.target.value)}>
              {fnOptions.map((f) => <option key={f} value={f}>{f}</option>)}
              <option value="__new">+ Another function…</option>
            </select>
            {fn === '__new' && <input className="input" style={{ marginTop: 6 }} placeholder="Function name" value={newFn} onChange={(e) => setNewFn(e.target.value)} aria-label="New function name" />}
          </Field>
          <Field label="Function description (optional)" htmlFor="ai-desc" help="Scope, activities, pain points. Leave empty and the model works from the name and engagement context.">
            <textarea id="ai-desc" className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Order management, CRM administration, pipeline reporting" />
          </Field>
          <Field label="Processes in scope (optional)" htmlFor="ai-proc"><input id="ai-proc" className="input" value={procs} onChange={(e) => setProcs(e.target.value)} placeholder="Comma-separated" /></Field>
          <Field label="Technologies (optional)" htmlFor="ai-tech"><input id="ai-tech" className="input" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="e.g. Salesforce, SAP S/4HANA" /></Field>
        </div>
        <details style={{ marginTop: 6 }}>
          <summary className="small muted" style={{ cursor: 'pointer' }}>Paste a document excerpt (optional)</summary>
          <textarea className="input" rows={4} style={{ marginTop: 6, width: '100%' }} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Operating model notes, scope documents… Only what you paste here is sent to the model." aria-label="Document excerpt" />
        </details>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <Btn variant="teal" icon={running ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} disabled={!status.provider || running || target.length < 2}
            onClick={async () => {
              if (gens.some((x) => x.function.toLowerCase() === target.toLowerCase() && x.status !== 'failed') && !(await ask('Generate again?', `A generation for ${target} already exists. A new one is added alongside it; changes already in the register are kept.`, 'Generate'))) return;
              generate();
            }}>{running ? 'Generating…' : `Generate changes with AI${target ? ` for ${target}` : ''}`}</Btn>
          {running && <Btn onClick={() => controller?.abort()}>Cancel</Btn>}
          {!status.provider && status.state !== 'checking' && <span className="small muted">Generation is unavailable until an AI provider is configured (see above).</span>}
        </div>
        {error && <div className="banner crit small" style={{ marginTop: 10 }}><XCircle size={15} /><div className="grow"><strong>Generation failed:</strong> {error}</div>{status.provider && <Btn size="sm" onClick={generate}>Retry</Btn>}</div>}
      </Section>

      {gens.length > 0 && (
        <div className="chips">
          {gens.slice(0, 12).map((x) => (
            <button key={x.id} className={`chip ${g?.id === x.id ? 'on' : ''}`} onClick={() => setGenId(x.id)} title={`${x.provider} · ${fmtDateTime(x.createdAt)}`}>
              {x.function} · {x.candidates.filter((c) => c.status === 'candidate').length} <span className="tiny muted">{fmtDateTime(x.createdAt)}</span>
            </button>
          ))}
        </div>
      )}

      {g ? <GenerationView g={g} canRun={!!status.provider} busy={busy} onDim={dimAction} onReview={onReview} onImpact={() => setView('impact-assessment')} ask={ask} /> :
        <Empty title="No AI generation yet">Choose a function and select <em>Generate changes with AI</em>. Generated changes show here as a checklist grouped by dimension.</Empty>}
      <PacksPanel ask={ask} />
      <LogPanel />
      {node}
    </div>
  );
}

function ProviderCard({ status, onRefresh }: { status: ProviderStatus; onRefresh: () => void }) {
  const tone = status.state === 'ready' ? 'info' : status.state === 'checking' ? 'info' : 'warn';
  return (
    <div className={`banner ${tone} small`}>
      {status.state === 'ready' ? <CheckCircle2 size={16} /> : status.state === 'checking' ? <Loader2 size={16} className="spin" /> : <AlertTriangle size={16} />}
      <div className="grow">
        <strong>{status.label}</strong>{status.detail && <> — {status.detail}</>}
        {status.state === 'ready' && <div className="tiny muted">AI output is a draft: every generated change is marked as AI-generated, not client evidence, and requires consultant validation.</div>}
      </div>
      <Btn size="sm" icon={<RefreshCw size={13} />} onClick={onRefresh}>Re-check</Btn>
    </div>
  );
}

function StepPill({ st }: { st: AIStep }) {
  const label = st.key === 'roles' ? 'Roles' : DIM_LABEL[st.key as DimCode];
  const icon = st.status === 'running' ? <Loader2 size={12} className="spin" /> : st.status === 'ok' ? <CheckCircle2 size={12} /> : st.status === 'failed' ? <XCircle size={12} /> : null;
  const tone = st.status === 'ok' ? 'ok' : st.status === 'failed' ? 'crit' : st.status === 'running' ? 'info' : 'muted';
  const title = [st.error, st.attempts > 1 ? `${st.attempts} attempts (output repaired)` : '', st.rejected.length ? `${st.rejected.length} invalid record(s) rejected: ${st.rejected.map((r) => r.reason).join('; ')}` : '', st.duplicates ? `${st.duplicates} duplicate(s) removed` : ''].filter(Boolean).join('\n');
  return <span title={title}><Badge tone={tone}>{icon} {label}{st.status === 'ok' ? ` · ${st.valid}` : ''}</Badge></span>;
}

function GenerationView({ g, canRun, busy, onDim, onReview, onImpact, ask }: {
  g: AIGeneration; canRun: boolean; busy: Set<string>; onDim: (g: AIGeneration, d: DimCode, m: 'initial' | 'more' | 'replace') => void; onReview: () => void; onImpact: () => void;
  ask: (t: string, b: React.ReactNode, c?: string, danger?: boolean) => Promise<boolean>;
}) {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const [q, setQ] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState<AICandidate | null>(null);
  const [packOpen, setPackOpen] = useState(false);
  const selected = useMemo(() => new Map(s.changes.filter((c) => c.active && c.templateId).map((c) => [c.templateId!, c])), [s.changes]);
  const match = (c: AICandidate) => !q.trim() || `${c.template.title} ${c.template.description} ${c.template.processTags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase());
  const toggle = (ids: string[], on: boolean) => {
    const r = selectCandidates(ids, on);
    if (on && r.added + r.reactivated) toast(`${r.added + r.reactivated} AI change(s) added to the Change Register`);
    if (!on && r.removed) toast(`${r.removed} change(s) removed from scope — records kept`);
  };
  const live = g.candidates.filter((c) => c.status === 'candidate');
  const nSel = live.filter((c) => selected.has(c.id)).length;

  return (
    <>
      <Section title={<span><Sparkles size={14} /> {g.function} — AI-generated candidate changes</span>}
        hint={`${g.provider}${g.model ? ` · ${g.model}` : ''} · ${fmtDateTime(g.createdAt)} · ${live.length} candidate(s), ${nSel} in register`}
        actions={<>
          <Btn size="sm" icon={<CheckSquare size={13} />} disabled={!live.some((c) => !selected.has(c.id) && match(c))} onClick={() => toggle(live.filter(match).map((c) => c.id), true)}>Select all{q ? ' matching' : ''}</Btn>
          <Btn size="sm" icon={<Square size={13} />} disabled={!nSel} onClick={async () => { if (await ask('Clear selections', `${nSel} AI change(s) will be removed from scope. Records and decisions are kept.`, 'Clear')) toggle(live.map((c) => c.id), false); }}>Clear</Btn>
          <Btn size="sm" icon={<Package size={13} />} disabled={!live.length} onClick={() => setPackOpen(true)}>Save as change pack</Btn>
          <Btn size="sm" variant="teal" disabled={!nSel} onClick={onReview}>Review in register</Btn>
        </>}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>{g.steps.map((st) => <StepPill key={st.key} st={st} />)}
          {g.status === 'running' && <span className="small muted">Generating… you can keep working; results appear as each dimension completes.</span>}</div>
        {g.interpretation && <div className="small" style={{ marginBottom: 6 }}><span className="muted">Model's interpretation:</span> {g.interpretation}</div>}
        {g.clarityWarning && <div className="banner warn small"><AlertTriangle size={15} /><div className="grow">{g.clarityWarning} Add a function description and regenerate for better results.</div></div>}
        <div className="mx-toolbar">
          <div className="row" style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-2)' }} />
            <input className="input" style={{ paddingLeft: 28, width: 260 }} placeholder="Search generated changes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search generated changes" />
          </div>
          <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Show removed</label>
        </div>
        {DIMS.map((dim) => {
          const st = g.steps.find((x) => x.key === dim);
          const list = g.candidates.filter((c) => c.dim === dim && (showRemoved || c.status === 'candidate') && match(c));
          const all = g.candidates.filter((c) => c.dim === dim && c.status === 'candidate');
          const sel = all.filter((c) => selected.has(c.id)).length;
          const isBusy = busy.has(`${g.id}|${dim}`) || st?.status === 'running';
          return (
            <div key={dim}>
              <div className="lib-group-head">
                <span className="tag dim">{dim}</span><span className="t">Change in {DIM_LABEL[dim]}</span>
                <span className="small muted">{sel}/{all.length} selected</span>
                {st?.status === 'failed' && <Badge tone="crit">failed</Badge>}
                {isBusy && <Loader2 size={13} className="spin" />}
                <span style={{ flex: 1 }} />
                <Btn size="sm" variant="ghost" disabled={sel === all.length || !all.length} onClick={() => toggle(all.map((c) => c.id), true)}>Select all</Btn>
                <Btn size="sm" variant="ghost" icon={<Plus size={12} />} disabled={!canRun || isBusy} onClick={() => onDim(g, dim, st?.status === 'failed' && !all.length ? 'initial' : 'more')}>{st?.status === 'failed' && !all.length ? 'Retry' : 'Add more'}</Btn>
                <Btn size="sm" variant="ghost" icon={<RefreshCw size={12} />} disabled={!canRun || isBusy || !all.length} onClick={async () => { if (await ask(`Regenerate ${DIM_LABEL[dim]}`, 'Unselected candidates in this dimension are replaced. Changes already in the register are kept.', 'Regenerate')) onDim(g, dim, 'replace'); }}>Regenerate</Btn>
              </div>
              {st?.status === 'failed' && <div className="banner crit small"><XCircle size={14} /><div className="grow">{st.error}</div></div>}
              {st?.status === 'ok' && !all.length && <div className="small muted" style={{ padding: '6px 12px' }}>The model returned no valid changes for this dimension. Use Add more, or add a custom change if something applies.</div>}
              {list.map((c) => <CandidateRow key={c.id} c={c} on={selected.has(c.id)} code={selected.get(c.id)?.code} onToggle={(on) => toggle([c.id], on)} onEdit={() => setEditing(c)}
                onRemove={() => setCandidatesRemoved(g.id, [c.id], c.status === 'candidate')} />)}
            </div>
          );
        })}
      </Section>
      <RolesPanel g={g} ask={ask} />
      <DownstreamPanel g={g} onImpact={onImpact} />
      {editing && <EditCandidate g={g} c={editing} onClose={() => setEditing(null)} />}
      {packOpen && <SavePackModal g={g} selectedIds={new Set(live.filter((c) => selected.has(c.id)).map((c) => c.id))} onClose={() => setPackOpen(false)} />}
    </>
  );
}

function CandidateRow({ c, on, code, onToggle, onEdit, onRemove }: { c: AICandidate; on: boolean; code?: string; onToggle: (on: boolean) => void; onEdit: () => void; onRemove: () => void }) {
  const t = c.template;
  const rels = t.rules.map((r) => ({ label: r.roleLabel ?? r.roles.join(', '), kind: r.kind }));
  const removed = c.status === 'removed';
  return (
    <div className={`lib-item ${on ? 'on' : ''}`} style={removed ? { opacity: 0.5 } : undefined}>
      <input type="checkbox" checked={on} disabled={removed} onChange={(e) => onToggle(e.target.checked)} aria-label={`Select ${t.title}`} style={{ marginTop: 3 }} />
      <div style={{ minWidth: 0 }}>
        <div className="ttl">{t.title} {c.edited && <span className="tiny muted">(edited)</span>}</div>
        <div className="desc">{t.description}</div>
        <details className="small"><summary className="muted" style={{ cursor: 'pointer' }}>As-is / to-be, mechanisms, assumptions</summary>
          <div><strong>As-is:</strong> {t.typicalAsIs}</div><div><strong>To-be:</strong> {t.typicalToBe}</div>
          {t.changeMechanisms?.length ? <div><strong>Mechanisms:</strong> {t.changeMechanisms.join(', ')}</div> : null}
          {t.assumptions?.length ? <div><strong>Assumptions:</strong> {t.assumptions.join('; ')}</div> : null}
          {t.rules.map((r) => <div key={r.id} className="tiny">• <strong>{r.roleLabel ?? r.roles.join(', ')}</strong> — {REL_LABEL[r.kind] ?? r.kind}: {r.mechanism}</div>)}
        </details>
        <div className="meta">
          <Badge tone="ai">AI-generated</Badge>
          {t.processTags.slice(0, 2).map((p) => <span key={p} className="tag">{p}</span>)}
          {rels.slice(0, 6).map((r, i) => <span key={i} title={REL_LABEL[r.kind]}><Badge tone={REL_TONE[r.kind] ?? 'muted'}>{r.label}</Badge></span>)}
        </div>
      </div>
      <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
        {code && <span className="mono tiny">{code}</span>}
        <Btn size="sm" variant="ghost" icon={<Pencil size={12} />} disabled={on || removed} title={on ? 'Already in the register — edit it there' : 'Edit before selecting'} onClick={onEdit}>Edit</Btn>
        <Btn size="sm" variant="ghost" icon={removed ? <RotateCcw size={12} /> : <Trash2 size={12} />} disabled={on} onClick={onRemove}>{removed ? 'Restore' : 'Remove'}</Btn>
      </div>
    </div>
  );
}

function EditCandidate({ g, c, onClose }: { g: AIGeneration; c: AICandidate; onClose: () => void }) {
  const [v, setV] = useState({ title: c.template.title, description: c.template.description, typicalAsIs: c.template.typicalAsIs, typicalToBe: c.template.typicalToBe, process: c.template.processTags.join(', ') });
  const F = (k: keyof typeof v, label: string, rows = 2) => <Field label={label}><textarea className="input" rows={rows} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>;
  return (
    <Modal title="Edit generated change" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={v.title.trim().length < 5} onClick={() => {
      editCandidate(g.id, c.id, { title: v.title.trim(), description: v.description.trim(), typicalAsIs: v.typicalAsIs.trim(), typicalToBe: v.typicalToBe.trim(), processTags: v.process.split(',').map((x) => x.trim()).filter(Boolean) });
      onClose();
    }}>Save</Btn></>}>
      {F('title', 'Title', 1)}{F('description', 'Description', 3)}{F('typicalAsIs', 'Typical as-is')}{F('typicalToBe', 'Typical to-be')}{F('process', 'Process area', 1)}
      <p className="tiny muted">Stakeholder relationships stay as generated; refine impacts in the Impact Assessment after selection.</p>
    </Modal>
  );
}

function RolesPanel({ g, ask }: { g: AIGeneration; ask: (t: string, b: React.ReactNode, c?: string, danger?: boolean) => Promise<boolean> }) {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const keys = new Set(g.roles.map((r) => r.key));
  const roles = s.roleSuggestions.filter((r) => r.generationId === g.id || keys.has(r.key));
  if (!roles.length) return null;
  const stakeholders = s.stakeholders;
  const proposed = roles.filter((r) => r.status === 'proposed');
  const nameOf = (id: string | null) => stakeholders.find((x) => x.id === id)?.roleName ?? '—';
  const confirmMap = async (r: RoleSuggestion, stId: string) => {
    const st = stakeholders.find((x) => x.id === stId)!;
    if (await ask('Map role to existing stakeholder?', <>AI role <strong>{r.role}</strong> will be treated as <strong>{st.roleName}</strong>. Impacts the AI attributes to this role will apply to that stakeholder. You can undo this.</>, 'Map')) { mapRole(r.key, stId); toast(`${r.role} mapped to ${st.roleName}`); }
  };
  return (
    <Section title="Proposed stakeholders" hint="Roles the generated changes refer to, compared with your Stakeholder Register. Nothing is added or merged without your confirmation. Impacts only apply to mapped or added roles."
      actions={<Btn size="sm" icon={<UserPlus size={13} />} disabled={!proposed.length} onClick={async () => {
        if (await ask('Add proposed roles', `${proposed.length} role(s) will be added to the Stakeholder Register as custom stakeholders: ${proposed.map((r) => r.role).join(', ')}.`, 'Add all')) addRolesAsStakeholders(proposed.map((r) => r.key));
      }}>Add all proposed ({proposed.length})</Btn>}>
      <table className="table">
        <thead><tr><th>AI-suggested role</th><th>Type</th><th>Status</th><th>Possible matches in register</th><th /></tr></thead>
        <tbody>
          {roles.map((r) => {
            const matches = r.status === 'proposed' ? matchRole(r.role, stakeholders) : [];
            return (
              <tr key={r.key}>
                <td><strong>{r.role}</strong><div className="tiny muted">{r.description}</div></td>
                <td className="small">{ARCHETYPE_LABELS[r.archetype] ?? r.archetype}</td>
                <td>{r.status === 'mapped' ? <Badge tone="ok">{r.autoMatched ? 'Matched' : 'Mapped'} → {nameOf(r.stakeholderId)}</Badge> : r.status === 'added' ? <Badge tone="ok">Added</Badge> : r.status === 'rejected' ? <Badge tone="muted">Not used</Badge> : <Badge tone="warn">Proposed</Badge>}</td>
                <td className="small">{r.status === 'proposed' ? (matches.length ? matches.map((m) => (
                  <button key={m.stakeholder.id} className="btn ghost sm" onClick={() => confirmMap(r, m.stakeholder.id)} title={`Similarity ${Math.round(m.score * 100)}%`}><Link2 size={11} /> {m.stakeholder.roleName}</button>
                )) : <span className="muted">No similar role</span>) : null}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.status === 'proposed' && <><Btn size="sm" icon={<UserPlus size={12} />} onClick={() => addRolesAsStakeholders([r.key])}>Add</Btn><Btn size="sm" variant="ghost" icon={<Ban size={12} />} onClick={() => setRoleStatus(r.key, 'rejected')}>Not used</Btn></>}
                  {(r.status === 'mapped' || r.status === 'rejected') && <Btn size="sm" variant="ghost" onClick={() => setRoleStatus(r.key, 'proposed')}>{r.status === 'mapped' ? 'Unmap' : 'Reconsider'}</Btn>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function DownstreamPanel({ g, onImpact }: { g: AIGeneration; onImpact: () => void }) {
  const s = useApp((x) => x.current)!;
  const d = useMemo(() => derive(s), [s]);
  const ids = new Set(g.candidates.map((c) => c.id));
  const recs = s.changes.filter((c) => c.active && c.templateId && ids.has(c.templateId));
  if (!recs.length) return null;
  const changeIds = new Set(recs.map((c) => c.id));
  const counts = { impacted: 0, review: 0, governance: 0 };
  const stImpacted = new Set<string>();
  for (const [k, cell] of d.impacts) {
    const hits = cell.changeIds?.some((id: string) => changeIds.has(id));
    if (hits && cell.classification === 'impacted') { counts.impacted++; stImpacted.add(k.split('|')[0]); }
    if (hits && cell.classification === 'review') counts.review++;
    if (cell.governanceChangeIds?.some((id: string) => changeIds.has(id))) counts.governance++;
  }
  const byDim = DIMS.map((k) => ({ k, n: recs.filter((c) => c.dimensionId === DIM_ID[k]).length }));
  return (
    <Section title="What these changes drive" hint="Live from the impact engine. Proposed impacts remain recommendations until you confirm them in the Impact Assessment."
      actions={<Btn size="sm" onClick={onImpact}>Open Impact Assessment</Btn>}>
      <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
        <span><strong className="num">{recs.length}</strong> register record(s) <span className="tiny muted">({byDim.filter((x) => x.n).map((x) => `${x.k} ${x.n}`).join(' · ')})</span></span>
        <span><strong className="num">{stImpacted.size}</strong> stakeholder(s) with proposed impact</span>
        <span><strong className="num">{counts.impacted}</strong> impacted cell(s)</span>
        <span><strong className="num">{counts.review}</strong> requiring review</span>
        <span><strong className="num">{counts.governance}</strong> governance-only cell(s)</span>
      </div>
      {s.roleSuggestions.some((r) => g.roles.some((x) => x.key === r.key) && r.status === 'proposed') && <div className="small muted" style={{ marginTop: 6 }}>Some roles are still proposed — their impacts appear once you add or map them above.</div>}
    </Section>
  );
}

function SavePackModal({ g, selectedIds, onClose }: { g: AIGeneration; selectedIds: Set<string>; onClose: () => void }) {
  const toast = useApp((x) => x.toast);
  const [name, setName] = useState(`${g.function} Change Pack`);
  const [scope, setScope] = useState<'selected' | 'all'>(selectedIds.size ? 'selected' : 'all');
  const list = g.candidates.filter((c) => c.status === 'candidate' && (scope === 'all' || selectedIds.has(c.id)));
  return (
    <Modal title="Save as reusable change pack" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!name.trim() || !list.length} onClick={() => {
      const r = savePack(name, g.function, list.map((c) => c.template));
      toast(`"${r.pack.name}" v${r.pack.version} saved with ${r.pack.templates.length} change(s)${r.skipped.length ? ` (${r.skipped.length} near-duplicate(s) skipped)` : ''}`);
      onClose();
    }}>Save pack</Btn></>}>
      <Field label="Pack name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Include"><select className="select" value={scope} onChange={(e) => setScope(e.target.value as 'selected' | 'all')}>
        <option value="selected" disabled={!selectedIds.size}>Selected changes ({selectedIds.size})</option><option value="all">All current candidates ({g.candidates.filter((c) => c.status === 'candidate').length})</option></select></Field>
      <p className="small muted">Packs are private to this engagement. Saving again with the same name creates a new version. Publishing to the shared library is a separate, explicit step — review the content for client-confidential details first.</p>
    </Modal>
  );
}

function PacksPanel({ ask }: { ask: (t: string, b: React.ReactNode, c?: string, danger?: boolean) => Promise<boolean> }) {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  if (!s.changePacks.length) return null;
  return (
    <Section title="Change packs" hint="Reusable sets of generated changes. Pack changes also appear in the Change Library under their function.">
      <table className="table">
        <thead><tr><th>Pack</th><th>Function</th><th>Version</th><th>Changes</th><th>Status</th><th /></tr></thead>
        <tbody>{s.changePacks.map((p) => (
          <tr key={p.id}>
            <td><strong>{p.name}</strong><div className="tiny muted">Updated {fmtDateTime(p.updatedAt)}</div></td>
            <td>{p.function}</td><td className="num">v{p.version}</td><td className="num">{p.templates.length}</td>
            <td>{p.status === 'published' ? <Badge tone="info">Published {fmtDateTime(p.publishedAt ?? "")}</Badge> : <Badge tone="muted">Engagement-private</Badge>}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <Btn size="sm" icon={<CheckSquare size={12} />} onClick={() => { const r = selectCandidates(p.templates.map((t) => t.templateId), true); toast(`${r.added + r.reactivated} change(s) from the pack added to the register`); }}>Select all</Btn>
              {p.status === 'private' && <Btn size="sm" variant="ghost" icon={<Upload size={12} />} onClick={async () => {
                if (await ask('Publish to the shared library?', <>The {p.templates.length} change(s) in <strong>{p.name}</strong> will be copied to the shared GBS Change Library and become visible to other engagements on this device or workspace. Remove any client names, figures or confidential details first. This cannot be undone automatically.</>, 'Publish')) {
                  const n = await publishPack(p.id); toast(`${n} template(s) published to the shared library`);
                }
              }}>Publish…</Btn>}
              <Btn size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={async () => { if (await ask('Delete pack?', 'Changes already selected from this pack keep their snapshot in the register.', 'Delete', true)) deletePack(p.id); }}>Delete</Btn>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </Section>
  );
}

function LogPanel() {
  const log = useApp((x) => x.current!.aiLog);
  if (!log.length) return null;
  return (
    <details>
      <summary className="small muted" style={{ cursor: 'pointer' }}>AI request log ({log.length})</summary>
      <table className="table" style={{ marginTop: 6 }}>
        <thead><tr><th>When</th><th>Function</th><th>Request</th><th>Provider / model</th><th>Result</th><th>Time</th></tr></thead>
        <tbody>{log.slice(0, 60).map((l, i) => (
          <tr key={i}><td className="tiny">{fmtDateTime(l.at)}</td><td className="small">{l.function}</td><td className="mono tiny">{l.purpose}</td><td className="tiny">{l.provider}{l.model ? ` · ${l.model}` : ''}</td>
            <td className="small">{l.ok ? <Badge tone="ok">ok{l.attempts > 1 ? ` (${l.attempts} tries)` : ''}</Badge> : <span title={l.error ?? ''}><Badge tone="crit">failed</Badge></span>}</td><td className="num tiny">{(l.ms / 1000).toFixed(1)}s</td></tr>
        ))}</tbody>
      </table>
    </details>
  );
}
