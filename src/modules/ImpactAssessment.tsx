import { useMemo, useState, type MouseEvent, type KeyboardEvent } from 'react';
import { CheckCheck, AlertTriangle, X } from 'lucide-react';
import { useApp } from '../store/store';
import { derive } from '../engine/derive';
import { severityBand, severityScore, type EffectiveImpact } from '../engine/impact';
import { groupStakeholders, IMPACT_SYMBOL } from '../engine/matrixText';
import { setImpactDecision } from '../store/actions';
import { Matrix, type MxGroup } from '../ui/Matrix';
import { Badge, Btn, Empty, PageHeader, Section, Select, Tabs, useConfirm } from '../ui/kit';
import { waveName } from '../engine/timing';
import { nowIso } from '../domain/util';

type ViewKey = 'matrix' | 'heatmap' | 'stakeholder' | 'dimension' | 'high' | 'function' | 'wave' | 'completion';

export function impactCellClass(e: EffectiveImpact | undefined) {
  if (!e) return { sym: '', cls: '' };
  const confirmed = e.source === 'consultant' || e.status === 'confirmed';
  const base = e.classification === 'impacted' ? 'yes' : e.classification === 'review' ? 'rev' : 'no';
  return { sym: IMPACT_SYMBOL[e.classification], cls: confirmed ? base : e.classification === 'review' ? 'rev' : e.classification === 'impacted' ? 'rec' : 'no' };
}

