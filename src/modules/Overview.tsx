import { useMemo } from 'react';
import { ArrowRight, AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { useApp, type ViewId } from '../store/store';
import { derive } from '../engine/derive';
import { Badge, Bars, Btn, Kpi, PageHeader, Section, Empty } from '../ui/kit';
import { fmtDate, toISO } from '../domain/util';
import { milestoneDate, waveName } from '../engine/timing';
import { severityBand, severityScore } from '../engine/impact';
import { roleShort } from '../engine/communicator';
import { MiniTimeline } from './MilestonePlanner';

export function Overview() {
  const s = useApp((x) => x.current)!;
  const setView = useApp((x) => x.setView);
  const inspect = useApp((x) => x.inspect);
  const d = useMemo(() => derive(s), [s]);
  const e = s.engagement;
  const today = toISO(new Date());

  const totalCells = d.impacts.size;
  const decided = [...d.impacts.values()].filter((x) => x.source === 'consultant' || x.status === 'confirmed').length;
  const determinable = [...d.impacts.values()].filter((x) => x.classification !== 'review').length;
  const directStakeholders = d.selectedStakeholders.filter((st) => d.selectedDims.some((dim) => { const x = d.impacts.get(`${st.id}|${dim.id}`); return x?.classification === 'impacted' && x.directness === 'direct'; }));
  const covered = directStakeholders.filter((st) => d.activeComms.some((c) => c.audience.id === st.id));
  const ready = d.activeComms.filter((c) => c.executionReady).length;
  const nextMs = d.activeMilestones.filter((m) => m.kind === 'milestone').map((m) => ({ m, date: milestoneDate(s, m) })).filter((x) => x.date && x.date >= today).sort((a, b) => (a.date! < b.date! ? -1 : 1))[0];
  const phase = s.phases.find((p) => p.id === e.currentPhaseId);
  const review = d.issues.filter((i) => i.severity !== 'info');

  const next: { view: ViewId; label: string } =
    !e.setupComplete ? { view: 'engagement-setup', label: 'Complete engagement setup' }
    : !s.changes.length ? { view: 'change-identification', label: 'Record specific changes' }
    : !d.selectedStakeholders.length ? { view: 'stakeholder-register', label: 'Select stakeholders' }
    : [...d.impacts.values()].some((x) => x.classification === 'review' && x.source === 'rule') ? { view: 'impact-assessment', label: 'Resolve impact cells needing review' }
    : !d.activeMilestones.length ? { view: 'milestone-planner', label: 'Select GBS milestones' }
    : d.suggestions.length ? { view: 'audience-matrix', label: `Review ${d.suggestions.length} audience recommendation(s)` }
    : d.activeComms.some((c) => c.rec.status === 'proposed' || c.rec.status === 'needs_review') ? { view: 'communication-plan', label: 'Review proposed communications' }
    : { view: 'artifact-studio', label: 'Generate communication artifacts' };

  // Analytics
  const groups = s.groups.filter((g) => d.selectedStakeholders.some((x) => x.groupId === g.id));
  const heat = groups.map((g) => ({ g, cells: d.selectedDims.map((dim) => {
    const members = d.selectedStakeholders.filter((x) => x.groupId === g.id);
    const n = members.filter((st) => d.impacts.get(`${st.id}|${dim.id}`)?.classification === 'impacted').length;
    return { n, of: members.length };
  }) }));
  const byDim = d.selectedDims.map((dim) => {
    const vals = d.selectedStakeholders.map((st) => d.impacts.get(`${st.id}|${dim.id}`));
    const direct = vals.filter((v) => v?.classification === 'impacted' && v.directness === 'direct').length;
    const indirect = vals.filter((v) => v?.classification === 'impacted' && v.directness !== 'direct').length;
    const rev = vals.filter((v) => v?.classification === 'review').length;
    return { label: dim.short, value: direct + indirect + rev, segments: [{ value: direct, color: 'var(--navy)', label: 'Direct' }, { value: indirect, color: 'var(--blue)', label: 'Indirect' }, { value: rev, color: 'var(--warn)', label: 'Review' }] };
  });
  const high = d.selectedStakeholders.map((st) => {
    const bands = d.selectedDims.map((dim) => severityBand(severityScore(d.impacts.get(`${st.id}|${dim.id}`)?.severity ?? null, e.settings.weights), e.settings.thresholds));
    return { st, high: bands.filter((b) => b === 'High').length };
  }).filter((x) => x.high > 0).sort((a, b) => b.high - a.high).slice(0, 6);
  const fnCounts = new Map<string, number>();
  for (const c of s.changes) fnCounts.set(c.functionName || 'Unspecified', (fnCounts.get(c.functionName || 'Unspecified') ?? 0) + 1);
  const waveCounts = s.waves.map((w) => ({ label: w.name, value: d.activeComms.filter((c) => c.milestone.waveId === w.id).length }));
  waveCounts.push({ label: 'Engagement-wide', value: d.activeComms.filter((c) => !c.milestone.waveId).length });
  const byPhase = s.phases.map((p) => ({ label: p.short, value: d.activeComms.filter((c) => c.milestone.phaseId === p.id).length }));
  const byType = s.commTypes.map((t) => ({ label: t.short, value: d.activeComms.filter((c) => c.rec.commTypeId === t.id).length })).filter((x) => x.value);
  const chCount = new Map<string, number>();
  for (const c of d.activeComms) if (c.channels.primary) chCount.set(c.channels.primary, (chCount.get(c.channels.primary) ?? 0) + 1);
  const byChannel = [...chCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ label: s.channels.find((x) => x.id === id)?.name ?? id, value: n }));
  const byAudience = d.selectedStakeholders.map((st) => ({ label: st.roleName, value: d.activeComms.filter((c) => c.audience.id === st.id).length })).sort((a, b) => b.value - a.value).slice(0, 8);
  const pending = d.activeComms.filter((c) => c.rec.status === 'pending_approval').length;
  const needsReview = d.activeComms.filter((c) => c.rec.status === 'proposed' || c.rec.status === 'needs_review').length;
  const missingComm = d.activeComms.filter((c) => !c.roles.primary).length;

  return (
    <>
      <PageHeader eyebrow="Engagement overview" title={e.name}
        sub={<>{e.client || 'Organisation not set'} · {e.transformationTypes.join(', ') || 'Engagement type not set'} · {e.functions.map((f) => f.name).join(', ') || 'No functions in scope'} · {e.geographies.join(', ') || 'No geographies'}</>}
        actions={<Btn variant="primary" icon={<ArrowRight size={14} />} onClick={() => setView(next.view)}>{next.label}</Btn>} />

      <div className="kpis">
        <Kpi label="Active phase" value={<span style={{ fontSize: 15 }}>{phase ? `${phase.num}. ${phase.short}` : '—'}</span>} sub={nextMs ? `Next: ${nextMs.m.name} · ${fmtDate(nextMs.date)}` : 'No upcoming dated milestone'} onClick={() => setView('milestone-planner')} />
        <Kpi label="Change records" value={s.changes.length} sub={`${d.selectedDims.length} dimension(s) selected`} onClick={() => setView('change-identification')} />
        <Kpi label="Stakeholder groups" value={d.selectedStakeholders.length} sub={`${directStakeholders.length} directly impacted`} onClick={() => setView('stakeholder-register')} />
        <Kpi label="Impact assessment" value={`${totalCells ? Math.round((decided / totalCells) * 100) : 0}%`} sub={`${decided}/${totalCells} cells consultant-confirmed · ${determinable} determinable`} pct={totalCells ? decided / totalCells : 0} onClick={() => setView('impact-assessment')} />
        <Kpi label="Planning coverage" value={`${directStakeholders.length ? Math.round((covered.length / directStakeholders.length) * 100) : 0}%`} sub={`${covered.length}/${directStakeholders.length} impacted groups have communications`} pct={directStakeholders.length ? covered.length / directStakeholders.length : 0} onClick={() => setView('audience-matrix')} />
        <Kpi label="Execution-ready" value={`${ready}/${d.activeComms.length}`} sub="communications with owner, communicator, approver, channel, date" pct={d.activeComms.length ? ready / d.activeComms.length : 0} onClick={() => setView('communication-plan')} />
        <Kpi label="Documents generated" value={s.artifacts.length} sub={`${s.artifacts.filter((a) => a.approvalStatus === 'approved').length} approved · ${[...d.artifactStates.values()].filter((x) => x.outdated).length} potentially outdated`} onClick={() => setView('artifact-studio')} />
        <Kpi label="Items requiring review" value={review.length} sub={`${d.issues.filter((i) => i.severity === 'critical').length} critical`} />
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Section title="Action Centre" hint="Computed from engagement records" flush>
          {d.issues.length === 0 ? <Empty title="No open issues">All validation rules pass for the current records.</Empty> : (
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {d.issues.slice(0, 40).map((i) => (
                <div className="issue" key={i.id}>
                  {i.severity === 'critical' ? <AlertOctagon size={15} color="var(--crit)" /> : i.severity === 'warning' ? <AlertTriangle size={15} color="var(--warn)" /> : <Info size={15} color="var(--info)" />}
                  <div className="grow"><div className="small strong">{i.category}</div><div className="small">{i.message}</div></div>
                  <Btn size="sm" onClick={() => {
                    setView(i.view as ViewId);
                    if (i.targetId && d.commById.has(i.targetId)) inspect({ kind: 'comm', commId: i.targetId });
                    else if (i.targetId && i.targetId.includes('|') && i.category === 'Assessment conflict') { const [a, b] = i.targetId.split('|'); inspect({ kind: 'impact', stakeholderId: a, dimensionId: b }); }
                  }}>Open</Btn>
                </div>
              ))}
              {d.issues.length > 40 && <div className="issue small muted">{d.issues.length - 40} more — see Communication Plan warnings.</div>}
            </div>
          )}
        </Section>
        <Section title="Engagement facts">
          <dl className="kv">
            <dt>Organisation</dt><dd>{e.client || '—'}</dd>
            <dt>Industry</dt><dd>{e.industry || '—'}</dd>
            <dt>GBS location(s)</dt><dd>{e.gbsLocations.join(', ') || '—'}</dd>
            <dt>Transition waves</dt><dd>{s.waves.map((w) => `${w.name} — ${fmtDate(w.goLiveDate, 'go-live not set')}`).join('; ')}</dd>
            <dt>Relative unit</dt><dd>{e.timeUnit}</dd>
            <dt>Change dimensions</dt><dd>{d.selectedDims.map((x) => x.short).join(', ')}</dd>
            <dt>Milestones</dt><dd>{d.activeMilestones.length} selected · {d.activeMilestones.filter((m) => m.kind === 'recurring').length} recurring</dd>
            <dt>Communications</dt><dd>{d.activeComms.length} active · {pending} pending approval · {needsReview} awaiting review · {missingComm} missing communicator</dd>
          </dl>
        </Section>
      </div>

      <Section title="Impact analytics" hint="Effective assessments (consultant decisions take precedence over rule recommendations)">
        {!d.selectedStakeholders.length || !d.selectedDims.length ? <Empty title="No impact data yet">Select stakeholders and change dimensions to see impact analytics.</Empty> : (
          <div className="grid g2">
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Stakeholder impact heatmap (impacted roles / roles in group)</div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Group</th>{d.selectedDims.map((x) => <th key={x.id} style={{ textAlign: 'center' }}>{x.short}</th>)}</tr></thead>
                  <tbody>{heat.map(({ g, cells }) => (
                    <tr key={g.id}><td className="small">{g.code}. {g.name}</td>{cells.map((c, i) => {
                      const lvl = c.of ? Math.ceil((c.n / c.of) * 4) : 0;
                      return <td key={i} className={`heat-${lvl} num small`} style={{ textAlign: 'center', fontWeight: 600 }}>{c.n}/{c.of}</td>;
                    })}</tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            <div className="stack">
              <div><div className="label">Impact by change dimension</div><Bars data={byDim} /><div className="row small muted"><span className="swatch" style={{ background: 'var(--navy)' }} /> Direct <span className="swatch" style={{ background: 'var(--blue)' }} /> Indirect <span className="swatch" style={{ background: 'var(--warn)' }} /> Review</div></div>
              <div><div className="label">High-impact stakeholder groups (severity band High)</div>
                {high.length ? <ul className="clean small">{high.map((h) => <li key={h.st.id}>{h.st.roleName} — High in {h.high} dimension(s)</li>)}</ul> : <p className="small muted">No stakeholder has a scored High severity. Severity is scored only when As-Is/To-Be information exists.</p>}
              </div>
              <div className="grid g2">
                <div><div className="label">Change records by function</div><Bars data={[...fnCounts.entries()].map(([label, value]) => ({ label, value }))} color="var(--teal)" /></div>
                <div><div className="label">Communications by wave</div><Bars data={waveCounts} color="var(--teal)" /></div>
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Communication analytics">
        {!d.activeComms.length ? <Empty title="No communication records yet" actions={<Btn variant="primary" onClick={() => setView('audience-matrix')}>Open Audience Matrix</Btn>}>Select milestones and generate audience recommendations to build the plan.</Empty> : (
          <div className="grid g3">
            <div><div className="label">Planned communications by phase</div><Bars data={byPhase} /></div>
            <div><div className="label">Communication type distribution</div><Bars data={byType} color="var(--teal)" /></div>
            <div><div className="label">Primary channel distribution</div><Bars data={byChannel} color="var(--blue)" /></div>
            <div><div className="label">Communications by audience (top 8)</div><Bars data={byAudience} color="var(--navy)" /></div>
            <div><div className="label">Status</div>
              <div className="stack small" style={{ marginTop: 6 }}>
                <div className="row"><Badge tone="info">{needsReview}</Badge> proposed or needing review</div>
                <div className="row"><Badge tone="warn">{pending}</Badge> pending approval</div>
                <div className="row"><Badge tone="ok">{d.activeComms.filter((c) => ['approved', 'ready', 'completed'].includes(c.rec.status)).length}</Badge> approved, ready, or completed</div>
                <div className="row"><Badge tone="crit">{missingComm}</Badge> missing communicator</div>
                <div className="row"><Badge tone="warn">{d.activeComms.filter((c) => c.rec.commTypeId === 'ct_sensitive' && !c.rec.hrReviewed).length}</Badge> sensitive awaiting HR review</div>
              </div>
            </div>
            <div><div className="label">Most-used communicators</div>
              <Bars data={[...d.activeComms.reduce((m, c) => { if (c.roles.primary) m.set(c.roles.primary, (m.get(c.roles.primary) ?? 0) + 1); return m; }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ label: roleShort(s, id), value: n }))} color="var(--teal)" />
            </div>
          </div>
        )}
      </Section>

      <Section title="Milestone timeline" hint={`Selected milestones and planned communications · ${s.waves.map((w) => `${w.name}: ${fmtDate(w.goLiveDate, 'TBC')}`).join(' · ')}`}>
        <MiniTimeline compact />
      </Section>
      <p className="tiny muted">All figures computed from the engagement's records at {new Date().toLocaleTimeString()}. Wave labels: {s.waves.map((w) => waveName(s, w.id)).join(', ')}.</p>
    </>
  );
}
