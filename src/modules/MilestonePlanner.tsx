import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../store/store';
import type { ArtifactType, Focus, Milestone } from '../domain/types';
import { ARTIFACT_TYPES, FOCUS_LABELS } from '../domain/library';
import { fmtDate, formatT, includesCI, parseDate, toISO, uid } from '../domain/util';
import { derive, sortMilestones } from '../engine/derive';
import { milestoneDate, milestoneOffset, waveName, anchorGoLive } from '../engine/timing';
import { Badge, Btn, Chips, Empty, PageHeader, Section, Seg, Select, TextIn, useConfirm, Prov } from '../ui/kit';

type V = 'library' | 'timeline' | 'calendar';

export function MilestonePlanner() {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const [view, setView] = useState<V>('library');
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState('');
  const [fn, setFn] = useState('');
  const [onlySel, setOnlySel] = useState(false);
  const [onlySug, setOnlySug] = useState(false);
  const { ask, node } = useConfirm();
  const d = useMemo(() => derive(s), [s]);
  const selId = inspector?.kind === 'milestone' ? inspector.milestoneId : null;

  const toggle = async (m: Milestone) => {
    const n = s.comms.filter((c) => c.milestoneId === m.id && !['proposed', 'cancelled'].includes(c.status)).length;
    if (m.selected && n && !(await ask('Deselect milestone', `${n} reviewed communication record(s) belong to "${m.name}". They are kept (not deleted) but removed from the active plan until the milestone is selected again.`, 'Deselect'))) return;
    mutate((dd) => { const x = dd.milestones.find((y) => y.id === m.id)!; x.selected = !x.selected; }, { entityType: 'milestone', entityId: m.id, action: m.selected ? 'deselect' : 'select', summary: `${m.name} ${m.selected ? 'deselected' : 'selected'}` });
  };
  const move = (m: Milestone, dir: -1 | 1) => {
    const peers = s.milestones.filter((x) => x.phaseId === m.phaseId).sort((a, b) => a.sortOrder - b.sortOrder);
    const i = peers.findIndex((x) => x.id === m.id);
    const o = peers[i + dir];
    if (!o) return;
    mutate((dd) => { const a = dd.milestones.find((x) => x.id === m.id)!, b = dd.milestones.find((x) => x.id === o.id)!; const t = a.sortOrder; a.sortOrder = b.sortOrder; b.sortOrder = t; }, { entityType: 'milestone', entityId: m.id, action: 'reorder', summary: `${m.name} reordered` });
  };
  const addCustom = (phaseId: string) => {
    const id = uid('ms');
    mutate((dd) => {
      dd.milestones.push({ id, phaseId, libraryKey: null, name: 'Custom milestone', description: '', selected: true, kind: 'milestone', waveId: null, anchor: 'relative', date: null, relativeOffset: 0,
        owner: '', dependencies: [], gating: '', functions: [], sortOrder: Math.max(0, ...dd.milestones.filter((x) => x.phaseId === phaseId).map((x) => x.sortOrder)) + 10,
        trigger: { required: true, focus: ['programme'], objective: '', leadTime: 0, followUp: '', artifactHints: [] }, recurrence: null });
    }, { entityType: 'milestone', entityId: id, action: 'add', summary: 'Custom milestone added' });
    inspect({ kind: 'milestone', milestoneId: id });
  };

  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="GBS Milestone & Transition Planner"
        sub={`Milestones are the temporal backbone of the plan. Only selected milestones populate communication planning. Relative timing is in ${s.engagement.timeUnit}, measured against the relevant wave go-live (T).`}
        actions={<Seg options={[{ value: 'library', label: 'Milestone library' }, { value: 'timeline', label: 'Timeline' }, { value: 'calendar', label: 'Communication calendar' }]} value={view} onChange={setView} />} />
      {view === 'library' && (
        <>
          {d.suggestedMilestones.size > 0 && (
            <div className="banner info"><div className="grow small"><strong>{d.suggestedMilestones.size} unselected milestone(s) are typical for the selected changes</strong> — marked “Suggested” below. They are not activated automatically.</div>
              <Btn size="sm" onClick={() => setOnlySug(!onlySug)}>{onlySug ? 'Show all' : 'Show suggested only'}</Btn>
              <Btn size="sm" variant="primary" onClick={async () => { if (await ask('Select suggested milestones', `${d.suggestedMilestones.size} milestone(s) will be selected and will start generating audience recommendations.`, 'Select')) mutate((dd) => { dd.milestones.forEach((m) => { if (d.suggestedMilestones.has(m.id)) m.selected = true; }); }, { entityType: 'milestone', entityId: 'bulk', action: 'select', summary: `${d.suggestedMilestones.size} suggested milestone(s) selected` }); }}>Select all suggested</Btn></div>
          )}
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="Search milestones…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search milestones" />
            <div style={{ width: 220 }}><Select value={phase} placeholder="All phases" options={s.phases.map((p) => ({ value: p.id, label: `${p.num}. ${p.name}` }))} onChange={setPhase} /></div>
            <div style={{ width: 200 }}><Select value={fn} placeholder="All functions" options={s.engagement.functions.map((f) => ({ value: f.name, label: f.name }))} onChange={setFn} /></div>
            <label className="check"><input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> Selected only</label>
            <span style={{ flex: 1 }} />
            <Badge tone="info">{d.activeMilestones.length} selected</Badge>
          </div>
          {s.phases.filter((p) => !phase || p.id === phase).map((p) => {
            const ms = s.milestones.filter((m) => m.phaseId === p.id && (!q || includesCI(m.name, q)) && (!onlySel || m.selected) && (!onlySug || d.suggestedMilestones.has(m.id)) && (!fn || !m.functions.length || m.functions.includes(fn))).sort((a, b) => a.sortOrder - b.sortOrder);
            const all = s.milestones.filter((m) => m.phaseId === p.id);
            const allOn = all.every((m) => m.selected);
            return (
              <Section key={p.id} title={`Phase ${p.num} — ${p.name}`} hint={`${all.filter((m) => m.selected).length} of ${all.length} selected`} flush
                actions={<><Btn size="sm" onClick={() => mutate((dd) => { dd.milestones.forEach((m) => { if (m.phaseId === p.id) m.selected = !allOn; }); }, { entityType: 'phase', entityId: p.id, action: 'bulk', summary: `${p.name}: ${allOn ? 'all deselected' : 'all selected'}` })}>{allOn ? 'Deselect all' : 'Select all in phase'}</Btn>
                  <Btn size="sm" icon={<Plus size={13} />} onClick={() => addCustom(p.id)}>Custom milestone</Btn></>}>
                {!ms.length ? <Empty title="No milestones match" /> : (
                  <div className="tbl-wrap"><table className="tbl">
                    <thead><tr><th style={{ width: 36 }}>Sel</th><th>Milestone</th><th>Type</th><th>Wave</th><th>Timing</th><th>Date</th><th>Owner</th><th>Comms</th><th>Audience focus</th><th /></tr></thead>
                    <tbody>{ms.map((m) => {
                      const date = milestoneDate(s, m);
                      return (
                        <tr key={m.id} className={`clickable ${selId === m.id ? 'sel' : ''}`} style={{ opacity: m.selected ? 1 : 0.6 }} onClick={() => inspect({ kind: 'milestone', milestoneId: m.id })}>
                          <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={m.selected} onChange={() => void toggle(m)} aria-label={`Select ${m.name}`} /></td>
                          <td style={{ minWidth: 230 }}><span className="strong">{m.name}</span>{!m.libraryKey && <> <Badge tone="ai">custom</Badge></>}
                            {d.suggestedMilestones.has(m.id) && <> <Badge tone="info" title={`Suggested by ${d.suggestedMilestones.get(m.id)!.map((id) => s.changes.find((c) => c.id === id)?.code).join(', ')}`}>Suggested by {d.suggestedMilestones.get(m.id)!.length} change(s)</Badge></>}</td>
                          <td className="small">{m.kind === 'recurring' ? <Badge tone="info">{m.recurrence?.cadence ?? 'recurring'}</Badge> : m.kind}</td>
                          <td className="small">{m.waveId ? waveName(s, m.waveId) : 'Engagement-wide'}</td>
                          <td className="num small strong">{m.kind === 'milestone' ? formatT(milestoneOffset(s, m)) : '—'}</td>
                          <td className="num small">{date ? fmtDate(date) : <span className="muted">—</span>}</td>
                          <td className="small">{m.owner || '—'}</td>
                          <td className="num small">{d.activeComms.filter((c) => c.milestone.id === m.id).length || ''}</td>
                          <td className="small muted" style={{ maxWidth: 240 }}>{m.trigger.required ? m.trigger.focus.map((f) => FOCUS_LABELS[f]).join(', ') : 'No communication normally required'}</td>
                          <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                            <Btn size="sm" variant="ghost" icon={<ArrowUp size={13} />} aria-label="Move up" onClick={() => move(m, -1)} />
                            <Btn size="sm" variant="ghost" icon={<ArrowDown size={13} />} aria-label="Move down" onClick={() => move(m, 1)} />
                            {s.waves.length > 1 && <Btn size="sm" variant="ghost" icon={<Copy size={13} />} title="Create a copy for another wave" aria-label="Copy for wave" onClick={() => {
                              const used = new Set(s.milestones.filter((x) => x.libraryKey === m.libraryKey && x.name === m.name).map((x) => x.waveId));
                              const target = s.waves.find((w) => !used.has(w.id));
                              if (!target) { useApp.getState().toast('A copy already exists for every wave.', 'warn'); return; }
                              const id = uid('ms');
                              mutate((dd) => { dd.milestones.push({ ...JSON.parse(JSON.stringify(m)), id, waveId: target.id, sortOrder: m.sortOrder + 1, selected: true, dependencies: [] }); }, { entityType: 'milestone', entityId: id, action: 'add', summary: `${m.name} copied for ${target.name}` });
                            }} />}
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table></div>
                )}
              </Section>
            );
          })}
        </>
      )}
      {view === 'timeline' && <Section title="Roadmap" hint="Diamonds = milestones (teal = go-live); dots = planned communications; red line = today"><MiniTimeline /></Section>}
      {view === 'calendar' && <CommCalendar />}
      {node}
    </>
  );
}

export function MiniTimeline({ compact }: { compact?: boolean }) {
  const s = useApp((x) => x.current)!;
  const inspect = useApp((x) => x.inspect);
  const d = useMemo(() => derive(s), [s]);
  let ms = d.activeMilestones.filter((m) => m.kind === 'milestone' && milestoneDate(s, m));
  if (compact) ms = ms.filter((m) => ['kickoff', 'business_case', 'fom', 'transfer_plan', 'impacted_comms', 'transition_kickoff', 'employee_training', 'golive', 'hypercare_start', 'hypercare_close', 'enterprise_golive'].includes(m.libraryKey ?? '') || !m.libraryKey);
  if (!ms.length) return <Empty title="No dated milestones">Set wave go-live dates and select milestones to see the roadmap.</Empty>;
  const dates = ms.map((m) => milestoneDate(s, m)!).concat(d.activeComms.map((c) => c.plannedDate).filter((x): x is string => !!x));
  const min = parseDate(dates.reduce((a, b) => (a < b ? a : b)))!.getTime();
  const max = parseDate(dates.reduce((a, b) => (a > b ? a : b)))!.getTime();
  const span = Math.max(1, max - min);
  const pos = (iso: string) => `${((parseDate(iso)!.getTime() - min) / span) * 96 + 2}%`;
  const today = toISO(new Date());
  const months: string[] = [];
  const cur = parseDate(dates.reduce((a, b) => (a < b ? a : b)))!;
  cur.setUTCDate(1);
  while (cur.getTime() <= max) { months.push(toISO(cur)); cur.setUTCMonth(cur.getUTCMonth() + (span > 400 * 86400000 ? 2 : 1)); }
  return (
    <div className="tbl-wrap" style={{ maxHeight: compact ? 360 : 640 }}>
      <div className="gantt" style={{ minWidth: 720 }}>
        <div className="gantt-axis"><div style={{ padding: '4px 10px' }}>Milestone</div><div style={{ position: 'relative', height: 22 }}>{months.map((mo) => <span key={mo} style={{ position: 'absolute', left: pos(mo), top: 4, whiteSpace: 'nowrap' }}>{fmtDate(mo).slice(3)}</span>)}</div></div>
        {sortMilestones(s, ms).map((m) => {
          const date = milestoneDate(s, m)!;
          const comms = d.activeComms.filter((c) => c.milestone.id === m.id && c.plannedDate);
          return (
            <div className="gantt-row" key={m.id}>
              <div className="lbl" title={m.name}><button className="btn ghost sm" style={{ padding: 0 }} onClick={() => inspect({ kind: 'milestone', milestoneId: m.id })}>{m.name}</button>{m.waveId && s.waves.length > 1 && <span className="tiny muted"> · {waveName(s, m.waveId).split(' ')[0]} {waveName(s, m.waveId).split(' ')[1] ?? ''}</span>}</div>
              <div className="gantt-track">
                {today >= dates.reduce((a, b) => (a < b ? a : b)) && today <= dates.reduce((a, b) => (a > b ? a : b)) && <span className="gantt-today" style={{ left: pos(today) }} />}
                {Array.from(new Set(comms.map((c) => c.plannedDate!))).map((pd) => <span key={pd} className="gantt-pt comm" style={{ left: pos(pd) }} title={`${comms.filter((c) => c.plannedDate === pd).length} communication(s) on ${fmtDate(pd)}`} />)}
                <span className={`gantt-pt ${m.libraryKey === 'golive' ? 'golive' : ''}`} style={{ left: pos(date) }} title={`${m.name} · ${fmtDate(date)} · ${formatT(milestoneOffset(s, m))}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CommCalendar() {
  const s = useApp((x) => x.current)!;
  const inspect = useApp((x) => x.inspect);
  const d = useMemo(() => derive(s), [s]);
  const first = d.activeComms.map((c) => c.plannedDate).filter((x): x is string => !!x).sort()[0];
  const today = toISO(new Date());
  const [month, setMonth] = useState(() => (first && first > today ? first : today).slice(0, 7));
  const [y, mo] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const offset = (start.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => { const dt = new Date(Date.UTC(y, mo - 1, 1 - offset + i)); return toISO(dt); });
  const shift = (n: number) => { const dt = new Date(Date.UTC(y, mo - 1 + n, 1)); setMonth(toISO(dt).slice(0, 7)); };
  const ms = d.activeMilestones.filter((m) => milestoneDate(s, m));
  return (
    <Section title={`Communication calendar — ${fmtDate(`${month}-01`).slice(3)}`} hint="Planned communication dates (milestone date minus lead time, unless rescheduled)"
      actions={<><Btn size="sm" icon={<ChevronLeft size={14} />} onClick={() => shift(-1)} aria-label="Previous month" /><Btn size="sm" onClick={() => setMonth(today.slice(0, 7))}>Today</Btn><Btn size="sm" icon={<ChevronRight size={14} />} onClick={() => shift(1)} aria-label="Next month" /></>}>
      <div className="tbl-wrap">
        <div className="cal" style={{ minWidth: 700 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => <div key={x} className="cal-dow">{x}</div>)}
          {days.map((day) => {
            const evs = d.activeComms.filter((c) => c.plannedDate === day);
            const mss = ms.filter((m) => milestoneDate(s, m) === day);
            return (
              <div key={day} className={`cal-cell ${day.slice(0, 7) !== month ? 'out' : ''}`}>
                <div className="num" style={{ fontWeight: day === today ? 700 : 400, color: day === today ? 'var(--crit)' : undefined }}>{Number(day.slice(8))}</div>
                {mss.map((m) => <button key={m.id} className="cal-ev" style={{ background: 'var(--navy)', color: '#fff' }} onClick={() => inspect({ kind: 'milestone', milestoneId: m.id })} title={m.name}>◆ {m.name}</button>)}
                {evs.slice(0, 4).map((c) => <button key={c.rec.id} className="cal-ev" style={{ background: c.sensitive ? 'var(--warn-bg)' : 'var(--info-bg)', color: 'var(--text)' }} onClick={() => inspect({ kind: 'comm', commId: c.rec.id })} title={`${c.rec.code} ${c.audience.roleName}`}>{c.audience.roleName}</button>)}
                {evs.length > 4 && <span className="tiny muted">+{evs.length - 4} more</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="row small muted" style={{ marginTop: 8 }}>Recurring communications ({d.activeMilestones.filter((m) => m.kind === 'recurring').map((m) => `${m.name}: ${m.recurrence?.cadence}`).join('; ') || 'none'}) run on their cadence and are listed in the Communication Plan.</div>
    </Section>
  );
}

const FOCUS_OPTIONS = (Object.keys(FOCUS_LABELS) as Focus[]).map((f) => ({ value: f, label: FOCUS_LABELS[f] }));

export function MilestoneEditor({ id }: { id: string }) {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const m = s.milestones.find((x) => x.id === id);
  if (!m) return <Empty title="Milestone not found" />;
  const set = (fn: (x: Milestone) => void, label: string) => mutate((d) => { fn(d.milestones.find((x) => x.id === id)! as Milestone); }, { entityType: 'milestone', entityId: id, action: 'update', summary: `${m.name}: ${label}` });
  const g = anchorGoLive(s, m.waveId);
  const date = milestoneDate(s, m);
  return (
    <div className="stack">
      <label className="check"><input type="checkbox" checked={m.selected} onChange={() => set((x) => { x.selected = !x.selected; }, m.selected ? 'deselected' : 'selected')} /> Selected for this engagement (populates the communication plan)</label>
      <div className="field"><label>Milestone name</label><TextIn value={m.name} onCommit={(v) => set((x) => { x.name = v; }, 'renamed')} /></div>
      <div className="field"><label>Description</label><TextIn multiline value={m.description} onCommit={(v) => set((x) => { x.description = v; }, 'description')} /></div>
      <div className="grid g2">
        <div className="field"><label>Phase</label><select className="select" value={m.phaseId} onChange={(e) => set((x) => { x.phaseId = e.target.value; }, 'phase')}>{s.phases.map((p) => <option key={p.id} value={p.id}>{p.num}. {p.name}</option>)}</select></div>
        <div className="field"><label>Trigger type</label><select className="select" value={m.kind} onChange={(e) => set((x) => { x.kind = e.target.value as Milestone['kind']; if (x.kind === 'recurring' && !x.recurrence) x.recurrence = { cadence: 'weekly', until: 'Hypercare closure' }; }, 'type')}>
          <option value="milestone">Milestone-triggered</option><option value="recurring">Recurring / cadence</option><option value="scenario">Scenario-triggered</option><option value="exception">Exception / crisis</option></select></div>
        <div className="field"><label>Transition wave</label><select className="select" value={m.waveId ?? ''} onChange={(e) => set((x) => { x.waveId = e.target.value || null; }, 'wave')}><option value="">Engagement-wide (primary wave)</option>{s.waves.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <div className="field"><label>Owner</label><TextIn value={m.owner} onCommit={(v) => set((x) => { x.owner = v; }, 'owner')} /></div>
      </div>
      {m.kind === 'recurring' && m.recurrence && (
        <div className="grid g2">
          <div className="field"><label>Cadence</label><select className="select" value={m.recurrence.cadence} onChange={(e) => set((x) => { x.recurrence!.cadence = e.target.value as 'weekly'; }, 'cadence')}><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option></select></div>
          <div className="field"><label>Recurrence end condition</label><TextIn value={m.recurrence.until} onCommit={(v) => set((x) => { x.recurrence!.until = v; }, 'recurrence end')} /></div>
        </div>
      )}
      <div className="insp-block">
        <h4>Timing</h4>
        <div className="row" style={{ marginBottom: 8 }}>
          <Seg options={[{ value: 'relative', label: 'Relative to go-live (T)' }, { value: 'date', label: 'Fixed date' }]} value={m.anchor} onChange={(v) => set((x) => {
            if (v === 'date') { x.date = milestoneDate(s, x as Milestone); x.anchor = 'date'; } else { x.relativeOffset = milestoneOffset(s, x as Milestone) ?? 0; x.anchor = 'relative'; }
          }, 'timing anchor')} />
        </div>
        {m.anchor === 'relative'
          ? <div className="field"><label>Offset in {s.engagement.timeUnit} (negative = before go-live)</label><TextIn type="number" value={m.relativeOffset === null ? '' : String(m.relativeOffset)} onCommit={(v) => set((x) => { x.relativeOffset = v === '' ? null : Math.round(Number(v)); }, 'offset')} /></div>
          : <div className="field"><label>Planned date</label><TextIn type="date" value={m.date ?? ''} onCommit={(v) => set((x) => { x.date = v || null; }, 'date')} /></div>}
        <p className="small muted" style={{ marginTop: 6 }}>Anchor go-live: {g ? fmtDate(g) : 'not set'} ({waveName(s, m.waveId)}). Result: {date ? fmtDate(date) : 'no date'} · {formatT(milestoneOffset(s, m))}</p>
      </div>
      <div className="field"><label>Dependencies</label>
        <select className="select" value="" onChange={(e) => { const v = e.target.value; if (v) set((x) => { x.dependencies = x.dependencies.includes(v) ? x.dependencies.filter((y) => y !== v) : [...x.dependencies, v]; }, 'dependencies'); }}>
          <option value="">Add or remove a dependency…</option>
          {s.milestones.filter((x) => x.selected && x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{m.dependencies.includes(x.id) ? '✓ ' : ''}{x.name}{x.waveId ? ` (${waveName(s, x.waveId)})` : ''}</option>)}
        </select>
        {m.dependencies.length > 0 && <span className="help">Depends on: {m.dependencies.map((x) => s.milestones.find((y) => y.id === x)?.name).filter(Boolean).join(', ')}</span>}
      </div>
      <div className="field"><label>Readiness / gating conditions</label><TextIn multiline value={m.gating} onCommit={(v) => set((x) => { x.gating = v; }, 'gating')} /></div>
      <div className="field"><label>Functions (blank = all)</label><Chips options={s.engagement.functions.map((f) => ({ value: f.name, label: f.name }))} value={m.functions} onChange={(v) => set((x) => { x.functions = v; }, 'functions')} /></div>
      <div className="insp-block rec">
        <h4>Communication trigger <Prov kind="rule" label="Default rule" /></h4>
        <label className="check"><input type="checkbox" checked={m.trigger.required} onChange={() => set((x) => { x.trigger.required = !x.trigger.required; }, 'communication required')} /> Communication normally required</label>
        <div className="field" style={{ marginTop: 8 }}><label>Candidate audiences (focus)</label><Chips options={FOCUS_OPTIONS} value={m.trigger.focus} onChange={(v) => set((x) => { x.trigger.focus = v as Focus[]; }, 'audience focus')} /></div>
        <div className="field" style={{ marginTop: 8 }}><label>Communication objective</label><TextIn value={m.trigger.objective} onCommit={(v) => set((x) => { x.trigger.objective = v; }, 'objective')} /></div>
        <div className="grid g2" style={{ marginTop: 8 }}>
          <div className="field"><label>Lead time ({s.engagement.timeUnit} before)</label><TextIn type="number" value={String(m.trigger.leadTime)} onCommit={(v) => set((x) => { x.trigger.leadTime = Math.max(0, Math.round(Number(v) || 0)); }, 'lead time')} /></div>
          <div className="field"><label>Follow-up requirement</label><TextIn value={m.trigger.followUp} onCommit={(v) => set((x) => { x.trigger.followUp = v; }, 'follow-up')} /></div>
        </div>
        <div className="field" style={{ marginTop: 8 }}><label>Possible artifacts</label><Chips options={(Object.keys(ARTIFACT_TYPES) as ArtifactType[]).map((a) => ({ value: a, label: ARTIFACT_TYPES[a].label }))} value={m.trigger.artifactHints} onChange={(v) => set((x) => { x.trigger.artifactHints = v as ArtifactType[]; }, 'artifact hints')} /></div>
      </div>
      {!m.libraryKey && <DeleteMilestone id={id} />}
    </div>
  );
}

function DeleteMilestone({ id }: { id: string }) {
  const mutate = useApp((x) => x.mutate);
  const inspect = useApp((x) => x.inspect);
  const s = useApp((x) => x.current)!;
  const { ask, node } = useConfirm();
  const n = s.comms.filter((c) => c.milestoneId === id).length;
  return (
    <>
      <Btn variant="danger" icon={<Trash2 size={13} />} onClick={async () => {
        if (await ask('Delete custom milestone', n ? `${n} communication record(s) and their artifacts will also be deleted. Consider deselecting the milestone instead.` : 'The custom milestone will be deleted.', 'Delete', true)) {
          mutate((d) => { d.milestones = d.milestones.filter((x) => x.id !== id); const gone = new Set(d.comms.filter((c) => c.milestoneId === id).map((c) => c.id)); d.comms = d.comms.filter((c) => !gone.has(c.id)); d.artifacts = d.artifacts.filter((a) => !gone.has(a.communicationRecordId)); d.milestones.forEach((m) => { m.dependencies = m.dependencies.filter((x) => x !== id); }); },
            { entityType: 'milestone', entityId: id, action: 'delete', summary: 'Custom milestone deleted' });
          inspect(null);
        }
      }}>Delete custom milestone</Btn>
      {node}
    </>
  );
}