export function ImpactAssessment() {
  const s = useApp((x) => x.current)!;
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const mutate = useApp((x) => x.mutate);
  const setView = useApp((x) => x.setView);
  const toast = useApp((x) => x.toast);
  const d = useMemo(() => derive(s), [s]);
  const [view, setV] = useState<ViewKey>('matrix');
  const [groupFilter, setGroupFilter] = useState('');
  const [show, setShow] = useState<'all' | 'impacted' | 'review' | 'overrides'>('all');
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const { ask, node } = useConfirm();
  const w = s.engagement.settings.weights, th = s.engagement.settings.thresholds;

  const groups: MxGroup[] = groupStakeholders(s, d.selectedStakeholders)
    .filter((g) => !groupFilter || g.group.id === groupFilter)
    .map((g) => ({
      id: g.group.id, label: `${g.group.code}. ${g.group.name}`,
      rows: g.members.filter((st) => {
        if (show === 'all') return true;
        const vals = d.selectedDims.map((dim) => d.impacts.get(`${st.id}|${dim.id}`));
        if (show === 'impacted') return vals.some((v) => v?.classification === 'impacted');
        if (show === 'review') return vals.some((v) => v?.classification === 'review' || v?.status === 'needs_review' || v?.conflict);
        return vals.some((v) => v?.source === 'consultant');
      }).map((st) => ({ id: st.id, searchText: `${st.roleName} ${st.functionName}`, label: <span>{st.roleName}{st.functionName && <span className="tiny muted"> · {st.functionName}</span>}</span> })),
    })).filter((g) => g.rows.length);

  const sel = inspector?.kind === 'impact' ? { r: inspector.stakeholderId, c: inspector.dimensionId } : null;
  const onCell = (r: string, c: string, e: MouseEvent | KeyboardEvent) => {
    if ((e as MouseEvent).shiftKey || (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) {
      const k = `${r}|${c}`;
      const n = new Set(multi);
      if (n.has(k)) n.delete(k); else n.add(k);
      setMulti(n);
      return;
    }
    setMulti(new Set());
    inspect({ kind: 'impact', stakeholderId: r, dimensionId: c });
  };

  const bulkAccept = (keys: string[]) => {
    let n = 0;
    mutate((dd) => {
      for (const k of keys) {
        const rec = d.impactRecs.get(k);
        if (!rec || rec.classification === 'review') continue;
        const [stakeholderId, dimensionId] = k.split('|');
        const a = dd.assessments[k] ?? { id: k, stakeholderId, dimensionId, decision: null, status: 'proposed', comments: [] };
        if (a.decision) continue; // never overwrite a consultant decision
        a.status = 'confirmed';
        dd.assessments[k] = a;
        n++;
      }
    }, { entityType: 'impact', entityId: 'bulk', action: 'accept', summary: `Accepted ${keys.length} rule recommendation(s)` });
    toast(`${n} recommendation(s) accepted. Cells needing review and consultant decisions were left unchanged.`);
  };

  const proposedKeys = [...d.impacts.entries()].filter(([, e]) => e.source === 'rule' && e.status !== 'confirmed' && e.classification !== 'review').map(([k]) => k);

  return (
    <>
      <PageHeader eyebrow="Stage 2 · Change Assessment & Stakeholder Analysis" title="Stakeholder Change Impact Assessment"
        sub="Assessment of how stakeholder groups are impacted across key change dimensions. Rule recommendations are shown in blue until a consultant accepts or overrides them."
        actions={<>
          <Btn icon={<CheckCheck size={14} />} disabled={!proposedKeys.length} onClick={async () => { if (await ask('Accept rule recommendations', `${proposedKeys.length} rule-proposed cell(s) will be marked confirmed. Cells requiring review and existing consultant decisions are not changed.`, 'Accept all')) bulkAccept(proposedKeys); }}>Accept all determinable ({proposedKeys.length})</Btn>
          <Btn onClick={() => setView('deliverables')}>Export</Btn>
        </>} />
      {!d.selectedStakeholders.length || !d.selectedDims.length ? (
        <Empty title="Nothing to assess yet" actions={<><Btn onClick={() => setView('stakeholder-register')}>Select stakeholders</Btn><Btn onClick={() => setView('change-identification')}>Select dimensions</Btn></>}>
          The matrix needs selected stakeholders and change dimensions.
        </Empty>
      ) : (
        <>
          <Tabs value={view} onChange={setV} tabs={[
            { value: 'matrix', label: 'Executive matrix' }, { value: 'heatmap', label: 'Severity heatmap' }, { value: 'stakeholder', label: 'By stakeholder' },
            { value: 'dimension', label: 'By dimension' }, { value: 'high', label: 'High impact' }, { value: 'function', label: 'By function / geography' },
            { value: 'wave', label: 'By wave' }, { value: 'completion', label: 'Completion tracker' },
          ]} />
          {view === 'matrix' && (
            <>
              {multi.size > 0 && (
                <div className="banner info"><div className="grow">{multi.size} cell(s) selected.</div>
                  <Btn size="sm" onClick={() => { bulkAccept([...multi]); setMulti(new Set()); }}>Accept recommendations</Btn>
                  <Btn size="sm" onClick={() => { mutate((dd) => { for (const k of multi) { const [a, b] = k.split('|'); const x = dd.assessments[k] ?? { id: k, stakeholderId: a, dimensionId: b, decision: null, status: 'proposed', comments: [] }; x.status = 'needs_review'; dd.assessments[k] = x; } }, { entityType: 'impact', entityId: 'bulk', action: 'review', summary: `${multi.size} cell(s) marked needs review` }); setMulti(new Set()); }}>Mark needs review</Btn>
                  <Btn size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setMulti(new Set())}>Clear</Btn>
                </div>
              )}
              <Matrix title="Impact matrix" subtitle="Click a cell to inspect · Shift/Ctrl-click to multi-select · Arrow keys to move"
                cols={d.selectedDims.map((x) => ({ id: x.id, label: x.label }))} groups={groups} rowHeader="Stakeholder" colWidth={150} rowHeadWidth={300}
                selected={sel} multi={multi} onCell={onCell}
                toolbar={<>
                  <Select value={groupFilter} placeholder="All groups" options={s.groups.filter((g) => d.selectedStakeholders.some((x) => x.groupId === g.id)).map((g) => ({ value: g.id, label: `${g.code}. ${g.name}` }))} onChange={setGroupFilter} />
                  <Select value={show} options={[{ value: 'all', label: 'All rows' }, { value: 'impacted', label: 'Impacted only' }, { value: 'review', label: 'Needs review / conflicts' }, { value: 'overrides', label: 'Consultant overrides' }]} onChange={(v) => setShow(v as typeof show)} />
                </>}
                cell={(r, c) => {
                  const k = `${r}|${c}`;
                  const e = d.impacts.get(k);
                  const { sym, cls } = impactCellClass(e);
                  const band = severityBand(severityScore(e?.severity ?? null, w), th);
                  const a = s.assessments[k];
                  return {
                    node: <div className="cell-inner"><span className={`sym ${cls}`}>{sym}</span>{band && e?.classification === 'impacted' && <span className="tiny muted">{band[0]}</span>}
                      {e?.source === 'consultant' && <span className="dot-override" />}{e?.conflict && <span className="dot-conflict" />}{(a?.comments.length ?? 0) > 0 && <span className="dot-review" style={{ background: 'var(--blue)' }} />}
                      {e?.status === 'needs_review' && e.classification !== 'review' && <span className="dot-review" />}</div>,
                    title: `${e?.classification.replace('_', ' ')}${e?.directness ? ` (${e.directness})` : ''} · ${e?.source === 'consultant' ? 'Consultant decision' : 'Rule recommendation'}${band ? ` · ${band} severity` : ''}`,
                  };
                }}
                legend={<>
                  <span><span className="sym yes">✓</span> Impacted (confirmed)</span><span><span className="sym rec">✓</span> Impacted (rule proposed)</span>
                  <span><span className="sym no">×</span> Not impacted</span><span><span className="sym rev">?</span> Requires review</span>
                  <span>H/M/L severity band (only when scored)</span>
                  <span className="row"><span className="swatch" style={{ background: 'var(--ok)', borderRadius: 6 }} /> Consultant override</span>
                  <span className="row"><span className="swatch" style={{ background: 'var(--crit)', borderRadius: 6 }} /> Override conflicts with current rules</span>
                </>} />
            </>
          )}
          {view === 'heatmap' && <SeverityHeatmap />}
          {view === 'stakeholder' && <ByStakeholder />}
          {view === 'dimension' && <ByDimension />}
          {view === 'high' && <HighImpact />}
          {view === 'function' && <ByFunction />}
          {view === 'wave' && <ByWave />}
          {view === 'completion' && <Completion />}
        </>
      )}
      {node}
    </>
  );
}

function useD() { const s = useApp((x) => x.current)!; return { s, d: useMemo(() => derive(s), [s]) }; }

function SeverityHeatmap() {
  const { s, d } = useD();
  const inspect = useApp((x) => x.inspect);
  const w = s.engagement.settings.weights, th = s.engagement.settings.thresholds;
  return (
    <Section title="Severity heatmap" hint="Weighted 0–3 score per cell. Blank = not impacted; “n/s” = impacted but not scored (insufficient information)." flush>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Stakeholder</th>{d.selectedDims.map((x) => <th key={x.id} style={{ textAlign: 'center' }}>{x.short}</th>)}<th style={{ textAlign: 'center' }}>Max</th></tr></thead>
        <tbody>{d.selectedStakeholders.map((st) => {
          const scores = d.selectedDims.map((dim) => { const e = d.impacts.get(`${st.id}|${dim.id}`); return e?.classification === 'impacted' ? severityScore(e.severity, w) : undefined; });
          const max = Math.max(-1, ...scores.filter((x): x is number => typeof x === 'number'));
          return (
            <tr key={st.id}><td className="small">{st.roleName}</td>
              {scores.map((sc, i) => <td key={i} className={`num small ${sc === undefined ? '' : sc === null ? '' : `heat-${Math.min(4, Math.round(sc * 1.34))}`}`} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => inspect({ kind: 'impact', stakeholderId: st.id, dimensionId: d.selectedDims[i].id })}>{sc === undefined ? '' : sc === null ? 'n/s' : sc.toFixed(1)}</td>)}
              <td className="num small strong" style={{ textAlign: 'center' }}>{max >= 0 ? `${max.toFixed(1)} · ${severityBand(max, th)}` : '—'}</td></tr>
          );
        })}</tbody>
      </table></div>
    </Section>
  );
}

function ByStakeholder() {
  const { s, d } = useD();
  const w = s.engagement.settings.weights, th = s.engagement.settings.thresholds;
  return (
    <Section title="Stakeholder-level impact summary" flush>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Stakeholder</th><th>Impacted dimensions</th><th>Direct / indirect</th><th>Highest band</th><th>Review cells</th><th>Overrides</th></tr></thead>
        <tbody>{d.selectedStakeholders.map((st) => {
          const v = d.selectedDims.map((dim) => ({ dim, e: d.impacts.get(`${st.id}|${dim.id}`)! }));
          const imp = v.filter((x) => x.e.classification === 'impacted');
          const bands = imp.map((x) => severityBand(severityScore(x.e.severity, w), th)).filter(Boolean);
          const top = bands.includes('High') ? 'High' : bands.includes('Medium') ? 'Medium' : bands.includes('Low') ? 'Low' : imp.length ? 'Not scored' : '—';
          return (
            <tr key={st.id}><td className="small strong">{st.roleName}</td><td className="small">{imp.map((x) => x.dim.short).join(', ') || 'None'}</td>
              <td className="small">{imp.filter((x) => x.e.directness === 'direct').length} / {imp.filter((x) => x.e.directness !== 'direct').length}</td>
              <td>{top === 'High' ? <Badge tone="crit">High</Badge> : top === 'Medium' ? <Badge tone="warn">Medium</Badge> : top === 'Low' ? <Badge tone="ok">Low</Badge> : <span className="small muted">{top}</span>}</td>
              <td className="small num">{v.filter((x) => x.e.classification === 'review').length}</td><td className="small num">{v.filter((x) => x.e.source === 'consultant').length}</td></tr>
          );
        })}</tbody>
      </table></div>
    </Section>
  );
}

function ByDimension() {
  const { s, d } = useD();
  return (
    <Section title="Change-dimension impact summary" flush>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Dimension</th><th>Change records</th><th>Directly impacted</th><th>Indirectly impacted</th><th>Not impacted</th><th>Requires review</th></tr></thead>
        <tbody>{d.selectedDims.map((dim) => {
          const v = d.selectedStakeholders.map((st) => d.impacts.get(`${st.id}|${dim.id}`)!);
          return (
            <tr key={dim.id}><td className="strong small">{dim.label}</td><td className="num">{s.changes.filter((c) => c.dimensionId === dim.id).length}</td>
              <td className="num">{v.filter((x) => x.classification === 'impacted' && x.directness === 'direct').length}</td>
              <td className="num">{v.filter((x) => x.classification === 'impacted' && x.directness !== 'direct').length}</td>
              <td className="num">{v.filter((x) => x.classification === 'not_impacted').length}</td>
              <td className="num">{v.filter((x) => x.classification === 'review').length}</td></tr>
          );
        })}</tbody>
      </table></div>
    </Section>
  );
}

function HighImpact() {
  const { s, d } = useD();
  const inspect = useApp((x) => x.inspect);
  const w = s.engagement.settings.weights, th = s.engagement.settings.thresholds;
  const rows = d.selectedStakeholders.flatMap((st) => d.selectedDims.map((dim) => ({ st, dim, e: d.impacts.get(`${st.id}|${dim.id}`)! })))
    .map((x) => ({ ...x, score: severityScore(x.e.severity, w) })).filter((x) => x.e.classification === 'impacted' && severityBand(x.score, th) === 'High')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return (
    <Section title="High-impact stakeholder view" hint={`Cells with weighted severity ≥ ${th.high}`} flush>
      {!rows.length ? <Empty title="No cells scored High">Severity is scored only when change records have documented As-Is and To-Be states.</Empty> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Stakeholder</th><th>Dimension</th><th>Score</th><th>Resp.</th><th>Rel.</th><th>Tools</th><th>Behav.</th><th>Source</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={`${x.st.id}${x.dim.id}`} className="clickable" onClick={() => inspect({ kind: 'impact', stakeholderId: x.st.id, dimensionId: x.dim.id })}>
              <td className="small strong">{x.st.roleName}</td><td className="small">{x.dim.short}</td><td className="num strong">{x.score?.toFixed(2)}</td>
              <td className="num">{x.e.severity?.responsibilities}</td><td className="num">{x.e.severity?.relationships}</td><td className="num">{x.e.severity?.tools}</td><td className="num">{x.e.severity?.behaviours}</td>
              <td>{x.e.source === 'consultant' ? <Badge tone="ok">Consultant</Badge> : <Badge tone="info">Rule</Badge>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Section>
  );
}

function ByFunction() {
  const { s, d } = useD();
  const fns = Array.from(new Set(d.selectedStakeholders.map((x) => x.functionName || 'Cross-functional')));
  const geos = Array.from(new Set(d.selectedStakeholders.map((x) => x.geography || 'Not specified')));
  const block = (label: string, keys: string[], pick: (st: (typeof d.selectedStakeholders)[number]) => string) => (
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>{label}</th><th>Stakeholders</th>{d.selectedDims.map((x) => <th key={x.id} style={{ textAlign: 'center' }}>{x.short}</th>)}</tr></thead>
      <tbody>{keys.map((k) => {
        const sts = d.selectedStakeholders.filter((st) => pick(st) === k);
        return <tr key={k}><td className="small strong">{k}</td><td className="num">{sts.length}</td>{d.selectedDims.map((dim) => <td key={dim.id} className="num" style={{ textAlign: 'center' }}>{sts.filter((st) => d.impacts.get(`${st.id}|${dim.id}`)?.classification === 'impacted').length}</td>)}</tr>;
      })}</tbody>
    </table></div>
  );
  return (
    <div className="grid g2">
      <Section title="Impacted stakeholders by function" flush>{block('Function', fns, (st) => st.functionName || 'Cross-functional')}</Section>
      <Section title="Impacted stakeholders by geography" flush>{block('Geography', geos, (st) => st.geography || 'Not specified')}</Section>
      <p className="small muted">Counts show stakeholders assessed as impacted in each dimension. Engagement: {s.engagement.name}.</p>
    </div>
  );
}

function ByWave() {
  const { s, d } = useD();
  return (
    <Section title="Impact by transition wave" hint="A stakeholder–dimension impact is attributed to a wave through the change records driving it." flush>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Wave</th><th>Go-live</th><th>Change records</th><th>Impacted stakeholder cells</th><th>Stakeholders impacted</th></tr></thead>
        <tbody>{s.waves.map((wv) => {
          const chg = s.changes.filter((c) => c.waveIds.includes(wv.id)).map((c) => c.id);
          const cells = [...d.impacts.entries()].filter(([, e]) => e.classification === 'impacted' && e.changeIds.some((id) => chg.includes(id)));
          return <tr key={wv.id}><td className="strong small">{waveName(s, wv.id)}</td><td className="small num">{wv.goLiveDate ?? '—'}</td><td className="num">{chg.length}</td><td className="num">{cells.length}</td><td className="num">{new Set(cells.map(([k]) => k.split('|')[0])).size}</td></tr>;
        })}</tbody>
      </table></div>
    </Section>
  );
}

function Completion() {
  const { s, d } = useD();
  const vals = [...d.impacts.values()];
  const rows = [
    { label: 'Consultant decisions (overrides)', n: vals.filter((x) => x.source === 'consultant').length, tone: 'ok' as const },
    { label: 'Rule recommendations accepted', n: vals.filter((x) => x.source === 'rule' && x.status === 'confirmed').length, tone: 'ok' as const },
    { label: 'Rule proposed, not yet reviewed', n: vals.filter((x) => x.source === 'rule' && x.status === 'proposed' && x.classification !== 'review').length, tone: 'info' as const },
    { label: 'Requires review (insufficient information)', n: vals.filter((x) => x.classification === 'review').length, tone: 'warn' as const },
    { label: 'Marked needs review', n: vals.filter((x) => x.status === 'needs_review' && x.classification !== 'review').length, tone: 'warn' as const },
    { label: 'Overrides conflicting with current rules', n: vals.filter((x) => x.conflict).length, tone: 'crit' as const },
  ];
  const done = rows[0].n + rows[1].n;
  return (
    <Section title="Assessment completion tracker" hint={`${done} of ${vals.length} cells confirmed (${vals.length ? Math.round((done / vals.length) * 100) : 0}%) · updated ${nowIso().slice(11, 16)}`}>
      <div className="stack">{rows.map((r) => <div key={r.label} className="row"><Badge tone={r.tone}>{r.n}</Badge><span>{r.label}</span></div>)}</div>
      <div className="divider" />
      <div className="row small muted"><AlertTriangle size={14} /> An unassessed cell is never treated as “Not impacted”. Engagement: {s.engagement.name}.</div>
    </Section>
  );
}

export { setImpactDecision };
